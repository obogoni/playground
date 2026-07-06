/* CDP smoke for the WF3 structured agent step — the milestone gate (WF3-22).
 * Drives `workflows:run` for the `review-pr` example over CDP against a running dev
 * app and asserts the run reaches `done`, the agent's findings validate against
 * FINDINGS_SCHEMA, a non-empty `session_id` was captured on the persisted run, and the
 * `read` posture left the worktree unmutated.
 *
 * It seeds a scratch git repo with an uncommitted "PR diff" (the thing under review)
 * and copies the `scripts/fixtures/review-pr/workflow.ts` fixture into the real
 * discovery root `~/.playground/workflows/review-pr/`.
 *
 * OWNER-RUN gate, not CI: it needs a live desktop session AND a logged-in Claude
 * subscription (the agent step spawns a real headless `claude`). Modeled on
 * `scripts/smoke-workflow.mjs`.
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-agent-workflow.mjs              (in another)
 */

import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'fs'
import { homedir, tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import Ajv from 'ajv'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const HERE = dirname(fileURLToPath(import.meta.url))

/* The findings contract — a MIRROR of scripts/fixtures/review-pr/workflow.ts's
 * FINDINGS_SCHEMA (the fixture is bundled into the app, so the gate re-declares it to
 * re-validate the agent's returned data with the same ajv the app uses). */
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { enum: ['info', 'warn', 'error'] },
          summary: { type: 'string' }
        },
        required: ['file', 'severity', 'summary']
      }
    }
  },
  required: ['findings']
}

/* --- Fixture + scratch-repo seeding (node-side, before we touch the app) --- */

/** Prepare a git repo with an uncommitted diff so `changedFiles` has something to review. */
function prepareWorktree() {
  const root = mkdtempSync(join(tmpdir(), 'wf-agent-smoke-'))
  const repo = join(root, 'repo')
  execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' })
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' })
  g('config', 'user.email', 'smoke@example.com')
  g('config', 'user.name', 'Agent Smoke')
  writeFileSync(join(repo, 'sum.js'), 'export function sum(a, b) {\n  return a + b\n}\n')
  g('add', '.')
  g('commit', '-m', 'init')
  // The "PR diff" under review: an uncommitted change that flips + to - (a real bug).
  writeFileSync(
    join(repo, 'sum.js'),
    'export function sum(a, b) {\n  // TODO: validate inputs\n  return a - b\n}\n'
  )
  return repo
}

/** Copy the review-pr fixture into the real discovery root. */
function seedFixture() {
  const dir = join(homedir(), '.playground', 'workflows', 'review-pr')
  mkdirSync(dir, { recursive: true })
  copyFileSync(join(HERE, 'fixtures', 'review-pr', 'workflow.ts'), join(dir, 'workflow.ts'))
}

/** A deterministic content hash of every file under `dir` (excluding .git) → detect mutation. */
function fileManifest(dir) {
  const entries = []
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      if (name === '.git') continue
      const abs = join(d, name)
      const relPath = rel ? `${rel}/${name}` : name
      if (statSync(abs).isDirectory()) walk(abs, relPath)
      else
        entries.push(`${relPath}:${createHash('sha256').update(readFileSync(abs)).digest('hex')}`)
    }
  }
  walk(dir, '')
  return entries.join('\n')
}

const worktreePath = process.env.SMOKE_WORKTREE || prepareWorktree()
seedFixture()
const manifestBefore = fileManifest(worktreePath)

/* --- CDP plumbing (mirrors scripts/smoke-workflow.mjs) --- */

async function pageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('No CDP page target after 30s')
}

let nextId = 1
function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)))
      const r = msg.result.result
      if (r.subtype === 'error') return reject(new Error(r.description))
      resolve(r.value)
    }
    ws.addEventListener('message', onMessage)
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true }
      })
    )
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/* --- Drive the run --- */

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

// Subscribe once; collectors live on window so they survive across evaluate calls.
await evaluate(
  ws,
  `(() => {
     if (!window.__wfAgentSmoke) {
       const s = { steps: [], logs: [], statuses: [] }
       window.__wfAgentSmoke = s
       window.api.on('workflow:step', (p) => s.steps.push(p))
       window.api.on('workflow:log', (p) => s.logs.push(p))
       window.api.on('workflow:status', (p) => s.statuses.push(p))
     }
     return true
   })()`
)

// `workflows:run` resolves only after the run finishes (done/failed/cancelled),
// returning its runId; agent steps can take minutes, so poll generously below.
const started = await evaluate(
  ws,
  `window.api.invoke('workflows:run', { id: 'review-pr', input: { worktreePath: ${JSON.stringify(
    worktreePath
  )} } })`
)
const runId = started?.runId ?? null
check('workflows:run returns a runId', Boolean(runId), JSON.stringify(started))

let state = { steps: 0, logs: 0, statuses: [] }
for (let i = 0; i < 180; i++) {
  state = await evaluate(
    ws,
    `(() => {
       const s = window.__wfAgentSmoke
       return { steps: s.steps.length, logs: s.logs.length, statuses: s.statuses.map((x) => x.status) }
     })()`
  )
  if (state.statuses.some((st) => st === 'done' || st === 'failed' || st === 'cancelled')) break
  await sleep(1000)
}

check(
  'run reached status done',
  state.statuses.includes('done'),
  `statuses: ${JSON.stringify(state.statuses)}`
)

ws.close()

/* --- Assert against the persisted run record --- */

const runLog = runId
  ? join(process.env.APPDATA ?? '', 'playground', 'workflow-runs', `${runId}.json`)
  : ''
const runPersisted = Boolean(runId) && existsSync(runLog)
check('run-log JSON persisted under userData/workflow-runs/', runPersisted, runLog)

let run = null
if (runPersisted) {
  try {
    run = JSON.parse(readFileSync(runLog, 'utf8'))
  } catch (err) {
    check('run-log JSON parses', false, String(err))
  }
}
const events = run?.events ?? []

// session_id: the agent step records a `step-logged` event carrying a non-empty sessionId.
const sessionId = events.find(
  (e) => typeof e.sessionId === 'string' && e.sessionId.length > 0
)?.sessionId
check('a non-empty session_id was captured on the run', Boolean(sessionId), sessionId ?? '(none)')

// Findings: the fixture logs `review-pr findings: <json>`; parse and re-validate the data.
const PREFIX = 'review-pr findings: '
const findingsMsg = events
  .map((e) => e.message)
  .find((m) => typeof m === 'string' && m.startsWith(PREFIX))
let findings = null
if (findingsMsg) {
  try {
    findings = JSON.parse(findingsMsg.slice(PREFIX.length))
  } catch (err) {
    check('findings log line is valid JSON', false, String(err))
  }
}
const ajv = new Ajv({ allErrors: true })
const validateFindings = ajv.compile(FINDINGS_SCHEMA)
const findingsValid = findings != null && validateFindings(findings)
check(
  'agent findings validate against FINDINGS_SCHEMA',
  Boolean(findingsValid),
  findingsValid ? `${findings.findings.length} finding(s)` : JSON.stringify(validateFindings.errors)
)

// read posture: the worktree must be byte-for-byte unchanged after the review (WF3-11).
const manifestAfter = fileManifest(worktreePath)
check(
  'read posture left the worktree unmutated',
  manifestAfter === manifestBefore,
  manifestAfter === manifestBefore ? '' : 'worktree files changed during review'
)

const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
