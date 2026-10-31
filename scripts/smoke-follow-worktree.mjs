/* CDP smoke for a session following the worktree its agent edits (SFWT-01,
 * SFWT-04, SFWT-08, SFWT-10, SFWT-11, SFWT-12, SFWT-16). Proves what the unit
 * tests of `KnownWorktrees`, `SessionManager`, `TimeTracker` and the renderer
 * libs cannot reach: the wiring in `index.ts` (tree builds feeding the known
 * worktrees, the re-read on a miss, the `worktrees` dep of the session
 * manager) and the renderer reading `followedPath` end to end.
 *
 * Seeded fixture (fictional names only, this repo is public):
 *   <tmp>/acme                            the registered workspace
 *   <tmp>/acme/acme-app                   primary checkout on `main`: the
 *                                         session's launch folder
 *   <tmp>/acme/acme-app-4821-fix-login    a second worktree on
 *                                         `feature/4821-fix-login`, created
 *                                         AFTER the app read the tree, so the
 *                                         first edit there is a miss that
 *                                         re-reads the workspace (SFWT-12)
 *   <tmp>/fakebin                         a fake `claude.cmd`
 *
 * The session is a fake `claude.cmd` registered as a throwaway agent: never a
 * real agent, never a prompt, no tokens spent. It records the hook token, its
 * `--settings` path and `%CD%` (the PTY's folder), then idles. The script then
 * POSTs hook payloads shaped like Claude Code's to the app's hook server, as
 * the agent's `Write` tool would:
 *   1. the rail first holds the session under the launch folder's repo
 *   2. the new worktree is not in the tree yet when the agent edits it
 *   3. a `Write` inside the new worktree sets `followedPath` to that worktree,
 *      exactly as the tree spells it (SFWT-01, SFWT-12)
 *   4. the rail moves the row under the worktree's task group, the sidebar
 *      lists the worktree, the status bar shows its branch and the worktree's
 *      detail page lists the session while the launch folder's does not (SFWT-11)
 *   5. the time log closes the launch-folder period on `main` and opens one in
 *      the worktree on `feature/4821-fix-login` at the same instant (SFWT-08)
 *   6. a `Write` back in the launch folder moves nothing (SFWT-04)
 *   7. a respawn starts the PTY in the launch folder, keeps `followedPath` and
 *      opens its period in the followed worktree (SFWT-16, SFWT-10)
 *   8. a duplicate starts in the launch folder with no `followedPath` (SFWT-16)
 *
 * NOT automatable here (hand-verify): a real Claude Code session creating a
 * worktree and writing there (the payload shape is fixed by the unit tests of
 * `editedPathOf`); how the moved row looks in both themes.
 *
 * It runs only on a throwaway userData directory, never on the owner's; it
 * reads the main process's userData path through the main inspector and
 * refuses `%APPDATA%\playground`. Everything it adds (sessions, the agent, the
 * workspace registration, the temp folders) is removed in a `finally`.
 *
 * Run: npm run dev -- -- "--user-data-dir=<a new empty directory>"
 *        --remote-debugging-port=9336 --inspect=9337
 *        --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
 *        --disable-background-timer-throttling          (in one shell)
 *      SMOKE_PORT=9336 SMOKE_INSPECT_PORT=9337 node scripts/smoke-follow-worktree.mjs
 * SMOKE_PORT and SMOKE_INSPECT_PORT default to 9222 and 9229.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const INSPECT_PORT = Number(process.env.SMOKE_INSPECT_PORT) || 9229
const FAKE_AGENT = 'Claude (follow worktree smoke)'
const TITLE = 'sfwt-smoke session'
const NUDGE_TITLE = 'sfwt-smoke nudge'
const BRANCH = 'feature/4821-fix-login'
const J = JSON.stringify
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TMP = realpathSync.native(tmpdir())
const root = realpathSync.native(mkdtempSync(join(TMP, 'sfwt-smoke-')))
const wsDir = join(root, 'acme')
const primary = join(wsDir, 'acme-app')
const wtDir = join(wsDir, 'acme-app-4821-fix-login')
const fakeBin = join(root, 'fakebin')

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  const n = String(checks.length).padStart(2, ' ')
  console.log(`${n}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`)
}

/** Same folder, ignoring case and separator style. */
const samePath = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a
    .replace(/[\\/]+$/, '')
    .replace(/\//g, '\\')
    .toLowerCase() ===
    b
      .replace(/[\\/]+$/, '')
      .replace(/\//g, '\\')
      .toLowerCase()

// ---------------------------------------------------------------- CDP harness

async function connect(url) {
  const ws = new WebSocket(url)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return ws
}

let nextId = 1
function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(J(msg.error)))
      else if (msg.result?.exceptionDetails) {
        reject(new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate failed'))
      } else resolve(msg.result?.result?.value)
    }
    ws.addEventListener('message', onMessage)
    ws.send(
      J({
        id,
        method: 'Runtime.evaluate',
        // The command-line API gives the main inspector a `require`.
        params: { expression, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true }
      })
    )
  })
}

async function targetUrl(port, pick) {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const target = targets.find(pick)
      if (target) return target.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(1000)
  }
  throw new Error(`no debug target on port ${port} after 60 s`)
}

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

// ---------------------------------------------------------------- fixture

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Smoke',
  GIT_AUTHOR_EMAIL: 'smoke@example.invalid',
  GIT_COMMITTER_NAME: 'Smoke',
  GIT_COMMITTER_EMAIL: 'smoke@example.invalid'
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: 'pipe' }).trim()
}

function seed() {
  mkdirSync(wsDir, { recursive: true })
  git(wsDir, 'init', '-q', '-b', 'main', primary)
  git(primary, 'config', 'core.autocrlf', 'false')
  writeFileSync(join(primary, 'README.md'), '# acme-app\n')
  git(primary, 'add', '.')
  git(primary, 'commit', '-q', '-m', 'Initial app')
}

/** Writes its hook token, `--settings` path and folder next to itself, then idles. */
function writeFakeClaude() {
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fakeBin, 'claude.cmd'),
    [
      '@echo off',
      '>"%~dp0settings.txt" echo %~2',
      '>"%~dp0token.txt" echo %PLAYGROUND_ACTIVITY_TOKEN%',
      '>"%~dp0cwd.txt" echo %CD%',
      ':idle',
      'ping -n 3600 127.0.0.1 >nul',
      'goto idle',
      ''
    ].join('\r\n')
  )
}

async function readWhenWritten(path, timeoutMs = 10000) {
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

// ---------------------------------------------------------------- page helpers

async function direction(page, name) {
  await evaluate(
    page,
    `(() => {
       const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => b.textContent.trim() === ${J(name)})
       seg?.click()
       return Boolean(seg)
     })()`
  )
  await sleep(300)
}

async function refresh(page) {
  await evaluate(
    page,
    `(document.querySelector('.topbar-icon-btn[title="Refresh"]')?.click(), true)`
  )
  await sleep(1000)
}

/** The session's rail row and the header of the group holding it (Agents direction). */
const RAIL = `(() => {
  const row = [...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').startsWith(${J(TITLE)}))
  const header = row?.closest('.rail-group')?.querySelector('.rail-group-header')
  return JSON.stringify({
    row: Boolean(row),
    header: header?.getAttribute('title') ?? null,
    id: header?.querySelector('.rail-group-id')?.textContent ?? null
  })
})()`

/** Does the workspace's sidebar list a worktree row for `branch` (Tree direction)? */
const sidebarHas = (branch) => `(() => {
  const wsEl = [...document.querySelectorAll('.sidebar-workspace')].find(
    (s) => s.querySelector('.sidebar-workspace-name')?.textContent === ${J(basename(wsDir))})
  return JSON.stringify([...(wsEl?.querySelectorAll('.sidebar-worktree-branch') ?? [])].some((r) => r.textContent === ${J(branch)}))
})()`

/** Click the workspace's sidebar row for `branch`; the session chips its detail lists. */
async function detailSessions(page, branch) {
  await direction(page, 'Tree')
  await evaluate(
    page,
    `(() => {
       const wsEl = [...document.querySelectorAll('.sidebar-workspace')].find(
         (s) => s.querySelector('.sidebar-workspace-name')?.textContent === ${J(basename(wsDir))})
       const row = [...(wsEl?.querySelectorAll('.sidebar-worktree') ?? [])].find(
         (r) => r.querySelector('.sidebar-worktree-branch')?.textContent === ${J(branch)})
       row?.click()
       return Boolean(row)
     })()`
  )
  return waitFor(
    page,
    `JSON.stringify(document.querySelector('.detail-title')?.textContent === ${J(branch)}
       ? [...document.querySelectorAll('.detail-session-chip')].map((c) => c.textContent.trim())
       : null)`,
    (v) => v !== null,
    4000
  )
}

const sessionsList = (page) =>
  evaluate(page, `window.api.invoke('sessions:list').then((l) => JSON.stringify(l))`).then(
    JSON.parse
  )
const sessionOf = async (page, id) => (await sessionsList(page)).find((s) => s.id === id) ?? null
const timeOf = async (page, id) => {
  const snap = JSON.parse(
    await evaluate(page, `window.api.invoke('time:snapshot').then((s) => JSON.stringify(s))`)
  )
  return {
    closed: snap.periods.filter((p) => p.sessionId === id),
    open: snap.open.find((p) => p.sessionId === id) ?? null
  }
}

// ---------------------------------------------------------------- the run

let main = null
let page = null
let owner = null
const mine = []
let agentRegistered = false
let registered = false

async function run() {
  main = await connect(await targetUrl(INSPECT_PORT, (t) => t.type === 'node'))
  page = await connect(
    await targetUrl(PORT, (t) => t.type === 'page' && !t.url.startsWith('devtools'))
  )
  const userData = await evaluate(main, `require('electron').app.getPath('userData')`)
  const real = join(process.env.APPDATA ?? '', 'playground')
  if (samePath(userData, real))
    throw new Error(`refusing to run on the owner's userData (${userData})`)
  main.close()
  main = null

  owner = JSON.parse(
    await evaluate(
      page,
      `window.api.invoke('config:get').then((c) => JSON.stringify({ workspaces: c.workspaces, ui: c.ui }))`
    )
  )

  seed()
  writeFakeClaude()
  console.log(`fixture: ${root}`)

  const entry = { id: wsDir.toLowerCase(), path: wsDir, displayName: basename(wsDir) }
  await evaluate(
    page,
    `(async () => { await window.api.invoke('config:patch', { workspaces: ${J([...owner.workspaces, entry])} }); return true })()`
  )
  registered = true
  await evaluate(
    page,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       const agents = cfg.agents.filter((a) => a.name !== ${J(FAKE_AGENT)})
       await window.api.invoke('config:patch', {
         agents: [...agents, { name: ${J(FAKE_AGENT)}, command: ${J(join(fakeBin, 'claude.cmd'))}, args: [], color: '--accent' }]
       })
       return true
     })()`
  )
  agentRegistered = true
  // The tree build feeds main its known worktrees: only the primary for now.
  await direction(page, 'Tree')
  await refresh(page)

  const id = await evaluate(
    page,
    `(async () => {
       const v = await window.api.invoke('sessions:spawn', { agentName: ${J(FAKE_AGENT)}, cwd: ${J(primary)} })
       await window.api.invoke('sessions:rename', { id: v.id, title: ${J(TITLE)} })
       return v.id
     })()`
  )
  mine.push(id)
  // A direct-IPC spawn pushes nothing; stopping a second session makes the
  // renderer re-fetch the list, so the rail holds the fake session.
  const nudge = await evaluate(
    page,
    `(async () => {
       const v = await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${J(fakeBin)}, adhocCommand: 'cmd.exe /d /k' })
       await window.api.invoke('sessions:rename', { id: v.id, title: ${J(NUDGE_TITLE)} })
       return v.id
     })()`
  )
  mine.push(nudge)
  await sleep(500)
  await evaluate(page, `window.api.invoke('sessions:stop', { id: ${J(nudge)} }).then(() => true)`)

  const token = await readWhenWritten(join(fakeBin, 'token.txt'))
  const settingsPath = await readWhenWritten(join(fakeBin, 'settings.txt'))
  const launchCd = await readWhenWritten(join(fakeBin, 'cwd.txt'))
  let url = null
  try {
    url =
      JSON.parse(readFileSync(settingsPath, 'utf8')).hooks?.PostToolUse?.[0]?.hooks?.[0]?.url ??
      null
  } catch {
    /* reported below */
  }
  check(
    'the fake agent received a hook token and the hook settings, and started in the launch folder',
    Boolean(token) && !token.startsWith('%') && Boolean(url) && samePath(launchCd, primary),
    `token ${token ? 'yes' : 'no'}; url ${url ?? settingsPath}; cd ${launchCd}`
  )
  if (!token || token.startsWith('%') || !url) return

  const post = async (body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: J({ session_id: 'smoke-follow', ...body })
    })
    if (res.status >= 300) throw new Error(`hook ${body.hook_event_name} answered ${res.status}`)
  }
  const write = async (filePath) => {
    const tool = { tool_name: 'Write', tool_input: { file_path: filePath, content: 'smoke\n' } }
    await post({ hook_event_name: 'PreToolUse', ...tool })
    writeFileSync(filePath, 'smoke\n')
    await post({ hook_event_name: 'PostToolUse', ...tool, tool_response: { success: true } })
  }

  // 1. Before any edit the rail holds the session under the launch folder's repo.
  await direction(page, 'Agents')
  let rail = await waitFor(page, RAIL, (v) => v.row)
  check(
    'before any edit the rail holds the session under the launch folder, not the task',
    rail.row && rail.header !== BRANCH && rail.id === null,
    J(rail)
  )
  // The launch period must outlive the 1 s floor, or it is discarded (TIME-11).
  await sleep(1500)

  // 2. The agent creates a worktree after the tree was read.
  git(primary, 'worktree', 'add', '-q', '-b', BRANCH, wtDir, 'main')
  await direction(page, 'Tree')
  const listedEarly = JSON.parse(await evaluate(page, sidebarHas(BRANCH)))
  check('the new worktree is not in the tree when the agent edits it (SFWT-12 setup)', !listedEarly)
  await direction(page, 'Agents')

  // 3. A Write inside the new worktree moves the session there.
  await post({ hook_event_name: 'UserPromptSubmit', prompt: 'smoke' })
  await write(join(wtDir, 'NOTES.md'))
  let s = null
  for (let i = 0; i < 40; i++) {
    s = await sessionOf(page, id)
    if (s?.followedPath) break
    await sleep(200)
  }
  const tree = JSON.parse(
    await evaluate(page, `window.api.invoke('tree:get').then((t) => JSON.stringify(t))`)
  )
  const wtNode = tree
    .flatMap((w) => w.repos.flatMap((r) => r.worktrees))
    .find((w) => w.branch === BRANCH)
  check(
    'a Write inside a worktree created after the tree was read sets followedPath to it, as the tree spells it (SFWT-01, SFWT-12)',
    Boolean(wtNode) && s?.followedPath === wtNode.path && samePath(s.followedPath, wtDir),
    `followedPath ${s?.followedPath ?? 'none'}; tree ${wtNode?.path ?? 'none'}`
  )
  check('the launch folder stays the session cwd', samePath(s?.cwd, primary), s?.cwd)
  const followed = s?.followedPath ?? wtDir

  // 4. Every view places it under the worktree.
  rail = await waitFor(page, RAIL, (v) => v.header === BRANCH, 6000)
  check(
    "the rail moves the row under the worktree's task group (SFWT-11)",
    rail.row && rail.header === BRANCH && rail.id === '#4821',
    J(rail)
  )
  await direction(page, 'Tree')
  const listed = await waitFor(page, sidebarHas(BRANCH), (v) => v, 6000)
  check('the move refreshes the tree: the sidebar lists the new worktree', listed)

  await direction(page, 'Agents')
  await evaluate(
    page,
    `(() => {
       const row = [...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').startsWith(${J(TITLE)}))
       row?.click()
       return Boolean(row)
     })()`
  )
  const barBranch = await waitFor(
    page,
    `JSON.stringify(document.querySelector('footer.status-bar .status-bar-branch')?.getAttribute('title') ?? null)`,
    (v) => v === BRANCH,
    4000
  )
  check(
    "selecting the session shows the followed worktree's branch in the status bar (SFWT-11)",
    barBranch === BRANCH,
    String(barBranch)
  )

  const wtChips = await detailSessions(page, BRANCH)
  const mainChips = await detailSessions(page, 'main')
  check(
    "the worktree's detail lists the session; the launch folder's does not (SFWT-11)",
    Array.isArray(wtChips) &&
      wtChips.includes(TITLE) &&
      Array.isArray(mainChips) &&
      !mainChips.includes(TITLE),
    `worktree ${J(wtChips)}; main ${J(mainChips)}`
  )

  // 5. Hours: the launch period closes, a worktree period opens at the same instant.
  let time = await timeOf(page, id)
  for (let i = 0; i < 40 && time.open?.branch !== BRANCH; i++) {
    await sleep(200)
    time = await timeOf(page, id)
  }
  const launchPeriod = time.closed.find((p) => samePath(p.cwd, primary))
  check(
    'the time log closes the launch period on main and opens one in the worktree on its branch at the same instant (SFWT-08)',
    Boolean(launchPeriod) &&
      launchPeriod.branch === 'main' &&
      time.open?.cwd === followed &&
      time.open?.branch === BRANCH &&
      launchPeriod.end === time.open?.start,
    J({
      closed: time.closed.map((p) => ({ cwd: basename(p.cwd), branch: p.branch, end: p.end })),
      open: time.open && {
        cwd: basename(time.open.cwd),
        branch: time.open.branch,
        start: time.open.start
      }
    })
  )

  // 6. A Write back in the launch folder moves nothing.
  const openBefore = time.open?.id
  const closedBefore = time.closed.length
  await write(join(primary, 'CHANGELOG.md'))
  await sleep(1500)
  s = await sessionOf(page, id)
  time = await timeOf(page, id)
  rail = JSON.parse(await direction(page, 'Agents').then(() => evaluate(page, RAIL)))
  check(
    'a Write back in the launch folder moves nothing: followedPath, rail and open period stay (SFWT-04)',
    s?.followedPath === followed &&
      time.open?.id === openBefore &&
      time.closed.length === closedBefore &&
      rail.header === BRANCH,
    J({ followedPath: s?.followedPath ?? null, sameOpen: time.open?.id === openBefore, rail })
  )

  // 7. Respawn: the PTY in the launch folder, the follow kept, hours in the worktree.
  await evaluate(page, `window.api.invoke('sessions:stop', { id: ${J(id)} }).then(() => true)`)
  for (let i = 0; i < 40 && (await sessionOf(page, id))?.status !== 'stopped'; i++) await sleep(200)
  rmSync(join(fakeBin, 'cwd.txt'), { force: true })
  await evaluate(page, `window.api.invoke('sessions:respawn', { id: ${J(id)} }).then(() => true)`)
  const respawnCd = await readWhenWritten(join(fakeBin, 'cwd.txt'))
  s = await sessionOf(page, id)
  check(
    'a respawn starts the PTY in the launch folder and keeps followedPath (SFWT-16)',
    samePath(respawnCd, primary) && s?.followedPath === followed && s?.status === 'running',
    `cd ${respawnCd}; followedPath ${s?.followedPath ?? 'none'}; ${s?.status}`
  )
  time = await timeOf(page, id)
  check(
    'the respawned run opens its period in the followed worktree (SFWT-10)',
    time.open?.cwd === followed,
    time.open ? basename(time.open.cwd) : 'no open period'
  )

  // 8. Duplicate: a new session at the launch folder, following nothing.
  rmSync(join(fakeBin, 'cwd.txt'), { force: true })
  const copy = JSON.parse(
    await evaluate(
      page,
      `window.api.invoke('sessions:duplicate', { id: ${J(id)} }).then((v) => JSON.stringify(v))`
    )
  )
  mine.push(copy.id)
  const copyCd = await readWhenWritten(join(fakeBin, 'cwd.txt'))
  const copyNow = await sessionOf(page, copy.id)
  check(
    'a duplicate starts in the launch folder with no followedPath (SFWT-16)',
    samePath(copyCd, primary) &&
      samePath(copyNow?.cwd, primary) &&
      copyNow?.followedPath === undefined,
    `cd ${copyCd}; followedPath ${copyNow?.followedPath ?? 'none'}`
  )
}

try {
  await run()
} catch (err) {
  check(
    'the script ran to completion',
    false,
    err.stack?.split('\n').slice(0, 2).join(' ') ?? String(err)
  )
} finally {
  if (page) {
    try {
      await evaluate(
        page,
        `(async () => {
           for (const id of ${J(mine)}) { try { await window.api.invoke('sessions:stop', { id }) } catch {} }
           await new Promise((r) => setTimeout(r, 800))
           for (const id of ${J(mine)}) { try { await window.api.invoke('sessions:remove', { id }) } catch {} }
           const cfg = await window.api.invoke('config:get')
           await window.api.invoke('config:patch', {
             ${agentRegistered ? `agents: cfg.agents.filter((a) => a.name !== ${J(FAKE_AGENT)}),` : ''}
             ${registered && owner ? `workspaces: ${J(owner.workspaces)},` : ''}
           })
           return true
         })()`
      )
      if (owner) {
        const dir = owner.ui?.direction ?? 'tree'
        await direction(page, dir[0].toUpperCase() + dir.slice(1))
        await refresh(page)
        const after = JSON.parse(
          await evaluate(
            page,
            `(async () => {
               const cfg = await window.api.invoke('config:get')
               const ids = new Set(${J(mine)})
               return JSON.stringify({
                 workspaces: cfg.workspaces,
                 agent: cfg.agents.some((a) => a.name === ${J(FAKE_AGENT)}),
                 leftover: (await window.api.invoke('sessions:list')).filter((s) => ids.has(s.id)).length
               })
             })()`
          )
        )
        check(
          'the sessions, the throwaway agent and the workspace registration are gone',
          after.leftover === 0 && !after.agent && J(after.workspaces) === J(owner.workspaces),
          J({ leftover: after.leftover, agent: after.agent, workspaces: after.workspaces.length })
        )
      }
    } catch (err) {
      check('the owner state was restored', false, String(err))
    }
    page.close()
  }
  if (main) main.close()
  await sleep(500)
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 })
  } catch (err) {
    console.log(`WARN  could not delete ${root}: ${err.message}`)
  }
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed`)
  process.exit(passed === checks.length ? 0 : 1)
}
