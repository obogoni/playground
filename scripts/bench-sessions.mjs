/* Performance bench (issue #147, PDIAG-28..39, 48..50). One command, one load,
 * one summary: seeds a throwaway repository with one linked worktree per
 * session, launches the BUILT app on a throwaway user data folder with
 * PLAYGROUND_DEBUG_PERF=1, opens N raw-command sessions running
 * scripts/bench-tui.mjs, optionally rewrites the first worktree's git-dir
 * `index`, waits for full minutes of perf-diagnostics.jsonl, and prints the
 * figures against the targets (scripts/bench-summary.mjs).
 *
 * No registry agent is ever started and no account or network is needed. The
 * bench measures; it never gates: a completed run exits 0 whatever the
 * figures. Exit 2: no built app. Exit 1: the harness failed (port taken, the
 * app never answered, the lines never arrived).
 *
 * Run: npx electron-vite build
 *      node scripts/bench-sessions.mjs [--sessions 3] [--minutes 3] [--fps 20] [--rows 30]
 *        [--files 500] [--index-interval <ms>] [--port 9334] [--json <file>] [--keep]
 */

import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'
import {
  DEFAULT_TARGETS,
  formatSummary,
  judgeTargets,
  parseLines,
  phaseRows,
  worstRow
} from './bench-summary.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOG_FILE = 'perf-diagnostics.jsonl'
const EXIT_TIMEOUT_MS = 30_000
const POLL_MS = 500
const MINUTE_MS = 60_000
/** The first line arrives about 61 s after launch; three minutes means the app is not logging. */
const FIRST_LINE_TIMEOUT_MS = 3 * MINUTE_MS

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* --------------------------------------------------------------- options -- */

const count = (min) => (value, flag) => {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min) throw new Error(`${flag} needs a whole number >= ${min}`)
  return n
}
const text = (value, flag) => {
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

/** One row per flag; a flag with no `parse` is a switch. #150 adds its write loop here. */
const OPTIONS = [
  { flag: '--sessions', key: 'sessions', default: 3, parse: count(0) },
  { flag: '--minutes', key: 'minutes', default: 3, parse: count(1) },
  { flag: '--fps', key: 'fps', default: 20, parse: count(1) },
  { flag: '--rows', key: 'rows', default: 30, parse: count(1) },
  { flag: '--files', key: 'files', default: 500, parse: count(1) },
  { flag: '--index-interval', key: 'indexInterval', default: 0, parse: count(0) },
  { flag: '--port', key: 'port', default: 9334, parse: count(1) },
  { flag: '--json', key: 'json', default: null, parse: text },
  { flag: '--keep', key: 'keep', default: false }
]

function parseOptions(argv) {
  const options = Object.fromEntries(OPTIONS.map((o) => [o.key, o.default]))
  for (let i = 0; i < argv.length; i++) {
    const option = OPTIONS.find((o) => o.flag === argv[i])
    if (!option) throw new Error(`unknown option ${argv[i]}`)
    options[option.key] = option.parse ? option.parse(argv[++i], option.flag) : true
  }
  return options
}

let options
try {
  options = parseOptions(process.argv.slice(2))
} catch (err) {
  console.error(`bench-sessions: ${err.message}`)
  process.exit(1)
}

/* ------------------------------------------------------------ build check -- */

if (!existsSync(join(ROOT, 'out', 'main', 'index.js'))) {
  console.error(
    'bench-sessions: no built app (out/main/index.js). Run `npx electron-vite build` first.'
  )
  process.exit(2)
}

/* ---------------------------------------------------------------- cleanup -- */

const temp = mkdtempSync(join(tmpdir(), 'pg-bench-'))
const userData = join(temp, 'user-data')
const ws = join(temp, 'ws')
const repo = join(ws, 'app')
const logPath = join(userData, LOG_FILE)

let app = null
let indexTimer = null
let cleaned = false

const appRunning = () => app !== null && app.exitCode === null && app.signalCode === null

/** Synchronous so it can run from the `exit` and `SIGINT` handlers too. */
function cleanup() {
  if (cleaned) return
  cleaned = true
  clearInterval(indexTimer)
  if (appRunning()) spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'])
  if (options.keep) {
    console.log(`kept: ${temp}`)
    return
  }
  try {
    // Windows holds a watched or just-closed directory open for a moment.
    rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  } catch (err) {
    console.error(`bench-sessions: could not remove ${temp}: ${err.code ?? err.message}`)
  }
}

process.on('exit', cleanup)
process.on('SIGINT', () => {
  console.error('bench-sessions: interrupted, killing the app and cleaning up')
  cleanup()
  process.exit(130)
})

function fail(message) {
  console.error(`bench-sessions: ${message}`)
  process.exit(1)
}

/* ------------------------------------------------------------------- seed -- */

const git = (args, cwd = repo) =>
  execFileSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'user.name=bench',
      '-c',
      'user.email=bench@example.invalid',
      ...args
    ],
    { cwd, encoding: 'utf8', windowsHide: true }
  ).trim()

function seed() {
  mkdirSync(join(repo, 'src'), { recursive: true })
  git(['init', '-q', '-b', 'main'])
  for (let f = 0; f < options.files; f++) {
    const name = `f${String(f).padStart(4, '0')}`
    const lines = Array.from({ length: 20 }, (_, l) => `export const ${name}_${l} = ${f * 20 + l}`)
    writeFileSync(join(repo, 'src', `${name}.ts`), lines.join('\n') + '\n')
  }
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'bench seed'])
  for (let i = 1; i <= Math.max(options.sessions, 1); i++) {
    git(['worktree', 'add', '-q', `../bench-wt-${i}`, '-b', `bench/${i}`])
  }
  mkdirSync(userData, { recursive: true })
  const workspace = { id: ws.toLowerCase(), path: ws, displayName: 'bench' }
  writeFileSync(join(userData, 'config.json'), JSON.stringify({ workspaces: [workspace] }, null, 2))
}

function commitOf() {
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  return sha.trim() + (dirty.trim() ? '-dirty' : '')
}

/* ------------------------------------------------------------------- CDP -- */

async function portAnswers(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`)
    return true
  } catch {
    return false
  }
}

async function pageTarget(port) {
  for (let i = 0; i < 40; i++) {
    if (!appRunning()) fail(`the app exited before its page came up\n${appOutput()}`)
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
    }
    await sleep(1000)
  }
  fail('no CDP page target after 40 s')
}

let nextId = 1
/** A page that died never answers: give up after a minute rather than hang. */
const EVALUATE_TIMEOUT_MS = 60_000
function evaluate(ws, expression) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    setTimeout(
      () => reject(new Error(`no CDP answer in ${EVALUATE_TIMEOUT_MS / 1000} s`)),
      EVALUATE_TIMEOUT_MS
    ).unref()
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(msg.error.message))
      else if (msg.result.exceptionDetails)
        reject(new Error(JSON.stringify(msg.result.exceptionDetails)))
      else resolve(msg.result.result.value)
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

const invoke = (socket, channel, payload) =>
  evaluate(socket, `window.api.invoke(${JSON.stringify(channel)}, ${JSON.stringify(payload)})`)

/* -------------------------------------------------------------------- log -- */

const readLines = () => (existsSync(logPath) ? parseLines(readFileSync(logPath, 'utf8')) : [])

async function waitForLines(n, deadline) {
  while (Date.now() < deadline) {
    if (!appRunning()) return readLines()
    const lines = readLines()
    if (lines.length >= n) return lines
    await sleep(POLL_MS)
  }
  return readLines()
}

let output = ''
const appOutput = () => `--- app output (last 4 KB) ---\n${output.slice(-4096)}`

/* -------------------------------------------------------------------- run -- */

if (await portAnswers(options.port)) {
  fail(`port ${options.port} already answers CDP; close what holds it or pass --port`)
}

options.commit = commitOf()
seed()

const env = { ...process.env, PLAYGROUND_DEBUG_PERF: '1' }
delete env.ELECTRON_RUN_AS_NODE
app = spawn(
  electron,
  [
    '.',
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${options.port}`,
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling'
  ],
  { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }
)
const keepOutput = (chunk) => (output = (output + chunk).slice(-65536))
app.stdout.on('data', keepOutput)
app.stderr.on('data', keepOutput)
const exited = new Promise((r) => app.on('exit', (code) => r(code)))
const launchedAt = Date.now()
console.log(`bench-sessions: app pid ${app.pid}, user data in ${userData}`)

const target = await pageTarget(options.port)
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve)
  socket.addEventListener('error', reject)
})
for (let i = 0; i < 120; i++) {
  if (
    await evaluate(socket, `document.readyState === 'complete' && typeof window.api === 'object'`)
  )
    break
  await sleep(250)
}

const first = await waitForLines(1, launchedAt + FIRST_LINE_TIMEOUT_MS)
if (first.length < 1) {
  fail(`no ${LOG_FILE} line within ${FIRST_LINE_TIMEOUT_MS / 1000} s of launch\n${appOutput()}`)
}
const firstLineAt = Date.now()
console.log(`bench-sessions: line 1 after ${Math.round((firstLineAt - launchedAt) / 1000)} s`)

const tui = join(ROOT, 'scripts', 'bench-tui.mjs')
const sessionIds = []
let spawnMs = null
for (let i = 1; i <= options.sessions; i++) {
  // The default shell runs the line as `pwsh -NoExit -Command <line>`; a quoted command needs `&`.
  const adhocCommand = `& "${process.execPath}" "${tui}" --fps ${options.fps} --rows ${options.rows} --seed ${i}`
  const started = performance.now()
  const view = await invoke(socket, 'sessions:spawn', {
    agentName: 'Ad-hoc',
    cwd: join(ws, `bench-wt-${i}`),
    adhocCommand
  })
  const ms = performance.now() - started
  spawnMs = Math.max(spawnMs ?? 0, ms)
  sessionIds.push(view.id)
}
if (sessionIds.length > 0) await invoke(socket, 'sessions:attach', { id: sessionIds[0] })

let indexWrites = 0
let indexSkipped = 0
if (options.indexInterval > 0) {
  const gitDir = git(['rev-parse', '--absolute-git-dir'], join(ws, 'bench-wt-1'))
  const indexPath = resolve(gitDir, 'index')
  indexTimer = setInterval(() => {
    try {
      writeFileSync(indexPath, readFileSync(indexPath))
      indexWrites++
    } catch {
      // git holds the index now and then (EBUSY, EPERM): counted and skipped
      indexSkipped++
    }
  }, options.indexInterval)
}

const wanted = options.minutes + 2
const lines = await waitForLines(wanted, firstLineAt + (options.minutes + 3) * MINUTE_MS)
clearInterval(indexTimer)
const complete = lines.length >= wanted

for (const id of sessionIds) {
  try {
    await invoke(socket, 'sessions:stop', { id })
  } catch {
    /* the app may already be gone */
  }
}
// The page goes away with the window, so this evaluate never answers; do not await it.
socket.send(
  JSON.stringify({
    id: nextId++,
    method: 'Runtime.evaluate',
    params: { expression: 'window.close()' }
  })
)
const code = await Promise.race([exited, sleep(EXIT_TIMEOUT_MS).then(() => 'timeout')])
if (code === 'timeout') {
  console.error(
    `bench-sessions: the app did not exit within ${EXIT_TIMEOUT_MS / 1000} s; killing it`
  )
  spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'])
  await exited
}

const rows = phaseRows(lines, { minutes: options.minutes })
const worst = worstRow(rows)
const targets = judgeTargets(rows, {
  sessions: options.sessions,
  indexIntervalMs: options.indexInterval,
  targets: DEFAULT_TARGETS
})
console.log(formatSummary(options, rows, worst, targets, spawnMs))
if (options.indexInterval > 0) {
  console.log(`index loop: ${indexWrites} writes, ${indexSkipped} skipped`)
}
if (options.json) {
  writeFileSync(
    resolve(options.json),
    JSON.stringify({ options, lines, rows, worst, targets, spawnMs }, null, 2) + '\n'
  )
}
if (!complete) {
  fail(
    `only ${lines.length} of ${wanted} lines arrived within ${options.minutes + 3} minutes of line 1\n${appOutput()}`
  )
}
process.exit(0)
