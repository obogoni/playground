/**
 * WF1 spike ORCHESTRATOR — throwaway, owner-run: `tsx scripts/wf1-spike/run.ts`.
 *
 * This is the T7 empirical harness (WF1-D1): it drives a REAL headless `claude`
 * against a REAL logged-in subscription and compares the two structured-output
 * mechanisms end-to-end. It is NOT the production `agent-step-runner` (WF3). All
 * testable logic lives in the pure seams (scrubAuthEnv, buildAgentArgv,
 * parseEnvelope, emit-result-schema) and the MCP server; this file is only the
 * disposable spawn/print glue, so it carries no unit tests (repo convention for
 * external-CLI boundaries, AD-004).
 *
 * EMPIRICAL UNKNOWNS this run pins (record each in findings.md, T7):
 *   - The spawn incantation on Windows. FINDING (run 1): the installed `claude`
 *     is a native .exe (C:\...\.local\bin\claude.exe), NOT a .cmd shim — so
 *     shell:true is WRONG: cmd re-parses the inline --json-schema/--mcp-config
 *     JSON and corrupts it ("Unterminated string"). Fix: resolve the exe and
 *     spawn with shell:false, passing the argv array verbatim, with stdin closed
 *     (headless otherwise blocks waiting for stdin: "no stdin data received").
 *   - Whether the documented flag leads in build-agent-argv actually work.
 *   - The envelope field carrying session_id, and where Arm N's payload lands
 *     (structured_output).
 *   - Whether `dontAsk` + allowedTools stops a would-prompt action from hanging.
 */

import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { buildAgentArgv } from './build-agent-argv'
import { createMcpResultServer, type McpResultServer } from './mcp-server'
import { parseEnvelope } from './parse-envelope'
import { scrubAuthEnv } from './scrub-auth-env'
import { validate, type JsonSchema } from './emit-result-schema'

const STEP_TIMEOUT_MS = 120_000
const EMIT_GRACE_MS = 5_000

/** The step's declared structured-output contract, shared by both arms. */
const EXPECT: JsonSchema = {
  type: 'object',
  properties: { answer: { type: 'number' }, reasoning: { type: 'string' } },
  required: ['answer']
}
const PROMPT = 'What is 6 times 7? Think briefly, then return the answer.'
// The follow-up references something only the first turn established, so a real
// --resume (vs a fresh conversation) is observable in the second answer (WF1-06).
const FOLLOWUP = 'Now add 100 to the previous answer and return the new total.'

interface SpawnResult {
  stdout: string
  stderr: string
  code: number | null
}

// Resolve the real claude executable once. On Windows a bare `spawn('claude')`
// with shell:false won't PATH-resolve, so we look up the .exe and spawn it
// directly — this keeps the argv array verbatim (no shell re-parse to corrupt
// the inline --json-schema / --mcp-config JSON).
function resolveClaude(): string {
  try {
    const out = execFileSync('where', ['claude'], { encoding: 'utf8' })
    const first = out.split(/\r?\n/).find((line) => line.trim().length > 0)
    return first ? first.trim() : 'claude'
  } catch {
    return 'claude'
  }
}
const CLAUDE = resolveClaude()

function spawnClaude(argv: string[], cwd: string): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // shell:false + argv array → flags pass verbatim; stdin ignored so headless
    // does not block waiting for piped input.
    const child = spawn(CLAUDE, argv, {
      cwd,
      env: scrubAuthEnv(process.env),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`claude timed out after ${STEP_TIMEOUT_MS}ms\n--- stdout ---\n${stdout}`))
    }, STEP_TIMEOUT_MS)
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code })
    })
  })
}

/** Fail loudly (with captured stdout) if a child exits without emitting a payload. */
function withGrace<T>(pending: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), EMIT_GRACE_MS)
    pending.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function requireOk(res: SpawnResult, arm: string): void {
  if (res.code !== 0) {
    throw new Error(
      `${arm} exited ${res.code}\n--- stderr ---\n${res.stderr}\n--- stdout ---\n${res.stdout}`
    )
  }
}

/** Arm N — native --json-schema: the payload rides the envelope's structured_output. */
async function runNativeArm(cwd: string): Promise<void> {
  console.log('\n=== Arm N (native --json-schema) ===')
  const res = await spawnClaude(
    buildAgentArgv({ arm: 'native', prompt: PROMPT, expect: EXPECT }),
    cwd
  )
  requireOk(res, 'Arm N')
  const env = parseEnvelope(res.stdout)
  const checked = validate({ status: 'done', data: env.structuredOutput }, EXPECT)
  if (!checked.ok) throw new Error(`Arm N payload does not conform to expect: ${checked.error}`)
  console.log('session_id:', env.sessionId)
  console.log('payload:', JSON.stringify(checked.value.data))

  console.log('--- resume ---')
  const resumeRes = await spawnClaude(
    buildAgentArgv({
      arm: 'native',
      prompt: FOLLOWUP,
      expect: EXPECT,
      resumeSessionId: env.sessionId
    }),
    cwd
  )
  requireOk(resumeRes, 'Arm N resume')
  const resumeEnv = parseEnvelope(resumeRes.stdout)
  const resumeChecked = validate({ status: 'done', data: resumeEnv.structuredOutput }, EXPECT)
  if (!resumeChecked.ok) throw new Error(`Arm N resume payload invalid: ${resumeChecked.error}`)
  console.log(
    'resumed payload:',
    JSON.stringify(resumeChecked.value.data),
    '(expect 142 if context carried)'
  )
}

/** Arm M — MCP: the agent is forced to call the self-hosted emit_result tool. */
async function runMcpArm(server: McpResultServer, url: string, cwd: string): Promise<void> {
  console.log('\n=== Arm M (self-hosted MCP emit_result) ===')
  const token = randomUUID()
  const pending = server.register(token, EXPECT)
  const res = await spawnClaude(
    buildAgentArgv({ arm: 'mcp', prompt: PROMPT, expect: EXPECT, mcpUrl: url, token }),
    cwd
  )
  requireOk(res, 'Arm M')
  const payload = await withGrace(
    pending,
    `Arm M: child exited without an emit_result call\n${res.stdout}`
  )
  const env = parseEnvelope(res.stdout)
  console.log('session_id:', env.sessionId)
  console.log('emit_result payload:', JSON.stringify(payload.data))

  console.log('--- resume ---')
  const resumeToken = randomUUID()
  const resumePending = server.register(resumeToken, EXPECT)
  const resumeRes = await spawnClaude(
    buildAgentArgv({
      arm: 'mcp',
      prompt: FOLLOWUP,
      expect: EXPECT,
      mcpUrl: url,
      token: resumeToken,
      resumeSessionId: env.sessionId
    }),
    cwd
  )
  requireOk(resumeRes, 'Arm M resume')
  const resumePayload = await withGrace(
    resumePending,
    `Arm M resume: child exited without an emit_result call\n${resumeRes.stdout}`
  )
  console.log(
    'resumed payload:',
    JSON.stringify(resumePayload.data),
    '(expect 142 if context carried)'
  )
}

function printFindingsChecklist(): void {
  console.log('\n=== FINDINGS CHECKLIST (record in findings.md — T7) ===')
  const leads = [
    'print flag (--print / -p) confirmed?',
    'JSON envelope field for session_id confirmed?',
    'Arm N: --json-schema → structured_output confirmed?',
    'Arm M: HTTP MCP (type:http + Bearer) reached emit_result?',
    'inline --mcp-config JSON survived the shell, or moved to a file?',
    '--permission-mode dontAsk stopped a would-prompt action from hanging?',
    'mcp__result__emit_result allow-name accepted in headless?',
    '--resume continued the same conversation (second answer used prior context)?',
    '--bare refuted as subscription-defeating?',
    'RECOMMENDATION: Arm N vs Arm M for WF3 (with observed trade-offs)?'
  ]
  for (const lead of leads) console.log(' - [ ]', lead)
}

async function main(): Promise<void> {
  const cwd = process.cwd()
  const server = createMcpResultServer()
  const { url } = await server.start()
  console.log('MCP result server:', url)
  try {
    await runNativeArm(cwd)
    await runMcpArm(server, url, cwd)
    printFindingsChecklist()
  } finally {
    await server.stop()
  }
}

main().catch((err: unknown) => {
  console.error('\nSPIKE FAILED:\n', err)
  process.exitCode = 1
})
