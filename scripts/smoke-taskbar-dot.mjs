/* Smoke for the taskbar unseen dot (TBDT-01..04). Proves what the unit tests of
 * `SessionNotifier` and `UnseenBadge` cannot reach: the wiring in `index.ts`
 * between a real OS notification, the window's taskbar overlay and its focus.
 *
 * Windows has no getter for an overlay icon, so the script spies on the window's
 * `setOverlayIcon` through the main process inspector and reads every call:
 *   1. a session finishing its turn while the window is minimized sets the dot,
 *      with the `Unseen notifications` description (TBDT-01)
 *   2. a second notification while the dot is shown sets nothing more (TBDT-04)
 *   3. focusing the window clears the dot (TBDT-03)
 *   4. with notifications switched off, a finished turn sets no dot (TBDT-01
 *      edge case)
 *
 * The session is a fake `claude.cmd` that only records the hook token the app
 * hands it: never a real agent, never a prompt. The turn is two hook posts
 * (`UserPromptSubmit`, then `Stop`), so real Windows toasts appear on screen
 * while it runs.
 *
 * NOT automatable here (hand-verify): how the dot looks on the taskbar, and a
 * real OS focus. Windows may refuse to bring the window forward for a script;
 * the script then fires the window's `focus` event itself and says so.
 *
 * It runs only on a throwaway userData directory, never on the owner's:
 *   1. npm run dev -- -- "--user-data-dir=<a new empty directory>" --remote-debugging-port=9222
 *        --inspect=9229 --disable-renderer-backgrounding
 *        --disable-backgrounding-occluded-windows --disable-background-timer-throttling
 *   2. node scripts/smoke-taskbar-dot.mjs
 * SMOKE_PORT and SMOKE_INSPECT_PORT override 9222 and 9229.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const INSPECT_PORT = Number(process.env.SMOKE_INSPECT_PORT) || 9229
const FAKE_AGENT = 'Claude (taskbar dot smoke)'
const J = JSON.stringify
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fakeBin = join(tmpdir(), `playground-smoke-dot-${Date.now()}`)
let failures = 0
function check(name, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`)
}

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
      if (msg.result?.exceptionDetails) {
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
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const target = targets.find(pick)
      if (target) return target.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(1000)
  }
  throw new Error(`no debug target on port ${port} after 30 s`)
}

/** Writes its hook token and `--settings` path next to itself, then idles. */
function writeFakeClaude() {
  mkdirSync(fakeBin, { recursive: true })
  writeFileSync(
    join(fakeBin, 'claude.cmd'),
    [
      '@echo off',
      '>"%~dp0settings.txt" echo %~2',
      '>"%~dp0token.txt" echo %PLAYGROUND_ACTIVITY_TOKEN%',
      ':idle',
      'ping -n 3600 127.0.0.1 >nul',
      'goto idle',
      ''
    ].join('\r\n')
  )
}

async function readWhenWritten(path, timeoutMs = 8000) {
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

// The main process, reached through its inspector.
const WIN = `require('electron').BrowserWindow.getAllWindows()[0]`
const SPY = `(() => {
  const win = ${WIN}
  globalThis.__overlayCalls = []
  if (!win.__overlaySpy) {
    const real = win.setOverlayIcon.bind(win)
    win.setOverlayIcon = (image, description) => {
      globalThis.__overlayCalls.push({ dot: image !== null && !image.isEmpty(), description })
      return real(image, description)
    }
    win.__overlaySpy = true
  }
  return true
})()`
const calls = (main) => evaluate(main, 'JSON.stringify(globalThis.__overlayCalls)').then(JSON.parse)

let main = null
let page = null
let sessionId = null
let agentRegistered = false
let notifyBefore

try {
  main = await connect(await targetUrl(INSPECT_PORT, (t) => t.type === 'node'))
  page = await connect(
    await targetUrl(PORT, (t) => t.type === 'page' && !t.url.startsWith('devtools'))
  )

  const userData = await evaluate(main, `require('electron').app.getPath('userData')`)
  const real = join(process.env.APPDATA ?? '', 'playground')
  if (userData.toLowerCase() === real.toLowerCase()) {
    throw new Error(`refusing to run on the owner's userData (${userData})`)
  }
  await evaluate(main, SPY)

  writeFakeClaude()
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
  notifyBefore = await evaluate(
    page,
    `window.api.invoke('config:get').then((c) => c.ui.notify ?? null)`
  )
  sessionId = await evaluate(
    page,
    `window.api.invoke('sessions:spawn', { agentName: ${J(FAKE_AGENT)}, cwd: ${J(fakeBin)} }).then((v) => v.id)`
  )
  const token = await readWhenWritten(join(fakeBin, 'token.txt'))
  const settingsPath = await readWhenWritten(join(fakeBin, 'settings.txt'))
  const url = settingsPath
    ? (JSON.parse(readFileSync(settingsPath, 'utf8')).hooks?.Stop?.[0]?.hooks?.[0]?.url ?? null)
    : null
  if (!token || token.startsWith('%') || !url) throw new Error('the fake agent got no hook token')

  const post = async (event) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: J({ hook_event_name: event, session_id: 'smoke-dot' })
    })
    if (res.status >= 300) throw new Error(`hook ${event} answered ${res.status}`)
  }
  const turn = async () => {
    await post('UserPromptSubmit')
    await sleep(200)
    await post('Stop')
    await sleep(800)
  }

  // 1. Away (minimized), a finished turn notifies and sets the dot.
  await evaluate(main, `(${WIN}.minimize(), true)`)
  await sleep(600)
  await turn()
  let seen = await calls(main)
  check(
    'a turn finished while the window is minimized sets the dot (TBDT-01)',
    seen.length === 1 && seen[0].dot && seen[0].description === 'Unseen notifications',
    J(seen)
  )

  // 2. A second notification keeps the one dot.
  await turn()
  seen = await calls(main)
  check('a second notification sets nothing more (TBDT-04)', seen.length === 1, J(seen))

  // 3. Focus clears it.
  const focused = await evaluate(
    main,
    `(async () => {
       const win = ${WIN}
       win.restore(); win.show(); win.focus()
       await new Promise((r) => setTimeout(r, 1500))
       if (win.isFocused()) return 'os'
       win.emit('focus')
       return 'emitted'
     })()`
  )
  seen = await calls(main)
  check(
    `focusing the window clears the dot (TBDT-03; focus ${focused === 'os' ? 'by the OS' : 'event fired by the script'})`,
    seen.length === 2 && seen[1].dot === false,
    J(seen)
  )

  // 4. Switched off, nothing notifies and no dot is set.
  await evaluate(
    page,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       await window.api.invoke('config:patch', { ui: { ...cfg.ui, notify: false } })
       return true
     })()`
  )
  await evaluate(main, `(${WIN}.minimize(), true)`)
  await sleep(600)
  await turn()
  seen = await calls(main)
  check(
    'with notifications off a finished turn sets no dot (TBDT-01 edge case)',
    seen.length === 2,
    J(seen)
  )
} catch (err) {
  failures++
  console.log(`FAIL ${err.message}`)
} finally {
  if (page) {
    await evaluate(
      page,
      `(async () => {
         ${sessionId ? `await window.api.invoke('sessions:stop', { id: ${J(sessionId)} }).catch(() => {}); await window.api.invoke('sessions:remove', { id: ${J(sessionId)} }).catch(() => {})` : ''}
         const cfg = await window.api.invoke('config:get')
         const ui = { ...cfg.ui }
         if (${J(notifyBefore)} === null) delete ui.notify
         else if (${J(notifyBefore)} !== undefined) ui.notify = ${J(notifyBefore)}
         await window.api.invoke('config:patch', {
           ui,
           ${agentRegistered ? `agents: cfg.agents.filter((a) => a.name !== ${J(FAKE_AGENT)}),` : ''}
         })
         return true
       })()`
    ).catch((err) => console.log(`cleanup: ${err.message}`))
    page.close()
  }
  if (main) {
    await evaluate(main, `(${WIN}.restore(), true)`).catch(() => {})
    main.close()
  }
  await sleep(500)
  rmSync(fakeBin, { recursive: true, force: true })
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
