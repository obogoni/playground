/* CDP smoke for Session Strip Polish (STRP-01..15). Proves, against a running dev
 * app, what the unit tests cannot reach: the pill and the clickable clock as the
 * session detail strip renders them.
 *
 *   1. an MCP PreToolUse reaches the app and the pill reads `working · MCP
 *      azure-devops`, with the raw tool name as its tooltip; the rail row
 *      tooltip keeps the raw name (STRP-01, STRP-05, STRP-06)
 *   2. the strip holds no Pause time / Resume time button (STRP-14)
 *   3. the running session's clock is a button: pause icon, aria-pressed false,
 *      `· click to pause` tooltip, and it advances (STRP-09, STRP-10, STRP-12)
 *   4. a click pauses: the snapshot marks the session paused, the clock freezes,
 *      the icon turns to play, aria-pressed to true, the tooltip to `· click to
 *      resume`; a second click resumes. From the keyboard, Enter pauses and
 *      Space resumes, each from a confirmed state (STRP-07, STRP-08, STRP-11)
 *   5. the rail row counter and every total stay plain text (STRP-15)
 *   6. a session stopped while paused loses the mark with its run and its clock
 *      goes inert, a click on it doing nothing; respawned, the clock is a
 *      counting button again and a click pauses it (STRP-13 and the two
 *      paused/stopped edge cases)
 *
 * SPENDS NO TOKENS. The MCP activity is a synthetic hook POST, not an agent
 * turn: the script registers a throwaway agent whose command is
 * `claude --version`. That launch passes the app's hook rule, so the app injects
 * `--settings` and sets `PLAYGROUND_ACTIVITY_TOKEN` on the PTY; the CLI prints
 * its version and exits, leaving the `pwsh -NoExit` host shell. The script types
 * into that shell an `Invoke-RestMethod` POST of a `PreToolUse` to the hook URL
 * named in the app's settings file, authorized with the token from the shell's
 * own environment. The settings file never holds the token.
 *
 * It touches only the session it spawns. On the way out it removes that
 * session and the throwaway agent, deletes every time period the session
 * recorded, and restores the owner's direction and theme.
 *
 * NOT automatable here (hand-verify, record the result in validation.md):
 *   - the two-theme visual pass of the clock button: hover border and focus
 *     ring in light and dark
 *   - a screen reader announcing the clock as a toggle button, pressed / not
 *     pressed
 *
 * Requires: `claude` on PATH (it exits early without it).
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-strip.mjs                      (in another)
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const CWD = 'C:\\Windows'
const SMOKE_AGENT = 'Claude (strip smoke)'
const MCP_TOOL = 'mcp__azure-devops__wit_work_item'
const SETTINGS_PATH = join(
  process.env.APPDATA ?? '',
  'playground',
  'agent-hooks',
  'claude-settings.json'
)
/** The `play` glyph's path; the `pause` glyph is two rects (`Icon.tsx`). */
const PLAY_PATH = 'M7 5l11 7-11 7z'

if (spawnSync('where', ['claude'], { stdio: 'ignore' }).status !== 0) {
  console.log('SKIP  `claude` is not on PATH: the MCP activity needs a hooked launch')
  process.exit(1)
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
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('No CDP page target after 30s')
}

let nextId = 1
let ws
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)))
      resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  })
  const r = result.result
  if (r.subtype === 'error') throw new Error(r.description)
  return r.value
}

const invoke = (channel, req) =>
  evaluate(
    `window.api.invoke(${JSON.stringify(channel)}${req === undefined ? '' : `, ${JSON.stringify(req)}`})`
  )

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(expression, what, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

async function reloadInto(direction) {
  await invoke('config:patch', { ui: { direction } })
  await send('Page.reload')
  await sleep(1500)
  await waitFor(`document.querySelector('.topbar') !== null`, 'the top bar')
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  )
}

/** What the strip's clock is right now: element, press state, icon and tooltip. */
const readClock = async () =>
  JSON.parse(
    await evaluate(`(() => {
      const el = document.querySelector('.agents-detail .agents-detail-time')
      const svg = el?.querySelector('svg')
      return JSON.stringify({
        tag: el?.tagName ?? null,
        pressed: el?.getAttribute('aria-pressed') ?? null,
        icon: svg ? (svg.innerHTML.includes(${JSON.stringify(PLAY_PATH)}) ? 'play' : 'pause') : null,
        title: el?.getAttribute('title') ?? null,
        text: el?.textContent.trim() ?? null
      })
    })()`)
  )

const clickClock = () =>
  evaluate(`document.querySelector('.agents-detail .agents-detail-time').click(), true`)

/** Focus the clock and press a key the way a user does (CDP input, not a synthetic event). */
async function pressOnClock(key) {
  await evaluate(`document.querySelector('.agents-detail .agents-detail-time').focus(), true`)
  const event =
    key === 'Enter'
      ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }
      : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...event })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}

async function pausedInSnapshot(id) {
  const s = await invoke('time:snapshot')
  return { paused: s.paused.includes(id), open: s.open.some((p) => p.sessionId === id) }
}

/** Wait for the snapshot to report `paused` for this session and the strip's
 *  clock to render it: the snapshot push reaches the renderer a beat later.
 *  On a timeout it prints what it last saw, so a failure names its cause. */
async function waitPaused(id, paused) {
  let s
  let clock
  for (let i = 0; i < 20; i++) {
    s = await pausedInSnapshot(id)
    clock = await readClock()
    if (s.paused === paused && s.open === !paused && clock.pressed === String(paused)) return true
    await sleep(150)
  }
  const focused = await evaluate(
    `document.hasFocus() + ' / ' + (document.activeElement?.className || document.activeElement?.tagName)`
  )
  console.log(
    `      waited for paused=${paused}; snapshot ${JSON.stringify(s)}, clock ${JSON.stringify(clock)}, focus ${focused}`
  )
  return false
}

async function selectRow() {
  await waitFor(
    `[...document.querySelectorAll('.rail-row')].some(r => (r.title || '').includes(${JSON.stringify(SMOKE_AGENT)}))`,
    'the smoke session row'
  )
  await evaluate(
    `[...document.querySelectorAll('.rail-row')].find(r => (r.title || '').includes(${JSON.stringify(SMOKE_AGENT)})).click(), true`
  )
  await waitFor(`document.querySelector('.agents-detail') !== null`, 'the session detail strip')
}

const target = await pageTarget()
ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send('Runtime.enable')
await send('Page.enable')
await waitFor(`typeof window.api !== 'undefined'`, 'the preload bridge')

const original = (await invoke('config:get')).ui
const knownPeriods = new Set((await invoke('time:snapshot')).periods.map((p) => p.id))
let sessionId = null

try {
  const url = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))?.hooks?.PreToolUse?.[0]?.hooks?.[0]
    ?.url
  if (!url) throw new Error(`no hook url in ${SETTINGS_PATH}`)

  // The throwaway agent: a hooked launch that prints a version and exits.
  const cfg = await invoke('config:get')
  await invoke('config:patch', {
    agents: [
      ...cfg.agents.filter((a) => a.name !== SMOKE_AGENT),
      { name: SMOKE_AGENT, command: 'claude', args: ['--version'], color: '--accent' }
    ]
  })
  sessionId = (await invoke('sessions:spawn', { agentName: SMOKE_AGENT, cwd: CWD })).id

  // `claude --version` exits; the host shell keeps the token in its environment.
  await sleep(6000)
  const post =
    `Invoke-RestMethod -Method Post -Uri '${url}' -ContentType 'application/json' ` +
    `-Headers @{ Authorization = "Bearer $env:PLAYGROUND_ACTIVITY_TOKEN" } ` +
    `-Body '{"hook_event_name":"PreToolUse","tool_name":"${MCP_TOOL}"}'\r`
  await evaluate(
    `(window.api.send('session:input', { id: ${JSON.stringify(sessionId)}, data: ${JSON.stringify(post)} }), true)`
  )
  let activity = null
  for (let i = 0; i < 40 && activity?.tool !== MCP_TOOL; i++) {
    await sleep(250)
    const list = await invoke('sessions:list')
    activity = list.find((s) => s.id === sessionId)?.activity ?? null
  }
  check(
    'the synthetic PreToolUse reached the app with the MCP tool',
    activity?.state === 'working' && activity?.tool === MCP_TOOL,
    JSON.stringify(activity)
  )

  // 1. The pill, its tooltip and the rail row tooltip.
  await reloadInto('agents')
  await selectRow()
  const pill = JSON.parse(
    await evaluate(`(() => {
      const el = document.querySelector('.agents-detail .agents-detail-pill')
      return JSON.stringify({ text: el?.textContent ?? null, title: el?.getAttribute('title') ?? null })
    })()`)
  )
  check(
    'the pill reads `working · MCP azure-devops` (STRP-01)',
    pill.text === 'working · MCP azure-devops',
    pill.text
  )
  check('the pill tooltip is the raw tool name (STRP-05)', pill.title === MCP_TOOL, pill.title)
  const rowTitle = await evaluate(
    `[...document.querySelectorAll('.rail-row')].find(r => (r.title || '').includes(${JSON.stringify(SMOKE_AGENT)}))?.title ?? ''`
  )
  check(
    'the rail row tooltip keeps the raw tool name (STRP-06)',
    rowTitle.includes(MCP_TOOL) && !rowTitle.includes('MCP azure-devops'),
    rowTitle
  )

  // 2. No time button in the strip.
  const timeButtons = await evaluate(
    `[...document.querySelectorAll('.agents-detail button')].filter(b => /Pause time|Resume time/.test(b.textContent)).length`
  )
  check('the strip holds no Pause time or Resume time button (STRP-14)', timeButtons === 0)

  // 3. The counting clock.
  const counting = await readClock()
  check(
    'a counting clock is a button with the pause icon, not pressed (STRP-09, STRP-10)',
    counting.tag === 'BUTTON' && counting.icon === 'pause' && counting.pressed === 'false',
    JSON.stringify(counting)
  )
  check(
    'its tooltip offers to pause (STRP-12)',
    /^current run \d{2,}:\d{2}:\d{2} · click to pause$/.test(counting.title ?? ''),
    counting.title
  )
  check(
    'the clock is reachable by Tab (STRP-11)',
    await evaluate(`document.querySelector('.agents-detail .agents-detail-time').tabIndex >= 0`)
  )
  await sleep(2200)
  const advanced = (await readClock()).text
  check('a counting clock advances', advanced !== counting.text, `${counting.text} → ${advanced}`)

  // 4. Click pauses and resumes; Enter pauses and Space resumes.
  await clickClock()
  check('a click pauses the session (STRP-07)', await waitPaused(sessionId, true))
  const paused = await readClock()
  check(
    'a paused clock shows the play icon, pressed (STRP-09, STRP-10)',
    paused.tag === 'BUTTON' && paused.icon === 'play' && paused.pressed === 'true',
    JSON.stringify(paused)
  )
  check(
    'its tooltip offers to resume (STRP-12)',
    /^current run \d{2,}:\d{2}:\d{2} · click to resume$/.test(paused.title ?? ''),
    paused.title
  )
  await sleep(2200)
  const still = (await readClock()).text
  check('a paused clock does not advance', still === paused.text, `${paused.text} → ${still}`)

  await clickClock()
  check('a second click resumes the session (STRP-08)', await waitPaused(sessionId, false))

  // Each key starts from the state the previous check confirmed, so a key
  // that does nothing fails its own check instead of passing the next one.
  await pressOnClock('Enter')
  check('Enter on the focused clock pauses (STRP-07, STRP-11)', await waitPaused(sessionId, true))
  await pressOnClock(' ')
  check('Space on the focused clock resumes (STRP-08, STRP-11)', await waitPaused(sessionId, false))
  await clickClock()
  check('a click pauses it again before the stop', await waitPaused(sessionId, true))

  // 5. Every other counter is unchanged.
  const others = await evaluate(
    `[...document.querySelectorAll('.rail-row-time, .rail-group-time, .task-card-time, .detail-time')].filter(el => el.tagName !== 'SPAN' || el.hasAttribute('aria-pressed')).length`
  )
  check('the rail row counter and every total stay plain text (STRP-15)', others === 0)

  // 6. Stopped while paused, then respawned. The tracker forgets a run when its
  //    PTY ends, paused mark included (`TimeTracker.ended`), and a respawn starts
  //    a fresh, counting run (`TimeTracker.started`).
  await invoke('sessions:stop', { id: sessionId })
  await sleep(800)
  const stopped = await readClock()
  check(
    'a stopped session’s clock is plain text, no icon, no press state (STRP-13)',
    stopped.tag === 'SPAN' && stopped.icon === null && stopped.pressed === null,
    JSON.stringify(stopped)
  )
  const beforeClick = await pausedInSnapshot(sessionId)
  check(
    'a stopped session is neither counting nor paused',
    !beforeClick.paused && !beforeClick.open,
    JSON.stringify(beforeClick)
  )
  await clickClock()
  await sleep(300)
  const afterClick = await pausedInSnapshot(sessionId)
  check(
    'clicking a stopped session’s clock changes nothing (STRP-13)',
    !afterClick.paused && !afterClick.open && (await readClock()).tag === 'SPAN',
    JSON.stringify(afterClick)
  )

  await invoke('sessions:respawn', { id: sessionId })
  await waitFor(
    `document.querySelector('.agents-detail .agents-detail-time')?.tagName === 'BUTTON'`,
    'the respawned clock'
  )
  check(
    'a session respawned after a paused stop counts, with the pause icon',
    await waitPaused(sessionId, false),
    JSON.stringify(await readClock())
  )
  await clickClock()
  check('a click pauses the respawned session', await waitPaused(sessionId, true))
} catch (err) {
  check('the smoke ran to the end', false, err.message)
} finally {
  if (sessionId) {
    await invoke('sessions:stop', { id: sessionId }).catch(() => {})
    await invoke('sessions:remove', { id: sessionId }).catch(() => {})
    const after = await invoke('time:snapshot')
    const created = after.periods.filter(
      (p) => p.sessionId === sessionId && !knownPeriods.has(p.id)
    )
    for (const p of created) {
      await invoke('time:delete', { id: p.id })
    }
    const left = (await invoke('time:snapshot')).periods.filter((p) => p.sessionId === sessionId)
    check('cleanup deleted every period the session recorded', left.length === 0, `${left.length}`)
  }
  const cfg = await invoke('config:get')
  await invoke('config:patch', {
    agents: cfg.agents.filter((a) => a.name !== SMOKE_AGENT),
    ui: { direction: original.direction, theme: original.theme }
  })
  await send('Page.reload')
  ws.close()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
