/* CDP smoke for the terminal's rows against the pane (#146, TROW-01..11).
 * Layout has no honest unit test, so this measures the running dev app:
 *   rows  the pane is swept through consecutive heights at DPR 1, 1.25 and 1.5.
 *         At each probe the terminal's rows equal the rows that fit in the
 *         height the terminal really has (TROW-02), its last row's bottom and
 *         last column's right edge are inside the pane's visible box (TROW-03,
 *         TROW-04), and the program in the session reads those rows and the
 *         terminal's columns from its console (TROW-05)
 *   cols  consecutive widths at a fixed height, at each DPR: the column count
 *         equals a baseline recorded on the build before the fix (TROW-11),
 *         and the last column stays inside the visible box (TROW-04)
 *   look  the box the terminal opens into is inset 8/10/8/10 from the pane,
 *         the first row starts at (10, 8) and the copy chip sits 14 px from the
 *         right and 10 px from the top (TROW-07)
 *   dpr   at 8 fixed heights, the display scale steps 1 → 1.25 → 1.5 → 2 → 1
 *         with the CSS height unchanged: after the first change and after every
 *         later one, the rows checks hold with the new cell (TROW-09, TROW-10);
 *         then, after switching to a second session and back three times, one
 *         more change still refits, with no error in the renderer console
 *
 * The terminal draws on the WebGL renderer (design.md §Renderer Amendment), so
 * nothing about its rows is in the DOM. The cell is measured the way xterm
 * measures it, from the pane's font, and a guard requires the screen's size to
 * be an exact multiple of that cell at every probe. The program's view of the
 * console comes from a fill script whose last row prints `ROWS=<n> COLS=<m>`,
 * read from the session's output stream.
 *
 * Every check aggregates its probes and lists the failing ones. Guards fail the
 * run too: a sweep that never changes the row count, skips a remainder of the
 * cell height or reads a renderer other than WebGL proves nothing.
 *
 * NOT automatable here: right-click, Ctrl+click and file drop inside the
 * padding (TROW-08), and the look in both themes; those are hand checks.
 *
 * The sessions are two Ad-hoc `node` processes, the fill script and an idle
 * one to switch to, never a registry agent. It runs only on its own throwaway
 * data:
 *   1. node scripts/smoke-terminal-rows.mjs --seed
 *        writes a new directory under %TEMP% with a config registering one
 *        fictional workspace `rows-smoke` and the fill script; prints the
 *        launch line
 *   2. npm run dev -- -- "--user-data-dir=<that directory>" --remote-debugging-port=9222
 *        --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
 *        --disable-background-timer-throttling
 *   3. node scripts/smoke-terminal-rows.mjs
 *        refuses with `not running on the seeded data` unless the app shows
 *        exactly the seeded workspace; on a pass it closes the app and deletes
 *        the directory, on a failure it leaves both and prints the directory
 *
 * SMOKE_ONLY=rows|cols|look|dpr runs one section after the same setup.
 * SMOKE_BASELINE=write with SMOKE_ONLY=cols records the column count per probed
 * viewport in %TEMP%/playground-smoke-rows-cols.json instead of comparing. It is
 * recorded once on the build before the fix; every later `cols` run compares
 * against it. SMOKE_REPORT=1 adds the predicted-model columns of design.md
 * §Predicted Model to the rows table.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const ONLY = process.env.SMOKE_ONLY ?? null
const SECTIONS = ['rows', 'cols', 'look', 'dpr']
const WRITE_BASELINE = process.env.SMOKE_BASELINE === 'write'
const REPORT = process.env.SMOKE_REPORT === '1'
const TEMP = realpathSync.native(tmpdir())
const POINTER = join(TEMP, 'playground-smoke-rows.last')
const BASELINE = join(TEMP, 'playground-smoke-rows-cols.json')
const WORKSPACE = 'rows-smoke'
const TITLE = 'rows-smoke fill'
const OTHER_TITLE = 'rows-smoke idle'
// TerminalPane's font, pinned: a change there must fail the geometry guard,
// not be followed silently.
const FONT = "13px 'Cascadia Mono', Consolas, 'JetBrains Mono', monospace"
const TOL = 0.5
// Sweep shape (design.md §Sections). Widths stay under the launch window's.
const ROWS_WIDTH = 1200
const ROWS_FROM = 600
const COLS_HEIGHT = 640
const COLS_TO = 1200
const DPRS = [1, 1.25, 1.5]

if (ONLY !== null && !SECTIONS.includes(ONLY)) {
  console.error(`SMOKE_ONLY must be one of ${SECTIONS.join(', ')}`)
  process.exit(1)
}
if (WRITE_BASELINE && ONLY !== 'cols') {
  console.error('SMOKE_BASELINE=write runs only with SMOKE_ONLY=cols')
  process.exit(1)
}

// The fill script: one line per row, the console size on the last one, no
// trailing newline. Node caches the console size and refreshes it only on a
// resize signal, which does not reach it under ConPTY, so it re-reads the size
// itself (`_refreshSize`) and polls.
const FILL_SCRIPT = `let last = ''
const draw = () => {
  process.stdout._refreshSize?.()
  const [cols, rows] = process.stdout.getWindowSize()
  const key = cols + 'x' + rows
  if (key === last) return
  last = key
  let out = '\\x1b[?25l\\x1b[2J'
  for (let i = 1; i < rows; i++) out += '\\x1b[' + i + ';1Hrow ' + i
  out += '\\x1b[' + rows + ';1HROWS=' + rows + ' COLS=' + cols + ' LAST'
  process.stdout.write(out)
}
draw()
process.stdout.on('resize', draw)
setInterval(draw, 100)
`

if (process.argv.includes('--seed')) {
  const dir = join(TEMP, `playground-smoke-rows-${Date.now()}`)
  if (existsSync(dir)) {
    console.error(`Seed directory already exists, nothing written: ${dir}`)
    process.exit(1)
  }
  const ws = join(dir, WORKSPACE)
  mkdirSync(ws, { recursive: true })
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({
      workspaces: [{ id: ws.toLowerCase(), path: ws, displayName: WORKSPACE }],
      ui: { theme: 'dark', direction: 'agents', defaultShell: 'pwsh' }
    })
  )
  writeFileSync(join(dir, 'fill-rows.mjs'), FILL_SCRIPT)
  writeFileSync(POINTER, dir)
  console.log(`Seeded ${dir}`)
  console.log(
    `Launch: npm run dev -- -- "--user-data-dir=${dir}" --remote-debugging-port=${PORT} --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`
  )
  process.exit(0)
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
    returnByValue: true
  })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

const invoke = (channel, req) =>
  evaluate(
    `window.api.invoke(${JSON.stringify(channel)}${req === undefined ? '' : `, ${JSON.stringify(req)}`})`
  )

async function waitFor(expression, what, tries = 40) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  )
}

/** Fails `name` with the listed probes, or passes when none fails. */
function checkAll(name, probes, failing, describe) {
  const bad = probes.filter(failing)
  check(
    name,
    probes.length > 0 && bad.length === 0,
    probes.length === 0
      ? 'no probes'
      : bad.length === 0
        ? `${probes.length} probes`
        : `${bad.length}/${probes.length} fail: ${bad.slice(0, 8).map(describe).join('; ')}`
  )
}

// One reading of the terminal against its pane, evaluated in the page.
const READ = `(() => {
  const pane = document.querySelector('.terminal-pane')
  const xterm = pane?.querySelector('.xterm')
  const screen = xterm?.querySelector('.xterm-screen')
  if (!screen) return null
  const parent = xterm.parentElement
  const dpr = window.devicePixelRatio
  const ctx = new OffscreenCanvas(1, 1).getContext('2d')
  ctx.font = ${JSON.stringify(FONT)}
  const m = ctx.measureText('W')
  const dch = Math.ceil((m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) * dpr)
  const dcw = Math.floor(m.width * dpr)
  const h = dch / dpr
  const w = dcw / dpr
  const sh = parseFloat(screen.style.height)
  const sw = parseFloat(screen.style.width)
  const rows = Math.round(sh / h)
  const cols = Math.round(sw / w)
  const webgl =
    !xterm.querySelector('.xterm-rows') &&
    [...screen.querySelectorAll('canvas')].some((c) => !c.classList.contains('xterm-link-layer'))
  const px = (v) => parseFloat(v) || 0
  const box = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return {
      border: { top: r.top, right: r.right, bottom: r.bottom, left: r.left },
      padding: {
        top: r.top + px(s.borderTopWidth),
        right: r.right - px(s.borderRightWidth),
        bottom: r.bottom - px(s.borderBottomWidth),
        left: r.left + px(s.borderLeftWidth)
      },
      content: {
        top: r.top + px(s.borderTopWidth) + px(s.paddingTop),
        right: r.right - px(s.borderRightWidth) - px(s.paddingRight),
        bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom),
        left: r.left + px(s.borderLeftWidth) + px(s.paddingLeft)
      },
      padBottom: px(s.paddingBottom)
    }
  }
  // The viewport, cut by the padding box of every ancestor that clips.
  const visible = { bottom: window.innerHeight, right: window.innerWidth }
  for (let el = screen.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const s = getComputedStyle(el)
    const b = box(el).padding
    if (s.overflowY !== 'visible') visible.bottom = Math.min(visible.bottom, b.bottom)
    if (s.overflowX !== 'visible') visible.right = Math.min(visible.right, b.right)
  }
  const pb = box(pane).border
  const cb = box(parent)
  const sr = screen.getBoundingClientRect()
  const chip = pane.querySelector('.terminal-copied')?.getBoundingClientRect() ?? null
  return {
    dpr,
    vh: window.innerHeight,
    vw: window.innerWidth,
    parentClass: parent.className,
    c: cb.content.bottom - cb.content.top,
    computedHeight: getComputedStyle(parent).height,
    padBottom: cb.padBottom,
    h,
    w,
    rows,
    cols,
    webgl,
    exact: Math.round(rows * h) === sh && Math.round(cols * w) === sw,
    mq: matchMedia('(resolution: ' + dpr + 'dppx)').matches,
    lastBottom: sr.top + rows * h,
    lastRight: sr.left + cols * w,
    visible,
    inset: {
      top: cb.content.top - pb.top,
      right: pb.right - cb.content.right,
      bottom: pb.bottom - cb.content.bottom,
      left: cb.content.left - pb.left
    },
    origin: { left: sr.left - pb.left, top: sr.top - pb.top },
    chip: chip && { right: pb.right - chip.right, top: chip.top - pb.top }
  }
})()`

// The program's view of the console: the newest marker in the captured stream.
const MARKER = `(() => {
  const all = [...window.__rowsSmoke.data.matchAll(/ROWS=(\\d+) COLS=(\\d+)/g)]
  const last = all[all.length - 1]
  return last ? { rows: Number(last[1]), cols: Number(last[2]) } : null
})()`

const nextFrames = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`

/** Resizes the viewport and waits for the terminal and the program to agree. */
async function probe(width, height, dpr) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: false
  })
  // Probes are labelled with the ratio asked for: CDP hands the page a float32
  // of it (1.25 reads 1.2499999701976776, 1 reads 1.0000000298023224), and xterm
  // sizes its cell from that page value, which `READ` keeps as `pageDpr`.
  const asked = { dpr, pageDpr: null }
  const end = Date.now() + 3000
  let last = null
  let reading = null
  let marker = null
  while (Date.now() < end) {
    await evaluate(nextFrames)
    reading = await evaluate(READ)
    if (reading !== null) asked.pageDpr = reading.dpr
    marker = await evaluate(MARKER)
    const same =
      last !== null && reading !== null && last.rows === reading.rows && last.cols === reading.cols
    if (
      same &&
      reading.vh === height &&
      reading.exact &&
      Math.abs(reading.dpr - dpr) < 1e-6 &&
      marker?.rows === reading.rows &&
      marker?.cols === reading.cols
    ) {
      return { ...reading, ...asked, ptyRows: marker.rows, ptyCols: marker.cols, settled: true }
    }
    last = reading
    await sleep(50)
  }
  return {
    ...reading,
    ...asked,
    ptyRows: marker?.rows ?? null,
    ptyCols: marker?.cols ?? null,
    settled: false
  }
}

// Rows that fit in the content height c (TROW-02). At a non-integer ratio
// xterm rounds its canvas to whole device pixels, so a count whose total height
// is within 0.5 px of the bound also passes.
const fitRows = (p) => Math.floor(Math.floor(p.c + 1e-6) / p.h)
const rowsOk = (p, rows) =>
  rows === fitRows(p) ||
  (p.dpr % 1 !== 0 && rows === fitRows(p) + 1 && rows * p.h <= Math.floor(p.c + 1e-6) + TOL)
const lastRowInside = (p) => p.lastBottom <= p.visible.bottom + TOL
const lastColInside = (p) => p.lastRight <= p.visible.right + TOL
const f1 = (n) => (n === null || n === undefined ? '-' : Number(n).toFixed(1))
const at = (p) => `${p.vw}x${p.vh}@${p.dpr}`

/** Requires every probe to read the WebGL renderer with an exact cell model. */
function geometryGuard(label, probes) {
  checkAll(
    `guard (${label}): WebGL renderer, screen an exact multiple of the measured cell, settled`,
    probes,
    (p) => !p.webgl || !p.exact || !p.settled,
    (p) => `${at(p)} webgl=${p.webgl} exact=${p.exact} settled=${p.settled}`
  )
}

async function rowsSection() {
  console.log('\n— rows —')
  const all = []
  for (const dpr of DPRS) {
    // Warm-up at another height, discarded: the first kept probe must not
    // depend on the order of xterm's re-measure and the observer.
    await probe(ROWS_WIDTH, ROWS_FROM - 40, dpr)
    const first = await probe(ROWS_WIDTH, ROWS_FROM, dpr)
    const count = dpr === 1 ? Math.max(20, Math.ceil(first.h) + 3) : 20
    const probes = [first]
    for (let i = 1; i < count; i++) probes.push(await probe(ROWS_WIDTH, ROWS_FROM + i, dpr))
    all.push(...probes)
  }
  console.log(
    `  dpr   vh       c  c%h      h rows  fit pty  cols lastB-visB lastR-visR parent${REPORT ? '  addon clipModel  clip' : ''}`
  )
  for (const p of all) {
    const clip = Math.max(0, p.lastBottom - p.visible.bottom)
    const extra = REPORT
      ? `  ${String(Math.floor(parseInt(p.computedHeight, 10) / p.h)).padStart(5)} ${f1(Math.max(0, p.rows * p.h - p.c - p.padBottom)).padStart(9)} ${f1(clip).padStart(5)}`
      : ''
    console.log(
      `  ${String(p.dpr).padEnd(4)} ${String(p.vh).padStart(4)} ${f1(p.c).padStart(7)} ${String(Math.floor(p.c + 1e-6) % Math.ceil(p.h)).padStart(4)} ${p.h.toFixed(3).padStart(6)} ${String(p.rows).padStart(4)} ${String(fitRows(p)).padStart(4)} ${String(p.ptyRows).padStart(3)} ${String(p.cols).padStart(5)} ${f1(p.lastBottom - p.visible.bottom).padStart(10)} ${f1(p.lastRight - p.visible.right).padStart(10)} ${p.parentClass}${extra}`
    )
  }
  geometryGuard('rows', all)

  // Guards against a sweep that cannot fail.
  const dpr1 = all.filter((p) => p.dpr === 1)
  const hCeil = Math.ceil(dpr1[0]?.h ?? 0)
  const remainders = new Set(dpr1.map((p) => Math.floor(p.c + 1e-6) % hCeil))
  check(
    'guard: at DPR 1 the probed heights cover every remainder of the cell height',
    hCeil > 0 && remainders.size === hCeil,
    `${remainders.size}/${hCeil} remainders`
  )
  const steps = []
  for (const dpr of DPRS) {
    const ps = all.filter((p) => p.dpr === dpr)
    for (let i = 1; i < ps.length; i++) steps.push({ a: ps[i - 1], b: ps[i] })
  }
  checkAll(
    'guard: each probe grows the content height by 1 px (DPR 1: exactly; scaled: within 0.5 px)',
    steps,
    ({ a, b }) =>
      a.dpr === 1
        ? Math.floor(b.c + 1e-6) - Math.floor(a.c + 1e-6) !== 1
        : Math.abs(b.c - a.c - 1) > TOL,
    ({ a, b }) => `${at(a)}→${b.vh}: ${f1(a.c)}→${f1(b.c)}`
  )
  check(
    'guard: the rows change across the DPR 1 sweep, and the program follows them',
    new Set(dpr1.map((p) => p.rows)).size > 1 && new Set(dpr1.map((p) => p.ptyRows)).size > 1,
    `rows ${[...new Set(dpr1.map((p) => p.rows))].join(',')}; program ${[...new Set(dpr1.map((p) => p.ptyRows))].join(',')}`
  )

  checkAll(
    'TROW-02: the terminal has the rows that fit in its content height',
    all,
    (p) => !rowsOk(p, p.rows),
    (p) => `${at(p)} rows ${p.rows}, fit ${fitRows(p)}`
  )
  checkAll(
    "TROW-03: the last row's bottom is inside the pane's visible box",
    all,
    (p) => !lastRowInside(p),
    (p) => `${at(p)} ${f1(p.lastBottom - p.visible.bottom)} px below`
  )
  checkAll(
    "TROW-04: the last column's right edge is inside the pane's visible box",
    all,
    (p) => !lastColInside(p),
    (p) => `${at(p)} ${f1(p.lastRight - p.visible.right)} px right`
  )
  checkAll(
    "TROW-05: the program reads the rows that fit and the terminal's columns",
    all,
    (p) => !p.settled || !rowsOk(p, p.ptyRows) || p.ptyCols !== p.cols,
    (p) => `${at(p)} program ${p.ptyRows}x${p.ptyCols}, fit ${fitRows(p)}, cols ${p.cols}`
  )

  if (REPORT) {
    // design.md §Predicted Model and its stop rule, printed for T1.
    const addon = (p) => Math.floor(parseInt(p.computedHeight, 10) / p.h)
    const clip = (p) => Math.max(0, p.lastBottom - p.visible.bottom)
    const clipModel = (p) => Math.max(0, p.rows * p.h - p.c - p.padBottom)
    console.log(
      '  model: parent is .terminal-pane at every probe:',
      all.every((p) => p.parentClass === 'terminal-pane')
    )
    console.log(
      '  model: rows = ⌊parseInt(height) / h⌋ at every probe:',
      all.every((p) => p.rows === addon(p))
    )
    console.log(
      '  model: |clip − clipModel| ≤ 0.5 at every probe:',
      all.every((p) => Math.abs(clip(p) - clipModel(p)) <= TOL)
    )
    console.log(
      '  model: some probe clips the last row:',
      all.some((p) => clip(p) > TOL)
    )
    console.log(
      '  model: the last row fails exactly where clipModel > 0.5:',
      all.every((p) => !lastRowInside(p) === clipModel(p) > TOL)
    )
    console.log(
      '  model: the rows fit fails exactly where ⌊c⌋ mod h ≥ h − 16:',
      all.every((p) => !rowsOk(p, p.rows) === Math.floor(p.c + 1e-6) % p.h >= p.h - 16)
    )
    console.log('  model: last column inside at every probe:', all.every(lastColInside))
  }
}

async function colsSection() {
  console.log(`\n— cols${WRITE_BASELINE ? ' (writing the baseline)' : ''} —`)
  const all = []
  for (const dpr of DPRS) {
    await probe(COLS_TO - 60, COLS_HEIGHT, dpr)
    const last = await probe(COLS_TO, COLS_HEIGHT, dpr)
    const count = Math.max(12, Math.ceil(last.w) + 4)
    const probes = []
    for (let i = count - 1; i > 0; i--) probes.push(await probe(COLS_TO - i, COLS_HEIGHT, dpr))
    probes.push(await probe(COLS_TO, COLS_HEIGHT, dpr))
    all.push(...probes)
  }
  const key = (p) => `${p.vw}x${p.vh}@${p.dpr}`
  console.log('  dpr     vw cols pty      w lastR-visR')
  for (const p of all) {
    console.log(
      `  ${String(p.dpr).padEnd(4)} ${String(p.vw).padStart(5)} ${String(p.cols).padStart(4)} ${String(p.ptyCols).padStart(3)} ${p.w.toFixed(3).padStart(6)} ${f1(p.lastRight - p.visible.right).padStart(10)}`
    )
  }
  geometryGuard('cols', all)
  checkAll(
    'guard: the column count changes across each DPR sweep',
    DPRS.map((dpr) => all.filter((p) => p.dpr === dpr)),
    (ps) => new Set(ps.map((p) => p.cols)).size < 2,
    (ps) => `DPR ${ps[0]?.dpr}: ${ps[0]?.cols}`
  )

  if (WRITE_BASELINE) {
    const cellWidth = Object.fromEntries(
      DPRS.map((dpr) => [dpr, all.find((p) => p.dpr === dpr)?.w])
    )
    const cols = Object.fromEntries(all.map((p) => [key(p), p.cols]))
    writeFileSync(BASELINE, JSON.stringify({ cellWidth, cols }, null, 2))
    console.log(`  baseline written: ${BASELINE} (${all.length} viewports)`)
  } else {
    const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
    if (base === null) {
      check('TROW-11: a column baseline exists', false, `no column baseline at ${BASELINE}`)
    } else {
      const drift = DPRS.filter(
        (dpr) =>
          Math.abs((base.cellWidth[dpr] ?? 0) - (all.find((p) => p.dpr === dpr)?.w ?? 0)) > 0.01
      )
      check(
        'guard: the cell width per DPR matches the baseline (same font and machine)',
        drift.length === 0,
        drift.length === 0 ? '' : `differs at DPR ${drift.join(', ')}; rebuild the baseline`
      )
      checkAll(
        "TROW-11: the column count equals the pre-fix build's at the same viewport",
        all,
        (p) => base.cols[key(p)] !== p.cols,
        (p) => `${key(p)} ${p.cols}, baseline ${base.cols[key(p)] ?? 'none'}`
      )
    }
  }
  checkAll(
    "TROW-05: the program reads the terminal's columns",
    all,
    (p) => !p.settled || p.ptyCols !== p.cols,
    (p) => `${key(p)} program ${p.ptyCols}, cols ${p.cols}`
  )
  checkAll(
    "TROW-04: the last column's right edge is inside the pane's visible box",
    all,
    (p) => !lastColInside(p),
    (p) => `${key(p)} ${f1(p.lastRight - p.visible.right)} px right`
  )
}

async function lookSection() {
  console.log('\n— look —')
  const probes = []
  for (const height of [600, 617, 640]) probes.push(await probe(ROWS_WIDTH, height, 1))
  for (const p of probes) {
    console.log(
      `  vh ${p.vh}: inset ${[p.inset.top, p.inset.right, p.inset.bottom, p.inset.left].map(f1).join('/')}, origin (${f1(p.origin.left)}, ${f1(p.origin.top)}), chip right ${f1(p.chip?.right)} top ${f1(p.chip?.top)}`
    )
  }
  const near = (a, b) => typeof a === 'number' && Math.abs(a - b) <= TOL
  checkAll(
    "TROW-07: the terminal's box is inset 8/10/8/10 from the pane",
    probes,
    (p) =>
      !near(p.inset.top, 8) ||
      !near(p.inset.right, 10) ||
      !near(p.inset.bottom, 8) ||
      !near(p.inset.left, 10),
    (p) =>
      `vh ${p.vh}: ${[p.inset.top, p.inset.right, p.inset.bottom, p.inset.left].map(f1).join('/')}`
  )
  checkAll(
    'TROW-07: the first row starts at (10, 8) from the pane',
    probes,
    (p) => !near(p.origin.left, 10) || !near(p.origin.top, 8),
    (p) => `vh ${p.vh}: (${f1(p.origin.left)}, ${f1(p.origin.top)})`
  )
  checkAll(
    'TROW-07: the copy chip sits 14 px from the right and 10 px from the top',
    probes,
    (p) => !near(p.chip?.right, 14) || !near(p.chip?.top, 10),
    (p) => `vh ${p.vh}: right ${f1(p.chip?.right)} top ${f1(p.chip?.top)}`
  )
}

async function dprSection() {
  console.log('\n— dpr —')
  // Heights spread over the cell's remainders; the scale changes at each one
  // with the CSS size held, so only a refit on the scale change can follow.
  const heights = [600, 603, 607, 611, 614, 618, 622, 625]
  const factors = [1, 1.25, 1.5, 2, 1]
  const all = []
  for (const height of heights) {
    for (let step = 0; step < factors.length; step++) {
      all.push({ ...(await probe(ROWS_WIDTH, height, factors[step])), step })
    }
  }
  console.log('  vh step  dpr      h rows  fit pty lastB-visB')
  for (const p of all) {
    console.log(
      `  ${String(p.vh).padStart(4)} ${String(p.step).padStart(4)} ${String(p.dpr).padEnd(4)} ${p.h.toFixed(3).padStart(6)} ${String(p.rows).padStart(4)} ${String(fitRows(p)).padStart(4)} ${String(p.ptyRows).padStart(3)} ${f1(p.lastBottom - p.visible.bottom).padStart(10)}`
    )
  }

  // Guards first: the page must really see each scale, or nothing below can fail.
  checkAll(
    'guard: the page reports each requested ratio and its resolution query matches',
    all,
    (p) => Math.abs(p.pageDpr - p.dpr) > 1e-6 || !p.mq,
    (p) => `${at(p)} page ${p.pageDpr} query ${p.mq}`
  )
  const cells = new Set(all.map((p) => p.h.toFixed(4)))
  check('guard: the cell height differs between scales', cells.size >= 2, [...cells].join(', '))
  const moved = heights.filter(
    (height) => new Set(all.filter((p) => p.vh === height).map(fitRows)).size > 1
  )
  check(
    'guard: at some height the rows that fit change between scales',
    moved.length > 0,
    `${moved.length}/${heights.length} heights`
  )
  geometryGuard('dpr', all)

  const holds = (p) => rowsOk(p, p.rows) && lastRowInside(p) && p.settled && rowsOk(p, p.ptyRows)
  const describe = (p) =>
    `${at(p)} step ${p.step}: rows ${p.rows}, fit ${fitRows(p)}, program ${p.ptyRows}, ${f1(p.lastBottom - p.visible.bottom)} px below`
  checkAll(
    'TROW-09: after a scale change the rows fit, the last row is inside and the program follows',
    all.filter((p) => p.step === 1),
    (p) => !holds(p),
    describe
  )
  checkAll(
    'TROW-10: after every later scale change the same holds',
    all.filter((p) => p.step >= 2),
    (p) => !holds(p),
    describe
  )

  // Edge case: panes switched away from must leave no scale listener behind.
  // A leaked one would refit a disposed terminal, which xterm reports as an
  // error, and the selected pane must still refit.
  const errors = []
  const onEvent = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Runtime.exceptionThrown')
      errors.push(msg.params.exceptionDetails?.exception?.description ?? 'exception')
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  }
  ws.addEventListener('message', onEvent)
  await probe(ROWS_WIDTH, 611, 1)
  for (let i = 0; i < 3; i++) {
    await selectRow(OTHER_TITLE)
    await sleep(400)
    await selectRow(TITLE)
    await sleep(400)
  }
  const before = await probe(ROWS_WIDTH, 611, 1)
  // Counts the refits scheduled for the scale change. Each mounted pane
  // schedules its own (`requestAnimationFrame(sendResize)`), so a pane that
  // unmounted without removing its listener adds one (P2 AC 3: no refit runs
  // after unmount). The dev build keeps function names.
  await evaluate(`(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.__rowsSmoke.refits = 0
    window.__rowsSmoke.raf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => {
      if (cb?.name === 'sendResize') window.__rowsSmoke.refits++
      return raf(cb)
    }
    return true
  })()`)
  const after = await probe(ROWS_WIDTH, 611, 1.5)
  const refits = await evaluate(`(() => {
    window.requestAnimationFrame = window.__rowsSmoke.raf
    return window.__rowsSmoke.refits
  })()`)
  ws.removeEventListener('message', onEvent)
  console.log(
    `  after 3 switches: dpr 1 rows ${before.rows} (fit ${fitRows(before)}), dpr 1.5 rows ${after.rows} (fit ${fitRows(after)}), program ${after.ptyRows}`
  )
  check(
    'TROW-10: after switching sessions three times, a scale change still refits the selected pane',
    holds(before) && holds(after) && fitRows(before) !== fitRows(after),
    `rows ${before.rows} → ${after.rows}, fit ${fitRows(before)} → ${fitRows(after)}`
  )
  check(
    'TROW-10: the scale change schedules exactly one refit, from the selected pane',
    refits === 1,
    `${refits} refits`
  )
  check(
    'TROW-10: no error in the renderer console across the switches and the scale change',
    errors.length === 0,
    errors.slice(0, 3).join(' | ')
  )
}

const selectRow = (title) =>
  evaluate(
    `([...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').startsWith(${JSON.stringify(title)})).click(), true)`
  )

const target = await pageTarget()
ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send('Runtime.enable')
await send('Page.enable')
await waitFor(`typeof window.api !== 'undefined'`, 'the preload bridge')

// Refuse anything but the seeded directory, before a session or a write.
const seededDir = existsSync(POINTER) ? readFileSync(POINTER, 'utf8').trim() : null
const workspaces = (await invoke('config:get')).workspaces ?? []
if (
  !seededDir ||
  workspaces.length !== 1 ||
  workspaces[0].path.toLowerCase() !== join(seededDir, WORKSPACE).toLowerCase()
) {
  console.error(
    `not running on the seeded data — ${!seededDir ? `no ${POINTER}` : `workspaces ${JSON.stringify(workspaces.map((w) => w.displayName))}`}; run with --seed first`
  )
  ws.close()
  process.exit(1)
}

let sessionId = null
let otherId = null
try {
  const view = await invoke('sessions:spawn', {
    agentName: 'Ad-hoc',
    cwd: join(seededDir, WORKSPACE),
    adhocCommand: `node '${join(seededDir, 'fill-rows.mjs')}'`
  })
  sessionId = view.id
  await invoke('sessions:rename', { id: sessionId, title: TITLE })
  const other = await invoke('sessions:spawn', {
    agentName: 'Ad-hoc',
    cwd: join(seededDir, WORKSPACE),
    adhocCommand: `node -e 'setInterval(() => {}, 1000)'`
  })
  otherId = other.id
  await invoke('sessions:rename', { id: otherId, title: OTHER_TITLE })
  // A session spawned over IPC reaches the rail on the next list; a reload
  // lists it. It reloads into Tree, so no pane attaches before the capture.
  await invoke('config:patch', { ui: { direction: 'tree' } })
  await send('Page.reload')
  await sleep(1500)
  await waitFor(`typeof window.api !== 'undefined'`, 'the preload bridge after reload')
  await waitFor(`document.querySelector('.topbar-segment') !== null`, 'the top bar')
  // Capture the stream before the pane mounts, so the replay on attach lands too.
  await evaluate(`(() => {
    window.__rowsSmoke = { data: '' }
    window.api.on('session:data', (p) => {
      if (p.id !== ${JSON.stringify(sessionId)}) return
      window.__rowsSmoke.data = (window.__rowsSmoke.data + p.data).slice(-20000)
    })
    return true
  })()`)
  await evaluate(
    `([...document.querySelectorAll('.topbar-segment')].find((b) => b.textContent.trim() === 'Agents').click(), true)`
  )
  await waitFor(
    `[...document.querySelectorAll('.rail-row')].some((r) => (r.title || '').startsWith(${JSON.stringify(TITLE)}))`,
    'the fill session in the rail'
  )
  await evaluate(
    `([...document.querySelectorAll('.rail-row')].find((r) => (r.title || '').startsWith(${JSON.stringify(TITLE)})).click(), true)`
  )
  await waitFor(`${MARKER} !== null`, 'the fill marker', 80).catch(async (err) => {
    console.error(
      `stream tail: ${JSON.stringify(await evaluate(`window.__rowsSmoke.data.slice(-400)`))}`
    )
    throw err
  })

  if (ONLY === null || ONLY === 'rows') await rowsSection()
  if (ONLY === null || ONLY === 'cols') await colsSection()
  if (ONLY === null || ONLY === 'look') await lookSection()
  if (ONLY === null || ONLY === 'dpr') await dprSection()
} finally {
  await send('Emulation.clearDeviceMetricsOverride').catch(() => {})
  for (const id of [sessionId, otherId]) {
    if (id === null) continue
    await invoke('sessions:stop', { id }).catch(() => {})
    await invoke('sessions:remove', { id }).catch(() => {})
  }
}

const failed = checks.filter((c) => !c.ok)
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed${ONLY ? ` (${ONLY} only)` : ''}`
)
if (failed.length > 0 || checks.length === 0) {
  console.log(`Seeded data left in place for inspection: ${seededDir}`)
  ws.close()
  process.exit(1)
}

// A pass: close the app, which holds the profile open, then delete its data.
if (
  !/^playground-smoke-rows-\d+$/.test(seededDir.split('\\').pop()) ||
  !seededDir.startsWith(TEMP)
) {
  console.error(`Not deleting ${seededDir}: not a seeded directory under ${TEMP}`)
  process.exit(1)
}
const browser = new WebSocket(
  (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl
)
await new Promise((resolve) => browser.addEventListener('open', resolve))
browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
for (let i = 0; i < 40; i++) {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/version`)
    await sleep(250)
  } catch {
    break
  }
}
rmSync(seededDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 })
rmSync(POINTER, { force: true })
const leftBehind = [seededDir, POINTER].filter((p) => existsSync(p))
if (leftBehind.length > 0) {
  console.error(`Checks passed, but clean-up left: ${leftBehind.join(', ')}`)
  process.exit(1)
}
console.log(`App closed; deleted ${seededDir} and ${POINTER}`)
process.exit(0)
