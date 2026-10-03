/* CDP smoke for the start-work-from-task feature (STWK-02..05; STWK-01 is
 * covered by Vitest) and for branch-slug-short's path check (BSLG, issue #145).
 *
 * Path check (no Azure DevOps), three steps:
 *
 *   1. SMOKE_CONFIG=<userData>/config.json SMOKE_BASE=<short folder> \
 *        node scripts/smoke-start-work.mjs --seed          (app NOT running)
 *   2. launch the app with --user-data-dir=<userData> --remote-debugging-port=<SMOKE_PORT>,
 *      then SMOKE_BASE=<same folder> SMOKE_ONLY=longpath node scripts/smoke-start-work.mjs
 *   3. SMOKE_CONFIG=<same> SMOKE_BASE=<same> node scripts/smoke-start-work.mjs --clean
 *
 * --seed refuses to run without SMOKE_CONFIG or with the owner's real
 * %APPDATA%\playground\config.json: run the app on a throwaway --user-data-dir.
 * It writes, under SMOKE_BASE (default <temp>\bss-smoke):
 *
 *   bss-ids\.app\config.json   worktreeTemplate {repo}-{id}
 *   bss-ids\api                core.longpaths=false, a local branch `team`,
 *                              `main` tracking bss-origin.git
 *   bss-ids\web                core.longpaths=true
 *   bss-default\app            core.longpaths=true, global template {repo}-{branch}
 *   bss-origin.git             api's remote
 *
 * and registers both workspaces in SMOKE_CONFIG with ado.branchTemplate
 * `user/{dev}/{usId}-{usSlug}/{id}-{slug}`, the alias `dev` and no pins. Every
 * repository pins core.autocrlf and core.longpaths in its own config. --clean
 * removes those folders, unregisters the workspaces, and removes SMOKE_BASE when
 * it is left empty. Re-seed and relaunch before every drive: checks 4, 5 and 7
 * call worktrees:create. The progress section alone cleans up after itself.
 *
 * The typed names are sized from each repository's common git dir, read with
 * `git rev-parse`, so every check hits its boundary on any SMOKE_BASE.
 *
 * SMOKE_ONLY selects a section:
 *   longpath   checks 1-7 on the seed.
 *   slug       checks 8-9 on the seed, optional: they run only with
 *              SMOKE_LONG_TASK_URL set to a work item whose title slugs to more
 *              than 40 characters under the rule before #145 (refused otherwise),
 *              and an az CLI logged in to its org. Without the variable the
 *              section prints a skip notice and counts as neither pass nor fail.
 *              Never write the URL or the title into the repository; the slug
 *              rule's proof is its unit tests.
 *   progress   checks 10-13 on the seed, offline (CRTO, issue #153): Start Work's
 *              progress line and busy dialog. It writes bss-default\.app\config.json
 *              with postCreateCommands { app: a 5-second ping } (restoring any file
 *              there afterwards), opens Start Work for a task that is not pinned and
 *              has no details (through the Tasks pane's own onStartWork: the card's
 *              button needs live Azure DevOps details), creates chore/progress on
 *              app with the base refresh unticked, then removes the worktree and
 *              deletes the branch, so it reruns on the same seed. Hand-verify list:
 *              scripts/smoke-create.mjs.
 *   stwk       the legacy STWK checks below, which need SMOKE_TASK_URL.
 * With no SMOKE_ONLY and the seed present under SMOKE_BASE, every seed section
 * runs and the legacy checks print a skip notice (they assume their own config,
 * below); with no seed there, the legacy checks run as before.
 *
 * Legacy STWK checks: the app runs against a config holding one workspace with
 * one clean git repo, no ado defaults and no pins, with an az CLI logged in to
 * an org containing the work item in SMOKE_TASK_URL (required). SMOKE_CONFIG
 * names that config.json; it defaults to %APPDATA%\playground\config.json.
 * Run: SMOKE_TASK_URL=<work item URL> node scripts/smoke-start-work.mjs
 * Re-runs need a fresh seed repo (or `git branch -D` the templated branch):
 * cleanup removes the worktree but `git worktree remove` keeps the branch,
 * so the next create fails on the branch collision.
 *
 * SMOKE_PORT is the CDP port (default 9222).
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const MODE =
  process.argv[2] === '--seed' ? 'seed' : process.argv[2] === '--clean' ? 'clean' : 'drive'
const ONLY = process.env.SMOKE_ONLY || null
const BASE = resolve(process.env.SMOKE_BASE ?? join(tmpdir(), 'bss-smoke'))
const IDS_WS = join(BASE, 'bss-ids')
const DEFAULT_WS = join(BASE, 'bss-default')
const ORIGIN = join(BASE, 'bss-origin.git')
const REAL_CONFIG = join(process.env.APPDATA ?? '', 'playground', 'config.json')
const CONFIG_PATH = process.env.SMOKE_CONFIG ?? REAL_CONFIG
const BRANCH_TEMPLATE = 'user/{dev}/{usId}-{usSlug}/{id}-{slug}'

/** Windows holds a folder open briefly after a watcher on it exits. */
const rmTree = (path) =>
  rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })

const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()

/* ------------------------------------------------------------------ seed -- */

function refuseRealConfig() {
  if (
    !process.env.SMOKE_CONFIG ||
    resolve(CONFIG_PATH).toLowerCase() === resolve(REAL_CONFIG).toLowerCase()
  ) {
    console.error(
      'SMOKE_CONFIG must name the config.json of a throwaway --user-data-dir, never %APPDATA%\\playground.'
    )
    process.exit(1)
  }
}

/** A repository on `main` with one commit, its core.longpaths pinned in its own config. */
function seedRepo(path, longPaths) {
  mkdirSync(path, { recursive: true })
  git(['init', '-q', '-b', 'main'], path)
  git(['config', 'core.autocrlf', 'false'], path)
  git(['config', 'core.longpaths', longPaths ? 'true' : 'false'], path)
  git(['config', 'user.email', 'smoke@example.invalid'], path)
  git(['config', 'user.name', 'Slug Smoke'], path)
  writeFileSync(join(path, 'README.md'), '# Smoke repository\n\nNothing in it is real.\n')
  git(['add', '-A'], path)
  git(['commit', '-q', '-m', 'base commit'], path)
}

const workspaceEntry = (path, displayName) => ({ id: path.toLowerCase(), path, displayName })

function seed() {
  refuseRealConfig()
  rmTree(IDS_WS)
  rmTree(DEFAULT_WS)
  rmTree(ORIGIN)

  mkdirSync(join(IDS_WS, '.app'), { recursive: true })
  writeFileSync(
    join(IDS_WS, '.app', 'config.json'),
    JSON.stringify({ worktreeTemplate: '{repo}-{id}' }, null, 2) + '\n'
  )
  const api = join(IDS_WS, 'api')
  seedRepo(api, false)
  // `team` makes the branch `team/77-x` collide in check 5. Not `user`: Start Work's
  // nested template puts every branch under `user/`, and check 8 creates one.
  git(['branch', 'team'], api)
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', ORIGIN], { windowsHide: true })
  git(['config', 'core.autocrlf', 'false'], ORIGIN)
  git(['config', 'core.longpaths', 'false'], ORIGIN)
  git(['remote', 'add', 'origin', ORIGIN], api)
  git(['push', '-q', '-u', 'origin', 'main'], api)
  git(['remote', 'set-head', 'origin', 'main'], api)
  seedRepo(join(IDS_WS, 'web'), true)
  seedRepo(join(DEFAULT_WS, 'app'), true)

  const config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) : {}
  const entries = [workspaceEntry(IDS_WS, 'bss-ids'), workspaceEntry(DEFAULT_WS, 'bss-default')]
  const ids = new Set(entries.map((e) => e.id))
  config.workspaces = [
    ...(Array.isArray(config.workspaces) ? config.workspaces : []).filter((w) => !ids.has(w.id)),
    ...entries
  ]
  config.ado = { ...config.ado, branchTemplate: BRANCH_TEMPLATE, devAlias: 'dev' }
  config.pinnedTasks = []
  mkdirSync(join(CONFIG_PATH, '..'), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  console.log(`Seeded ${IDS_WS} and ${DEFAULT_WS}`)
  console.log(`Registered in ${CONFIG_PATH}`)
  console.log(`Now launch the app with --remote-debugging-port=${PORT} and run with no arguments.`)
}

function clean() {
  refuseRealConfig()
  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    if (Array.isArray(config.workspaces)) {
      const ids = new Set([IDS_WS.toLowerCase(), DEFAULT_WS.toLowerCase()])
      config.workspaces = config.workspaces.filter((w) => !ids.has(w.id))
      writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    }
  }
  rmTree(IDS_WS)
  rmTree(DEFAULT_WS)
  rmTree(ORIGIN)
  if (existsSync(BASE) && readdirSync(BASE).length === 0) rmTree(BASE)
  console.log(`Unregistered and removed the seed under ${BASE}`)
}

/* ---------------------------------------------------------------- harness -- */

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

/* Statements that set a React-controlled input's value so the change handler fires. */
const setInput = (selector, value) => `
  const field = document.querySelector(${JSON.stringify(selector)})
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(field, ${JSON.stringify(value)})
  field.dispatchEvent(new Event('input', { bubbles: true }))
`

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/* ------------------------------------------------------- path check (BSLG) -- */

const refMessage = (n) =>
  `The branch's ref path is ${n} characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository.`
const folderMessage = (n) =>
  `The worktree folder path is ${n} characters, over the 215 git accepts. Shorten the name, or use a shorter worktree template such as {repo}-{id}.`

/** The repository's common git dir as git creates files under it: backslashes, no trailing one. */
const commonDirOf = (repoPath) =>
  git(['rev-parse', '--path-format=absolute', '--git-common-dir'], repoPath)
    .replaceAll('/', '\\')
    .replace(/\\+$/, '')

const refPathOf = (commonDir, branch) =>
  `${commonDir}\\refs\\heads\\${branch.replaceAll('/', '\\')}.lock`

/** A branch whose ref path in `commonDir` is exactly `n` characters; its folders stay short. */
function branchForRefPath(commonDir, n) {
  const prefix = 'feat/dev/11-x/22-'
  const branch = prefix + 'b'.repeat(n - refPathOf(commonDir, prefix).length)
  if (refPathOf(commonDir, branch).length !== n) throw new Error(`cannot size a ref path of ${n}`)
  return branch
}

/** A branch whose `{repo}-{branch}` worktree folder for `repoPath` is exactly `n` characters. */
function branchForFolder(repoPath, n) {
  const cut = repoPath.lastIndexOf('\\')
  const folderOf = (branch) =>
    `${repoPath.slice(0, cut)}\\${repoPath.slice(cut + 1)}-${branch.replaceAll('/', '-')}`
  const prefix = 'feat/'
  return prefix + 'c'.repeat(n - folderOf(prefix).length)
}

/** The dialog as the user sees it: the path line, the Create button, the preview. */
const dialogState = `(() => ({
  open: document.querySelector('.dialog-panel') !== null,
  line: document.querySelector('.dialog-path-limit')?.textContent.trim() ?? null,
  createDisabled: document.querySelector('.dialog-btn-primary')?.disabled ?? null,
  preview: document.querySelector('.dialog-path-value')?.textContent ?? null,
  repo: document.querySelector('.dialog-repo-chip.selected .dialog-repo-chip-name')?.textContent ?? null,
  branch: document.querySelectorAll('.dialog-input')[1]?.value ?? null
}))()`

const setBranch = (value) =>
  `(() => { ${setInput('.dialog-branch-row div:nth-child(2) .dialog-input', value)} })()`

const clickChip = (name) => `(() => {
  const chip = [...document.querySelectorAll('.dialog-repo-chip')].find(
    (c) => c.querySelector('.dialog-repo-chip-name')?.textContent === ${JSON.stringify(name)}
  )
  chip?.click()
  return chip !== undefined
})()`

const openNewWorktree = (repoName) => `(async () => {
  const selector = ${JSON.stringify(`.sidebar-new-worktree-btn[title="New worktree in ${repoName}"]`)}
  for (let i = 0; i < 50 && !document.querySelector(selector); i++) {
    await new Promise((r) => setTimeout(r, 200))
  }
  document.querySelector(selector)?.click()
  for (let i = 0; i < 25; i++) {
    if (document.querySelector('.dialog-panel')) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
})()`

/** Polls the dialog until its path line reads `expected`, or `timeoutMs` passes. */
async function waitForLine(ws, expected, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const state = await evaluate(ws, dialogState)
    if (state.line === expected || Date.now() > end) return state
    await sleep(100)
  }
}

/** Time for the 250 ms debounce and main's three git reads to answer, before asserting no line. */
const ANSWER_WAIT_MS = 2500

const worktreeCount = (repoPath) =>
  git(['worktree', 'list', '--porcelain'], repoPath)
    .split('\n')
    .filter((line) => line.startsWith('worktree ')).length

/** Nothing the create could have made: no folder, no branch, no second worktree. */
const createdNothing = (repoPath, branch, folder) => ({
  folder: existsSync(folder),
  branch: git(['branch', '--list', branch], repoPath),
  worktrees: worktreeCount(repoPath)
})
const isNothing = (made) => made.folder === false && made.branch === '' && made.worktrees === 1

async function seededRepos(ws) {
  for (let i = 0; i < 40; i++) {
    const tree = await evaluate(ws, `window.api.invoke('tree:get')`)
    const repoIn = (wsPath, name) =>
      tree
        .find((w) => w.path.toLowerCase() === wsPath.toLowerCase())
        ?.repos.find((r) => r.name === name)
    const repos = {
      api: repoIn(IDS_WS, 'api'),
      web: repoIn(IDS_WS, 'web'),
      app: repoIn(DEFAULT_WS, 'app')
    }
    if (repos.api && repos.web && repos.app) return repos
    await sleep(500)
  }
  return null
}

async function longpathSection(ws) {
  const repos = await seededRepos(ws)
  if (!repos) throw new Error(`The seed under ${BASE} is not in the app's tree; run --seed first`)
  const { api, web, app } = repos
  const apiDir = commonDirOf(api.path)
  const b287 = branchForRefPath(apiDir, 287)
  const b259 = branchForRefPath(apiDir, 259)
  const b260 = branchForRefPath(apiDir, 260)

  // 1: a hand-typed name with a ref path of 287 on api (core.longpaths=false).
  if (!(await evaluate(ws, openNewWorktree('api')))) throw new Error('New worktree did not open')
  await evaluate(ws, setBranch(b287))
  const s287 = await waitForLine(ws, refMessage(287))
  check(
    '1. New worktree on api: a ref path of 287 shows the AC 17 text with 287 and disables Create (BSLG-17, BSLG-20, BSLG-24)',
    s287.repo === 'api' && s287.line === refMessage(287) && s287.createDisabled === true,
    JSON.stringify({ repo: s287.repo, line: s287.line, createDisabled: s287.createDisabled })
  )

  // 2: from the refusal just seen, 259 clears it and enables Create; 260 brings it back.
  await evaluate(ws, setBranch(b259))
  await sleep(ANSWER_WAIT_MS)
  const s259 = await evaluate(ws, dialogState)
  await evaluate(ws, setBranch(b260))
  const s260 = await waitForLine(ws, refMessage(260))
  check(
    '2. the same field at a ref path of 259 shows no path line and enables Create, at 260 the text with 260 and Create disabled (BSLG-19, BSLG-20, BSLG-23)',
    s259.branch === b259 &&
      s259.line === null &&
      s259.createDisabled === false &&
      s260.line === refMessage(260) &&
      s260.createDisabled === true,
    JSON.stringify({
      259: { line: s259.line, createDisabled: s259.createDisabled },
      260: { line: s260.line, createDisabled: s260.createDisabled }
    })
  )

  // 3: the 287 name refused on api, then on web (core.longpaths=true): no line.
  const webRefPath = refPathOf(commonDirOf(web.path), b287).length
  await evaluate(ws, setBranch(b287))
  const back = await waitForLine(ws, refMessage(287))
  await evaluate(ws, clickChip('web'))
  await sleep(ANSWER_WAIT_MS)
  const sWeb = await evaluate(ws, dialogState)
  check(
    '3. the 287 name on web (core.longpaths=true) shows no path line and enables Create (BSLG-21)',
    webRefPath === 287 &&
      back.line === refMessage(287) &&
      sWeb.repo === 'web' &&
      sWeb.branch === b287 &&
      sWeb.line === null &&
      sWeb.createDisabled === false,
    JSON.stringify({
      webRefPath,
      onApi: back.line !== null,
      line: sWeb.line,
      createDisabled: sWeb.createDisabled
    })
  )

  // 4: worktrees:create for the 287 name on api, skipping the dialog.
  const direct = await evaluate(
    ws,
    `window.api.invoke('worktrees:create', ${JSON.stringify({
      repoPath: api.path,
      branch: b287,
      baseBranch: 'main',
      worktreeTemplate: '{repo}-{id}',
      updateBase: true
    })})`
  )
  const made4 = createdNothing(api.path, b287, s287.preview)
  check(
    '4. worktrees:create for the 287 name on api returns ok: false with the AC 17 text and makes nothing (BSLG-25)',
    direct.ok === false && direct.error === refMessage(287) && isNothing(made4),
    JSON.stringify({ ok: direct.ok, error: direct.error, made: made4 })
  )

  // 5: git's own line for a create git refuses: `team` exists, so `team/77-x` cannot.
  await evaluate(ws, clickChip('api'))
  await evaluate(ws, setBranch('team/77-x'))
  await sleep(ANSWER_WAIT_MS)
  const before5 = await evaluate(ws, dialogState)
  await evaluate(ws, `document.querySelector('.dialog-btn-primary').click()`)
  let error5 = null
  for (let i = 0; i < 150 && error5 === null; i++) {
    await sleep(200)
    error5 = await evaluate(
      ws,
      `document.querySelector('.dialog-error:not(.dialog-path-limit)')?.textContent.trim() ?? null`
    )
  }
  check(
    "5. creating team/77-x on api shows git's fatal: cannot lock ref line, not Preparing worktree (BSLG-14)",
    before5.repo === 'api' &&
      before5.createDisabled === false &&
      (error5 ?? '').startsWith("fatal: cannot lock ref 'refs/heads/team/77-x'") &&
      !(error5 ?? '').includes('Preparing worktree'),
    JSON.stringify({ repo: before5.repo, error: error5 })
  )
  await evaluate(ws, `document.querySelector('.dialog-btn-ghost')?.click()`)
  await sleep(300)

  // 6 (P2): the default template on app (core.longpaths=true) and a 230-character folder.
  const b230 = branchForFolder(app.path, 230)
  if (!(await evaluate(ws, openNewWorktree('app')))) throw new Error('New worktree did not open')
  await evaluate(ws, setBranch(b230))
  const s230 = await waitForLine(ws, folderMessage(230))
  check(
    '6. New worktree on app: a 230-character folder shows the folder text with 230 and disables Create (BSLG-27)',
    s230.repo === 'app' &&
      (s230.preview ?? '').length === 230 &&
      s230.line === folderMessage(230) &&
      s230.createDisabled === true,
    JSON.stringify({
      repo: s230.repo,
      preview: (s230.preview ?? '').length,
      line: s230.line,
      createDisabled: s230.createDisabled
    })
  )

  // 7 (P2): worktrees:create for that name on app, skipping the dialog.
  const direct7 = await evaluate(
    ws,
    `window.api.invoke('worktrees:create', ${JSON.stringify({
      repoPath: app.path,
      branch: b230,
      baseBranch: 'main',
      updateBase: false
    })})`
  )
  const made7 = createdNothing(app.path, b230, s230.preview)
  check(
    '7. worktrees:create for that name on app returns the folder text and makes nothing (BSLG-30)',
    direct7.ok === false && direct7.error === folderMessage(230) && isNothing(made7),
    JSON.stringify({ ok: direct7.ok, error: direct7.error, made: made7 })
  )
  await evaluate(ws, `document.querySelector('.dialog-btn-ghost')?.click()`)
}

/* ------------------------------------------------------ long title (BSLG) -- */

/** The slug the rule before #145 made: every word, no cap. */
const previousSlugOf = (title) =>
  title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
    .join('-')

const SLUG_SKIP_NOTICE =
  'SKIP  slug section (checks 8-9): set SMOKE_LONG_TASK_URL to a work item whose title slugs to more than 40 characters; the slug rule is proven by its unit tests'

async function slugSection(ws) {
  const url = process.env.SMOKE_LONG_TASK_URL
  if (!url) {
    console.log(SLUG_SKIP_NOTICE)
    return
  }
  const idMatch = url.match(/\/edit\/(\d+)/)
  if (!idMatch)
    throw new Error(
      'SMOKE_LONG_TASK_URL does not look like a work item URL (.../_workitems/edit/<id>)'
    )
  const taskId = Number(idMatch[1])
  const repos = await seededRepos(ws)
  if (!repos) throw new Error(`The seed under ${BASE} is not in the app's tree; run --seed first`)
  const { api } = repos

  // Pin the work item through the add row, then wait for its card.
  await evaluate(
    ws,
    `(() => { ${setInput('.tasks-add-input', url)} document.querySelector('.tasks-pin-btn').click() })()`
  )
  let title = null
  for (let i = 0; i < 60 && title === null; i++) {
    await sleep(500)
    title = await evaluate(
      ws,
      `document.querySelector('.task-card .task-card-title')?.textContent ?? null`
    )
  }
  if (title === null) throw new Error('The long-title work item did not pin')
  // The section proves nothing on a title the old rule already kept short.
  if (previousSlugOf(title).length <= 40) {
    throw new Error(
      'SMOKE_LONG_TASK_URL: its title slugs to 40 characters or fewer; pick a longer one'
    )
  }

  // 8: Start Work on api prefills a branch whose slugs are at most 40 characters.
  await evaluate(ws, `document.querySelector('.task-card .task-start-btn').click()`)
  await sleep(500)
  await evaluate(ws, clickChip('api'))
  // The parent lookup re-renders the prefill once it lands; wait for the value to settle.
  let prefill = null
  for (let i = 0, last = null, same = 0; i < 40 && same < 6; i++) {
    await sleep(250)
    prefill = (await evaluate(ws, dialogState)).branch
    same = prefill === last ? same + 1 : 0
    last = prefill
  }
  const segments = (prefill ?? '').split('/')
  const slugAfterId = (segment, id) => segment.slice(`${id}-`.length)
  const leaf = segments[segments.length - 1] ?? ''
  const leafOk = leaf.startsWith(`${taskId}-`) && slugAfterId(leaf, taskId).length <= 40
  const parentSegment = segments.length === 4 ? segments[2] : null
  const parentId = parentSegment?.match(/^(\d+)-/)?.[1] ?? null
  const parentOk =
    parentSegment === null ||
    (parentId !== null && slugAfterId(parentSegment, parentId).length <= 40)

  // 9: in the same dialog, a hand-typed name with a ref path of 287.
  const b287 = branchForRefPath(commonDirOf(api.path), 287)
  await evaluate(ws, setBranch(b287))
  const s287 = await waitForLine(ws, refMessage(287))
  check(
    '9. Start Work on api: a hand-typed ref path of 287 shows the AC 17 text and disables Create (BSLG-20, BSLG-24)',
    s287.repo === 'api' && s287.line === refMessage(287) && s287.createDisabled === true,
    JSON.stringify({ repo: s287.repo, line: s287.line, createDisabled: s287.createDisabled })
  )

  // 8, finished: back to the prefilled name, created with core.longpaths=false, then removed.
  await evaluate(ws, setBranch(prefill))
  await sleep(ANSWER_WAIT_MS)
  const beforeCreate = await evaluate(ws, dialogState)
  await evaluate(ws, `document.querySelector('.dialog-btn-primary').click()`)
  for (let i = 0; i < 60 && (await evaluate(ws, dialogState)).open; i++) await sleep(500)
  const after = await evaluate(ws, dialogState)
  const tree = await evaluate(ws, `window.api.invoke('tree:get')`)
  const made = tree
    .flatMap((w) => w.repos)
    .find((r) => r.path === api.path)
    ?.worktrees.find((w) => w.branch === prefill)
  const removed = made
    ? await evaluate(
        ws,
        `window.api.invoke('worktrees:remove', ${JSON.stringify({ repoPath: api.path, worktreePath: made.path })})`
      )
    : null
  check(
    '8. Start Work on api prefills slugs of at most 40 characters after the ids, and creates the worktree with core.longpaths=false (BSLG-08, BSLG-10, BSLG-24)',
    leafOk &&
      parentOk &&
      beforeCreate.line === null &&
      beforeCreate.createDisabled === false &&
      after.open === false &&
      made !== undefined &&
      removed?.ok === true,
    JSON.stringify({
      segments: segments.length,
      leafSlug: slugAfterId(leaf, taskId).length,
      parentSlug: parentSegment === null ? null : slugAfterId(parentSegment, parentId ?? '').length,
      created: made !== undefined,
      removed: removed?.ok ?? null
    })
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
/** A placeholder task: never pinned, no details, so the dialog asks Azure DevOps nothing. */
const OFFLINE_TASK = { id: 4821, org: 'acme', project: 'platform', url: '', details: null }

/**
 * Opens Start Work for OFFLINE_TASK through the Tasks pane's own `onStartWork`
 * prop, read from its React fiber. The card's Start work button stays disabled
 * without live work item details, and this section runs with no Azure DevOps.
 */
const openStartWorkOffline = `(async () => {
  for (let i = 0; i < 50 && !document.querySelector('.tasks-pane'); i++) {
    await new Promise((r) => setTimeout(r, 200))
  }
  const pane = document.querySelector('.tasks-pane')
  const key = pane ? Object.keys(pane).find((k) => k.startsWith('__reactFiber$')) : undefined
  let fiber = key ? pane[key] : null
  while (fiber && !(typeof fiber.memoizedProps?.onStartWork === 'function' && fiber.memoizedProps?.snapshot)) {
    fiber = fiber.return
  }
  if (!fiber) return false
  fiber.memoizedProps.onStartWork(${JSON.stringify(OFFLINE_TASK)})
  for (let i = 0; i < 25; i++) {
    if (document.querySelector('.dialog-panel .dialog-kicker')?.textContent === 'Start work') return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
})()`

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
async function removeProgressWorktree(ws, repoPath, worktreePath) {
  const norm = (path) => path.replaceAll('\\', '/').toLowerCase()
  const listed = () =>
    git(['worktree', 'list', '--porcelain'], repoPath)
      .split('\n')
      .some((line) => norm(line) === `worktree ${norm(worktreePath)}`)
  for (let i = 0; i < 40 && listed(); i++) {
    const removed = await evaluate(
      ws,
      `window.api.invoke('worktrees:remove', ${JSON.stringify({ repoPath, worktreePath })})`
    )
    if (removed.ok) break
    await sleep(500)
  }
  if (git(['branch', '--list', PROGRESS_BRANCH], repoPath) !== '') {
    git(['branch', '-D', PROGRESS_BRANCH], repoPath)
  }
  return { listed: listed(), branch: git(['branch', '--list', PROGRESS_BRANCH], repoPath) }
}

async function progressSection(ws) {
  const repos = await seededRepos(ws)
  if (!repos) throw new Error(`The seed under ${BASE} is not in the app's tree; run --seed first`)
  const { app } = repos
  const worktreePath = `${app.path}-chore-progress`
  const appDir = join(DEFAULT_WS, '.app')
  const configFile = join(appDir, 'config.json')
  const backup = existsSync(configFile) ? readFileSync(configFile, 'utf8') : null
  const madeAppDir = !existsSync(appDir)

  // A run that was cut short may have left the worktree or the branch behind.
  await removeProgressWorktree(ws, app.path, worktreePath)
  const selectedBefore = await evaluate(ws, selectOtherWorktree)
  if (selectedBefore === null || selectedBefore === PROGRESS_BRANCH) {
    throw new Error(`No other worktree could be selected first: ${selectedBefore}`)
  }
  mkdirSync(appDir, { recursive: true })
  writeFileSync(
    configFile,
    JSON.stringify(
      { ...(backup === null ? {} : JSON.parse(backup)), postCreateCommands: { app: HOOK_COMMAND } },
      null,
      2
    ) + '\n'
  )
  try {
    if (!(await evaluate(ws, openStartWorkOffline))) throw new Error('Start Work did not open')
    await evaluate(ws, clickChip('app'))
    await evaluate(ws, setBranch(PROGRESS_BRANCH))
    const ready = await evaluate(
      ws,
      `(() => {
         const box = document.querySelector('.dialog-check input[type="checkbox"]')
         if (box?.checked) box.click()
         return {
           kicker: document.querySelector('.dialog-kicker')?.textContent ?? null,
           repo: document.querySelector('.dialog-repo-chip.selected .dialog-repo-chip-name')?.textContent ?? null,
           base: document.querySelectorAll('.dialog-input')[0]?.value ?? null,
           refresh: document.querySelector('.dialog-check input[type="checkbox"]')?.checked ?? null,
           createDisabled: document.querySelector('.dialog-btn-primary')?.disabled ?? null
         }
       })()`
    )
    if (
      ready.kicker !== 'Start work' ||
      ready.repo !== 'app' ||
      ready.base !== 'main' ||
      ready.refresh !== false ||
      ready.createDisabled !== false
    ) {
      throw new Error(`Start Work is not ready to create: ${JSON.stringify(ready)}`)
    }

    await evaluate(ws, `document.querySelector('.dialog-btn-primary').click()`)
    const clickedAt = Date.now()

    // 10: the line names the post-create command while it runs.
    const seen = []
    let state = await evaluate(ws, busyState)
    while (state.progress !== HOOK_LABEL && Date.now() - clickedAt < 4000) {
      if (seen[seen.length - 1] !== state.progress) seen.push(state.progress)
      await sleep(100)
      state = await evaluate(ws, busyState)
    }
    if (seen[seen.length - 1] !== state.progress) seen.push(state.progress)
    check(
      '10. Start Work: while the post-create command runs, the progress line reads "Running post-create command…" (CRTO-11, CRTO-16)',
      state.open && state.progress === HOOK_LABEL && state.spinner,
      JSON.stringify({ atMs: Date.now() - clickedAt, seen, spinner: state.spinner })
    )

    // 11: Cancel is disabled with the tooltip while busy.
    check(
      '11. Start Work: Cancel is disabled with the title "Wait for the create to finish" (CRTO-20)',
      state.open && state.cancelDisabled === true && state.cancelTitle === BUSY_TITLE,
      JSON.stringify({ disabled: state.cancelDisabled, title: state.cancelTitle })
    )

    // 12: a backdrop click leaves the dialog open.
    await evaluate(ws, `document.querySelector('.dialog-backdrop')?.click()`)
    await sleep(300)
    const afterBackdrop = await evaluate(ws, busyState)
    check(
      '12. Start Work: a backdrop click while busy leaves the dialog open (CRTO-19)',
      state.open && afterBackdrop.open === true,
      JSON.stringify({ open: afterBackdrop.open, progress: afterBackdrop.progress })
    )

    // 13: the dialog closes on success and selects the new worktree.
    let settled = afterBackdrop
    while (
      (settled.open || settled.selectedBranch !== PROGRESS_BRANCH) &&
      Date.now() - clickedAt < 15000
    ) {
      await sleep(200)
      settled = await evaluate(ws, busyState)
    }
    check(
      '13. Start Work: within 15 s the dialog closes, chore/progress is selected and no progress line is left (CRTO-17, CRTO-21)',
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
    const left = await removeProgressWorktree(ws, app.path, worktreePath)
    if (backup === null) rmSync(configFile, { force: true })
    else writeFileSync(configFile, backup)
    if (madeAppDir) rmTree(appDir)
    if (left.listed || left.branch !== '') {
      console.log(`WARN  chore/progress cleanup incomplete: ${JSON.stringify(left)}`)
    }
  }
}

/* --------------------------------------------------------- legacy (STWK) -- */

async function legacySection(ws) {
  const TASK_URL = process.env.SMOKE_TASK_URL
  if (!TASK_URL) {
    console.error(
      'SMOKE_TASK_URL is required (a dev.azure.com work item URL, e.g. https://dev.azure.com/<org>/<project>/_workitems/edit/<id>)'
    )
    process.exit(1)
  }
  const taskIdMatch = TASK_URL.match(/\/edit\/(\d+)/)
  if (!taskIdMatch) {
    console.error(
      `SMOKE_TASK_URL does not look like a work item URL (expected .../_workitems/edit/<id>): ${TASK_URL}`
    )
    process.exit(1)
  }
  const TASK_ID = Number(taskIdMatch[1])

  // Wait until the renderer has hydrated before driving it.
  for (let i = 0; ; i++) {
    if (await evaluate(ws, `document.querySelector('.tasks-pane') !== null`)) break
    if (i >= 30) throw new Error('Tasks pane never appeared after 30s')
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Precondition: pin the live work item through the add row.
  const pinned = await evaluate(
    ws,
    `(async () => {
    ${setInput('.tasks-add-input', TASK_URL)}
    document.querySelector('.tasks-pin-btn').click()
    await new Promise((r) => setTimeout(r, 15000))
    const card = document.querySelector('.task-card')
    return {
      error: document.querySelector('.tasks-add-error')?.textContent ?? null,
      title: card?.querySelector('.task-card-title')?.textContent ?? null
    }
  })()`
  )
  if (!pinned.title) throw new Error(`Pin precondition failed: ${JSON.stringify(pinned)}`)
  const TASK_TITLE = pinned.title

  // STWK-04: fresh pin → "No worktree yet" + primary "Start work" button
  const footer0 = await evaluate(
    ws,
    `({
    wt: document.querySelector('.task-card-wt')?.textContent ?? null,
    none: document.querySelector('.task-card-wt')?.classList.contains('none') ?? null,
    label: document.querySelector('.task-start-btn')?.textContent ?? null,
    primary: document.querySelector('.task-start-btn')?.classList.contains('primary') ?? null,
    disabled: document.querySelector('.task-start-btn')?.disabled ?? null
  })`
  )
  check(
    'fresh pin shows "No worktree yet" + primary Start work (STWK-04)',
    footer0.wt === 'No worktree yet' &&
      footer0.none === true &&
      footer0.label === 'Start work' &&
      footer0.primary === true &&
      footer0.disabled === false,
    JSON.stringify(footer0)
  )

  // STWK-02: Start work opens the §3 dialog with template-prefilled branch
  const dialog = await evaluate(
    ws,
    `(async () => {
    document.querySelector('.task-start-btn').click()
    await new Promise((r) => setTimeout(r, 400))
    return {
      kicker: document.querySelector('.dialog-kicker')?.textContent ?? null,
      id: document.querySelector('.dialog-task-id')?.textContent ?? null,
      title: document.querySelector('.dialog-task-title')?.textContent ?? null,
      chips: document.querySelectorAll('.dialog-repo-chip').length,
      chipSelected: document.querySelector('.dialog-repo-chip')?.classList.contains('selected') ?? null,
      base: document.querySelectorAll('.dialog-input')[0]?.value ?? null,
      branch: document.querySelectorAll('.dialog-input')[1]?.value ?? null,
      note: document.querySelector('.dialog-label-note')?.textContent ?? null,
      preview: document.querySelector('.dialog-path-value')?.textContent ?? null
    }
  })()`
  )
  const branchPattern = new RegExp(`^(feature|bugfix)/${TASK_ID}-[a-z0-9-]+$`)
  check(
    'dialog opens with task header, repo chip selected, base branch (STWK-02)',
    dialog.kicker === 'Start work' &&
      dialog.id === `#${TASK_ID}` &&
      dialog.title === TASK_TITLE &&
      dialog.chips === 1 &&
      dialog.chipSelected === true &&
      (dialog.base ?? '').length > 0,
    JSON.stringify(dialog)
  )
  check(
    'branch is pre-filled from the {type}/{id}-{slug} template (STWK-02)',
    branchPattern.test(dialog.branch ?? '') && dialog.note === '· from template',
    JSON.stringify({ branch: dialog.branch, note: dialog.note })
  )
  check(
    'path preview shows the flat-sibling path for the templated branch (STWK-02)',
    (dialog.preview ?? '').endsWith(`-${dialog.branch.replaceAll('/', '-')}`),
    JSON.stringify(dialog.preview)
  )

  // STWK-02: editing the branch updates the preview live; template not re-applied
  const edited = await evaluate(
    ws,
    `(async () => {
    ${setInput('.dialog-branch-row div:nth-child(2) .dialog-input', `spike/${TASK_ID}-edited by hand!`)}
    await new Promise((r) => setTimeout(r, 200))
    return {
      branch: document.querySelectorAll('.dialog-input')[1]?.value ?? null,
      preview: document.querySelector('.dialog-path-value')?.textContent ?? null
    }
  })()`
  )
  check(
    'editing the branch updates the path preview live with sanitization (STWK-02)',
    edited.branch === `spike/${TASK_ID}-edited by hand!` &&
      (edited.preview ?? '').endsWith(`-spike-${TASK_ID}-edited-by-hand`),
    JSON.stringify(edited)
  )

  // STWK-02: create with the original templated branch → dialog closes,
  // sidebar refreshes and selects the new worktree
  const created = await evaluate(
    ws,
    `(async () => {
    ${setInput('.dialog-branch-row div:nth-child(2) .dialog-input', dialog.branch)}
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector('.dialog-btn-primary').click()
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (!document.querySelector('.dialog-panel')) break
    }
    await new Promise((r) => setTimeout(r, 1500))
    const selected = document.querySelector('.sidebar-worktree.selected')
    return {
      dialogOpen: document.querySelector('.dialog-panel') !== null,
      error: document.querySelector('.dialog-error')?.textContent ?? null,
      selectedBranch: selected?.querySelector('.sidebar-worktree-branch')?.textContent ?? null
    }
  })()`
  )
  check(
    'create closes the dialog and selects the new worktree (STWK-02)',
    created.dialogOpen === false && created.selectedBranch === dialog.branch,
    JSON.stringify(created)
  )

  // STWK-03: the selected sidebar row carries the §1a task tag
  const tag = await evaluate(
    ws,
    `(() => {
    const row = document.querySelector('.sidebar-worktree.selected')
    return {
      pill: row?.querySelector('.task-pill')?.textContent.trim() ?? null,
      id: row?.querySelector('.sidebar-task-id')?.textContent ?? null,
      title: row?.querySelector('.sidebar-task-title')?.textContent ?? null,
      dot: row?.querySelector('.sidebar-state-dot') !== null
    }
  })()`
  )
  check(
    'sidebar row shows type pill, #id, title, state dot (STWK-03)',
    (tag.pill ?? '').length > 0 && tag.id === `#${TASK_ID}` && tag.title === TASK_TITLE && tag.dot,
    JSON.stringify(tag)
  )

  // STWK-05: detail pane renders the §1b linked-task card linking to ADO
  const linked = await evaluate(
    ws,
    `(() => {
    const card = document.querySelector('.detail-task-card')
    return {
      href: card?.getAttribute('href') ?? null,
      pills: card ? [...card.querySelectorAll('.task-pill')].map((p) => p.textContent.trim()) : [],
      id: card?.querySelector('.detail-task-id')?.textContent ?? null,
      title: card?.querySelector('.detail-task-title')?.textContent ?? null,
      open: card?.querySelector('.detail-task-open')?.textContent ?? null
    }
  })()`
  )
  check(
    'detail pane shows the linked-task card with ADO link (STWK-05)',
    (linked.href ?? '').includes(`/_workitems/edit/${TASK_ID}`) &&
      linked.pills.length === 2 &&
      linked.id === `#${TASK_ID}` &&
      linked.title === TASK_TITLE &&
      /Open in Azure DevOps/.test(linked.open ?? ''),
    JSON.stringify(linked)
  )

  // STWK-04: footer flips to "1 worktree" + ghost "New branch" without restart
  const footer1 = await evaluate(
    ws,
    `({
    wt: document.querySelector('.task-card-wt')?.textContent ?? null,
    label: document.querySelector('.task-start-btn')?.textContent ?? null,
    ghost: document.querySelector('.task-start-btn')?.classList.contains('ghost') ?? null
  })`
  )
  check(
    'footer flips to "1 worktree" + ghost New branch (STWK-04)',
    footer1.wt === '1 worktree' && footer1.label === 'New branch' && footer1.ghost === true,
    JSON.stringify(footer1)
  )

  // STWK-03/05: unpin while the worktree exists → "#id — not pinned" degradation
  const unpinned = await evaluate(
    ws,
    `(async () => {
    document.querySelector('.task-unpin-btn').click()
    await new Promise((r) => setTimeout(r, 800))
    const row = document.querySelector('.sidebar-worktree.selected')
    return {
      line2: row?.querySelector('.sidebar-task-note')?.textContent ?? null,
      detailNote: document.querySelector('.detail-task-note')?.textContent ?? null,
      cardGone: document.querySelector('.detail-task-card') === null
    }
  })()`
  )
  check(
    'unpinned task degrades to "#id — not pinned" in sidebar and detail (STWK-03/05)',
    unpinned.line2 === `#${TASK_ID} — not pinned` &&
      unpinned.detailNote === `#${TASK_ID} — not pinned` &&
      unpinned.cardGone,
    JSON.stringify(unpinned)
  )
  const persisted = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  check(
    'unpin persisted; created worktree untouched on disk (cleanup precondition)',
    Array.isArray(persisted.pinnedTasks) && persisted.pinnedTasks.length === 0,
    JSON.stringify(persisted.pinnedTasks)
  )

  // Cleanup: remove the created worktree through the app's own guarded IPC.
  const cleanup = await evaluate(
    ws,
    `(async () => {
    const tree = await window.api.invoke('tree:get')
    const repo = tree[0]?.repos[0]
    const wt = repo?.worktrees.find((w) => !w.isDefault)
    if (!wt) return { removed: false, reason: 'no non-default worktree found' }
    const result = await window.api.invoke('worktrees:remove', {
      repoPath: repo.path,
      worktreePath: wt.path
    })
    return { removed: result.ok, reason: result.error ?? null }
  })()`
  )
  check(
    'cleanup: created worktree removed via worktrees:remove',
    cleanup.removed === true,
    JSON.stringify(cleanup)
  )
}

/* ----------------------------------------------------------------- drive -- */

async function drive() {
  if (ONLY !== null && !['longpath', 'slug', 'progress', 'stwk'].includes(ONLY)) {
    console.error(`Unknown SMOKE_ONLY=${ONLY}; expected longpath, slug, progress or stwk`)
    process.exit(1)
  }
  const target = await pageTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })

  const seeded = existsSync(join(IDS_WS, 'api')) && existsSync(join(DEFAULT_WS, 'app'))
  if (ONLY === 'longpath' || (ONLY === null && seeded)) await longpathSection(ws)
  if (ONLY === 'slug' || (ONLY === null && seeded)) await slugSection(ws)
  if (ONLY === 'progress' || (ONLY === null && seeded)) await progressSection(ws)
  if (ONLY === 'stwk' || (ONLY === null && !seeded)) await legacySection(ws)
  if (ONLY === null && seeded) {
    console.log(
      'SKIP  legacy STWK checks: they need their own one-repository config; run them with SMOKE_ONLY=stwk and SMOKE_TASK_URL'
    )
  }

  ws.close()
  const failed = checks.filter((c) => !c.ok).length
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
  process.exit(failed === 0 ? 0 : 1)
}

if (MODE === 'seed') seed()
else if (MODE === 'clean') clean()
else await drive()
