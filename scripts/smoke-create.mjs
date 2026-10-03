/* CDP smoke for the create-worktree feature (CRWT-01..04) and for the create's
 * progress line and busy dialog (CRTO, issue #153). Assumes the app is running
 * with --remote-debugging-port=<SMOKE_PORT> (default 9222) and a seeded
 * workspace named wtm-smoke-* containing repo `api` (branch main) plus linked
 * worktree `api-feature-42` (branch feature/42).
 *
 * Always on a throwaway --user-data-dir, never %APPDATA%\playground:
 *
 *   1. SMOKE_CONFIG=<userData>\config.json node scripts/seed-smoke-remove.mjs <short folder>
 *      (app NOT running)
 *   2. npm run dev -- -- "--user-data-dir=<userData>" --remote-debugging-port=<SMOKE_PORT>
 *        --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
 *        --disable-background-timer-throttling
 *   3. SMOKE_PORT=<port> node scripts/smoke-create.mjs
 *
 * SMOKE_ONLY selects a section:
 *   progress   checks 14.1-14.4 only. The section writes the seeded workspace's
 *              .app/config.json with postCreateCommands { api: a 5-second ping }
 *              (restoring any file there afterwards), creates chore/progress with
 *              the base refresh unticked (the seed has no remote), then removes
 *              the worktree and deletes the branch, so it reruns on the same seed.
 * With no SMOKE_ONLY every check runs. The CRWT checks create chore/smoke.test
 * and leave it, so a full run needs a fresh seed and a relaunch.
 *
 * Hand-verify (not automatable here):
 *   - a real credential manager window during the base fetch: the create ends
 *     with the fetch timeout text after 60 s; the window may stay open;
 *   - the progress line during a slow checkout of a large repository
 *     (`Creating worktree…` for as long as git works);
 *   - the progress spinner stands still under prefers-reduced-motion: reduce.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const ONLY = process.env.SMOKE_ONLY || null

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
  throw new Error(`No CDP page target after 30s on port ${PORT}`)
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

/* React controlled inputs need the native setter + an input event. */
const setBranchExpr = (value) => `(() => {
  const input = document.querySelectorAll('.dialog-input')[1]
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    .set.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return {
    preview: document.querySelector('.dialog-path-value')?.textContent ?? null,
    error: document.querySelector('.dialog-error')?.textContent ?? null,
    createDisabled: document.querySelector('.dialog-btn-primary')?.disabled ?? null
  }
})()`

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/* ------------------------------------------------------------ CRWT-01..04 -- */

async function createSection(ws, api) {
  // CRWT-01: repo-row "+" opens the dialog, repo pre-selected, base prefilled
  const opened = await evaluate(
    ws,
    `(async () => {
       document.querySelector('.topbar-icon-btn').click()
       await new Promise((r) => setTimeout(r, 1200))
       document.querySelector('.sidebar-new-worktree-btn').click()
       await new Promise((r) => setTimeout(r, 300))
       return {
         open: Boolean(document.querySelector('.dialog-panel')),
         selectedChip: document.querySelector(
           '.dialog-repo-chip.selected .dialog-repo-chip-name'
         )?.textContent,
         base: document.querySelectorAll('.dialog-input')[0]?.value,
         createDisabled: document.querySelector('.dialog-btn-primary')?.disabled
       }
     })()`
  )
  check(
    'dialog opens with repo pre-selected and base prefilled',
    opened.open === true && opened.selectedChip === 'api' && opened.base === 'main',
    JSON.stringify(opened)
  )
  check('create disabled while branch empty (CRWT-04)', opened.createDisabled === true)

  // CRWT-01: live sanitized path preview (slash → dash; full table is unit-tested)
  const preview = await evaluate(ws, setBranchExpr('chore/smoke.test'))
  const expectedPath = `${api.path}-chore-smoke.test`
  check(
    'preview shows sanitized flat-sibling path',
    preview.preview === expectedPath && preview.createDisabled === false,
    JSON.stringify(preview)
  )

  // CRWT-04: existing branch name → inline error, dialog stays open
  await evaluate(ws, setBranchExpr('feature/42'))
  const conflict = await evaluate(
    ws,
    `(async () => {
       document.querySelector('.dialog-btn-primary').click()
       await new Promise((r) => setTimeout(r, 1200))
       return {
         open: Boolean(document.querySelector('.dialog-panel')),
         error: document.querySelector('.dialog-error')?.textContent ?? null
       }
     })()`
  )
  check(
    'existing branch shows inline error, dialog stays open',
    conflict.open === true && /feature\/42|already/.test(conflict.error ?? ''),
    JSON.stringify(conflict)
  )

  // CRWT-04: editing the branch clears the error
  const cleared = await evaluate(ws, setBranchExpr('chore/smoke.test'))
  check('editing the field clears the error', cleared.error === null)

  // CRWT-01/02/03: create succeeds, dialog closes, new worktree selected
  const created = await evaluate(
    ws,
    `(async () => {
       document.querySelector('.dialog-btn-primary').click()
       await new Promise((r) => setTimeout(r, 2000))
       return {
         open: Boolean(document.querySelector('.dialog-panel')),
         selectedBranch: document.querySelector(
           '.sidebar-worktree.selected .sidebar-worktree-branch'
         )?.textContent ?? null
       }
     })()`
  )
  check(
    'create closes dialog and selects the new worktree (CRWT-03)',
    created.open === false && created.selectedBranch === 'chore/smoke.test',
    JSON.stringify(created)
  )
  check('worktree exists on disk at the sibling path (CRWT-02)', existsSync(expectedPath))

  // CRWT-04 via IPC: unknown base branch is returned, not thrown
  const badBase = await evaluate(
    ws,
    `window.api.invoke('worktrees:create', { repoPath: ${JSON.stringify(api.path)}, branch: 'x/y', baseBranch: 'does-not-exist' })`
  )
  check(
    'unknown base returns git error',
    badBase.ok === false && Boolean(badBase.error),
    JSON.stringify(badBase)
  )

  // Edge case: branch sanitizing to an occupied sibling path is refused
  const aliased = await evaluate(
    ws,
    `window.api.invoke('worktrees:create', { repoPath: ${JSON.stringify(api.path)}, branch: 'feature-42', baseBranch: 'main' })`
  )
  check(
    'path collision via sanitization alias is refused',
    aliased.ok === false && /exists/i.test(aliased.error ?? ''),
    JSON.stringify(aliased)
  )
}

/* ------------------------------------------- progress and busy dialog (CRTO) -- */

const PROGRESS_BRANCH = 'chore/progress'
/** About five seconds of post-create command, long enough to look at the busy dialog. */
const HOOK_COMMAND = 'ping -n 6 127.0.0.1 > NUL'
const HOOK_LABEL = 'Running post-create command…'
const BUSY_TITLE = 'Wait for the create to finish'

/**
 * Refreshes the tree and selects a worktree other than chore/progress, so the
 * last check sees the create's own selection, not one left by an earlier run.
 */
const selectOtherWorktree = `(async () => {
  document.querySelector('.topbar-icon-btn[title="Refresh"]')?.click()
  const branchOf = (row) => row.querySelector('.sidebar-worktree-branch')?.textContent
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200))
    const rows = [...document.querySelectorAll('.sidebar-worktree')]
    if (rows.length === 0 || rows.some((row) => branchOf(row) === ${JSON.stringify(PROGRESS_BRANCH)})) continue
    rows[0].click()
    break
  }
  await new Promise((r) => setTimeout(r, 200))
  return document.querySelector('.sidebar-worktree.selected .sidebar-worktree-branch')?.textContent ?? null
})()`

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/** The busy dialog as the user sees it: the progress line, Cancel, the panel. */
const busyState = `(() => {
  const cancel = document.querySelector('footer.dialog-footer .dialog-btn-ghost')
  return {
    open: document.querySelector('.dialog-panel') !== null,
    progress: document.querySelector('.dialog-body .dialog-progress[role="status"]')?.textContent.trim() ?? null,
    spinner: document.querySelector('.dialog-progress .dialog-progress-loader') !== null,
    cancelDisabled: cancel?.disabled ?? null,
    cancelTitle: cancel?.getAttribute('title') ?? null,
    selectedBranch: document.querySelector('.sidebar-worktree.selected .sidebar-worktree-branch')?.textContent ?? null
  }
})()`

/**
 * Removes chore/progress through the app's own guarded IPC, then deletes the
 * branch. Retries while the post-create command may still hold the folder: a
 * mutant that lets the dialog close early leaves the create running.
 */
async function removeProgressWorktree(ws, api, worktreePath) {
  const norm = (path) => path.replaceAll('\\', '/').toLowerCase()
  const listed = () =>
    git(['worktree', 'list', '--porcelain'], api.path)
      .split('\n')
      .some((line) => norm(line) === `worktree ${norm(worktreePath)}`)
  let removed = null
  for (let i = 0; i < 40 && listed(); i++) {
    removed = await evaluate(
      ws,
      `window.api.invoke('worktrees:remove', ${JSON.stringify({ repoPath: api.path, worktreePath })})`
    )
    if (removed.ok) break
    await sleep(500)
  }
  if (git(['branch', '--list', PROGRESS_BRANCH], api.path) !== '') {
    git(['branch', '-D', PROGRESS_BRANCH], api.path)
  }
  return { listed: listed(), branch: git(['branch', '--list', PROGRESS_BRANCH], api.path) }
}

async function progressSection(ws, wsNode, api) {
  const worktreePath = `${api.path}-chore-progress`
  const appDir = join(wsNode.path, '.app')
  const configFile = join(appDir, 'config.json')
  const backup = existsSync(configFile) ? readFileSync(configFile, 'utf8') : null
  const madeAppDir = !existsSync(appDir)

  // A run that was cut short may have left the worktree or the branch behind.
  await removeProgressWorktree(ws, api, worktreePath)
  const selectedBefore = await evaluate(ws, selectOtherWorktree)
  if (selectedBefore === null || selectedBefore === PROGRESS_BRANCH) {
    throw new Error(`No other worktree could be selected first: ${selectedBefore}`)
  }
  mkdirSync(appDir, { recursive: true })
  writeFileSync(
    configFile,
    JSON.stringify(
      { ...(backup === null ? {} : JSON.parse(backup)), postCreateCommands: { api: HOOK_COMMAND } },
      null,
      2
    ) + '\n'
  )
  try {
    const opened = await evaluate(
      ws,
      `(async () => {
         document.querySelector('.topbar-icon-btn[title="Refresh"]').click()
         const selector = '.sidebar-new-worktree-btn[title="New worktree in api"]'
         for (let i = 0; i < 50 && !document.querySelector(selector); i++) {
           await new Promise((r) => setTimeout(r, 200))
         }
         document.querySelector(selector)?.click()
         for (let i = 0; i < 25 && !document.querySelector('.dialog-panel'); i++) {
           await new Promise((r) => setTimeout(r, 200))
         }
         return document.querySelector('.dialog-panel') !== null
       })()`
    )
    if (!opened) throw new Error('New worktree did not open')
    await evaluate(ws, setBranchExpr(PROGRESS_BRANCH))
    const ready = await evaluate(
      ws,
      `(() => {
         const box = document.querySelector('.dialog-check input[type="checkbox"]')
         if (box?.checked) box.click()
         return {
           refresh: document.querySelector('.dialog-check input[type="checkbox"]')?.checked ?? null,
           createDisabled: document.querySelector('.dialog-btn-primary')?.disabled ?? null
         }
       })()`
    )
    if (ready.refresh !== false || ready.createDisabled !== false) {
      throw new Error(`The dialog is not ready to create: ${JSON.stringify(ready)}`)
    }

    await evaluate(ws, `document.querySelector('.dialog-btn-primary').click()`)
    const clickedAt = Date.now()

    // 14.1: the line names the post-create command while it runs.
    const seen = []
    let state = await evaluate(ws, busyState)
    while (state.progress !== HOOK_LABEL && Date.now() - clickedAt < 4000) {
      if (seen[seen.length - 1] !== state.progress) seen.push(state.progress)
      await sleep(100)
      state = await evaluate(ws, busyState)
    }
    if (seen[seen.length - 1] !== state.progress) seen.push(state.progress)
    check(
      '14.1 while the post-create command runs, the progress line reads "Running post-create command…" (CRTO-11, CRTO-16)',
      state.open && state.progress === HOOK_LABEL && state.spinner,
      JSON.stringify({ atMs: Date.now() - clickedAt, seen, spinner: state.spinner })
    )

    // 14.2: Cancel is disabled with the tooltip while busy.
    check(
      '14.2 Cancel is disabled with the title "Wait for the create to finish" (CRTO-20)',
      state.open && state.cancelDisabled === true && state.cancelTitle === BUSY_TITLE,
      JSON.stringify({ disabled: state.cancelDisabled, title: state.cancelTitle })
    )

    // 14.3: a backdrop click leaves the dialog open.
    await evaluate(ws, `document.querySelector('.dialog-backdrop')?.click()`)
    await sleep(300)
    const afterBackdrop = await evaluate(ws, busyState)
    check(
      '14.3 a backdrop click while busy leaves the dialog open (CRTO-19)',
      state.open && afterBackdrop.open === true,
      JSON.stringify({ open: afterBackdrop.open, progress: afterBackdrop.progress })
    )

    // 14.4: the dialog closes on success and selects the new worktree.
    let settled = afterBackdrop
    while (
      (settled.open || settled.selectedBranch !== PROGRESS_BRANCH) &&
      Date.now() - clickedAt < 15000
    ) {
      await sleep(200)
      settled = await evaluate(ws, busyState)
    }
    check(
      '14.4 within 15 s the dialog closes, chore/progress is selected and no progress line is left (CRTO-17, CRTO-21)',
      afterBackdrop.open === true &&
        settled.open === false &&
        settled.selectedBranch === PROGRESS_BRANCH &&
        settled.progress === null &&
        existsSync(worktreePath),
      JSON.stringify({
        atMs: Date.now() - clickedAt,
        open: settled.open,
        selected: settled.selectedBranch,
        progress: settled.progress
      })
    )
  } finally {
    // A dialog left open by a failed run would block the next one.
    await evaluate(
      ws,
      `(() => {
         const cancel = document.querySelector('footer.dialog-footer .dialog-btn-ghost')
         if (cancel && !cancel.disabled) cancel.click()
       })()`
    ).catch(() => {})
    const left = await removeProgressWorktree(ws, api, worktreePath)
    if (backup === null) rmSync(configFile, { force: true })
    if (madeAppDir) rmSync(appDir, { recursive: true, force: true })
    else writeFileSync(configFile, backup)
    if (left.listed || left.branch !== '') {
      console.log(`WARN  chore/progress cleanup incomplete: ${JSON.stringify(left)}`)
    }
  }
}

/* ----------------------------------------------------------------- drive -- */

if (ONLY !== null && ONLY !== 'progress') {
  console.error(`Unknown SMOKE_ONLY=${ONLY}; expected progress`)
  process.exit(1)
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
check('seeded workspace with repo api present', Boolean(api))

if (api && ONLY === null) await createSection(ws, api)
if (api) await progressSection(ws, wsNode, api)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
