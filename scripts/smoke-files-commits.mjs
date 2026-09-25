/* CDP smoke for the Files commits mode (FCMT-01..32).
 *
 * Same three modes as scripts/smoke-files.mjs and scripts/smoke-files-diff.mjs,
 * for the same reason: the app loads its config once at startup, so a workspace
 * registered afterwards is overwritten by the next patch.
 *
 *   1. node scripts/smoke-files-commits.mjs --seed      (app NOT running)
 *   2. launch with --remote-debugging-port=9222, then
 *      node scripts/smoke-files-commits.mjs
 *   3. node scripts/smoke-files-commits.mjs --clean
 *
 * Point SMOKE_CONFIG at the config.json of the userData dir in use, and
 * SMOKE_BASE at the folder to seed into. Run the app with --user-data-dir so
 * the owner's real workspaces, sessions and pinned tasks are never in scope.
 *
 * Run the drive against a FRESHLY LAUNCHED app AND a freshly seeded repo. Tabs
 * live in memory for the session, and the drive COMMITS and PUSHES on the
 * seeded branch, so a second run against the same repo starts from a state the
 * checks do not expect. Re-seed between drives.
 *
 * NOTHING LEAVES THE MACHINE. The "GitHub" remote is set only long enough to
 * read the two button states back out of the DOM, and no push happens while it
 * is set; every push in this script goes to a bare repository on disk.
 *
 * The seeded repo, on branch feature/commits, 104 commits past main:
 *
 *   <base>/fcm-smoke-seed/app/
 *     100 empty "filler NN" commits        so page one fills and Load more appears
 *     merge of branch `side`               two commits that must NOT be listed
 *     src/modified.ts   changed            \
 *     src/added.ts      added               > the three newest, left UNPUSHED
 *     src/renamed-new.ts renamed from -old /
 *     dirty.txt         changed, uncommitted, so the list gets its top row
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const MODE =
  process.argv[2] === '--seed' ? 'seed' : process.argv[2] === '--clean' ? 'clean' : 'drive'
const BASE = process.env.SMOKE_BASE ?? process.argv[3] ?? process.env.TEMP ?? '.'
const WS_PATH = join(BASE, 'fcm-smoke-seed')
const REPO = join(WS_PATH, 'app')
const ORIGIN = join(BASE, 'fcm-smoke-origin.git')
const CONFIG_PATH =
  process.env.SMOKE_CONFIG ?? join(process.env.APPDATA ?? '', 'playground', 'config.json')

/** Fictitious, per the spec's privacy guardrail. Never contacted. */
const FAKE_GITHUB = 'https://github.com/acme/widget.git'

const FILLERS = 100
const BRANCH = 'feature/commits'

/** Windows holds a watched directory open briefly after its watcher exits. */
const rmTree = (path) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })

const git = (args, cwd = REPO) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/* ------------------------------------------------------------------ seed -- */

function seed() {
  rmTree(WS_PATH)
  rmTree(ORIGIN)
  mkdirSync(join(REPO, 'src'), { recursive: true })

  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'smoke@example.invalid'])
  git(['config', 'user.name', 'Commit Smoke'])
  git(['config', 'core.autocrlf', 'false'])

  writeFileSync(join(REPO, 'src', 'modified.ts'), 'export const value = 1\n')
  writeFileSync(join(REPO, 'src', 'renamed-old.ts'), 'export const moved = true\n')
  writeFileSync(join(REPO, 'dirty.txt'), 'clean\n')
  git(['add', '-A'])
  git(['commit', '-m', 'base commit'])

  execFileSync('git', ['init', '--bare', '-b', 'main', ORIGIN], { windowsHide: true })
  git(['remote', 'add', 'origin', ORIGIN])
  git(['push', '-q', '-u', 'origin', 'main'])
  git(['remote', 'set-head', 'origin', 'main'])

  // A branch whose commits must never appear in the list: they arrive on a
  // merge, and the list is first-parent (FCMT-02).
  git(['checkout', '-q', '-b', 'side'])
  writeFileSync(join(REPO, 'src', 'side.ts'), 'export const side = 1\n')
  git(['add', '-A'])
  git(['commit', '-m', 'side one'])
  writeFileSync(join(REPO, 'src', 'side.ts'), 'export const side = 2\n')
  git(['add', '-A'])
  git(['commit', '-m', 'side two'])

  git(['checkout', '-q', '-b', BRANCH, 'main'])
  for (let i = 1; i <= FILLERS; i++) {
    git(['commit', '-q', '--allow-empty', '-m', `filler ${String(i).padStart(3, '0')}`])
  }
  git(['merge', '-q', '--no-ff', '-m', 'merge side', 'side'])

  // Everything so far reaches the upstream; the three below deliberately do not.
  git(['push', '-q', '-u', 'origin', BRANCH])

  writeFileSync(join(REPO, 'src', 'modified.ts'), 'export const value = 99\n')
  git(['add', '-A'])
  git(['commit', '-m', 'change the value'])
  writeFileSync(join(REPO, 'src', 'added.ts'), 'export const added = true\n')
  git(['add', '-A'])
  git(['commit', '-m', 'add a file'])
  git(['mv', 'src/renamed-old.ts', 'src/renamed-new.ts'])
  git(['commit', '-q', '-m', 'rename the module'])

  // One uncommitted change, so the list gets its top row (FCMT-14).
  writeFileSync(join(REPO, 'dirty.txt'), 'dirty\n')

  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {}
  if (!Array.isArray(config.workspaces)) config.workspaces = []
  const entry = { id: WS_PATH.toLowerCase(), path: WS_PATH, displayName: 'fcm-smoke-seed' }
  config.workspaces = [...config.workspaces.filter((w) => w.id !== entry.id), entry]
  mkdirSync(join(CONFIG_PATH, '..'), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  console.log(`Seeded ${WS_PATH} — ${FILLERS + 4} commits on ${BRANCH}, the newest 3 unpushed`)
  console.log(`Registered in ${CONFIG_PATH}`)
  console.log(`Now launch the app with --remote-debugging-port=${PORT} and run with no arguments.`)
}

function clean() {
  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    if (Array.isArray(config.workspaces)) {
      config.workspaces = config.workspaces.filter((w) => w.id !== WS_PATH.toLowerCase())
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    }
  }
  rmTree(WS_PATH)
  rmTree(ORIGIN)
  console.log(`Unregistered and removed ${WS_PATH}`)
}

/* ---------------------------------------------------------------- harness -- */

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`No CDP page target after 40s on port ${PORT}`)
}

let nextId = 1
const pending = new Map()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }
    }, 25000)
  })
}

async function evaluate(ws, expression) {
  const res = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || 'evaluate threw')
  }
  return res.result.value
}

const checks = []
function check(label, ok, detail = '') {
  checks.push({ label, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`
  )
}

const clickByText = (selector, text) => `
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => (e.textContent || '').trim() === ${JSON.stringify(text)})
    if (!el) return false
    el.click()
    return true
  })()
`

const clickBranch = (branch) => `
  (() => {
    const el = [...document.querySelectorAll('.sidebar-worktree-branch')]
      .find((e) => (e.textContent || '').trim() === ${JSON.stringify(branch)})
    if (!el) return false
    el.closest('.sidebar-worktree').click()
    return true
  })()
`

/** Every commit row, in the order the list draws them. */
const rows = `
  [...document.querySelectorAll('.commit-row')].map((row) => {
    const author = row.querySelector('.commit-author')
    return {
      sha: row.getAttribute('data-sha'),
      subject: row.querySelector('.commit-subject')?.textContent.trim() ?? '',
      author: author?.textContent.trim() ?? '',
      // Truthy when CSS is clipping the name: the text is wider than its box.
      authorClipped: author ? author.scrollWidth > author.clientWidth : false,
      date: row.querySelector('.commit-date')?.textContent.trim() ?? '',
      merge: row.querySelector('.commit-merge') !== null,
      unpushed: row.querySelector('.commit-unpushed') !== null,
      tooltip: row.querySelector('.commit-open')?.title ?? ''
    }
  })
`

/** Right-clicks one row; returns whether its menu opened. */
const openRowMenu = (sha) => `
  (() => {
    const row = document.querySelector('.commit-row[data-sha="${sha}"] .commit-open')
    if (!row) return false
    const box = row.getBoundingClientRect()
    row.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: Math.round(box.left + 20),
        clientY: Math.round(box.top + 10)
      })
    )
    return true
  })()
`

/** What the open row menu offers (FCMT-21/23/25/26). */
const rowMenu = `
  (() => {
    const menu = document.querySelector('.commit-ctx-menu')
    if (!menu) return null
    const browse = menu.querySelector('.commit-browse')
    return {
      items: [...menu.querySelectorAll('.commit-ctx-item')].map((e) => e.textContent.trim()),
      browse: browse === null ? 'hidden' : browse.disabled ? 'disabled' : 'enabled',
      browseTitle: browse?.title ?? ''
    }
  })()
`

/** Dismisses whatever menu is open, the way Escape does. */
const closeRowMenu = `
  (() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    return true
  })()
`

/** Whether any row menu is on screen. */
const menuOnScreen = `document.querySelector('.commit-ctx-menu') !== null`

const tabLabels = `[...document.querySelectorAll('.file-tab-label')].map((e) => e.textContent.trim())`
const activeMode = `document.querySelector('.file-tree-mode.active')?.textContent.trim() ?? ''`
const totalsHeader = `
  (() => {
    const box = document.querySelector('.all-changes-header')
    if (!box) return null
    return {
      files: box.querySelector('.all-changes-files')?.textContent.trim() ?? '',
      added: box.querySelector('.all-changes-added')?.textContent.trim() ?? '',
      removed: box.querySelector('.all-changes-removed')?.textContent.trim() ?? ''
    }
  })()
`
const sectionPaths = `[...document.querySelectorAll('.diff-section-path')].map((e) => e.textContent.trim())`

async function connect() {
  const target = await pageTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
  })
  await send(ws, 'Runtime.enable')
  for (let i = 0; ; i++) {
    if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
    if (i >= 30) throw new Error('Top bar never appeared after 30s')
    await sleep(1000)
  }
  return ws
}

/** Selects the seeded worktree; the sidebar only exists in the Tree direction. */
async function selectWorktree(ws) {
  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  for (let i = 0; ; i++) {
    const n = await evaluate(ws, `document.querySelectorAll('.sidebar-worktree-branch').length`)
    if (n > 0) break
    if (i >= 30) break
    await sleep(1000)
  }
  const picked = await evaluate(ws, clickBranch(BRANCH))
  if (!picked) {
    const branches = await evaluate(
      ws,
      `[...document.querySelectorAll('.sidebar-worktree-branch')].map((e) => e.textContent.trim())`
    )
    throw new Error(`Seeded worktree not in the sidebar. Branches: ${JSON.stringify(branches)}`)
  }
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1600)
}

/** Waits for the list to hold at least `n` rows, up to `ms`. */
async function waitForRows(ws, n, ms = 12000) {
  for (let waited = 0; waited < ms; waited += 300) {
    if ((await evaluate(ws, `document.querySelectorAll('.commit-row').length`)) >= n) return true
    await sleep(300)
  }
  return false
}

/* ----------------------------------------------------------------- drive -- */

async function drive() {
  const ws = await connect()
  await selectWorktree(ws)

  // The lens persists per worktree, so start from a known one.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1200)

  // 1. FCMT-01: the fourth mode is offered beside the three F1 shipped.
  const modes = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-mode')].map((e) => e.textContent.trim())`
  )
  check(
    'The mode selector offers a fourth mode, Commits (FCMT-01)',
    modes.length === 4 && modes.includes('Commits'),
    JSON.stringify(modes)
  )

  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  await waitForRows(ws, 100)
  await sleep(600)

  // 2. FCMT-06: the base picker is there, sharing diff-to-origin's base.
  const baseValue = await evaluate(
    ws,
    `document.querySelector('.file-tree-base-select')?.value ?? null`
  )
  check(
    'Commits mode shows the base picker, on the shared base (FCMT-06)',
    baseValue === 'origin/main',
    `base = ${JSON.stringify(baseValue)}`
  )

  const page1 = await evaluate(ws, rows)

  // 3. FCMT-08: a hundred rows, and an invitation to fetch the rest.
  const hasMore = await evaluate(ws, `document.querySelector('.commit-more') !== null`)
  check(
    'Page one holds exactly 100 commits and offers Load more (FCMT-08)',
    page1.length === 100 && hasMore,
    `${page1.length} rows, Load more ${hasMore ? 'present' : 'absent'}`
  )

  // 4. FCMT-02 / F3-Q3: the merge is one row; what it brought in is not listed.
  const subjects1 = page1.map((r) => r.subject)
  check(
    'The list is first-parent: the merge is one row and its two commits are absent (FCMT-02)',
    subjects1.includes('merge side') &&
      !subjects1.includes('side one') &&
      !subjects1.includes('side two'),
    `merge ${subjects1.includes('merge side')}, side one ${subjects1.includes('side one')}, side two ${subjects1.includes('side two')}`
  )

  // 5. FCMT-02: newest first, so the branch reads top-down as it was built.
  check(
    'The newest commit heads the list (FCMT-02)',
    subjects1[0] === 'rename the module' &&
      subjects1[1] === 'add a file' &&
      subjects1[2] === 'change the value',
    JSON.stringify(subjects1.slice(0, 4))
  )

  // 6. FCMT-03: everything one row is required to carry. The sha is not in
  //    the row any more — the subject leads, and the sha is in the tooltip and
  //    the right-click menu.
  const top = page1[0]
  check(
    'A row leads with the subject, and carries the author and a relative date (FCMT-03)',
    top.subject === 'rename the module' &&
      top.author === 'Commit Smoke' &&
      /ago|just now/.test(top.date),
    JSON.stringify(top)
  )

  // The author was being clipped to its first letter: the two action buttons
  // reserved their width in the row even while hidden. They are in the menu
  // now, so the name has room. `scrollWidth > clientWidth` is CSS clipping,
  // which reading `textContent` cannot see.
  check(
    'The author name is not clipped by the row layout',
    page1.every((row) => !row.authorClipped),
    `${page1.filter((row) => row.authorClipped).length} of ${page1.length} rows clipped`
  )

  // 7. FCMT-04: the tooltip is the whole message, not the subject again. The
  //    merge row is the one seeded with a body, so it is the one that proves it.
  const mergeRow = page1.find((r) => r.subject === 'merge side')
  const mergeMessage = git(['log', '-1', '--format=%B', mergeRow.sha]).trim()
  check(
    'A row tooltip carries the commit whole message (FCMT-04)',
    mergeRow.tooltip.trim() === mergeMessage && mergeMessage.includes('side'),
    `${JSON.stringify(mergeRow.tooltip)} vs git ${JSON.stringify(mergeMessage)}`
  )

  // 8. FCMT-05: only the merge wears the merge badge.
  const merged = page1.filter((r) => r.merge).map((r) => r.subject)
  check(
    'Exactly the merge commit is marked as a merge (FCMT-05)',
    merged.length === 1 && merged[0] === 'merge side',
    JSON.stringify(merged)
  )

  // 8. FCMT-12: the three commits made after the push, and nothing else.
  const unpushed1 = page1.filter((r) => r.unpushed).map((r) => r.subject)
  check(
    'Exactly the three commits made after the push are marked not pushed (FCMT-12)',
    unpushed1.length === 3 &&
      unpushed1.join('|') === 'rename the module|add a file|change the value',
    JSON.stringify(unpushed1)
  )

  // 9. FCMT-14: uncommitted work heads the list, counted.
  const uncommitted = await evaluate(
    ws,
    `document.querySelector('.commit-uncommitted')?.textContent.trim() ?? null`
  )
  check(
    'The list begins with the uncommitted row, counting the changed file (FCMT-14)',
    uncommitted === 'Uncommitted changes (1)',
    JSON.stringify(uncommitted)
  )

  // 10. FCMT-09: the next page is appended below, not swapped in.
  await evaluate(ws, `document.querySelector('.commit-more').click()`)
  await waitForRows(ws, FILLERS + 4)
  await sleep(400)
  const page2 = await evaluate(ws, rows)
  const stillMore = await evaluate(ws, `document.querySelector('.commit-more') !== null`)
  check(
    'Load more appends the rest below what was shown, and then goes away (FCMT-09)',
    page2.length === FILLERS + 4 &&
      page2
        .slice(0, 100)
        .map((r) => r.sha)
        .join() === page1.map((r) => r.sha).join() &&
      page2[page2.length - 1].subject === 'filler 001' &&
      !stillMore,
    `${page1.length} -> ${page2.length} rows, last ${JSON.stringify(page2[page2.length - 1]?.subject)}, Load more ${stillMore ? 'still there' : 'gone'}`
  )

  // 11. FCMT-26: a remote that is a local path is no provider, so the action
  //     is absent from the menu — hidden, not disabled.
  const rightClicked = await evaluate(ws, openRowMenu(page2[0].sha))
  await sleep(300)
  const localMenu = await evaluate(ws, rowMenu)
  check(
    'Right-clicking a row opens a menu, offering Copy sha (FCMT-21)',
    rightClicked && localMenu !== null && localMenu.items.some((i) => i.includes('Copy sha')),
    JSON.stringify(localMenu)
  )
  check(
    'With an unrecognized remote the menu does not offer Open in browser (FCMT-26)',
    localMenu !== null && localMenu.browse === 'hidden',
    `browse = ${JSON.stringify(localMenu?.browse)}`
  )
  await evaluate(ws, closeRowMenu)
  await sleep(300)
  check(
    'Escape dismisses the row menu',
    (await evaluate(ws, menuOnScreen)) === false,
    'menu still on screen'
  )

  // FCMT-30: the base moved, so the list is re-cut against a different merge
  // base. Against the pushed tip only the three unpushed commits are the
  // branch's own — 104 rows down to 3, and back.
  const pickBase = (branch) => `
    (() => {
      const select = document.querySelector('.file-tree-base-select')
      if (!select) return false
      if (![...select.options].some((o) => o.value === ${JSON.stringify(branch)})) return false
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      ).set
      setter.call(select, ${JSON.stringify(branch)})
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()
  `
  const switched = await evaluate(ws, pickBase(`origin/${BRANCH}`))
  await sleep(2200)
  const rebased = await evaluate(ws, rows)
  check(
    'Changing the base re-cuts the list against the new merge base (FCMT-30)',
    switched &&
      rebased.length === 3 &&
      rebased.map((r) => r.subject).join('|') === 'rename the module|add a file|change the value',
    switched
      ? `${page2.length} rows -> ${rebased.length}: ${JSON.stringify(rebased.map((r) => r.subject))}`
      : `origin/${BRANCH} was not offered as a base`
  )
  await evaluate(ws, pickBase('origin/main'))
  await waitForRows(ws, 100)
  await sleep(600)

  // 12. FCMT-22: the full forty characters, from the right-click menu.
  const firstSha = (await evaluate(ws, rows))[0].sha
  await evaluate(ws, openRowMenu(firstSha))
  await sleep(300)
  const copied = await evaluate(
    ws,
    `
    (async () => {
      const item = document.querySelector('.commit-ctx-menu .commit-copy')
      if (!item) return { seen: null, readBack: null, sha: null }
      const real = navigator.clipboard.writeText.bind(navigator.clipboard)
      let seen = null
      navigator.clipboard.writeText = (text) => { seen = text; return real(text) }
      item.click()
      await new Promise((r) => setTimeout(r, 400))
      navigator.clipboard.writeText = real
      let readBack = null
      try { readBack = await navigator.clipboard.readText() } catch { readBack = null }
      return { seen, readBack, sha: '${firstSha}' }
    })()
  `
  )
  check(
    'Copy sha puts the full 40-character sha on the clipboard (FCMT-22)',
    copied.seen === copied.sha &&
      /^[0-9a-f]{40}$/.test(copied.seen ?? '') &&
      (copied.readBack === null || copied.readBack === copied.sha),
    `wrote ${JSON.stringify(copied.seen)}, clipboard read back ${JSON.stringify(copied.readBack)}`
  )

  // 13/14. FCMT-16/17: a commit opens as its own tab, stacking what it changed.
  await evaluate(ws, `document.querySelector('.commit-row .commit-open').click()`)
  await sleep(2500)
  const afterOpen = await evaluate(ws, tabLabels)
  // The row no longer shows a sha; the TAB still does, so two commits with the
  // same subject stay apart (FCMT-16). The expected one comes from git.
  const topShort = git(['rev-parse', '--short', top.sha])
  check(
    'Clicking a commit opens a tab titled by its short sha and subject (FCMT-16)',
    afterOpen.some((l) => l === `${topShort} · rename the module`),
    `expected "${topShort} · rename the module", saw ${JSON.stringify(afterOpen)}`
  )

  const renamePaths = await evaluate(ws, sectionPaths)
  check(
    'The commit tab stacks what that commit changed, the rename included (FCMT-17)',
    renamePaths.length === 1 && renamePaths[0].includes('renamed-new.ts'),
    JSON.stringify(renamePaths)
  )

  // FCMT-19: it is F2's stack, so it brings F2's header — the file count and
  // the two totals, read from the counts that came back with the commit.
  const renameHeader = await evaluate(ws, totalsHeader)
  check(
    'The commit tab carries F2 totals header (FCMT-19)',
    // A pure rename moves no lines, and `git diff-tree --numstat` says so:
    // `0  0  src/{renamed-old.ts => renamed-new.ts}`. The zeros are the right
    // answer here, which is why the check below opens a commit that does move
    // lines — zeros alone would also be what a broken counts path produces.
    renameHeader !== null &&
      renameHeader.files === '1 file changed' &&
      renameHeader.added === '+0' &&
      /0$/.test(renameHeader.removed),
    JSON.stringify(renameHeader)
  )

  const valueSha = page1.find((r) => r.subject === 'change the value').sha
  await evaluate(
    ws,
    `document.querySelector('.commit-row[data-sha="${valueSha}"] .commit-open').click()`
  )
  await sleep(2500)
  const valueHeader = await evaluate(ws, totalsHeader)
  check(
    'The totals are that commit own, read from its counts (FCMT-19)',
    valueHeader !== null &&
      valueHeader.files === '1 file changed' &&
      valueHeader.added === '+1' &&
      /1$/.test(valueHeader.removed),
    `${JSON.stringify(valueHeader)} — git says 1 added, 1 removed`
  )

  // 15. FCMT-17 again, and the one the design measured: `diff-tree` on a merge
  //     with a single argument prints nothing, so this would be an empty stack.
  const mergeSha = page2.find((r) => r.subject === 'merge side').sha
  await evaluate(
    ws,
    `document.querySelector('.commit-row[data-sha="${mergeSha}"] .commit-open').click()`
  )
  await sleep(2500)
  const mergePaths = await evaluate(ws, sectionPaths)
  check(
    'A merge commit opens on its first-parent changes, not an empty stack (FCMT-17)',
    mergePaths.length === 1 && mergePaths[0].includes('side.ts'),
    JSON.stringify(mergePaths)
  )

  // 16. FCMT-20: the tab belongs to the commit, not to the mode it was opened in.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1400)
  const afterSwitch = await evaluate(ws, tabLabels)
  check(
    'Commit tabs stay open across a mode switch (FCMT-20)',
    afterSwitch.filter((l) => l.includes(' · ')).length === 3 &&
      afterSwitch.some((l) => l.endsWith(' · merge side')) &&
      afterSwitch.some((l) => l.endsWith(' · rename the module')) &&
      afterSwitch.some((l) => l.endsWith(' · change the value')),
    JSON.stringify(afterSwitch)
  )

  // 17. FCMT-23/25: with a recognized remote the button appears, and says why
  //     it will not act on a commit the upstream has not seen. Nothing is
  //     clicked: a real browser would open on a fictitious address.
  git(['remote', 'set-url', 'origin', FAKE_GITHUB])
  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  await waitForRows(ws, 100)
  await evaluate(ws, `window.dispatchEvent(new Event('focus'))`)
  await sleep(2000)
  const recognized = await evaluate(ws, rows)
  const unpushedRow = recognized.find((r) => r.unpushed)
  const pushedRow = recognized.find((r) => !r.unpushed)

  await evaluate(ws, openRowMenu(pushedRow.sha))
  await sleep(300)
  const pushedMenu = await evaluate(ws, rowMenu)
  await evaluate(ws, closeRowMenu)
  await sleep(200)
  await evaluate(ws, openRowMenu(unpushedRow.sha))
  await sleep(300)
  const unpushedMenu = await evaluate(ws, rowMenu)
  await evaluate(ws, closeRowMenu)

  check(
    'A recognized remote enables Open in browser on a pushed commit (FCMT-23)',
    pushedMenu !== null && pushedMenu.browse === 'enabled',
    `${JSON.stringify(pushedRow?.subject)} -> ${JSON.stringify(pushedMenu?.browse)}`
  )
  check(
    'The same action is disabled on an unpushed commit, and says why (FCMT-25)',
    unpushedMenu !== null &&
      unpushedMenu.browse === 'disabled' &&
      /not been pushed/.test(unpushedMenu.browseTitle),
    `${JSON.stringify(unpushedRow?.subject)} -> ${JSON.stringify(unpushedMenu)}`
  )
  git(['remote', 'set-url', 'origin', ORIGIN])

  // 18. FCMT-29: HEAD moved outside the app; the list follows within a second.
  const before = await evaluate(ws, `document.querySelectorAll('.commit-row').length`)
  writeFileSync(join(REPO, 'src', 'added.ts'), 'export const added = 2\n')
  // Only this file: `add -A` would sweep up dirty.txt, and the uncommitted
  // row checked below would vanish because the worktree went clean.
  git(['add', 'src/added.ts'])
  git(['commit', '-q', '-m', 'committed while the list was open'])
  let appeared = false
  for (let waited = 0; waited <= 1000 && !appeared; waited += 100) {
    await sleep(100)
    const top = await evaluate(
      ws,
      `document.querySelector('.commit-row .commit-subject')?.textContent.trim() ?? ''`
    )
    appeared = top === 'committed while the list was open'
  }
  check(
    'A commit made outside the app appears on top within 1 s (FCMT-29)',
    appeared,
    `${before} rows before`
  )

  // 19. FCMT-31: the refresh above replaced the list; the tabs are untouched.
  const afterRefresh = await evaluate(ws, tabLabels)
  check(
    'The refresh left every open commit tab showing its own commit (FCMT-31)',
    afterRefresh.filter((l) => l.includes(' · ')).length === 3 &&
      afterRefresh.some((l) => l === `${topShort} · rename the module`) &&
      afterRefresh.some((l) => l.endsWith(' · merge side')) &&
      afterRefresh.some((l) => l.endsWith(' · change the value')),
    JSON.stringify(afterRefresh)
  )

  // 20. FCMT-32: a push moves refs/remotes, which the file watcher does not
  //     report. The markers must still clear.
  const unpushedBefore = await evaluate(ws, `document.querySelectorAll('.commit-unpushed').length`)
  await evaluate(ws, `document.querySelector('.status-bar-sync').click()`)
  await sleep(900)
  const pushed = await evaluate(ws, clickByText('.sync-pop-btn', 'Push'))
  let cleared = false
  for (let waited = 0; waited < 20000 && !cleared; waited += 500) {
    await sleep(500)
    cleared = (await evaluate(ws, `document.querySelectorAll('.commit-unpushed').length`)) === 0
  }
  check(
    'The not-pushed markers clear after a push from the status bar (FCMT-32)',
    pushed && unpushedBefore === 4 && cleared,
    `${unpushedBefore} marked before, Push ${pushed ? 'clicked' : 'NOT FOUND'}, ${cleared ? 'all cleared' : 'still marked'}`
  )

  // 21. FCMT-15: the uncommitted row is a way into the other mode, not a label.
  await evaluate(ws, `document.querySelector('.commit-uncommitted').click()`)
  await sleep(1500)
  const mode = await evaluate(ws, activeMode)
  check(
    'The uncommitted row switches the view to uncommitted-changes mode (FCMT-15)',
    mode === 'Uncommitted',
    `active mode = ${JSON.stringify(mode)}`
  )

  // 22. FCMT-11: the mode is restored per worktree like the other three. The
  //     config is the same per-worktree map F1 persists into.
  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  await sleep(1200)
  const persisted = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  const entry = Object.entries(persisted.ui?.files ?? {}).find(([key]) =>
    key.toLowerCase().includes('fcm-smoke-seed')
  )
  check(
    'Commits is persisted as that worktree mode, to be restored on return (FCMT-11)',
    entry !== undefined && entry[1].mode === 'commits',
    JSON.stringify(entry?.[1] ?? null)
  )

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log('\nHand checks this smoke does NOT script:')
  console.log('  A. Click Open in browser on ONE real pushed commit of a real repository.')
  console.log('     The smoke never clicks an enabled one: the seeded address is fictitious.')
  console.log('  B. Judge the four-mode selector at the narrowest column width.')
  console.log('  C. FCMT-07 is NOT covered here: a repository with no origin/HEAD and no')
  console.log('     chosen base. The seeded one has both. It is the same guard the')
  console.log('     diff-to-origin body uses, which smoke-files.mjs does cover.')
  ws.close()
  return failed.length
}

/* ------------------------------------------------------------------ main -- */

if (MODE === 'seed') {
  seed()
} else if (MODE === 'clean') {
  clean()
} else {
  process.exit((await drive()) ? 1 : 0)
}
