/* CDP smoke for tray residency (TRAY-02, 03, 23, 24, 30, 31, 32).
 *
 *   node scripts/smoke-tray-residency.mjs
 *
 * Self-contained: two throwaway `--user-data-dir`s, the dev app driven over CDP,
 * a stub agent (`node stub-agent.mjs`) that prints a tick every 300 ms, so no real
 * coding agent starts. Everything it made is removed at the end.
 *
 * Not reachable from CDP: the tray icon and its menu (TRAY-01, 04, 05, 12, 16) and a
 * notification click (TRAY-06). The controller's unit tests cover their policy; the
 * real tray is checked by hand.
 *
 * SMOKE_BREAK=1 compares every check against a deliberately wrong expected value:
 * every check must then FAIL, which proves none of them passes vacuously.
 *
 * Environment: SMOKE_PORT (default 9222) must be free.
 */

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SMOKE_PORT ?? 9222)
const BREAK = process.env.SMOKE_BREAK === '1'
const ELECTRON = createRequire(import.meta.url)('electron')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (value) => JSON.stringify(value)

/* ------------------------------------------------------------- checks -- */

const checks = []
function expectEq(name, actual, expected) {
  const want = BREAK ? { deliberatelyWrong: expected } : expected
  const ok = JSON.stringify(actual) === JSON.stringify(want)
  checks.push({ name, ok })
  const detail = ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`
  console.log(`${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail}`)
}

/* ------------------------------------------------------------ the app -- */

let app = null
let appOutput = ''

async function portAnswers() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json`, { signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

function launch(userData, extra = '') {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  appOutput = ''
  app = spawn(
    `npm run dev -- -- --remote-debugging-port=${PORT} "--user-data-dir=${userData}" ${extra}`,
    { cwd: ROOT, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  )
  const keep = (chunk) => (appOutput = (appOutput + chunk).slice(-8192))
  app.stdout.on('data', keep)
  app.stderr.on('data', keep)
}

async function stopApp() {
  if (!app || app.exitCode !== null) return
  try {
    execFileSync('taskkill', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 20 && (await portAnswers()); i++) await sleep(500)
}

/** A second launch of the built main on `userData`; resolves its exit code, or null at 10 s. */
function secondLaunch(userData) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(ELECTRON, [ROOT, `--user-data-dir=${userData}`, '--hidden'], {
    cwd: ROOT,
    env,
    stdio: 'ignore',
    windowsHide: true
  })
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* gone */
      }
      resolve(null)
    }, 10000)
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

/* ---------------------------------------------------------------- CDP -- */

let ws = null
let nextId = 1
const pending = new Map()

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`${method} timed out`))
      }
    }, 60000)
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || 'evaluate threw')
  }
  return res.result.value
}

async function waitFor(expression, timeout = 8000) {
  const deadline = Date.now() + timeout
  let value
  while (Date.now() < deadline) {
    value = await evaluate(expression)
    if (value) return value
    await sleep(150)
  }
  return value
}

async function connect() {
  let page = null
  for (let i = 0; i < 180 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      page = targets.find((t) => t.type === 'page') ?? null
    } catch {
      /* not up yet */
    }
    if (app?.exitCode !== null) throw new Error(`dev app exited\n${appOutput}`)
    if (!page) await sleep(1000)
  }
  if (!page) throw new Error(`No CDP page target after 180s on port ${PORT}\n${appOutput}`)
  ws = new WebSocket(page.webSocketDebuggerUrl)
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
  await send('Runtime.enable')
  await waitFor(
    `typeof window.api === 'object' && document.querySelector('#root > *') !== null`,
    90000
  )
}

function disconnect() {
  ws?.close()
  ws = null
}

/**
 * Whether Windows shows a window for the dev app: an `electron.exe` with a main
 * window handle. `document.visibilityState` cannot tell, because Electron keeps
 * a `show: false` window's renderer "visible" (`paintWhenInitiallyHidden`).
 */
function windowShown() {
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      '@(Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count'
    ],
    { encoding: 'utf8' }
  )
  return Number(out.trim()) > 0
}

/** Polls `windowShown()` until it equals `want`; returns the last reading. */
async function waitShown(want, timeout) {
  const deadline = Date.now() + timeout
  let shown = windowShown()
  while (shown !== want && Date.now() < deadline) {
    await sleep(500)
    shown = windowShown()
  }
  return shown
}

/* ------------------------------------------------------------ the run -- */

function seedUserData(dir, wsPath, stub) {
  mkdirSync(dir)
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify(
      {
        ui: { theme: 'dark', direction: 'agents', defaultShell: 'pwsh' },
        workspaces: [{ id: wsPath.toLowerCase(), path: wsPath, displayName: 'tray-smoke' }],
        agents: [{ name: 'Stub', command: 'node', args: [stub], color: '--accent' }],
        ado: { autoPinFromWorktrees: false },
        pinnedTasks: [],
        sessions: []
      },
      null,
      2
    ) + '\n'
  )
}

let tmp = null
let failure = null

try {
  if (await portAnswers()) throw new Error(`port ${PORT} already answers CDP; close what holds it`)
  if (windowShown()) throw new Error('another electron.exe shows a window; close it first')
  tmp = await mkdtemp(join(tmpdir(), 'smoke-tray-'))
  const wsPath = join(tmp, 'ws')
  const stub = join(tmp, 'stub-agent.mjs')
  const shownData = join(tmp, 'user-data-shown')
  const hiddenData = join(tmp, 'user-data-hidden')
  mkdirSync(wsPath)
  writeFileSync(stub, "setInterval(() => process.stdout.write('TICK\\n'), 300)\n")
  seedUserData(shownData, wsPath, stub)
  seedUserData(hiddenData, wsPath, stub)

  /* --- a normal start shows the window (TRAY-24, TRAY-32) --------------- */
  launch(shownData)
  await connect()
  expectEq('TRAY-24: a start without --hidden shows the window', await waitShown(true, 15000), true)

  console.log('· spawning the stub session')
  const session = await evaluate(
    `window.api.invoke('sessions:spawn', { agentName: 'Stub', cwd: ${js(wsPath)} })`
  )
  await evaluate(`(() => {
    window.__smk = { ticks: 0 }
    window.api.on('session:data', (p) => {
      if (p.id === ${js(session.id)}) window.__smk.ticks += (p.data.match(/TICK/g) || []).length
    })
    return window.api.invoke('sessions:attach', { id: ${js(session.id)} }).then(() => true)
  })()`)
  console.log('· waiting for ticks')
  await waitFor('window.__smk.ticks > 0', 20000)

  /* --- the X hides the window and the session keeps running (TRAY-02, 03) */
  console.log('· closing the window')
  await evaluate('(() => { window.close(); return true })()')
  await sleep(2000)
  const ticksAtHide = await evaluate('window.__smk.ticks')
  expectEq('TRAY-02: closing the window keeps the app process alive', app.exitCode, null)
  expectEq('TRAY-02: closing the window hides it', await waitShown(false, 5000), false)
  await sleep(2000)
  const status = (await evaluate(`window.api.invoke('sessions:list')`)).find(
    (s) => s.id === session.id
  )?.status
  expectEq('TRAY-03: the session is still running while hidden', status, 'running')
  const grew = (await evaluate('window.__smk.ticks')) > ticksAtHide
  expectEq('TRAY-03: the session output keeps arriving while hidden', grew, true)

  /* --- a second launch quits and reveals the first (TRAY-30, TRAY-31) --- */
  console.log('· second launch')
  const code = await secondLaunch(shownData)
  expectEq('TRAY-30: a second launch on the same profile exits within 10 s', code !== null, true)
  expectEq(
    'TRAY-31: the running instance shows its window, even for a --hidden launch',
    await waitShown(true, 5000),
    true
  )

  await evaluate(`window.api.invoke('sessions:stop', { id: ${js(session.id)} }).then(() => true)`)
  disconnect()
  await stopApp()

  /* --- a --hidden start keeps the window in the tray (TRAY-23, TRAY-32) -- */
  console.log('· hidden start')
  launch(hiddenData, '--hidden')
  await connect()
  // Give a wrongly shown window time to appear before reading.
  await sleep(3000)
  expectEq('TRAY-23: a --hidden start keeps the window hidden', windowShown(), false)
  disconnect()
  await stopApp()
} catch (err) {
  failure = err
  console.error(`\nsmoke aborted: ${err instanceof Error ? err.stack : err}`)
} finally {
  disconnect()
  await stopApp()
  await sleep(1500)
  // Async rm: rmSync no-ops on this machine's non-ASCII profile paths.
  if (tmp) await rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
}

const cleaned = tmp === null || !existsSync(tmp)
checks.push({ name: 'the temp folder is removed', ok: cleaned })
console.log(`    ${cleaned ? 'PASS' : 'FAIL'}  isolation: the temp folder is removed`)

const passed = checks.filter((c) => c.ok).length
console.log(
  `\n${passed}/${checks.length} checks passed${BREAK ? ' (SMOKE_BREAK: every TRAY check should fail)' : ''}`
)
process.exit(failure === null && passed === checks.length ? 0 : 1)
