/* CDP smoke for the delete-worktree feature (DLWT-01..04). Assumes the app
 * is running with --remote-debugging-port=9222 and a seeded workspace named
 * wtm-smoke-* containing repo `api` (branch main) plus a clean linked
 * worktree `api-feature-42` (branch feature/42) and a dirty linked worktree
 * `api-chore-wip` (branch chore/wip, one uncommitted file).
 * Run: node scripts/smoke-remove.mjs
 */

import { existsSync } from 'fs'

const PORT = 9222

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

/* Click the sidebar row whose branch text matches, then report the danger UI. */
const selectExpr = (branch) => `(async () => {
  const row = [...document.querySelectorAll('.sidebar-worktree')].find((r) =>
    r.querySelector('.sidebar-worktree-branch')?.textContent === ${JSON.stringify(branch)}
  )
  if (!row) return { found: false }
  row.click()
  await new Promise((r) => setTimeout(r, 400))
  const btn = document.querySelector('.detail-remove-btn')
  return {
    found: true,
    armed: btn?.classList.contains('armed') ?? null,
    disabled: btn?.disabled ?? null,
    note: document.querySelector('.detail-danger-note')?.textContent ?? null
  }
})()`

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

const tree = await evaluate(ws, `window.api.invoke('tree:get')`)
const wsNode = tree.find((w) => w.displayName.startsWith('wtm-smoke-'))
const api = wsNode?.repos.find((r) => r.name === 'api')
const cleanWt = api?.worktrees.find((w) => w.branch === 'feature/42')
check('seeded workspace with repo api and worktrees present', Boolean(api && cleanWt))

// Refresh so the rendered tree matches disk before driving the UI.
await evaluate(
  ws,
  `(async () => {
     document.querySelector('.topbar-icon-btn').click()
     await new Promise((r) => setTimeout(r, 1200))
     return true
   })()`
)

// DLWT-02: primary checkout → disabled look + primary note
const primary = await evaluate(ws, selectExpr('main'))
check(
  'primary checkout shows disabled remove + reason',
  primary.disabled === true && /primary checkout/.test(primary.note ?? ''),
  JSON.stringify(primary)
)

// DLWT-02: dirty worktree → disabled look + change-count note
const dirty = await evaluate(ws, selectExpr('chore/wip'))
check(
  'dirty worktree shows disabled remove + change count',
  dirty.disabled === true && /uncommitted change.*commit or stash/.test(dirty.note ?? ''),
  JSON.stringify(dirty)
)

// DLWT-02: clean non-primary → armed red button, no note
const clean = await evaluate(ws, selectExpr('feature/42'))
check(
  'clean sibling shows armed remove button without note',
  clean.armed === true && clean.disabled === false && clean.note === null,
  JSON.stringify(clean)
)

// DLWT-01 guard via IPC: dirty removal refused in main, folder intact
const dirtyWt = api.worktrees.find((w) => w.branch === 'chore/wip')
const refusal = await evaluate(
  ws,
  `window.api.invoke('worktrees:remove', { repoPath: ${JSON.stringify(api.path)}, worktreePath: ${JSON.stringify(dirtyWt.path)} })`
)
check(
  'IPC refuses dirty removal (DLWT-01)',
  refusal.ok === false && /uncommitted/.test(refusal.error ?? ''),
  JSON.stringify(refusal)
)
check('dirty worktree folder intact after refusal', existsSync(dirtyWt.path))

// DLWT-01 guard via IPC: primary removal refused
const primaryRefusal = await evaluate(
  ws,
  `window.api.invoke('worktrees:remove', { repoPath: ${JSON.stringify(api.path)}, worktreePath: ${JSON.stringify(api.path)} })`
)
check(
  'IPC refuses primary-checkout removal (DLWT-01)',
  primaryRefusal.ok === false && /primary checkout/.test(primaryRefusal.error ?? ''),
  JSON.stringify(primaryRefusal)
)

// DLWT-01/03: clicking remove on the clean sibling deletes it, reselects primary
const removed = await evaluate(
  ws,
  `(async () => {
     document.querySelector('.detail-remove-btn').click()
     await new Promise((r) => setTimeout(r, 2000))
     return {
       rowGone: ![...document.querySelectorAll('.sidebar-worktree-branch')]
         .some((b) => b.textContent === 'feature/42'),
       selectedBranch: document.querySelector(
         '.sidebar-worktree.selected .sidebar-worktree-branch'
       )?.textContent ?? null,
       toast: document.querySelector('.toast')?.textContent ?? null
     }
   })()`
)
check(
  'remove deletes the row and reselects primary (DLWT-03)',
  removed.rowGone === true && removed.selectedBranch === 'main',
  JSON.stringify(removed)
)
check(
  'success toast names the branch (DLWT-03)',
  /Removed feature\/42/.test(removed.toast ?? ''),
  JSON.stringify(removed.toast)
)
check('worktree folder gone from disk (DLWT-01)', !existsSync(cleanWt.path))

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
