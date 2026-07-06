/* CDP smoke for the WF4 blocker + resume loop — the milestone gate (WF4-17).
 * Drives `workflows:run` for the `implement-ticket` example over CDP against a running dev
 * app and asserts the human-in-the-loop pause works end-to-end: the run reaches `blocked`
 * with a `workflow:blocked` question, a `workflows:respond` guidance RESUMES the SAME
 * session, and the run then reaches `done` — with the persisted event log recording both a
 * `blocked` and a `resumed` transition and a non-empty `session_id`.
 *
 * Unlike the WF3 smoke, `workflows:run` is fired WITHOUT awaiting (it resolves only after
 * the run finishes, which cannot happen until we respond): the runId + question come from
 * the streamed `workflow:blocked` event, then we `workflows:respond`.
 *
 * It seeds a scratch git repo (the workflow cuts a worktree off it) and copies the
 * `scripts/fixtures/implement-ticket/workflow.ts` fixture into the real discovery root
 * `~/.playground/workflows/implement-ticket/`.
 *
 * OWNER-RUN gate, not CI: it needs a live desktop session AND a logged-in Claude
 * subscription (the agent step spawns a real headless `claude`). Modeled on
 * `scripts/smoke-agent-workflow.mjs`.
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-blocker-resume.mjs             (in another)
 */

import { execFileSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import Ajv from 'ajv'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const HERE = dirname(fileURLToPath(import.meta.url))
const BRANCH = 'feature/greeting'
const GUIDANCE =
  'Create a file named greeting.js at the worktree root exporting a function ' +
  '`greet(name)` that returns the string `Hello, ${name}!`. Use that exact greeting format.'

/* The result contract — a MIRROR of scripts/fixtures/implement-ticket/workflow.ts's
 * IMPLEMENT_SCHEMA (the fixture is bundled into the app, so the gate re-declares it to
 * re-validate the agent's returned data with the same ajv the app uses). */
const IMPLEMENT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary']
}

/* --- Fixture + scratch-repo seeding (node-side, before we touch the app) --- */

/** Prepare a committed git repo the workflow can cut a worktree off. */
function prepareRepo() {
  const root = mkdtempSync(join(tmpdir(), 'wf-blocker-smoke-'))
  const repo = join(root, 'repo')
  execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' })
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' })
  g('config', 'user.email', 'smoke@example.com')
  g('config', 'user.name', 'Blocker Smoke')
  writeFileSync(join(repo, 'README.md'), '# scratch repo for the implement-ticket gate\n')
  g('add', '.')
  g('commit', '-m', 'init')
  return repo
}

/** Copy the implement-ticket fixture into the real discovery root. */
function seedFixture() {
  const dir = join(homedir(), '.playground', 'workflows', 'implement-ticket')
  mkdirSync(dir, { recursive: true })
  copyFileSync(join(HERE, 'fixtures', 'implement-ticket', 'workflow.ts'), join(dir, 'workflow.ts'))
}

const repoPath = process.env.SMOKE_REPO || prepareRepo()
seedFixture()

/* --- CDP plumbing (mirrors scripts/smoke-agent-workflow.mjs) --- */

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
     if (!window.__wfBlockSmoke) {
       const s = { steps: [], logs: [], statuses: [], blocked: [] }
       window.__wfBlockSmoke = s
       window.api.on('workflow:step', (p) => s.steps.push(p))
       window.api.on('workflow:log', (p) => s.logs.push(p))
       window.api.on('workflow:status', (p) => s.statuses.push(p))
       window.api.on('workflow:blocked', (p) => s.blocked.push(p))
     }
     return true
   })()`
)

// Fire workflows:run WITHOUT awaiting — it resolves only after the run finishes, which
// cannot happen until we respond. Stash the promise; read its runId from the stream.
await evaluate(
  ws,
  `(() => {
     window.__wfRun = window.api.invoke('workflows:run', { id: 'implement-ticket', input: { repoPath: ${JSON.stringify(
       repoPath
     )}, branch: ${JSON.stringify(BRANCH)} } })
     window.__wfRun.then((r) => { window.__wfRunResult = r }, (e) => { window.__wfRunError = String(e) })
     return true
   })()`
)

// Poll for the blocked question (the agent may take a minute to decide to ask). Capture the
// runId from the status stream too, so it is available even if the run finishes WITHOUT
// blocking (every workflow:status/blocked payload carries the runId).
let blocked = null
let statuses = []
let runIdFromStream = null
for (let i = 0; i < 180; i++) {
  const s = await evaluate(
    ws,
    `(() => {
       const s = window.__wfBlockSmoke
       const runId = (s.statuses[0] && s.statuses[0].runId) || (s.blocked[0] && s.blocked[0].runId) || null
       return { blocked: s.blocked, statuses: s.statuses.map((x) => x.status), runId }
     })()`
  )
  statuses = s.statuses
  runIdFromStream = s.runId
  if (s.blocked.length > 0) {
    blocked = s.blocked[0]
    break
  }
  if (statuses.some((st) => st === 'done' || st === 'failed' || st === 'cancelled')) break
  await sleep(1000)
}

check(
  'run reached blocked with a non-empty question',
  Boolean(blocked && blocked.question && blocked.question.body),
  blocked
    ? JSON.stringify(blocked.question)
    : `never blocked; statuses: ${JSON.stringify(statuses)}`
)
check('blocked status was streamed', statuses.includes('blocked'), JSON.stringify(statuses))

const runId = blocked?.runId ?? runIdFromStream

// Respond with guidance that resolves every ambiguity → the engine resumes the session.
if (runId) {
  await evaluate(
    ws,
    `window.api.invoke('workflows:respond', { runId: ${JSON.stringify(
      runId
    )}, decision: { action: 'guidance', guidance: ${JSON.stringify(GUIDANCE)} } })`
  )
}

// Poll for the resumed run to reach done.
for (let i = 0; i < 240; i++) {
  statuses = await evaluate(ws, `(() => window.__wfBlockSmoke.statuses.map((x) => x.status))()`)
  if (statuses.some((st) => st === 'done' || st === 'failed' || st === 'cancelled')) break
  await sleep(1000)
}

// A pass requires the run to have BLOCKED first and then reached done — a run that went
// straight to done without ever pausing is a FAIL (the WF4 loop was never exercised).
check(
  'run blocked, then resumed and reached done after guidance',
  Boolean(blocked) && statuses.includes('done'),
  JSON.stringify(statuses)
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

// The pause + resume state machine ran: the log records BOTH transitions (WF4-06).
check(
  'run log records a blocked transition',
  events.some((e) => e.kind === 'blocked'),
  ''
)
check(
  'run log records a resumed transition (engine paused then resumed the same run)',
  events.some((e) => e.kind === 'resumed'),
  ''
)
check('final persisted status is done', run?.status === 'done', run?.status ?? '(none)')

// session_id: the resumed agent step records a non-empty sessionId (--resume reused it).
const sessionId = events.find(
  (e) => typeof e.sessionId === 'string' && e.sessionId.length > 0
)?.sessionId
check('a non-empty session_id was captured on the run', Boolean(sessionId), sessionId ?? '(none)')

// Result: the fixture logs `implement-ticket result: <json>`; parse and re-validate.
const PREFIX = 'implement-ticket result: '
const resultMsg = events
  .map((e) => e.message)
  .find((m) => typeof m === 'string' && m.startsWith(PREFIX))
let data = null
if (resultMsg) {
  try {
    data = JSON.parse(resultMsg.slice(PREFIX.length))
  } catch (err) {
    check('result log line is valid JSON', false, String(err))
  }
}
const ajv = new Ajv({ allErrors: true })
const validateResult = ajv.compile(IMPLEMENT_SCHEMA)
const resultValid = data != null && validateResult(data)
check(
  'agent result validates against IMPLEMENT_SCHEMA',
  Boolean(resultValid),
  resultValid ? data.summary : JSON.stringify(validateResult.errors ?? data)
)

const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
