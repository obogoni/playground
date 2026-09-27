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
 * SMOKE_ONLY=glyphs on step 2 runs the status glyph sections alone (FSTS,
 * issue #131), from a fresh seed and launch like any drive.
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
 *     assets/logo.bin      a NUL in the first 8000 bytes; rewritten with other
 *                          bytes, uncommitted, so one header has no counts
 *     big.txt              2 MB, past the 1 MB view cap
 *     stack/f00..f39.ts    40 changed files, for the All changes stack
 *     untracked.txt        untracked, so the uncommitted mode has one
 *     src/a-rather-long-untracked-file-name-that-has-to-be-cut-short-before-its-status-glyph.txt
 *                          untracked, 12 lines, a name the tree and the
 *                          header must cut before the status glyph
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

/** The seeded untracked file whose name is cut before its status glyph. */
const LONG_NAME =
  'a-rather-long-untracked-file-name-that-has-to-be-cut-short-before-its-status-glyph.txt'

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

  // Here, and not later: the uncommitted files the glyph checks read (crlf.txt,
  // untracked.txt, the long name, assets/logo.bin) are still uncommitted, since
  // FDIF-31 committed modified.ts alone. The icon checks reload and stay last.
  await glyphTreeChecks(ws)
  await glyphHeaderChecks(ws)
  await glyphCommitChecks(ws)

  await iconChecks(ws)

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log('\nHand checks this smoke does NOT script:')
  console.log('  A. Read the line-ending strip on a MIXED file and judge its wording.')
  console.log('  B. Judge side-by-side against inline as the daily default.')
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

/** Every row of the tree, with its glyph and where that glyph ends. */
const treeRows = `
  [...document.querySelectorAll('.file-tree-body .file-tree-row')].map((row) => {
    const box = row.getBoundingClientRect()
    const glyphs = [...row.querySelectorAll('.status-glyph')]
    const glyph = glyphs[0]
    const end = glyph?.parentElement
    const name = row.querySelector('.file-tree-name')
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
      overflows: name ? name.scrollWidth > name.clientWidth : null,
      // FSTS-04: a cut name ends in an ellipsis, not a bare clip. The ellipsis is
      // drawn only on a box that clips and does not wrap (see ellipsisFaults).
      ellipsis: name ? getComputedStyle(name).textOverflow : null,
      overflowX: name ? getComputedStyle(name).overflowX : null,
      whiteSpace: name ? getComputedStyle(name).whiteSpace : null,
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
 * within 1 px of each other. Returns the reasons it fails, empty when it holds.
 */
function columnFaults(items) {
  const faults = []
  for (const item of items) {
    if (item.glyphs !== 1) faults.push(`${item.path}: ${item.glyphs} glyphs`)
    else if (!item.last) faults.push(`${item.path}: glyph not last`)
    else if (Math.abs(item.right - item.edge) > 1) {
      faults.push(`${item.path}: ends at ${item.right.toFixed(1)}, edge ${item.edge.toFixed(1)}`)
    }
  }
  const rights = items.map((i) => i.right).filter((r) => typeof r === 'number')
  if (rights.length && Math.max(...rights) - Math.min(...rights) > 1) {
    faults.push(`rights spread ${(Math.max(...rights) - Math.min(...rights)).toFixed(1)} px`)
  }
  return faults
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

/** 12. The status glyphs of the tree rows (FSTS-01..11, 13..15). */
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
    `${originFiles.length} file rows` +
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
      `untracked.txt ${untrackedRow?.text}/${untrackedRow?.title}` +
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
    cutDetail(longRow) + (longColumn.length ? `; ${longColumn.join('; ')}` : '')
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
      overflows: path ? path.scrollWidth > path.clientWidth : null,
      // FSTS-20: a cut path ends in an ellipsis, not a bare clip (see ellipsisFaults).
      ellipsis: path ? getComputedStyle(path).textOverflow : null,
      overflowX: path ? getComputedStyle(path).overflowX : null,
      whiteSpace: path ? getComputedStyle(path).whiteSpace : null,
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

/** The column faults of a stack, plus any header with something before its path. */
const headerFaults = (headers) => [
  ...columnFaults(headers),
  ...headers.filter((h) => !h.pathSecond).map((h) => `${h.path}: something before the path`)
]

/** 13. The status glyphs of the All changes section headers (FSTS-11, 16..21). */
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
    `${origin.length} headers` +
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
      `untracked.txt ${untracked?.text}/${untracked?.title}` +
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
  const height = await evaluate(ws, `window.innerHeight`)
  let narrowed = null
  let atWidth = null
  try {
    for (const width of [900, 800, 700, 600]) {
      await send(ws, 'Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      })
      await sleep(900)
      narrowed = await evaluate(ws, stackHeaders)
      atWidth = width
      if (header(narrowed, longPath)?.overflows) break
    }
  } finally {
    await send(ws, 'Emulation.clearDeviceMetricsOverride')
    await sleep(600)
  }
  const long = narrowed ? header(narrowed, longPath) : undefined
  const narrowColumn = narrowed ? headerFaults(narrowed) : ['nothing read']
  check(
    'A path too long for its header is cut with an ellipsis and its glyph keeps the column (FSTS-20)',
    ellipsisFaults(long).length === 0 &&
      narrowed.length === Object.keys(UNCOMMITTED_STATUS).length &&
      narrowColumn.length === 0,
    `at ${atWidth} px: ${cutDetail(long)}` +
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
}

/** The subject of the seed's branch commit, which holds diff to origin's 44 files. */
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
  let opened = false
  for (let i = 0; i < 20 && !opened; i++) {
    await sleep(500)
    opened = await evaluate(
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
  const restored =
    !tabsAfter.some((t) => isCommitTab(t.label)) &&
    tabsAfter.some((t) => t.active && t.label === 'All changes') &&
    back.length === Object.keys(UNCOMMITTED_STATUS).length

  check(
    "A commit tab's headers keep the glyph column, glyphs, tooltips and strike (FSTS-16..21)",
    opened &&
      showing &&
      headers.length === Object.keys(ORIGIN_STATUS).length &&
      statuses.size >= 4 &&
      faults.length === 0 &&
      struck.length === 1 &&
      struck[0] === 'docs/removed.md:path' &&
      restored,
    `opened ${opened}; active ${tabs.find((t) => t.active)?.label ?? 'none'}; ${headers.length} headers, ` +
      `statuses ${[...statuses].join('/')}; struck ${struck.join(', ') || 'none'}; restored ${restored}` +
      (faults.length ? `; ${faults.slice(0, 3).join('; ')}` : '')
  )
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
