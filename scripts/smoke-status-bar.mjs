/* CDP smoke for the status bar (STBR-01..29, 31). Drives the bar and the sync popover
 * through the states the unit tests cannot reach, against real git: a temp
 * workspace whose repo clones a temp BARE remote, plus a second bare remote.
 * Nothing here touches a real remote — every push goes to a bare repo under
 * the temp dir, which is deleted on the way out.
 *
 * Seeded fixture (fictional names only — this repo is public):
 *   <tmp>/origin.git, <tmp>/backup.git       two bare remotes
 *   <tmp>/acme-workspace/acme-widget         primary checkout (main), left
 *                                            with all five change statuses
 *   <tmp>/wt/long     a very long branch, tracking origin, diverged 1/1
 *   <tmp>/wt/sync     tracking origin, 1 behind → Sync → 1 ahead → Sync
 *   <tmp>/wt/publish  no upstream, two remotes → Publish needs a choice
 *   <tmp>/wt/detached a detached HEAD → no sync operation offered
 *   <tmp>/wt/gone     upstream configured, its tracking ref deleted → git error
 *   <tmp>/wt/many     23 commits behind → 20 listed, `+3 more`
 *   <tmp>/acme-workspace/acme-gizmo  a second repo with no remote at all
 *   <tmp>/other       a second clone that pushes the "remote" commits
 *   <tmp>/loose       a plain folder, the cwd of the non-worktree session
 *   <tmp>/wt/scrf     added mid-run: the counter follows a terminal commit,
 *                     focus and a turn end (SCRF-01/07/09/10)
 *   <tmp>/fakebin     a fake `claude.cmd` that only records its hook token
 *
 * Sessions: ad-hoc `pwsh -NoLogo` sessions, plus one session of a throwaway
 * agent whose command is the fake `claude.cmd` above: never a real agent,
 * never any input sent. Only the sessions this script spawned are
 * stopped/removed, and the throwaway agent is removed on the way out.
 *
 * Owner state: run the dev app on a throwaway --user-data-dir, never the
 * owner's real one. The UI direction, theme, workspace list and the Agents
 * selection are still snapshotted first and restored in a `finally`, even on
 * failure.
 *
 * Screenshots (light + dark) go to %TEMP%\status-bar-smoke\ — never the repo.
 *
 * NOT automatable here (hand-verify from the screenshots): both themes read
 * well; the middle ellipsis looks right; the sync popover sits above the bar.
 *
 * The pull request chip (F6) is driven from stubbed provider answers: the
 * renderer's `api` module gets its `invoke` wrapped for the `ado-pr:*` and
 * `github-pr:*` find, get and open channels only, so no provider is asked and
 * no browser page opens; the wrap is removed in a `finally`. SMOKE_ONLY=pr
 * seeds the fixture and runs that section alone.
 *
 * The changed-file counter's click is not driven here: since FXPL-31 it opens
 * the Files direction in uncommitted mode instead of a popover (STBR-30 and
 * STBR-32 are superseded), and scripts/smoke-files.mjs covers it in step 15,
 * "The status-bar counter lands in Files". This script reads the counter only.
 *
 * Run: npm run dev -- -- --user-data-dir=<a throwaway dir> --remote-debugging-port=9222
 *                                                      (in one shell)
 *      node scripts/smoke-status-bar.mjs                  (in another)
 */

import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
/** `pr` runs the pull request chip section alone (F6); unset runs everything. */
const ONLY = process.env.SMOKE_ONLY ?? null
if (ONLY !== null && ONLY !== 'pr') {
  console.error('SMOKE_ONLY must be pr.')
  process.exit(2)
}
const TMP = realpathSync.native(tmpdir())
const SHOTS = join(TMP, 'status-bar-smoke')

const LONG_BRANCH =
  'user/dev/4821-fix-login-redirect-after-session-timeout-on-the-legacy-portal-and-new-dashboard/12345-endpoint-with-a-long-name'
const SYNC_BRANCH = 'user/dev/4821-fix-login/12346-sync-both-ways'
const PUBLISH_BRANCH = 'user/dev/4821-fix-login/12347-publish-me'
const GONE_BRANCH = 'user/dev/4821-fix-login/12348-upstream-ref-gone'
const MANY_BRANCH = 'user/dev/4821-fix-login/12349-many-incoming'
/** Commits pushed to MANY_BRANCH from the other clone: 20 listed, `+3 more` (STBR-16). */
const MANY_COMMITS = 23
/** The only branch of the no-remote repo; distinct from `main` so sidebar lookups stay unique. */
const GIZMO_BRANCH = 'local-only'
const TARGET_TITLE = 'stbr-smoke target'
const FOLDER_TITLE = 'stbr-smoke folder'
const SUBFOLDER_TITLE = 'stbr-smoke subfolder'
const DUMMY_TITLE = 'stbr-smoke nudge'
const SCRF_BRANCH = 'user/dev/4821-fix-login/12350-counter-refresh'
const TURN_TITLE = 'stbr-smoke turn end'
const FAKE_AGENT = 'Fake claude (status bar smoke)'
/** A window narrow enough that LONG_BRANCH overflows 70% of the bar (STBR-06). */
const NARROW_WIDTH = 900

// ---------------------------------------------------------------- CDP harness

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
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)))
      resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  const r = result.result
  if (r.subtype === 'error') throw new Error(r.description)
  return r.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Poll `expression` (which returns JSON) until `ok(value)`; the last value either way. */
async function waitFor(ws, expression, ok, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let value
  do {
    value = JSON.parse(await evaluate(ws, expression))
    if (ok(value)) return value
    await sleep(150)
  } while (Date.now() < deadline)
  return value
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  const n = String(checks.length).padStart(2, ' ')
  console.log(`${n}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---------------------------------------------------------------- git fixture

const GIT_ENV = {
  ...process.env,
  // Clones inherit nothing from a repo config, so long paths ride in the env too.
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'core.longpaths',
  GIT_CONFIG_VALUE_0: 'true',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Smoke',
  GIT_AUTHOR_EMAIL: 'smoke@example.invalid',
  GIT_COMMITTER_NAME: 'Smoke',
  GIT_COMMITTER_EMAIL: 'smoke@example.invalid'
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: 'pipe' }).trim()
}

/**
 * The app runs `git status` on refresh, which briefly holds the worktree's
 * index.lock; a fixture commit racing it retries instead of failing the run.
 */
function gitRetryingLock(cwd, ...args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return git(cwd, ...args)
    } catch (err) {
      if (attempt >= 10 || !/index\.lock/.test(String(err.stderr ?? err.message))) throw err
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
    }
  }
}

function commit(cwd, file, subject) {
  writeFileSync(join(cwd, file), `${subject}\n`)
  gitRetryingLock(cwd, 'add', file)
  gitRetryingLock(cwd, 'commit', '-q', '-m', subject)
}

const root = realpathSync.native(mkdtempSync(join(TMP, 'stbr-smoke-')))
const originBare = join(root, 'origin.git')
const backupBare = join(root, 'backup.git')
const wsDir = join(root, 'acme-workspace')
const primary = join(wsDir, 'acme-widget')
const gizmo = join(wsDir, 'acme-gizmo')
const other = join(root, 'other')
const loose = join(root, 'loose')
const wtDir = {
  long: join(root, 'wt', 'long'),
  sync: join(root, 'wt', 'sync'),
  pub: join(root, 'wt', 'publish'),
  detached: join(root, 'wt', 'detached'),
  gone: join(root, 'wt', 'gone'),
  many: join(root, 'wt', 'many'),
  scrf: join(root, 'wt', 'scrf')
}
const fakeBin = join(root, 'fakebin')

function seed() {
  git(root, 'init', '-q', '--bare', '-b', 'main', originBare)
  git(root, 'init', '-q', '--bare', '-b', 'main', backupBare)
  // The long branch nears MAX_PATH under refs/; the app's own git needs this too.
  for (const bare of [originBare, backupBare]) git(bare, 'config', 'core.longpaths', 'true')
  mkdirSync(wsDir, { recursive: true })
  mkdirSync(loose, { recursive: true })
  mkdirSync(join(root, 'wt'), { recursive: true })
  git(wsDir, 'clone', '-q', originBare, primary)
  git(primary, 'config', 'core.autocrlf', 'false')
  git(primary, 'config', 'core.longpaths', 'true')
  git(primary, 'checkout', '-q', '-b', 'main')
  for (const f of ['modify-me.txt', 'delete-me.txt', 'rename-me.txt']) {
    writeFileSync(join(primary, f), `${f}\n`)
  }
  git(primary, 'add', '.')
  git(primary, 'commit', '-q', '-m', 'Initial widget')
  git(primary, 'push', '-q', '-u', 'origin', 'main')
  git(primary, 'remote', 'add', 'backup', backupBare)

  git(primary, 'worktree', 'add', '-q', '-b', LONG_BRANCH, wtDir.long, 'main')
  git(wtDir.long, 'push', '-q', '-u', 'origin', LONG_BRANCH)
  git(primary, 'worktree', 'add', '-q', '-b', SYNC_BRANCH, wtDir.sync, 'main')
  git(wtDir.sync, 'push', '-q', '-u', 'origin', SYNC_BRANCH)
  git(primary, 'worktree', 'add', '-q', '-b', PUBLISH_BRANCH, wtDir.pub, 'main')
  // STBR-08/13: a detached HEAD offers no remote-writing operation.
  git(primary, 'worktree', 'add', '-q', '--detach', wtDir.detached, 'main')
  // STBR-14: an upstream is configured but its remote-tracking ref is gone
  // locally (a deleted remote branch, pruned), so `rev-list` fails for real.
  // The untracked file proves the counter keeps rendering beside the error.
  git(primary, 'worktree', 'add', '-q', '-b', GONE_BRANCH, wtDir.gone, 'main')
  git(wtDir.gone, 'push', '-q', '-u', 'origin', GONE_BRANCH)
  // Deleted on the remote too, so a later `pull` (a full fetch) cannot bring it back.
  git(root, '--git-dir', originBare, 'update-ref', '-d', `refs/heads/${GONE_BRANCH}`)
  git(primary, 'update-ref', '-d', `refs/remotes/origin/${GONE_BRANCH}`)
  writeFileSync(join(wtDir.gone, 'notes.txt'), 'untracked\n')
  // STBR-16: the other clone lands more than 20 commits here.
  git(primary, 'worktree', 'add', '-q', '-b', MANY_BRANCH, wtDir.many, 'main')
  git(wtDir.many, 'push', '-q', '-u', 'origin', MANY_BRANCH)

  // Diverge the long branch: one local commit, one pushed from another clone.
  commit(wtDir.long, 'local.txt', 'Local tweak to the login endpoint')
  git(root, 'clone', '-q', originBare, other)
  git(other, 'config', 'core.autocrlf', 'false')
  git(other, 'config', 'core.longpaths', 'true')
  git(other, 'checkout', '-q', LONG_BRANCH)
  commit(other, 'remote.txt', 'Remote fix for the login redirect')
  git(other, 'push', '-q')
  git(other, 'checkout', '-q', SYNC_BRANCH)
  commit(other, 'down.txt', 'Remote change to sync down')
  git(other, 'push', '-q')
  git(other, 'checkout', '-q', MANY_BRANCH)
  for (let i = 1; i <= MANY_COMMITS; i++) commit(other, 'many.txt', `Remote batch commit ${i}`)
  git(other, 'push', '-q')

  // The primary checkout carries one change of each status: the counter reads 5 (STBR-29).
  writeFileSync(join(primary, 'modify-me.txt'), 'changed\n')
  unlinkSync(join(primary, 'delete-me.txt'))
  git(primary, 'mv', 'rename-me.txt', 'renamed.txt')
  writeFileSync(join(primary, 'added.txt'), 'added\n')
  git(primary, 'add', 'added.txt')
  writeFileSync(join(primary, 'untracked.txt'), 'untracked\n')

  // STBR-13: a repo that never had a remote offers no remote-writing operation.
  git(wsDir, 'init', '-q', '-b', GIZMO_BRANCH, gizmo)
  git(gizmo, 'config', 'core.autocrlf', 'false')
  commit(gizmo, 'gizmo.txt', 'Initial gizmo')
}

// ---------------------------------------------------------------- page helpers

const J = JSON.stringify

/** Everything the checks read off the bar, as JSON. */
const BAR = `(() => {
  const bar = document.querySelector('footer.status-bar[role="status"]')
  if (!bar) return JSON.stringify({ present: false })
  const q = (s) => bar.querySelector(s)
  const head = q('.status-bar-branch-head')
  const branch = q('.status-bar-branch')
  const sync = q('.status-bar-sync')
  const r = bar.getBoundingClientRect()
  return JSON.stringify({
    present: true,
    empty: q('.status-bar-empty')?.textContent ?? null,
    repo: q('.status-bar-repo')?.textContent ?? null,
    branchTitle: branch?.getAttribute('title') ?? null,
    head: head?.textContent ?? null,
    tail: q('.status-bar-branch-tail')?.textContent ?? null,
    headTruncated: head ? head.scrollWidth > head.clientWidth : null,
    tailTruncated: q('.status-bar-branch-tail')
      ? q('.status-bar-branch-tail').scrollWidth > q('.status-bar-branch-tail').clientWidth
      : null,
    headWidth: head ? head.getBoundingClientRect().width : null,
    tailWidth: q('.status-bar-branch-tail')?.getBoundingClientRect().width ?? null,
    // 0 when the tail shows its last character: it is clipped at the start, not the end.
    tailEndGap: q('.status-bar-branch-tail bdi')
      ? q('.status-bar-branch-tail').getBoundingClientRect().right -
        q('.status-bar-branch-tail bdi').getBoundingClientRect().right
      : null,
    branchWidth: branch ? branch.getBoundingClientRect().width : null,
    headTailGap:
      head && q('.status-bar-branch-tail')
        ? q('.status-bar-branch-tail').getBoundingClientRect().left -
          head.getBoundingClientRect().right
        : null,
    barWidth: r.width,
    barTop: r.top,
    sync: sync?.textContent ?? null,
    syncTag: sync?.tagName ?? null,
    syncClass: sync?.className ?? null,
    changes: q('button.status-bar-changes')?.textContent ?? null,
    folder: q('.status-bar-folder-path')?.textContent ?? null,
    folderTitle: q('.status-bar-folder')?.getAttribute('title') ?? null,
    note: q('.status-bar-note')?.textContent ?? null
  })
})()`

const bar = async (ws) => JSON.parse(await evaluate(ws, BAR))
const waitBar = (ws, ok, timeoutMs) => waitFor(ws, BAR, ok, timeoutMs)

async function direction(ws, name) {
  await evaluate(
    ws,
    `(() => {
       const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => b.textContent.trim() === ${J(name)})
       seg?.click()
       return Boolean(seg)
     })()`
  )
  await sleep(300)
}

async function refresh(ws) {
  await evaluate(ws, `(document.querySelector('.topbar-icon-btn[title="Refresh"]').click(), true)`)
  await sleep(700)
}

/** Click the temp workspace's sidebar row for `branch` (Tree direction). */
async function selectWorktree(ws, branch) {
  await direction(ws, 'Tree')
  const found = await evaluate(
    ws,
    `(() => {
       const wsEl = [...document.querySelectorAll('.sidebar-workspace')].find(
         (s) => s.querySelector('.sidebar-workspace-name')?.textContent === ${J(basename(wsDir))})
       const row = [...(wsEl?.querySelectorAll('.sidebar-worktree') ?? [])].find(
         (r) => r.querySelector('.sidebar-worktree-branch')?.textContent === ${J(branch)})
       row?.click()
       return Boolean(row)
     })()`
  )
  if (!found) {
    const seen = await evaluate(
      ws,
      `(async () => {
         const node = (await window.api.invoke('tree:get')).find((w) => w.path === ${J(wsDir)})
         const rows = [...document.querySelectorAll('.sidebar-worktree-branch')].map((r) => r.textContent)
         return JSON.stringify({ tree: node?.repos?.flatMap((r) => r.worktrees.map((w) => w.branch)), rows })
       })()`
    )
    throw new Error(`sidebar row for ${branch} not found: ${seen}`)
  }
  await waitBar(ws, (b) => b.branchTitle === branch)
}

/** Click the rail row whose tooltip starts with `title` (Agents direction). */
async function selectSession(ws, title, index = 0) {
  await direction(ws, 'Agents')
  return evaluate(
    ws,
    `(() => {
       const rows = [...document.querySelectorAll('.rail-row')].filter((r) => (r.title || '').startsWith(${J(title)}))
       rows[${index}]?.click()
       return Boolean(rows[${index}])
     })()`
  )
}

async function openSync(ws) {
  // The section is a '…' span until the sync state loads; wait for the button.
  const ready = await waitFor(
    ws,
    `JSON.stringify(Boolean(document.querySelector('button.status-bar-sync')))`,
    (v) => v
  )
  if (!ready) throw new Error('the sync section never became a button')
  await evaluate(ws, `(document.querySelector('button.status-bar-sync').click(), true)`)
  return waitFor(ws, POP, (p) => p.open && p.listsLoaded !== false)
}

const POP = `(() => {
  const pop = document.querySelector('.sync-pop')
  if (!pop) return JSON.stringify({ open: false })
  const lists = [...pop.querySelectorAll('.sync-pop-list')].map((l) => ({
    title: l.querySelector('.section-label')?.textContent ?? null,
    commits: [...l.querySelectorAll('.sync-pop-commit')].map((c) => ({
      sha: c.querySelector('.sync-pop-sha')?.textContent ?? '',
      subject: c.querySelector('.sync-pop-subject')?.textContent ?? '',
      age: c.querySelector('.sync-pop-age')?.textContent ?? ''
    })),
    more: l.querySelector('.sync-pop-more')?.textContent ?? null,
    empty: l.querySelector('.sync-pop-empty')?.textContent ?? null
  }))
  const status = pop.querySelector('.sync-pop-status')
  const select = pop.querySelector('select.sync-pop-remote')
  const loader = pop.querySelector('.sync-pop-loader')
  const lr = loader?.getBoundingClientRect()
  return JSON.stringify({
    open: true,
    loader: Boolean(lr && lr.width > 0 && lr.height > 0 && getComputedStyle(loader).visibility !== 'hidden'),
    buttons: [...pop.querySelectorAll('.sync-pop-btn')].map((b) => ({ label: b.textContent, disabled: b.disabled })),
    fetched: pop.querySelector('.sync-pop-fetched')?.textContent ?? null,
    status: status?.textContent ?? null,
    failed: status?.classList.contains('failed') ?? false,
    select: select ? { value: select.value, options: [...select.options].map((o) => o.value) } : null,
    lists,
    listsLoaded: lists.every((l) => l.empty !== 'Loading…')
  })
})()`

/** Hit-test a 6x6 grid over a popover: how many points land on something else. */
const TOPMOST = (selector) => `(() => {
  const pop = document.querySelector(${J(selector)})
  const r = pop.getBoundingClientRect()
  let covered = 0
  const on = []
  for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) {
    const x = r.left + (r.width * i) / 7, y = r.top + (r.height * j) / 7
    const el = document.elementFromPoint(x, y)
    if (!pop.contains(el)) { covered++; on.push(el?.className?.toString().slice(0, 40)) }
  }
  return JSON.stringify({ covered, on: [...new Set(on)], opacity: getComputedStyle(pop).opacity,
    bg: getComputedStyle(pop).backgroundColor, animations: pop.getAnimations().map((a) => a.playState) })
})()`

async function clickPopButton(ws, label) {
  const ok = await evaluate(
    ws,
    `(() => {
       const b = [...document.querySelectorAll('.sync-pop .sync-pop-btn')].find((x) => x.textContent === ${J(label)})
       b?.click()
       return Boolean(b)
     })()`
  )
  if (!ok) throw new Error(`popover button ${label} not found`)
}

/** Wait for the running operation to finish: its status line is no longer a busy one. */
const waitOutcome = async (ws) => {
  await sleep(150)
  return waitFor(
    ws,
    POP,
    (p) => !p.open || (p.status !== null && !/…$/.test(p.status) && p.listsLoaded),
    30000
  )
}

const closePopovers = (ws) => evaluate(ws, `(document.body.click(), true)`)

/** Let every running CSS animation (popIn, toastIn) finish before reading or shooting. */
const settle = (ws, selector = '.sync-pop, .toast') =>
  evaluate(
    ws,
    `Promise.race([
       Promise.all([...document.querySelectorAll(${J(selector)})].flatMap((el) => el.getAnimations()).map((a) => a.finished)),
       new Promise((r) => setTimeout(r, 1500))
     ]).then(() => true)`
  )

async function shot(ws, name, { quick = false } = {}) {
  mkdirSync(SHOTS, { recursive: true })
  // A toast lives 2.2 s, so it cannot wait out the settle's worst case.
  if (!quick) await settle(ws)
  await sleep(quick ? 250 : 350)
  const { data } = await send(ws, 'Page.captureScreenshot', { format: 'png' })
  const file = join(SHOTS, name)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`      saved ${file}`)
}

async function setTheme(ws, theme) {
  await evaluate(
    ws,
    `(() => {
       if (document.documentElement.dataset.theme !== ${J(theme)})
         document.querySelector('.topbar-icon-btn[title^="Switch to"]')?.click()
       return true
     })()`
  )
  await sleep(300)
}

/** The toast on screen, if any, with its position against the bar. */
const TOAST = `(() => {
  const t = document.querySelector('.toast')
  const b = document.querySelector('footer.status-bar')
  return JSON.stringify(t ? { text: t.textContent, bottom: t.getBoundingClientRect().bottom, barTop: b.getBoundingClientRect().top } : null)
})()`

/** Start a Fetch on the selected worktree and close the popover before it answers (STBR-26). */
async function toastFromClosedPopover(ws) {
  await openSync(ws)
  await evaluate(
    ws,
    `(() => {
       [...document.querySelectorAll('.sync-pop .sync-pop-btn')].find((x) => x.textContent === 'Fetch').click()
       document.body.click()
       return true
     })()`
  )
  return waitFor(ws, TOAST, (v) => v !== null, 10000)
}

/** A `pre-push` hook in the common git dir (so every linked worktree runs it) that sleeps. */
const slowHook = join(primary, '.git', 'hooks', 'pre-push')
const slowPushOn = () => writeFileSync(slowHook, '#!/bin/sh\nsleep 4\nexit 0\n')
const slowPushOff = () => rmSync(slowHook, { force: true })

const originTip = (branch) =>
  git(root, '--git-dir', originBare, 'rev-parse', `refs/heads/${branch}`)

// ---------------------------------------------------------------- run

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

// Owner snapshot, before anything changes.
const owner = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       const sel = document.querySelector('.rail-row.selected')
       const title = sel?.title ?? null
       const index = title === null ? 0 : [...document.querySelectorAll('.rail-row')].filter((r) => r.title === title).indexOf(sel)
       return JSON.stringify({ ui: cfg.ui, workspaces: cfg.workspaces, rail: title, railIndex: index })
     })()`
  )
)
const mine = [] // session ids this script spawned
let ownerTreeSelection = null
let registered = false
let fakeAgentRegistered = false

async function spawn(cwd, title) {
  const id = await evaluate(
    ws,
    `(async () => {
       const v = await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${J(cwd)}, adhocCommand: 'pwsh -NoLogo' })
       await window.api.invoke('sessions:rename', { id: v.id, title: ${J(title)} })
       return v.id
     })()`
  )
  mine.push(id)
  return id
}

async function main() {
  seed()
  console.log(`fixture: ${root}`)

  // Register the temp workspace alongside the owner's.
  const entry = { id: wsDir.toLowerCase(), path: wsDir, displayName: basename(wsDir) }
  await evaluate(
    ws,
    `(async () => { await window.api.invoke('config:patch', { workspaces: ${J([...owner.workspaces, entry])} }); return true })()`
  )
  registered = true

  // Remember the owner's tree selection (only visible in Tree).
  await direction(ws, 'Tree')
  ownerTreeSelection = JSON.parse(
    await evaluate(
      ws,
      `(() => {
         const row = document.querySelector('.sidebar-worktree.selected')
         if (!row) return JSON.stringify(null)
         return JSON.stringify({
           workspace: row.closest('.sidebar-workspace')?.querySelector('.sidebar-workspace-name')?.textContent,
           repo: row.closest('.sidebar-repo')?.querySelector('.sidebar-repo-name')?.textContent,
           branch: row.querySelector('.sidebar-worktree-branch')?.textContent
         })
       })()`
    )
  )
  await refresh(ws)

  const repos = JSON.parse(
    await evaluate(
      ws,
      `(async () => {
         const node = (await window.api.invoke('tree:get')).find((w) => w.id === ${J(entry.id)})
         return JSON.stringify(node?.repos ?? [])
       })()`
    )
  )
  const tree = repos.find((r) => r.name === 'acme-widget')?.worktrees ?? []
  const gizmoTree = repos.find((r) => r.name === 'acme-gizmo')?.worktrees ?? []
  const pathOf = (branch) => tree.find((w) => w.branch === branch)?.path
  const detachedLabel = tree.find((w) => w.branch.startsWith('(detached '))?.branch
  check(
    'the temp workspace lists two repos: acme-widget with seven worktrees, acme-gizmo with one',
    repos.length === 2 &&
      tree.length === 7 &&
      [LONG_BRANCH, SYNC_BRANCH, PUBLISH_BRANCH, GONE_BRANCH, MANY_BRANCH, 'main'].every(pathOf) &&
      detachedLabel !== undefined &&
      gizmoTree.length === 1 &&
      gizmoTree[0].branch === GIZMO_BRANCH,
    repos
      .map((r) => `${r.name}: ${r.worktrees.map((w) => w.branch.slice(0, 40)).join(', ')}`)
      .join(' | ')
  )

  if (ONLY === 'pr') {
    await prChipSection(ws, pathOf, detachedLabel)
    return
  }

  // --- The long branch in every non-Agents direction (STBR-01, 02, 06) ---
  await selectWorktree(ws, LONG_BRANCH)
  for (const dir of ['Tree', 'Board', 'Workflows']) {
    await direction(ws, dir)
    const b = await waitBar(ws, (v) => v.branchTitle === LONG_BRANCH)
    check(
      `${dir}: the bar describes the tree selection (STBR-01, 02)`,
      b.present && b.repo === 'acme-widget' && b.branchTitle === LONG_BRANCH,
      `${b.repo} · ${b.head?.slice(0, 20)}…${b.tail}`
    )
  }
  await direction(ws, 'Tree')
  // The longest branch Windows allows (MAX_PATH on the ref's lock file) fits in
  // 70% of a 1280 px bar, so the window is narrowed to force the cut.
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: NARROW_WIDTH,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(300)
  const long = await bar(ws)
  await send(ws, 'Emulation.clearDeviceMetricsOverride')
  await sleep(300)
  check(
    'a long branch is truncated in the middle, full name in title (STBR-06)',
    long.headTruncated === true &&
      long.head + long.tail === LONG_BRANCH &&
      long.head === LONG_BRANCH.slice(0, Math.ceil(LONG_BRANCH.length / 2)) &&
      long.branchTitle === LONG_BRANCH,
    `head truncated ${long.headTruncated}, tail "…${long.tail?.slice(-20)}"`
  )
  check(
    'the start and the end of a long branch get equal widths, the end shown to its last character (STBR-06)',
    long.tailTruncated === true &&
      // The head holds the odd character, so the halves may differ by one
      // 12px monospace character (about 7 px), never more.
      Math.abs(long.headWidth - long.tailWidth) <= 8 &&
      Math.abs(long.tailEndGap) < 0.5,
    `head ${long.headWidth?.toFixed(1)}px, tail ${long.tailWidth?.toFixed(1)}px, end gap ${long.tailEndGap?.toFixed(1)}px`
  )
  check(
    'a long branch uses up to 70% of the bar and no more (STBR-06)',
    long.branchWidth <= long.barWidth * 0.7 + 0.5 && long.branchWidth > long.barWidth * 0.6,
    `${long.branchWidth.toFixed(1)}px of ${long.barWidth.toFixed(1)}px`
  )
  check(
    'the head and tail spans touch, so the name reads without a gap (STBR-06)',
    Math.abs(long.headTailGap) < 0.5,
    `${long.headTailGap.toFixed(1)}px between head and tail`
  )
  check(
    'before a fetch, only the local commit counts (STBR-09, 10)',
    long.sync === '↓0 ↑1',
    long.sync
  )

  // --- Fetch → ↓1 ↑1, both lists (STBR-09, 15, 16, 21, 22) ---
  let pop = await openSync(ws)
  check(
    'a never-fetched repo reads "never" in the popover (STBR-22)',
    pop.fetched === 'Last fetched: never',
    pop.fetched
  )
  await clickPopButton(ws, 'Fetch')
  pop = await waitOutcome(ws)
  const counts = await waitBar(ws, (b) => b.sync === '↓1 ↑1')
  check(
    'a commit pushed from another clone shows ↓1 ↑1 after Fetch (STBR-09, 21)',
    counts.sync === '↓1 ↑1' && pop.status === 'Done.',
    `${counts.sync}; popover "${pop.status}"`
  )
  pop = await waitFor(ws, POP, (p) => p.lists.every((l) => l.commits.length > 0))
  const [toPull, toPush] = pop.lists
  check(
    'the popover lists the commit to pull and the commit to push (STBR-15, 16)',
    toPull?.title === 'To pull' &&
      toPull.commits.map((c) => c.subject).join() === 'Remote fix for the login redirect' &&
      toPush?.title === 'To push' &&
      toPush.commits.map((c) => c.subject).join() === 'Local tweak to the login endpoint',
    JSON.stringify(pop.lists.map((l) => [l.title, l.commits.map((c) => c.subject)]))
  )
  await settle(ws)
  const layer = JSON.parse(await evaluate(ws, TOPMOST('.sync-pop')))
  check(
    'the sync popover is the topmost layer across its whole box, fully opaque',
    layer.covered === 0 && layer.opacity === '1',
    JSON.stringify(layer)
  )
  check(
    'the fetch age now reads a recent time (STBR-22)',
    pop.fetched !== 'Last fetched: never' && /^Last fetched: /.test(pop.fetched ?? ''),
    pop.fetched
  )

  // --- Diverged: Sync refuses with git's fatal line, HEAD unchanged (STBR-18) ---
  const headBefore = git(wtDir.long, 'rev-parse', 'HEAD')
  await clickPopButton(ws, 'Sync')
  pop = await waitOutcome(ws)
  const headAfter = git(wtDir.long, 'rev-parse', 'HEAD')
  check(
    "a diverged Sync shows git's fatal: line inline and keeps the popover open (STBR-18)",
    pop.open && pop.failed && /^fatal: /.test(pop.status ?? ''),
    pop.status ?? '(no status)'
  )
  check(
    'the diverged worktree HEAD is unchanged (STBR-18)',
    headBefore === headAfter,
    headAfter.slice(0, 10)
  )
  await closePopovers(ws)

  // --- Sync both ways on the sync branch (STBR-17, 25) ---
  await selectWorktree(ws, SYNC_BRANCH)
  await openSync(ws)
  await clickPopButton(ws, 'Fetch')
  await waitOutcome(ws)
  let b = await waitBar(ws, (v) => v.sync === '↓1 ↑0')
  check('the sync branch is one behind after Fetch', b.sync === '↓1 ↑0', b.sync)
  await clickPopButton(ws, 'Sync')
  pop = await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑0')
  check(
    'Sync pulls the incoming commit, counts back to ↓0 ↑0 (STBR-17, 25)',
    b.sync === '↓0 ↑0' &&
      pop.status === 'Done.' &&
      git(wtDir.sync, 'log', '-1', '--format=%s') === 'Remote change to sync down',
    `${b.sync}; ${pop.status}`
  )
  await closePopovers(ws)
  commit(wtDir.sync, 'up.txt', 'Local change to sync up')
  await refresh(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑1')
  check('a local commit shows ↓0 ↑1 after a refresh (STBR-11)', b.sync === '↓0 ↑1', b.sync)
  await openSync(ws)
  await clickPopButton(ws, 'Sync')
  pop = await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑0')
  const remoteTip = git(root, '--git-dir', originBare, 'rev-parse', `refs/heads/${SYNC_BRANCH}`)
  check(
    'Sync pushes the outgoing commit, counts back to ↓0 ↑0 and the bare remote has it (STBR-17)',
    b.sync === '↓0 ↑0' && remoteTip === git(wtDir.sync, 'rev-parse', 'HEAD'),
    `${b.sync}; remote ${remoteTip.slice(0, 10)}`
  )
  await closePopovers(ws)

  // --- Toast from an operation whose popover closed (STBR-26) ---
  const toast = await toastFromClosedPopover(ws)
  check(
    'an operation finishing after its popover closed reports in a toast (STBR-26)',
    toast !== null && /Fetch finished in sync/.test(toast.text),
    toast?.text ?? '(no toast)'
  )
  check(
    "the toast's bottom sits above the bar's top (STBR-26)",
    toast !== null && toast.bottom <= toast.barTop,
    toast ? `toast bottom ${toast.bottom.toFixed(1)} / bar top ${toast.barTop.toFixed(1)}` : ''
  )

  // --- A slow Push: buttons disabled and a loader while it runs (STBR-23) ---
  slowPushOn()
  commit(wtDir.sync, 'slow-1.txt', 'Slow push one')
  await refresh(ws)
  await waitBar(ws, (v) => v.sync === '↓0 ↑1')
  await openSync(ws)
  const pushStart = Date.now()
  await clickPopButton(ws, 'Push')
  pop = await waitFor(ws, POP, (p) => p.status === 'Pushing…', 3000)
  check(
    'while a Push runs every operation button is disabled and the loader shows (STBR-23)',
    pop.status === 'Pushing…' &&
      pop.buttons.length === 4 &&
      pop.buttons.every((x) => x.disabled) &&
      pop.loader === true,
    JSON.stringify({ status: pop.status, buttons: pop.buttons, loader: pop.loader })
  )
  pop = await waitOutcome(ws)
  const pushMs = Date.now() - pushStart
  check(
    'when the slow Push finishes the buttons re-enable and the loader goes (STBR-23)',
    pop.status === 'Done.' &&
      pop.buttons.length === 4 &&
      pop.buttons.every((x) => !x.disabled) &&
      pop.loader === false &&
      pushMs >= 3500 &&
      originTip(SYNC_BRANCH) === git(wtDir.sync, 'rev-parse', 'HEAD'),
    `${pop.status}; took ${pushMs} ms; ${JSON.stringify(pop.buttons.map((x) => x.disabled))}`
  )
  await closePopovers(ws)

  // --- Selection change during a slow Push: it continues, the bar follows, a toast reports (STBR-26) ---
  commit(wtDir.sync, 'slow-2.txt', 'Slow push two')
  await refresh(ws)
  await waitBar(ws, (v) => v.sync === '↓0 ↑1')
  await openSync(ws)
  await clickPopButton(ws, 'Push')
  await waitFor(ws, POP, (p) => p.status === 'Pushing…', 3000)
  await selectWorktree(ws, LONG_BRANCH)
  b = await bar(ws)
  pop = JSON.parse(await evaluate(ws, POP))
  const midPush = originTip(SYNC_BRANCH) !== git(wtDir.sync, 'rev-parse', 'HEAD')
  check(
    'selecting another worktree mid-Push: the bar follows it while the push is still running (STBR-26)',
    b.branchTitle === LONG_BRANCH && !pop.open && midPush,
    JSON.stringify({
      bar: b.branchTitle?.slice(-30),
      popoverOpen: pop.open,
      pushStillRunning: midPush
    })
  )
  const pushToast = await waitFor(
    ws,
    TOAST,
    (v) => v !== null && /^Push finished in sync/.test(v.text),
    10000
  )
  check(
    'the Push completes after the selection moved and reports in a toast (STBR-26)',
    pushToast !== null &&
      /^Push finished in sync/.test(pushToast.text) &&
      originTip(SYNC_BRANCH) === git(wtDir.sync, 'rev-parse', 'HEAD') &&
      (await bar(ws)).branchTitle === LONG_BRANCH,
    pushToast?.text ?? '(no toast)'
  )
  slowPushOff()
  await sleep(2400)

  // --- More than 20 incoming commits (STBR-16) ---
  await selectWorktree(ws, MANY_BRANCH)
  await openSync(ws)
  await clickPopButton(ws, 'Fetch')
  await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === `↓${MANY_COMMITS} ↑0`)
  pop = await waitFor(ws, POP, (p) => p.lists[0]?.commits.length > 0)
  const many = pop.lists[0]
  const expectedSubjects = Array.from(
    { length: 20 },
    (_, i) => `Remote batch commit ${MANY_COMMITS - i}`
  )
  check(
    `${MANY_COMMITS} incoming: 20 rows with hash, subject and relative age, then "+${MANY_COMMITS - 20} more" (STBR-16)`,
    b.sync === `↓${MANY_COMMITS} ↑0` &&
      many.title === 'To pull' &&
      many.commits.length === 20 &&
      many.commits.map((c) => c.subject).join('|') === expectedSubjects.join('|') &&
      many.commits.every((c) => /^[0-9a-f]{7,}$/.test(c.sha)) &&
      many.commits.every((c) => /^(just now|\d+[mhd] ago)$/.test(c.age)) &&
      many.more === `+${MANY_COMMITS - 20} more` &&
      pop.lists[1]?.more === null,
    `${b.sync}; ${many.commits.length} rows; first ${J(many.commits[0])}; tail "${many.more}"`
  )
  await closePopovers(ws)

  // --- Publish with two remotes (STBR-12, 19, 20) ---
  await selectWorktree(ws, PUBLISH_BRANCH)
  b = await waitBar(ws, (v) => v.sync === 'no upstream')
  check(
    'a branch without upstream reads "no upstream" as a button (STBR-12)',
    b.sync === 'no upstream' && b.syncTag === 'BUTTON',
    `${b.sync} <${b.syncTag}>`
  )
  pop = await openSync(ws)
  const publishBtn = (p) => p.buttons.find((x) => x.label === 'Publish')
  check(
    'with two remotes Publish is disabled until a remote is chosen (STBR-20)',
    pop.select?.value === '' &&
      pop.select.options.join() === ',backup,origin' &&
      publishBtn(pop)?.disabled === true,
    JSON.stringify({ select: pop.select, publish: publishBtn(pop) })
  )
  await evaluate(
    ws,
    `(() => {
       const s = document.querySelector('select.sync-pop-remote')
       Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'backup')
       s.dispatchEvent(new Event('change', { bubbles: true }))
       return true
     })()`
  )
  pop = await waitFor(ws, POP, (p) => publishBtn(p)?.disabled === false)
  check('choosing a remote enables Publish (STBR-20)', publishBtn(pop)?.disabled === false)
  await clickPopButton(ws, 'Publish')
  pop = await waitOutcome(ws)
  b = await waitBar(ws, (v) => v.sync === '↓0 ↑0')
  let upstream = ''
  try {
    upstream = git(wtDir.pub, 'rev-parse', '--abbrev-ref', '@{upstream}')
  } catch (err) {
    upstream = String(err.stderr ?? err.message).trim()
  }
  check(
    'Publish sets the upstream on the chosen remote and the bar shows counts (STBR-19, 20)',
    pop.status === 'Done.' && upstream === `backup/${PUBLISH_BRANCH}` && b.sync === '↓0 ↑0',
    `${pop.status}; upstream ${upstream}; bar ${b.sync}`
  )
  await closePopovers(ws)

  // --- The counter follows the git state, focus and a turn end (SCRF-01, 07, 09, 10) ---
  await counterRefresh()

  // --- The counter: five changed files, and 0 on a clean worktree (STBR-29, 31) ---
  await selectWorktree(ws, 'main')
  b = await bar(ws)
  check('the primary checkout counts five changed files (STBR-29)', b.changes === '5', b.changes)

  await selectWorktree(ws, PUBLISH_BRANCH)
  b = await bar(ws)
  check(
    'a clean worktree counts 0 (STBR-31)',
    b.changes === '0' && git(wtDir.pub, 'status', '--porcelain') === '',
    `counter ${b.changes}`
  )

  // --- Detached HEAD: its label, and no operation offered (STBR-08, 13) ---
  await selectWorktree(ws, detachedLabel)
  b = await waitBar(ws, (v) => v.sync === 'detached HEAD')
  check(
    'a detached worktree shows "(detached <short-sha>)", the sidebar label (STBR-08)',
    b.branchTitle === detachedLabel &&
      detachedLabel === `(detached ${git(wtDir.detached, 'rev-parse', 'HEAD').slice(0, 7)})` &&
      b.head + (b.tail ?? '') === detachedLabel,
    `${b.branchTitle}`
  )
  await evaluate(ws, `(document.querySelector('.status-bar-sync')?.click(), true)`)
  await sleep(400)
  pop = JSON.parse(await evaluate(ws, POP))
  check(
    'a detached worktree reads "detached HEAD" as plain text; clicking it opens no operations (STBR-13)',
    b.sync === 'detached HEAD' && b.syncTag === 'SPAN' && !pop.open,
    `${b.sync} <${b.syncTag}>; popover open ${pop.open}`
  )

  // --- A real git failure: git's line in the section, the rest keeps rendering (STBR-14) ---
  await selectWorktree(ws, GONE_BRANCH)
  b = await waitBar(ws, (v) => v.sync !== null && v.sync !== '…')
  check(
    "a failing rev-list shows git's fatal: line in the sync section; repo, branch and counter still render (STBR-14)",
    /^fatal: /.test(b.sync ?? '') &&
      b.syncTag === 'SPAN' &&
      b.syncClass?.includes('error') &&
      b.repo === 'acme-widget' &&
      b.branchTitle === GONE_BRANCH &&
      b.changes === '1',
    JSON.stringify({ sync: b.sync, tag: b.syncTag, repo: b.repo, changes: b.changes })
  )

  // --- A worktree whose folder was deleted (spec edge case) ---
  // Selecting away and straight back is the late-answer race: the slow read for
  // the other worktree must not replace the deleted one's instant answer.
  rmSync(wtDir.gone, { recursive: true, force: true })
  await refresh(ws)
  await selectWorktree(ws, LONG_BRANCH)
  await selectWorktree(ws, GONE_BRANCH)
  await sleep(4000)
  b = await bar(ws)
  check(
    'a deleted worktree folder reads as missing, with no counter and no operation, and stays so',
    b.branchTitle === GONE_BRANCH &&
      b.sync === 'The worktree folder no longer exists' &&
      b.syncTag === 'SPAN' &&
      b.changes === null,
    JSON.stringify({ branch: b.branchTitle === GONE_BRANCH, sync: b.sync, changes: b.changes })
  )

  // --- Agents: the session target wins over the tree selection (STBR-03) ---
  await selectWorktree(ws, LONG_BRANCH)
  await spawn(pathOf(SYNC_BRANCH), TARGET_TITLE)
  await spawn(loose, FOLDER_TITLE)
  const subfolder = join(pathOf(SYNC_BRANCH), 'src', 'main')
  mkdirSync(subfolder, { recursive: true })
  await spawn(subfolder, SUBFOLDER_TITLE)
  // A direct-IPC spawn pushes no event; stopping a throwaway session does, and
  // the renderer re-fetches the list (with the renamed titles) on it.
  const dummy = await spawn(loose, DUMMY_TITLE)
  await evaluate(
    ws,
    `(async () => { await window.api.invoke('sessions:stop', { id: ${J(dummy)} }); return true })()`
  )
  await sleep(800)
  const picked = await selectSession(ws, TARGET_TITLE)
  b = await waitBar(ws, (v) => v.branchTitle === SYNC_BRANCH)
  check(
    "Agents: the bar describes the selected session's worktree, not the tree selection (STBR-03)",
    picked && b.branchTitle === SYNC_BRANCH && b.repo === 'acme-widget',
    `${b.branchTitle}`
  )

  // --- Agents: a session outside every worktree (STBR-04) ---
  await selectSession(ws, FOLDER_TITLE)
  b = await waitBar(ws, (v) => v.folder !== null)
  check(
    'a session outside every worktree shows its path, no sync, no counter (STBR-04)',
    b.folder === loose &&
      b.folderTitle === loose &&
      b.note === 'not a worktree' &&
      b.sync === null &&
      b.changes === null,
    JSON.stringify({ folder: b.folder, note: b.note, sync: b.sync, changes: b.changes })
  )

  // --- Agents: a session in a folder inside a worktree describes that worktree (STBR-04) ---
  await selectSession(ws, SUBFOLDER_TITLE)
  b = await waitBar(ws, (v) => v.branchTitle === SYNC_BRANCH)
  check(
    'a session in a folder inside a worktree describes that worktree (STBR-04)',
    b.branchTitle === SYNC_BRANCH && b.folder === null && b.sync !== null,
    JSON.stringify({ branch: b.branchTitle, folder: b.folder, sync: b.sync })
  )

  // --- The four operations with an upstream, by label and in order (STBR-15) ---
  await selectWorktree(ws, SYNC_BRANCH)
  // Start from a screen with no toast, so any toast seen below is this block's.
  const toastBefore = await waitFor(ws, TOAST, (v) => v === null, 5000)
  pop = await openSync(ws)
  check(
    'with an upstream the popover offers exactly Sync, Pull, Push, Fetch, in that order (STBR-15)',
    pop.buttons.map((x) => x.label).join() === 'Sync,Pull,Push,Fetch',
    pop.buttons.map((x) => x.label).join()
  )

  // --- A successful operation with its popover open: inline, no toast; the tree refreshes (STBR-25) ---
  // The changed-file counter reads the tree snapshot, not the sync state: a new
  // untracked file shows there only once something refreshes the tree. Nothing
  // refreshes it on a timer, so the counter stays stale until the operation's
  // own refresh (`onRefreshTree`) lands; `loadState` alone cannot move it.
  writeFileSync(join(wtDir.sync, 'tree-refresh-probe.txt'), 'untracked\n')
  await sleep(1000)
  const staleChanges = (await bar(ws)).changes
  const porcelain = git(wtDir.sync, 'status', '--porcelain').split('\n').filter(Boolean).length
  await clickPopButton(ws, 'Fetch')
  pop = await waitOutcome(ws)
  // A toast would be raised at completion and live 2.2 s, so 2 s of sampling
  // right after `Done.` would see it.
  const toastsSeen = []
  for (const until = Date.now() + 2000; Date.now() < until; ) {
    const t = JSON.parse(await evaluate(ws, TOAST))
    if (t) toastsSeen.push(t.text)
    await sleep(100)
  }
  const popAfter = JSON.parse(await evaluate(ws, POP))
  check(
    'an operation that finishes with its popover open reports "Done." inline and raises no toast',
    toastBefore === null &&
      pop.status === 'Done.' &&
      popAfter.open &&
      popAfter.status === 'Done.' &&
      toastsSeen.length === 0,
    JSON.stringify({
      toastBefore,
      status: popAfter.status,
      toasts: [...new Set(toastsSeen)]
    })
  )
  b = await waitBar(ws, (v) => v.changes === '1', 3000)
  check(
    'a successful operation refreshes the tree: the tree-fed counter picks up a new file (STBR-25)',
    staleChanges === '0' && porcelain === 1 && b.changes === '1',
    `counter before ${staleChanges} (porcelain ${porcelain}), after the Fetch ${b.changes}`
  )

  // --- Dismissal: Escape closes the sync popover (edge case) ---
  const POPS = `JSON.stringify({ sync: Boolean(document.querySelector('.sync-pop')) })`
  // A synthetic keydown on the body reaches the popover's window listener and
  // nothing focused, so no terminal ever receives it.
  const escape = () =>
    evaluate(
      ws,
      `(document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true)`
    )
  let pops = JSON.parse(await evaluate(ws, POPS))
  const syncWasOpen = pops.sync
  await escape()
  pops = await waitFor(ws, POPS, (p) => !p.sync, 2000)
  check(
    'Escape closes the sync popover',
    syncWasOpen && !pops.sync,
    JSON.stringify({ before: syncWasOpen, after: pops })
  )
  await closePopovers(ws)
  rmSync(join(wtDir.sync, 'tree-refresh-probe.txt'), { force: true })
  await refresh(ws)

  // --- A repo with no remote: a plain-text reason, no operation (STBR-13) ---
  await selectWorktree(ws, GIZMO_BRANCH)
  b = await waitBar(ws, (v) => v.sync === 'no remote')
  await evaluate(ws, `(document.querySelector('.status-bar-sync')?.click(), true)`)
  await sleep(400)
  pop = JSON.parse(await evaluate(ws, POP))
  check(
    'a repo with no remote reads "no remote" as muted plain text; clicking it opens no operations (STBR-13)',
    b.repo === 'acme-gizmo' &&
      b.branchTitle === GIZMO_BRANCH &&
      b.sync === 'no remote' &&
      b.syncTag === 'SPAN' &&
      /\bmuted\b/.test(b.syncClass ?? '') &&
      !pop.open &&
      git(gizmo, 'remote') === '',
    `${b.repo} · ${b.sync} <${b.syncTag} class="${b.syncClass}">; popover open ${pop.open}`
  )

  await prChipSection(ws, pathOf, detachedLabel)

  // --- Screenshots, light and dark ---
  for (const theme of ['light', 'dark']) {
    await setTheme(ws, theme)
    await selectWorktree(ws, LONG_BRANCH)
    await shot(ws, `bar-long-branch-counts-${theme}.png`)
    await openSync(ws)
    await waitFor(ws, POP, (p) => p.lists.every((l) => l.commits.length > 0))
    await shot(ws, `sync-popover-${theme}.png`)
    await closePopovers(ws)
    await selectWorktree(ws, SYNC_BRANCH)
    const t = await toastFromClosedPopover(ws)
    if (t) await shot(ws, `toast-above-bar-${theme}.png`, { quick: true })
    else console.log(`      no toast appeared for the ${theme} screenshot`)
    await sleep(2400)
  }
}

// ---------------------------------------------------------------- pull request chip (F6)

/*
 * The PR chip (SPRL-01..19) is driven from stubbed answers: the renderer's own
 * `api` module (the one Vite serves the app) gets its `invoke` wrapped for the
 * six channels below, and only those. No answer is forwarded to main, so no
 * provider is ever asked and no browser page opens; every other channel goes
 * through untouched. The wrap is removed in a `finally`.
 */
const PR_CHANNELS = [
  'ado-pr:find',
  'ado-pr:get',
  'ado-pr:open',
  'github-pr:find',
  'github-pr:get',
  'github-pr:open'
]

const ADO_T = { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
const GH_T = { provider: 'github', owner: 'contoso', repo: 'widget' }
const prSummary = (target, id, extra = {}) => ({
  target,
  id,
  title: `Fix login redirect ${id}`,
  targetBranch: 'main',
  isDraft: false,
  ...extra
})
const reviewer = (name, state) => ({ name, state, isGroup: false, isRequired: false })
const prDetail = (summary, reviewers) => ({
  ...summary,
  status: 'active',
  author: 'Ana',
  description: 'Stubbed by the status bar smoke.',
  createdAt: Date.now() - 3600_000,
  sourceBranch: 'user/dev/4821-fix-login',
  reviewers,
  revision: '1',
  files: [],
  threads: [],
  ...(summary.target.provider === 'github'
    ? {
        github: {
          headSha: 'a'.repeat(40),
          baseSha: 'b'.repeat(40),
          headRepo: { owner: 'contoso', repo: 'widget' },
          filesIncomplete: false
        },
        timeline: []
      }
    : { ado: { iteration: 1 } })
})
const found = (...prs) => ({ kind: 'found', prs })
const NO_PR = { kind: 'none', createUrlAvailable: false }

const STUB_INSTALL = `(async () => {
  if (window.__prStub) return 'already'
  const m = await import('/src/lib/api.ts')
  const channels = ${J(PR_CHANNELS)}
  const orig = m.api.invoke
  const stub = { module: m, orig, calls: [], answers: {}, gates: {} }
  m.api.invoke = async function (channel, ...args) {
    if (!channels.includes(channel)) return orig.call(this, channel, ...args)
    const req = args[0] ?? {}
    stub.calls.push({ channel, worktreePath: req.worktreePath ?? null, id: req.pr?.id ?? null, create: req.create === true })
    if (channel.endsWith(':open')) return { ok: true }
    const gate = stub.gates[req.worktreePath]
    if (gate) await gate.promise
    const key = req.pr ? channel + '|' + req.worktreePath + '|' + req.pr.id : channel + '|' + req.worktreePath
    const answer = stub.answers[key] ?? (channel.endsWith(':find') ? { kind: 'no-remote' } : { kind: 'error', message: 'no stubbed answer' })
    return JSON.parse(JSON.stringify(answer))
  }
  window.__prStub = stub
  return 'installed'
})()`

const STUB_REMOVE = `(() => {
  const stub = window.__prStub
  if (!stub) return 'absent'
  for (const gate of Object.values(stub.gates)) gate.release()
  stub.module.api.invoke = stub.orig
  delete window.__prStub
  return 'removed'
})()`

/** Answers for one worktree: each provider's search, and each found PR's detail (or a failure). */
async function stubAnswers(ws, worktreePath, { ado = NO_PR, github = NO_PR, gets = [] }) {
  const answers = {
    [`ado-pr:find|${worktreePath}`]: ado,
    [`github-pr:find|${worktreePath}`]: github
  }
  for (const [summary, result] of gets) {
    const channel = summary.target.provider === 'github' ? 'github-pr:get' : 'ado-pr:get'
    answers[`${channel}|${worktreePath}|${summary.id}`] = result
  }
  await evaluate(ws, `(Object.assign(window.__prStub.answers, ${J(answers)}), true)`)
}

const ok = (summary, reviewers) => ({ kind: 'ok', detail: prDetail(summary, reviewers) })

/** Hold every stubbed answer for a worktree until `releaseGate`. */
const holdGate = (ws, wt) =>
  evaluate(
    ws,
    `(() => { let release; const promise = new Promise((r) => { release = r }); window.__prStub.gates[${J(wt)}] = { promise, release }; return true })()`
  )
const releaseGate = (ws, wt) =>
  evaluate(
    ws,
    `(() => { const g = window.__prStub.gates[${J(wt)}]; delete window.__prStub.gates[${J(wt)}]; g?.release(); return true })()`
  )

const stubCalls = async (ws) =>
  JSON.parse(await evaluate(ws, `JSON.stringify(window.__prStub.calls)`))
const clearCalls = (ws) => evaluate(ws, `(window.__prStub.calls.length = 0, true)`)
const count = (calls, channel) => calls.filter((c) => c.channel === channel).length

/** Everything the checks read off the PR chip, as JSON. */
const CHIP = `(() => {
  const bar = document.querySelector('footer.status-bar[role="status"]')
  const el = bar?.querySelector('.status-bar-pr')
  const mark = el?.querySelector('.status-bar-pr-mark')
  const menu = bar?.querySelector('.status-bar-pr-menu')
  const text = (n, s) => n?.querySelector(s)?.textContent ?? null
  return JSON.stringify({
    present: Boolean(el),
    tag: el?.tagName ?? null,
    text: el?.textContent ?? null,
    title: el?.getAttribute('title') ?? null,
    muted: el ? el.classList.contains('muted') : null,
    mark: mark?.textContent ?? null,
    markLabel: mark?.getAttribute('aria-label') ?? null,
    browse: Boolean(bar?.querySelector('.status-bar-pr-group .status-bar-pr-browse')),
    menu: menu
      ? {
          items: [...menu.querySelectorAll('.status-bar-pr-item')].map((i) => ({
            number: text(i, '.status-bar-pr-number'),
            title: text(i, '.status-bar-pr-title'),
            target: text(i, '.status-bar-pr-target'),
            provider: text(i, '.status-bar-pr-provider'),
            mark: text(i, '.status-bar-pr-mark'),
            markLabel: i.querySelector('.status-bar-pr-mark')?.getAttribute('aria-label') ?? null
          })),
          notes: [...menu.querySelectorAll('.status-bar-pr-note')].map((n) => n.textContent)
        }
      : null,
    branch: bar?.querySelector('.status-bar-branch')?.getAttribute('title') ?? null,
    barHeight: bar ? bar.getBoundingClientRect().height : null,
    barOverflow: bar ? bar.scrollWidth - bar.clientWidth : null,
    chipRight: el ? el.getBoundingClientRect().right : null,
    barRight: bar ? bar.getBoundingClientRect().right : null,
    chipTop: el ? el.getBoundingClientRect().top : null,
    barTop: bar ? bar.getBoundingClientRect().top : null
  })
})()`

const chip = async (ws) => JSON.parse(await evaluate(ws, CHIP))
const waitChip = (ws, ok, timeoutMs = 5000) => waitFor(ws, CHIP, ok, timeoutMs)

/** What the Files direction shows after an in-app open (SPRL-10, 13). */
const FILES_PR = `(() => JSON.stringify({
  direction: document.querySelector('.topbar-segment.active')?.textContent?.trim() ?? null,
  mode: document.querySelector('.file-tree-mode.active')?.textContent ?? null,
  title: document.querySelector('.pr-overview-title')?.textContent ?? null
}))()`

const clickIn = (ws, selector, index = 0) =>
  evaluate(
    ws,
    `(() => { const el = document.querySelectorAll(${J(selector)})[${index}]; el?.click(); return Boolean(el) })()`
  )

async function prChipSection(ws, pathOf, detachedLabel) {
  const one = pathOf(SYNC_BRANCH)
  const many = pathOf(LONG_BRANCH)
  const create = pathOf(PUBLISH_BRANCH)
  const none = pathOf(MANY_BRANCH)
  const plain = pathOf('main')

  const installed = await evaluate(ws, STUB_INSTALL)
  try {
    // The stub must be live before any check means anything.
    const ado7 = prSummary(ADO_T, 7, { isDraft: true })
    await stubAnswers(ws, one, {
      ado: found(ado7),
      gets: [[ado7, ok(ado7, [reviewer('Ana', 'approved'), reviewer('Bruno', 'rejected')])]]
    })
    await selectWorktree(ws, SYNC_BRANCH)
    let c = await waitChip(ws, (v) => v.mark !== null)
    const calls = await stubCalls(ws)
    check(
      'the stub answers the bar: a stubbed find reaches the chip, and main is never asked',
      installed === 'installed' && c.present && calls.some((x) => x.channel === 'ado-pr:find'),
      `${installed}; ${calls.length} stubbed calls; chip "${c.text}"`
    )

    // --- One PR: number, draft, the worst mark, every reviewer (SPRL-01, 03, 04, 08) ---
    check(
      'selecting a worktree searches both providers and reads the PR it found (SPRL-01)',
      count(calls, 'ado-pr:find') >= 1 &&
        count(calls, 'github-pr:find') >= 1 &&
        calls.some((x) => x.channel === 'ado-pr:get' && x.id === 7),
      calls.map((x) => `${x.channel}${x.id ? ` ${x.id}` : ''}`).join(', ')
    )
    check(
      'one PR reads "PR #7 · Draft" and a rejection marks it ✕, labelled for screen readers (SPRL-03, 04)',
      c.text?.startsWith('PR #7 · Draft') &&
        c.mark === '✕' &&
        c.markLabel === 'Rejected' &&
        c.browse,
      `"${c.text}" mark ${c.mark} "${c.markLabel}"`
    )
    check(
      'the tooltip lists every reviewer with their state (SPRL-08)',
      c.title?.includes('Ana: Approved') && c.title?.includes('Bruno: Rejected'),
      J(c.title)
    )

    // --- Refresh repeats the lookup, and each mark follows the reviews (SPRL-02, 05, 06, 07) ---
    const marks = [
      [[reviewer('Ana', 'approved'), reviewer('Bruno', 'waiting-for-author')], '⏸', 'SPRL-05'],
      [
        [reviewer('Ana', 'approved-with-suggestions'), reviewer('Bruno', 'no-vote')],
        '✓',
        'SPRL-06'
      ],
      [[reviewer('Ana', 'no-vote'), reviewer('Platform Team', 'no-vote')], null, 'SPRL-07']
    ]
    for (const [reviewers, expected, req] of marks) {
      await stubAnswers(ws, one, { ado: found(ado7), gets: [[ado7, ok(ado7, reviewers)]] })
      await clearCalls(ws)
      await refresh(ws)
      c = await waitChip(ws, (v) => v.mark === expected)
      const after = await stubCalls(ws)
      check(
        `Refresh searches again and the chip marks ${expected ?? 'nothing'} for ${reviewers.map((r) => r.state).join(' + ')} (SPRL-02, ${req})`,
        c.mark === expected &&
          count(after, 'ado-pr:find') === 1 &&
          count(after, 'github-pr:find') === 1,
        `mark ${c.mark}; finds ${count(after, 'ado-pr:find')}+${count(after, 'github-pr:find')}`
      )
    }

    // --- Focus: a second focus inside 5 s asks nothing (SPRL-02) ---
    await sleep(5200)
    await clearCalls(ws)
    await fireFocus(ws)
    await sleep(600)
    await fireFocus(ws)
    await sleep(600)
    const focused = await stubCalls(ws)
    check(
      'a focus searches again; another focus inside 5 s does not (SPRL-02)',
      count(focused, 'ado-pr:find') === 1 && count(focused, 'github-pr:find') === 1,
      `finds ${count(focused, 'ado-pr:find')}+${count(focused, 'github-pr:find')}`
    )

    // --- A PR whose reviewers could not be read (edge case) ---
    await stubAnswers(ws, one, {
      ado: found(ado7),
      gets: [[ado7, { kind: 'error', message: 'HTTP 500' }]]
    })
    await refresh(ws)
    c = await waitChip(ws, (v) => v.title?.includes('could not be read'))
    check(
      'a PR whose reviewers could not be read shows number and draft, no mark, and says why (edge case)',
      c.text?.startsWith('PR #7 · Draft') &&
        c.mark === null &&
        c.title?.includes('The reviewers could not be read: HTTP 500'),
      `"${c.text}" — ${J(c.title)}`
    )

    // --- ↗ opens the browser through main; the chip opens the Pull request mode (SPRL-10, 11) ---
    await stubAnswers(ws, one, {
      ado: found(ado7),
      gets: [[ado7, ok(ado7, [reviewer('Ana', 'approved')])]]
    })
    await refresh(ws)
    await waitChip(ws, (v) => v.mark === '✓')
    await clearCalls(ws)
    await clickIn(ws, '.status-bar-pr-group .status-bar-pr-browse')
    await sleep(300)
    let opened = await stubCalls(ws)
    check(
      "↗ asks main to open that PR's page, naming the PR and nothing else (SPRL-11)",
      opened.length === 1 &&
        opened[0].channel === 'ado-pr:open' &&
        opened[0].id === 7 &&
        !opened[0].create,
      J(opened)
    )
    await clearCalls(ws)
    await clickIn(ws, '.status-bar-pr-group .status-bar-pr')
    let files = await waitFor(ws, FILES_PR, (v) => v.title?.includes('Fix login redirect 7'))
    const entering = await stubCalls(ws)
    check(
      'the chip opens the Files direction in Pull request mode on that PR (SPRL-10)',
      files.direction === 'Files' &&
        files.mode === 'Pull request' &&
        files.title?.includes('Fix login redirect 7'),
      J(files)
    )
    check(
      'entering the mode from the chip searches once per provider (one lookup serves both)',
      count(entering, 'ado-pr:find') === 1 && count(entering, 'github-pr:find') === 1,
      `finds ${count(entering, 'ado-pr:find')}+${count(entering, 'github-pr:find')}`
    )
    c = await chip(ws)
    check(
      'the bar keeps the chip in the Files direction (SPRL-01)',
      c.text?.startsWith('PR #7'),
      c.text
    )

    // --- Several PRs: a menu, a provider note, Escape and outside click (SPRL-12..14, 19) ---
    const gh12 = prSummary(GH_T, 12)
    const gh13 = prSummary(GH_T, 13, { targetBranch: 'release/2.0', isDraft: true })
    await stubAnswers(ws, many, {
      ado: { kind: 'auth' },
      github: found(gh12, gh13),
      gets: [
        [gh12, ok(gh12, [reviewer('octo-a', 'changes-requested')])],
        [gh13, ok(gh13, [reviewer('octo-b', 'approved')])]
      ]
    })
    await selectWorktree(ws, LONG_BRANCH)
    c = await waitChip(ws, (v) => v.text === '2 PRs')
    check('two PRs read "2 PRs" (SPRL-12)', c.text === '2 PRs' && !c.muted, c.text)
    await send(ws, 'Emulation.setDeviceMetricsOverride', {
      width: 1100,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    })
    await sleep(300)
    const narrow = await chip(ws)
    await send(ws, 'Emulation.clearDeviceMetricsOverride')
    await sleep(300)
    check(
      'at 1100 px the bar holds the long branch and the "2 PRs" chip on one line, chip inside the bar (T7)',
      narrow.barOverflow <= 1 &&
        narrow.chipRight <= narrow.barRight + 0.5 &&
        narrow.chipTop >= narrow.barTop &&
        Math.round(narrow.barHeight) === 26,
      `overflow ${narrow.barOverflow}px, chip right ${narrow.chipRight?.toFixed(1)} of ${narrow.barRight?.toFixed(1)}, bar ${narrow.barHeight}px`
    )
    await clickIn(ws, 'footer.status-bar button.status-bar-pr')
    c = await waitChip(ws, (v) => v.menu !== null && v.menu.items.every((i) => i.mark !== null))
    check(
      'the menu lists each PR: number, title, target branch, provider, mark (SPRL-12)',
      J(c.menu?.items.map((i) => [i.number, i.title, i.target, i.provider, i.mark])) ===
        J([
          ['#12', 'Fix login redirect 12', '→ main', 'GitHub', '⏸'],
          ['#13', 'Fix login redirect 13', '→ release/2.0', 'GitHub', '✓']
        ]),
      J(c.menu?.items)
    )
    check(
      "the other provider's failure is only a note at the foot of the menu (SPRL-19)",
      J(c.menu?.notes) === J(['Azure DevOps sign-in failed — run az login']),
      J(c.menu?.notes)
    )
    await evaluate(
      ws,
      `(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), true)`
    )
    c = await waitChip(ws, (v) => v.menu === null, 2000)
    check('Escape closes the menu (SPRL-14)', c.menu === null)
    await clickIn(ws, 'footer.status-bar button.status-bar-pr')
    await waitChip(ws, (v) => v.menu !== null)
    await clickIn(ws, '.status-bar-repo')
    c = await waitChip(ws, (v) => v.menu === null, 2000)
    check('a click outside closes the menu (SPRL-14)', c.menu === null)
    await clickIn(ws, 'footer.status-bar button.status-bar-pr')
    await waitChip(ws, (v) => v.menu !== null)
    await clearCalls(ws)
    await clickIn(ws, '.status-bar-pr-item .status-bar-pr-browse', 1)
    await sleep(300)
    opened = await stubCalls(ws)
    check(
      "a menu item's ↗ opens that PR's page through main (SPRL-13)",
      opened.length === 1 && opened[0].channel === 'github-pr:open' && opened[0].id === 13,
      J(opened)
    )
    await waitChip(ws, (v) => v.menu !== null)
    await clickIn(ws, '.status-bar-pr-item .status-bar-pr-open', 1)
    files = await waitFor(ws, FILES_PR, (v) => v.title?.includes('Fix login redirect 13'))
    check(
      'a menu item opens that PR in the Pull request mode (SPRL-13)',
      files.direction === 'Files' &&
        files.mode === 'Pull request' &&
        files.title?.includes('Fix login redirect 13'),
      J(files)
    )

    // --- No PR: Create PR when a provider offers it, else nothing (SPRL-15, 16) ---
    await stubAnswers(ws, create, { github: { kind: 'none', createUrlAvailable: true } })
    await selectWorktree(ws, PUBLISH_BRANCH)
    c = await waitChip(ws, (v) => v.text === 'Create PR')
    check(
      'no PR with creation available shows a muted "Create PR" (SPRL-15)',
      c.text === 'Create PR' && c.muted && c.tag === 'BUTTON',
      `${c.text} muted ${c.muted}`
    )
    await clearCalls(ws)
    await clickIn(ws, 'footer.status-bar button.status-bar-pr')
    await sleep(300)
    opened = await stubCalls(ws)
    check(
      'Create PR asks main to open the creation page on that provider (SPRL-15)',
      opened.length === 1 && opened[0].channel === 'github-pr:open' && opened[0].create,
      J(opened)
    )
    await stubAnswers(ws, none, {})
    await selectWorktree(ws, MANY_BRANCH)
    c = await waitChip(ws, (v) => !v.present, 3000)
    await sleep(800)
    c = await chip(ws)
    check('no PR and no creation available shows no chip (SPRL-16)', !c.present, c.text ?? 'none')

    // --- No recognised remote, detached HEAD: nothing (SPRL-18) ---
    // `main` has no stubbed answer yet: both providers say no remote.
    await selectWorktree(ws, 'main')
    await sleep(800)
    c = await chip(ws)
    check(
      'no recognised remote shows no chip (SPRL-18)',
      !c.present && plain !== undefined,
      c.text ?? 'none'
    )
    // --- No answer: PR ? with the reason (SPRL-17) ---
    // On `main`, not the gone worktree: another section deletes that folder,
    // and the chip rightly shows nothing for a missing folder.
    await stubAnswers(ws, plain, { github: { kind: 'error', message: 'socket hang up' } })
    await refresh(ws)
    c = await waitChip(ws, (v) => v.text === 'PR ?')
    check(
      'a failed provider with no PR found shows a muted "PR ?" whose tooltip is the reason (SPRL-17)',
      c.text === 'PR ?' && c.muted && c.title === 'GitHub: socket hang up',
      `${c.text} — ${J(c.title)}`
    )
    await stubAnswers(ws, plain, {
      github: { kind: 'rate-limited', resetAt: Date.now() + 600_000 }
    })
    await refresh(ws)
    c = await waitChip(ws, (v) => v.title?.includes('refuses requests until'))
    check(
      'a rate-limited provider shows "PR ?" saying until when (SPRL-17)',
      c.text === 'PR ?' && c.title?.startsWith('GitHub refuses requests until'),
      J(c.title)
    )

    const detached = pathOf(detachedLabel)
    await stubAnswers(ws, detached, { ado: { kind: 'detached' }, github: { kind: 'detached' } })
    await selectWorktree(ws, detachedLabel)
    await sleep(800)
    c = await chip(ws)
    check('a detached HEAD shows no chip (SPRL-18)', !c.present, c.text ?? 'none')

    // --- A late answer for another worktree is cached for it, never painted (edge case, SPRL-09) ---
    const gh99 = prSummary(GH_T, 99)
    await stubAnswers(ws, none, {
      github: found(gh99),
      gets: [[gh99, ok(gh99, [reviewer('octo-a', 'approved')])]]
    })
    await holdGate(ws, none)
    await selectWorktree(ws, MANY_BRANCH)
    await selectWorktree(ws, PUBLISH_BRANCH)
    await waitChip(ws, (v) => v.text === 'Create PR')
    await releaseGate(ws, none)
    await sleep(1000)
    c = await chip(ws)
    check(
      "a late answer for a worktree no longer selected does not paint the new one's chip (edge case)",
      c.text === 'Create PR' && c.branch === PUBLISH_BRANCH,
      `${c.branch?.slice(-20)}: ${c.text}`
    )
    await holdGate(ws, none)
    await selectWorktree(ws, MANY_BRANCH)
    c = await waitChip(ws, (v) => v.text?.startsWith('PR #99'), 2000)
    check(
      'that answer was cached for its worktree: selecting it shows the PR while the next lookup runs (SPRL-09)',
      c.text?.startsWith('PR #99') && c.mark === '✓',
      c.text ?? 'none'
    )
    await releaseGate(ws, none)

    // --- Screenshots of the chip and the menu, light and dark ---
    for (const theme of ['light', 'dark']) {
      await setTheme(ws, theme)
      await selectWorktree(ws, SYNC_BRANCH)
      await waitChip(ws, (v) => v.mark !== null)
      await shot(ws, `pr-chip-one-${theme}.png`)
      await selectWorktree(ws, LONG_BRANCH)
      await waitChip(ws, (v) => v.text === '2 PRs')
      await clickIn(ws, 'footer.status-bar button.status-bar-pr')
      await waitChip(ws, (v) => v.menu !== null)
      await shot(ws, `pr-chip-menu-${theme}.png`)
      await clickIn(ws, '.status-bar-repo')
    }
  } finally {
    const removed = await evaluate(ws, STUB_REMOVE).catch((err) => String(err))
    check('the PR stub is removed', removed === 'removed', removed)
  }
}

/**
 * Changed files in the SCRF worktree right now, as git sees them. Plain
 * `status` rewrites the index (T1), which would trigger the very watcher
 * these checks observe.
 */
const scrfChanges = () =>
  git(wtDir.scrf, '--no-optional-locks', 'status', '--porcelain').split('\n').filter(Boolean).length

/** A window focus as Chromium delivers it: blur first, then focus. */
const fireFocus = (ws) =>
  evaluate(
    ws,
    `(window.dispatchEvent(new Event('blur')), window.dispatchEvent(new Event('focus')), true)`
  )

/**
 * A fake `claude` for the turn-end check: its name makes the app hand it the
 * hook token (only `claude` publishes hooks), and it writes that token and the
 * `--settings` path it was given next to itself, then idles. No real agent
 * runs and no input is ever sent to the session.
 */
function writeFakeClaude() {
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fakeBin, 'claude.cmd'),
    [
      '@echo off',
      '>"%~dp0settings.txt" echo %~2',
      '>"%~dp0token.txt" echo %PLAYGROUND_ACTIVITY_TOKEN%',
      ':idle',
      'ping -n 3600 127.0.0.1 >nul',
      'goto idle',
      ''
    ].join('\r\n')
  )
}

/** Wait for a file the fake agent writes, and return its trimmed content. */
async function readWhenWritten(path, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const text = readFileSync(path, 'utf8').trim()
      if (text !== '') return text
    } catch {
      /* not written yet */
    }
    await sleep(150)
  }
  return null
}

async function postHook(url, token, event) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ hook_event_name: event })
  })
  return res.status
}

async function counterRefresh() {
  // A worktree of its own, so no earlier check's state leaks in.
  git(primary, 'worktree', 'add', '-q', '-b', SCRF_BRANCH, wtDir.scrf, 'main')
  for (const f of ['one.txt', 'two.txt', 'three.txt']) writeFileSync(join(wtDir.scrf, f), `${f}\n`)
  await refresh(ws)
  await selectWorktree(ws, SCRF_BRANCH)
  let b = await waitBar(ws, (v) => v.changes === '3')
  check('the counter worktree starts with three untracked files', b.changes === '3', b.changes)
  // The watcher opens once tree:get has returned; give its git-dir lookup a beat.
  await sleep(500)

  // SCRF-01: a commit made outside the app, with no click.
  const committedAt = Date.now()
  gitRetryingLock(wtDir.scrf, 'add', 'one.txt', 'two.txt')
  gitRetryingLock(wtDir.scrf, 'commit', '-q', '-m', 'Commit two of three')
  b = await waitBar(ws, (v) => v.changes === '1', 4000)
  const took = Date.now() - committedAt
  check(
    'a commit made in a terminal drops the counter within 2 s, with no click (SCRF-01)',
    b.changes === '1' && took <= 2000 && scrfChanges() === 1,
    `${b.changes} after ${took} ms; git sees ${scrfChanges()}`
  )

  // Edits alone reach nothing: no timer, no watch on the working tree.
  for (const f of ['four.txt', 'five.txt']) writeFileSync(join(wtDir.scrf, f), `${f}\n`)
  await sleep(1500)
  b = await bar(ws)
  check(
    'edits with no commit, focus or turn end leave the counter as it was',
    b.changes === '1' && scrfChanges() === 3,
    `${b.changes}; git sees ${scrfChanges()}`
  )

  // SCRF-09: a focus past the 5 s debounce rebuilds the tree. The count must
  // not already read 3 before the focus, or the focus proved nothing.
  await sleep(5500)
  const beforeFocus = (await bar(ws)).changes
  await fireFocus(ws)
  b = await waitBar(ws, (v) => v.changes === '3', 4000)
  check(
    'regaining focus rebuilds the tree and shows the edits (SCRF-09)',
    beforeFocus !== '3' && b.changes === '3',
    `${beforeFocus} → ${b.changes}`
  )

  // SCRF-10: a second focus inside the debounce rebuilds nothing.
  writeFileSync(join(wtDir.scrf, 'six.txt'), 'six\n')
  await fireFocus(ws)
  await sleep(1500)
  b = await bar(ws)
  check(
    'a second focus within 5 s rebuilds nothing (SCRF-10)',
    b.changes === '3' && scrfChanges() === 4,
    `${b.changes}; git sees ${scrfChanges()}`
  )

  // SCRF-07: an agent's turn ending in the worktree recounts it.
  writeFakeClaude()
  await evaluate(
    ws,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       const agents = cfg.agents.filter((a) => a.name !== ${J(FAKE_AGENT)})
       await window.api.invoke('config:patch', {
         agents: [...agents, { name: ${J(FAKE_AGENT)}, command: ${J(join(fakeBin, 'claude.cmd'))}, args: [], color: '--accent' }]
       })
       return true
     })()`
  )
  fakeAgentRegistered = true
  const agentId = await evaluate(
    ws,
    `(async () => {
       const v = await window.api.invoke('sessions:spawn', { agentName: ${J(FAKE_AGENT)}, cwd: ${J(wtDir.scrf)} })
       await window.api.invoke('sessions:rename', { id: v.id, title: ${J(TURN_TITLE)} })
       return v.id
     })()`
  )
  mine.push(agentId)
  // A direct-IPC spawn pushes nothing; a session that exits at once makes the
  // renderer re-fetch the list, so the fake session's pushes are not dropped.
  const nudge = await spawn(loose, DUMMY_TITLE)
  await evaluate(
    ws,
    `(async () => { await window.api.invoke('sessions:stop', { id: ${J(nudge)} }); return true })()`
  )
  const token = await readWhenWritten(join(fakeBin, 'token.txt'))
  const settingsPath = await readWhenWritten(join(fakeBin, 'settings.txt'))
  let url = null
  try {
    url = JSON.parse(readFileSync(settingsPath, 'utf8')).hooks?.Stop?.[0]?.hooks?.[0]?.url ?? null
  } catch {
    /* reported below */
  }
  check(
    'the fake agent received a hook token and the hook settings',
    Boolean(token) && token !== '%PLAYGROUND_ACTIVITY_TOKEN%' && Boolean(url),
    `token ${token ? 'yes' : 'no'}; url ${url ?? settingsPath}`
  )
  if (!token || !url) return
  await sleep(800)
  const working = await postHook(url, token, 'UserPromptSubmit')
  writeFileSync(join(wtDir.scrf, 'seven.txt'), 'seven\n')
  await sleep(1500)
  b = await bar(ws)
  check(
    'a turn in progress leaves the counter as it was',
    working === 204 && b.changes === '3' && scrfChanges() === 5,
    `POST ${working}; ${b.changes}; git sees ${scrfChanges()}`
  )
  const beforeStop = b.changes
  const stopped = await postHook(url, token, 'Stop')
  b = await waitBar(ws, (v) => v.changes === '5', 4000)
  check(
    "the agent's turn ending recounts its worktree (SCRF-07)",
    stopped === 204 && beforeStop !== '5' && b.changes === '5',
    `POST ${stopped}; ${beforeStop} → ${b.changes}`
  )
}

/** Stop and remove this script's sessions through the rail (so the renderer drops them). */
async function removeMySessions() {
  if (mine.length === 0) return
  await evaluate(
    ws,
    `(async () => {
       for (const id of ${J(mine)}) { try { await window.api.invoke('sessions:stop', { id }) } catch {} }
       return true
     })()`
  )
  await sleep(800)
  await direction(ws, 'Agents')
  for (const title of [TARGET_TITLE, FOLDER_TITLE, SUBFOLDER_TITLE, DUMMY_TITLE, TURN_TITLE]) {
    await evaluate(
      ws,
      `(() => {
         const row = [...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').startsWith(${J(title)}))
         row?.querySelector('.rail-row-btn.red')?.click()
         return true
       })()`
    )
    await sleep(400)
  }
  // Belt and braces: anything the rail did not remove goes by IPC.
  await evaluate(
    ws,
    `(async () => {
       const ids = new Set(${J(mine)})
       for (const s of await window.api.invoke('sessions:list')) if (ids.has(s.id)) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
       return true
     })()`
  )
}

try {
  await main()
} catch (err) {
  check(
    'the script ran to completion',
    false,
    err.stack?.split('\n').slice(0, 2).join(' ') ?? String(err)
  )
} finally {
  try {
    await send(ws, 'Emulation.clearDeviceMetricsOverride').catch(() => {})
    await closePopovers(ws)
    await removeMySessions()
    if (fakeAgentRegistered) {
      const left = await evaluate(
        ws,
        `(async () => {
           const cfg = await window.api.invoke('config:get')
           await window.api.invoke('config:patch', { agents: cfg.agents.filter((a) => a.name !== ${J(FAKE_AGENT)}) })
           return (await window.api.invoke('config:get')).agents.some((a) => a.name === ${J(FAKE_AGENT)})
         })()`
      )
      check('the throwaway fake-claude agent is removed', left === false)
    }
    if (registered) {
      await evaluate(
        ws,
        `(async () => { await window.api.invoke('config:patch', { workspaces: ${J(owner.workspaces)} }); return true })()`
      )
      await refresh(ws)
    }

    // --- Empty state in every direction, nothing selected (STBR-05) ---
    // Holds only when the owner had no tree selection; the Agents session
    // selection was dropped when this script's selected session was removed.
    if (ownerTreeSelection === null) {
      for (const dir of ['Tree', 'Board', 'Agents', 'Workflows']) {
        await direction(ws, dir)
        const b = await waitBar(ws, (v) => v.empty !== null, 3000)
        check(
          `${dir}: with nothing selected the bar stays mounted and neutral (STBR-05)`,
          b.present && b.empty === 'No worktree selected',
          b.empty ?? JSON.stringify(b)
        )
      }
    } else {
      console.log('SKIP  empty-state checks — the owner had a tree selection to restore')
    }

    // --- Restore the owner's selection, direction and theme ---
    if (ownerTreeSelection) {
      await direction(ws, 'Tree')
      await evaluate(
        ws,
        `(() => {
           const s = ${J(ownerTreeSelection)}
           const wsEl = [...document.querySelectorAll('.sidebar-workspace')].find((w) => w.querySelector('.sidebar-workspace-name')?.textContent === s.workspace)
           const repo = [...(wsEl?.querySelectorAll('.sidebar-repo') ?? [])].find((r) => r.querySelector('.sidebar-repo-name')?.textContent === s.repo)
           const row = [...(repo?.querySelectorAll('.sidebar-worktree') ?? [])].find((r) => r.querySelector('.sidebar-worktree-branch')?.textContent === s.branch)
           row?.click()
           return Boolean(row)
         })()`
      )
    }
    if (owner.rail) await selectSession(ws, owner.rail, owner.railIndex)
    await setTheme(ws, owner.ui.theme)
    await direction(ws, owner.ui.direction[0].toUpperCase() + owner.ui.direction.slice(1))
    await evaluate(
      ws,
      `(async () => { await window.api.invoke('config:patch', { ui: ${J(owner.ui)} }); return true })()`
    )

    const after = JSON.parse(
      await evaluate(
        ws,
        `(async () => {
           const cfg = await window.api.invoke('config:get')
           const ids = new Set(${J(mine)})
           return JSON.stringify({
             ui: cfg.ui,
             workspaces: cfg.workspaces,
             leftover: (await window.api.invoke('sessions:list')).filter((s) => ids.has(s.id)).length,
             rail: document.querySelector('.rail-row.selected')?.title ?? null,
             theme: document.documentElement.dataset.theme
           })
         })()`
      )
    )
    check(
      "the owner's direction, theme, workspaces and Agents selection are restored; no smoke session left",
      after.ui.direction === owner.ui.direction &&
        after.ui.theme === owner.ui.theme &&
        after.theme === owner.ui.theme &&
        J(after.workspaces) === J(owner.workspaces) &&
        after.leftover === 0 &&
        (owner.rail === null || after.rail === owner.rail),
      JSON.stringify({
        direction: after.ui.direction,
        theme: after.ui.theme,
        workspaces: after.workspaces.length,
        leftover: after.leftover
      })
    )
  } catch (err) {
    check('the owner state was restored', false, String(err))
  }
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch (err) {
    console.log(`WARN  could not delete ${root}: ${err.message}`)
  }
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed; screenshots in ${SHOTS}`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}
