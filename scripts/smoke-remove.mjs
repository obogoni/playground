/* CDP smoke for delete-worktree (DLWT-01..04) + force-remove-worktree
 * (FRWT-01..04) + worktree-removal-fault-tolerance (WRFT-06).
 * Assumes the app is running with --remote-debugging-port=9222
 * and a seeded workspace named wtm-smoke-* containing repo `api` (branch main)
 * plus a clean linked worktree `api-feature-42` (branch feature/42), a dirty
 * linked worktree `api-chore-wip` (branch chore/wip) and a clean linked
 * worktree `api-lock-me` (branch lock/me) holding an empty `sub/`. For the
 * fullest FRWT coverage, seed chore/wip with mixed dirt — a modified tracked
 * file, an added untracked file, and a deleted tracked file — so the confirm
 * dialog renders Modified/Added/Deleted rows; any non-empty dirt also passes.
 * Seed it with: node scripts/seed-smoke-remove.mjs   (run before launching the app)
 * Run: node scripts/smoke-remove.mjs
 *
 * MANUAL ONLY — never CI (TESTING.md): this drives a live Electron app over CDP
 * on a real desktop session, against real on-disk state that the run destroys.
 * Every removal here is one-shot; re-seed before each run.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'fs'
import { join } from 'node:path'

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

/* Git's porcelain paths and the path Node reports inside an fs error can differ
 * in separators and case, so compare them the way the main process does. */
const norm = (p) => p.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()

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

// FRWT-02: dirty worktree → ARMED red button + "will be discarded" note
// (was disabled-look with a "commit or stash" refusal in delete-worktree v1).
const dirty = await evaluate(ws, selectExpr('chore/wip'))
check(
  'dirty worktree shows ARMED remove + discard note (FRWT-02)',
  dirty.armed === true && dirty.disabled === false && /will be discarded/.test(dirty.note ?? ''),
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

// FRWT-01: worktrees:changes returns the live dirty files, each with a label.
const VALID = ['modified', 'added', 'deleted', 'renamed', 'untracked']
const dirtyChanges = await evaluate(
  ws,
  `window.api.invoke('worktrees:changes', { worktreePath: ${JSON.stringify(dirtyWt.path)} })`
)
check(
  'worktrees:changes returns the dirty files with labels (FRWT-01)',
  Array.isArray(dirtyChanges) &&
    dirtyChanges.length > 0 &&
    dirtyChanges.every((c) => typeof c.path === 'string' && VALID.includes(c.status)),
  JSON.stringify(dirtyChanges)
)

// FRWT-03: clicking Remove on the dirty worktree opens the confirm dialog and
// renders one row per changed file (status pill + path) + a "Discard & remove"
// danger button.
const dialog = await evaluate(
  ws,
  `(async () => {
     const row = [...document.querySelectorAll('.sidebar-worktree')].find((r) =>
       r.querySelector('.sidebar-worktree-branch')?.textContent === 'chore/wip')
     row?.click()
     await new Promise((r) => setTimeout(r, 400))
     document.querySelector('.detail-remove-btn').click()
     await new Promise((r) => setTimeout(r, 1000)) // worktrees:changes fetch
     const rows = [...document.querySelectorAll('.rwc-change-row')].map((el) => ({
       label: el.querySelector('.rwc-change-pill')?.textContent ?? null,
       path: el.querySelector('.rwc-change-path')?.textContent ?? null
     }))
     return { rows, confirmLabel: document.querySelector('.dialog-btn-danger')?.textContent ?? null }
   })()`
)
const LABELS = ['Modified', 'Added', 'Deleted', 'Renamed', 'Untracked']
check(
  'confirm dialog lists each changed file with a status label (FRWT-03)',
  dialog.rows.length === dirtyChanges.length &&
    dialog.rows.length > 0 &&
    dialog.rows.every((r) => r.path && LABELS.includes(r.label)),
  JSON.stringify(dialog.rows)
)
check(
  'confirm button reads "Discard & remove" for a dirty-only worktree (FRWT-03)',
  /Discard & remove/.test(dialog.confirmLabel ?? ''),
  JSON.stringify(dialog.confirmLabel)
)

// FRWT-03: confirming force-removes — row gone, branch in toast, folder deleted.
const forced = await evaluate(
  ws,
  `(async () => {
     document.querySelector('.dialog-btn-danger').click()
     await new Promise((r) => setTimeout(r, 2500))
     return {
       rowGone: ![...document.querySelectorAll('.sidebar-worktree-branch')]
         .some((b) => b.textContent === 'chore/wip'),
       toast: document.querySelector('.toast')?.textContent ?? null
     }
   })()`
)
check(
  'force-remove deletes the dirty row (FRWT-03)',
  forced.rowGone === true,
  JSON.stringify(forced)
)
check(
  'force-remove toast names the branch (FRWT-03)',
  /Removed chore\/wip/.test(forced.toast ?? ''),
  JSON.stringify(forced.toast)
)
check('dirty worktree folder gone from disk (FRWT-03)', !existsSync(dirtyWt.path))

// WRFT-06: a removal blocked by a live lock names what blocked it, keeps the
// row (git is never asked to deregister anything), and the same button is a
// working retry once the holder is gone. The fixture is an external process
// whose cwd sits inside the worktree — the real agent-terminal case, and the
// only honest one, since Node's own handles never block a delete.
const lockWt = api.worktrees.find((w) => w.branch === 'lock/me')
check('seeded lock/me worktree present for the blocked-removal flow', Boolean(lockWt))
const heldDir = join(lockWt.path, 'sub')

const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
  cwd: heldDir,
  stdio: 'ignore'
})
try {
  await new Promise((r) => setTimeout(r, 400)) // measured settle before the lock is held

  // First Remove: the deleter exhausts its 3 s budget and gives up before git
  // runs, so the Danger section gets the structured leftover block.
  await evaluate(ws, selectExpr('lock/me'))
  const blocked = await evaluate(
    ws,
    `(async () => {
       document.querySelector('.detail-remove-btn').click()
       await new Promise((r) => setTimeout(r, 6000)) // 3s retry budget + IPC round-trip
       return {
         note: document.querySelector('.detail-danger-leftover .detail-danger-note')
           ?.textContent ?? null,
         path: document.querySelector('.detail-danger-path')?.textContent ?? null,
         disabled: document.querySelector('.detail-remove-btn')?.disabled ?? null
       }
     })()`
  )
  check(
    'blocked removal names the blocked path inline (WRFT-06 AC 1)',
    blocked.path !== null && norm(blocked.path) === norm(heldDir),
    JSON.stringify({ shown: blocked.path, expected: heldDir })
  )
  check(
    'blocked removal reports what is left and that it stays registered (WRFT-06 AC 1)',
    /\d+ items? still on disk/.test(blocked.note ?? '') &&
      /still registered/.test(blocked.note ?? ''),
    JSON.stringify(blocked.note)
  )
  check(
    'remove button is enabled again after the failure (WRFT-06 AC 3)',
    blocked.disabled === false,
    JSON.stringify(blocked.disabled)
  )

  // The row must survive a real tree refresh — the defect this feature fixes is
  // that it used to vanish while the folder stayed on disk.
  const survived = await evaluate(
    ws,
    `(async () => {
       document.querySelector('.topbar-icon-btn').click()
       await new Promise((r) => setTimeout(r, 1500))
       return [...document.querySelectorAll('.sidebar-worktree-branch')]
         .some((b) => b.textContent === 'lock/me')
     })()`
  )
  check('blocked worktree is still listed after a tree refresh (WRFT-06 AC 1)', survived === true)
  check('blocked worktree folder is still on disk (WRFT-02 AC 1)', existsSync(heldDir))

  // Release the lock and retry from the same row — no restart, no cleanup.
  await new Promise((resolve) => {
    holder.once('exit', resolve)
    holder.kill()
  })
  await evaluate(ws, selectExpr('lock/me'))
  const retried = await evaluate(
    ws,
    `(async () => {
       document.querySelector('.detail-remove-btn').click()
       await new Promise((r) => setTimeout(r, 1000))
       // The blocked attempt already deleted everything it could reach, the
       // worktree's .git link included, so the row can read either clean (direct
       // remove) or dirty (confirm dialog). Confirm it if it opened.
       document.querySelector('.dialog-btn-danger')?.click()
       await new Promise((r) => setTimeout(r, 2500))
       return {
         rowGone: ![...document.querySelectorAll('.sidebar-worktree-branch')]
           .some((b) => b.textContent === 'lock/me'),
         toast: document.querySelector('.toast')?.textContent ?? null
       }
     })()`
  )
  check(
    'retry after the holder exits removes the row (WRFT-06 AC 2)',
    retried.rowGone === true,
    JSON.stringify(retried)
  )
  check(
    'retry toast names the branch (WRFT-06 AC 2)',
    /Removed lock\/me/.test(retried.toast ?? ''),
    JSON.stringify(retried.toast)
  )
  check(
    'blocked worktree folder gone from disk after the retry (WRFT-06 AC 2)',
    !existsSync(lockWt.path)
  )
} finally {
  // A failed check above must not leave a node.exe parked in the worktree —
  // it would block every later run and the seed's own rmSync.
  holder.kill()
}

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
