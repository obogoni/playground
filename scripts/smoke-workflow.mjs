/* CDP smoke for the WF2 workflows engine — the end-to-end gate (WF2-20).
 * Drives `workflows:run` over CDP against a running dev app and asserts the run
 * reaches `done`, streamed `workflow:step`/`workflow:log` events arrive, and a
 * per-run JSON log is written under userData/workflow-runs/.
 *
 * It seeds a throwaway fixture `~/.playground/workflows/smoke-gate/workflow.ts`
 * whose `run(ctx)` exercises the real CtxDeps: `ctx.worktree.create` →
 * `ctx.git.fetch` → `ctx.notify({ toast })`. By default it also prepares a
 * scratch git repo (a bare origin + a clone with an initial `main`) so the
 * fetch has a real remote; pass SMOKE_REPO=<path> to run against an existing
 * repo whose default branch is `main`.
 *
 * Manual, owner-run gate — not CI (needs a live desktop session + a native
 * toast surface).
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-workflow.mjs                    (in another)
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'

const PORT = Number(process.env.SMOKE_PORT) || 9222

/* --- Fixture + scratch-repo seeding (node-side, before we touch the app) --- */

/** Prepare a scratch repo with a bare origin so `git fetch` has a real remote. */
function prepareScratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'wf-smoke-'))
  const origin = join(root, 'origin.git')
  const repo = join(root, 'repo')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin], { stdio: 'ignore' })
  execFileSync('git', ['init', '-b', 'main', repo], { stdio: 'ignore' })
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' })
  g('config', 'user.email', 'smoke@example.com')
  g('config', 'user.name', 'Smoke Gate')
  g('remote', 'add', 'origin', origin)
  writeFileSync(join(repo, 'README.md'), 'smoke gate scratch repo\n')
  g('add', '.')
  g('commit', '-m', 'init')
  g('push', '-u', 'origin', 'main')
  return repo
}

/** Write the throwaway workflow fixture into the real discovery root. */
function seedFixture() {
  const dir = join(homedir(), '.playground', 'workflows', 'smoke-gate')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'workflow.ts'),
    `export const meta = {
  name: 'Smoke Gate',
  inputs: [{ key: 'repoPath', label: 'Repo', required: true }]
}

export async function run(ctx) {
  const repoPath = ctx.input.repoPath
  await ctx.log('smoke gate starting for ' + repoPath)
  const result = await ctx.worktree.create(
    repoPath,
    'smoke/gate',
    'main',
    undefined,
    false,
    'recreate'
  )
  const cwd = result && result.ok && result.path ? result.path : repoPath
  await ctx.git.fetch({ cwd })
  await ctx.notify('smoke gate done', { toast: true })
}
`
  )
}

const repoPath = process.env.SMOKE_REPO || prepareScratchRepo()
seedFixture()

/* --- CDP plumbing (mirrors scripts/smoke-create.mjs) --- */

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
     if (!window.__wfSmoke) {
       const s = { steps: [], logs: [], statuses: [] }
       window.__wfSmoke = s
       window.api.on('workflow:step', (p) => s.steps.push(p))
       window.api.on('workflow:log', (p) => s.logs.push(p))
       window.api.on('workflow:status', (p) => s.statuses.push(p))
     }
     return true
   })()`
)

// `workflows:run` resolves only after the run finishes (done/failed/cancelled),
// returning its runId; we still poll the collectors for late event delivery.
const started = await evaluate(
  ws,
  `window.api.invoke('workflows:run', { id: 'smoke-gate', input: { repoPath: ${JSON.stringify(
    repoPath
  )} } })`
)
const runId = started?.runId ?? null
check('workflows:run returns a runId', Boolean(runId), JSON.stringify(started))

let state = { steps: 0, logs: 0, statuses: [] }
for (let i = 0; i < 30; i++) {
  state = await evaluate(
    ws,
    `(() => {
       const s = window.__wfSmoke
       return { steps: s.steps.length, logs: s.logs.length, statuses: s.statuses.map((x) => x.status) }
     })()`
  )
  if (state.statuses.includes('done')) break
  await sleep(1000)
}

check(
  'run reached status done',
  state.statuses.includes('done'),
  `statuses: ${JSON.stringify(state.statuses)}`
)
check('at least one workflow:step streamed', state.steps >= 1, `${state.steps} steps`)
check('at least one workflow:log streamed', state.logs >= 1, `${state.logs} logs`)

const runLog = runId
  ? join(process.env.APPDATA ?? '', 'playground', 'workflow-runs', `${runId}.json`)
  : ''
check(
  'run-log JSON persisted under userData/workflow-runs/',
  Boolean(runId) && existsSync(runLog),
  runLog
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
