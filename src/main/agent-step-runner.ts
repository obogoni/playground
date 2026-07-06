/**
 * The core of WF3 (NET-NEW logic): drives ONE headless `claude` agent step
 * end-to-end and returns a validated `{ status, data?, question?, sessionId }`.
 *
 * Flow (design §6):
 *   1. `createValidator(expect)` — throws BEFORE any spawn on an invalid `expect`
 *      (WF3-24).
 *   2. register a per-step token on the shared MCP server → a pending promise that
 *      resolves when the agent makes a valid `emit_result` call.
 *   3. `buildAgentCommand` (scrubbed env, MCP config, permission preset) → spawn the
 *      resolved `claude` (`shell:false`, stdin closed — enforced by the spawn seam).
 *      An unresolved binary fails "agent binary not found" WITHOUT spawning (WF3-23).
 *   4. wire the cancellation signal: on abort → `child.kill()` + reject
 *      `CancellationError` (WF3-20).
 *   5. await close, capture `{stdout, stderr, code}`; `parseEnvelope(stdout)` →
 *      `sessionId` (WF3-16).
 *   6. a valid payload captured → return it as-is (`blocked` included, WF3-17).
 *   7. otherwise ONE corrective `--resume` retry (WF3-04); still no valid emit →
 *      THROW `AgentStepError` carrying `{stdout, stderr, code}` (WF3-05).
 *   8. `finally` → revoke every token issued so a late/duplicate call cannot resolve.
 *
 * DI'd (server/spawn/resolveClaude/genToken injected) so every branch is unit-tested
 * with hand-rolled fakes — no real spawn, no real network — mirroring `SessionManager`.
 * The MCP server runs in the same process, so a valid `emit_result` resolves the
 * pending promise causally before the child exits; no grace window is needed.
 */

import { buildAgentCommand, type Permission } from './agent-command-builder'
import { createValidator, type EmitResultPayload, type JsonSchema } from './emit-result-schema'
import type { McpResultServer } from './mcp-result-server'
import { parseEnvelope } from './parse-envelope'
import { CancellationError } from './workflow-ctx'

export interface AgentStepOptions {
  prompt: string
  expect: JsonSchema
  cwd: string
  permission?: Permission
}

export interface AgentResult {
  status: 'done' | 'blocked'
  data?: unknown
  question?: string
  sessionId: string
}

/** A thin seam over `child_process.spawn` — a fake in tests, the real spawn in `index.ts`. */
export interface AgentChild {
  onStdout(listener: (chunk: string) => void): void
  onStderr(listener: (chunk: string) => void): void
  onClose(listener: (code: number | null) => void): void
  kill(): void
}

export type AgentSpawn = (
  bin: string,
  argv: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv }
) => AgentChild

export interface AgentStepRunnerDeps {
  server: McpResultServer
  spawn: AgentSpawn
  /** Resolve the `claude` binary path; throws if unresolved (→ "agent binary not found"). */
  resolveClaude: () => string
  /** Fresh per-step bearer token (`randomUUID` in production). */
  genToken: () => string
}

/** Thrown when the step ends with no valid emit; carries the child's captured output. */
export class AgentStepError extends Error {
  constructor(
    message: string,
    readonly detail: { stdout: string; stderr: string; code: number | null }
  ) {
    super(message)
    this.name = 'AgentStepError'
  }
}

const AGENT_BINARY_NOT_FOUND = 'agent binary not found'

function correctivePrompt(reason: string): string {
  return (
    `Your previous turn did not produce a valid result: ${reason}. ` +
    'Call the emit_result tool now with a payload that conforms to its schema — ' +
    'status "done" with the required data, or status "blocked" with a non-empty question.'
  )
}

interface AttemptResult {
  payload: EmitResultPayload | undefined
  stdout: string
  stderr: string
  code: number | null
}

export class AgentStepRunner {
  #started: Promise<{ url: string; port: number }> | undefined

  constructor(private readonly deps: AgentStepRunnerDeps) {}

  /** Lazily start (and memoize) the shared server on first use. */
  #ensureStarted(): Promise<{ url: string; port: number }> {
    return (this.#started ??= this.deps.server.start())
  }

  async run(opts: AgentStepOptions, signal?: AbortSignal): Promise<AgentResult> {
    // 1. Invalid `expect` fails BEFORE any spawn or registration (WF3-24). The
    // per-payload check is enforced server-side; compiling here fails fast on a bad
    // schema (createValidator throws on an uncompilable `expect`).
    createValidator(opts.expect)

    const { url } = await this.#ensureStarted()
    const permission = opts.permission
    const tokens: string[] = []

    try {
      // 5. First pass.
      const first = await this.#attempt({
        prompt: opts.prompt,
        expect: opts.expect,
        url,
        permission,
        cwd: opts.cwd,
        tokens,
        signal
      })
      const session1 = parseEnvelope(first.stdout).sessionId

      // 6. A valid emit → return as-is (`blocked` included, WF3-17).
      if (first.payload) return { ...first.payload, sessionId: session1 }

      // 7. No valid emit → ONE corrective --resume retry (WF3-04/05).
      const retry = await this.#attempt({
        prompt: correctivePrompt('no valid emit_result call was made'),
        expect: opts.expect,
        url,
        permission,
        cwd: opts.cwd,
        resumeSessionId: session1,
        tokens,
        signal
      })
      const session2 = parseEnvelope(retry.stdout).sessionId
      if (retry.payload) return { ...retry.payload, sessionId: session2 }

      // Still no valid emit after the retry → fail with captured output (WF3-05).
      throw new AgentStepError('agent did not emit a valid result after one corrective retry', {
        stdout: retry.stdout,
        stderr: retry.stderr,
        code: retry.code
      })
    } finally {
      // 8. Revoke every issued token so a late/duplicate call cannot resolve a step.
      for (const token of tokens) this.deps.server.revoke(token)
    }
  }

  /** Register a token, spawn one agent turn, and capture its emit + output. */
  async #attempt(args: {
    prompt: string
    expect: JsonSchema
    url: string
    permission?: Permission
    cwd: string
    resumeSessionId?: string
    tokens: string[]
    signal?: AbortSignal
  }): Promise<AttemptResult> {
    const token = this.deps.genToken()
    args.tokens.push(token)

    // The token's `expect` shapes the emit_result tool schema; the pending promise
    // resolves when the agent makes a valid emit_result call for this token. Attach
    // handlers immediately so a `finally` revoke (e.g. after resolveClaude fails)
    // never surfaces as an unhandled rejection.
    let captured: EmitResultPayload | undefined
    const pending = this.deps.server.register(token, args.expect)
    pending.then(
      (p) => {
        captured = p
      },
      () => {}
    )

    // 3. Resolve the binary BEFORE spawning; an unresolved binary never spawns (WF3-23).
    let bin: string
    try {
      bin = this.deps.resolveClaude()
    } catch {
      throw new Error(AGENT_BINARY_NOT_FOUND)
    }

    const { argv, env } = buildAgentCommand({
      prompt: args.prompt,
      mcpUrl: args.url,
      token,
      permission: args.permission,
      parentEnv: process.env,
      resumeSessionId: args.resumeSessionId
    })

    const child = this.deps.spawn(bin, argv, { cwd: args.cwd, env })

    let stdout = ''
    let stderr = ''
    child.onStdout((c) => (stdout += c))
    child.onStderr((c) => (stderr += c))
    const closed = new Promise<number | null>((resolve) => child.onClose(resolve))

    // 4. Cancellation: abort → kill the child + reject CancellationError (WF3-20).
    let onAbort: (() => void) | undefined
    const aborted = new Promise<never>((_, reject) => {
      if (!args.signal) return
      if (args.signal.aborted) {
        child.kill()
        reject(new CancellationError())
        return
      }
      onAbort = (): void => {
        child.kill()
        reject(new CancellationError())
      }
      args.signal.addEventListener('abort', onAbort, { once: true })
    })

    try {
      const code = await Promise.race([closed, aborted])
      // The in-process server resolves `pending` before the child exits; flush the
      // microtask that set `captured`.
      await Promise.resolve()
      return { payload: captured, stdout, stderr, code }
    } finally {
      if (args.signal && onAbort) args.signal.removeEventListener('abort', onAbort)
    }
  }
}
