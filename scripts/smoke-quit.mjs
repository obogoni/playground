/* Quit smoke (RSTP-06, issue #91). Launches the BUILT app, closes its only
 * window through CDP, and reads what the main process printed on the way out:
 * a normal quit must exit 0 with no `ERR_SERVER_NOT_RUNNING` and no unhandled
 * rejection. No workflow runs, so the MCP result server is never started —
 * the quit that used to reject.
 *
 * The app owns this run: the script spawns it, so it can also watch it exit.
 * User data goes to a fresh temp dir, never the owner's %APPDATA%\playground,
 * and the dir is deleted on the way out. Nothing is spawned inside the app.
 *
 * Run: npx electron-vite build
 *      node scripts/smoke-quit.mjs      (SMOKE_PORT overrides the CDP port)
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const PORT = Number(process.env.SMOKE_PORT) || 9333
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXIT_TIMEOUT_MS = 30_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  const n = String(checks.length).padStart(2, ' ')
  console.log(`${n}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function pageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* app not up yet */
    }
    await sleep(1000)
  }
  throw new Error('No CDP page target after 30s')
}

let nextId = 1
function evaluate(ws, expression) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result.result.value)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression } }))
  })
}

const userData = mkdtempSync(join(tmpdir(), 'quit-smoke-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const app = spawn(
  electron,
  [
    '.',
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${PORT}`,
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling'
  ],
  { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }
)
let output = ''
app.stdout.on('data', (chunk) => (output += chunk))
app.stderr.on('data', (chunk) => (output += chunk))
const exited = new Promise((resolve) => app.on('exit', (code) => resolve(code)))

let code = null
try {
  const target = await pageTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  for (let i = 0; i < 60 && (await evaluate(ws, 'document.readyState')) !== 'complete'; i++) {
    await sleep(250)
  }
  // The only window closing is a normal quit: window-all-closed → app.quit() → will-quit.
  // The page goes away with it, so the evaluate never answers; do not await it.
  ws.send(
    JSON.stringify({
      id: nextId++,
      method: 'Runtime.evaluate',
      params: { expression: 'window.close()' }
    })
  )

  code = await Promise.race([exited, sleep(EXIT_TIMEOUT_MS).then(() => 'timeout')])
} finally {
  if (app.exitCode === null) {
    spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'])
    await exited
  }
  // Electron can hold the dir a moment after exit.
  rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}

console.log('--- main process output ---')
console.log(output.trimEnd() || '(none)')
console.log('---------------------------')

const notRunning = output.match(/.*ERR_SERVER_NOT_RUNNING.*/)
const unhandled = output.match(/.*UnhandledPromiseRejection.*/)
// Chromium prints this line for --remote-debugging-port; without it, an empty capture
// would read as a clean quit.
check('the main process output was captured', /DevTools listening/.test(output))
check('the app exits after its only window closes', code !== 'timeout', `exit ${code}`)
check('the app exits with code 0', code === 0, `exit ${code}`)
check('no ERR_SERVER_NOT_RUNNING at quit', !notRunning, notRunning?.[0].trim())
check('no unhandled rejection at quit', !unhandled, unhandled?.[0].trim())

const passed = checks.filter((c) => c.ok).length
console.log(`\n${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
