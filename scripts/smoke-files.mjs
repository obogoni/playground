/* CDP smoke for the Files direction (FXPL-01..32).
 *
 * Two modes, because the app loads its config once at startup and would
 * overwrite a later write on its next patch — the same constraint
 * seed-smoke-remove.mjs documents:
 *
 *   1. node scripts/smoke-files.mjs --seed [baseDir]
 *      Builds a throwaway workspace and registers it in config.json.
 *      The app must NOT be running.
 *
 *   2. Launch the app with --remote-debugging-port=9222, then:
 *      node scripts/smoke-files.mjs
 *      Drives every surface and prints a numbered pass/fail line per check.
 *      Run this against a FRESHLY LAUNCHED app. Open tabs and expanded folders
 *      live in memory for the session (FXPL-18), so a second run against the
 *      same window starts with a worktree already selected, tabs already open
 *      and folders already expanded — the empty state never shows and an
 *      expand click folds instead. The lens itself persists in the config
 *      (FXPL-13), which is why the drive resets it to Folder explicitly.
 *
 *   3. node scripts/smoke-files.mjs --clean [baseDir]
 *      Removes the workspace from config.json and deletes the folder.
 *
 * Point SMOKE_CONFIG at the config.json of the userData dir in use. Running
 * the app with --user-data-dir keeps the owner's real workspaces, sessions and
 * pinned tasks out of this entirely, which is how it was verified.
 *
 * The seeded repo (workspace folder holding one repo with one worktree):
 *
 *   <base>/fx-smoke-seed/
 *     app/                git repo on branch feature/smoke, two commits past main
 *       .gitignore        ignores build/
 *       build/out.txt     inside the ignored folder — must never be listed
 *       src/main.ts       committed, then edited and left uncommitted
 *       src/added.ts      added on the branch (since-base lists it)
 *       docs/notes.md     committed on main, deleted on the branch
 *       scratch.txt       untracked
 *       App.sln           opens VS 2026 instead of a tab (FXPL-28)
 *       assets/logo.bin   binary: a NUL inside the first 8000 bytes
 *       big.txt           2 MB of text, above the 1 MB ceiling
 *
 * VS 2026 / UAC and the Explorer selection are NOT scripted: the smoke must
 * never raise a UAC prompt. They are printed as hand checks at the end.
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
const WS_PATH = join(BASE, 'fx-smoke-seed')
const REPO = join(WS_PATH, 'app')
const CONFIG_PATH =
  process.env.SMOKE_CONFIG ?? join(process.env.APPDATA ?? '', 'playground', 'config.json')

/**
 * Windows holds a directory open for a moment after the process that watched it
 * exits — the app's recursive fs.watch on the worktree is exactly that — and a
 * plain rmSync then fails EPERM partway, leaving a half-deleted tree behind.
 * Retrying is what makes the seed repeatable.
 */
const rmTree = (path) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })

const git = (args, cwd = REPO) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/* ------------------------------------------------------------------ seed -- */

function seed() {
  rmTree(WS_PATH)
  rmTree(join(BASE, 'fx-smoke-origin.git'))
  mkdirSync(join(REPO, 'src'), { recursive: true })
  mkdirSync(join(REPO, 'docs'), { recursive: true })
  mkdirSync(join(REPO, 'build'), { recursive: true })
  mkdirSync(join(REPO, 'assets'), { recursive: true })

  git(['init', '-b', 'main'])
  git(['config', 'user.email', 'smoke@example.invalid'])
  git(['config', 'user.name', 'Files Smoke'])

  writeFileSync(join(REPO, '.gitignore'), 'build/\n')
  writeFileSync(join(REPO, 'build', 'out.txt'), 'generated\n')
  writeFileSync(join(REPO, 'src', 'main.ts'), 'export const answer = 42\n')
  writeFileSync(join(REPO, 'docs', 'notes.md'), '# Notes\n')
  writeFileSync(join(REPO, 'App.sln'), 'Microsoft Visual Studio Solution File\n')

  // A NUL inside the first 8000 bytes is git's own binary heuristic.
  writeFileSync(join(REPO, 'assets', 'logo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x4e, 0x47, 0x0d]))
  // 2 MB, comfortably past the 1 MB ceiling of FXPL-20.
  writeFileSync(join(REPO, 'big.txt'), 'x'.repeat(2 * 1024 * 1024))

  git(['add', '-A'])
  git(['commit', '-m', 'base commit'])

  // A real origin, so the branch has a base to be compared against (FXPL-08/10).
  // Without one there is no origin/HEAD and the mode correctly falls to FXPL-11.
  // OUTSIDE the workspace folder: a bare repo sitting beside the real one makes
  // the workspace scanner report "no git repos in this folder" and drop the
  // valid repo with it. Observed 2026-09-20; the scanner is not this feature's.
  const origin = join(BASE, 'fx-smoke-origin.git')
  execFileSync('git', ['init', '--bare', '-b', 'main', origin], { windowsHide: true })
  git(['remote', 'add', 'origin', origin])
  git(['push', '-q', '-u', 'origin', 'main'])
  git(['remote', 'set-head', 'origin', 'main'])

  git(['checkout', '-b', 'feature/smoke'])
  writeFileSync(join(REPO, 'src', 'added.ts'), 'export const added = true\n')
  git(['add', 'src/added.ts'])
  git(['commit', '-m', 'add a file on the branch'])
  git(['rm', '-q', 'docs/notes.md'])
  git(['commit', '-m', 'delete notes on the branch'])

  // Uncommitted work, so the third lens has something of its own to show.
  writeFileSync(join(REPO, 'src', 'main.ts'), 'export const answer = 43\n')
  writeFileSync(join(REPO, 'scratch.txt'), 'untracked\n')

  // A SECOND worktree, so the lens-per-worktree memory of FXPL-06/13 can be
  // driven at all: switching away and back is the only way to observe it.
  execFileSync(
    'git',
    ['worktree', 'add', '-q', '-b', 'feature/other', join(WS_PATH, 'app-other'), 'main'],
    {
      cwd: REPO,
      windowsHide: true
    }
  )
  writeFileSync(join(WS_PATH, 'app-other', 'other.txt'), 'second worktree\n')

  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {}
  if (!Array.isArray(config.workspaces)) config.workspaces = []
  const entry = { id: WS_PATH.toLowerCase(), path: WS_PATH, displayName: 'fx-smoke-seed' }
  config.workspaces = [...config.workspaces.filter((w) => w.id !== entry.id), entry]
  mkdirSync(join(CONFIG_PATH, '..'), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  console.log(`Seeded ${WS_PATH}`)
  console.log(`Registered in ${CONFIG_PATH}`)
  console.log(
    `Now launch the app with --remote-debugging-port=${PORT} and run this script with no arguments.`
  )
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
  rmTree(join(BASE, 'fx-smoke-origin.git'))
  console.log(`Unregistered and removed ${WS_PATH}`)
}

/* ----------------------------------------------------------------- drive -- */

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
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
    }, 20000)
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

/* Clicks the first element whose textContent matches, and reports whether it hit. */
const clickByText = (selector, text) => `
  (() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => (e.textContent || '').trim() === ${JSON.stringify(text)})
    if (!el) return false
    el.click()
    return true
  })()
`

/* Selects the seeded worktree by its branch, the only label its row carries. */
const clickBranch = (branch) => `
  (() => {
    const el = [...document.querySelectorAll('.sidebar-worktree-branch')]
      .find((e) => (e.textContent || '').trim() === ${JSON.stringify(branch)})
    if (!el) return false
    el.closest('.sidebar-worktree').click()
    return true
  })()
`

const treeNames = `[...document.querySelectorAll('.file-tree-name')].map((e) => e.textContent.trim())`
const tabLabels = `[...document.querySelectorAll('.file-tab-label')].map((e) => e.textContent.trim())`

async function drive() {
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

  // 1. The direction exists in the segment control (FXPL-01).
  const hasSegment = await evaluate(
    ws,
    `[...document.querySelectorAll('.topbar-segment, .topbar button')].some(
       (e) => (e.textContent || '').trim() === 'Files')`
  )
  check('The TopBar offers a Files segment (FXPL-01)', hasSegment === true)

  // 2. Empty state before a worktree is selected (FXPL-03).
  await evaluate(ws, clickByText('.topbar-segment, .topbar button', 'Files'))
  await sleep(800)
  const empty = await evaluate(
    ws,
    `document.querySelector('.files-view-empty')?.textContent?.trim() ?? null`
  )
  check(
    'Empty state with no worktree selected (FXPL-03)',
    typeof empty === 'string' && empty.length > 0,
    String(empty)
  )

  // The worktree selection is global and is made in the Tree direction — the
  // sidebar is not mounted in Files, which is exactly why the empty state above
  // exists. Go back, select, and return.
  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  // The tree is built by running git over every registered worktree, so on a
  // cold start the sidebar is empty for a moment. Wait for the row, not a guess.
  for (let i = 0; ; i++) {
    const n = await evaluate(ws, `document.querySelectorAll('.sidebar-worktree-branch').length`)
    if (n > 0) break
    if (i >= 30) break
    await sleep(1000)
  }
  const picked = await evaluate(ws, clickBranch('feature/smoke'))
  if (!picked) {
    const branches = await evaluate(
      ws,
      `[...document.querySelectorAll('.sidebar-worktree-branch')].map((e) => e.textContent.trim())`
    )
    throw new Error(
      `Could not find the seeded worktree in the sidebar. Branches present: ${JSON.stringify(branches)}`
    )
  }
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1400)

  // The lens persists per worktree (FXPL-13), so a previous run leaves it where
  // it ended. Start from the full folder explicitly.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1200)

  // 3. The ignored folder never appears (FXPL-04).
  let names = await evaluate(ws, treeNames)
  check(
    'Ignored folder is not listed (FXPL-04)',
    !names.includes('build'),
    `top level: ${names.join(', ')}`
  )

  // 4. The untracked file does appear (FXPL-04).
  check(
    'Untracked file is listed (FXPL-04)',
    names.includes('scratch.txt'),
    `top level: ${names.join(', ')}`
  )

  // 5. Folders expand lazily (FXPL-05).
  const beforeExpand = names.length
  await evaluate(ws, clickByText('.file-tree-name', 'src'))
  await sleep(900)
  names = await evaluate(ws, treeNames)
  check(
    'A folder expands to its direct children (FXPL-05)',
    names.includes('main.ts') && names.length > beforeExpand,
    `after expand: ${names.join(', ')}`
  )

  // 6. The since-base lens lists what the branch changed (FXPL-08).
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1200)
  names = await evaluate(ws, treeNames)
  const sinceBase = await evaluate(
    ws,
    `document.querySelector('.file-tree-base-select')?.value ?? document.querySelector('.file-tree-base-label')?.textContent?.trim() ?? null`
  )
  check(
    'Diff-to-origin lists the branch changes (FXPL-08)',
    names.includes('added.ts') && names.includes('notes.md'),
    `listed: ${names.join(', ')}`
  )
  check(
    'The base picker shows a base (FXPL-09/10)',
    sinceBase !== null && sinceBase !== '',
    String(sinceBase)
  )

  // 7. The uncommitted lens (FXPL-12).
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1200)
  names = await evaluate(ws, treeNames)
  check(
    'Uncommitted lists the edit and the untracked file (FXPL-12)',
    names.includes('main.ts') && names.includes('scratch.txt'),
    `listed: ${names.join(', ')}`
  )

  // 8. A click opens a tab (FXPL-16).
  await evaluate(ws, clickByText('.file-tree-name', 'main.ts'))
  await sleep(1200)
  let tabs = await evaluate(ws, tabLabels)
  check(
    'Clicking a file opens a tab (FXPL-16)',
    tabs.some((t) => t.includes('main.ts')),
    `tabs: ${tabs.join(', ')}`
  )

  // 9. The viewer highlights the file's language (FXPL-17).
  //
  // Distinct token classes, not a token count: Monaco emits mtk1 for plaintext
  // too, so `tokens > 0` stays green even if the language were resolved wrong.
  // More than one class means a grammar actually tokenised the text.
  const viewer = await evaluate(
    ws,
    `(() => {
       const ed = document.querySelector('.code-viewer-editor .monaco-editor')
       if (!ed) return null
       const spans = [...document.querySelectorAll('.code-viewer-editor .view-line span[class*="mtk"]')]
       return {
         tokens: spans.length,
         classes: new Set(spans.map((s) => s.className)).size
       }
     })()`
  )
  check(
    'The viewer highlights the file by language (FXPL-17)',
    viewer !== null && viewer.tokens > 0 && viewer.classes > 1,
    JSON.stringify(viewer)
  )

  // 9b. The viewer is read-only (FXPL-17), proved by typing into it.
  //
  // NOT by a DOM property. Two earlier versions of this check were tautologies:
  // the first asked whether the editor existed, the second read
  // `textarea.readOnly` — but Monaco's NativeEditContext sets `readonly` on its
  // ime-text-area unconditionally at construction, whatever the editor's
  // readOnly option says, and Electron 39 takes that branch. Only the behaviour
  // discriminates: focus the text and type, and the content must not change.
  const textBeforeTyping = await evaluate(
    ws,
    `[...document.querySelectorAll('.code-viewer-editor .view-line')]
       .map((l) => l.textContent.replace(/\u00a0/g, ' '))
       .join('\\n')`
  )
  const firstLineBox = await evaluate(
    ws,
    `(() => {
       const el = document.querySelector('.code-viewer-editor .view-line')
       if (!el) return null
       const r = el.getBoundingClientRect()
       return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
     })()`
  )
  if (firstLineBox) {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send(ws, 'Input.dispatchMouseEvent', {
        type,
        x: firstLineBox.x,
        y: firstLineBox.y,
        button: 'left',
        clickCount: 1
      })
    }
    await sleep(400)
    for (const ch of 'ZZZ') {
      await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch })
      await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: ch })
      await sleep(80)
    }
  }
  await sleep(800)
  const textAfterTyping = await evaluate(
    ws,
    `[...document.querySelectorAll('.code-viewer-editor .view-line')]
       .map((l) => l.textContent.replace(/\u00a0/g, ' '))
       .join('\\n')`
  )
  check(
    'Typing into the viewer changes nothing — it is read-only (FXPL-17)',
    typeof textBeforeTyping === 'string' &&
      textBeforeTyping.trim().length > 0 &&
      textAfterTyping === textBeforeTyping &&
      !textAfterTyping.includes('ZZZ'),
    !textBeforeTyping || !textBeforeTyping.trim()
      ? 'NO CONTENT TO TYPE INTO — the check proves nothing'
      : textAfterTyping === textBeforeTyping
        ? `content unchanged (${textBeforeTyping.trim().length} chars)`
        : 'CONTENT CHANGED — not read-only'
  )

  // 10. A disk change updates the tab within 1 s (FXPL-21), on a short file so
  // the appended line is inside the rendered viewport.
  writeFileSync(
    join(REPO, 'src', 'main.ts'),
    'export const answer = 43\n// appended by the smoke\n'
  )
  await sleep(1400)
  // Monaco renders spaces as NBSP (U+00A0) inside a view line, so a literal
  // comparison against the written text never matches. Normalise first.
  const updated = await evaluate(
    ws,
    `[...document.querySelectorAll('.code-viewer-editor .view-line')]
       .map((l) => l.textContent.replace(/\u00a0/g, ' '))
       .join('\\n')`
  )
  check(
    'An open tab updates within 1 s of a disk change (FXPL-21)',
    typeof updated === 'string' && updated.includes('appended by the smoke'),
    `lines now: ${JSON.stringify(String(updated ?? '').slice(0, 80))}`
  )

  // 10b. The SCROLL half of FXPL-21, which needs a file tall enough to scroll.
  //
  // Monaco scrolls virtually and handles wheel input itself: the scrollable
  // element's scrollTop stays 0, assigning to it does nothing, and a synthetic
  // WheelEvent is ignored. Only a real input event through CDP moves it. The
  // assertion is the first RENDERED line number, not the offset — an earlier
  // version asserted an offset that never moved and reported 0 -> 0 as a pass.
  const tall = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i}`).join('\n') + '\n'
  writeFileSync(join(REPO, 'src', 'main.ts'), tall)
  await sleep(1500)

  const firstRenderedLine = `(() => {
    const el = document.querySelector('.code-viewer-editor .view-line')
    if (!el) return null
    const m = el.textContent.replace(/\u00a0/g, ' ').match(/const line(\\d+)/)
    return m ? Number(m[1]) : null
  })()`

  const box = await evaluate(
    ws,
    `(() => {
       const s = document.querySelector('.code-viewer-editor .monaco-scrollable-element')
       if (!s) return null
       const r = s.getBoundingClientRect()
       return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
     })()`
  )
  if (box) {
    for (let i = 0; i < 20; i++) {
      await send(ws, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: box.x,
        y: box.y,
        deltaX: 0,
        deltaY: 600,
        pointerType: 'mouse'
      })
      await sleep(120)
    }
  }
  await sleep(900)
  const lineBefore = await evaluate(ws, firstRenderedLine)
  check(
    'The viewer really scrolled away from the top',
    typeof lineBefore === 'number' && lineBefore > 10,
    `first rendered line ${lineBefore}`
  )

  // Append past the viewport: the tab must re-read without moving the view.
  writeFileSync(join(REPO, 'src', 'main.ts'), tall + '// appended past the viewport\n')
  await sleep(1500)
  const lineAfter = await evaluate(ws, firstRenderedLine)
  check(
    'The tab keeps its scroll position across the update (FXPL-21)',
    typeof lineAfter === 'number' &&
      typeof lineBefore === 'number' &&
      lineBefore > 10 &&
      Math.abs(lineAfter - lineBefore) <= 1,
    `first rendered line ${lineBefore} -> ${lineAfter}`
  )

  // 11. A binary file shows a placeholder, not content (FXPL-20).
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(900)
  await evaluate(ws, clickByText('.file-tree-name', 'assets'))
  await sleep(700)
  await evaluate(ws, clickByText('.file-tree-name', 'logo.bin'))
  await sleep(1000)
  let placeholder = await evaluate(
    ws,
    `document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null`
  )
  check(
    'A binary file shows a placeholder (FXPL-20)',
    placeholder === 'Binary file',
    String(placeholder)
  )

  // 12. A file above 1 MB shows a placeholder with its size (FXPL-20).
  await evaluate(ws, clickByText('.file-tree-name', 'big.txt'))
  await sleep(1200)
  placeholder = await evaluate(
    ws,
    `({
       headline: document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null,
       meta: [...document.querySelectorAll('.file-placeholder-meta span')].map((e) => e.textContent.trim())
     })`
  )
  check(
    'A file above 1 MB shows a placeholder with its size (FXPL-20)',
    placeholder.headline === 'Too large to display' && placeholder.meta.some((m) => /MB/.test(m)),
    JSON.stringify(placeholder)
  )

  // 13. A SINGLE click on a .sln opens a tab like any other file (FXPL-28a).
  // The double click that launches VS 2026 is a hand check: it raises UAC, and
  // the smoke must never do that. The single click is deferred by the
  // double-click window, so this waits past it before asserting.
  const tabsBeforeSln = (await evaluate(ws, tabLabels)).length
  await evaluate(ws, clickByText('.file-tree-name', 'App.sln'))
  await sleep(1400)
  const tabsAfterSln = await evaluate(ws, tabLabels)
  check(
    'A single click on a .sln opens a tab (FXPL-28a)',
    tabsAfterSln.length === tabsBeforeSln + 1 && tabsAfterSln.some((t) => t.includes('App.sln')),
    `${tabsBeforeSln} tabs before, now: ${tabsAfterSln.join(', ')}`
  )

  // 14. A deleted file leaves its tab open with a placeholder (FXPL-24).
  // Focus the tab that is already open rather than clicking the tree again: the
  // earlier checks expanded and folded folders, so the row may not be there.
  const focused = await evaluate(
    ws,
    `(() => {
       const el = [...document.querySelectorAll('.file-tab-label')]
         .find((e) => (e.textContent || '').trim().includes('main.ts'))
       if (!el) return false
       el.click()
       return true
     })()`
  )
  if (!focused) throw new Error('The main.ts tab was not open when FXPL-24 was checked')
  await sleep(900)
  rmSync(join(REPO, 'src', 'main.ts'), { force: true })
  await sleep(1600)
  const afterDelete = await evaluate(
    ws,
    `({
       tabs: ${tabLabels},
       headline: document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null
     })`
  )
  check(
    'A deleted file keeps its tab and shows a placeholder (FXPL-24)',
    afterDelete.tabs.some((t) => t.includes('main.ts')) &&
      afterDelete.headline === 'This file no longer exists',
    JSON.stringify(afterDelete)
  )

  // 15. The launcher row of FXPL-25 exists and offers exactly its four tools.
  const launchers = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tabs-launcher')].map((e) => e.textContent.trim())`
  )
  check(
    'The launcher row offers Explorer, VS Code, VS 2022 and VS 2026 (FXPL-25)',
    launchers.length === 4 &&
      ['Explorer', 'VS Code', '2022', '2026'].every((name) =>
        launchers.some((l) => l.includes(name))
      ),
    `launchers: ${launchers.join(', ')}`
  )

  // 16. A click in a diff mode opens a DIFF (FDIF-01/02), which is what
  // `files-diff` T18 replaced these two checks with.
  //
  // Until then this smoke asserted the interim caption "Showing the current
  // file, not a diff" (FXPL-14) and the "This file was deleted" card
  // (FXPL-15). Both requirements are struck through in `files-explore/spec.md`
  // as superseded, and the card's placeholder kind was removed with them. These
  // checks were rewritten because the behaviour they named no longer exists —
  // NOT to make a red check pass. A check that was failing for any other reason
  // must be left failing.
  await evaluate(ws, clickByText('.file-tree-mode', 'Diff to origin'))
  await sleep(1300)
  await evaluate(ws, clickByText('.file-tree-name', 'added.ts'))
  await sleep(1600)
  const openedDiff = await evaluate(
    ws,
    `({
       diffEditor: document.querySelectorAll('.diff-viewer .monaco-diff-editor').length,
       fileViewer: document.querySelectorAll('.code-viewer-editor .monaco-editor').length,
       caption: (document.querySelector('.code-viewer-note') || {}).textContent || null
     })`
  )
  check(
    'A click in a diff mode opens a diff, not the file (FDIF-01)',
    openedDiff.diffEditor === 1 && openedDiff.fileViewer === 0 && openedDiff.caption === null,
    JSON.stringify(openedDiff)
  )

  // A file the branch deleted is a diff whose modified side is absent, which
  // shows what was lost instead of only naming the deletion (FDIF-04).
  await evaluate(ws, clickByText('.file-tree-name', 'notes.md'))
  await sleep(1600)
  const deletedDiff = await evaluate(
    ws,
    `({
       diffEditor: document.querySelectorAll('.diff-viewer .monaco-diff-editor').length,
       placeholder:
         document.querySelector('.file-placeholder-headline')?.textContent?.trim() ?? null
     })`
  )
  check(
    'A file the branch deleted opens as a diff with an absent side (FDIF-04)',
    deletedDiff.diffEditor === 1 && deletedDiff.placeholder === null,
    JSON.stringify(deletedDiff)
  )

  // 17. A file appearing on disk shows up in the current mode's LIST within 1 s
  // (FXPL-22) — the tab reaction of FXPL-21 is a different guarantee, and the
  // earlier checks only ever observed the tab.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1300)
  const namesBeforeAdd = await evaluate(ws, treeNames)
  writeFileSync(join(REPO, 'appeared.txt'), 'created while the tree was open\n')
  await sleep(1500)
  const namesAfterAdd = await evaluate(ws, treeNames)
  check(
    'A file created on disk appears in the list within 1 s (FXPL-22)',
    !namesBeforeAdd.includes('appeared.txt') && namesAfterAdd.includes('appeared.txt'),
    `${namesBeforeAdd.length} entries -> ${namesAfterAdd.length}`
  )

  // 18. Each worktree keeps its own lens and its own tabs (FXPL-06/13/18).
  // The mode is set here, the other worktree is visited, and both are read back
  // on return — the only way to observe the per-worktree memory at all.
  await evaluate(ws, clickByText('.file-tree-mode', 'Uncommitted'))
  await sleep(1200)
  const tabsBeforeSwitch = await evaluate(ws, tabLabels)

  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  await sleep(900)
  const switched = await evaluate(ws, clickBranch('feature/other'))
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1400)
  const otherMode = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-mode')]
       .filter((e) => e.getAttribute('aria-selected') === 'true')
       .map((e) => e.textContent.trim())[0] ?? null`
  )
  const otherTabs = await evaluate(ws, tabLabels)
  check(
    'A second worktree opens with its own lens and no inherited tabs (FXPL-06/18)',
    switched === true && otherMode === 'Folder' && otherTabs.length === 0,
    `switched=${switched}, mode=${otherMode}, tabs=${otherTabs.length}`
  )

  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  await sleep(900)
  await evaluate(ws, clickBranch('feature/smoke'))
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1500)
  const backMode = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-mode')]
       .filter((e) => e.getAttribute('aria-selected') === 'true')
       .map((e) => e.textContent.trim())[0] ?? null`
  )
  const backTabs = await evaluate(ws, tabLabels)
  check(
    'Returning to a worktree restores its lens and its tabs (FXPL-06/13/18)',
    backMode === 'Uncommitted' && backTabs.length === tabsBeforeSwitch.length,
    `mode=${backMode}, tabs ${tabsBeforeSwitch.length} -> ${backTabs.length}`
  )

  // 15. The status-bar counter lands in Files, uncommitted mode (FXPL-31/32).
  //
  // Leave the worktree in Folder FIRST. The checks above end with it already in
  // Uncommitted, so without this the mode assertion below passes whether or not
  // the counter forces anything — it would read a real value from one ordering
  // away from discriminating.
  await evaluate(ws, clickByText('.file-tree-mode', 'Folder'))
  await sleep(1200)
  await evaluate(ws, clickByText('.topbar-segment, .topbar button', 'Tree'))
  await sleep(700)
  const counterClicked = await evaluate(
    ws,
    `(() => {
       const b = document.querySelector('.status-bar-changes')
       if (!b) return false
       b.click()
       return true
     })()`
  )
  await sleep(1200)
  const landed = await evaluate(
    ws,
    `({
       clicked: ${counterClicked},
       inFiles: !!document.querySelector('.files-view'),
       mode: [...document.querySelectorAll('.file-tree-mode')]
         .filter((e) => e.getAttribute('aria-selected') === 'true')
         .map((e) => e.textContent.trim())[0] ?? null
     })`
  )
  check(
    'The status-bar counter forces Files into uncommitted mode (FXPL-31)',
    landed.inFiles === true && landed.mode === 'Uncommitted',
    JSON.stringify(landed)
  )

  // 15b. The mode the counter forced is the one this worktree restores
  // (FXPL-32). One config write does both halves, so leaving and returning is
  // the only way to observe the second.
  await evaluate(ws, clickByText('.topbar-segment', 'Tree'))
  await sleep(800)
  await evaluate(ws, clickBranch('feature/other'))
  await sleep(900)
  await evaluate(ws, clickBranch('feature/smoke'))
  await sleep(900)
  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(1500)
  const restoredMode = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-mode')]
       .filter((e) => e.getAttribute('aria-selected') === 'true')
       .map((e) => e.textContent.trim())[0] ?? null`
  )
  check(
    'The forced mode is the one the worktree restores (FXPL-32)',
    restoredMode === 'Uncommitted',
    `restored mode: ${restoredMode}`
  )

  // FXPL-33, the saved half: the selection is written to the config, so a
  // relaunch has something to come back to. The restored half needs a second
  // launch and is checked by `--after-restart`.
  const savedSelection = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).ui?.selectedWorktree
  check(
    'The selected worktree is written to the config (FXPL-33)',
    typeof savedSelection === 'string' && savedSelection.toLowerCase().includes('fx-smoke-seed'),
    `ui.selectedWorktree = ${JSON.stringify(savedSelection)}`
  )

  const failed = checks.filter((c) => !c.ok)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  console.log('\nNow relaunch the app and run `--after-restart` to check FXPL-33 comes back.')
  console.log(
    '\nHand checks this smoke deliberately does NOT script (they raise UAC or a shell window):'
  )
  console.log('  A. DOUBLE-click App.sln in the tree — VS 2026 must open elevated on that file and')
  console.log('     no tab must appear for it (FXPL-28); a single click opens a tab instead.')
  console.log('     Double-click it again at once: no second instance must open (FXPL-28b).')
  console.log("  B. Click the File Explorer launcher on a file tab — Explorer must open the file's")
  console.log('     FOLDER with the file SELECTED, never open the file itself (FXPL-27).')

  ws.close()
  return failed.length
}

/* ------------------------------------------------------------------ main -- */

/* --------------------------------------------------------- after restart -- */

/**
 * FXPL-33, the restored half. Run against a SECOND launch, without re-seeding:
 * the drive left its worktree selected, and the app must come back on it —
 * which is what lets the Files direction open on something at all.
 */
async function afterRestart() {
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
  // Nothing is clicked: the point is what the app selected on its own. The
  // status bar names the selected worktree in every direction, and the sidebar
  // does not exist outside the Tree — which is where the app lands when Files
  // was the direction it closed in.
  await sleep(2500)
  const branch = await evaluate(
    ws,
    `document.querySelector('.status-bar-branch')?.textContent.trim() ?? null`
  )
  check(
    'The app relaunched on the worktree it closed on (FXPL-33)',
    typeof branch === 'string' && branch.includes('feature/smoke'),
    `status bar branch: ${JSON.stringify(branch)}`
  )

  await evaluate(ws, clickByText('.topbar-segment', 'Files'))
  await sleep(2000)
  // Named rows, not "rows or a note": the note is exactly what appears when
  // nothing is selected, so accepting it would pass the failure this checks.
  const names = await evaluate(
    ws,
    `[...document.querySelectorAll('.file-tree-name')].map((e) => e.textContent.trim())`
  )
  check(
    'Files opens listing that worktree, not an empty column (FXPL-33)',
    names.includes('src') && names.includes('main.ts'),
    `tree rows: ${JSON.stringify(names)}`
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
  const failed = await drive()
  process.exit(failed ? 1 : 0)
}
