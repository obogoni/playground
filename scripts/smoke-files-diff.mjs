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
 * SMOKE_ONLY=glyphs on step 2 runs the status glyph sections alone (FSTS,
 * issue #131), from a fresh seed and launch like any drive. SMOKE_ONLY=discard
 * runs the discard section alone (FDSC, issue #132), the same way.
 *
 * SMOKE_ONLY=fold on step 2 runs section 14 alone (FOLD, issue #130), from a
 * fresh seed and launch like any drive.
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
 *     docs/an-unusually-long-guide-name-that-a-commit-tab-header-has-to-cut-before-its-glyph.md
 *                          added on the branch, so the branch commit has a path
 *                          its commit tab's header must cut before the glyph
 *     src/renamed-new.ts   committed as renamed-old.ts, moved on the branch
 *     crlf.txt             committed with CRLF, rewritten as LF on disk
 *     assets/logo.bin      a NUL in the first 8000 bytes; rewritten with other
 *                          bytes, uncommitted, so one header has no counts
 *     big.txt              2 MB, past the 1 MB view cap
 *     stack/f00..f39.ts    40 changed files, for the All changes stack
 *     fold/long.ts         200 lines, committed on main and never changed on
 *     fold/other.ts        120 lines, the branch; section 14 writes to them
 *     untracked.txt        untracked, so the uncommitted mode has one
 *     src/a-rather-long-untracked-file-name-that-has-to-be-cut-short-before-its-status-glyph.txt
 *                          untracked, 12 lines, a name the tree and the
 *                          header must cut before the status glyph
 *     Acme.Widget.slnx     committed on main, for the .slnx icon correction
 *     settings.json        committed on main, for the dark-theme icon rule
 *     vite.config.ts       committed on main, for the light-theme icon rule
 *
 * The discard section (FDSC) adds its own fixture when it starts, so no earlier
 * section sees it: one commit on the branch holding discard/mod.ts,
 * discard/stage.ts, discard/gone.ts, discard/old-name.ts, discard/deep/a.md and
 * discard/deep/sub/b.md, all fictitious one-liners; then, uncommitted, mod.ts
 * edited, stage.ts staged and edited again, gone.ts deleted, old-name.ts moved
 * with `git mv` to new-name-<stamp>.ts and edited, both .md files edited, an
 * untracked notes-<stamp>.txt and a staged added-<stamp>.ts (<stamp> is the
 * run's timestamp). Confirmed discards send two or three of these small files
 * to the real Recycle Bin per run.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
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

/** The seeded untracked file whose name is cut before its status glyph. */
const LONG_NAME =
  'a-rather-long-untracked-file-name-that-has-to-be-cut-short-before-its-status-glyph.txt'

/** The seeded file of the branch commit whose path a commit tab's header cuts (FSTS-21). */
const LONG_GUIDE =
  'docs/an-unusually-long-guide-name-that-a-commit-tab-header-has-to-cut-before-its-glyph.md'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)

/** Windows holds a watched directory open briefly after its watcher exits. */
const rmTree = (path) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })

const git = (args, cwd = REPO) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/**
 * A fold file: line n reads `export const <prefix>NNN = n`, and each line in
 * `changed` reads `= -n` instead.
 */
const foldText = (prefix, lines, changed = []) =>
  Array.from({ length: lines }, (_, i) => {
    const n = i + 1
    return `export const ${prefix}${String(n).padStart(3, '0')} = ${changed.includes(n) ? -n : n}`
  }).join('\n') + '\n'

/** Every line number from `from` to `to`, both included. */
const span = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

/* ------------------------------------------------------------------ seed -- */

function seed() {
  rmTree(WS_PATH)
  rmTree(ORIGIN)
  // The second worktree an earlier drive added (FXPL-18): git refuses to add it again.
  rmTree(OTHER)
  for (const dir of ['src', 'docs', 'assets', 'stack', 'fold']) {
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
  // Committed on main, so the diff modes never list them (FICN-03, FICN-15).
  writeFileSync(join(REPO, 'Acme.Widget.slnx'), '<Solution />\n')
  writeFileSync(join(REPO, 'settings.json'), '{ "theme": "dark" }\n')
  writeFileSync(join(REPO, 'vite.config.ts'), 'export default {}\n')
  for (let i = 0; i < 40; i++) {
    const name = `f${String(i).padStart(2, '0')}.ts`
    writeFileSync(join(REPO, 'stack', name), `export const n${i} = ${i}\nexport const tail = 0\n`)
  }
  // Long enough to fold; section 14 is the only one that changes them.
  writeFileSync(join(REPO, 'fold', 'long.ts'), foldText('l', 200))
  writeFileSync(join(REPO, 'fold', 'other.ts'), foldText('o', 120))

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
  // git rm takes the emptied docs/ with it. A path the commit tab must cut
  // before its glyph (FSTS-21 via FSTS-20).
  mkdirSync(join(REPO, 'docs'), { recursive: true })
  writeFileSync(join(REPO, LONG_GUIDE), '# A guide\n\nNothing in it is real.\n')
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
  // A name too long for its row and header, and a binary change with no
  // counts: the status glyph has to hold its column past both (FSTS-04/17/20).
  writeFileSync(
    join(REPO, 'src', LONG_NAME),
    Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join(LF) + LF
  )
  writeFileSync(
    join(REPO, 'assets', 'logo.bin'),
    Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47, 0x0d, 0x0a])
  )

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

/**
 * For every tab, what its buttons show (FPOL-02): `pinned` is a pressed pin
 * filled in the theme's accent before a close button, `unpinned` an outlined one
 * before a close button, `bare` neither button (All changes). Anything else is
 * spelled out, so a failure says what is on screen.
 */
const tabMarks = (ws) =>
  evaluate(
    ws,
    `(() => {
       // The accent as the browser resolves it, to compare with a computed fill.
       const probe = document.createElement('span')
       probe.style.color = 'var(--accent)'
       document.body.append(probe)
       const accent = getComputedStyle(probe).color
       probe.remove()
       return Object.fromEntries([...document.querySelectorAll('.file-tab')].map((tab) => {
         const pin = tab.querySelector('.file-tab-pin')
         const close = tab.querySelector('.file-tab-close')
         const fill = pin ? getComputedStyle(pin.querySelector('svg')).fill : null
         const pressed = pin?.getAttribute('aria-pressed') ?? null
         const pinFirst = !!pin && !!close && !!(pin.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING)
         const mark =
           pinFirst && fill === accent && pressed === 'true'
             ? 'pinned'
             : pinFirst && fill === 'none' && pressed === 'false'
               ? 'unpinned'
               : !pin && !close
                 ? 'bare'
                 : 'pin ' + (pin ? 'fill ' + fill + ' (accent ' + accent + ') pressed=' + pressed : 'none') +
                   ', close ' + (close ? 'yes' : 'no') + ', pin first ' + pinFirst
         return [(${tabName})(tab.querySelector('.file-tab-label')), mark]
       }))
     })()`
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

const clickCloseOf = (name) => `
  (() => {
    const close = (${tabElement(name)})?.querySelector('.file-tab-close')
    if (!close) return false
    close.click()
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

  // SMOKE_ONLY=glyphs runs the status glyph sections alone, for iterating on
  // them; the full drive still runs before a PR.
  if (process.env.SMOKE_ONLY === 'glyphs') {
    await glyphSetup(ws)
    await glyphTreeChecks(ws)
    await glyphHeaderChecks(ws)
    await glyphCommitChecks(ws)
    const failed = checks.filter((c) => !c.ok)
    console.log(
      `\n${checks.length - failed.length}/${checks.length} checks passed (status glyphs only)`
    )
    ws.close()
    return failed.length
  }

  // SMOKE_ONLY=discard runs the discard section alone; it builds its own fixture.
  if (process.env.SMOKE_ONLY === 'discard') {
    await discardChecks(ws)
    const failed = checks.filter((c) => !c.ok)
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed (discard only)`)
    printDiscardHandChecks()
    ws.close()
    return failed.length
  }

  // SMOKE_ONLY=fold runs section 14 alone, for iterating on it; the full drive
  // still runs before a PR.
  if (process.env.SMOKE_ONLY === 'fold') {
    await foldSetup(ws)
    await foldSection(ws)
    const failed = checks.filter((c) => !c.ok)
    console.log(
      `\n${checks.length - failed.length}/${checks.length} checks passed (section 14 only)`
    )
    ws.close()
    return failed.length
  }

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
       expanded: [...document.querySelectorAll('.diff-section-toggle')]
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
       const heads = [...document.querySelectorAll('.diff-section-toggle')]
         .filter((h) => h.getAttribute('aria-expanded') === 'false')
       heads.slice(0, 20).forEach((h) => h.click())
       return heads.slice(0, 20).length
     })()`
  )
  await sleep(2600)
  const afterExpand = await evaluate(
    ws,
    `({
       expanded: [...document.querySelectorAll('.diff-section-toggle')]
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
       const heads = [...document.querySelectorAll('.diff-section-toggle')]
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
       expanded: [...document.querySelectorAll('.diff-section-toggle')]
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
       expanded: [...document.querySelectorAll('.diff-section-toggle')]
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

  // 11. A disk change refreshes an open diff within 1 s (FDIF-30).
  //
  // Timed, not assumed: the requirement is "within 1 s", so the poll reports
  // how long it actually took and fails past the budget. An earlier version
  // slept 1500 ms and then asserted the content had arrived, which measures
  // nothing about the second it names. "In place", the scroll kept, is
  // checked in 14f2 on a file long enough to scroll: modified.ts is three
  // lines, and `.monaco-scrollable-element.scrollTop` stays 0 under Monaco's
  // virtual scrolling, so a check here read 0 -> 0 whatever happened.
  const renderedDiff = `[...document.querySelectorAll('.diff-viewer .view-line')]
       .map((l) => l.textContent.replace(/\\u00a0/g, ' '))
       .join('\\n')`
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
  check(
    'An open diff refreshes within 1 s of a disk change (FDIF-30; the scroll half is 14f2)',
    arrivedAfter !== null && arrivedAfter <= 1000,
    arrivedAfter === null ? 'never arrived within 2 s' : `arrived in ${arrivedAfter} ms`
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

  // Here, and not later: the uncommitted files the glyph checks read (crlf.txt,
  // untracked.txt, the long name, assets/logo.bin) are still uncommitted, since
  // FDIF-31 committed modified.ts alone. The icon checks reload and stay last.
  await glyphTreeChecks(ws)
  await glyphHeaderChecks(ws)
  await glyphCommitChecks(ws)

  // After the glyph sections, whose lists it would change, and before the
  // icon checks, which reload the window and stay last.
  await discardChecks(ws)

  await iconChecks(ws)

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
    'Every tab but All changes shows a pin before its close button, filled in the accent only while pinned (FPOL-02)',
    marks['All changes'] === 'bare' &&
      marks['f02.ts'] === 'pinned' &&
      marks['f04.ts'] === 'pinned' &&
      ['f00.ts', 'f01.ts', 'f03.ts'].every((name) => marks[name] === 'unpinned'),
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
      (await tabMarks(ws))['f02.ts'] === 'unpinned' &&
      (await activeTab(ws)) === 'f00.ts',
    `${J(unpinnedStrip)}, active ${await activeTab(ws)}`
  )

  // The same pin, on an unpinned tab, pins it (FPOL-03, as amended). The tab
  // pinned is not the active one, so a pin that focused its tab would show.
  await focusTabNamed(ws, 'f01.ts')
  await evaluate(ws, clickPinOf('f00.ts'))
  await sleep(400)
  const pinnedByButton = await strip(ws)
  check(
    "Clicking an unpinned tab's pin pins it, and the focus stays (FPOL-03, FPOL-04)",
    J(pinnedByButton) === J(['All changes', 'f04.ts', 'f00.ts', 'f02.ts', 'f01.ts', 'f03.ts']) &&
      (await tabMarks(ws))['f00.ts'] === 'pinned' &&
      (await activeTab(ws)) === 'f01.ts',
    `${J(pinnedByButton)}, marks ${J(await tabMarks(ws))}, active ${await activeTab(ws)}`
  )
  await evaluate(ws, clickPinOf('f00.ts'))
  await sleep(400)
  await tabMenu(ws, 'f02.ts', 'Pin')

  // Opening a file already open in a pinned tab focuses that tab (edge case, FXPL-16).
  await focusTabNamed(ws, 'f00.ts')
  const beforeReopen = await strip(ws)
  await openStackFile(ws, 'f02.ts')
  check(
    'Opening a file already open in a pinned tab focuses it, pinned, with no second tab (edge case)',
    J(await strip(ws)) === J(beforeReopen) &&
      (await activeTab(ws)) === 'f02.ts' &&
      (await tabMarks(ws))['f02.ts'] === 'pinned',
    `${J(await strip(ws))}, active ${await activeTab(ws)}`
  )

  // Pins belong to the worktree: another worktree has none, and they are there on return.
  git(['worktree', 'add', '-q', '-b', 'other', OTHER])
  await evaluate(ws, `(document.querySelector('.topbar-icon-btn[title="Refresh"]')?.click(), true)`)
  await sleep(1500)
  await selectBranch(ws, 'other')
  const otherPins = await evaluate(ws, `document.querySelectorAll('.file-tab.pinned').length`)
  const otherStrip = await strip(ws)
  await selectBranch(ws, 'feature/diff')
  const backStrip = await strip(ws)
  check(
    'Each worktree keeps its own pinned tabs (edge case, FXPL-18)',
    otherPins === 0 &&
      !otherStrip.includes('f02.ts') &&
      J(backStrip) === J(beforeReopen) &&
      (await tabMarks(ws))['f04.ts'] === 'pinned',
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
      (await tabMarks(ws))['f02.ts'] === 'pinned',
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

  // A pinned tab keeps its close button, and it closes the tab (FPOL-10, as amended).
  const beforeClose = await tabMarks(ws)
  const closedByButton = await evaluate(ws, clickCloseOf('f02.ts'))
  await sleep(400)
  check(
    "A pinned tab's close button closes it (FPOL-10)",
    beforeClose['f02.ts'] === 'pinned' &&
      closedByButton &&
      J(await strip(ws)) === J(['All changes']),
    `before ${J(beforeClose)}, clicked: ${closedByButton}, strip ${J(await strip(ws))}`
  )

  await openStackFile(ws, 'f00.ts')
  await openStackFile(ws, 'f01.ts')
  await evaluate(ws, clickPinOf('f01.ts'))
  await sleep(400)
  await focusTabNamed(ws, 'f01.ts')
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

  await foldSection(ws)

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log('\nHand checks this smoke does NOT script:')
  console.log('  A. Read the line-ending strip on a MIXED file and judge its wording.')
  console.log('  B. Judge side-by-side against inline as the daily default.')
  printDiscardHandChecks()
  ws.close()
  return failed.length
}

/* ---------------------------------------------------------------- glyphs -- */

/** The status of every changed file the seed lists, by list (FSTS-06..11). */
const ORIGIN_STATUS = {
  'src/modified.ts': 'modified',
  'src/added.ts': 'added',
  'docs/removed.md': 'deleted',
  'src/renamed-new.ts': 'renamed',
  [LONG_GUIDE]: 'added',
  ...Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`stack/f${String(i).padStart(2, '0')}.ts`, 'modified'])
  )
}
const UNCOMMITTED_STATUS = {
  'crlf.txt': 'modified',
  'untracked.txt': 'untracked',
  [`src/${LONG_NAME}`]: 'untracked',
  'assets/logo.bin': 'modified'
}

/** What each status reads, as the spec states it (FSTS-06..11). */
const GLYPHS = {
  added: { text: '+', title: 'Added' },
  modified: { text: 'M', title: 'Modified' },
  deleted: { text: 'D', title: 'Deleted' },
  renamed: { text: 'R', title: 'Renamed' },
  untracked: { text: 'U', title: 'Untracked' }
}

/**
 * Each status's tone token and the tint behind it. The tint is compared too:
 * the row's own colour is --text-muted, so an untracked glyph that lost its
 * rule would still inherit the right colour and pass on colour alone.
 */
const TONES = {
  added: { color: 'var(--green)', tint: 'color-mix(in oklab, var(--green) 16%, transparent)' },
  modified: { color: 'var(--amber)', tint: 'color-mix(in oklab, var(--amber) 16%, transparent)' },
  deleted: { color: 'var(--red)', tint: 'color-mix(in oklab, var(--red) 16%, transparent)' },
  renamed: { color: 'var(--accent)', tint: 'color-mix(in oklab, var(--accent) 16%, transparent)' },
  untracked: {
    color: 'var(--text-muted)',
    tint: 'color-mix(in oklab, var(--text-faint) 20%, transparent)'
  }
}

/** Each tone as the page computes it, from one probe per token appended to `host` and removed. */
const probeTones = (host) => `
  (() => {
    const host = document.querySelector(${JSON.stringify(host)})
    if (!host) return null
    const tones = ${JSON.stringify(TONES)}
    const read = (css, prop) => {
      const probe = document.createElement('span')
      probe.style.cssText = css
      host.appendChild(probe)
      const value = getComputedStyle(probe)[prop]
      probe.remove()
      return value
    }
    return Object.fromEntries(
      Object.entries(tones).map(([status, t]) => [
        status,
        { color: read('color: ' + t.color, 'color'), tint: read('background: ' + t.tint, 'backgroundColor') }
      ])
    )
  })()
`

/** Every element under `root` (itself included) whose text is drawn struck through. */
const STRUCK = `(root) =>
  [root, ...root.querySelectorAll('*')].filter((e) =>
    getComputedStyle(e).textDecorationLine.includes('line-through')
  )`

/**
 * Why a glyph would not be painted, empty when it is: hidden, not displayed, under
 * an element (itself included) with opacity below 1, or a box under 15 x 8 px.
 * The DOM reads its text, title, colour and place either way, so none of those
 * checks can tell a hidden glyph from a shown one.
 */
const UNPAINTED = `(glyph) => {
  const why = []
  const style = getComputedStyle(glyph)
  if (style.visibility !== 'visible') why.push('visibility ' + style.visibility)
  let hidden = null
  let faded = null
  for (let e = glyph; e && e.nodeType === 1; e = e.parentElement) {
    const own = getComputedStyle(e)
    if (!hidden && own.display === 'none') hidden = e
    if (!faded && parseFloat(own.opacity) < 1) faded = e
  }
  if (hidden) why.push('display none on ' + (hidden.className || hidden.tagName))
  if (faded) {
    why.push('opacity ' + getComputedStyle(faded).opacity + ' on ' + (faded.className || faded.tagName))
  }
  const box = glyph.getBoundingClientRect()
  if (box.width < 15 || box.height < 8) {
    why.push('box ' + box.width.toFixed(1) + ' x ' + box.height.toFixed(1))
  }
  return why
}`

/**
 * The space a row or header leaves its name or path (FSTS-22/23): from the
 * text's left edge to the end group's (or to the content edge where there is
 * none), less the row's gap and whatever sits between them, the counts. It is
 * read from the siblings, never from the text's own box, so a box cut short
 * cannot be its own measure.
 */
const SPACE_LEFT = `(text) => {
  const box = text.parentElement
  const style = getComputedStyle(box)
  const gap = parseFloat(style.columnGap) || 0
  let bound = box.getBoundingClientRect().right - parseFloat(style.paddingRight)
  let between = 0
  for (let e = text.nextElementSibling; e; e = e.nextElementSibling) {
    if (e.classList.contains('file-tree-end') || e.classList.contains('diff-section-end')) {
      bound = e.getBoundingClientRect().left - gap
      break
    }
    between += e.getBoundingClientRect().width + gap
  }
  return bound - between - text.getBoundingClientRect().left
}`

/**
 * The width the text of `el` takes on one line, from a Range over it: a range's
 * box is not clipped by its element, and unlike `scrollWidth` it is never
 * padded out to the element's own width, so a text that fits reads as such.
 */
const TEXT_WIDTH = `(el) => {
  const range = document.createRange()
  range.selectNodeContents(el)
  return range.getBoundingClientRect().width
}`

/**
 * The visible children of a row or header, in order (a box wider and taller than
 * 0, not `visibility: hidden`), and the most any of them runs into the next:
 * `prev.right − next.left`, negative for a gap (FSTS-04, 16, 20). A box that
 * runs past its space, or an end group laid over the row's end, reads positive
 * here while the DOM order and the glyph's edge still hold.
 */
const LAYOUT = `(box) => {
  const kids = [...box.children].filter((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
  })
  const name = (e) => (e.getAttribute('class') || e.tagName).split(' ')[0]
  let overlap = null
  for (let i = 0; i + 1 < kids.length; i++) {
    const px = kids[i].getBoundingClientRect().right - kids[i + 1].getBoundingClientRect().left
    if (!overlap || px > overlap.px) overlap = { px, pair: name(kids[i]) + ' over ' + name(kids[i + 1]) }
  }
  return { children: kids.length, overlap }
}`

/** Every row of the tree, with its glyph and where that glyph ends. */
const treeRows = `
  [...document.querySelectorAll('.file-tree-body .file-tree-row')].map((row) => {
    const box = row.getBoundingClientRect()
    const glyphs = [...row.querySelectorAll('.status-glyph')]
    const glyph = glyphs[0]
    const end = glyph?.parentElement
    const name = row.querySelector('.file-tree-name')
    const layout = (${LAYOUT})(row)
    return {
      path: row.getAttribute('title'),
      folder: row.querySelector('.file-tree-chevron') !== null,
      depth: Math.round((parseFloat(row.style.paddingLeft) - 8) / 13),
      glyphs: glyphs.length,
      text: glyph?.textContent ?? null,
      title: glyph?.getAttribute('title') ?? null,
      color: glyph ? getComputedStyle(glyph).color : null,
      tint: glyph ? getComputedStyle(glyph).backgroundColor : null,
      last:
        !!glyph &&
        end.classList.contains('file-tree-end') &&
        end === row.lastElementChild &&
        glyph === end.lastElementChild,
      right: glyph ? glyph.getBoundingClientRect().right : null,
      edge: box.right - parseFloat(getComputedStyle(row).paddingRight),
      // FSTS-04: the icon (or chevron and icon), the name and the end group, none
      // drawn over the next.
      children: layout.children,
      wantChildren: 3,
      overlap: layout.overlap,
      overflows: name ? name.scrollWidth > name.clientWidth : null,
      // FSTS-04: a cut name ends in an ellipsis, not a bare clip. The ellipsis is
      // drawn only on a box that clips and does not wrap (see ellipsisFaults).
      ellipsis: name ? getComputedStyle(name).textOverflow : null,
      overflowX: name ? getComputedStyle(name).overflowX : null,
      whiteSpace: name ? getComputedStyle(name).whiteSpace : null,
      // FSTS-22: the name's natural and shown widths, and the space its row leaves.
      natural: name ? (${TEXT_WIDTH})(name) : null,
      scroll: name ? name.scrollWidth : null,
      shown: name ? name.clientWidth : null,
      space: name ? (${SPACE_LEFT})(name) : null,
      struck: (${STRUCK})(row).map((e) => (e === name ? 'name' : e === row ? 'row' : e.className)),
      unpainted: glyph ? (${UNPAINTED})(glyph) : []
    }
  })
`

/** Polls `read` until `ready(value)` holds, for up to ~6 s; returns the last value either way. */
async function readWhen(ws, read, ready) {
  let value = null
  for (let i = 0; i < 20; i++) {
    value = await evaluate(ws, read)
    if (ready(value)) return value
    await sleep(300)
  }
  return value
}

/** The rows of one changed list, once every expected file row is there. */
async function listRows(ws, mode, expected) {
  await evaluate(ws, clickByText('.file-tree-mode', mode))
  await sleep(1200)
  return readWhen(ws, treeRows, (rows) =>
    Object.keys(expected).every((path) => rows.some((r) => !r.folder && r.path === path))
  )
}

/**
 * The column FSTS-01/02/16/17 name: every item holds exactly one glyph, last in
 * its row or header, ending within 1 px of the right padding, and all of them
 * within 1 px of each other. Nothing is drawn under the glyph either (FSTS-04,
 * 16, 20): the item shows all its children, and none runs more than 0.5 px into
 * the next. Returns the reasons it fails, empty when it holds.
 */
function columnFaults(items) {
  const faults = []
  for (const item of items) {
    if (item.glyphs !== 1) faults.push(`${item.path}: ${item.glyphs} glyphs`)
    else if (!item.last) faults.push(`${item.path}: glyph not last`)
    else if (Math.abs(item.right - item.edge) > 1) {
      faults.push(`${item.path}: ends at ${item.right.toFixed(1)}, edge ${item.edge.toFixed(1)}`)
    }
    if (item.children !== item.wantChildren) {
      faults.push(`${item.path}: ${item.children} of ${item.wantChildren} children visible`)
    } else if (item.overlap && item.overlap.px > 0.5) {
      faults.push(`${item.path}: ${item.overlap.pair} by ${item.overlap.px.toFixed(1)} px`)
    }
  }
  const rights = items.map((i) => i.right).filter((r) => typeof r === 'number')
  if (rights.length && Math.max(...rights) - Math.min(...rights) > 1) {
    faults.push(`rights spread ${(Math.max(...rights) - Math.min(...rights)).toFixed(1)} px`)
  }
  return faults
}

/** The children counts of a list and its worst overlap, for a check's log line. */
function layoutDetail(items) {
  const counts = [...new Set(items.map((i) => `${i.children}/${i.wantChildren}`))].join(', ')
  const worst = items
    .filter((i) => i.overlap)
    .reduce((w, i) => (!w || i.overlap.px > w.overlap.px ? i : w), null)
  return (
    `children ${counts || 'none'}; worst overlap ` +
    (worst ? `${worst.overlap.px.toFixed(1)} px (${worst.overlap.pair}, ${worst.path})` : 'none')
  )
}

/**
 * Items whose glyph colour or tint differ from the probe's for their status, over
 * `[items, expected status by path, probed tones]` lists; `seen` holds the
 * statuses met, so a caller can require all five.
 */
function toneFaultsOf(lists) {
  const faults = []
  const seen = new Set()
  for (const [items, expected, tones] of lists) {
    for (const item of items) {
      const status = expected[item.path]
      if (!status) {
        faults.push(`${item.path}: not seeded`)
        continue
      }
      seen.add(status)
      if (item.color !== tones?.[status]?.color || item.tint !== tones?.[status]?.tint) {
        faults.push(
          `${item.path}: ${item.color} on ${item.tint}, want ${tones?.[status]?.color} on ${tones?.[status]?.tint}`
        )
      }
    }
  }
  return { faults, seen }
}

/**
 * Why a name or path is not cut with a drawn ellipsis, empty when it is (FSTS-04,
 * FSTS-20). It must overflow (the precondition) and compute `text-overflow:
 * ellipsis`; but that value holds whether or not an ellipsis is drawn, and
 * Chromium draws one only on a box that clips (`overflow` hidden or clip) and
 * keeps its text on one line (`white-space: nowrap`).
 */
function ellipsisFaults(item) {
  if (!item) return ['not read']
  const why = []
  if (item.overflows !== true) why.push(`overflows ${item.overflows}`)
  if (item.ellipsis !== 'ellipsis') why.push(`text-overflow ${item.ellipsis}`)
  if (item.overflowX !== 'hidden' && item.overflowX !== 'clip') {
    why.push(`overflow-x ${item.overflowX}`)
  }
  if (item.whiteSpace !== 'nowrap') why.push(`white-space ${item.whiteSpace}`)
  return why
}

/** Items whose name or path, at its natural width, fits the space left for it (1 px spare). */
const fitting = (items) =>
  items.filter((i) => typeof i.natural === 'number' && i.natural <= i.space - 1)

/** Of the items whose text fits, those not shown whole: `scrollWidth > clientWidth` (FSTS-22, FSTS-23). */
const fitFaults = (items) =>
  fitting(items)
    .filter((i) => i.scroll > i.shown)
    .map(
      (i) =>
        `${i.path}: ${i.natural.toFixed(1)} px of text, scroll ${i.scroll} in ${i.shown} px, ${i.space.toFixed(1)} px free`
    )

/** How a cut name or path reads, for a check's log line. */
const cutDetail = (item) =>
  `overflows ${item?.overflows}, text-overflow ${item?.ellipsis}, overflow-x ${item?.overflowX}, white-space ${item?.whiteSpace}`

/** Items without a glyph, or whose glyph is not painted (FSTS-06..10: the glyph reads). */
const paintFaults = (items) =>
  items
    .filter((i) => i.glyphs < 1 || i.unpainted.length > 0)
    .map((i) => `${i.path}: ${i.glyphs < 1 ? 'no glyph' : i.unpainted.join(', ')}`)

/** Rows whose glyph text or tooltip differ from the spec's for their status. */
function glyphFaults(items, expected) {
  return items
    .filter((i) => expected[i.path])
    .filter((i) => {
      const want = GLYPHS[expected[i.path]]
      return i.text !== want.text || i.title !== want.title
    })
    .map((i) => `${i.path}: ${i.text}/${i.title}`)
}

/**
 * The state the full drive leaves before these sections, for `SMOKE_ONLY=glyphs`:
 * the inline layout FDIF-12 chose. Nothing is committed: FDIF-31 commits
 * modified.ts alone, and it is not an uncommitted file on a fresh seed.
 */
async function glyphSetup(ws) {
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(1200)
  const inline = (await evaluate(ws, activeToggles)).find((t) => t.label === 'Inline')
  if (inline?.pressed !== 'true') await evaluate(ws, clickToggle('Inline'))
  await sleep(800)
}

/** 12. The status glyphs of the tree rows (FSTS-01..11, 13..15, 22). */
async function glyphTreeChecks(ws) {
  if ((await evaluate(ws, `document.documentElement.dataset.theme`)) !== 'dark') {
    await clickThemeToggle(ws, 'dark')
  }
  const theme = await evaluate(ws, `document.documentElement.dataset.theme`)
  const origin = await listRows(ws, 'Diff to origin', ORIGIN_STATUS)
  const originTones = await evaluate(ws, probeTones('.file-tree'))
  const uncommitted = await listRows(ws, 'Uncommitted', UNCOMMITTED_STATUS)
  const uncommittedTones = await evaluate(ws, probeTones('.file-tree'))
  const originFiles = origin.filter((r) => !r.folder)
  const uncommittedFiles = uncommitted.filter((r) => !r.folder)
  const row = (rows, path) => rows.find((r) => !r.folder && r.path === path)

  // 1. The four statuses of diff to origin, each by its own row.
  const named = ['src/modified.ts', 'src/added.ts', 'docs/removed.md', 'src/renamed-new.ts']
  const namedRows = named.map((p) => row(origin, p)).filter(Boolean)
  const namedFaults = glyphFaults(namedRows, ORIGIN_STATUS)
  check(
    'Diff to origin shows M, +, D and R with their tooltips (FSTS-06..09, FSTS-11)',
    theme === 'dark' && namedRows.length === 4 && namedFaults.length === 0,
    `theme ${theme}; ${namedRows.map((r) => `${r.path.split('/').pop()} ${r.text}/${r.title}`).join(', ')}` +
      (namedFaults.length ? `; wrong: ${namedFaults.join(', ')}` : '')
  )

  // 2. Tones, against probes; the five tokens must differ or nothing is told apart.
  const { faults: toneFaults, seen } = toneFaultsOf([
    [originFiles, ORIGIN_STATUS, originTones],
    [uncommittedFiles, UNCOMMITTED_STATUS, uncommittedTones]
  ])
  const distinct = new Set(Object.values(originTones ?? {}).map((t) => t.color)).size
  check(
    'Every glyph takes its status tone, in both lists (FSTS-06..10)',
    distinct === 5 && seen.size === 5 && toneFaults.length === 0,
    `${distinct} distinct tokens, ${seen.size} statuses seen, ${originFiles.length + uncommittedFiles.length} glyphs` +
      (toneFaults.length ? `; ${toneFaults.slice(0, 3).join('; ')}` : '')
  )

  // 3. One column in diff to origin.
  const originColumn = columnFaults(originFiles)
  check(
    'Diff to origin: one glyph per file row, last, in one column at the right padding (FSTS-01..03)',
    originFiles.length === Object.keys(ORIGIN_STATUS).length && originColumn.length === 0,
    `${originFiles.length} file rows; ${layoutDetail(originFiles)}` +
      (originColumn.length ? `; ${originColumn.slice(0, 3).join('; ')}` : '')
  )

  // 4. Uncommitted: depths 0 and 1 in the same column, and U read there.
  const depthOf = (path) => row(uncommitted, path)?.depth
  const depthsHold =
    depthOf('crlf.txt') === 0 &&
    depthOf('untracked.txt') === 0 &&
    depthOf(`src/${LONG_NAME}`) === 1 &&
    depthOf('assets/logo.bin') === 1
  const uncommittedGlyphs = glyphFaults(uncommittedFiles, UNCOMMITTED_STATUS)
  const untrackedRow = row(uncommitted, 'untracked.txt')
  const uncommittedColumn = columnFaults(uncommittedFiles)
  check(
    'Uncommitted: M and U at depths 0 and 1 share one column (FSTS-01, 02, 10, 11)',
    depthsHold &&
      uncommittedFiles.length === 4 &&
      untrackedRow?.text === 'U' &&
      untrackedRow?.title === 'Untracked' &&
      uncommittedGlyphs.length === 0 &&
      uncommittedColumn.length === 0,
    `depths ${uncommittedFiles.map((r) => `${r.path.split('/').pop().slice(0, 12)}:${r.depth}`).join(', ')}; ` +
      `untracked.txt ${untrackedRow?.text}/${untrackedRow?.title}; ${layoutDetail(uncommittedFiles)}` +
      (uncommittedGlyphs.length ? `; wrong: ${uncommittedGlyphs.join(', ')}` : '') +
      (uncommittedColumn.length ? `; ${uncommittedColumn.slice(0, 3).join('; ')}` : '')
  )

  // 5. The long name is cut with an ellipsis, and its glyph keeps the column.
  const longRow = row(uncommitted, `src/${LONG_NAME}`)
  const longColumn = longRow ? columnFaults([longRow, ...uncommittedFiles]) : ['no row']
  const longCut = ellipsisFaults(longRow)
  check(
    'A name too long for its row is cut with an ellipsis and its glyph keeps the column (FSTS-04)',
    longCut.length === 0 && longColumn.length === 0,
    `${cutDetail(longRow)}; ${longRow ? layoutDetail([longRow]) : 'no row'}` +
      (longColumn.length ? `; ${longColumn.join('; ')}` : '')
  )

  // 6. No folder row carries a glyph.
  const originFolders = origin.filter((r) => r.folder)
  const uncommittedFolders = uncommitted.filter((r) => r.folder)
  const folderGlyphs = [...originFolders, ...uncommittedFolders].filter((r) => r.glyphs > 0)
  check(
    'No folder row of either list shows a status glyph (FSTS-05)',
    originFolders.length >= 3 && uncommittedFolders.length >= 2 && folderGlyphs.length === 0,
    `${originFolders.length} + ${uncommittedFolders.length} folder rows, ${folderGlyphs.length} with a glyph`
  )

  // 7. Only removed.md's name is struck, in the whole list.
  const struck = origin.flatMap((r) => r.struck.map((what) => `${r.path}:${what}`))
  check(
    "Only the deleted file's name is struck through (FSTS-13..15)",
    struck.length === 1 && struck[0] === 'docs/removed.md:name',
    `struck: ${struck.join(', ') || 'none'}`
  )

  // 8. Every glyph of both lists is painted, not only present in the DOM.
  const treeFiles = [...originFiles, ...uncommittedFiles]
  const unpainted = paintFaults(treeFiles)
  check(
    'Every tree glyph is painted: visible, opaque, full size (FSTS-06..10)',
    originFiles.length === Object.keys(ORIGIN_STATUS).length &&
      uncommittedFiles.length === Object.keys(UNCOMMITTED_STATUS).length &&
      unpainted.length === 0,
    `${treeFiles.length} file rows` +
      (unpainted.length ? `; ${unpainted.slice(0, 3).join('; ')}` : '')
  )

  // 9. A name that fits its row shows whole. Precondition: every seeded file
  // but the two long ones fits, and the long untracked name does not.
  const treeAll = [...origin, ...uncommitted]
  const fitFiles = fitting(treeFiles).length
  const treeUncut = fitFaults(treeAll)
  const seededFiles = Object.keys(ORIGIN_STATUS).length + Object.keys(UNCOMMITTED_STATUS).length
  check(
    'A name that fits its row shows whole, with no ellipsis (FSTS-22)',
    fitFiles >= seededFiles - 2 &&
      longRow !== undefined &&
      !fitting([longRow]).length &&
      treeUncut.length === 0,
    `${fitFiles} of ${treeFiles.length} file names fit (${fitting(treeAll).length} rows with folders); ` +
      `long name ${longRow?.natural?.toFixed(1)} px in ${longRow?.space?.toFixed(1)} px free` +
      (treeUncut.length ? `; ${treeUncut.slice(0, 3).join('; ')}` : '')
  )
}

/** Every section header of the stack on screen, with its glyph and where it ends. */
const stackHeaders = `
  [...document.querySelectorAll('.diff-section')].map((section) => {
    const header = section.querySelector('.diff-section-header')
    const box = header.getBoundingClientRect()
    const glyphs = [...header.querySelectorAll('.status-glyph')]
    const glyph = glyphs[0]
    const end = glyph?.parentElement
    const path = header.querySelector('.diff-section-path')
    const counts = header.querySelector('.diff-section-counts')
    const layout = (${LAYOUT})(header)
    return {
      path: section.getAttribute('data-path'),
      glyphs: glyphs.length,
      text: glyph?.textContent ?? null,
      title: glyph?.getAttribute('title') ?? null,
      status: glyph ? ([...glyph.classList].find((c) => c !== 'status-glyph') ?? null) : null,
      color: glyph ? getComputedStyle(glyph).color : null,
      tint: glyph ? getComputedStyle(glyph).backgroundColor : null,
      last:
        !!glyph &&
        end.classList.contains('diff-section-end') &&
        end === header.lastElementChild &&
        glyph === end.lastElementChild,
      // FSTS-18: nothing between the chevron and the path.
      pathSecond: header.children[1] === path,
      right: glyph ? glyph.getBoundingClientRect().right : null,
      edge: box.right - parseFloat(getComputedStyle(header).paddingRight),
      counts: counts ? Math.round(counts.getBoundingClientRect().width * 10) / 10 : null,
      // FSTS-16, 20: the chevron, the path, the counts (when there are any) and
      // the end group, none drawn over the next.
      children: layout.children,
      wantChildren: counts ? 4 : 3,
      overlap: layout.overlap,
      overflows: path ? path.scrollWidth > path.clientWidth : null,
      // FSTS-20: a cut path ends in an ellipsis, not a bare clip (see ellipsisFaults).
      ellipsis: path ? getComputedStyle(path).textOverflow : null,
      overflowX: path ? getComputedStyle(path).overflowX : null,
      whiteSpace: path ? getComputedStyle(path).whiteSpace : null,
      // FSTS-23: the path's natural and shown widths, and the space its header leaves.
      natural: path ? (${TEXT_WIDTH})(path) : null,
      scroll: path ? path.scrollWidth : null,
      shown: path ? path.clientWidth : null,
      space: path ? (${SPACE_LEFT})(path) : null,
      struck: (${STRUCK})(header).map((e) =>
        e === path ? 'path' : e === header ? 'header' : e.className
      ),
      unpainted: glyph ? (${UNPAINTED})(glyph) : []
    }
  })
`

/** The headers of one mode's All changes stack, once every expected section is there. */
async function stackRows(ws, mode, expected) {
  await evaluate(ws, clickByText('.file-tree-mode', mode))
  await sleep(1200)
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(1200)
  return readWhen(
    ws,
    stackHeaders,
    (headers) =>
      headers.length === Object.keys(expected).length &&
      Object.keys(expected).every((path) => headers.some((h) => h.path === path))
  )
}

/**
 * Narrows the page with CDP emulation, 900 px first and down to 600 px, until
 * `path`'s header is cut, and reads the stack on screen there. The override is
 * cleared in a `finally`, so a failed read never leaves the window narrowed.
 */
async function narrowUntilCut(ws, path) {
  const height = await evaluate(ws, `window.innerHeight`)
  let headers = null
  let width = null
  try {
    for (const w of [900, 800, 700, 600]) {
      await send(ws, 'Emulation.setDeviceMetricsOverride', {
        width: w,
        height,
        deviceScaleFactor: 1,
        mobile: false
      })
      await sleep(900)
      headers = await evaluate(ws, stackHeaders)
      width = w
      if (headers.find((h) => h.path === path)?.overflows) break
    }
  } finally {
    await send(ws, 'Emulation.clearDeviceMetricsOverride')
    await sleep(600)
  }
  return { headers, width }
}

/** The column faults of a stack, plus any header with something before its path. */
const headerFaults = (headers) => [
  ...columnFaults(headers),
  ...headers.filter((h) => !h.pathSecond).map((h) => `${h.path}: something before the path`)
]

/** 13. The status glyphs of the All changes section headers (FSTS-11, 16..21, 23). */
async function glyphHeaderChecks(ws) {
  const origin = await stackRows(ws, 'Diff to origin', ORIGIN_STATUS)
  const originTones = await evaluate(ws, probeTones('.all-changes-stack'))
  const uncommitted = await stackRows(ws, 'Uncommitted', UNCOMMITTED_STATUS)
  const uncommittedTones = await evaluate(ws, probeTones('.all-changes-stack'))
  const header = (headers, path) => headers.find((h) => h.path === path)

  // 1. Every header of the diff-to-origin stack reads its status.
  const named = ['src/modified.ts', 'src/added.ts', 'docs/removed.md', 'src/renamed-new.ts']
  const namedHeaders = named.map((p) => header(origin, p)).filter(Boolean)
  const originGlyphs = glyphFaults(origin, ORIGIN_STATUS)
  check(
    'The diff-to-origin stack shows M, +, D and R with their tooltips (FSTS-11, FSTS-18)',
    origin.length === Object.keys(ORIGIN_STATUS).length &&
      namedHeaders.length === 4 &&
      originGlyphs.length === 0,
    `${origin.length} headers; ${namedHeaders.map((h) => `${h.path.split('/').pop()} ${h.text}/${h.title}`).join(', ')}` +
      (originGlyphs.length ? `; wrong: ${originGlyphs.slice(0, 3).join(', ')}` : '')
  )

  // 2. One column across every header in the DOM, off-screen ones included.
  const originColumn = headerFaults(origin)
  check(
    'Diff to origin: one glyph per header, last, in one column at the right padding (FSTS-16, FSTS-18)',
    origin.length === Object.keys(ORIGIN_STATUS).length && originColumn.length === 0,
    `${origin.length} headers; ${layoutDetail(origin)}` +
      (originColumn.length ? `; ${originColumn.slice(0, 3).join('; ')}` : '')
  )

  // 3. Uncommitted: a header without counts, and counts of different widths,
  // so a glyph placed before the counts cannot line up.
  const binary = header(uncommitted, 'assets/logo.bin')
  const widths = new Set(uncommitted.filter((h) => h !== binary).map((h) => h.counts))
  const untracked = header(uncommitted, 'untracked.txt')
  const uncommittedColumn = headerFaults(uncommitted)
  check(
    'Uncommitted: the glyphs keep one column with and without counts (FSTS-11, FSTS-17)',
    binary !== undefined &&
      binary.counts === null &&
      !widths.has(null) &&
      widths.size >= 2 &&
      untracked?.text === 'U' &&
      untracked?.title === 'Untracked' &&
      uncommittedColumn.length === 0,
    `logo.bin counts ${binary ? binary.counts : 'no header'}; count widths ${[...widths].join(', ')}; ` +
      `untracked.txt ${untracked?.text}/${untracked?.title}; ${layoutDetail(uncommitted)}` +
      (uncommittedColumn.length ? `; ${uncommittedColumn.slice(0, 3).join('; ')}` : '')
  )

  // 4. Only docs/removed.md's path is struck, in the whole diff-to-origin stack.
  const struck = origin.flatMap((h) => h.struck.map((what) => `${h.path}:${what}`))
  check(
    "Only the deleted file's path is struck through in the headers (FSTS-19)",
    struck.length === 1 && struck[0] === 'docs/removed.md:path',
    `struck: ${struck.join(', ') || 'none'}`
  )

  // 5. A path too long for its header: narrow the page until it is cut.
  const longPath = `src/${LONG_NAME}`
  const { headers: narrowed, width: atWidth } = await narrowUntilCut(ws, longPath)
  const long = narrowed ? header(narrowed, longPath) : undefined
  const narrowColumn = narrowed ? headerFaults(narrowed) : ['nothing read']
  check(
    'A path too long for its header is cut with an ellipsis and its glyph keeps the column (FSTS-20)',
    ellipsisFaults(long).length === 0 &&
      narrowed.length === Object.keys(UNCOMMITTED_STATUS).length &&
      narrowColumn.length === 0,
    `at ${atWidth} px: ${cutDetail(long)}; ${layoutDetail(narrowed ?? [])}` +
      (narrowColumn.length ? `; ${narrowColumn.slice(0, 3).join('; ')}` : '')
  )

  // 6. Tones, against probes in the stack; as the tree's check 2.
  const { faults: toneFaults, seen } = toneFaultsOf([
    [origin, ORIGIN_STATUS, originTones],
    [uncommitted, UNCOMMITTED_STATUS, uncommittedTones]
  ])
  const distinct = new Set(Object.values(originTones ?? {}).map((t) => t.color)).size
  check(
    'Every header glyph takes its status tone, in both stacks (FSTS-06..10)',
    distinct === 5 &&
      seen.size === 5 &&
      origin.length + uncommitted.length ===
        Object.keys(ORIGIN_STATUS).length + Object.keys(UNCOMMITTED_STATUS).length &&
      toneFaults.length === 0,
    `${distinct} distinct tokens, ${seen.size} statuses seen, ${origin.length + uncommitted.length} glyphs` +
      (toneFaults.length ? `; ${toneFaults.slice(0, 3).join('; ')}` : '')
  )

  // 7. Every header glyph of both stacks is painted, off-screen headers included.
  const unpainted = paintFaults([...origin, ...uncommitted])
  check(
    'Every header glyph is painted: visible, opaque, full size (FSTS-06..10)',
    origin.length === Object.keys(ORIGIN_STATUS).length &&
      uncommitted.length === Object.keys(UNCOMMITTED_STATUS).length &&
      unpainted.length === 0,
    `${origin.length + uncommitted.length} headers` +
      (unpainted.length ? `; ${unpainted.slice(0, 3).join('; ')}` : '')
  )

  // 8. A path that fits its header shows whole: both stacks at full width, and
  // the narrowed stack of 4. Precondition: every seeded path but the two long
  // ones fits at full width, and the long path does not fit when narrowed.
  const fullWidth = [...origin, ...uncommitted]
  const fitPaths = fitting(fullWidth).length
  const headerUncut = fitFaults([...fullWidth, ...(narrowed ?? [])])
  check(
    'A path that fits its header shows whole, with no ellipsis (FSTS-23)',
    fitPaths >= Object.keys(ORIGIN_STATUS).length + Object.keys(UNCOMMITTED_STATUS).length - 2 &&
      long !== undefined &&
      !fitting([long]).length &&
      headerUncut.length === 0,
    `${fitPaths} of ${fullWidth.length} paths fit; narrowed to ${atWidth} px, ` +
      `${fitting(narrowed ?? []).length} fit and the long path is ${long?.natural?.toFixed(1)} px in ${long?.space?.toFixed(1)} px free` +
      (headerUncut.length ? `; ${headerUncut.slice(0, 3).join('; ')}` : '')
  )
}

/** The subject of the seed's branch commit, which holds diff to origin's 45 files. */
const BRANCH_COMMIT = 'work on the branch'

/** The labels of the open tabs, and which one is active. */
const tabStates = `
  [...document.querySelectorAll('.file-tab')].map((tab) => ({
    label: tab.querySelector('.file-tab-label')?.textContent.trim() ?? '',
    active: tab.classList.contains('active')
  }))
`

/** Whether a tab label is the branch commit's, `<sha> · work on the branch`. */
const isCommitTab = (label) => label.endsWith(` · ${BRANCH_COMMIT}`)

/**
 * 14. A commit tab's section headers read like the modes' (FSTS-16..21). The
 * commit tab mounts the same stack (CommitTab.tsx -> AllChangesTab), so the same
 * checks run over its headers; a commit-only branch in the header would fail here.
 */
async function glyphCommitChecks(ws) {
  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  // Whether the open button was found and clicked; `showing` is what says the
  // commit tab opened.
  let clicked = false
  for (let i = 0; i < 20 && !clicked; i++) {
    await sleep(500)
    clicked = await evaluate(
      ws,
      `(() => {
        const row = [...document.querySelectorAll('.commit-row')].find(
          (r) => r.querySelector('.commit-subject')?.textContent.trim() === ${JSON.stringify(BRANCH_COMMIT)}
        )
        const open = row?.querySelector('.commit-open')
        if (!open) return false
        open.click()
        return true
      })()`
    )
  }
  await sleep(1200)
  const tabs = await evaluate(ws, tabStates)
  const showing = tabs.some((t) => t.active && isCommitTab(t.label))
  const headers = await readWhen(
    ws,
    stackHeaders,
    (read) =>
      read.length === Object.keys(ORIGIN_STATUS).length &&
      Object.keys(ORIGIN_STATUS).every((p) => read.some((h) => h.path === p))
  )
  const statuses = new Set(headers.map((h) => h.status).filter(Boolean))
  const faults = [
    ...headerFaults(headers),
    ...glyphFaults(headers, ORIGIN_STATUS),
    ...paintFaults(headers)
  ]
  const struck = headers.flatMap((h) => h.struck.map((what) => `${h.path}:${what}`))

  // Narrowed until the branch commit's long path is cut: FSTS-21 holds the commit
  // tab to criterion 20 too, and at full width no commit path is cut. The width
  // before is read so the return can require the narrowing cleared.
  const widthBefore = await evaluate(ws, `window.innerWidth`)
  const { headers: narrowed, width: atWidth } = await narrowUntilCut(ws, LONG_GUIDE)
  const longGuide = narrowed?.find((h) => h.path === LONG_GUIDE)
  const narrowFaults = narrowed ? headerFaults(narrowed) : ['nothing read']

  // Back to what the icon checks and a focused run expect: no commit tab, and
  // Uncommitted's All changes stack on screen.
  await evaluate(
    ws,
    `(() => {
      const tab = [...document.querySelectorAll('.file-tab')].find((t) =>
        (t.querySelector('.file-tab-label')?.textContent.trim() ?? '').endsWith(${JSON.stringify(` · ${BRANCH_COMMIT}`)})
      )
      tab?.querySelector('.file-tab-close')?.click()
      return !!tab
    })()`
  )
  await sleep(600)
  const back = await stackRows(ws, 'Uncommitted', UNCOMMITTED_STATUS)
  const tabsAfter = await evaluate(ws, tabStates)
  const widthAfter = await evaluate(ws, `window.innerWidth`)
  // The window is back at its width, which must exceed the 900 px narrowUntilCut
  // starts at, or a narrowing left in place could read as restored.
  const restored =
    widthBefore > 900 &&
    widthAfter === widthBefore &&
    !tabsAfter.some((t) => isCommitTab(t.label)) &&
    tabsAfter.some((t) => t.active && t.label === 'All changes') &&
    back.length === Object.keys(UNCOMMITTED_STATUS).length

  check(
    "A commit tab's headers keep the glyph column, glyphs, tooltips and strike (FSTS-16..21)",
    clicked &&
      showing &&
      headers.length === Object.keys(ORIGIN_STATUS).length &&
      statuses.size >= 4 &&
      faults.length === 0 &&
      struck.length === 1 &&
      struck[0] === 'docs/removed.md:path' &&
      restored,
    `open button clicked ${clicked}; commit tab active ${showing} (${tabs.find((t) => t.active)?.label ?? 'none'}); ` +
      `${headers.length} headers, statuses ${[...statuses].join('/')}; struck ${struck.join(', ') || 'none'}; ` +
      `restored ${restored} (width ${widthBefore} px before the narrowing, ${widthAfter} px after); ` +
      layoutDetail(headers) +
      (faults.length ? `; ${faults.slice(0, 3).join('; ')}` : '')
  )
  check(
    "A commit tab's header cuts a long path with an ellipsis and its glyph keeps the column (FSTS-20, FSTS-21)",
    showing &&
      narrowed?.length === Object.keys(ORIGIN_STATUS).length &&
      ellipsisFaults(longGuide).length === 0 &&
      narrowFaults.length === 0,
    `active ${tabs.find((t) => t.active)?.label ?? 'none'}; at ${atWidth} px, ${narrowed?.length ?? 0} headers: ` +
      `${cutDetail(longGuide)}; ${layoutDetail(narrowed ?? [])}` +
      (narrowFaults.length ? `; ${narrowFaults.slice(0, 3).join('; ')}` : '')
  )
}

/* --------------------------------------------------------------- discard -- */

/** The subject of the commit the discard fixture is built on. */
const DISCARD_COMMIT = 'discard fixture'

/**
 * What each fixture file holds in that commit. Each carries a marker line, so a
 * file put back to the last commit can be read back by it.
 */
const DISCARD_COMMITTED = {
  'discard/mod.ts': 'export const mod = "committed mod marker"\n',
  'discard/stage.ts': 'export const stage = "committed stage marker"\n',
  'discard/gone.ts': 'export const gone = "committed gone marker"\n',
  'discard/old-name.ts': 'export const oldName = "committed old-name marker"\n',
  'discard/deep/a.md': '# A\n\ncommitted a marker\n',
  'discard/deep/sub/b.md': '# B\n\ncommitted b marker\n'
}

/** The confirmation's two headings, as the spec words them (FDSC-11). */
const RECYCLE_HEADING = 'These go to the Recycle Bin.'
const RESTORE_HEADING = 'These go back to the last commit. This can’t be undone.'

const repoFile = (path) => join(REPO, ...path.split('/'))

/**
 * Commits the fixture on the branch, then leaves every kind of uncommitted
 * change the discard handles, under `discard/` only: a modified file, one staged
 * and edited again, a deleted one, a rename with an edit, two edits two folders
 * deep, an untracked file and an added one. `stamp` makes the untracked, added
 * and renamed names unique to the run, so the Recycle Bin can be searched for
 * them.
 */
function writeDiscardFixture(stamp) {
  mkdirSync(repoFile('discard/deep/sub'), { recursive: true })
  for (const [path, text] of Object.entries(DISCARD_COMMITTED)) {
    writeFileSync(repoFile(path), text)
  }
  git(['add', 'discard'])
  git(['commit', '-q', '-m', DISCARD_COMMIT])

  const fx = {
    renamed: `discard/new-name-${stamp}.ts`,
    notes: `discard/notes-${stamp}.txt`,
    added: `discard/added-${stamp}.ts`
  }
  writeFileSync(repoFile('discard/mod.ts'), 'export const mod = "edited by the smoke"\n')
  writeFileSync(repoFile('discard/stage.ts'), 'export const stage = "staged edit"\n')
  git(['add', 'discard/stage.ts'])
  writeFileSync(repoFile('discard/stage.ts'), 'export const stage = "unstaged edit"\n')
  rmSync(repoFile('discard/gone.ts'))
  git(['mv', 'discard/old-name.ts', fx.renamed])
  writeFileSync(repoFile(fx.renamed), 'export const newName = "edited after the move"\n')
  writeFileSync(repoFile('discard/deep/a.md'), '# A\n\nedited a\n')
  writeFileSync(repoFile('discard/deep/sub/b.md'), '# B\n\nedited b\n')
  writeFileSync(repoFile(fx.notes), 'fictitious notes, not tracked\n')
  writeFileSync(repoFile(fx.added), 'export const added = "staged, never committed"\n')
  git(['add', fx.added])
  return fx
}

/** Every row of the tree, in the order drawn: path, folder or not, and its glyph's title. */
const discardTreeRows = `
  [...document.querySelectorAll('.file-tree-body .file-tree-row')].map((row) => ({
    path: row.getAttribute('title'),
    folder: row.querySelector('.file-tree-chevron') !== null,
    glyph: row.querySelector('.status-glyph')?.getAttribute('title') ?? null
  }))
`

/** What the discard confirmation shows, or null while it is closed. */
const discardDialog = `
  (() => {
    const panel = document.querySelector('.discard-confirm')
    if (!panel) return null
    const sessions = panel.querySelector('.discard-sessions')
    const confirm = panel.querySelector('.discard-confirm-btn')
    return {
      title: panel.querySelector('.discard-title')?.textContent.trim() ?? null,
      groups: [...panel.querySelectorAll('.discard-group')].map((g) => ({
        group: g.getAttribute('data-group'),
        heading: g.querySelector('.discard-heading')?.textContent.trim() ?? null,
        rows: [...g.querySelectorAll('.discard-row')].map((r) => r.getAttribute('data-path')),
        glyphs: [...g.querySelectorAll('.discard-row')].map((r) => r.querySelectorAll('.status-glyph').length)
      })),
      rows: [...panel.querySelectorAll('.discard-row')].map((r) => r.getAttribute('data-path')),
      sessions: sessions
        ? {
            first: sessions.firstElementChild?.classList.contains('discard-sessions-warning')
              ? sessions.firstElementChild.textContent.trim()
              : null,
            titles: [...sessions.querySelectorAll('.rwc-session-title')].map((e) => e.textContent.trim())
          }
        : null,
      confirm: confirm ? { text: confirm.textContent.trim(), disabled: confirm.disabled } : null,
      kept: [...panel.querySelectorAll('.discard-kept-row')].map((r) => ({
        path: r.getAttribute('data-path'),
        reason: r.querySelector('.discard-kept-reason')?.textContent.trim() ?? null
      })),
      buttons: [...panel.querySelectorAll('.dialog-footer button')].map((b) => b.textContent.trim())
    }
  })()
`

const ctxMenuItems = `
  document.querySelector('.file-tree-ctx-menu')
    ? [...document.querySelectorAll('.file-tree-ctx-menu .file-tree-ctx-item')].map((e) => e.textContent.trim())
    : null
`

/** The centre of the tree row titled `path`, or of `inner` inside it; null when absent. */
const rowPoint = (path, inner = null) => `
  (() => {
    const row = [...document.querySelectorAll('.file-tree-body .file-tree-row')]
      .find((r) => r.getAttribute('title') === ${JSON.stringify(path)})
    const el = row && ${inner ? `row.querySelector(${JSON.stringify(inner)})` : 'row'}
    if (!el) return null
    const r = el.getBoundingClientRect()
    const p = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    // Only a point that lands on the row itself: a list still settling can move
    // another row under a point read a moment earlier.
    return row.contains(document.elementFromPoint(p.x, p.y)) ? p : null
  })()
`

/** The `visibility` the ↶ of the row titled `path` computes to, or `none` without one. */
const rowDiscardVisibility = (path) => `
  (() => {
    const row = [...document.querySelectorAll('.file-tree-body .file-tree-row')]
      .find((r) => r.getAttribute('title') === ${JSON.stringify(path)})
    const button = row?.querySelector('.file-tree-discard')
    return button ? getComputedStyle(button).visibility : 'none'
  })()
`

/** A point of the tree column below its last row, where a click lands on nothing. */
const treeBlank = `
  (() => {
    const r = document.querySelector('.file-tree-body').getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.bottom - 12) }
  })()
`

async function pointerTo(ws, point) {
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
}

async function mouseClick(ws, point, button = 'left') {
  await pointerTo(ws, point)
  const buttons = button === 'right' ? 2 : 1
  await send(ws, 'Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: point.x,
    y: point.y,
    button,
    buttons,
    clickCount: 1
  })
  await send(ws, 'Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: point.x,
    y: point.y,
    button,
    buttons: 0,
    clickCount: 1
  })
}

async function pressEscape(ws) {
  for (const type of ['keyDown', 'keyUp']) {
    await send(ws, 'Input.dispatchKeyEvent', {
      type,
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27
    })
  }
}

/** Right-clicks the tree row titled `path`; returns whether it was there. */
async function rightClickRow(ws, path) {
  let point = null
  for (let i = 0; i < 10 && !point; i++) {
    point = await evaluate(ws, rowPoint(path))
    if (!point) await sleep(200)
  }
  if (!point) return false
  await mouseClick(ws, point, 'right')
  await sleep(300)
  return true
}

/** Opens the confirmation from the row menu of `path`; returns what it shows. */
async function discardFromMenu(ws, path) {
  if (!(await rightClickRow(ws, path))) return null
  await evaluate(ws, clickByText('.file-tree-ctx-item', 'Discard changes'))
  return readWhen(ws, discardDialog, (d) => d !== null)
}

/**
 * Leaves the confirmation by Escape, and waits for it to close. Not by Cancel:
 * check 3 must be the first to press that button, or a Cancel that confirms
 * would discard a fixture file in check 1 and be blamed on the checks after it.
 */
async function cancelDiscard(ws) {
  await pressEscape(ws)
  return readWhen(ws, discardDialog, (d) => d === null)
}

/** Whether a tree row's glyph puts it in the Recycle Bin group (FDSC-11). */
const RECYCLED_GLYPHS = new Set(['Untracked', 'Added', 'Renamed'])

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 16. Discarding uncommitted changes (FDSC, issue #132). Builds its own fixture
 * first, so no earlier section ever sees it, and leaves the uncommitted list as
 * it found it.
 */
async function discardChecks(ws) {
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1200)
  const stamp = Date.now()
  // The uncommitted list before the fixture: the section leaves it as it was.
  const before = (await evaluate(ws, discardTreeRows)).filter((r) => !r.folder).map((r) => r.path)
  const fx = writeDiscardFixture(stamp)
  const listed = [
    'discard/mod.ts',
    'discard/stage.ts',
    'discard/gone.ts',
    fx.renamed,
    'discard/deep/a.md',
    'discard/deep/sub/b.md',
    fx.notes,
    fx.added
  ]
  const shows = (read) =>
    [...before, ...listed].every((p) => read.some((r) => !r.folder && r.path === p))
  const rows = await readWhen(ws, discardTreeRows, shows)
  if (!shows(rows)) {
    check('The discard fixture shows in the uncommitted list', false, JSON.stringify(rows))
    return
  }
  await discardGestureChecks(ws, fx)
  await discardConfirmChecks(ws, fx, before)
}

/** Checks 1..10 of T20: every gesture opens the right list, and nothing else offers one. */
async function discardGestureChecks(ws, fx) {
  // 1. The file row's menu, and the list it opens (FDSC-01, 02, 10, 11, 14).
  await rightClickRow(ws, 'discard/mod.ts')
  const items = await evaluate(ws, ctxMenuItems)
  await evaluate(ws, clickByText('.file-tree-ctx-item', 'Discard changes'))
  const one = await readWhen(ws, discardDialog, (d) => d !== null)
  check(
    'A file row menu offers Discard changes, which lists that file alone (FDSC-01, 02, 10, 11, 14)',
    sameList(items, ['Discard changes']) &&
      one?.title === 'Discard changes?' &&
      sameList(one?.rows, ['discard/mod.ts']) &&
      one?.groups.length === 1 &&
      one.groups[0].group === 'restore' &&
      one.groups[0].heading === RESTORE_HEADING &&
      one?.confirm?.text === 'Discard 1 file',
    `menu ${JSON.stringify(items)}; ${JSON.stringify(one && { title: one.title, groups: one.groups, confirm: one.confirm })}`
  )
  await cancelDiscard(ws)

  // 2. The menu goes away with Escape and with a click elsewhere, and nothing
  // is discarded (FDSC-03).
  const porcelain = git(['status', '--porcelain'])
  await rightClickRow(ws, 'discard/mod.ts')
  const openedA = await evaluate(ws, ctxMenuItems)
  await pressEscape(ws)
  await sleep(300)
  const afterEscape = await evaluate(ws, ctxMenuItems)
  await rightClickRow(ws, 'discard/mod.ts')
  const openedB = await evaluate(ws, ctxMenuItems)
  await mouseClick(ws, await evaluate(ws, treeBlank))
  await sleep(300)
  const afterClick = await evaluate(ws, ctxMenuItems)
  check(
    'The row menu closes on Escape and on a click elsewhere, discarding nothing (FDSC-03)',
    openedA !== null &&
      afterEscape === null &&
      openedB !== null &&
      afterClick === null &&
      (await evaluate(ws, discardDialog)) === null &&
      git(['status', '--porcelain']) === porcelain,
    `open ${!!openedA} -> Escape ${afterEscape === null ? 'closed' : 'open'}; ` +
      `open ${!!openedB} -> click ${afterClick === null ? 'closed' : 'open'}; ` +
      `status ${git(['status', '--porcelain']) === porcelain ? 'unchanged' : 'CHANGED'}`
  )

  // 3. Cancel, Escape and a backdrop click each leave disk and index alone (FDSC-15).
  const ways = {
    Cancel: async () => {
      await evaluate(ws, clickByText('.dialog-btn-ghost', 'Cancel'))
    },
    Escape: async () => {
      await pressEscape(ws)
    },
    backdrop: async () => {
      const point = await evaluate(
        ws,
        `(() => {
          const backdrop = document.querySelector('.dialog-backdrop')
          if (!backdrop) return null
          const r = backdrop.getBoundingClientRect()
          const p = { x: Math.round(r.left + 12), y: Math.round(r.bottom - 12) }
          return document.elementFromPoint(p.x, p.y)?.classList.contains('dialog-backdrop') ? p : null
        })()`
      )
      if (point) await mouseClick(ws, point)
    }
  }
  const left = []
  for (const [way, leave] of Object.entries(ways)) {
    const opened = await discardFromMenu(ws, 'discard/mod.ts')
    await leave()
    const closed = await readWhen(ws, discardDialog, (d) => d === null)
    left.push({
      way,
      opened: opened !== null,
      closed: closed === null,
      same: git(['status', '--porcelain']) === porcelain
    })
    if (closed !== null) await cancelDiscard(ws)
  }
  check(
    'Leaving by Cancel, Escape or the backdrop changes nothing on disk or in the index (FDSC-15)',
    left.every((l) => l.opened && l.closed && l.same),
    left
      .map(
        (l) =>
          `${l.way}: ${l.opened ? 'opened' : 'NOT opened'}, ${l.closed ? 'closed' : 'still open'}, status ${l.same ? 'same' : 'CHANGED'}`
      )
      .join('; ')
  )

  // 4. A folder's menu lists every change under it, at any depth, in the tree's
  // order. The tree draws folders first, so sub/b.md comes before a.md; the
  // expectation is read from the tree itself rather than written out.
  const treeNow = await evaluate(ws, discardTreeRows)
  const underDeep = treeNow
    .filter((r) => !r.folder && r.path.startsWith('discard/deep/'))
    .map((r) => r.path)
  const folder = await discardFromMenu(ws, 'discard/deep')
  check(
    'A folder row menu lists every change under it, at any depth, in tree order (FDSC-34)',
    underDeep.length === 2 &&
      underDeep.includes('discard/deep/a.md') &&
      underDeep.includes('discard/deep/sub/b.md') &&
      sameList(folder?.rows, underDeep),
    `tree ${JSON.stringify(underDeep)}; dialog ${JSON.stringify(folder?.rows ?? null)}`
  )
  if (folder) await cancelDiscard(ws)

  // 5. The hover ↶: hidden, shown on hover and on focus, and its click opens
  // the confirmation without opening a tab (FDSC-36, 37, 11).
  await pointerTo(ws, await evaluate(ws, treeBlank))
  await sleep(200)
  const notesHidden = await evaluate(ws, rowDiscardVisibility(fx.notes))
  const folderHidden = await evaluate(ws, rowDiscardVisibility('discard'))
  await pointerTo(ws, await evaluate(ws, rowPoint(fx.notes)))
  await sleep(250)
  const notesHover = await evaluate(ws, rowDiscardVisibility(fx.notes))
  await pointerTo(ws, await evaluate(ws, rowPoint('discard')))
  await sleep(250)
  const folderHover = await evaluate(ws, rowDiscardVisibility('discard'))
  await pointerTo(ws, await evaluate(ws, treeBlank))
  await sleep(250)
  const notesOff = await evaluate(ws, rowDiscardVisibility(fx.notes))
  await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-body .file-tree-row')]
       .find((r) => r.getAttribute('title') === ${JSON.stringify(fx.notes)})
       ?.querySelector('.file-tree-open')?.focus()`
  )
  await sleep(200)
  const notesFocus = await evaluate(ws, rowDiscardVisibility(fx.notes))
  await evaluate(ws, `document.activeElement?.blur()`)
  const tabsBefore = await evaluate(ws, `document.querySelectorAll('.file-tab').length`)
  await pointerTo(ws, await evaluate(ws, rowPoint(fx.notes)))
  await sleep(250)
  const undoPoint = await evaluate(ws, rowPoint(fx.notes, '.file-tree-discard'))
  if (undoPoint) await mouseClick(ws, undoPoint)
  const hovered = await readWhen(ws, discardDialog, (d) => d !== null)
  // Past the tree's 250 ms double-click window, so a tab the click opened is there.
  await sleep(500)
  const tabsAfter = await evaluate(ws, `document.querySelectorAll('.file-tab').length`)
  check(
    'A row ↶ shows on hover and focus only, and opens that row’s files without a tab (FDSC-36, 37, 11)',
    notesHidden === 'hidden' &&
      folderHidden === 'hidden' &&
      notesHover === 'visible' &&
      folderHover === 'visible' &&
      notesOff === 'hidden' &&
      notesFocus === 'visible' &&
      sameList(hovered?.rows, [fx.notes]) &&
      hovered?.groups.length === 1 &&
      hovered.groups[0].group === 'recycle' &&
      hovered.groups[0].heading === RECYCLE_HEADING &&
      tabsAfter === tabsBefore,
    `file ${notesHidden} -> hover ${notesHover} -> off ${notesOff} -> focus ${notesFocus}; ` +
      `folder ${folderHidden} -> hover ${folderHover}; dialog ${JSON.stringify(hovered?.groups ?? null)}; ` +
      `tabs ${tabsBefore} -> ${tabsAfter}`
  )
  if (hovered) await cancelDiscard(ws)
  await pointerTo(ws, await evaluate(ws, treeBlank))

  // 6. Discard all lists the whole uncommitted list (FDSC-10, 11, 13, 14, 35).
  // The dialog shows the Recycle Bin group first, then the restore group, each
  // in tree order; so each group is held against the tree's file rows of that
  // group, in tree order, and the two together against the tree's file rows as
  // a set.
  const allLabel = await evaluate(
    ws,
    `document.querySelector('.file-tree-discard-all')?.textContent.trim() ?? null`
  )
  const treeAll = (await evaluate(ws, discardTreeRows)).filter((r) => !r.folder)
  await evaluate(ws, `document.querySelector('.file-tree-discard-all')?.click()`)
  const all = await readWhen(ws, discardDialog, (d) => d !== null)
  const wantRecycle = treeAll.filter((r) => RECYCLED_GLYPHS.has(r.glyph)).map((r) => r.path)
  const wantRestore = treeAll.filter((r) => !RECYCLED_GLYPHS.has(r.glyph)).map((r) => r.path)
  const group = (name) => all?.groups.find((g) => g.group === name)
  const everyRow = all?.rows ?? []
  const n = everyRow.length
  check(
    'Discard all lists every uncommitted file by group, in tree order, with glyphs and headings (FDSC-10, 11, 13, 14, 35)',
    allLabel === 'Discard all' &&
      wantRecycle.length > 0 &&
      wantRestore.length > 0 &&
      sameList(group('recycle')?.rows, wantRecycle) &&
      sameList(group('restore')?.rows, wantRestore) &&
      sameList([...everyRow].sort(), treeAll.map((r) => r.path).sort()) &&
      all.groups.every((g) => g.glyphs.every((count) => count === 1)) &&
      group('recycle')?.heading === RECYCLE_HEADING &&
      group('restore')?.heading === RESTORE_HEADING &&
      all.confirm?.text === `Discard ${n} files` &&
      all.sessions === null,
    `label ${allLabel}; recycle ${group('recycle')?.rows.length ?? 0}/${wantRecycle.length}, ` +
      `restore ${group('restore')?.rows.length ?? 0}/${wantRestore.length}; button ${all?.confirm?.text}; ` +
      `sessions ${all?.sessions ? 'shown' : 'none'}`
  )
  if (all) await cancelDiscard(ws)

  // 7. A session running in the worktree is named (FDSC-12). An ad-hoc shell,
  // never a registry agent, and never sent any input.
  const spawned = []
  try {
    const worktree = await evaluate(
      ws,
      `(async () => {
        for (const node of await window.api.invoke('tree:get')) {
          for (const repo of node.repos ?? []) {
            for (const w of repo.worktrees ?? []) if (w.branch === 'feature/diff') return w.path
          }
        }
        return null
      })()`
    )
    const session = await evaluate(
      ws,
      `(async () => {
        const s = await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${JSON.stringify(worktree)}, adhocCommand: 'pwsh -NoLogo' })
        return { id: s.id, title: s.title }
      })()`
    )
    spawned.push(session.id)
    // A direct-IPC spawn pushes no event; stopping a second one does, and makes
    // the renderer re-read its sessions (as smoke-activity does). Stopped, it is
    // not running, so it is not one the warning may name.
    const nudge = await evaluate(
      ws,
      `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${JSON.stringify(worktree)}, adhocCommand: 'cmd /c exit' })).id)()`
    )
    spawned.push(nudge)
    await evaluate(
      ws,
      `(async () => { try { await window.api.invoke('sessions:stop', { id: ${JSON.stringify(nudge)} }) } catch {} return true })()`
    )
    await sleep(1500)
    await evaluate(ws, `document.querySelector('.file-tree-discard-all')?.click()`)
    const warned = await readWhen(ws, discardDialog, (d) => d?.sessions?.titles?.length > 0)
    check(
      'A running session in the worktree is warned about, by title (FDSC-12)',
      warned?.sessions?.first ===
        '1 session is running in this worktree and may be using these files.' &&
        sameList(warned.sessions.titles, [session.title]),
      `worktree ${worktree ? 'found' : 'MISSING'}; ${JSON.stringify(warned?.sessions ?? null)}; session "${session.title}"`
    )
    if (warned) await cancelDiscard(ws)
  } finally {
    await evaluate(
      ws,
      `(async () => {
        for (const id of ${JSON.stringify(spawned)}) {
          try { await window.api.invoke('sessions:stop', { id }) } catch {}
          try { await window.api.invoke('sessions:remove', { id }) } catch {}
        }
        return true
      })()`
    )
  }

  // 8. The All changes section ↶, which neither folds nor unfolds (FDSC-38, 39).
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  const headers = await readWhen(
    ws,
    `[...document.querySelectorAll('.diff-section')].map((s) => ({
       path: s.getAttribute('data-path'),
       discards: [...s.querySelectorAll('.diff-section-header .diff-section-discard')].map((b) => b.getAttribute('title'))
     }))`,
    (read) => read.some((h) => h.path === 'discard/mod.ts')
  )
  const sectionAt = `[...document.querySelectorAll('.diff-section')].find((s) => s.getAttribute('data-path') === 'discard/mod.ts')`
  const expandedBefore = await evaluate(
    ws,
    `${sectionAt}?.querySelector('.diff-section-toggle')?.getAttribute('aria-expanded') ?? null`
  )
  await evaluate(ws, `${sectionAt}?.querySelector('.diff-section-discard')?.click()`)
  const fromSection = await readWhen(ws, discardDialog, (d) => d !== null)
  await sleep(400)
  const expandedAfter = await evaluate(
    ws,
    `${sectionAt}?.querySelector('.diff-section-toggle')?.getAttribute('aria-expanded') ?? null`
  )
  check(
    'Each uncommitted section header has a ↶ that lists its file and leaves the fold alone (FDSC-38, 39)',
    headers.length > 0 &&
      headers.every((h) => sameList(h.discards, ['Discard changes'])) &&
      sameList(fromSection?.rows, ['discard/mod.ts']) &&
      expandedBefore !== null &&
      expandedAfter === expandedBefore,
    `${headers.filter((h) => sameList(h.discards, ['Discard changes'])).length} of ${headers.length} headers with one ↶; ` +
      `dialog ${JSON.stringify(fromSection?.rows ?? null)}; expanded ${expandedBefore} -> ${expandedAfter}`
  )
  if (fromSection) await cancelDiscard(ws)

  // 9. Read-only elsewhere (FDSC-40, 41). Checks 1, 5, 6 and 8 proved each
  // control exists; here none of them may.
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await readWhen(ws, discardTreeRows, (read) => read.some((r) => r.path === 'discard/mod.ts'))
  const originMenuOpened = await rightClickRow(ws, 'discard/mod.ts')
  const originMenu = await evaluate(ws, ctxMenuItems)
  await pressEscape(ws)
  const originControls = await evaluate(
    ws,
    `({ undo: document.querySelectorAll('.file-tree-discard').length,
        all: document.querySelectorAll('.file-tree-discard-all').length })`
  )
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  const originSections = await readWhen(
    ws,
    `({ sections: document.querySelectorAll('.diff-section').length,
        undo: document.querySelectorAll('.diff-section-discard').length })`,
    (read) => read.sections > 0
  )
  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  let commitOpened = false
  for (let i = 0; i < 20 && !commitOpened; i++) {
    await sleep(500)
    commitOpened = await evaluate(
      ws,
      `(() => {
        const row = [...document.querySelectorAll('.commit-row')].find(
          (r) => r.querySelector('.commit-subject')?.textContent.trim() === ${JSON.stringify(DISCARD_COMMIT)}
        )
        const open = row?.querySelector('.commit-open')
        if (!open) return false
        open.click()
        return true
      })()`
    )
  }
  const commitSections = await readWhen(
    ws,
    `({ active: [...document.querySelectorAll('.file-tab.active .file-tab-label')].map((e) => e.textContent.trim())[0] ?? null,
        sections: document.querySelectorAll('.diff-section').length,
        undo: document.querySelectorAll('.diff-section-discard').length })`,
    (read) => (read.active ?? '').endsWith(` · ${DISCARD_COMMIT}`) && read.sections > 0
  )
  await evaluate(
    ws,
    `(() => {
      const tab = [...document.querySelectorAll('.file-tab')].find((t) =>
        (t.querySelector('.file-tab-label')?.textContent.trim() ?? '').endsWith(${JSON.stringify(` · ${DISCARD_COMMIT}`)})
      )
      tab?.querySelector('.file-tab-close')?.click()
      return !!tab
    })()`
  )
  check(
    'Diff to origin and commit tabs offer no discard at all (FDSC-40, 41)',
    originMenuOpened &&
      originMenu === null &&
      originControls.undo === 0 &&
      originControls.all === 0 &&
      originSections.sections > 0 &&
      originSections.undo === 0 &&
      commitOpened &&
      (commitSections.active ?? '').endsWith(` · ${DISCARD_COMMIT}`) &&
      commitSections.sections > 0 &&
      commitSections.undo === 0,
    `origin: menu ${originMenu ? 'OPEN' : 'none'}, ${originControls.undo} row ↶, ${originControls.all} Discard all, ` +
      `${originSections.undo} of ${originSections.sections} sections with ↶; ` +
      `commit tab ${commitSections.active}: ${commitSections.undo} of ${commitSections.sections} sections with ↶`
  )

  // 10. An uncommitted rename compares against the old file (FDSC-24, 25). Read
  // side by side, where the original pane is drawn; the layout is put back after.
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await readWhen(ws, discardTreeRows, (read) => read.some((r) => r.path === fx.renamed))
  await evaluate(ws, clickByText('.file-tree-name', fx.renamed.split('/').pop()))
  await sleep(1500)
  const wasInline =
    (await evaluate(ws, activeToggles)).find((t) => t.label === 'Inline')?.pressed === 'true'
  if (wasInline) await evaluate(ws, clickToggle('Inline'))
  const sides = await readWhen(
    ws,
    `({
       active: [...document.querySelectorAll('.file-tab.active .file-tab-label')].map((e) => e.textContent.trim())[0] ?? null,
       panes: [...document.querySelectorAll('.diff-viewer .monaco-diff-editor .editor')].map((p) =>
         [...p.querySelectorAll('.view-line')].map((l) => l.textContent.replace(/\\u00a0/g, ' ')).join('\\n')),
       error: document.querySelector('.diff-viewer-error')?.textContent ?? null,
       placeholder: document.querySelectorAll('.file-tabs-body .file-placeholder').length
     })`,
    (read) => read.error !== null || (read.panes[0] ?? '').includes('marker')
  )
  if (wasInline) await evaluate(ws, clickToggle('Inline'))
  check(
    'An uncommitted rename diff reads its old file on the original side (FDSC-24, 25)',
    (sides.panes[0] ?? '').includes('committed old-name marker') &&
      (sides.panes[1] ?? '').includes('edited after the move') &&
      sides.error === null &&
      sides.placeholder === 0,
    `tab ${sides.active}; original ${JSON.stringify((sides.panes[0] ?? '').slice(0, 60))}; ` +
      `modified ${JSON.stringify((sides.panes[1] ?? '').slice(0, 60))}; error ${sides.error}; placeholders ${sides.placeholder}`
  )
}

/** The open tabs, in strip order: path (the label's title), diff or file, active. */
const discardTabs = `
  [...document.querySelectorAll('.file-tab')].map((t) => ({
    title: t.querySelector('.file-tab-label')?.getAttribute('title') ?? null,
    diff: t.querySelector('.file-tab-glyph') !== null,
    active: t.classList.contains('active')
  }))
`

/** The status bar's change count, or null without one. */
const changesCount = `
  (() => {
    const text = document.querySelector('.status-bar-changes')?.textContent.trim()
    return text ? Number(text) : null
  })()
`

/** Focuses the file tab (not a diff tab) of `path`; returns whether it was open. */
const focusFileTab = (path) => `
  (() => {
    const tab = [...document.querySelectorAll('.file-tab')].find(
      (t) => t.querySelector('.file-tab-label')?.getAttribute('title') === ${JSON.stringify(path)} &&
        !t.querySelector('.file-tab-glyph')
    )
    tab?.querySelector('.file-tab-label')?.click()
    return !!tab
  })()
`

const fileTabText = `
  [...document.querySelectorAll('.code-viewer-editor .view-line')]
    .map((l) => l.textContent.replace(/\\u00a0/g, ' '))
    .join('\\n')
`

/**
 * Records, on every change of the page, the confirm button's text and whether
 * it is disabled, and whether a kept row ever shows (FDSC-16, 19).
 */
const watchConfirm = `
  (() => {
    window.__discardObserver?.disconnect()
    window.__discardSeen = []
    const record = () => {
      const button = document.querySelector('.discard-confirm-btn')
      if (button) window.__discardSeen.push({ text: button.textContent.trim(), disabled: button.disabled })
      if (document.querySelector('.discard-kept-row')) window.__discardSeen.push({ kept: true })
    }
    window.__discardObserver = new MutationObserver(record)
    window.__discardObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true
    })
    return true
  })()
`
const confirmSeen = `(() => { window.__discardObserver?.disconnect(); return window.__discardSeen ?? [] })()`

/**
 * Presses the confirm button, but only when the open dialog lists exactly
 * `paths`; otherwise leaves it and says what it listed, so the smoke never
 * discards a file it did not mean to. Waits for the dialog to close or to list
 * what it kept.
 */
async function confirmDiscard(ws, dialog, paths) {
  if (!dialog) return 'not opened'
  if (!sameList(dialog.rows, paths)) {
    await cancelDiscard(ws)
    return `listed ${JSON.stringify(dialog.rows)}`
  }
  await evaluate(ws, `document.querySelector('.discard-confirm-btn')?.click()`)
  return readWhen(ws, discardDialog, (d) => d === null || d.kept.length > 0)
}

/** Hovers the row of `path` and clicks its ↶; returns what the confirmation shows. */
async function discardFromUndo(ws, path) {
  const row = await evaluate(ws, rowPoint(path))
  if (!row) return null
  await pointerTo(ws, row)
  await sleep(250)
  const undo = await evaluate(ws, rowPoint(path, '.file-tree-discard'))
  if (!undo) return null
  await mouseClick(ws, undo)
  const dialog = await readWhen(ws, discardDialog, (d) => d !== null)
  await pointerTo(ws, await evaluate(ws, treeBlank))
  return dialog
}

/** The names the Windows Recycle Bin lists, read through the shell (never printed whole). */
function recycleBinNames() {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '(New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $_.Name }'
    ],
    { encoding: 'utf8', windowsHide: true }
  )
  return out.split(/\r?\n/).filter(Boolean)
}

/** Whether the Recycle Bin holds an item named after `path` (its name may hide the extension). */
const inRecycleBin = (names, path) => {
  const stem = path
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '')
  return names.some((name) => name.includes(stem))
}

const porcelainOf = (...paths) => git(['status', '--porcelain', '--', ...paths])
const porcelainCount = () => git(['status', '--porcelain']).split('\n').filter(Boolean).length
const inIndex = (path) => git(['ls-files', '--', path]) !== ''
const readRepoFile = (path) =>
  existsSync(repoFile(path)) ? readFileSync(repoFile(path), 'utf8') : null

/** Checks 1..8 of T21: what confirming a discard changes, on disk, in git and on screen. */
async function discardConfirmChecks(ws, fx, before) {
  const stamp = fx.notes.match(/notes-(\d+)/)[1]

  // 1. A modified file: the observer sees the running state, git is clean, the
  // uncommitted diff tab closes, the diff-to-origin one stays, the file tab
  // shows the committed text, and the list and the status bar move
  // (FDSC-04, 16, 19, 28, 29, 31, 33). Both diff tabs carry the same label and
  // title, so they are told apart by count: two before, one after.
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await readWhen(ws, discardTreeRows, (read) => read.some((r) => r.path === 'discard/mod.ts'))
  await evaluate(ws, clickByText('.file-tree-name', 'mod.ts'))
  await sleep(1200)
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await readWhen(ws, discardTreeRows, (read) => read.some((r) => r.path === 'discard/mod.ts'))
  await evaluate(ws, clickByText('.file-tree-name', 'mod.ts'))
  await sleep(1200)
  await evaluate(ws, clickByText('.file-tabs-toggle', 'Open file'))
  await sleep(1200)
  const modTabsBefore = (await evaluate(ws, discardTabs)).filter(
    (t) => t.title === 'discard/mod.ts'
  )
  // The fixture reached the status bar only through this refresh: the counter
  // has no watcher of its own, which is why a discard must refresh it.
  await evaluate(ws, `document.querySelector('.topbar-icon-btn[title="Refresh"]')?.click()`)
  const wantBefore = porcelainCount()
  const countBefore = await readWhen(ws, changesCount, (n) => n === wantBefore)
  await evaluate(ws, watchConfirm)
  const modOpened = await discardFromMenu(ws, 'discard/mod.ts')
  const modDone = await confirmDiscard(ws, modOpened, ['discard/mod.ts'])
  const seen = await evaluate(ws, confirmSeen)
  let countAfter = null
  for (let i = 0; i < 10; i++) {
    countAfter = await evaluate(ws, changesCount)
    if (countAfter === countBefore - 1) break
    await sleep(300)
  }
  const modTabsAfter = (await evaluate(ws, discardTabs)).filter((t) => t.title === 'discard/mod.ts')
  await evaluate(ws, focusFileTab('discard/mod.ts'))
  const modText = await readWhen(ws, fileTabText, (t) => t.includes('committed mod marker'))
  const modListed = (await evaluate(ws, discardTreeRows)).some((r) => r.path === 'discard/mod.ts')
  const running = seen.some((s) => s.text === 'Discarding…' && s.disabled === true)
  const keptShown = seen.some((s) => s.kept)
  check(
    'Discarding a modified file cleans it in git, closes its uncommitted diff only, reloads its file tab and moves the counts (FDSC-04, 16, 19, 28, 29, 31, 33)',
    modOpened !== null &&
      running &&
      modDone === null &&
      !keptShown &&
      porcelainOf('discard/mod.ts') === '' &&
      modTabsBefore.filter((t) => t.diff).length === 2 &&
      modTabsBefore.filter((t) => !t.diff).length === 1 &&
      modTabsAfter.filter((t) => t.diff).length === 1 &&
      modTabsAfter.filter((t) => !t.diff).length === 1 &&
      modText.includes('committed mod marker') &&
      !modListed &&
      countBefore === wantBefore &&
      countAfter === countBefore - 1,
    `observer saw Discarding… disabled: ${running}; closed ${modDone === null}, kept shown ${keptShown}; ` +
      `git "${porcelainOf('discard/mod.ts')}"; mod.ts diff tabs ${modTabsBefore.filter((t) => t.diff).length} -> ` +
      `${modTabsAfter.filter((t) => t.diff).length}, file tabs ${modTabsBefore.filter((t) => !t.diff).length} -> ` +
      `${modTabsAfter.filter((t) => !t.diff).length}; file tab committed ${modText.includes('committed mod marker')}; ` +
      `listed ${modListed}; status bar ${countBefore} (git ${wantBefore}) -> ${countAfter}`
  )

  // 2. Staged and unstaged edits both go (FDSC-04).
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  const stageOpened = await discardFromUndo(ws, 'discard/stage.ts')
  const stageDone = await confirmDiscard(ws, stageOpened, ['discard/stage.ts'])
  const cached = git(['diff', '--cached', '--name-only'])
  const worktreeDiff = git(['diff', '--name-only'])
  check(
    'Discarding a staged and edited file clears both its index and its working copy (FDSC-04)',
    stageOpened !== null &&
      stageDone === null &&
      !cached.split('\n').includes('discard/stage.ts') &&
      !worktreeDiff.split('\n').includes('discard/stage.ts'),
    `opened ${stageOpened !== null}, closed ${stageDone === null}; ` +
      `cached ${cached.includes('discard/stage.ts') ? 'LISTS it' : 'clean'}, ` +
      `working copy ${worktreeDiff.includes('discard/stage.ts') ? 'LISTS it' : 'clean'}`
  )

  // 3. A deleted file comes back as committed (FDSC-05).
  const goneOpened = await discardFromMenu(ws, 'discard/gone.ts')
  const goneDone = await confirmDiscard(ws, goneOpened, ['discard/gone.ts'])
  const goneText = readRepoFile('discard/gone.ts')
  check(
    'Discarding a deleted file brings it back as committed (FDSC-05)',
    goneOpened !== null &&
      goneDone === null &&
      goneText === DISCARD_COMMITTED['discard/gone.ts'] &&
      porcelainOf('discard/gone.ts') === '',
    `opened ${goneOpened !== null}, closed ${goneDone === null}; on disk ${JSON.stringify(goneText)}; ` +
      `git "${porcelainOf('discard/gone.ts')}"`
  )

  // 4. An untracked file goes to the Recycle Bin and its file tab closes
  // (FDSC-06, 17, 30).
  await evaluate(ws, clickByText('.file-tree-name', fx.notes.split('/').pop()))
  await sleep(1200)
  await evaluate(ws, clickByText('.file-tabs-toggle', 'Open file'))
  await sleep(1200)
  const notesTabsBefore = (await evaluate(ws, discardTabs)).filter((t) => t.title === fx.notes)
  const notesOpened = await discardFromMenu(ws, fx.notes)
  const notesDone = await confirmDiscard(ws, notesOpened, [fx.notes])
  await sleep(300)
  const notesTabsAfter = (await evaluate(ws, discardTabs)).filter((t) => t.title === fx.notes)
  const binAfterNotes = recycleBinNames()
  check(
    'Discarding an untracked file moves it to the Recycle Bin and closes its file tab (FDSC-06, 17, 30)',
    notesOpened !== null &&
      notesDone === null &&
      !existsSync(repoFile(fx.notes)) &&
      notesTabsBefore.some((t) => !t.diff) &&
      notesTabsAfter.length === 0 &&
      inRecycleBin(binAfterNotes, fx.notes),
    `opened ${notesOpened !== null}, closed ${notesDone === null}; on disk ${existsSync(repoFile(fx.notes))}; ` +
      `tabs ${notesTabsBefore.length} -> ${notesTabsAfter.length}; in the Recycle Bin ${inRecycleBin(binAfterNotes, fx.notes)}`
  )

  // 5. An added file goes to the Recycle Bin and leaves the index (FDSC-07).
  const addedOpened = await discardFromMenu(ws, fx.added)
  const addedDone = await confirmDiscard(ws, addedOpened, [fx.added])
  const binAfterAdded = recycleBinNames()
  check(
    'Discarding an added file moves it to the Recycle Bin and drops its index entry (FDSC-07)',
    addedOpened !== null &&
      addedDone === null &&
      !existsSync(repoFile(fx.added)) &&
      !inIndex(fx.added) &&
      inRecycleBin(binAfterAdded, fx.added),
    `opened ${addedOpened !== null}, closed ${addedDone === null}; on disk ${existsSync(repoFile(fx.added))}; ` +
      `in the index ${inIndex(fx.added)}; in the Recycle Bin ${inRecycleBin(binAfterAdded, fx.added)}`
  )

  // 6. A rename: the old path back as committed, the new file to the Recycle
  // Bin and out of the index (FDSC-26).
  const renameOpened = await discardFromMenu(ws, fx.renamed)
  const renameDone = await confirmDiscard(ws, renameOpened, [fx.renamed])
  const oldText = readRepoFile('discard/old-name.ts')
  const binAfterRename = recycleBinNames()
  const renameStatus = git(['status', '--porcelain', '--', 'discard/'])
  check(
    'Discarding a rename restores the old path and bins the new file (FDSC-26)',
    renameOpened !== null &&
      renameDone === null &&
      oldText === DISCARD_COMMITTED['discard/old-name.ts'] &&
      !existsSync(repoFile(fx.renamed)) &&
      !inIndex(fx.renamed) &&
      inRecycleBin(binAfterRename, fx.renamed) &&
      !renameStatus.includes('old-name') &&
      !renameStatus.includes('new-name'),
    `opened ${renameOpened !== null}, closed ${renameDone === null}; old path ${JSON.stringify(oldText)}; ` +
      `new file on disk ${existsSync(repoFile(fx.renamed))}, in the index ${inIndex(fx.renamed)}, ` +
      `in the Recycle Bin ${inRecycleBin(binAfterRename, fx.renamed)}; status ${JSON.stringify(renameStatus)}`
  )

  // 7. A file git cannot restore is kept, with git's line, and its tabs stay
  // (FDSC-20, 21, 32, 51).
  await evaluate(ws, clickByText('.file-tree-name', 'a.md'))
  await sleep(1200)
  const aTabsBefore = (await evaluate(ws, discardTabs)).filter(
    (t) => t.title === 'discard/deep/a.md'
  )
  const lock = join(REPO, '.git', 'index.lock')
  let kept = null
  let closedByClose = null
  try {
    writeFileSync(lock, '')
    const aOpened = await discardFromMenu(ws, 'discard/deep/a.md')
    const done = await confirmDiscard(ws, aOpened, ['discard/deep/a.md'])
    kept = typeof done === 'string' ? null : done
    await evaluate(ws, clickByText('.dialog-btn-primary', 'Close'))
    closedByClose = (await readWhen(ws, discardDialog, (d) => d === null)) === null
  } finally {
    rmSync(lock, { force: true })
  }
  const aTabsAfter = (await evaluate(ws, discardTabs)).filter(
    (t) => t.title === 'discard/deep/a.md'
  )
  const aStatus = porcelainOf('discard/deep/a.md')
  check(
    'A file git cannot restore is listed as kept with git’s line, and stays as it was (FDSC-20, 21, 32, 51)',
    kept?.title === 'Some changes were kept' &&
      kept.kept.length === 1 &&
      kept.kept[0].path === 'discard/deep/a.md' &&
      (kept.kept[0].reason ?? '').includes('index.lock') &&
      sameList(kept.buttons, ['Close']) &&
      closedByClose === true &&
      aStatus === 'M discard/deep/a.md' &&
      aTabsBefore.length > 0 &&
      sameList(aTabsAfter, aTabsBefore),
    `${JSON.stringify(kept && { title: kept.title, kept: kept.kept, buttons: kept.buttons })}; ` +
      `Close closed it ${closedByClose}; git "${aStatus}"; tabs ${JSON.stringify(aTabsBefore)} -> ${JSON.stringify(aTabsAfter)}`
  )

  // 8. The discard acts on what the dialog listed, not on what the folder
  // holds by the time it is confirmed (FDSC-34, 45).
  const late = `discard/late-${stamp}.txt`
  const folderOpened = await discardFromMenu(ws, 'discard')
  writeFileSync(repoFile(late), 'written while the dialog was open\n')
  await sleep(600)
  const folderDone = await confirmDiscard(ws, folderOpened, [
    'discard/deep/sub/b.md',
    'discard/deep/a.md'
  ])
  const lateListed = await readWhen(ws, discardTreeRows, (read) =>
    read.some((r) => r.path === late)
  )
  const lateKept = existsSync(repoFile(late)) && lateListed.some((r) => r.path === late)
  const restLeft = git(['status', '--porcelain', '--', 'discard/'])
    .split('\n')
    .filter((line) => line !== '' && !line.includes(`late-${stamp}`))
  // The list settles first: the folder's rows leave it, so rows move up.
  await readWhen(ws, discardTreeRows, (read) =>
    sameList(
      read
        .filter((r) => !r.folder)
        .map((r) => r.path)
        .sort(),
      [...before, late].sort()
    )
  )
  const lateOpened = await discardFromMenu(ws, late)
  const lateDone = await confirmDiscard(ws, lateOpened, [late])
  const finalRows = await readWhen(ws, discardTreeRows, (read) =>
    sameList(
      read.filter((r) => !r.folder).map((r) => r.path),
      before
    )
  )
  const finalFiles = finalRows.filter((r) => !r.folder).map((r) => r.path)
  check(
    'A discard acts on the files its dialog listed; a file written after it opened stays (FDSC-34, 45)',
    sameList(folderOpened?.rows, ['discard/deep/sub/b.md', 'discard/deep/a.md']) &&
      folderDone === null &&
      lateKept &&
      restLeft.length === 0 &&
      lateOpened !== null &&
      lateDone === null &&
      sameList(finalFiles, before),
    `dialog ${JSON.stringify(folderOpened?.rows ?? null)}, closed ${folderDone === null}; ` +
      `late file kept and listed ${lateKept}; other fixture entries left ${JSON.stringify(restLeft)}; ` +
      `list after the late file ${JSON.stringify(finalFiles)} (before ${JSON.stringify(before)})`
  )
}

/** What the discard section cannot script: it needs a share or a junction (L-030). */
function printDiscardHandChecks() {
  console.log('  C. Discard an untracked file on a network share: it is kept, with')
  console.log('     "The Recycle Bin refused it."')
  console.log('  D. Discard an untracked junction: it is kept, with')
  console.log('     "Links and junctions are never moved."')
}

/**
 * Section 14: unchanged lines stay folded across refreshes (FOLD, issue #130).
 * Starts from the state section 13 leaves, or `foldSetup` builds: nothing
 * uncommitted, the inline layout, the Files direction on the seeded worktree.
 */
async function foldSection(ws) {
  // 14. Unchanged lines stay folded across refreshes (FOLD, issue #130).
  //
  // Section 13 committed everything, so Uncommitted starts empty and every
  // change below is this section's own. The layout is inline (section 6).
  const LONG = join(REPO, 'fold', 'long.ts')
  const OTHER_FOLD = join(REPO, 'fold', 'other.ts')
  const sectionOf = (file) =>
    `[...document.querySelectorAll('.diff-section')].find((s) => (s.getAttribute('data-path') ?? '').endsWith(${J(file)}))`
  // A single file's diff tab: its viewer sits straight in the tab body.
  const DIFF_TAB = `document.querySelector('.file-tabs-body > .diff-viewer')`
  const LONG_SECTION = sectionOf('fold/long.ts')
  const OTHER_SECTION = sectionOf('fold/other.ts')
  // Strips are Monaco's `.diff-hidden-lines` overlay in the modified editor; the
  // original editor carries its own copy, so count one side only. `where` is an
  // expression for the element holding one diff: a stack section or the diff tab.
  const foldState = (where) => `(() => {
    const s = ${where}
    const editor = s?.querySelector('.monaco-diff-editor') ?? null
    const lines = [...(s?.querySelectorAll('.editor.modified .view-line') ?? [])]
      .map((l) => l.textContent.replace(/\\u00a0/g, ' '))
    return {
      section: !!s,
      editor: !!editor,
      probe: editor?.getAttribute('data-smoke-probe') ?? null,
      strips: s ? s.querySelectorAll('.editor.modified .diff-hidden-lines').length : -1,
      originalStrips: s ? s.querySelectorAll('.editor.original .diff-hidden-lines').length : -1,
      labels: [...(s?.querySelectorAll('.editor.modified .diff-hidden-lines .center') ?? [])]
        .map((e) => e.textContent.replace(/\\u00a0/g, ' ').trim()),
      text: lines.join('\\n')
    }
  })()`
  const probe = (where, name) =>
    `(() => { const e = (${where})?.querySelector('.monaco-diff-editor'); if (!e) return false; e.setAttribute('data-smoke-probe', ${J(name)}); return true })()`
  /** Clicks the unfold control of the `index`-th strip, which reveals that region whole. */
  const revealStrip = (where, index) => `(() => {
    const strips = [...((${where})?.querySelectorAll('.editor.modified .diff-hidden-lines') ?? [])]
    const unfold = strips[${index}]?.querySelector('a[title="Show Unchanged Region"]')
    if (!unfold) return false
    unfold.click()
    return true
  })()`
  const shows = (state, line) => state.text.includes(line)
  const treeHas = (name) =>
    `[...document.querySelectorAll('.file-tree-name')].some((e) => e.textContent.trim() === ${J(name)})`
  const brief = (state) =>
    J({ editor: state.editor, strips: state.strips, labels: state.labels, probe: state.probe })

  /** Poll until `ok(state)`, reporting how long it took; the last state either way. */
  const waitFold = async (where, ok, timeoutMs = 4000) => {
    const startedAt = Date.now()
    let state
    do {
      state = await evaluate(ws, foldState(where))
      if (ok(state)) return { state, after: Date.now() - startedAt }
      await sleep(50)
    } while (Date.now() - startedAt < timeoutMs)
    return { state, after: null }
  }
  /** The fold state once the strip count has held still for 600 ms (Monaco recomputes asynchronously). */
  const settled = async (where) => {
    let last = -2
    let since = Date.now()
    const startedAt = Date.now()
    while (Date.now() - startedAt < 5000) {
      const { strips } = await evaluate(ws, foldState(where))
      if (strips !== last) {
        last = strips
        since = Date.now()
      } else if (Date.now() - since >= 600) break
      await sleep(100)
    }
    return evaluate(ws, foldState(where))
  }

  writeFileSync(LONG, foldText('l', 200, [20, 180]))
  writeFileSync(OTHER_FOLD, foldText('o', 120, span(50, 70)))
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await waitFold(OTHER_SECTION, (s) => s.editor && s.strips > 0, 8000)
  const openedLong = await settled(LONG_SECTION)
  const openedOther = await settled(OTHER_SECTION)
  console.log(`    14a DOM: long ${J({ ...openedLong, text: undefined })}`)
  console.log(`    14a DOM: other ${J({ ...openedOther, text: undefined })}`)
  check(
    "A long file's section opens folded (FOLD-01)",
    openedLong.editor && openedOther.editor && openedLong.strips === 3 && openedOther.strips === 2,
    `long.ts ${openedLong.strips} strips, other.ts ${openedOther.strips}`
  )

  const probed = await evaluate(ws, probe(LONG_SECTION, 'fold/long.ts'))
  const writtenAt = Date.now()
  writeFileSync(LONG, foldText('l', 200, [20, 100, 180]))
  const arrived = await waitFold(LONG_SECTION, (s) => shows(s, 'export const l100 = -100'))
  const refreshed = await settled(LONG_SECTION)
  console.log(
    `    14b DOM: long ${J({ ...refreshed, text: undefined })}, arrived ${arrived.after} ms after the write at ${writtenAt}`
  )
  check(
    'A disk change keeps the section folded, in the same editor (FOLD-02, FOLD-04)',
    probed &&
      arrived.after !== null &&
      arrived.after <= 1000 &&
      refreshed.probe === 'fold/long.ts' &&
      refreshed.strips === 4,
    `probe ${probed ? (refreshed.probe ?? 'GONE') : 'never set'}, arrived in ${arrived.after} ms, ${refreshed.strips} strips (want 4)`
  )

  // 14d. A region that did not exist before starts folded (FOLD-04): with only
  // lines 50 and 70 changed, lines 54-66, all change or context before, fold.
  // long.ts's section above can push other.ts's out of the mount margin, how
  // far depending on the window's height (measured: after 14b it had no
  // editor). Collapsing long.ts puts other.ts at the top, where it stays
  // mounted; long.ts is expanded again after, folded as a fresh mount.
  const toggleSection = (where) =>
    `(() => { const h = (${where})?.querySelector('.diff-section-header'); if (!h) return false; h.click(); return true })()`
  await evaluate(ws, toggleSection(LONG_SECTION))
  await waitFold(OTHER_SECTION, (s) => s.editor && s.strips > 0, 8000)
  const otherBefore = await settled(OTHER_SECTION)
  const otherWrittenAt = Date.now()
  writeFileSync(OTHER_FOLD, foldText('o', 120, [50, 70]))
  // Inline, the modified editor also renders the original's removed lines, so
  // the old line 51 (`= 51`) is on screen already. Its changed text (`= -51`)
  // exists only in the old modified side: its going is the new diff arriving.
  const otherArrived = await waitFold(OTHER_SECTION, (s) => !shows(s, 'export const o051 = -51'))
  const otherAfter = await settled(OTHER_SECTION)
  console.log(
    `    14d DOM: before ${brief(otherBefore)}, after ${brief(otherAfter)}, written at ${otherWrittenAt}, read at ${Date.now()}`
  )
  check(
    'A region the change creates starts folded (FOLD-04)',
    otherBefore.strips === 2 &&
      shows(otherBefore, 'export const o051 = -51') &&
      otherArrived.after !== null &&
      otherAfter.strips === 3,
    `${otherBefore.strips} -> ${otherAfter.strips} strips (want 2 -> 3), arrived in ${otherArrived.after} ms`
  )

  await evaluate(ws, toggleSection(LONG_SECTION))
  await waitFold(LONG_SECTION, (s) => s.editor && s.strips > 0, 8000)

  // 14c. A region revealed by hand stays revealed (FOLD-03). The second strip is
  // lines 24-96, which hold line 50.
  const revealedByHand = await evaluate(ws, revealStrip(LONG_SECTION, 1))
  const afterReveal = await settled(LONG_SECTION)
  writeFileSync(LONG, foldText('l', 200, [20, 100, 180, 195]))
  await waitFold(LONG_SECTION, (s) => shows(s, 'export const l195 = -195'))
  const keptRevealed = await settled(LONG_SECTION)
  console.log(`    14c DOM: before ${brief(afterReveal)}, after ${brief(keptRevealed)}`)
  check(
    'A region revealed by hand stays revealed across a disk change (FOLD-03)',
    // Precondition: the reveal happened. Then the plan: 24-96 revealed, and
    // 1-16, 104-176, 184-191 and 199-201 folded.
    revealedByHand &&
      afterReveal.strips === 3 &&
      shows(afterReveal, 'export const l050 = 50') &&
      keptRevealed.strips === 4 &&
      shows(keptRevealed, 'export const l050 = 50') &&
      shows(keptRevealed, 'export const l195 = -195'),
    `reveal ${revealedByHand}: ${afterReveal.strips} strips, l050 ${shows(afterReveal, 'export const l050 = 50')}; after the write ${keptRevealed.strips} strips (want 4), l050 ${shows(keptRevealed, 'export const l050 = 50')}`
  )

  // 14e. Two writes 60 ms apart: the folds after the diff settles are
  // the plan's for the final text. Line 60 splits the revealed 24-96 in two
  // revealed halves; line 140 splits the folded 104-176 in two folded ones.
  writeFileSync(LONG, foldText('l', 200, [20, 60, 100, 180, 195]))
  await sleep(60)
  writeFileSync(LONG, foldText('l', 200, [20, 60, 100, 140, 180, 195]))
  await waitFold(LONG_SECTION, (s) => shows(s, 'export const l140 = -140'))
  const twoWrites = await settled(LONG_SECTION)
  console.log(`    14e DOM: ${brief(twoWrites)}`)
  check(
    // The watcher batches events for a fixed 250 ms and the diff recomputes in
    // about 230 ms, so the two writes reach the viewer as ONE refresh: this
    // proves the coalesced path, not FOLD-08's second change before the
    // recompute, which no disk write reaches at this size (measured, T11).
    'Two quick writes, read as one refresh, leave the folds the final text plans',
    twoWrites.strips === 5 && shows(twoWrites, 'export const l050 = 50'),
    `${twoWrites.strips} strips (want 5), l050 ${shows(twoWrites, 'export const l050 = 50')}`
  )

  // 14f. The single file's diff tab keeps its folds too, in the same editor,
  // within the second FDIF-30 gives (FOLD-02, FOLD-09).
  if (!(await evaluate(ws, treeHas('long.ts')))) {
    await evaluate(ws, clickByText('.file-tree-name', 'fold'))
    await sleep(800)
  }
  await evaluate(ws, clickByText('.file-tree-name', 'long.ts'))
  await waitFold(DIFF_TAB, (s) => s.editor && s.strips > 0, 8000)
  const tabBefore = await settled(DIFF_TAB)
  const tabProbed = await evaluate(ws, probe(DIFF_TAB, 'diff-tab'))
  const tabWrittenAt = Date.now()
  writeFileSync(LONG, foldText('l', 200, [20, 60, 100, 140, 160, 180, 195]))
  // Line 160 sits outside the tab's viewport, so it is never rendered: the new
  // diff shows as the strips' labels changing instead.
  const tabArrived = await waitFold(DIFF_TAB, (s) => J(s.labels) !== J(tabBefore.labels))
  const tabAfter = await settled(DIFF_TAB)
  console.log(
    `    14f DOM: before ${brief(tabBefore)}, after ${brief(tabAfter)}, arrived ${tabArrived.after} ms after ${tabWrittenAt}`
  )
  check(
    "A file's diff tab stays folded across a disk change, in the same editor, within 1 s (FOLD-02, FOLD-09)",
    tabProbed &&
      tabBefore.strips === 7 &&
      tabArrived.after !== null &&
      tabArrived.after <= 1000 &&
      tabAfter.probe === 'diff-tab' &&
      tabAfter.strips === 8,
    `probe ${tabProbed ? (tabAfter.probe ?? 'GONE') : 'never set'}, ${tabBefore.strips} -> ${tabAfter.strips} strips (want 7 -> 8), arrived in ${tabArrived.after} ms`
  )

  // 14f2. The diff tab keeps its scroll across a refresh (FOLD-09, FDIF-30's
  // "in place"). Monaco scrolls virtually, so the scroll is read as the first
  // line on screen, and driven by CDP wheel events. The write changes line 170
  // only, below the lines on screen; then long.ts goes back to 14f's text.
  const firstOnScreen = `(() => {
    const editor = (${DIFF_TAB})?.querySelector('.editor.modified')
    if (!editor) return null
    const top = editor.getBoundingClientRect().top
    const lines = [...editor.querySelectorAll('.view-line')]
      .map((l) => ({ top: l.getBoundingClientRect().top, text: l.textContent.replace(/\\u00a0/g, ' ') }))
      .filter((l) => l.top >= top - 1)
      .sort((a, b) => a.top - b.top)
    return lines[0]?.text ?? null
  })()`
  const tabBox = await evaluate(
    ws,
    `(() => { const r = (${DIFF_TAB})?.querySelector('.editor.modified')?.getBoundingClientRect(); return r ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 200)) } : null })()`
  )
  const lineOneAt = await evaluate(ws, firstOnScreen)
  if (tabBox) {
    for (let i = 0; i < 3; i++) {
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: tabBox.x,
        y: tabBox.y,
        deltaX: 0,
        deltaY: 240,
        pointerType: 'mouse'
      })
      await sleep(150)
    }
  }
  await sleep(400)
  const scrolledTo = await evaluate(ws, firstOnScreen)
  const beforeScrollWrite = await settled(DIFF_TAB)
  writeFileSync(LONG, foldText('l', 200, [20, 60, 100, 140, 160, 170, 180, 195]))
  const scrollArrived = await waitFold(DIFF_TAB, (s) => J(s.labels) !== J(beforeScrollWrite.labels))
  await settled(DIFF_TAB)
  const keptAt = await evaluate(ws, firstOnScreen)
  console.log(
    `    14f2 DOM: line one "${lineOneAt}", scrolled to "${scrolledTo}", after the write "${keptAt}", arrived in ${scrollArrived.after} ms`
  )
  check(
    'A diff tab keeps its scroll across a disk change (FOLD-09, FDIF-30)',
    // Line 1 is folded away, so the first line on screen before the wheel is
    // whatever follows its strip: the wheel only has to move it.
    tabBox !== null &&
      lineOneAt !== null &&
      scrolledTo !== null &&
      scrolledTo !== lineOneAt &&
      scrollArrived.after !== null &&
      keptAt === scrolledTo,
    `first line on screen "${lineOneAt}" -> scrolled "${scrolledTo}" -> after the write "${keptAt}"`
  )
  writeFileSync(LONG, foldText('l', 200, [20, 60, 100, 140, 160, 180, 195]))
  await waitFold(DIFF_TAB, (s) => J(s.labels) === J(beforeScrollWrite.labels))

  // 14g. A remounted section forgets hand reveals (FOLD-23): All changes remounts
  // on every tab switch, so its sections get fresh editors.
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await waitFold(LONG_SECTION, (s) => s.editor && s.strips > 0, 8000)
  const remountBefore = await settled(LONG_SECTION)
  const handRevealed = await evaluate(ws, revealStrip(LONG_SECTION, 1))
  const remountRevealed = await settled(LONG_SECTION)
  await focusTabNamed(ws, 'long.ts')
  const leftFor = await waitFold(DIFF_TAB, (s) => s.editor, 8000)
  const stackGone = !(await evaluate(ws, `!!(${LONG_SECTION})`))
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await waitFold(LONG_SECTION, (s) => s.editor && s.strips > 0, 8000)
  const remountAfter = await settled(LONG_SECTION)
  console.log(
    `    14g DOM: ${brief(remountBefore)} -> revealed ${brief(remountRevealed)} -> back ${brief(remountAfter)}`
  )
  check(
    'A section that remounts opens folded, without the reveals it had (FOLD-23)',
    remountBefore.strips === 8 &&
      handRevealed &&
      remountRevealed.strips === 7 &&
      leftFor.state.editor &&
      stackGone &&
      remountAfter.strips === 8,
    `${remountBefore.strips} -> ${remountRevealed.strips} by hand -> ${remountAfter.strips} after a tab switch (want 8 -> 7 -> 8); diff tab shown ${leftFor.state.editor}, stack unmounted ${stackGone}`
  )

  // 14h-14r: Hide unchanged and Show unchanged. A section whose file shows whole
  // is tall enough to push the one below it out of the mount margin, so the
  // stack starts short (long.ts back to two changes), hand reveals are made in
  // other.ts, the lower section, and other.ts is read with long.ts collapsed.
  const header = (label) => clickByText('.all-changes-toggle', label)
  const bothFolded = async () => [await settled(LONG_SECTION), await settled(OTHER_SECTION)]
  const readOtherAlone = async () => {
    await evaluate(ws, toggleSection(LONG_SECTION))
    await waitFold(OTHER_SECTION, (s) => s.editor, 8000)
    const other = await settled(OTHER_SECTION)
    await evaluate(ws, toggleSection(LONG_SECTION))
    await waitFold(LONG_SECTION, (s) => s.editor, 8000)
    return other
  }

  writeFileSync(LONG, foldText('l', 200, [20, 180]))
  await waitFold(LONG_SECTION, (s) => !shows(s, 'export const l060 = -60'))
  await waitFold(OTHER_SECTION, (s) => s.editor && s.strips > 0, 8000)
  const [shortLong, shortOther] = await bothFolded()
  console.log(`    14h start: long ${brief(shortLong)}, other ${brief(shortOther)}`)

  // 14h. The header's buttons, in order (FOLD-11).
  const toggles = await evaluate(
    ws,
    `[...document.querySelectorAll('.all-changes-toggle')].map((e) => e.textContent.trim())`
  )
  check(
    "All changes' header offers Hide unchanged and Show unchanged after Collapse all (FOLD-11)",
    J(toggles) === J(['Expand all', 'Collapse all', 'Hide unchanged', 'Show unchanged']),
    J(toggles)
  )

  // 14i. Hide unchanged folds every region of every section with an editor,
  // hand-revealed ones included (FOLD-12).
  const revealedOther = await evaluate(ws, revealStrip(OTHER_SECTION, 0))
  const [beforeHideLong, beforeHideOther] = await bothFolded()
  await evaluate(ws, header('Hide unchanged'))
  const [hiddenLong, hiddenOther] = await bothFolded()
  console.log(
    `    14i DOM: before long ${brief(beforeHideLong)} other ${brief(beforeHideOther)}; after long ${brief(hiddenLong)} other ${brief(hiddenOther)}`
  )
  check(
    'Hide unchanged folds every region of every open section, hand-revealed ones too (FOLD-12)',
    shortLong.strips === 3 &&
      shortOther.strips === 3 &&
      revealedOther &&
      beforeHideOther.strips === 2 &&
      hiddenLong.editor &&
      hiddenOther.editor &&
      hiddenLong.strips === 3 &&
      hiddenOther.strips === 3,
    `other ${shortOther.strips} -> ${beforeHideOther.strips} by hand -> ${hiddenOther.strips}; long ${hiddenLong.strips} (want 3 and 3)`
  )

  // 14j. After a press, one strip revealed by hand changes only that strip (FOLD-16).
  const revealedAfterHide = await evaluate(ws, revealStrip(OTHER_SECTION, 1))
  const [oneLong, oneOther] = await bothFolded()
  check(
    'After Hide unchanged, revealing one strip by hand changes only that strip (FOLD-16)',
    revealedAfterHide && oneOther.strips === 2 && oneLong.strips === 3,
    `other ${hiddenOther.strips} -> ${oneOther.strips}, long ${hiddenLong.strips} -> ${oneLong.strips} (want 2 and 3)`
  )

  // 14k. Show unchanged reveals every region (FOLD-13).
  await evaluate(ws, header('Show unchanged'))
  const shownLong = await settled(LONG_SECTION)
  const shownOther = await readOtherAlone()
  console.log(`    14k DOM: long ${brief(shownLong)}, other ${brief(shownOther)}`)
  check(
    'Show unchanged leaves no strip in either section and shows their unchanged lines (FOLD-13)',
    shownLong.editor &&
      shownLong.strips === 0 &&
      shows(shownLong, 'export const l050 = 50') &&
      shows(shownLong, 'export const l150 = 150') &&
      shownOther.editor &&
      shownOther.strips === 0 &&
      shows(shownOther, 'export const o030 = 30'),
    `long ${shownLong.strips} strips, other ${shownOther.strips} (want 0 and 0)`
  )

  // 14l. With Show chosen, sections that get an editor later open revealed
  // (FOLD-14), and a region a change creates is revealed (FOLD-15).
  await evaluate(ws, header('Collapse all'))
  await sleep(800)
  await evaluate(ws, header('Expand all'))
  await waitFold(LONG_SECTION, (s) => s.editor, 8000)
  const reopenedLong = await settled(LONG_SECTION)
  const reopenedOther = await readOtherAlone()
  writeFileSync(LONG, foldText('l', 200, [20, ...span(60, 100), 180]))
  await waitFold(LONG_SECTION, (s) => shows(s, 'export const l080 = -80'))
  const blockLong = await settled(LONG_SECTION)
  writeFileSync(LONG, foldText('l', 200, [20, 60, 100, 180]))
  await waitFold(LONG_SECTION, (s) => !shows(s, 'export const l080 = -80'))
  const splitLong = await settled(LONG_SECTION)
  console.log(
    `    14l DOM: reopened long ${brief(reopenedLong)} other ${brief(reopenedOther)}; block ${brief(blockLong)}; split ${brief(splitLong)}`
  )
  check(
    'With Show chosen, reopened sections and a region a change creates show whole (FOLD-14, FOLD-15)',
    reopenedLong.editor &&
      reopenedLong.strips === 0 &&
      reopenedOther.editor &&
      reopenedOther.strips === 0 &&
      blockLong.strips === 0 &&
      splitLong.editor &&
      splitLong.strips === 0 &&
      shows(splitLong, 'export const l080 = 80'),
    `reopened ${reopenedLong.strips} / ${reopenedOther.strips}, after the new region ${splitLong.strips} strips (want 0)`
  )

  // 14m. A press with no section holding an editor is still remembered (FOLD-27).
  await evaluate(ws, header('Hide unchanged'))
  const hidAgain = await settled(LONG_SECTION)
  await evaluate(ws, header('Collapse all'))
  await sleep(800)
  const noEditors = await evaluate(ws, liveDiffEditors)
  await evaluate(ws, header('Show unchanged'))
  await sleep(300)
  await evaluate(ws, header('Expand all'))
  await waitFold(LONG_SECTION, (s) => s.editor, 8000)
  const pressedBlind = await settled(LONG_SECTION)
  check(
    'A press made with every section collapsed applies when they open (FOLD-27)',
    hidAgain.strips > 0 && noEditors === 0 && pressedBlind.editor && pressedBlind.strips === 0,
    `hidden ${hidAgain.strips} strips, ${noEditors} editors at the press, then ${pressedBlind.strips} strips (want 0)`
  )

  // 14n. The choice outlives a lens switch (FOLD-20).
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await waitFold(LONG_SECTION, (s) => s.editor, 8000)
  const afterLens = await settled(LONG_SECTION)
  check(
    "Switching the lens and back keeps All changes' choice (FOLD-20)",
    afterLens.editor && afterLens.strips === 0,
    `${afterLens.strips} strips after Diff to origin and back (want 0)`
  )

  // 14o. A file with nothing to fold reads whole, and Hide leaves it so (FOLD-24).
  const NEW_FOLD = join(REPO, 'fold', 'new.ts')
  const NEW_SECTION = sectionOf('fold/new.ts')
  await evaluate(ws, header('Hide unchanged'))
  writeFileSync(NEW_FOLD, foldText('n', 20))
  await waitFold(NEW_SECTION, (s) => s.editor, 8000)
  const newBefore = await settled(NEW_SECTION)
  await evaluate(ws, header('Hide unchanged'))
  const newAfter = await settled(NEW_SECTION)
  check(
    'An added file has nothing to fold, and Hide unchanged leaves it whole (FOLD-24)',
    newBefore.editor &&
      newBefore.strips === 0 &&
      shows(newBefore, 'export const n001 = 1') &&
      shows(newBefore, 'export const n020 = 20') &&
      newAfter.strips === 0 &&
      shows(newAfter, 'export const n020 = 20'),
    `${newBefore.strips} -> ${newAfter.strips} strips, first and last lines ${shows(newAfter, 'export const n001 = 1') && shows(newAfter, 'export const n020 = 20')}`
  )

  // 14p. A single file's diff tab: its own buttons, its own choice, kept across a
  // tab switch and dropped on close (FOLD-18, FOLD-19, FOLD-21).
  const diffToggles = `[...document.querySelectorAll('.file-tabs-toggle')].map((e) => e.textContent.trim())`
  const inAllChanges = await evaluate(ws, diffToggles)
  if (!(await evaluate(ws, `!!(${tabElement('long.ts')})`))) {
    if (!(await evaluate(ws, treeHas('long.ts')))) {
      await evaluate(ws, clickByText('.file-tree-name', 'fold'))
      await sleep(800)
    }
    await evaluate(ws, clickByText('.file-tree-name', 'long.ts'))
  } else {
    await focusTabNamed(ws, 'long.ts')
  }
  await waitFold(DIFF_TAB, (s) => s.editor && s.strips > 0, 8000)
  const tabFolded = await settled(DIFF_TAB)
  const inDiffTab = await evaluate(ws, diffToggles)
  await evaluate(ws, clickByText('.file-tabs-toggle', 'Show unchanged'))
  const tabShown = await settled(DIFF_TAB)
  await focusTabNamed(ws, 'All changes')
  await sleep(1200)
  await focusTabNamed(ws, 'long.ts')
  await waitFold(DIFF_TAB, (s) => s.editor, 8000)
  const tabBack = await settled(DIFF_TAB)
  await evaluate(ws, clickCloseOf('long.ts'))
  await sleep(600)
  if (!(await evaluate(ws, treeHas('long.ts')))) {
    await evaluate(ws, clickByText('.file-tree-name', 'fold'))
    await sleep(800)
  }
  await evaluate(ws, clickByText('.file-tree-name', 'long.ts'))
  await waitFold(DIFF_TAB, (s) => s.editor && s.strips > 0, 8000)
  const tabReopened = await settled(DIFF_TAB)
  console.log(
    `    14p DOM: toggles all-changes ${J(inAllChanges)} diff ${J(inDiffTab)}; folded ${tabFolded.strips}, shown ${tabShown.strips}, back ${tabBack.strips}, reopened ${tabReopened.strips}`
  )
  check(
    "A file's diff tab has its own Hide / Show, kept across a tab switch and dropped on close (FOLD-18, FOLD-19, FOLD-21)",
    !inAllChanges.includes('Hide unchanged') &&
      !inAllChanges.includes('Show unchanged') &&
      inDiffTab.includes('Hide unchanged') &&
      inDiffTab.includes('Show unchanged') &&
      tabFolded.strips > 0 &&
      tabShown.strips === 0 &&
      tabBack.editor &&
      tabBack.strips === 0 &&
      tabReopened.strips === tabFolded.strips,
    `folded ${tabFolded.strips} -> Show ${tabShown.strips} -> back ${tabBack.strips} -> reopened ${tabReopened.strips} (want n -> 0 -> 0 -> n)`
  )

  // 14q. Nothing of the choice reaches the config (FOLD-22).
  await sleep(600)
  const configText = readFileSync(CONFIG_PATH, 'utf8')
  check(
    'The Hide / Show choice is never written to the config (FOLD-22)',
    configText.length > 0 && !configText.includes('"unchanged"'),
    `config.json ${configText.length} bytes, "unchanged" ${configText.includes('"unchanged"') ? 'FOUND' : 'absent'}`
  )

  // 14r. A commit tab's stack folds and reveals as All changes does (FOLD-17).
  git(['add', 'fold'])
  git(['commit', '-m', 'fold changes'])
  await evaluate(ws, clickByText('.file-tree-mode', 'Commits'))
  await sleep(2200)
  const openedFoldCommit = await evaluate(
    ws,
    `(() => {
       const row = [...document.querySelectorAll('.commit-row')].find(
         (r) => r.querySelector('.commit-subject')?.textContent.trim() === 'fold changes')
       if (!row) return false
       row.querySelector('.commit-open').click()
       return true
     })()`
  )
  await waitFold(LONG_SECTION, (s) => s.editor && s.strips > 0, 8000)
  const commitFolded = await settled(LONG_SECTION)
  await evaluate(ws, header('Show unchanged'))
  const commitShown = await settled(LONG_SECTION)
  await evaluate(ws, header('Hide unchanged'))
  const commitHidden = await settled(LONG_SECTION)
  check(
    "A commit tab's Hide unchanged and Show unchanged fold and reveal its files (FOLD-17)",
    openedFoldCommit &&
      commitFolded.strips > 0 &&
      commitShown.strips === 0 &&
      commitHidden.strips === commitFolded.strips,
    `opened ${openedFoldCommit}: ${commitFolded.strips} -> Show ${commitShown.strips} -> Hide ${commitHidden.strips}`
  )
}

/**
 * The state section 13 leaves, for `SMOKE_ONLY=fold`: inline layout, then
 * everything committed, so Uncommitted starts empty.
 */
async function foldSetup(ws) {
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tab-label', 'All changes'))
  await sleep(1200)
  const inline = (await evaluate(ws, activeToggles)).find((t) => t.label === 'Inline')
  if (inline?.pressed !== 'true') await evaluate(ws, clickToggle('Inline'))
  await sleep(800)
  git(['add', '-A'])
  git(['commit', '-m', 'commit everything left'])
  await sleep(2500)
}

/* ----------------------------------------------------------------- icons -- */

/** The body of a vscode-icons icon, as the installed set draws it; aliases take their parent's. */
const iconSet = createRequire(import.meta.url)('@iconify-json/vscode-icons/icons.json')
const iconBody = (name) =>
  (iconSet.icons[name] ?? iconSet.icons[iconSet.aliases?.[name]?.parent])?.body ?? null

/** The icons the checks name; any other drawn icon reads `unknown`. */
const KNOWN_ICONS = [
  'default-file',
  'default-folder',
  'default-folder-opened',
  'file-type-typescript',
  'file-type-light-typescript',
  'file-type-sln',
  'file-type-json',
  'file-type-light-json',
  'file-type-vite',
  'file-type-light-vite',
  'folder-type-src',
  'folder-type-src-opened'
]

/**
 * The icon each matching element draws, as the name of the set's icon whose body
 * its data: URI carries — or `generic` for the stand-in Icon, `none` for nothing.
 */
const drawnIcons = (selector) => `
  (() => {
    const bodies = ${JSON.stringify(Object.fromEntries(KNOWN_ICONS.map((n) => [n, iconBody(n)])))}
    return [...document.querySelectorAll(${JSON.stringify(selector)})].map((row) => {
      const img = row.querySelector('.file-icon img')
      if (!img) return row.querySelector('.file-icon svg') ? 'generic' : 'none'
      const svg = decodeURIComponent(img.src.slice('data:image/svg+xml,'.length))
      const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))
      return Object.keys(bodies).find((name) => bodies[name] === inner) ?? 'unknown'
    })
  })()
`

/** The icon of the tree row whose name reads `name`. */
async function rowIcon(ws, name) {
  const names = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-row')].map((r) => r.querySelector('.file-tree-name')?.textContent)`
  )
  const icons = await evaluate(ws, drawnIcons('.file-tree-row'))
  const index = names.indexOf(name)
  return index < 0 ? 'no row' : icons[index]
}

async function clickThemeToggle(ws, to) {
  const clicked = await evaluate(
    ws,
    `(() => { const b = document.querySelector('[title="Switch to ${to} theme"]'); b?.click(); return !!b })()`
  )
  await sleep(700)
  return clicked && (await evaluate(ws, `document.documentElement.dataset.theme`)) === to
}

/** 15. File and folder icons (FICN-01, 03, 07, 08, 10, 11, 13, 14, 15). */
async function iconChecks(ws) {
  // Guards: each check below tells two icons apart by body, so the bodies must differ.
  const pairs = [
    ['file-type-sln', 'default-file'],
    ['file-type-json', 'file-type-light-json'],
    ['file-type-vite', 'file-type-light-vite'],
    ['folder-type-src', 'folder-type-src-opened']
  ]
  for (const [a, b] of pairs) {
    if (!iconBody(a) || !iconBody(b) || iconBody(a) === iconBody(b)) {
      throw new Error(`Icon bodies do not tell ${a} from ${b}`)
    }
  }

  if ((await evaluate(ws, `document.documentElement.dataset.theme`)) !== 'dark') {
    await clickThemeToggle(ws, 'dark')
  }
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1600)
  const srcOpen = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-row')].find((r) => r.querySelector('.file-tree-name')?.textContent === 'src')?.getAttribute('aria-expanded')`
  )
  if (srcOpen === 'true') {
    await evaluate(ws, clickByText('.file-tree-name', 'src'))
    await sleep(700)
  }
  const srcClosed = await rowIcon(ws, 'src')
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(900)
  const srcOpened = await rowIcon(ws, 'src')
  const tsRow = await rowIcon(ws, 'added.ts')
  const slnx = await rowIcon(ws, 'Acme.Widget.slnx')
  const json = await rowIcon(ws, 'settings.json')

  check(
    'A .ts row in the tree shows the TypeScript icon (FICN-01)',
    tsRow === 'file-type-typescript',
    tsRow
  )
  check('A .slnx row shows the .sln icon (FICN-03)', slnx === 'file-type-sln', slnx)
  check(
    'The src folder shows its own closed and open icons (FICN-09, FICN-10)',
    srcClosed === 'folder-type-src' && srcOpened === 'folder-type-src-opened',
    `${srcClosed} -> ${srcOpened}`
  )
  check(
    'A .json row shows the base JSON icon in the dark theme (FICN-15)',
    json === 'file-type-json',
    json
  )

  // The tab of a file opened from the tree, and its editor still mounting.
  await evaluate(ws, clickByText('.file-tree-name', 'added.ts'))
  await sleep(1800)
  const tabIcons = await evaluate(ws, drawnIcons('.file-tab.active'))
  const editor = await evaluate(ws, `document.querySelectorAll('.monaco-editor').length`)
  check(
    'A file tab shows its icon, and the editor still mounts (FICN-01)',
    tabIcons[0] === 'file-type-typescript' && editor > 0,
    `${tabIcons[0]}, ${editor} editor(s)`
  )

  // Light theme: a file with a light variant swaps without a restart (FICN-07, FICN-08).
  // vite.config.ts is the one that proves the light rule: the mapping answers it
  // with the base icon, while .json is answered light already and only proves
  // that the dark rule stays out of the light theme.
  const viteDark = await rowIcon(ws, 'vite.config.ts')
  const toLight = await clickThemeToggle(ws, 'light')
  const viteLight = await rowIcon(ws, 'vite.config.ts')
  const jsonLight = await rowIcon(ws, 'settings.json')
  const tsLight = await rowIcon(ws, 'added.ts')
  check(
    'Switching to light swaps icons with a light variant, in place (FICN-07, FICN-08)',
    toLight &&
      viteDark === 'file-type-vite' &&
      viteLight === 'file-type-light-vite' &&
      jsonLight === 'file-type-light-json' &&
      tsLight === 'file-type-typescript',
    `theme switched: ${toLight}; vite ${viteDark} -> ${viteLight}, json ${jsonLight}, ts ${tsLight}`
  )
  await clickThemeToggle(ws, 'dark')

  // The changed list: a file row and the folder around it (FICN-01, FICN-11).
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1800)
  const changedTs = await rowIcon(ws, 'added.ts')
  const changedSrc = await rowIcon(ws, 'src')
  check(
    'The changed list shows file and open folder icons (FICN-01, FICN-11)',
    changedTs === 'file-type-typescript' && changedSrc === 'folder-type-src-opened',
    `added.ts ${changedTs}, src ${changedSrc}`
  )
  const allChanges = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tab.fixed .file-icon')].length`
  )
  check('The All changes tab shows no icon', allChanges === 0, `${allChanges} icon(s)`)

  // A chunk that fails to load: rows keep the generic icon, logged once (FICN-13, FICN-14).
  // Last, because it reloads the window.
  const failures = []
  const onConsole = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method !== 'Runtime.consoleAPICalled') return
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
    if (text.includes('File icons failed to load')) failures.push(text)
  }
  ws.addEventListener('message', onConsole)
  await send(ws, 'Network.enable')
  await send(ws, 'Network.setBlockedURLs', { urls: ['*icon-data*'] })
  await send(ws, 'Page.reload', { ignoreCache: true })
  await sleep(1500)
  for (let i = 0; i < 30; i++) {
    if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
    await sleep(1000)
  }
  await selectWorktree(ws)
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1600)
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(1500)
  const blocked = await evaluate(ws, drawnIcons('.file-tree-row'))
  await send(ws, 'Network.setBlockedURLs', { urls: [] })
  ws.removeEventListener('message', onConsole)
  check(
    'With the icon chunk blocked, rows keep the generic icon (FICN-13, FICN-14)',
    blocked.length > 3 && blocked.every((icon) => icon === 'generic'),
    `${blocked.length} rows: ${[...new Set(blocked)].join(', ')}`
  )
  check(
    'The failed load is logged once (FICN-14)',
    failures.length === 1,
    `${failures.length} log line(s)`
  )
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
