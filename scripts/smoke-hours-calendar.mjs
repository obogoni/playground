/* CDP smoke for the Hours week calendar (HCAL-01..26). Proves, against a running
 * dev app, what the pure `hours-calendar` unit tests cannot reach — the rendered
 * grid, its buttons, the drawer and the selection wiring:
 *   1. the current week shows Monday to Friday in order, and Saturday or Sunday
 *      only when that day holds time (HCAL-01, HCAL-02)
 *   2. column headers are buttons named `dd/MM/yyyy (ddd), XhMM`; exactly one is
 *      today; the view opens with nothing selected and no drawer (HCAL-03, 04,
 *      16, 20)
 *   3. two sessions in different folders running at once are two bars side by
 *      side; a sub-minute bar keeps its minimum height; running bars are ongoing
 *      and say `now` (HCAL-10, HCAL-12, HCAL-23)
 *   4. hovering a bar shows its duration, range and label; the legend chips
 *      list both folders with outlined swatches (HCAL-21, HCAL-22)
 *   5. a header click opens the drawer on its day; a bar click opens it on its
 *      day and focuses and expands its block; one day card only, with the day's
 *      total, its counts and a swatch matching each bar (HCAL-14, 15, 18, 19)
 *   6. a running bar grows at the one-minute refresh and keeps its colour
 *      (HCAL-23, HCAL-24)
 *   7. at 1100 × 640 the page does not scroll, with or without the drawer; the
 *      X and Esc close the drawer, and Esc inside a period's field does not
 *      (HCAL-25, HCAL-26)
 *   8. ◀ closes the drawer; ▶ shows five dimmed, empty future columns that say
 *      there is no time; This week returns with nothing selected (HCAL-05, 06,
 *      07, 16)
 *   9. a day with no time opens a drawer that says so; time recorded on that
 *      open day fills it, and deleting that time closes it (HCAL-17, HCAL-27,
 *      edge case)
 *  10. at 1100 × 640 the seeded Sunday, taller than the drawer, stays inside its
 *      card: the card reaches past its last group, the drawer scrolls it as one
 *      unit and the page does not scroll; a short day still fills the drawer
 *      (HDRW-01..04)
 *
 * NOT automatable here, all from the same fact — ad-hoc sessions in a non-git
 * cwd carry no task: the colours of the task slots (HCAL-11 and the frozen
 * ranking are unit-tested) and the summary line's `N tasks` wording, since
 * every fixture day counts zero tasks and that branch never renders. Nor is
 * keyboard focus showing the tooltip, nor the two-theme look.
 *
 * The sessions are ad-hoc `pwsh` in C:/Windows and C:/Windows/System32 — never a
 * registry agent, which on a machine with the CLI installed starts a real agent.
 * The script restores the owner's direction and theme and deletes every period
 * it created.
 *
 * It runs only on its own throwaway data, never on the owner's hours:
 *   1. node scripts/smoke-hours-calendar.mjs --seed
 *        writes a tall past Sunday into a new directory under %TEMP% and
 *        prints the next command
 *   2. npm run dev -- -- "--user-data-dir=<that directory>" --remote-debugging-port=9222
 *   3. node scripts/smoke-hours-calendar.mjs
 *        refuses with `not running on the seeded data` unless every seeded
 *        period is in the app; on a pass it closes the app and deletes the
 *        directory, on a failure it leaves both and prints the directory
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const FOLDERS = ['C:\\Windows', 'C:\\Windows\\System32']

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

const pad = (n) => String(n).padStart(2, '0')
const dayHeader = (d) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} (${WEEKDAYS[d.getDay()]})`
const today = new Date()
const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
const sinceMonday = (today.getDay() + 6) % 7
/** Local midnight of day `offset` (0 = Monday) of the week `weeks` from this one. */
const weekDay = (weeks, offset) =>
  new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - sinceMonday + 7 * weeks + offset
  )

// DOM probes, evaluated in the page.
const HEADS = `[...document.querySelectorAll('.hcal-head')]`
const headLabels = () => evaluate(`${HEADS}.map(h => h.getAttribute('aria-label'))`)
const pressedLabel = () =>
  evaluate(
    `${HEADS}.find(h => h.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label') ?? null`
  )
const detailTitle = () =>
  evaluate(`document.querySelector('.hours-day-title')?.textContent ?? null`)
const emptyTexts = () =>
  evaluate(`[...document.querySelectorAll('.hours-empty')].map(e => e.textContent)`)
const drawerOpen = () => evaluate(`document.querySelector('.hours-drawer') !== null`)
const clickHead = (header) =>
  evaluate(
    `${HEADS}.find(h => h.getAttribute('aria-label').startsWith(${JSON.stringify(header)})).click(), true`
  )
/** Whether the Hours body fits the viewport: it does not scroll and the grid ends inside. */
const fits = () =>
  evaluate(
    `(() => { const b = document.querySelector('.hours-body'); const g = document.querySelector('.hcal').getBoundingClientRect(); return { scrolls: b.scrollHeight > b.clientHeight + 1, gridBottom: Math.round(g.bottom), gridWidth: Math.round(g.width), height: innerHeight } })()`
  )
const barIn = (header, folder) =>
  `(() => { const i = ${HEADS}.findIndex(h => h.getAttribute('aria-label').startsWith(${JSON.stringify(header)})); const col = document.querySelectorAll('.hcal-col')[i]; return [...(col?.querySelectorAll('.hcal-bar') ?? [])].find(b => b.getAttribute('aria-label').startsWith(${JSON.stringify(`No task · ${folder}, `)})) ?? null })()`
const rectOf = (bar) =>
  evaluate(
    `(() => { const b = ${bar}; if (!b) return null; const r = b.getBoundingClientRect(); const c = b.parentElement.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, colW: c.width, cls: b.className, label: b.getAttribute('aria-label'), heightVar: b.style.getPropertyValue('--bar-height'), bg: getComputedStyle(b).borderColor + '|' + getComputedStyle(b).backgroundColor } })()`
  )
const nav = (label) =>
  evaluate(
    `[...document.querySelectorAll('.hours-nav-btn')].find(b => (b.getAttribute('aria-label') ?? b.textContent) === ${JSON.stringify(label)}).click(), true`
  )

const overlapsDay = (snapshot, day) => {
  const start = day.getTime()
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
  const now = Date.now()
  return [
    ...snapshot.periods.map((p) => [Date.parse(p.start), Date.parse(p.end)]),
    ...snapshot.open.map((p) => [Date.parse(p.start), now])
  ].some(([s, e]) => s < end && e > start)
}

// --seed: a throwaway userData directory holding one tall day, the previous
// week's Sunday (always past and complete, and outside every other step's
// weeks). Fictitious tasks only: the repository is public.
const TEMP = realpathSync.native(tmpdir())
const POINTER = join(TEMP, 'playground-smoke-hours.last')
const SEED_TITLES = [
  'Fix login redirect',
  'Add CSV export',
  'Cache the price list',
  'Retry failed webhooks',
  'Paginate the audit log',
  'Validate invoice dates',
  'Trim the search index',
  'Rename the billing flag',
  'Upgrade the chart library',
  'Localise the error pages',
  'Speed up the report query',
  'Guard the upload size',
  'Archive stale drafts',
  'Fix the timezone offset'
]
const seedId = (i) => `hours-smoke-seed-${String(i + 1).padStart(2, '0')}`

if (process.argv.includes('--seed')) {
  const dir = join(TEMP, `playground-smoke-hours-${Date.now()}`)
  if (existsSync(dir)) {
    console.error(`Seed directory already exists, nothing written: ${dir}`)
    process.exit(1)
  }
  const sunday = weekDay(-1, 6)
  const lines = SEED_TITLES.map((title, i) => {
    const start = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 8, 20 * i)
    const taskId = 9101 + i
    return JSON.stringify({
      v: 1,
      id: seedId(i),
      sessionId: 'hours-smoke-seed',
      agent: 'Ad-hoc',
      cwd: 'C:\\Windows',
      start: start.toISOString(),
      end: new Date(start.getTime() + 20 * 60_000).toISOString(),
      workspacePath: null,
      repoName: 'acme-widgets',
      branch: `feature/${taskId}-seed`,
      taskId,
      taskTitle: title
    })
  })
  mkdirSync(dir)
  writeFileSync(join(dir, 'time-log.jsonl'), lines.join('\n') + '\n')
  writeFileSync(POINTER, dir)
  console.log(`Seeded ${lines.length} periods on ${dayHeader(sunday)} in ${dir}`)
  console.log(`Launch: npm run dev -- -- "--user-data-dir=${dir}" --remote-debugging-port=${PORT}`)
  process.exit(0)
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

// Refuse anything but the seeded directory, before a session or a write.
const seededDir = existsSync(POINTER) ? readFileSync(POINTER, 'utf8').trim() : null
const snapshotIds = new Set((await invoke('time:snapshot')).periods.map((p) => p.id))
const missingSeed = SEED_TITLES.map((_, i) => seedId(i)).filter((id) => !snapshotIds.has(id))
if (!seededDir || missingSeed.length > 0) {
  console.error(
    `not running on the seeded data — ${!seededDir ? `no ${POINTER}` : `${missingSeed.length} seeded periods missing`}; run with --seed first`
  )
  ws.close()
  process.exit(1)
}

const original = (await invoke('config:get')).ui
const before = await invoke('time:snapshot')
const knownPeriods = new Set(before.periods.map((p) => p.id))
const sessionIds = []
const todayHeader = dayHeader(todayMidnight)

try {
  for (const cwd of FOLDERS) {
    const view = await invoke('sessions:spawn', {
      agentName: 'Ad-hoc',
      cwd,
      adhocCommand: 'pwsh -NoLogo -NoProfile'
    })
    sessionIds.push(view.id)
  }
  await sleep(1500)
  await reloadInto('hours')
  await waitFor(`document.querySelector('.hcal') !== null`, 'the calendar')
  await sleep(500)

  // 1. Columns.
  const snap = await invoke('time:snapshot')
  const labels = await headLabels()
  const weekdays = [0, 1, 2, 3, 4].map((i) => dayHeader(weekDay(0, i)))
  check(
    'Monday to Friday head the current week, in order',
    weekdays.every((h, i) => labels[i]?.startsWith(h)),
    labels.map((l) => l.slice(0, 16)).join(' | ')
  )
  const weekendExpected = [5, 6].filter((i) => overlapsDay(snap, weekDay(0, i)))
  const weekendShown = [5, 6].filter((i) =>
    labels.some((l) => l.startsWith(dayHeader(weekDay(0, i))))
  )
  check(
    'a weekend column appears only for a weekend day with time',
    JSON.stringify(weekendExpected) === JSON.stringify(weekendShown) &&
      labels.length === 5 + weekendExpected.length,
    `expected ${weekendExpected}, shown ${weekendShown}`
  )

  // 2. Headers, today and the default selection.
  check(
    'headers are buttons named `dd/MM/yyyy (ddd), XhMM`',
    (await evaluate(`${HEADS}.every(h => h.tagName === 'BUTTON')`)) &&
      labels.every((l) => /^\d{2}\/\d{2}\/\d{4} \(\S+\), \d+h\d{2}$/.test(l))
  )
  const todays = await evaluate(
    `${HEADS}.filter(h => h.classList.contains('today')).map(h => h.getAttribute('aria-label'))`
  )
  check(
    "exactly one header is today's",
    todays.length === 1 && todays[0].startsWith(todayHeader),
    todays.join(' | ')
  )
  check(
    'the view opens with nothing selected and no drawer',
    (await pressedLabel()) === null &&
      !(await drawerOpen()) &&
      (await evaluate(`document.querySelectorAll('.hours-day').length`)) === 0,
    `${await pressedLabel()}`
  )

  // 3. Parallel bars, minimum height, ongoing.
  const [winBar, sysBar] = FOLDERS.map((f) => barIn(todayHeader, f.split('\\').pop()))
  const win = await rectOf(winBar)
  const sys = await rectOf(sysBar)
  check(
    'two parallel sessions are two bars side by side',
    Boolean(win && sys) &&
      (win.x + win.w <= sys.x + 0.5 || sys.x + sys.w <= win.x + 0.5) &&
      win.w < win.colW * 0.6 &&
      sys.w < sys.colW * 0.6,
    win && sys
      ? `x ${win.x.toFixed(1)}+${win.w.toFixed(1)} / ${sys.x.toFixed(1)}+${sys.w.toFixed(1)}`
      : 'missing'
  )
  check(
    'a sub-minute bar keeps its minimum height',
    Boolean(win) && win.h >= 5.5,
    win ? `${win.h.toFixed(1)} px` : 'missing'
  )
  check(
    'running bars are ongoing and end at now',
    Boolean(win && sys) &&
      [win, sys].every(
        (b) => b.cls.includes('ongoing') && /, \d{2}:\d{2}–now, \d+h\d{2}$/.test(b.label)
      ),
    win?.label ?? ''
  )

  // 4. Tooltip and legend.
  await evaluate(`${winBar}.scrollIntoView({ block: 'center' }), true`)
  await sleep(200)
  const hover = await rectOf(winBar)
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: hover.x + hover.w / 2,
    y: hover.y + hover.h / 2
  })
  await sleep(250)
  const tip = await evaluate(
    `(() => { const t = ${winBar}.querySelector('.hcal-tip'); return { shown: getComputedStyle(t).display !== 'none', text: t.textContent } })()`
  )
  check(
    'hovering a bar shows its duration, range and group label',
    tip.shown && /^\d+h\d{2}\d{2}:\d{2}–nowNo task · Windows$/.test(tip.text),
    tip.text
  )
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 })
  const legend = await evaluate(
    `[...document.querySelectorAll('.hleg-chip')].map(r => ({ label: r.querySelector('.hleg-label')?.textContent, outlined: r.querySelector('.hleg-swatch')?.classList.contains('role-no-task') ?? false }))`
  )
  const chipTitles = await evaluate(
    `[...document.querySelectorAll('.hleg-chip')].every(c => c.getAttribute('title') === c.querySelector('.hleg-label').textContent)`
  )
  check('every legend chip carries its full label as its title', chipTitles)
  check(
    'the legend chips list both folders with outlined swatches',
    ['No task · Windows', 'No task · System32'].every((l) =>
      legend.some((e) => e.label === l && e.outlined)
    ),
    legend.map((e) => e.label).join(' | ')
  )

  // 5. Header click and bar click.
  const monday = dayHeader(weekDay(0, 0))
  await clickHead(monday)
  await sleep(200)
  const mondayDetail = (await detailTitle()) ?? (await emptyTexts()).join(' ')
  check(
    'a header click opens the drawer on its day',
    (await pressedLabel())?.startsWith(monday) &&
      (await drawerOpen()) &&
      mondayDetail.includes(monday),
    mondayDetail
  )
  await evaluate(`${winBar}.click(), true`)
  await sleep(300)
  const focused = await evaluate(
    `(() => { const b = document.querySelector('.hours-block.focused'); return b ? { group: b.closest('.hours-group').querySelector('.hours-group-label').textContent, expanded: b.querySelector('.hours-block-line').getAttribute('aria-expanded'), periods: b.querySelectorAll('.period-row').length } : null })()`
  )
  check(
    'a bar click opens the drawer on its day and focuses and expands its block',
    (await pressedLabel())?.startsWith(todayHeader) &&
      (await drawerOpen()) &&
      (await detailTitle()) === todayHeader &&
      focused?.group === 'No task · Windows' &&
      focused.expanded === 'true' &&
      focused.periods >= 1,
    JSON.stringify(focused)
  )

  check(
    'one day card, in the drawer, never the stacked list',
    (await evaluate(`document.querySelectorAll('.hours-day').length`)) === 1 &&
      (await evaluate(`document.querySelectorAll('.hours-drawer .hours-day').length`)) === 1
  )
  const summary = await evaluate(
    `(() => { const d = document.querySelector('.hours-drawer'); const groups = [...d.querySelectorAll('.hours-group')]; const tasks = groups.filter(g => !g.querySelector('.hours-group-label.no-task')).length; return { total: d.querySelector('.hours-day-total').textContent, count: d.querySelector('.hours-day-count').textContent, head: ${HEADS}.find(h => h.getAttribute('aria-pressed') === 'true').getAttribute('aria-label'), tasks, folders: groups.length - tasks, blocks: d.querySelectorAll('.hours-block').length } })()`
  )
  const expectedCount = [
    summary.tasks > 0 ? `${summary.tasks} task${summary.tasks === 1 ? '' : 's'}` : null,
    summary.folders > 0 ? `${summary.folders} folder${summary.folders === 1 ? '' : 's'}` : null,
    `${summary.blocks} block${summary.blocks === 1 ? '' : 's'}`
  ]
    .filter(Boolean)
    .join(' · ')
  check(
    "the summary line states the day's total and what it holds",
    summary.head.endsWith(`, ${summary.total}`) && summary.count === expectedCount,
    `${summary.total} / ${summary.count} (expected ${expectedCount})`
  )
  const swatches = await evaluate(
    `(() => { const roleOf = el => [...el.classList].find(c => c.startsWith('role-')); const rows = [...document.querySelectorAll('.hours-drawer .hours-group')].map(g => ({ label: g.querySelector('.hours-group-label').textContent, role: roleOf(g.querySelector('.hours-group-swatch')) })); const bars = [...document.querySelectorAll('.hcal-col.selected .hcal-bar')].map(b => ({ label: b.getAttribute('aria-label').split(', ')[0], role: roleOf(b) })); return rows.map(r => [r.role, bars.find(b => b.label === r.label)?.role ?? 'no-bar']) })()`
  )
  check(
    "each group's swatch wears its bar's colour",
    swatches.length > 0 && swatches.every(([row, bar]) => row === bar),
    JSON.stringify(swatches)
  )

  // 6. Live growth with a stable colour.
  const grow0 = await rectOf(winBar)
  console.log('    waiting 65 s for the live refresh…')
  await sleep(65_000)
  const grow1 = await rectOf(winBar)
  check(
    'a running bar grows at the refresh and keeps its colour',
    Boolean(grow0 && grow1) &&
      parseFloat(grow1.heightVar) > parseFloat(grow0.heightVar) &&
      grow1.bg === grow0.bg &&
      grow1.cls.replace(/ ?(focused|tip-left)/g, '') ===
        grow0.cls.replace(/ ?(focused|tip-left)/g, ''),
    `${grow0?.heightVar} → ${grow1?.heightVar}`
  )

  // 7. Fitting the window, and closing the drawer.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(400)
  const fitOpen = await fits()
  await evaluate(`document.querySelector('.hours-drawer-close').click(), true`)
  await sleep(300)
  const closedByX = !(await drawerOpen()) && (await pressedLabel()) === null
  const fitClosed = await fits()
  await send('Emulation.clearDeviceMetricsOverride')
  check(
    'at 1100 × 640 the page does not scroll, with or without the drawer',
    !fitOpen.scrolls &&
      !fitClosed.scrolls &&
      fitOpen.gridBottom <= fitOpen.height &&
      fitClosed.gridBottom <= fitClosed.height,
    `${JSON.stringify(fitOpen)} / ${JSON.stringify(fitClosed)}`
  )
  check('the X closes the drawer and clears the selection', closedByX)
  check(
    'the grid narrows for the drawer and takes the width back when it closes',
    fitOpen.gridWidth < fitClosed.gridWidth - 100,
    `${fitOpen.gridWidth} → ${fitClosed.gridWidth}`
  )
  await clickHead(todayHeader)
  await sleep(200)
  const openedAgain = await drawerOpen()
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', {
      type,
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27
    })
  }
  await sleep(200)
  check(
    'Esc closes the drawer',
    openedAgain && !(await drawerOpen()) && (await pressedLabel()) === null
  )

  // 8. Navigation.
  await clickHead(todayHeader)
  await sleep(200)
  const openBeforeNav = await drawerOpen()
  await nav('Previous week')
  await sleep(300)
  check(
    '◀ closes the drawer and clears the selection',
    openBeforeNav &&
      !(await drawerOpen()) &&
      (await pressedLabel()) === null &&
      (await evaluate(`document.querySelector('.hours-block.focused') === null`))
  )
  await nav('This week')
  await sleep(200)
  await nav('Next week')
  await sleep(300)
  const next = await evaluate(
    `({ heads: ${HEADS}.length, future: ${HEADS}.every(h => h.classList.contains('future')), dim: [...document.querySelectorAll('.hcal-col')].every(c => Number(getComputedStyle(c).opacity) < 1), bars: document.querySelectorAll('.hcal-bar').length })`
  )
  check(
    '▶ shows five dimmed future columns without bars',
    next.heads === 5 && next.future && next.dim && next.bars === 0,
    JSON.stringify(next)
  )
  const nextEmpty = await emptyTexts()
  check(
    'an empty week says so, with no drawer',
    nextEmpty.includes('No time recorded this week.') && !(await drawerOpen()),
    nextEmpty.join(' | ')
  )
  await nav('This week')
  await sleep(300)
  check(
    'This week returns with nothing selected',
    (await pressedLabel()) === null && !(await drawerOpen())
  )

  // 9. Deleting the open day's last period, in a past week this script empties itself.
  await invoke('sessions:stop', { id: sessionIds[1] })
  await sleep(800)
  const s2 = await invoke('time:snapshot')
  const sysPeriod = s2.periods.find((p) => p.sessionId === sessionIds[1] && !knownPeriods.has(p.id))
  const pastWed = weekDay(-4, 2)
  const pastWeek = [weekDay(-4, 0).getTime(), weekDay(-3, 0).getTime()]
  const pastBusy = s2.periods.some(
    (p) => Date.parse(p.start) < pastWeek[1] && Date.parse(p.end) > pastWeek[0]
  )
  if (!sysPeriod || pastBusy) {
    check(
      'delete fallback (setup)',
      false,
      !sysPeriod ? 'no closed period' : 'the past week holds time'
    )
  } else {
    const start = new Date(pastWed.getFullYear(), pastWed.getMonth(), pastWed.getDate(), 10)
    // Park it outside that day first: the drawer must open on an EMPTY day.
    const parked = new Date(start.getTime() - 24 * 3600_000)
    const moved = await invoke('time:adjust', {
      id: sysPeriod.id,
      start: parked.toISOString(),
      end: new Date(parked.getTime() + 30 * 60_000).toISOString()
    })
    for (let i = 0; i < 4; i++) {
      await nav('Previous week')
      await sleep(200)
    }
    await sleep(300)
    const wedHeader = dayHeader(pastWed)
    await clickHead(wedHeader)
    await sleep(400)
    const emptyDrawer = await evaluate(
      `(() => { const d = document.querySelector('.hours-drawer'); return d ? { title: d.querySelector('.hours-day-title')?.textContent ?? null, empty: d.querySelector('.hours-empty')?.textContent ?? null, groups: d.querySelectorAll('.hours-group').length } : null })()`
    )
    check(
      'a day with no time opens a drawer whose own text says so',
      emptyDrawer !== null &&
        emptyDrawer.title === wedHeader &&
        emptyDrawer.empty === 'No time recorded on this day.' &&
        emptyDrawer.groups === 0 &&
        (await pressedLabel())?.startsWith(wedHeader),
      JSON.stringify(emptyDrawer)
    )
    await invoke('time:adjust', {
      id: sysPeriod.id,
      start: start.toISOString(),
      end: new Date(start.getTime() + 30 * 60_000).toISOString()
    })
    await sleep(1200)
    const armed = await evaluate(
      `(() => { const d = document.querySelector('.hours-drawer'); return d ? { title: d.querySelector('.hours-day-title')?.textContent ?? null, groups: d.querySelectorAll('.hours-group').length, count: d.querySelector('.hours-day-count')?.textContent ?? null } : null })()`
    )
    check(
      'time recorded on the open day fills its drawer, counted in the singular',
      moved.ok === true &&
        armed?.title === wedHeader &&
        armed.groups === 1 &&
        // A literal, not a rebuild: this is the one day the smoke sees where
        // every count is 1, so it is where the singular can be pinned.
        armed.count === '1 folder · 1 block',
      JSON.stringify(armed)
    )
    // Esc inside that period's field belongs to the field, not to the drawer (HCAL-25).
    await evaluate(`document.querySelector('.hours-drawer .hours-block-line')?.click(), true`)
    await sleep(300)
    const editing = await evaluate(
      `(() => { const b = document.querySelector('.hours-drawer [aria-label="Edit period"]'); if (!b) return false; b.click(); return true })()`
    )
    await sleep(300)
    const fieldFocused = await evaluate(
      `(() => { const f = document.querySelector('.hours-drawer input'); if (!f) return false; f.focus(); return document.activeElement === f })()`
    )
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type,
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27
      })
    }
    await sleep(300)
    check(
      'Esc inside a period field leaves the drawer open',
      editing && fieldFocused && (await drawerOpen()),
      `editing ${editing}, focused ${fieldFocused}`
    )

    await invoke('time:delete', { id: sysPeriod.id })
    await sleep(1200)
    check(
      'emptying the open day closes the drawer, even though it opened empty',
      !(await drawerOpen()) && (await pressedLabel()) === null
    )
    await nav('This week')
  }

  // 10. A tall day stays inside its card, at 1100 × 640 (HDRW-01..04).
  const seedStart = new Date(before.periods.find((p) => p.id === seedId(0)).start)
  const seedHeader = dayHeader(
    new Date(seedStart.getFullYear(), seedStart.getMonth(), seedStart.getDate())
  )
  const cardGeometry = () =>
    evaluate(
      `(() => { const d = document.querySelector('.hours-drawer'); const c = d?.querySelector('.hours-day'); const groups = [...(c?.querySelectorAll('.hours-group') ?? [])]; if (!c || groups.length === 0) return null; const dr = d.getBoundingClientRect(); const cr = c.getBoundingClientRect(); return { groups: groups.length, drawerTop: dr.top, drawerBottom: dr.top + d.clientHeight, drawerClient: d.clientHeight, drawerScroll: d.scrollHeight, cardBottom: cr.bottom, cardHeight: cr.height, cardClient: c.clientHeight, cardScroll: c.scrollHeight, lastBottom: groups[groups.length - 1].getBoundingClientRect().bottom } })()`
    )
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1100,
    height: 640,
    deviceScaleFactor: 1,
    mobile: false
  })
  await sleep(400)
  for (let i = 0; i < 8 && !(await headLabels()).some((l) => l.startsWith(seedHeader)); i++) {
    await nav('Previous week')
    await sleep(300)
  }
  await clickHead(seedHeader)
  await sleep(400)
  const tall = await cardGeometry()
  const tallFit = await fits()
  check(
    'precondition: the seeded Sunday holds 14 groups and overflows the drawer',
    tall?.groups === 14 && tall.lastBottom > tall.drawerBottom,
    JSON.stringify(tall)
  )
  check(
    "a tall day's card reaches past its last group and does not overflow",
    Boolean(tall) && tall.cardBottom >= tall.lastBottom && tall.cardScroll <= tall.cardClient + 1,
    tall
      ? `card bottom ${tall.cardBottom.toFixed(1)}, last group ${tall.lastBottom.toFixed(1)}, card ${tall.cardScroll}/${tall.cardClient}`
      : 'no card'
  )
  await evaluate(
    `(() => { const d = document.querySelector('.hours-drawer'); d.scrollTop = d.scrollHeight; return true })()`
  )
  await sleep(200)
  const scrolled = await cardGeometry()
  check(
    "the drawer scrolls, and at its end shows the card's bottom border at its bottom edge",
    Boolean(tall && scrolled) &&
      tall.drawerScroll > tall.drawerClient &&
      Math.abs(scrolled.cardBottom - scrolled.drawerBottom) <= 1,
    scrolled
      ? `drawer ${tall.drawerScroll}/${tall.drawerClient}, card bottom ${scrolled.cardBottom.toFixed(1)} vs drawer bottom ${scrolled.drawerBottom.toFixed(1)}`
      : 'no card'
  )
  check(
    'the page does not scroll with a tall day open',
    !tallFit.scrolls && tallFit.gridBottom <= tallFit.height,
    JSON.stringify(tallFit)
  )
  await nav('This week')
  await sleep(300)
  await clickHead(todayHeader)
  await sleep(400)
  const short = await cardGeometry()
  await send('Emulation.clearDeviceMetricsOverride')
  check(
    "a short day's card still fills the drawer's height",
    Boolean(short) &&
      short.lastBottom < short.drawerBottom &&
      short.cardHeight >= short.drawerClient - 1,
    short
      ? `card ${short.cardHeight.toFixed(1)} vs drawer ${short.drawerClient}, last group ${short.lastBottom.toFixed(1)}`
      : 'no card'
  )
} finally {
  for (const id of sessionIds) {
    await invoke('sessions:stop', { id }).catch(() => {})
    await invoke('sessions:remove', { id }).catch(() => {})
  }
  const after = await invoke('time:snapshot')
  // Only these sessions' new periods: another live session may be recording too.
  const created = after.periods.filter(
    (p) => sessionIds.includes(p.sessionId) && !knownPeriods.has(p.id)
  )
  for (const p of created) {
    await invoke('time:delete', { id: p.id })
  }
  await invoke('config:patch', { ui: { direction: original.direction, theme: original.theme } })
  await send('Page.reload')
  ws.close()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
if (failed.length > 0) {
  console.log(`Seeded data left in place for inspection: ${seededDir}`)
  process.exit(1)
}

// A pass: close the app, which holds the profile open, then delete its data.
if (
  !/^playground-smoke-hours-\d+$/.test(seededDir.split('\\').pop()) ||
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
console.log(`App closed; deleted ${seededDir} and ${POINTER}`)
process.exit(0)
