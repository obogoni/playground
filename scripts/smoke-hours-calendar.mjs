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
 *  11. the seeded Sunday's fourteen tasks wear fourteen different looks: slots
 *      1 to 8 solid, in the palette's colours and order in both themes, then
 *      slots 1 to 6 hatched, and no Other; each task's legend and drawer
 *      swatches wear its bar's look, colour and stripes; the summary reads
 *      `14 tasks · 14 blocks` (HHAT-10, 14, 15, 20, 27; HTF-03, 05, 17)
 *  12. pointing at a legend chip, a drawer group header or a bar, or focusing a
 *      chip or a bar, leaves only that task's bars at full opacity, and leaving
 *      each restores them; clicking a chip shows only the seeded Sunday, closes a drawer open
 *      on Monday and marks the chip with a ×; ◀ ▶ keep the pick and the current
 *      week says it has no time for it, keeping the chip at 0h00 with the
 *      neutral swatch and its ×; the × and a second click clear it; no
 *      bar changes its look, stripes included, throughout (HTF-07..15,
 *      HHAT-26)
 *  13. on the seeded `develop` Wednesday two weeks back: `Split at` starts on
 *      the period's midpoint; splitting at its start is refused and splitting
 *      at 10:00 gives two periods on `develop`; the parts moved to #9201 and
 *      #9202 regroup the day and the legend and wear the hand mark naming
 *      `develop`; From branch moves a part back to No task with no mark and no
 *      flag; a running row offers neither Change task nor Split at, a closed
 *      one both (HTSK-23, 25..29, 33..40)
 *  14. the C:/Windows session, detached, is linked to #9201 from its rail
 *      row's `Change task…` menu (no `No task` offered): its row moves under
 *      #9201, its open period is closed and reopened on 9201 with the flag, the
 *      link is saved in the config, choosing it again changes nothing, and the
 *      strip's From branch puts everything back (HTSK-11..14, 17..19)
 *  15. the new-session dialog starts on `From branch` from Agents and on #9202
 *      from #9202's Agent button; an ad-hoc spawn in the #9202 worktree with
 *      #9201 chosen records 9201 with the flag on `feature/9202-seed` and sits
 *      under #9201; its strip's From branch records 9202 with no flag and moves
 *      it under #9202 (HTSK-07..11, 13, 36)
 *  16. on the spread week, five weeks back, no two neighbouring legend chips
 *      look alike and the chips read eight solids, then hatched blue and
 *      hatched orange; on the seeded Sunday the first hatched task's bar,
 *      legend swatch and drawer swatch show 45° stripes of its hue, 3 px in
 *      every 6 px, over the hue mixed 5% with white, in both themes, and its
 *      solid twin shows none; both swatches are 14 × 14 px; pointing at or
 *      focusing that hatched task's chip, drawer header or bar leaves only its
 *      bars at full opacity, clicking its chip shows only the seeded Sunday
 *      and its × every day again, and no bar changes its look throughout
 *      (HHAT-08, 17, 18, 21, 24..26, 28, 29)
 *
 * NOT automatable here: keyboard focus showing the tooltip, and the two-theme
 * look. The ad-hoc sessions carry no task, so every task look is read on the
 * seeded Sunday and the spread week.
 *
 * Verify by hand (sections 13 to 16 cannot reach these):
 *   - the picker's typed lookup: a work item number shows one `{type} #{id}
 *     {title}` row, a bad one shows main's error text, and choosing the row
 *     pins nothing (HTSK-02..05); the smoke never types there, since it would
 *     reach Azure DevOps
 *   - a linked session's notification names the linked task (HTSK-21)
 *   - a session's link survives a real app restart (HTSK-17)
 *   - the hand mark's look, in the light and the dark theme (HTSK-38)
 *   - the stripes at 14 px and on a 6 px bar, in both themes (HHAT-17, HHAT-21)
 *
 * The sessions are ad-hoc `pwsh` in C:/Windows and C:/Windows/System32 — never a
 * registry agent, which on a machine with the CLI installed starts a real agent.
 * The script restores the owner's direction and theme and deletes every period
 * it created.
 *
 * It runs only on its own throwaway data, never on the owner's hours:
 *   1. node scripts/smoke-hours-calendar.mjs --seed
 *        writes a tall past Sunday into a new directory under %TEMP%, plus a
 *        git repo `ws/acme-widgets` on `develop` with a worktree
 *        `wt/acme-widgets-9202` on `feature/9202-seed`, a config registering
 *        `ws` and pinning acme/platform #9201 and #9202, a closed 09:00 to
 *        12:00 period on `develop` two Wednesdays back, and a spread week five
 *        weeks back: ten tasks, #9301 to #9310, two a day Monday to Friday,
 *        task k on weekday (k - 1) mod 5 for (11 - k) × 10 minutes; prints the
 *        next command
 *   2. npm run dev -- -- "--user-data-dir=<that directory>" --remote-debugging-port=9222
 *        --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
 *        --disable-background-timer-throttling
 *   3. node scripts/smoke-hours-calendar.mjs
 *        refuses with `not running on the seeded data` unless every seeded
 *        period is in the app; on a pass it closes the app and deletes the
 *        directory, on a failure it leaves both and prints the directory
 *
 * SMOKE_ONLY=assign on step 3 runs sections 13 to 15 alone, and SMOKE_ONLY=looks
 * section 16 alone, each from a fresh seed and launch like any drive, for
 * iterating on them; the full drive still runs before a PR.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const ONLY = process.env.SMOKE_ONLY ?? null
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

// AD-055's palette, slots 1 to 8 (HHAT-14, HHAT-15).
const PALETTE = {
  dark: ['#2790da', '#b64906', '#14a889', '#bc8b03', '#c90982', '#117a2c', '#8c63f5', '#f45468'],
  light: ['#2f76e8', '#eb6623', '#28ae76', '#dbab37', '#e984b7', '#0f6f19', '#4e3ca6', '#d10b47']
}
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
/** In-page `sig(el)`: a look's computed fill and stripes. */
const LOOK_SIG = `const sig = el => { const s = getComputedStyle(el); return s.backgroundColor + ' / ' + s.backgroundImage }`

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
// weeks), and a spread week five weeks back, two tasks a day Monday to Friday
// with falling week totals. Fictitious tasks only: the repository is public.
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
// The spread week: task k (#9300 + k) on weekday (k - 1) mod 5, for (11 - k) × 10
// minutes, so tasks k and k + 5 share a day and the week totals fall with k.
const SPREAD_TITLES = [
  'Tidy the release notes',
  'Sort the export columns',
  'Cap the retry backoff',
  'Lint the email templates',
  'Index the order lookups',
  'Batch the push alerts',
  'Hide the beta banner',
  'Log the slow queries',
  'Pin the font versions',
  'Clean the temp uploads'
]
const spreadId = (i) => `hours-smoke-spread-${String(i + 1).padStart(2, '0')}`
// The `develop` period sections 13 and 14 split and reassign, and the two pins they choose.
const DEVELOP_ID = 'hours-smoke-develop'
const PINS = [9201, 9202]

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
  // A repo on `develop` with a worktree for #9202, in a workspace the config
  // registers. Fictitious author and ids only.
  const ws = join(dir, 'ws')
  const repo = join(ws, 'acme-widgets')
  const worktree = join(dir, 'wt', 'acme-widgets-9202')
  mkdirSync(repo, { recursive: true })
  mkdirSync(join(dir, 'wt'))
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-b', 'develop')
  git(
    '-c',
    'user.name=Acme Seed',
    '-c',
    'user.email=seed@example.com',
    'commit',
    '--allow-empty',
    '-m',
    'Seed'
  )
  git('worktree', 'add', '-b', 'feature/9202-seed', worktree)
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({
      workspaces: [{ id: ws.toLowerCase(), path: ws, displayName: 'ws' }],
      pinnedTasks: PINS.map((id) => ({
        id,
        org: 'acme',
        project: 'platform',
        url: `https://dev.azure.com/acme/platform/_workitems/edit/${id}`
      }))
    })
  )
  const wednesday = weekDay(-2, 2)
  const at = (h) => new Date(wednesday.getFullYear(), wednesday.getMonth(), wednesday.getDate(), h)
  lines.push(
    JSON.stringify({
      v: 1,
      id: DEVELOP_ID,
      sessionId: 'hours-smoke-develop',
      agent: 'Ad-hoc',
      cwd: repo,
      start: at(9).toISOString(),
      end: at(12).toISOString(),
      workspacePath: ws,
      repoName: 'acme-widgets',
      branch: 'develop',
      taskId: null,
      taskTitle: null
    })
  )
  SPREAD_TITLES.forEach((title, i) => {
    const day = weekDay(-5, i % 5)
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), i < 5 ? 9 : 14)
    const taskId = 9301 + i
    lines.push(
      JSON.stringify({
        v: 1,
        id: spreadId(i),
        sessionId: 'hours-smoke-spread',
        agent: 'Ad-hoc',
        cwd: 'C:\\Windows',
        start: start.toISOString(),
        end: new Date(start.getTime() + (10 - i) * 10 * 60_000).toISOString(),
        workspacePath: null,
        repoName: 'acme-widgets',
        branch: `feature/${taskId}-seed`,
        taskId,
        taskTitle: title
      })
    )
  })
  writeFileSync(join(dir, 'time-log.jsonl'), lines.join('\n') + '\n')
  writeFileSync(POINTER, dir)
  console.log(
    `Seeded ${lines.length} periods (${dayHeader(sunday)}, ${dayHeader(wednesday)}, ${dayHeader(weekDay(-5, 0))} to ${dayHeader(weekDay(-5, 4))}) in ${dir}`
  )
  console.log(
    `Launch: npm run dev -- -- "--user-data-dir=${dir}" --remote-debugging-port=${PORT} --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`
  )
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
const missingSeed = [
  ...SEED_TITLES.map((_, i) => seedId(i)),
  DEVELOP_ID,
  ...SPREAD_TITLES.map((_, i) => spreadId(i))
].filter((id) => !snapshotIds.has(id))
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

// Probes for focusing a task (sections 12 and 16), evaluated in the page.
const labelOf = (title) =>
  evaluate(
    `[...document.querySelectorAll('.hleg-label')].map(l => l.textContent).find(t => t.includes(${JSON.stringify(title)})) ?? null`
  )
const chipOf = (label) =>
  `[...document.querySelectorAll('.hleg-chip')].find(c => c.querySelector('.hleg-label').textContent === ${JSON.stringify(label)})`
const barOf = (label) =>
  `[...document.querySelectorAll('.hcal-bar')].find(b => b.getAttribute('aria-label').startsWith(${JSON.stringify(`${label}, `)}))`
const rowOf = (label) =>
  `[...document.querySelectorAll('.hours-drawer .hours-group')].find(g => g.querySelector('.hours-group-label').textContent === ${JSON.stringify(label)})?.querySelector('.hours-group-head')`
const bars = () =>
  evaluate(
    `(() => { ${LOOK_SIG}; return [...document.querySelectorAll('.hcal-bar')].map(b => ({ label: b.getAttribute('aria-label').split(', ')[0], look: sig(b), opacity: Number(getComputedStyle(b).opacity) })) })()`
  )
/** Only `label`'s bars at full opacity, every other of the fourteen at 30%. */
const onlyFull = (list, label) =>
  list.length === 14 &&
  list.some((b) => b.label === label) &&
  list.every((b) => (b.label === label ? b.opacity === 1 : Math.abs(b.opacity - 0.3) < 0.01))
const pointAt = async (element) => {
  const at = await evaluate(
    `(() => { const e = ${element}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`
  )
  if (at) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await sleep(400)
  return at !== null
}
const pointAway = async () => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 })
  await sleep(400)
}
// A bar's look is its fill and its stripes (`LOOK_SIG`), so a pick or a fade
// that strips a hatched bar's stripes changes it.
const lookOf = (list) => new Map(list.map((b) => [b.label, b.look]))
const sameLooks = (list, reference) =>
  list.length > 0 && list.every((b) => reference.get(b.label) === b.look)
const pressedChips = () =>
  evaluate(
    `[...document.querySelectorAll('.hleg-chip')].filter(c => c.querySelector('.hleg-pick').getAttribute('aria-pressed') === 'true').map(c => ({ label: c.querySelector('.hleg-label').textContent, total: c.querySelector('.hleg-total').textContent, swatch: [...c.querySelector('.hleg-swatch').classList].find(x => x.startsWith('role-')), clear: c.querySelector('.hleg-clear') !== null }))`
  )
const allFull = (list) => list.length === 14 && list.every((b) => b.opacity === 1)

/** Sections 1 to 12, on the calendar the setup opened. */
async function calendarSections() {
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

  // 11. Fourteen looks on the seeded Sunday, never two alike (HHAT-10, 14, 15, 20, 27).
  for (let i = 0; i < 8 && !(await headLabels()).some((l) => l.startsWith(seedHeader)); i++) {
    await nav('Previous week')
    await sleep(300)
  }
  await clickHead(seedHeader)
  await sleep(400)
  // A look's signature is its computed fill and stripes, so a hatched look and
  // its solid twin differ, and so does a swatch that lost its stripes.
  const sunday = await evaluate(
    `(() => { const lookOf = el => [...el.classList].filter(c => c.startsWith('role-') || c === 'hatched').join(' '); ${LOOK_SIG}; const bars = [...document.querySelectorAll('.hcal-col.selected .hcal-bar')].map(b => ({ label: b.getAttribute('aria-label').split(', ')[0], look: lookOf(b), sig: sig(b) })); const chips = new Map([...document.querySelectorAll('.hleg-chip')].map(c => [c.querySelector('.hleg-label').textContent, sig(c.querySelector('.hleg-swatch'))])); const rows = new Map([...document.querySelectorAll('.hours-drawer .hours-group')].map(g => [g.querySelector('.hours-group-label').textContent, sig(g.querySelector('.hours-group-swatch'))])); return { bars: bars.map(b => ({ ...b, chip: chips.get(b.label) ?? null, row: rows.get(b.label) ?? null })), count: document.querySelector('.hours-drawer .hours-day-count')?.textContent ?? null } })()`
  )
  // The seed's tasks share the day and have equal time, so they are coloured in
  // seed order: the eight solids, then hatched blue to hatched green.
  const expectedLooks = SEED_TITLES.map((_, i) =>
    i < 8 ? `role-slot${i + 1}` : `role-slot${i - 7} hatched`
  )
  const wornLooks = SEED_TITLES.map(
    (title) => sunday.bars.find((b) => b.label.includes(title))?.look ?? null
  )
  check(
    "the seeded Sunday's fourteen tasks wear fourteen different looks, eight solid then six hatched, no Other",
    sunday.bars.length === 14 &&
      wornLooks.every((look, i) => look === expectedLooks[i]) &&
      new Set(sunday.bars.map((b) => b.sig)).size === 14,
    `${wornLooks.join(' | ')}; ${new Set(sunday.bars.map((b) => b.sig)).size} signatures`
  )
  check(
    "each seeded task's legend and drawer swatches wear its bar's look",
    sunday.bars.length === 14 && sunday.bars.every((b) => b.chip === b.sig && b.row === b.sig),
    JSON.stringify(sunday.bars.filter((b) => b.chip !== b.sig || b.row !== b.sig).slice(0, 2))
  )
  check(
    "the seeded Sunday's summary counts its tasks",
    sunday.count === '14 tasks · 14 blocks',
    `${sunday.count}`
  )
  // The seed's first eight tasks take the solids in seed order: their bars wear
  // AD-055's palette in order.
  const shownTheme = await evaluate(`document.documentElement.dataset.theme`)
  const worn = {}
  for (const theme of ['dark', 'light']) {
    worn[theme] = await evaluate(
      `(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; const bars = [...document.querySelectorAll('.hcal-col.selected .hcal-bar')]; return ${JSON.stringify(SEED_TITLES.slice(0, 8))}.map(t => { const b = bars.find(x => x.getAttribute('aria-label').split(', ')[0].includes(t)); return b ? getComputedStyle(b).backgroundColor : null }) })()`
    )
  }
  await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(shownTheme)}, true`)
  const offPalette = Object.entries(PALETTE).flatMap(([theme, hexes]) =>
    hexes
      .map((hex, i) => [theme, i + 1, rgb(hex), worn[theme][i]])
      .filter(([, , want, got]) => want !== got)
  )
  check(
    "the seeded Sunday's eight solid tasks wear the palette's eight colours in order, in both themes",
    offPalette.length === 0,
    JSON.stringify(offPalette.slice(0, 3))
  )

  // 12. Hover and filter by task, in the seeded week (HTF-07..15).
  const [taskA, taskB, taskC, taskD] = await Promise.all(
    SEED_TITLES.slice(0, 4).map((title) => labelOf(title))
  )
  const opacities = (list) =>
    [...new Set(list.map((b) => `${b.label === taskA ? 'A' : '·'}${b.opacity}`))].join(' ')

  await pointAway()
  const rest = await bars()
  const looks = lookOf(rest)
  const pointedChip = await pointAt(chipOf(taskA))
  const chipHover = await bars()
  check(
    "pointing at a legend chip leaves only its task's bars at full opacity",
    Boolean(taskA) && allFull(rest) && pointedChip && onlyFull(chipHover, taskA),
    `${taskA}: ${opacities(chipHover)}`
  )
  await pointAway()
  const left = await bars()
  check('leaving the chip restores every bar', allFull(left), opacities(left))
  const pointedRow = await pointAt(rowOf(taskB))
  const rowHover = await bars()
  await pointAway()
  // Read after each leave, before the next source enters: an enter would
  // overwrite a hover that never cleared.
  const rowLeft = await bars()
  const pointedBar = await pointAt(barOf(taskC))
  const barHover = await bars()
  await pointAway()
  const barLeft = await bars()
  check(
    'pointing at a drawer group header or at a bar does the same for its task',
    pointedRow && onlyFull(rowHover, taskB) && pointedBar && onlyFull(barHover, taskC),
    `row ${pointedRow}, bar ${pointedBar}`
  )
  check(
    'leaving a drawer group header or a bar restores every bar',
    onlyFull(rowHover, taskB) && allFull(rowLeft) && onlyFull(barHover, taskC) && allFull(barLeft),
    `${opacities(rowLeft)} / ${opacities(barLeft)}`
  )
  await evaluate(`${barOf(taskB)}?.focus(), true`)
  await sleep(400)
  const barFocus = await bars()
  await evaluate(`document.activeElement.blur(), true`)
  await sleep(400)
  const barBlurred = await bars()
  check(
    'keyboard focus on a bar fades the other tasks, and leaving it restores them',
    onlyFull(barFocus, taskB) && allFull(barBlurred),
    `${opacities(barFocus)} / ${opacities(barBlurred)}`
  )
  await evaluate(`${chipOf(taskD)}?.querySelector('.hleg-pick')?.focus(), true`)
  await sleep(400)
  const chipFocus = await bars()
  await evaluate(`document.activeElement.blur(), true`)
  await sleep(400)
  const blurred = await bars()
  check(
    'keyboard focus on a chip fades the other tasks, and leaving it restores them',
    onlyFull(chipFocus, taskD) && allFull(blurred),
    opacities(chipFocus)
  )

  const seedMonday = dayHeader(
    new Date(seedStart.getFullYear(), seedStart.getMonth(), seedStart.getDate() - 6)
  )
  await clickHead(seedMonday)
  await sleep(300)
  const openOnMonday = (await drawerOpen()) && (await detailTitle()) === seedMonday
  await evaluate(`${chipOf(taskA)}?.querySelector('.hleg-pick')?.click(), true`)
  await sleep(400)
  const pickedHeads = await headLabels()
  const picked = await bars()
  const pressed = await pressedChips()
  check(
    'clicking a chip shows only the days its task took',
    pickedHeads.length === 1 && pickedHeads[0].startsWith(seedHeader),
    pickedHeads.map((l) => l.slice(0, 16)).join(' | ')
  )
  check(
    'the picked chip shows as selected with a ×',
    pressed.length === 1 && pressed[0].label === taskA && pressed[0].clear,
    JSON.stringify(pressed)
  )
  check(
    "the pick fades the other tasks' bars on the days it shows",
    onlyFull(picked, taskA),
    opacities(picked)
  )
  check(
    'the pick closes a drawer whose day it filters out',
    openOnMonday && !(await drawerOpen()) && (await pressedLabel()) === null,
    `open on Monday ${openOnMonday}`
  )
  await nav('Next week')
  await sleep(400)
  const away = {
    empty: await emptyTexts(),
    grid: await evaluate(`document.querySelector('.hcal') !== null`),
    pressed: await pressedChips()
  }
  await nav('Previous week')
  await sleep(400)
  const backHeads = await headLabels()
  check(
    'moving weeks keeps the pick, and a week without its task says so',
    away.empty.includes(`No time for ${taskA} this week.`) &&
      !away.grid &&
      away.pressed.length === 1 &&
      away.pressed[0].label === taskA &&
      backHeads.length === 1 &&
      backHeads[0].startsWith(seedHeader),
    `${away.empty.join(' | ')}; back: ${backHeads.map((l) => l.slice(0, 16)).join(' | ')}`
  )
  check(
    'in that week the picked chip stays, with a zero total, the neutral swatch and its ×',
    away.pressed.length === 1 &&
      away.pressed[0].total === '0h00' &&
      away.pressed[0].swatch === 'role-other' &&
      away.pressed[0].clear,
    JSON.stringify(away.pressed)
  )
  await evaluate(`${chipOf(taskA)}?.querySelector('.hleg-clear')?.click(), true`)
  await sleep(400)
  const clearedHeads = await headLabels()
  const cleared = await bars()
  const clearedPressed = await pressedChips()
  await evaluate(`${chipOf(taskA)}?.querySelector('.hleg-pick')?.click(), true`)
  await sleep(400)
  const repickedHeads = (await headLabels()).length
  await evaluate(`${chipOf(taskA)}?.querySelector('.hleg-pick')?.click(), true`)
  await sleep(400)
  const reclearedHeads = await headLabels()
  const recleared = await bars()
  check(
    'the × or a second click on the chip shows every day again',
    clearedHeads.length === 6 &&
      clearedPressed.length === 0 &&
      allFull(cleared) &&
      repickedHeads === 1 &&
      reclearedHeads.length === 6 &&
      allFull(recleared),
    `${clearedHeads.length} days after ×, ${repickedHeads} after a pick, ${reclearedHeads.length} after a second click`
  )
  check(
    'no bar changes its look, stripes included, while tasks are pointed at, picked or cleared',
    [chipHover, rowHover, barHover, barFocus, chipFocus, picked, cleared, recleared].every((list) =>
      sameLooks(list, looks)
    ) && looks.size === 14,
    `${looks.size} bars`
  )
}

// Probes for sections 13 to 15, evaluated in the page.
/** Sets a React-controlled input's value the way typing does. */
const setInput = (selector, value) =>
  evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
  )
/** Polls `expression` like `waitFor`, but answers false instead of throwing. */
async function until(expression, tries = 16) {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(expression)) return true
    await sleep(250)
  }
  return false
}
/** A local instant as a `datetime-local` value, to the second. */
const toLocal = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const drawerGroups = () =>
  evaluate(
    `[...document.querySelectorAll('.hours-drawer .hours-group')].map(g => ({ label: g.querySelector('.hours-group-label').textContent, total: g.querySelector('.hours-group-total').textContent, blocks: [...g.querySelectorAll('.hours-block')].map(b => ({ range: b.querySelector('.hours-block-range').textContent, count: b.querySelector('.hours-block-count').textContent })), rows: [...g.querySelectorAll('.period-row')].map(r => { const hand = r.querySelector('.period-row-hand'); return { range: r.querySelector('.period-row-range').textContent, open: r.classList.contains('open'), hand: hand ? { title: hand.getAttribute('title'), aria: hand.getAttribute('aria-label') } : null, change: r.querySelector('.period-row-change-task') !== null, split: r.querySelector('.period-row-split') !== null } }) }))`
  )
const expandBlocks = async () => {
  await evaluate(
    `[...document.querySelectorAll('.hours-drawer .hours-block-line[aria-expanded="false"]')].forEach(b => b.click()), true`
  )
  await sleep(250)
}
const legendLabels = () =>
  evaluate(`[...document.querySelectorAll('.hleg-label')].map(l => l.textContent)`)
/** The drawer's period row in `group` whose range starts with `rangeStart`. */
const periodRow = (group, rangeStart) =>
  `[...([...document.querySelectorAll('.hours-drawer .hours-group')].find(g => g.querySelector('.hours-group-label').textContent === ${JSON.stringify(group)})?.querySelectorAll('.period-row') ?? [])].find(r => r.querySelector('.period-row-range').textContent.startsWith(${JSON.stringify(rangeStart)}))`
/** Clicks the picker entry labelled `label` inside `host`. */
const choose = (host, label) =>
  evaluate(
    `(() => { const e = [...(${host}?.querySelectorAll('.task-picker-entry') ?? [])].find(x => x.querySelector('.task-picker-label')?.textContent === ${JSON.stringify(label)}); if (!e) return false; e.click(); return true })()`
  )
/** Change task on a drawer row, then the picker entry `label`. */
async function reassignRow(group, rangeStart, label) {
  await expandBlocks()
  const row = periodRow(group, rangeStart)
  const opened = await evaluate(
    `(() => { const b = ${row}?.querySelector('.period-row-change-task'); if (!b) return false; b.click(); return true })()`
  )
  await sleep(250)
  const chosen = opened && (await choose(`${row}?.querySelector('.period-row-picker')`, label))
  await sleep(1200)
  await expandBlocks()
  return chosen
}

/** 13. Split and reassign the seeded `develop` period (HTSK-23, 25..29, 33..40). */
async function periodSection() {
  const seeded = before.periods.find((p) => p.id === DEVELOP_ID)
  const seededStart = new Date(seeded.start)
  const at = (h, m = 0) =>
    new Date(seededStart.getFullYear(), seededStart.getMonth(), seededStart.getDate(), h, m)
  const dayStart = at(0).getTime()
  const dayEnd = dayStart + 24 * 3600_000
  const onDay = (snapshot) =>
    snapshot.periods.filter((p) => Date.parse(p.start) < dayEnd && Date.parse(p.end) > dayStart)
  const devHeader = dayHeader(at(0))
  const NO_TASK = 'No task · acme-widgets'
  const HAND = 'Assigned by hand (branch: develop)'

  await nav('This week')
  await sleep(300)
  for (let i = 0; i < 2; i++) {
    await nav('Previous week')
    await sleep(300)
  }
  await clickHead(devHeader)
  await sleep(400)
  await expandBlocks()
  const pre = await drawerGroups()
  check(
    'precondition: the develop day holds one No-task block of one 09:00–12:00 period, unmarked',
    pre.length === 1 &&
      pre[0].label === NO_TASK &&
      pre[0].blocks.length === 1 &&
      pre[0].blocks[0].range === '09:00–12:00' &&
      pre[0].blocks[0].count === '1 period' &&
      pre[0].rows.length === 1 &&
      pre[0].rows[0].hand === null,
    JSON.stringify(pre)
  )

  const first = periodRow(NO_TASK, '09:00:00')
  await evaluate(`${first}?.querySelector('.period-row-split')?.click(), true`)
  await sleep(300)
  const splitField = '.hours-drawer .period-row-split-input'
  const field = await evaluate(
    `document.querySelector(${JSON.stringify(splitField)})?.value ?? null`
  )
  // The field drops `:00` seconds, so the instant is compared, not the text.
  check(
    "`Split at` opens on the period's midpoint, 10:30:00",
    field !== null && new Date(field).getTime() === at(10, 30).getTime(),
    `${field}`
  )

  const splitButton = `document.querySelector('.hours-drawer .period-row-split-form .period-row-btn.primary')`
  await setInput(splitField, toLocal(at(9)))
  await evaluate(`${splitButton}?.click(), true`)
  await sleep(900)
  const refusedError = await evaluate(
    `document.querySelector('.hours-drawer .period-row-error')?.textContent ?? null`
  )
  const refused = await drawerGroups()
  const refusedLog = onDay(await invoke('time:snapshot'))
  check(
    "splitting at the period's start is refused and leaves one period",
    refusedError === 'Split time must be inside the period.' &&
      refused[0]?.blocks[0]?.count === '1 period' &&
      refusedLog.length === 1,
    `${refusedError}; ${refused[0]?.blocks[0]?.count}; ${refusedLog.length} in the log`
  )

  await setInput(splitField, toLocal(at(10)))
  await evaluate(`${splitButton}?.click(), true`)
  await until(
    `document.querySelector('.hours-drawer .hours-block-count')?.textContent === '2 periods'`
  )
  await expandBlocks()
  const split = await drawerGroups()
  const parts = onDay(await invoke('time:snapshot'))
  check(
    'splitting at 10:00:00 gives two periods on develop, the seed keeping its id and 09:00–10:00',
    split[0]?.blocks[0]?.count === '2 periods' &&
      JSON.stringify(split[0].rows.map((r) => r.range)) ===
        JSON.stringify(['09:00:00–10:00:00', '10:00:00–12:00:00']) &&
      parts.length === 2 &&
      parts.some((p) => p.id === DEVELOP_ID && p.end === at(10).toISOString()) &&
      parts.some((p) => p.id !== DEVELOP_ID && p.start === at(10).toISOString()) &&
      parts.every((p) => p.branch === 'develop'),
    `${JSON.stringify(split[0]?.rows.map((r) => r.range))}; ${JSON.stringify(parts.map((p) => [p.id, p.branch]))}`
  )

  const toFirst = await reassignRow(NO_TASK, '09:00:00', '#9201')
  const moved = await drawerGroups()
  const movedChips = await legendLabels()
  const groupOf = (list, label) => list.find((g) => g.label === label)
  check(
    'the first part moved to #9201 makes a 1h00 task group beside a 2h00 No-task one, with its chip',
    toFirst &&
      moved.length === 2 &&
      groupOf(moved, 'Task #9201')?.total === '1h00' &&
      groupOf(moved, NO_TASK)?.total === '2h00' &&
      movedChips.includes('Task #9201'),
    `${JSON.stringify(moved.map((g) => [g.label, g.total]))}; chips ${movedChips.join(' | ')}`
  )
  const markedRow = groupOf(moved, 'Task #9201')?.rows[0]
  const plainRows = groupOf(moved, NO_TASK)?.rows ?? []
  check(
    'the moved part wears the hand mark naming its branch, the No-task part none',
    markedRow?.hand?.title === HAND &&
      markedRow.hand.aria === HAND &&
      plainRows.length === 1 &&
      plainRows[0].hand === null,
    `${JSON.stringify(markedRow?.hand)}; ${JSON.stringify(plainRows.map((r) => r.hand))}`
  )

  const toSecond = await reassignRow(NO_TASK, '10:00:00', '#9202')
  const both = await drawerGroups()
  const bothChips = await legendLabels()
  check(
    'the second part moved to #9202 leaves two task groups, no No-task group or chip, both marked',
    toSecond &&
      JSON.stringify(both.map((g) => g.label).sort()) ===
        JSON.stringify(['Task #9201', 'Task #9202']) &&
      !bothChips.includes(NO_TASK) &&
      bothChips.includes('Task #9202') &&
      both.every((g) => g.rows.length === 1 && g.rows[0].hand?.title === HAND),
    `${JSON.stringify(both.map((g) => [g.label, g.rows.map((r) => r.hand?.title ?? null)]))}; chips ${bothChips.join(' | ')}`
  )

  const back = await reassignRow('Task #9201', '09:00:00', 'From branch')
  const returned = await drawerGroups()
  const seedAfter = (await invoke('time:snapshot')).periods.find((p) => p.id === DEVELOP_ID)
  const returnedRow = groupOf(returned, NO_TASK)?.rows.find((r) => r.range.startsWith('09:00:00'))
  check(
    'From branch moves the first part back to No task, unmarked, with no flag and its branch kept',
    back &&
      returnedRow !== undefined &&
      returnedRow.hand === null &&
      seedAfter?.taskId === null &&
      seedAfter.taskTitle === null &&
      !('taskByHand' in seedAfter) &&
      seedAfter.branch === 'develop',
    `${JSON.stringify(returned.map((g) => g.label))}; ${JSON.stringify(seedAfter)}`
  )

  // A closed and a running row today: pausing and resuming the C:/Windows
  // session closes its period and opens the next one in the same block.
  await invoke('time:pause', { sessionId: sessionIds[0] })
  await sleep(300)
  await invoke('time:resume', { sessionId: sessionIds[0] })
  await sleep(800)
  await nav('This week')
  await sleep(300)
  await clickHead(todayHeader)
  await sleep(400)
  await expandBlocks()
  const todayRows = (await drawerGroups()).flatMap((g) => g.rows)
  const running = todayRows.filter((r) => r.open)
  const closed = todayRows.filter((r) => !r.open)
  check(
    'a running row offers neither Change task nor Split at, a closed row both',
    running.length >= 1 &&
      closed.length >= 1 &&
      running.every((r) => !r.change && !r.split) &&
      closed.every((r) => r.change && r.split),
    `${running.length} running, ${closed.length} closed: ${JSON.stringify(todayRows.map((r) => [r.open, r.change, r.split]))}`
  )
}

/** A rail row, found by its tooltip: a detached row names its cwd, a worktree row its branch. */
const railRow = (tooltipEnd) =>
  `[...document.querySelectorAll('.rail-row')].find(r => (r.getAttribute('title') ?? '').endsWith(${JSON.stringify(tooltipEnd)}))`
/** The rail group holding `row`: its task id (null for an orphan) and its note. */
const railGroupOf = (row) =>
  evaluate(
    `(() => { const g = ${row}?.closest('.rail-group'); if (!g) return null; return { id: g.querySelector('.rail-group-id')?.textContent ?? null, note: g.querySelector('.rail-group-note')?.textContent ?? null } })()`
  )
/** Right-clicks `row`, then its menu's `Change task…`; answers the menu's item texts. */
async function rowChangeTask(row) {
  await evaluate(
    `(() => { const r = ${row}; if (!r) return false; const b = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: b.x + 40, clientY: b.y + b.height / 2 })); return true })()`
  )
  await sleep(250)
  const items = await evaluate(
    `[...document.querySelectorAll('.rail-ctx-menu .rail-ctx-item')].map(i => i.textContent.trim())`
  )
  await evaluate(`document.querySelector('.rail-ctx-menu .rail-change-task')?.click(), true`)
  await sleep(300)
  return items
}
const RAIL_PICKER = `document.querySelector('.task-picker.task-picker-at')`
const STRIP_HOST = `document.querySelector('.agents-strip-task-host')`

/** 14. Link the C:/Windows session from its rail row and its strip (HTSK-11..14, 17..19). */
async function railSection() {
  const id = sessionIds[0]
  const row = railRow(` · ${FOLDERS[0]}`)
  const openOf = async () =>
    (await invoke('time:snapshot')).open.find((p) => p.sessionId === id) ?? null
  const closedOf = async () =>
    (await invoke('time:snapshot')).periods.filter(
      (p) => p.sessionId === id && !knownPeriods.has(p.id)
    )
  const persisted = async () => (await invoke('config:get')).sessions.find((s) => s.id === id)

  await reloadInto('agents')
  await until(`${row} !== undefined`, 40)
  const group0 = await railGroupOf(row)
  const open0 = await openOf()
  check(
    'precondition: the C:/Windows session sits in a detached orphan group, its open period with no task',
    group0?.id === null && group0.note === 'detached · Windows' && open0?.taskId === null,
    `${JSON.stringify(group0)}; open task ${open0?.taskId}`
  )

  const items = await rowChangeTask(row)
  const entries = await evaluate(
    `[...(${RAIL_PICKER}?.querySelectorAll('.task-picker-entry .task-picker-label') ?? [])].map(l => l.textContent)`
  )
  check(
    'right-clicking its row offers `Change task…`, opening a picker with From branch and both pins, no No task',
    JSON.stringify(items) === JSON.stringify(['Change task…']) &&
      JSON.stringify(entries) === JSON.stringify(['From branch', '#9201', '#9202']),
    `${JSON.stringify(items)}; ${JSON.stringify(entries)}`
  )

  const linked = await choose(RAIL_PICKER, '#9201')
  await sleep(1200)
  const group1 = await railGroupOf(row)
  check(
    'choosing #9201 puts its row in the group headed #9201, out of every orphan group',
    linked && group1?.id === '#9201' && group1.note === null,
    JSON.stringify(group1)
  )

  const open1 = await openOf()
  const previous = (await closedOf()).find((p) => p.id === open0?.id)
  check(
    'its open period records 9201 with the flag, and the one before ends where it starts',
    open1?.taskId === 9201 &&
      open1.taskByHand === true &&
      open1.id !== open0?.id &&
      previous !== undefined &&
      previous.taskId === null &&
      previous.end === open1.start,
    `open ${JSON.stringify(open1 && [open1.taskId, open1.taskByHand, open1.start])}; previous ${JSON.stringify(previous && [previous.taskId, previous.end])}`
  )

  const saved = await persisted()
  check(
    'the config holds the session linked to 9201',
    saved?.task?.id === 9201,
    JSON.stringify(saved?.task)
  )

  // Past the 1 s floor, so a needless close would leave a period behind.
  await sleep(1500)
  const closedBefore = (await closedOf()).length
  await rowChangeTask(row)
  const again = await choose(RAIL_PICKER, '#9201')
  await sleep(1200)
  const closedAfter = (await closedOf()).length
  const open2 = await openOf()
  check(
    'choosing #9201 again closes and opens nothing',
    again && closedAfter === closedBefore && open2?.id === open1?.id,
    `closed ${closedBefore} → ${closedAfter}; open ${open1?.id === open2?.id ? 'kept' : 'replaced'}`
  )

  await evaluate(`${row}?.click(), true`)
  await sleep(600)
  const strip = await evaluate(`document.querySelector('.agents-strip-task')?.textContent ?? null`)
  await evaluate(`document.querySelector('.agents-strip-task-btn')?.click(), true`)
  await sleep(300)
  const unlinked = await choose(STRIP_HOST, 'From branch')
  await sleep(1200)
  const group3 = await railGroupOf(row)
  const open3 = await openOf()
  const saved3 = await persisted()
  check(
    "its strip shows #9201, and the strip's From branch puts it back in the orphan group with no task anywhere",
    strip === '#9201' &&
      unlinked &&
      group3?.id === null &&
      group3.note === 'detached · Windows' &&
      open3?.taskId === null &&
      saved3 !== undefined &&
      !('task' in saved3),
    `strip ${strip}; ${JSON.stringify(group3)}; open task ${open3?.taskId}; saved ${JSON.stringify(saved3?.task)}`
  )
}

const DIALOG = `document.querySelector('.dialog-panel')`
const dialogTask = () => evaluate(`${DIALOG}?.querySelector('.ns-task-value')?.textContent ?? null`)
const cancelDialog = () =>
  evaluate(
    `[...(${DIALOG}?.querySelectorAll('.dialog-btn-ghost') ?? [])].find(b => b.textContent.trim() === 'Cancel')?.click(), true`
  )

/** 15. The new-session dialog's Task field (HTSK-07..11, 13, 36). */
async function dialogSection() {
  const ADHOC = 'pwsh -NoLogo -NoProfile'
  const BRANCH = 'feature/9202-seed'
  await evaluate(`document.querySelector('.session-rail-new')?.click(), true`)
  await sleep(400)
  const fromAgents = await dialogTask()
  await cancelDialog()
  await sleep(300)
  check(
    'the Agents `New` button opens the dialog with Task `From branch`',
    fromAgents === 'From branch',
    `${fromAgents}`
  )

  const card = `[...document.querySelectorAll('.task-card')].find(c => c.querySelector('.task-card-id')?.textContent === '#9202')`
  await reloadInto('tree')
  await until(`${card}?.querySelector('.task-agent-btn')?.disabled === false`, 40)
  await evaluate(`${card}?.querySelector('.task-agent-btn')?.click(), true`)
  await sleep(400)
  const fromCard = await dialogTask()
  check(
    "pinned #9202's Agent button, its worktree existing, opens the dialog with Task `#9202`",
    fromCard === '#9202',
    `${fromCard}`
  )

  await evaluate(`${DIALOG}?.querySelector('.ns-agent-chip.adhoc')?.click(), true`)
  await sleep(200)
  await setInput('.dialog-panel .ns-adhoc-input', ADHOC)
  await sleep(150)
  await evaluate(`${DIALOG}?.querySelector('.ns-task-change')?.click(), true`)
  await sleep(250)
  const picked = await choose(`${DIALOG}?.querySelector('.ns-task')`, '#9201')
  await sleep(250)
  const form = await evaluate(
    `(() => { const d = ${DIALOG}; return d ? { adhoc: d.querySelector('.ns-agent-chip.adhoc')?.classList.contains('selected') ?? false, command: d.querySelector('.ns-adhoc-input')?.value ?? null, cwd: d.querySelector('.ns-cwd-chip.selected .ns-cwd-branch')?.textContent ?? null, task: d.querySelector('.ns-task-value')?.textContent ?? null, run: d.querySelector('.dialog-path-value')?.textContent ?? null } : null })()`
  )
  // Spawn only the ad-hoc shell: a registry agent would start a real CLI.
  const safe = form?.adhoc === true && form.command === ADHOC && (form.run ?? '').startsWith(ADHOC)
  const known = new Set((await invoke('sessions:list')).map((v) => v.id))
  if (safe) {
    await evaluate(`${DIALOG}?.querySelector('.dialog-btn-primary')?.click(), true`)
  } else {
    await cancelDialog()
  }
  await sleep(1500)
  const spawned = (await invoke('sessions:list')).filter((v) => !known.has(v.id))
  for (const v of spawned) sessionIds.push(v.id)
  const id = spawned[0]?.id
  const worktree = (await invoke('tree:get'))
    .flatMap((w) => w.repos.flatMap((r) => r.worktrees))
    .find((wt) => wt.branch === BRANCH)
  const openOf = async () =>
    (await invoke('time:snapshot')).open.find((p) => p.sessionId === id) ?? null
  const open3 = await openOf()
  check(
    'an ad-hoc spawn in the #9202 worktree with #9201 chosen records 9201, flagged, on its branch',
    safe &&
      picked &&
      form.cwd === BRANCH &&
      form.task === '#9201' &&
      spawned.length === 1 &&
      open3?.taskId === 9201 &&
      open3.taskByHand === true &&
      open3.branch === BRANCH &&
      worktree !== undefined &&
      open3.cwd.toLowerCase() === worktree.path.toLowerCase(),
    `${JSON.stringify(form)}; ${spawned.length} spawned; open ${JSON.stringify(open3 && [open3.taskId, open3.taskByHand, open3.branch])}`
  )

  const row = railRow(` · ${BRANCH}`)
  await until(`${row} !== undefined`, 40)
  const group3 = await railGroupOf(row)
  check(
    'its rail row sits under #9201, not under #9202',
    group3?.id === '#9201',
    JSON.stringify(group3)
  )

  await evaluate(`${row}?.click(), true`)
  await sleep(600)
  const strip = await evaluate(`document.querySelector('.agents-strip-task')?.textContent ?? null`)
  await evaluate(`document.querySelector('.agents-strip-task-btn')?.click(), true`)
  await sleep(300)
  const unlinked = await choose(STRIP_HOST, 'From branch')
  await sleep(1200)
  const open4 = await openOf()
  const group4 = await railGroupOf(row)
  check(
    "its strip's From branch records its branch's 9202 with no flag and moves its row under #9202",
    strip === '#9201' &&
      unlinked &&
      open4?.taskId === 9202 &&
      !('taskByHand' in open4) &&
      open4.id !== open3?.id &&
      group4?.id === '#9202',
    `strip ${strip}; open ${JSON.stringify(open4 && [open4.taskId, open4.taskByHand])}; ${JSON.stringify(group4)}`
  )
}

/** 16. Spread looks, the hatch, and focus on a hatched task (HHAT-08, 17, 18, 21, 24..26, 28, 29). */
async function looksSection() {
  const seedStart = new Date(before.periods.find((p) => p.id === seedId(0)).start)
  const seedHeader = dayHeader(
    new Date(seedStart.getFullYear(), seedStart.getMonth(), seedStart.getDate())
  )
  await reloadInto('hours')
  await waitFor(`document.querySelector('.hcal') !== null`, 'the calendar')
  await sleep(300)

  // The spread week: its chips in legend order, which is colouring order.
  for (let i = 0; i < 5; i++) {
    await nav('Previous week')
    await sleep(300)
  }
  const chips = await evaluate(
    `(() => { ${LOOK_SIG}; return [...document.querySelectorAll('.hleg-chip')].map(c => { const s = c.querySelector('.hleg-swatch'); return { label: c.querySelector('.hleg-label').textContent, look: [...s.classList].filter(x => x.startsWith('role-') || x === 'hatched').join(' '), sig: sig(s) } }) })()`
  )
  const shortLooks = chips.map((c) => c.look.replace('role-', '')).join(' | ')
  check(
    'no two neighbouring legend chips of the spread week look alike',
    chips.length === 10 && chips.every((c, i) => i === 0 || c.sig !== chips[i - 1].sig),
    `${chips.length} chips: ${shortLooks}`
  )
  const spreadLooks = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((n) => `role-slot${n}`)
    .concat(['role-slot1 hatched', 'role-slot2 hatched'])
  check(
    "the spread week's chips, by week total, read eight solids then hatched blue and hatched orange",
    chips.length === 10 &&
      chips.every((c, i) => c.label.includes(SPREAD_TITLES[i]) && c.look === spreadLooks[i]),
    chips.map((c) => `${c.label.slice(6, 10)} ${c.look.replace('role-', '')}`).join(' | ')
  )

  // The seeded Sunday: its first hatched task (slot 1 hatched) and its solid twin.
  await nav('This week')
  await sleep(300)
  for (let i = 0; i < 8 && !(await headLabels()).some((l) => l.startsWith(seedHeader)); i++) {
    await nav('Previous week')
    await sleep(300)
  }
  await clickHead(seedHeader)
  await sleep(400)
  const [solidTitle, hatchedTitle] = [SEED_TITLES[0], SEED_TITLES[8]]
  const themes = ['dark', 'light']
  const shownTheme = await evaluate(`document.documentElement.dataset.theme`)
  const worn = {}
  for (const theme of themes) {
    // The ground is compared with a probe's own computed color-mix of the hue.
    worn[theme] = await evaluate(
      `(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)}; const parts = t => [[...document.querySelectorAll('.hcal-col.selected .hcal-bar')].find(b => b.getAttribute('aria-label').split(', ')[0].includes(t)), [...document.querySelectorAll('.hleg-chip')].find(c => c.querySelector('.hleg-label').textContent.includes(t))?.querySelector('.hleg-swatch'), [...document.querySelectorAll('.hours-drawer .hours-group')].find(g => g.querySelector('.hours-group-label').textContent.includes(t))?.querySelector('.hours-group-swatch')]; const read = el => { if (!el) return null; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { color: s.backgroundColor, image: s.backgroundImage, w: r.width, h: r.height } }; const probe = document.createElement('div'); probe.style.backgroundColor = 'color-mix(in oklab, ${rgb(PALETTE[theme][0])} 5%, #fff)'; document.body.append(probe); const ground = getComputedStyle(probe).backgroundColor; probe.remove(); return { hatched: parts(${JSON.stringify(hatchedTitle)}).map(read), solid: parts(${JSON.stringify(solidTitle)}).map(read), ground } })()`
    )
  }
  await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(shownTheme)}, true`)
  const stripes = (hex) =>
    `repeating-linear-gradient(45deg, ${rgb(hex)} 0px, ${rgb(hex)} 3px, rgba(0, 0, 0, 0) 3px, rgba(0, 0, 0, 0) 6px)`
  check(
    "the first hatched task's bar, legend swatch and drawer swatch show 45° stripes of its hue, 3 px in every 6 px, in both themes",
    themes.every((t) => worn[t].hatched.every((p) => p?.image === stripes(PALETTE[t][0]))),
    themes.map((t) => `${t}: ${worn[t].hatched.map((p) => p?.image ?? 'missing')[0]}`).join(' / ')
  )
  check(
    "the hatched task's stripes lie over its hue mixed 5% with white, in both themes",
    themes.every(
      (t) =>
        worn[t].ground !== rgb(PALETTE[t][0]) &&
        worn[t].hatched.every((p) => p?.color === worn[t].ground)
    ),
    themes
      .map(
        (t) => `${t} probe ${worn[t].ground}: ${worn[t].hatched.map((p) => p?.color).join(', ')}`
      )
      .join(' / ')
  )
  check(
    "its solid twin's bar and swatches are filled with the hue and show no stripes, in both themes",
    themes.every((t) =>
      worn[t].solid.every((p) => p?.image === 'none' && p.color === rgb(PALETTE[t][0]))
    ),
    themes
      .map((t) => `${t}: ${worn[t].solid.map((p) => `${p?.color} ${p?.image}`).join(', ')}`)
      .join(' / ')
  )
  const sizes = [worn.dark.hatched, worn.dark.solid].flatMap(([, chip, row]) => [chip, row])
  check(
    'the legend and drawer swatches measure 14 × 14 px',
    sizes.every((p) => p && Math.abs(p.w - 14) < 0.01 && Math.abs(p.h - 14) < 0.01),
    sizes.map((p) => (p ? `${p.w}×${p.h}` : 'missing')).join(', ')
  )

  // Focus on the hatched task, as section 12 does for solid ones (HHAT-24..26).
  const hatched = await labelOf(hatchedTitle)
  const shown = (list) =>
    [...new Set(list.map((b) => `${b.label === hatched ? 'H' : '·'}${b.opacity}`))].join(' ')
  await pointAway()
  const rest = await bars()
  const looks = lookOf(rest)
  const pointedChip = await pointAt(chipOf(hatched))
  const chipHover = await bars()
  await pointAway()
  const chipLeft = await bars()
  check(
    "pointing at the hatched task's chip leaves only its bars at full opacity, and leaving restores them",
    Boolean(hatched) &&
      allFull(rest) &&
      pointedChip &&
      onlyFull(chipHover, hatched) &&
      allFull(chipLeft),
    `${hatched}: ${shown(chipHover)} / ${shown(chipLeft)}`
  )
  // The ninth of fourteen groups sits below the drawer's fold.
  await evaluate(`${rowOf(hatched)}?.scrollIntoView({ block: 'center' }), true`)
  await sleep(200)
  const pointedRow = await pointAt(rowOf(hatched))
  const rowHover = await bars()
  await pointAway()
  const rowLeft = await bars()
  const pointedBar = await pointAt(barOf(hatched))
  const barHover = await bars()
  await pointAway()
  const barLeft = await bars()
  check(
    "pointing at the hatched task's drawer header or bar does the same",
    pointedRow &&
      onlyFull(rowHover, hatched) &&
      allFull(rowLeft) &&
      pointedBar &&
      onlyFull(barHover, hatched) &&
      allFull(barLeft),
    `row ${pointedRow} ${shown(rowHover)}, bar ${pointedBar} ${shown(barHover)}`
  )
  await evaluate(`${chipOf(hatched)}?.querySelector('.hleg-pick')?.focus(), true`)
  await sleep(400)
  const chipFocus = await bars()
  await evaluate(`document.activeElement.blur(), true`)
  await sleep(400)
  const chipBlurred = await bars()
  await evaluate(`${barOf(hatched)}?.focus(), true`)
  await sleep(400)
  const barFocus = await bars()
  await evaluate(`document.activeElement.blur(), true`)
  await sleep(400)
  const barBlurred = await bars()
  check(
    "keyboard focus on the hatched task's chip or bar fades the other tasks, and leaving restores them",
    onlyFull(chipFocus, hatched) &&
      allFull(chipBlurred) &&
      onlyFull(barFocus, hatched) &&
      allFull(barBlurred),
    `chip ${shown(chipFocus)}, bar ${shown(barFocus)}`
  )
  await evaluate(`${chipOf(hatched)}?.querySelector('.hleg-pick')?.click(), true`)
  await sleep(400)
  const pickedHeads = await headLabels()
  const picked = await bars()
  const pressed = await pressedChips()
  check(
    "clicking the hatched task's chip shows only the seeded Sunday, the chip selected with its ×",
    pickedHeads.length === 1 &&
      pickedHeads[0].startsWith(seedHeader) &&
      pressed.length === 1 &&
      pressed[0].label === hatched &&
      pressed[0].clear &&
      onlyFull(picked, hatched),
    `${pickedHeads.map((l) => l.slice(0, 16)).join(' | ')}; ${JSON.stringify(pressed)}`
  )
  await evaluate(`${chipOf(hatched)}?.querySelector('.hleg-clear')?.click(), true`)
  await sleep(400)
  const clearedHeads = await headLabels()
  const cleared = await bars()
  const clearedPressed = await pressedChips()
  check(
    'its × shows every day again',
    pickedHeads.length === 1 &&
      clearedHeads.length === 6 &&
      clearedPressed.length === 0 &&
      allFull(cleared),
    `${pickedHeads.length} day picked, ${clearedHeads.length} after ×`
  )
  check(
    'no bar changes its look while the hatched task is pointed at, focused, picked or cleared',
    [chipHover, rowHover, barHover, chipFocus, barFocus, picked, cleared].every((list) =>
      sameLooks(list, looks)
    ) &&
      looks.size === 14 &&
      new Set(looks.values()).size === 14,
    `${looks.size} bars, ${new Set(looks.values()).size} looks`
  )
}

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

  // SMOKE_ONLY=assign skips sections 1 to 12 and 16: nothing in 13 to 15 reads
  // them. SMOKE_ONLY=looks runs section 16 alone: it reads only the seed.
  if (ONLY === 'looks') {
    await looksSection()
  } else {
    if (ONLY !== 'assign') await calendarSections()
    await periodSection()
    await railSection()
    await dialogSection()
    if (ONLY !== 'assign') await looksSection()
  }
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
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed${ONLY === 'assign' ? ' (sections 13 to 15 only)' : ONLY === 'looks' ? ' (section 16 only)' : ''}`
)
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
const leftBehind = [seededDir, POINTER].filter((p) => existsSync(p))
if (leftBehind.length > 0) {
  console.error(`Checks passed, but clean-up left: ${leftBehind.join(', ')}`)
  process.exit(1)
}
console.log(`App closed; deleted ${seededDir} and ${POINTER}`)
process.exit(0)
