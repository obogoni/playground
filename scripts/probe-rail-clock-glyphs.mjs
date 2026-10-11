/* Controlled probe for the rail clock's specks (issue #173).
 *
 * The specks came and went with the glyphs the clock showed (measurement.md).
 * This puts one throwaway session's row in `working`, hides its live clock,
 * and puts in its place a static copy (same class, same box) whose text the
 * script sets value by value. For each value it takes a CDP screenshot of the
 * clock's surroundings, decodes it in the page, and counts the pixels of the
 * band between the clock box's top - 4 px and the digits' ink top that stray
 * from that band row's median colour: what a speck would be.
 *
 * PROBE_CSS=<css declarations> applies a candidate fix to the copy, e.g.
 * PROBE_CSS="contain: paint" or PROBE_CSS="font-size: 10.4px".
 *
 * Always on a throwaway profile, never the owner's:
 *   npm run dev -- -- "--user-data-dir=<dir>" --remote-debugging-port=<port> --force-device-scale-factor=1.25
 *   SMOKE_USER_DATA=<dir> SMOKE_PORT=<port> node scripts/probe-rail-clock-glyphs.mjs
 *
 * SPENDS NO TOKENS: the session is `claude --version`, as in measure-rail-clock.mjs.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const USER_DATA = process.env.SMOKE_USER_DATA
const PROBE_CSS = process.env.PROBE_CSS ?? ''
const CWD = 'C:\\Windows'
const AGENT = 'Claude (clock probe)'

if (!USER_DATA) {
  console.error('Set SMOKE_USER_DATA to the throwaway --user-data-dir the app runs with.')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pad = (n) => String(n).padStart(2, '0')

/** The values that showed the dash on screen, then every pair for each digit position. */
function values() {
  const out = []
  for (const mm of [27, 31]) for (let ss = 0; ss < 60; ss++) out.push(`01:${pad(mm)}:${pad(ss)}`)
  for (let d = 0; d < 100; d++)
    out.push(`00:00:${pad(d)}`, `00:${pad(d % 60)}:00`, `${pad(d)}:00:00`)
  return [...new Set(out)]
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

async function waitFor(expression, what, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const rowOf = `[...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').includes(${JSON.stringify(AGENT)}))`

/** Hides the live clock and puts a static copy in its place; returns the copy's geometry. */
const installCopy = `
  (() => {
    const row = ${rowOf}
    const live = row.querySelector('.rail-row-time:not(#probe-clock)')
    let copy = document.getElementById('probe-clock')
    if (!copy) {
      copy = document.createElement('span')
      copy.id = 'probe-clock'
      copy.className = live.className
      live.after(copy)
      live.style.display = 'none'
    }
    copy.style.cssText = ${JSON.stringify(PROBE_CSS)}
    copy.textContent = '00:00:00'
    return true
  })()
`

/** Sets the copy's text and waits two frames, so the value is on screen. */
const show = (text) => `
  new Promise((resolve) => {
    document.getElementById('probe-clock').textContent = ${JSON.stringify(text)}
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30)))
  })
`

/** The copy's box and ink top, in CSS px. */
const geometry = `
  (() => {
    const clock = document.getElementById('probe-clock')
    const cs = getComputedStyle(clock)
    const box = clock.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(clock)
    const run = range.getBoundingClientRect()
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ')
    const text = ctx.measureText(clock.textContent)
    const digits = ctx.measureText('0123456789')
    return {
      dpr: devicePixelRatio,
      fontSize: cs.fontSize,
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      inkTop: run.top + text.fontBoundingBoxAscent - digits.actualBoundingBoxAscent
    }
  })()
`

/** Counts, in a PNG screenshot of the band, the pixels that stray from their row's median. */
const countStrays = (data, band) => `
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      const rows = Math.min(${band.rows}, c.height)
      let strays = 0
      const at = []
      for (let y = 0; y < rows; y++) {
        const line = []
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4
          line.push([data[i], data[i + 1], data[i + 2]])
        }
        const median = [0, 1, 2].map((k) => line.map((p) => p[k]).sort((a, b) => a - b)[line.length >> 1])
        line.forEach((p, x) => {
          if (Math.max(...p.map((v, k) => Math.abs(v - median[k]))) > 24) {
            strays++
            if (at.length < 8) at.push([x, y])
          }
        })
      }
      resolve({ width: c.width, height: c.height, strays, at })
    }
    img.src = 'data:image/png;base64,${data}'
  })
`

const target = await pageTarget()
ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send('Runtime.enable')
await send('Page.enable')
await waitFor(`typeof window.api !== 'undefined'`, 'the preload bridge')

let sessionId = null
const report = { css: PROBE_CSS, hits: [] }
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
  await sleep(6000)
  const post =
    `Invoke-RestMethod -Method Post -Uri '${url}' -ContentType 'application/json' ` +
    `-Headers @{ Authorization = "Bearer $env:PLAYGROUND_ACTIVITY_TOKEN" } ` +
    `-Body '{"hook_event_name":"PreToolUse","tool_name":"Bash"}'\r`
  await evaluate(
    `(window.api.send('session:input', { id: ${JSON.stringify(sessionId)}, data: ${JSON.stringify(post)} }), true)`
  )
  await send('Page.reload')
  await sleep(1500)
  await waitFor(`!!${rowOf}?.querySelector('.rail-row-loader')`, 'the working row')
  await evaluate(`(${rowOf}.click(), true)`)
  await sleep(500)

  await evaluate(installCopy)
  await evaluate(show('00:00:00'))
  const g = await evaluate(geometry)
  report.geometry = g
  // The band: from 4 px above the box down to the row just above the ink, in CSS px.
  const clip = {
    x: g.left,
    y: g.top - 4,
    width: g.right - g.left,
    height: g.inkTop - (g.top - 4),
    scale: 1
  }
  const bandRows = Math.floor((g.inkTop - (g.top - 4)) * g.dpr) - 1

  const list = values()
  report.values = list.length
  for (const text of list) {
    await evaluate(show(text))
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      clip,
      captureBeyondViewport: false
    })
    const r = await evaluate(countStrays(shot.data, { rows: bandRows }))
    report.size = `${r.width}x${r.height}`
    if (r.strays > 0) report.hits.push({ text, strays: r.strays, at: r.at })
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

console.log(JSON.stringify({ ...report, hitCount: report.hits.length }, null, 2))
