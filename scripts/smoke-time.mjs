/* CDP smoke for Time Tracking (TIME-01..49). Proves, against a running dev app,
 * the slice unit tests cannot reach — the real PTY lifecycle feeding the tracker,
 * the IPC round-trip and the rendered surfaces:
 *   1. spawning a session opens a period; its cwd is not a git worktree, so the
 *      snapshot fields are null (TIME-01, TIME-03, TIME-12)
 *   2. the rail row renders `hh:mm:ss` and advances while the period is open (TIME-22)
 *   3. Pause time closes the period, marks the session paused and freezes the
 *      detail-bar counter; Resume time opens a new period (TIME-16, TIME-17, TIME-18)
 *   4. stopping the session closes the open period (TIME-02)
 *   5. the Hours direction lists today with a `No task · Windows` group, and the
 *      direction survives a reload (TIME-31, TIME-34, TIME-35)
 *   5b. ◀ and ▶ show the previous and next week, This week returns (TIME-33)
 *   6. Copy writes today's text with the exact header line and shows `Copied`
 *      (TIME-39, TIME-41)
 *   7. expanding a line lists its raw periods, each closed one with Edit and
 *      Delete; an invalid adjust is rejected; delete removes a period (TIME-38,
 *      TIME-44, TIME-46)
 *
 * NOT automatable here (hand-verify, record the result in validation.md):
 *   - crash recovery (TIME-05): kill the Electron process while a session runs
 *     for over a minute, relaunch, and check the log holds a period ending at
 *     most 60 s before the kill
 *   - suspend / resume (TIME-06, TIME-07) and screen lock (TIME-08)
 *   - the two-theme visual pass of the counters and the Hours view; set
 *     SMOKE_SHOTS=<dir> to have this script save both theme screenshots there
 *
 * The session is ad-hoc `pwsh` in C:/Windows — never a registry agent, which on
 * a machine with the CLI installed starts a real agent. The script restores the
 * owner's direction and theme and deletes every period it created.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-time.mjs                       (in another)
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const SHOTS = process.env.SMOKE_SHOTS
const CWD = 'C:\\Windows'
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

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

async function shot(name) {
  if (!SHOTS) return
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOTS, name), Buffer.from(data, 'base64'))
}

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const pad = (n) => String(n).padStart(2, '0')
const today = new Date()
const todayHeader = `${pad(today.getDate())}/${pad(today.getMonth() + 1)}/${today.getFullYear()} (${WEEKDAYS[today.getDay()]})`

/** The Hours header range `dd/MM – dd/MM/yyyy` of the week `offset` weeks from this one. */
function weekLabel(offset) {
  const sinceMonday = (today.getDay() + 6) % 7
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - sinceMonday + 7 * offset
  )
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  const dm = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
  return `${dm(monday)} – ${dm(sunday)}/${sunday.getFullYear()}`
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
const before = await invoke('time:snapshot')
const knownPeriods = new Set(before.periods.map((p) => p.id))
let sessionId = null

try {
  // 1. Spawn opens a period with a null snapshot.
  const view = await invoke('sessions:spawn', {
    agentName: 'Ad-hoc',
    cwd: CWD,
    adhocCommand: 'pwsh -NoLogo -NoProfile'
  })
  sessionId = view.id
  await sleep(1500)
  const s1 = await invoke('time:snapshot')
  const opened = s1.open.find((p) => p.sessionId === sessionId)
  check('spawn opens a period', Boolean(opened))
  check(
    'a cwd outside git records null workspace, repo, branch and task',
    opened &&
      opened.workspacePath === null &&
      opened.repoName === null &&
      opened.branch === null &&
      opened.taskId === null
  )

  // 2. Rail counter renders and advances.
  await reloadInto('agents')
  await waitFor(`document.querySelector('.rail-row') !== null`, 'rail rows')
  const rowTime = `(() => { const g = [...document.querySelectorAll('.rail-group')].find(g => g.textContent.includes('Windows') && g.querySelector('.rail-row-status.running')); return g?.querySelector('.rail-row-time')?.textContent ?? null })()`
  const t1 = await evaluate(rowTime)
  await sleep(2200)
  const t2 = await evaluate(rowTime)
  check('rail row shows hh:mm:ss', /^\d{2,}:\d{2}:\d{2}$/.test(t1 ?? ''), `${t1}`)
  check('rail counter advances while open', t1 !== t2, `${t1} → ${t2}`)

  // 3. Pause freezes, resume reopens.
  await evaluate(
    `[...document.querySelectorAll('.rail-group')].find(g => g.textContent.includes('Windows') && g.querySelector('.rail-row-status.running')).querySelector('.rail-row').click(), true`
  )
  await waitFor(
    `[...document.querySelectorAll('.agents-detail-btn')].some(b => b.textContent.includes('Pause time'))`,
    'the Pause time control'
  )
  await shot('time-agents-dark.png')
  await evaluate(
    `[...document.querySelectorAll('.agents-detail-btn')].find(b => b.textContent.includes('Pause time')).click(), true`
  )
  await waitFor(
    `[...document.querySelectorAll('.agents-detail-btn')].some(b => b.textContent.includes('Resume time'))`,
    'the Resume time control'
  )
  const s2 = await invoke('time:snapshot')
  check('pause marks the session paused', s2.paused.includes(sessionId))
  check(
    'pause closes the open period',
    !s2.open.some((p) => p.sessionId === sessionId) &&
      s2.periods.some((p) => p.sessionId === sessionId)
  )
  const frozen1 = await evaluate(`document.querySelector('.agents-detail-time')?.textContent`)
  await sleep(2200)
  const frozen2 = await evaluate(`document.querySelector('.agents-detail-time')?.textContent`)
  check('paused counter does not advance', frozen1 === frozen2, `${frozen1} → ${frozen2}`)

  await evaluate(
    `[...document.querySelectorAll('.agents-detail-btn')].find(b => b.textContent.includes('Resume time')).click(), true`
  )
  await sleep(1500)
  const s3 = await invoke('time:snapshot')
  check(
    'resume opens a new period and clears the mark',
    s3.open.some((p) => p.sessionId === sessionId) && !s3.paused.includes(sessionId)
  )

  // 4. Stop closes the period.
  await invoke('sessions:stop', { id: sessionId })
  const s4 = await invoke('time:snapshot')
  const mine = s4.periods.filter((p) => p.sessionId === sessionId)
  check('stop closes the open period', !s4.open.some((p) => p.sessionId === sessionId))
  check('the session recorded two periods', mine.length === 2, `${mine.length}`)

  // 5. Hours lists today, and the direction survives a reload.
  await reloadInto('hours')
  await waitFor(`document.querySelector('.hours-view') !== null`, 'the Hours view')
  check('Hours direction renders after a reload', true)
  const todayCard = `[...document.querySelectorAll('.hours-day')].find(d => d.querySelector('.hours-day-title')?.textContent === ${JSON.stringify(todayHeader)})`
  check(
    'today is listed with its pt-BR header',
    await evaluate(`Boolean(${todayCard})`),
    todayHeader
  )
  check(
    'task-less time is grouped as No task · Windows',
    await evaluate(
      `[...(${todayCard})?.querySelectorAll('.hours-group-label') ?? []].some(l => l.textContent === 'No task · Windows')`
    )
  )
  await shot('time-hours-dark.png')

  // 5b. Week navigation.
  const range = () => evaluate(`document.querySelector('.hours-head-range').textContent`)
  const nav = (label) =>
    evaluate(
      `[...document.querySelectorAll('.hours-nav-btn')].find(b => (b.getAttribute('aria-label') ?? b.textContent) === ${JSON.stringify(label)}).click(), true`
    )
  check('Hours opens on the current week', (await range()) === weekLabel(0), await range())
  await nav('Previous week')
  await sleep(200)
  check('◀ shows the previous week', (await range()) === weekLabel(-1), await range())
  await nav('This week')
  await sleep(200)
  check('This week returns to the current week', (await range()) === weekLabel(0), await range())
  await nav('Next week')
  await sleep(200)
  check('▶ shows the next week', (await range()) === weekLabel(1), await range())
  await nav('This week')
  await sleep(200)

  // 6. Copy writes the exact header and confirms.
  await evaluate(`window.focus(), true`)
  await evaluate(`(${todayCard}).querySelector('.hours-copy-btn').click(), true`)
  await sleep(400)
  const copied = await evaluate(`(${todayCard}).querySelector('.hours-copy-btn').textContent`)
  check('Copy shows Copied', copied.includes('Copied'), copied)
  const clipboard = await evaluate(`navigator.clipboard.readText()`).catch((err) => `ERR ${err}`)
  // The Windows clipboard hands the text back with CRLF line ends.
  const [header, ...lines] = clipboard.split(/\r?\n/)
  check(
    'copied header is `dd/MM/yyyy (ddd) — total XhMM`',
    header.startsWith(`${todayHeader} — total `) &&
      /^\d+h\d{2}$/.test(header.slice(`${todayHeader} — total `.length)),
    header
  )
  check(
    'copied lines are `HH:MM–HH:MM  <label>  XhMM`',
    lines.length > 0 && lines.every((l) => /^\d{2}:\d{2}–\d{2}:\d{2} {2}.+ {2}\d+h\d{2}$/.test(l)),
    lines.join(' | ')
  )
  await sleep(1300)
  check(
    'Copied reverts after 1.2 s',
    (await evaluate(`(${todayCard}).querySelector('.hours-copy-btn').textContent`)).includes(
      'Copy'
    ) &&
      !(await evaluate(`(${todayCard}).querySelector('.hours-copy-btn').textContent`)).includes(
        'Copied'
      )
  )

  // 7. Raw periods, edit validation and delete.
  await evaluate(
    `[...(${todayCard}).querySelectorAll('.hours-group')].find(g => g.textContent.includes('No task · Windows')).querySelectorAll('.hours-block-line').forEach(b => b.click()), true`
  )
  await sleep(300)
  const rows = await evaluate(
    `[...(${todayCard}).querySelectorAll('.period-row')].map(r => ({ text: r.textContent, edit: !!r.querySelector('[aria-label="Edit period"]'), del: !!r.querySelector('[aria-label="Delete period"]') }))`
  )
  check('expanded lines list raw periods', rows.length >= 2, `${rows.length}`)
  check(
    'closed periods offer Edit and Delete',
    rows.every((r) => r.edit && r.del)
  )
  check(
    'raw rows show the agent',
    rows.every((r) => r.text.includes('Ad-hoc'))
  )

  const [first, second] = mine
  const rejected = await invoke('time:adjust', { id: first.id, start: first.end, end: first.start })
  check(
    'an adjust with start after end is rejected',
    rejected.ok === false && rejected.error === 'Start must be before end.',
    JSON.stringify(rejected)
  )
  const deleted = await invoke('time:delete', { id: second.id })
  const s5 = await invoke('time:snapshot')
  check(
    'delete removes the period',
    deleted.ok === true && !s5.periods.some((p) => p.id === second.id)
  )

  if (SHOTS) {
    await invoke('config:patch', { ui: { theme: 'light' } })
    await reloadInto('hours')
    await shot('time-hours-light.png')
    await reloadInto('agents')
    await shot('time-agents-light.png')
  }
} finally {
  if (sessionId) {
    await invoke('sessions:stop', { id: sessionId }).catch(() => {})
    await invoke('sessions:remove', { id: sessionId }).catch(() => {})
    const after = await invoke('time:snapshot')
    // Only this session's new periods: another live session may be recording too.
    const created = after.periods.filter(
      (p) => p.sessionId === sessionId && !knownPeriods.has(p.id)
    )
    for (const p of created) {
      await invoke('time:delete', { id: p.id })
    }
  }
  await invoke('config:patch', { ui: { direction: original.direction, theme: original.theme } })
  await send('Page.reload')
  ws.close()
}

const failed = checks.filter((c) => !c.ok)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
