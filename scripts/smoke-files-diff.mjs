/* CDP smoke for the Files diffs (FDIF-01..32), with pinned tabs, bulk closes
 * and expanding or collapsing every change (FPOL-01..18).
 *
 * Same three modes as scripts/smoke-files.mjs, for the same reason: the app
 * loads its config once at startup, so a workspace registered afterwards is
 * overwritten by the next patch.
 *
 *   1. node scripts/smoke-files-diff.mjs --seed      (app NOT running)
 *   2. launch with --remote-debugging-port=9222, then
 *      node scripts/smoke-files-diff.mjs
 *   3. node scripts/smoke-files-diff.mjs --after-restart
 *      Run this against a SECOND launch, without re-seeding: it checks that the
 *      layout and whitespace choices the drive made survived (FDIF-12/16).
 *   4. node scripts/smoke-files-diff.mjs --clean
 *
 * Point SMOKE_CONFIG at the config.json of the userData dir in use, and
 * SMOKE_BASE at the folder to seed into. Run the app with --user-data-dir so
 * the owner's real workspaces, sessions and pinned tasks are never in scope.
 *
 * Run the drive against a FRESHLY LAUNCHED app AND a freshly seeded repo. Tabs
 * and expanded folders live in memory for the session, so a second run against
 * the same window starts with state the checks do not expect; and the last
 * check COMMITS a file, so a second run against the same repo finds nothing to
 * commit and dies in the seed's own git call. Re-seed between drives.
 *
 * The seeded repo, on branch feature/diff two commits past main:
 *
 *   <base>/fxd-smoke-seed/app/
 *     src/modified.ts      committed, then changed on the branch
 *     src/added.ts         added on the branch
 *     docs/removed.md      committed on main, deleted on the branch
 *     src/renamed-new.ts   committed as renamed-old.ts, moved on the branch
 *     crlf.txt             committed with CRLF, rewritten as LF on disk
 *     assets/logo.bin      a NUL in the first 8000 bytes
 *     big.txt              2 MB, past the 1 MB view cap
 *     stack/f00..f39.ts    40 changed files, for the All changes stack
 *     untracked.txt        untracked, so the uncommitted mode has one
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const MODE =
  process.argv[2] === '--seed'
    ? 'seed'
    : process.argv[2] === '--clean'
      ? 'clean'
      : process.argv[2] === '--after-restart'
        ? 'after-restart'
        : 'drive'
const BASE = process.env.SMOKE_BASE ?? process.argv[3] ?? process.env.TEMP ?? '.'
const WS_PATH = join(BASE, 'fxd-smoke-seed')
const REPO = join(WS_PATH, 'app')
const ORIGIN = join(BASE, 'fxd-smoke-origin.git')
const OTHER = join(BASE, 'fxd-smoke-other')
const CONFIG_PATH =
  process.env.SMOKE_CONFIG ?? join(process.env.APPDATA ?? '', 'playground', 'config.json')

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)

/** Windows holds a watched directory open briefly after its watcher exits. */
const rmTree = (path) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })

const git = (args, cwd = REPO) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/* ------------------------------------------------------------------ seed -- */

function seed() {
  rmTree(WS_PATH)
  rmTree(ORIGIN)
  for (const dir of ['src', 'docs', 'assets', 'stack']) {
    mkdirSync(join(REPO, dir), { recursive: true })
  }

  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'smoke@example.invalid'])
  git(['config', 'user.name', 'Diff Smoke'])
  // Without this the terminators below are rewritten on commit and on checkout,
  // and the CRLF case never exists on disk to be seen.
  git(['config', 'core.autocrlf', 'false'])

  writeFileSync(
    join(REPO, 'src', 'modified.ts'),
    'export const value = 1\nexport const other = 2\n'
  )
  writeFileSync(join(REPO, 'src', 'renamed-old.ts'), 'export const moved = true\n')
  writeFileSync(join(REPO, 'docs', 'removed.md'), '# Removed\n\nThis goes away.\n')
  // Committed with CRLF so the disk can differ from the blob by terminator only.
  writeFileSync(join(REPO, 'crlf.txt'), ['alpha', 'beta', 'gamma'].join(CR + LF) + CR + LF)
  writeFileSync(join(REPO, 'assets', 'logo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47]))
  writeFileSync(join(REPO, 'big.txt'), 'x'.repeat(2 * 1024 * 1024))
  for (let i = 0; i < 40; i++) {
    const name = `f${String(i).padStart(2, '0')}.ts`
    writeFileSync(join(REPO, 'stack', name), `export const n${i} = ${i}\nexport const tail = 0\n`)
  }

  git(['add', '-A'])
  git(['commit', '-m', 'base commit'])

  execFileSync('git', ['init', '--bare', '-b', 'main', ORIGIN], { windowsHide: true })
  git(['remote', 'add', 'origin', ORIGIN])
  git(['push', '-q', '-u', 'origin', 'main'])
  git(['remote', 'set-head', 'origin', 'main'])

  git(['checkout', '-b', 'feature/diff'])
  writeFileSync(
    join(REPO, 'src', 'modified.ts'),
    'export const value = 99\nexport const other = 2\n'
  )
  writeFileSync(join(REPO, 'src', 'added.ts'), 'export const added = true\n')
  git(['mv', 'src/renamed-old.ts', 'src/renamed-new.ts'])
  git(['rm', '-q', 'docs/removed.md'])
  for (let i = 0; i < 40; i++) {
    const name = `f${String(i).padStart(2, '0')}.ts`
    writeFileSync(
      join(REPO, 'stack', name),
      `export const n${i} = ${i * 10}\nexport const tail = 1\n`
    )
  }
  git(['add', '-A'])
  git(['commit', '-m', 'work on the branch'])

  // Uncommitted: the same file rewritten with LF, and one untracked file.
  writeFileSync(join(REPO, 'crlf.txt'), ['alpha', 'beta', 'gamma'].join(LF) + LF)
  writeFileSync(join(REPO, 'untracked.txt'), 'not tracked yet\n')

  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {}
  if (!Array.isArray(config.workspaces)) config.workspaces = []
  const entry = { id: WS_PATH.toLowerCase(), path: WS_PATH, displayName: 'fxd-smoke-seed' }
  config.workspaces = [...config.workspaces.filter((w) => w.id !== entry.id), entry]
  mkdirSync(join(CONFIG_PATH, '..'), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  console.log(`Seeded ${WS_PATH}`)
  console.log(`Registered in ${CONFIG_PATH}`)
  console.log(`Now launch the app with --remote-debugging-port=${PORT} and run with no arguments.`)
}

function clean() {
  rmTree(OTHER)
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

const tabLabels = `[...document.querySelectorAll('.file-tab-label')].map((e) => e.textContent.trim())`
const liveDiffEditors = `document.querySelectorAll('.diff-section .monaco-diff-editor').length`

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
  const picked = await evaluate(ws, clickBranch('feature/diff'))
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

const activeToggles = `
  [...document.querySelectorAll('.file-tabs-toggle')].map((e) => ({
    label: e.textContent.trim(),
    pressed: e.getAttribute('aria-pressed')
  }))
`

/** Clicks a toggle by its label and returns whether it was there. */
const clickToggle = (label) => clickByText('.file-tabs-toggle', label)

/* ------------------------------------------------ pinned tabs (FPOL) -- */

const J = JSON.stringify

/** A tab's label as the strip shows it, without the diff glyph. */
const tabName = `(e) => e.textContent.replace('±', '').trim()`

/** The strip's labels, in order. */
const strip = (ws) =>
  evaluate(ws, `[...document.querySelectorAll('.file-tab-label')].map(${tabName})`)

const activeTab = (ws) =>
  evaluate(
    ws,
    `(() => { const el = document.querySelector('.file-tab.active .file-tab-label'); return el ? (${tabName})(el) : null })()`
  )

/** For every tab, whether it ends in a pin or a close button (FPOL-02). */
const tabMarks = (ws) =>
  evaluate(
    ws,
    `Object.fromEntries([...document.querySelectorAll('.file-tab')].map((tab) => [
       (${tabName})(tab.querySelector('.file-tab-label')),
       tab.querySelector('.file-tab-pin') ? 'pin' : tab.querySelector('.file-tab-close') ? 'close' : 'none'
     ]))`
  )

const tabElement = (name) => `
  [...document.querySelectorAll('.file-tab')].find(
    (tab) => (${tabName})(tab.querySelector('.file-tab-label')) === ${J(name)}
  )`

/** Right-clicks a tab the way the browser does: a contextmenu event at its label. */
const rightClickTab = (name) => `
  (() => {
    const tab = ${tabElement(name)}
    if (!tab) return false
    const box = tab.getBoundingClientRect()
    tab.querySelector('.file-tab-label').dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, button: 2, clientX: box.left + 8, clientY: box.bottom - 4
    }))
    return true
  })()`

const clickPinOf = (name) => `
  (() => {
    const pin = (${tabElement(name)})?.querySelector('.file-tab-pin')
    if (!pin) return false
    pin.click()
    return true
  })()`

/** The open menu's entries, or null when no menu is open. */
const menuItems = (ws) =>
  evaluate(
    ws,
    `(() => {
       const menu = document.querySelector('.file-tabs-menu')
       return menu ? [...menu.querySelectorAll('.file-tabs-menu-item')].map((e) => e.textContent.trim()) : null
     })()`
  )

/** Opens a tab's menu and chooses one entry. */
async function tabMenu(ws, name, item) {
  if (!(await evaluate(ws, rightClickTab(name)))) throw new Error(`No tab named ${name}`)
  await sleep(250)
  if (!(await evaluate(ws, clickByText('.file-tabs-menu-item', item)))) {
    throw new Error(`No menu entry ${item} on ${name}: ${J(await menuItems(ws))}`)
  }
  await sleep(450)
}

/** Selects one worktree by its branch in the Tree direction, then returns to Files. */
async function selectBranch(ws, branch) {
  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  await sleep(600)
  if (!(await evaluate(ws, clickBranch(branch)))) throw new Error(`No worktree on ${branch}`)
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1600)
}

async function openStripMenuMore(ws) {
  await evaluate(ws, `(document.querySelector('.file-tabs-more')?.click(), true)`)
  await sleep(300)
}

async function focusTabNamed(ws, name) {
  await evaluate(
    ws,
    `(() => { (${tabElement(name)})?.querySelector('.file-tab-label').click(); return true })()`
  )
  await sleep(300)
}

/** Opens one of the stack's files from the tree, unfolding `stack` if it is folded. */
async function openStackFile(ws, name) {
  const visible = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-name')].some((e) => e.textContent.trim() === ${J(name)})`
  )
  if (!visible) {
    await evaluate(ws, clickByText('.file-tree-name', 'stack'))
    await sleep(600)
  }
  if (!(await evaluate(ws, clickByText('.file-tree-name', name)))) {
    throw new Error(`${name} is not in the tree`)
  }
  await sleep(700)
}

/* ----------------------------------------------------------------- drive -- */

async function drive() {
  const ws = await connect()
  await selectWorktree(ws)

  // The lens persists per worktree, so start from a known one.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1300)

  // 1. The fixed tab belongs to the diff modes only (FDIF-18).
  const inFolder = await evaluate(ws, tabLabels)
  check(
    'No All changes tab in the folder mode (FDIF-18)',
    !inFolder.includes('All changes'),
    `tabs: ${inFolder.join(', ') || 'none'}`
  )

  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1600)
  const inDiff = await evaluate(
    ws,
    `({
       labels: ${tabLabels},
       fixed: document.querySelectorAll('.file-tab.fixed').length,
       closable: document.querySelectorAll('.file-tab.fixed .file-tab-close').length
     })`
  )
  check(
    'The diff modes carry an All changes tab that cannot be closed (FDIF-17/18)',
    inDiff.labels.includes('All changes') && inDiff.fixed === 1 && inDiff.closable === 0,
    JSON.stringify(inDiff)
  )

  // 2. A click opens a diff, per reference kind (FDIF-01..05).
  const openAndRead = async (name) => {
    await evaluate(ws, clickByText('.file-tree-name', name))
    await sleep(1700)
    return evaluate(
      ws,
      `({
         diffEditors: document.querySelectorAll('.diff-viewer .monaco-diff-editor').length,
         fileViewers: document.querySelectorAll('.code-viewer-editor .monaco-editor').length,
         identical: document.querySelectorAll('.diff-viewer.identical').length,
         openFile: [...document.querySelectorAll('.file-tabs-toggle')]
           .some((e) => e.textContent.trim() === 'Open file')
       })`
    )
  }

  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(900)
  const modified = await openAndRead('modified.ts')
  check(
    'A modified file opens as a diff, not as the file (FDIF-01)',
    modified.diffEditors === 1 && modified.fileViewers === 0,
    JSON.stringify(modified)
  )

  const added = await openAndRead('added.ts')
  check(
    'A file added on the branch opens as a diff (FDIF-03)',
    added.diffEditors === 1,
    JSON.stringify(added)
  )

  const renamed = await openAndRead('renamed-new.ts')
  check(
    'A renamed file opens as a diff read from its old path (FDIF-05)',
    renamed.diffEditors === 1,
    JSON.stringify(renamed)
  )

  await evaluate(ws, clickByText('.file-tree-name', 'docs'))
  await sleep(900)
  const deleted = await openAndRead('removed.md')
  check(
    'A deleted file opens as a diff with an absent side (FDIF-04)',
    deleted.diffEditors === 1,
    JSON.stringify(deleted)
  )
  check(
    'Open file is hidden for a deleted file (FDIF-27/28)',
    deleted.openFile === false && modified.openFile === true,
    `deleted: ${deleted.openFile}, modified: ${modified.openFile}`
  )

  // 3. Both sides refuse typing (FDIF-07) — provable only by typing, since
  // Monaco's NativeEditContext marks its textarea readonly whatever the option
  // says.
  //
  // On a file with content on BOTH sides. An earlier version ran this on the
  // deleted file left open above, whose modified side is empty, and took both
  // click targets from the first two `.view-line`s in document order — which
  // both belong to the ORIGINAL pane, because Monaco renders it first. It
  // typed twice into one side and claimed to have covered two.
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(900)
  await evaluate(ws, clickByText('.file-tree-name', 'modified.ts'))
  await sleep(1800)
  const readSides = `
    (() => {
      const panes = [...document.querySelectorAll('.diff-viewer .monaco-diff-editor .editor')]
      return panes.map((p) =>
        [...p.querySelectorAll('.view-line')]
          .map((l) => l.textContent.replace(/\\u00a0/g, ' '))
          .join('\\n')
      )
    })()
  `
  const beforeTyping = await evaluate(ws, readSides)
  // One target per pane, taken from the pane itself rather than from a flat
  // list, so each side is genuinely clicked into.
  const paneBoxes = await evaluate(
    ws,
    `[...document.querySelectorAll('.diff-viewer .monaco-diff-editor .editor')]
       .map((pane) => pane.querySelector('.view-line'))
       .filter(Boolean)
       .map((el) => {
         const r = el.getBoundingClientRect()
         return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
       })`
  )
  for (const box of paneBoxes) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send(ws, 'Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1
      })
    }
    await sleep(300)
    for (const ch of 'QQQ') {
      await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch })
      await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
      await sleep(60)
    }
  }
  await sleep(800)
  const afterTyping = await evaluate(ws, readSides)
  const bothSidesHadText =
    Array.isArray(beforeTyping) &&
    beforeTyping.length >= 2 &&
    beforeTyping.slice(0, 2).every((s) => s.trim().length > 0)
  check(
    'Neither side of a diff accepts typing (FDIF-07)',
    bothSidesHadText &&
      paneBoxes.length >= 2 &&
      JSON.stringify(afterTyping) === JSON.stringify(beforeTyping) &&
      !JSON.stringify(afterTyping).includes('QQQ'),
    !bothSidesHadText
      ? 'A SIDE WAS EMPTY — typing into it proves nothing'
      : paneBoxes.length < 2
        ? 'FEWER THAN TWO CLICK TARGETS — only one side was typed into'
        : `${paneBoxes.length} panes typed into, both unchanged`
  )

  // 4. The line-ending strip, in the uncommitted mode where crlf.txt differs
  // from its blob by terminator only (FDIF-15).
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tree-name', 'crlf.txt'))
  await sleep(1800)
  const eolShown = await evaluate(
    ws,
    `({
       strip: document.querySelector('.diff-viewer-eol')?.textContent?.trim() ?? null,
       markers: document.querySelectorAll('.diff-viewer-eol-marker').length
     })`
  )
  check(
    'A line-ending change shows its strip and per-line markers (FDIF-15)',
    typeof eolShown.strip === 'string' && eolShown.strip.length > 0 && eolShown.markers > 0,
    JSON.stringify(eolShown)
  )

  // 5. Hiding whitespace hides the strip and the markers (FDIF-16).
  await evaluate(ws, clickToggle('Ignore whitespace'))
  await sleep(1500)
  const eolHidden = await evaluate(
    ws,
    `({
       strip: document.querySelector('.diff-viewer-eol')?.textContent?.trim() ?? null,
       markers: document.querySelectorAll('.diff-viewer-eol-marker').length
     })`
  )
  check(
    'Hiding whitespace hides the strip and the markers (FDIF-16)',
    eolHidden.strip === null && eolHidden.markers === 0,
    JSON.stringify(eolHidden)
  )

  // 6. The layout toggle, and both preferences reaching the config (FDIF-11/12).
  await evaluate(ws, clickToggle('Inline'))
  await sleep(1400)
  const toggles = await evaluate(ws, activeToggles)
  const persisted = await evaluate(
    ws,
    `window.api.invoke('config:get').then((c) => ({
       layout: c.ui.diffLayout ?? null,
       ignoreWhitespace: c.ui.diffIgnoreWhitespace ?? null
     }))`
  )
  check(
    'The layout and whitespace choices are written to the config (FDIF-12/16)',
    persisted.layout === 'inline' && persisted.ignoreWhitespace === true,
    JSON.stringify({ toggles, persisted })
  )

  // Put whitespace back so the stack checks below see real diffs.
  await evaluate(ws, clickToggle('Ignore whitespace'))
  await sleep(1200)

  // 7. The All changes stack (FDIF-19..23).
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(2600)
  const stack = await evaluate(
    ws,
    `({
       sections: document.querySelectorAll('.diff-section').length,
       expanded: [...document.querySelectorAll('.diff-section-header')]
         .filter((e) => e.getAttribute('aria-expanded') === 'true').length,
       files: document.querySelector('.all-changes-files')?.textContent?.trim() ?? null,
       added: document.querySelector('.all-changes-added')?.textContent?.trim() ?? null,
       removed: document.querySelector('.all-changes-removed')?.textContent?.trim() ?? null,
       editors: ${liveDiffEditors}
     })`
  )
  check(
    'The stack opens with ten sections expanded (FDIF-21)',
    stack.sections >= 40 && stack.expanded === 10,
    JSON.stringify(stack)
  )
  // Expand past the cap before asserting it. With only the initial ten open,
  // live editors can never reach twelve and the check cannot fail — it would
  // be asserting a ceiling nothing ever approaches.
  const expandedForCap = await evaluate(
    ws,
    `(() => {
       const heads = [...document.querySelectorAll('.diff-section-header')]
         .filter((h) => h.getAttribute('aria-expanded') === 'false')
       heads.slice(0, 20).forEach((h) => h.click())
       return heads.slice(0, 20).length
     })()`
  )
  await sleep(2600)
  const afterExpand = await evaluate(
    ws,
    `({
       expanded: [...document.querySelectorAll('.diff-section-header')]
         .filter((e) => e.getAttribute('aria-expanded') === 'true').length,
       editors: ${liveDiffEditors}
     })`
  )
  check(
    'No more than twelve diff editors are live, with thirty sections open (FDIF-22)',
    afterExpand.expanded > 12 && afterExpand.editors <= 12,
    `${expandedForCap} more expanded -> ${afterExpand.expanded} open, ${afterExpand.editors} live`
  )

  // Totals against git itself.
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main'])
  const shortstat = git(['diff', '--shortstat', mergeBase, 'HEAD'])
  const gitAdded = Number((shortstat.match(/(\d+) insertion/) ?? [0, 0])[1])
  const gitRemoved = Number((shortstat.match(/(\d+) deletion/) ?? [0, 0])[1])
  const shown = {
    added: Number((stack.added ?? '').replace(/[^0-9]/g, '')),
    removed: Number((stack.removed ?? '').replace(/[^0-9]/g, ''))
  }
  check(
    'The totals match what git reports for the branch (FDIF-20)',
    shown.added === gitAdded && shown.removed === gitRemoved,
    `shown +${shown.added} -${shown.removed}, git +${gitAdded} -${gitRemoved}`
  )

  // 8. Scrolling the stack never exceeds the cap (FDIF-22).
  const stackBox = await evaluate(
    ws,
    `(() => {
       const el = document.querySelector('.all-changes-stack')
       if (!el) return null
       const r = el.getBoundingClientRect()
       return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
     })()`
  )
  let peak = stack.editors
  if (stackBox) {
    for (let i = 0; i < 25; i++) {
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: stackBox.x,
        y: stackBox.y,
        deltaX: 0,
        deltaY: 700,
        pointerType: 'mouse'
      })
      await sleep(180)
      const live = await evaluate(ws, liveDiffEditors)
      if (live > peak) peak = live
    }
  }
  check(
    'The cap holds while scrolling the whole stack (FDIF-22)',
    peak <= 12,
    `peak ${peak} live editors across 25 wheels`
  )

  // 9. Next change crosses into the following file, expanding it (FDIF-26).
  //
  // Fold everything but the first two first. The cap check above left thirty
  // sections open, and a walk through already-open sections cannot show that
  // crossing opens one — the assertion below would have nothing to observe.
  await evaluate(
    ws,
    `(() => {
       const heads = [...document.querySelectorAll('.diff-section-header')]
         .filter((h) => h.getAttribute('aria-expanded') === 'true')
       heads.slice(2).forEach((h) => h.click())
       const el = document.querySelector('.all-changes-stack')
       if (el) el.scrollTop = 0
       return heads.slice(2).length
     })()`
  )
  await sleep(2000)
  const navBefore = await evaluate(
    ws,
    `({
       expanded: [...document.querySelectorAll('.diff-section-header')]
         .filter((e) => e.getAttribute('aria-expanded') === 'true').length,
       scrollTop: Math.round(document.querySelector('.all-changes-stack')?.scrollTop ?? -1)
     })`
  )
  for (let i = 0; i < 14; i++) {
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'F5',
      code: 'F5',
      windowsVirtualKeyCode: 116,
      nativeVirtualKeyCode: 116,
      modifiers: 1
    })
    await send(ws, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'F5',
      code: 'F5',
      windowsVirtualKeyCode: 116,
      nativeVirtualKeyCode: 116,
      modifiers: 1
    })
    await sleep(320)
  }
  await sleep(900)
  const navAfter = await evaluate(
    ws,
    `({
       expanded: [...document.querySelectorAll('.diff-section-header')]
         .filter((e) => e.getAttribute('aria-expanded') === 'true').length,
       scrollTop: Math.round(document.querySelector('.all-changes-stack')?.scrollTop ?? -1)
     })`
  )
  // Both, not either: a walk that only moved the scroll never left the file it
  // started in, which is the half of FDIF-26 this check exists for.
  check(
    'Next change walks into following files, expanding them (FDIF-26)',
    navAfter.expanded > navBefore.expanded && navAfter.scrollTop > navBefore.scrollTop,
    `expanded ${navBefore.expanded} -> ${navAfter.expanded}, scrollTop ${navBefore.scrollTop} -> ${navAfter.scrollTop}`
  )

  // 10. The launcher row acts on the diff's own file (FDIF-29).
  //
  // Presence and target only: activating a launcher opens an external tool,
  // and the smoke must never do that. The hand checks cover the launch itself.
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(800)
  await evaluate(ws, clickByText('.file-tree-name', 'modified.ts'))
  await sleep(1800)
  const launcherRow = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tabs-launcher')].map((e) => e.textContent.trim())`
  )
  check(
    'A diff tab carries the launcher row (FDIF-29)',
    launcherRow.length === 4 &&
      ['Explorer', 'VS Code', '2022', '2026'].every((n) => launcherRow.some((l) => l.includes(n))),
    `launchers: ${launcherRow.join(', ') || 'none'}`
  )

  // 11. A disk change refreshes an open diff, in place (FDIF-30).
  //
  // Timed, not assumed: the requirement is "within 1 s", so the poll reports
  // how long it actually took and fails past the budget. An earlier version
  // slept 1500 ms and then asserted the content had arrived, which measures
  // nothing about the second it names. The scroll offset is asserted too,
  // because "in place" is the other half of the requirement.
  const renderedDiff = `[...document.querySelectorAll('.diff-viewer .view-line')]
       .map((l) => l.textContent.replace(/\\u00a0/g, ' '))
       .join('\\n')`
  const diffScrollTop = `Math.round(
       document.querySelector('.diff-viewer .monaco-scrollable-element')?.scrollTop ?? -1
     )`
  const scrollBefore = await evaluate(ws, diffScrollTop)
  const startedAt = Date.now()
  writeFileSync(
    join(REPO, 'src', 'modified.ts'),
    'export const value = 99\nexport const other = 2\n// appended by the smoke\n'
  )
  let arrivedAfter = null
  for (let i = 0; i < 40; i++) {
    const text = await evaluate(ws, renderedDiff)
    if (typeof text === 'string' && text.includes('appended by the smoke')) {
      arrivedAfter = Date.now() - startedAt
      break
    }
    await sleep(50)
  }
  const scrollAfter = await evaluate(ws, diffScrollTop)
  check(
    'An open diff refreshes within 1 s of a disk change, in place (FDIF-30)',
    arrivedAfter !== null && arrivedAfter <= 1000 && scrollAfter === scrollBefore,
    arrivedAfter === null
      ? 'never arrived within 2 s'
      : `arrived in ${arrivedAfter} ms, scrollTop ${scrollBefore} -> ${scrollAfter}`
  )

  // 11. Committing drops the file from All changes (FDIF-31).
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(2200)
  const beforeCommit = await evaluate(
    ws,
    `[...document.querySelectorAll('.diff-section')].map((e) => e.getAttribute('data-path'))`
  )
  git(['add', 'src/modified.ts'])
  git(['commit', '-m', 'commit the modified file'])
  await sleep(2500)
  const afterCommit = await evaluate(
    ws,
    `[...document.querySelectorAll('.diff-section')].map((e) => e.getAttribute('data-path'))`
  )
  check(
    'Committing a file drops it from the uncommitted stack (FDIF-31)',
    beforeCommit.some((p) => (p ?? '').includes('modified.ts')) &&
      !afterCommit.some((p) => (p ?? '').includes('modified.ts')),
    `${beforeCommit.length} sections -> ${afterCommit.length}`
  )

  // 12. Pinned tabs and the strip's bulk closes (FPOL-01..13).
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1600)
  // A clean strip first: every earlier section left tabs open.
  await openStripMenuMore(ws)
  await evaluate(ws, clickByText('.file-tabs-menu-item', 'Close all'))
  await sleep(500)
  for (const name of ['f00.ts', 'f01.ts', 'f02.ts', 'f03.ts', 'f04.ts'])
    await openStackFile(ws, name)
  await focusTabNamed(ws, 'f00.ts')
  check(
    'Five stack files open as five tabs after All changes',
    J(await strip(ws)) === J(['All changes', 'f00.ts', 'f01.ts', 'f02.ts', 'f03.ts', 'f04.ts']),
    J(await strip(ws))
  )

  await tabMenu(ws, 'f02.ts', 'Pin')
  await tabMenu(ws, 'f04.ts', 'Pin')
  const pinnedStrip = await strip(ws)
  const marks = await tabMarks(ws)
  check(
    'Pinning moves a tab after All changes and the tabs pinned before it (FPOL-01)',
    J(pinnedStrip) === J(['All changes', 'f02.ts', 'f04.ts', 'f00.ts', 'f01.ts', 'f03.ts']),
    J(pinnedStrip)
  )
  check(
    'A pinned tab shows a pin where its close button was (FPOL-02)',
    marks['f02.ts'] === 'pin' && marks['f04.ts'] === 'pin' && marks['f00.ts'] === 'close',
    J(marks)
  )
  check(
    'Pinning leaves the active tab where it was (FPOL-04)',
    (await activeTab(ws)) === 'f00.ts',
    await activeTab(ws)
  )

  await evaluate(ws, clickPinOf('f02.ts'))
  await sleep(400)
  const unpinnedStrip = await strip(ws)
  check(
    'Clicking the pin unpins the tab to the front of the unpinned tabs (FPOL-03)',
    J(unpinnedStrip) === J(['All changes', 'f04.ts', 'f02.ts', 'f00.ts', 'f01.ts', 'f03.ts']) &&
      (await tabMarks(ws))['f02.ts'] === 'close' &&
      (await activeTab(ws)) === 'f00.ts',
    `${J(unpinnedStrip)}, active ${await activeTab(ws)}`
  )
  await tabMenu(ws, 'f02.ts', 'Pin')

  // Opening a file already open in a pinned tab focuses that tab (edge case, FXPL-16).
  await focusTabNamed(ws, 'f00.ts')
  const beforeReopen = await strip(ws)
  await openStackFile(ws, 'f02.ts')
  check(
    'Opening a file already open in a pinned tab focuses it, pinned, with no second tab (edge case)',
    J(await strip(ws)) === J(beforeReopen) &&
      (await activeTab(ws)) === 'f02.ts' &&
      (await tabMarks(ws))['f02.ts'] === 'pin',
    `${J(await strip(ws))}, active ${await activeTab(ws)}`
  )

  // Pins belong to the worktree: another worktree has none, and they are there on return.
  git(['worktree', 'add', '-q', '-b', 'other', OTHER])
  await evaluate(ws, `(document.querySelector('.topbar-icon-btn[title="Refresh"]')?.click(), true)`)
  await sleep(1500)
  await selectBranch(ws, 'other')
  const otherPins = await evaluate(ws, `document.querySelectorAll('.file-tab-pin').length`)
  const otherStrip = await strip(ws)
  await selectBranch(ws, 'feature/diff')
  const backStrip = await strip(ws)
  check(
    'Each worktree keeps its own pinned tabs (edge case, FXPL-18)',
    otherPins === 0 &&
      !otherStrip.includes('f02.ts') &&
      J(backStrip) === J(beforeReopen) &&
      (await tabMarks(ws))['f04.ts'] === 'pin',
    `other: ${otherPins} pins ${J(otherStrip)}; back: ${J(backStrip)}`
  )

  // A pinned diff tab whose file stops being changed stays pinned and open.
  writeFileSync(join(REPO, 'stack', 'f02.ts'), 'export const n2 = 2\nexport const tail = 0\n')
  git(['add', 'stack/f02.ts'])
  git(['commit', '-q', '-m', 'put f02 back as it is on main'])
  await sleep(2600)
  const stillChanged = git(['diff', '--name-only', 'origin/main', 'HEAD']).split('\n')
  const inTree = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-name')].some((e) => e.textContent.trim() === 'f02.ts')`
  )
  check(
    'A pinned tab whose file stops being changed stays open and pinned (edge case)',
    !stillChanged.includes('stack/f02.ts') &&
      !inTree &&
      (await strip(ws)).includes('f02.ts') &&
      (await tabMarks(ws))['f02.ts'] === 'pin',
    `git lists f02: ${stillChanged.includes('stack/f02.ts')}, tree lists it: ${inTree}, strip ${J(await strip(ws))}`
  )

  // All changes carries no menu at all.
  await evaluate(ws, rightClickTab('All changes'))
  await sleep(300)
  const allChangesMenu = await menuItems(ws)
  await evaluate(ws, `(document.body.click(), true)`)
  check(
    'All changes offers neither Pin nor any close (FPOL-05)',
    allChangesMenu === null,
    J(allChangesMenu)
  )

  // A menu dismissed by Escape or by a click outside changes nothing.
  const beforeDismiss = await strip(ws)
  await evaluate(ws, rightClickTab('f01.ts'))
  await sleep(300)
  const tabItems = await menuItems(ws)
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await sleep(300)
  const afterEscape = await menuItems(ws)
  await evaluate(ws, rightClickTab('f01.ts'))
  await sleep(300)
  await evaluate(ws, `(document.querySelector('.file-tabs-launchers')?.click(), true)`)
  await sleep(300)
  const afterOutside = await menuItems(ws)
  check(
    "A tab's menu lists Pin, Close, Close others, Close to the right, Close unpinned and Close all",
    J(tabItems) ===
      J(['Pin', 'Close', 'Close others', 'Close to the right', 'Close unpinned', 'Close all']),
    J(tabItems)
  )
  check(
    'Escape and a click outside close the menu and change no tab (FPOL-13)',
    tabItems !== null &&
      afterEscape === null &&
      afterOutside === null &&
      J(await strip(ws)) === J(beforeDismiss),
    `after Escape ${J(afterEscape)}, after outside ${J(afterOutside)}`
  )

  // A click that dismisses a menu still does what it lands on, and the ⋯ menu
  // closes on Escape as a tab's does (FPOL-13 as amended 2026-09-26).
  await focusTabNamed(ws, 'f01.ts')
  await evaluate(ws, rightClickTab('f03.ts'))
  await sleep(300)
  const openBeforeTabClick = (await menuItems(ws)) !== null
  await focusTabNamed(ws, 'f00.ts')
  const afterTabClick = { menu: await menuItems(ws), active: await activeTab(ws) }
  await openStripMenuMore(ws)
  const moreOpen = (await menuItems(ws)) !== null
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
  await sleep(300)
  check(
    'A click on another tab closes the menu and activates that tab; Escape closes the ⋯ menu (FPOL-13)',
    openBeforeTabClick &&
      afterTabClick.menu === null &&
      afterTabClick.active === 'f00.ts' &&
      moreOpen &&
      (await menuItems(ws)) === null &&
      J(await strip(ws)) === J(beforeDismiss),
    `${J(afterTabClick)}, ⋯ open ${moreOpen} then ${J(await menuItems(ws))}`
  )

  // Close to the right, with the active tab among the closed ones.
  await focusTabNamed(ws, 'f03.ts')
  await tabMenu(ws, 'f00.ts', 'Close to the right')
  check(
    'Close to the right closes only the unpinned tabs right of it (FPOL-09)',
    J(await strip(ws)) === J(['All changes', 'f04.ts', 'f02.ts', 'f00.ts']),
    J(await strip(ws))
  )
  check(
    'A closed active tab hands the focus to the nearest survivor (FPOL-11)',
    (await activeTab(ws)) === 'f00.ts',
    await activeTab(ws)
  )

  for (const name of ['f01.ts', 'f03.ts']) await openStackFile(ws, name)
  await tabMenu(ws, 'f01.ts', 'Close others')
  check(
    'Close others keeps that tab and every pinned one (FPOL-08)',
    J(await strip(ws)) === J(['All changes', 'f04.ts', 'f02.ts', 'f01.ts']),
    J(await strip(ws))
  )

  for (const name of ['f00.ts', 'f03.ts']) await openStackFile(ws, name)
  await openStripMenuMore(ws)
  const moreItems = await menuItems(ws)
  await evaluate(ws, clickByText('.file-tabs-menu-item', 'Close unpinned'))
  await sleep(500)
  check(
    'The ⋯ button offers exactly Close unpinned and Close all (FPOL-12)',
    J(moreItems) === J(['Close unpinned', 'Close all']),
    J(moreItems)
  )
  check(
    'Close unpinned keeps every pinned tab and nothing else (FPOL-07)',
    J(await strip(ws)) === J(['All changes', 'f04.ts', 'f02.ts']),
    J(await strip(ws))
  )

  await tabMenu(ws, 'f04.ts', 'Close')
  check(
    'Close on a pinned tab closes it (FPOL-10)',
    J(await strip(ws)) === J(['All changes', 'f02.ts']),
    J(await strip(ws))
  )

  await openStackFile(ws, 'f00.ts')
  await focusTabNamed(ws, 'f02.ts')
  await tabMenu(ws, 'f00.ts', 'Close all')
  check(
    'Close all closes pinned tabs too and leaves All changes, focused (FPOL-06, FPOL-11)',
    J(await strip(ws)) === J(['All changes']) && (await activeTab(ws)) === 'All changes',
    `${J(await strip(ws))}, active ${await activeTab(ws)}`
  )

  // 13. Expand all and Collapse all on the All changes stack (FPOL-14..17).
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(2200)
  const stackState = `({
    sections: document.querySelectorAll('.diff-section').length,
    expanded: [...document.querySelectorAll('.diff-section-header')]
      .filter((e) => e.getAttribute('aria-expanded') === 'true').length,
    diffEditors: ${liveDiffEditors},
    monacoEditors: document.querySelectorAll('.all-changes .monaco-editor').length
  })`
  const beforeExpandAll = await evaluate(ws, stackState)
  await evaluate(ws, clickByText('.all-changes-toggle', 'Expand all'))
  await sleep(2600)
  const afterExpandAll = await evaluate(ws, stackState)
  check(
    'Expand all opens every listed section (FPOL-14)',
    beforeExpandAll.expanded < beforeExpandAll.sections &&
      afterExpandAll.sections >= 40 &&
      afterExpandAll.expanded === afterExpandAll.sections,
    `${beforeExpandAll.expanded} -> ${afterExpandAll.expanded} of ${afterExpandAll.sections}`
  )
  check(
    'With every section open, only the ones near the viewport hold an editor (FPOL-16)',
    // Every section must really be open, or the bound is met for free.
    afterExpandAll.expanded === afterExpandAll.sections &&
      afterExpandAll.diffEditors > 0 &&
      afterExpandAll.diffEditors <= 12,
    `${afterExpandAll.diffEditors} diff editors (${afterExpandAll.monacoEditors} Monaco editors) for ${afterExpandAll.expanded} open sections`
  )

  await evaluate(ws, clickByText('.all-changes-toggle', 'Collapse all'))
  await sleep(1600)
  const afterCollapseAll = await evaluate(ws, stackState)
  check(
    'Collapse all folds every listed section (FPOL-15)',
    afterCollapseAll.sections === afterExpandAll.sections &&
      afterCollapseAll.expanded === 0 &&
      afterCollapseAll.diffEditors === 0,
    J(afterCollapseAll)
  )

  // A commit tab's stack has the same two buttons (FPOL-18, owner decision 2026-09-26).
  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  await sleep(2200)
  const openedCommit = await evaluate(
    ws,
    `(() => {
       const row = [...document.querySelectorAll('.commit-row')].find(
         (r) => r.querySelector('.commit-subject')?.textContent.trim() === 'work on the branch')
       if (!row) return false
       row.querySelector('.commit-open').click()
       return true
     })()`
  )
  await sleep(2600)
  const commitBefore = await evaluate(ws, stackState)
  await evaluate(ws, clickByText('.all-changes-toggle', 'Expand all'))
  await sleep(2200)
  const commitExpanded = await evaluate(ws, stackState)
  await evaluate(ws, clickByText('.all-changes-toggle', 'Collapse all'))
  await sleep(1600)
  const commitCollapsed = await evaluate(ws, stackState)
  check(
    "A commit tab's Expand all and Collapse all open and fold every file of the commit (FPOL-18)",
    openedCommit &&
      commitBefore.sections >= 40 &&
      commitBefore.expanded < commitBefore.sections &&
      commitExpanded.expanded === commitExpanded.sections &&
      commitCollapsed.expanded === 0,
    `opened ${openedCommit}: ${commitBefore.expanded} -> ${commitExpanded.expanded} -> ${commitCollapsed.expanded} of ${commitExpanded.sections}`
  )

  // A mode with nothing listed: commit everything left, then look at Uncommitted.
  git(['add', '-A'])
  git(['commit', '-m', 'commit everything left'])
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(2600)
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(1200)
  const emptyMode = await evaluate(
    ws,
    `({
       empty: document.querySelector('.all-changes-empty')?.textContent?.trim() ?? null,
       toggles: [...document.querySelectorAll('.all-changes-toggle')].map((e) => e.textContent.trim())
     })`
  )
  check(
    'With nothing listed, Expand all and Collapse all are not shown (FPOL-17)',
    emptyMode.empty !== null && emptyMode.toggles.length === 0,
    J(emptyMode)
  )

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log('\nHand checks this smoke does NOT script:')
  console.log('  A. Read the line-ending strip on a MIXED file and judge its wording.')
  console.log('  B. Judge side-by-side against inline as the daily default.')
  ws.close()
  return failed.length
}

/* --------------------------------------------------------- after restart -- */

async function afterRestart() {
  const ws = await connect()
  await selectWorktree(ws)
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(900)
  await evaluate(ws, clickByText('.file-tree-name', 'added.ts'))
  await sleep(1800)
  const toggles = await evaluate(ws, activeToggles)
  const inline = toggles.find((t) => t.label === 'Inline')
  check(
    'The layout choice survived a restart (FDIF-12)',
    inline !== undefined && inline.pressed === 'true',
    JSON.stringify(toggles)
  )
  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  ws.close()
  return failed.length
}

/* ------------------------------------------------------------------ main -- */

if (MODE === 'seed') {
  seed()
} else if (MODE === 'clean') {
  clean()
} else if (MODE === 'after-restart') {
  process.exit((await afterRestart()) ? 1 : 0)
} else {
  process.exit((await drive()) ? 1 : 0)
}
