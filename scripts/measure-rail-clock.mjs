/* Measurement for the rail clock's paint specks (RCLK-01..04, issue #173).
 *
 * Puts one throwaway session in `working`, the state of the report, with the
 * loader spinning beside the clock, and measures over CDP:
 *
 *   - the clock's box against the ink of its digits: the box from the DOM, the
 *     ink from `measureText` in the clock's own computed font. Ink above the
 *     box top is ink a box-sized invalidation would never cover;
 *   - what Chromium repaints while the clock ticks: `LayerTree.layerPainted`
 *     clips that touch the clock's box;
 *   - the device pixel ratio the run is at.
 *
 * It prints one JSON report. Run it once per scale, each against a fresh app
 * launched with `--force-device-scale-factor=<n>`. What CDP sees is the
 * rasterised frame; a defect of the presented screen needs
 * capture-screen-region.ps1 and analyze-screen-frames.mjs instead.
 *
 * SPENDS NO TOKENS. As in smoke-strip.mjs, the session is a throwaway agent
 * whose command is `claude --version`: the launch passes the app's hook rule,
 * so the PTY gets the activity token, and the script types a synthetic
 * `PreToolUse` POST into the shell left behind.
 *
 * Always on a throwaway profile, never the owner's:
 *   npm run dev -- -- "--user-data-dir=<dir>" --remote-debugging-port=<port> --force-device-scale-factor=<n>
 *   SMOKE_USER_DATA=<dir> SMOKE_PORT=<port> node scripts/measure-rail-clock.mjs [seconds]
 *   powershell -NoProfile -File scripts/measure-rail-clock-stop.ps1 -UserDataMarker <dir name>
 *
 * Requires: `claude` on PATH.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const USER_DATA = process.env.SMOKE_USER_DATA
const SECONDS = Number(process.argv[2]) || 10
const CWD = 'C:\\Windows'
const AGENT = 'Claude (clock measure)'

if (!USER_DATA) {
  console.error('Set SMOKE_USER_DATA to the throwaway --user-data-dir the app runs with.')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
let ws
const listeners = []
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

async function waitFor(expression, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const rowOf = `[...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').includes(${JSON.stringify(AGENT)}))`

/** The clock's box, its font, and where the ink of its digits sits against the box. */
const geometry = `
  (() => {
    const row = ${rowOf}
    const clock = row?.querySelector('.rail-row-time')
    if (!clock) return null
    const cs = getComputedStyle(clock)
    const box = clock.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(clock)
    const run = range.getBoundingClientRect()
    const ctx = document.createElement('canvas').getContext('2d')
    // The computed \`font\` shorthand reads empty here; build it from its parts.
    const font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ')
    ctx.font = font
    const digits = ctx.measureText('0123456789')
    const text = ctx.measureText(clock.textContent)
    const baseline = run.top + text.fontBoundingBoxAscent
    const inkTop = baseline - digits.actualBoundingBoxAscent
    const loader = row.querySelector('.rail-row-loader')?.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    return {
      dpr: devicePixelRatio,
      font,
      fontReady: document.fonts.check(font, clock.textContent),
      lineHeight: cs.lineHeight,
      text: clock.textContent,
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height },
      run: { top: run.top, bottom: run.bottom, height: run.height },
      fontAscent: text.fontBoundingBoxAscent,
      fontDescent: text.fontBoundingBoxDescent,
      digitInkAscent: digits.actualBoundingBoxAscent,
      digitInkDescent: digits.actualBoundingBoxDescent,
      inkTop,
      inkBottom: baseline + digits.actualBoundingBoxDescent,
      inkAboveBox: box.top - inkTop,
      inkAboveBoxDevicePx: (box.top - inkTop) * devicePixelRatio,
      boxTopDevicePx: box.top * devicePixelRatio,
      loader: loader ? { left: loader.left, top: loader.top, width: loader.width, height: loader.height } : null,
      row: { top: rowBox.top, bottom: rowBox.bottom, background: getComputedStyle(row).backgroundColor }
    }
  })()
`

const target = await pageTarget()
ws = new WebSocket(target.webSocketDebuggerUrl)
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method) for (const l of listeners) l(msg)
})
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send('Runtime.enable')
await send('Page.enable')
await waitFor(`typeof window.api !== 'undefined'`, 'the preload bridge')

let sessionId = null
const report = {}
try {
  const settingsPath = join(USER_DATA, 'agent-hooks', 'claude-settings.json')
  const url = JSON.parse(readFileSync(settingsPath, 'utf8'))?.hooks?.PreToolUse?.[0]?.hooks?.[0]
    ?.url
  if (!url) throw new Error(`no hook url in ${settingsPath}`)

  const cfg = await invoke('config:get')
  await invoke('config:patch', {
    agents: [
      ...cfg.agents.filter((a) => a.name !== AGENT),
      { name: AGENT, command: 'claude', args: ['--version'], color: '--accent' }
    ],
    ui: { direction: 'agents' }
  })
  sessionId = (await invoke('sessions:spawn', { agentName: AGENT, cwd: CWD })).id

  // `claude --version` exits; the host shell keeps the token in its environment.
  await sleep(6000)
  const post =
    `Invoke-RestMethod -Method Post -Uri '${url}' -ContentType 'application/json' ` +
    `-Headers @{ Authorization = "Bearer $env:PLAYGROUND_ACTIVITY_TOKEN" } ` +
    `-Body '{"hook_event_name":"PreToolUse","tool_name":"Bash"}'\r`
  await evaluate(
    `(window.api.send('session:input', { id: ${JSON.stringify(sessionId)}, data: ${JSON.stringify(post)} }), true)`
  )
  let activity = null
  for (let i = 0; i < 40 && activity?.state !== 'working'; i++) {
    await sleep(250)
    activity = (await invoke('sessions:list')).find((s) => s.id === sessionId)?.activity ?? null
  }
  report.activity = activity

  await send('Page.reload')
  await sleep(1500)
  await waitFor(`${rowOf} !== undefined`, 'the measured session row')
  await waitFor(`!!${rowOf}?.querySelector('.rail-row-loader')`, 'the spinning loader')
  report.geometry = await evaluate(geometry)

  // What repaints while the clock ticks.
  const painted = []
  listeners.push((msg) => {
    if (msg.method === 'LayerTree.layerPainted') painted.push(msg.params)
  })
  await send('LayerTree.enable')
  const startText = report.geometry?.text
  await sleep(SECONDS * 1000)
  await send('LayerTree.disable')
  const g = await evaluate(geometry)
  report.ticks = { from: startText, to: g?.text }
  // Layer clips are in device px; the box is in CSS px. Compare in device px.
  // Clips are in their layer's space: this assumes that layer starts at the
  // page's origin.
  const box = Object.fromEntries(Object.entries(g.box).map(([k, v]) => [k, v * g.dpr]))
  const touches = (c) =>
    c.x < box.right &&
    c.x + c.width > box.left &&
    c.y < box.bottom + 2 &&
    c.y + c.height > box.top - 4
  const near = painted.map((p) => p.clip).filter(touches)
  const key = (c) => `${c.x},${c.y},${c.width}x${c.height}`
  const counts = {}
  for (const c of near) counts[key(c)] = (counts[key(c)] ?? 0) + 1
  report.paints = {
    total: painted.length,
    nearClock: near.length,
    distinctNearClock: counts,
    clockBoxTopDevicePx: box.top,
    inkTopDevicePx: g.inkTop * g.dpr
  }
} finally {
  if (sessionId) {
    try {
      await invoke('sessions:stop', { id: sessionId })
      await invoke('sessions:remove', { id: sessionId })
    } catch {
      /* already gone */
    }
  }
  const cfg = await invoke('config:get')
  await invoke('config:patch', { agents: cfg.agents.filter((a) => a.name !== AGENT) })
  ws.close()
}

console.log(JSON.stringify(report, null, 2))
