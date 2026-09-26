/* CDP smoke for the Files diffs (FDIF-01..32).
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
 *     Acme.Widget.slnx     committed on main, for the .slnx icon correction
 *     settings.json        committed on main, for the dark-theme icon rule
 *     vite.config.ts       committed on main, for the light-theme icon rule
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
  // Committed on main, so the diff modes never list them (FICN-03, FICN-15).
  writeFileSync(join(REPO, 'Acme.Widget.slnx'), '<Solution />\n')
  writeFileSync(join(REPO, 'settings.json'), '{ "theme": "dark" }\n')
  writeFileSync(join(REPO, 'vite.config.ts'), 'export default {}\n')
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

  await iconChecks(ws)

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log('\nHand checks this smoke does NOT script:')
  console.log('  A. Read the line-ending strip on a MIXED file and judge its wording.')
  console.log('  B. Judge side-by-side against inline as the daily default.')
  ws.close()
  return failed.length
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

/** 12. File and folder icons (FICN-01, 03, 07, 08, 10, 11, 13, 14, 15). */
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
