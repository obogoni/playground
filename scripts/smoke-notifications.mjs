/* CDP smoke for Session Activity Notifications (NOTF). Proves what the unit tests
 * structurally cannot: the settings tabs and switches in the real dialog, and a
 * hook event travelling main → SessionNotifier → `session:notice` → an in-app
 * notice that opens its session when clicked.
 *
 * COST: zero tokens. The throwaway agent runs `claude --version`, so the hooked
 * launch prints a version and exits, and the hosting shell keeps the session's
 * PLAYGROUND_ACTIVITY_TOKEN. The script reads that token from the terminal and
 * POSTs documentation-shaped hook payloads to the app's loopback endpoint itself.
 *
 * SAFE ON REAL DATA: the dev app shares %APPDATA%\playground. The script never
 * stops or removes a session it did not create, and it puts every notification
 * switch back the way it found it.
 *
 * The in-app checks need the playground window FOCUSED: an unfocused window
 * takes the OS-notification path instead, which is correct but not what these
 * checks read. The script waits for you to click the window when it is not.
 *
 * NOT automatable here (hand-verify):
 *   - the OS notification with the app in the background, its wording, and that
 *     clicking it brings the window forward with the session selected (NOTF-01,
 *     NOTF-05, NOTF-07, NOTF-08)
 *   - clicking an OS notification left on screen for a minute or more: the
 *     notification is held against garbage collection (design Risks)
 *   - a minimized window takes the OS path and is restored by the click (NOTF-24)
 *   - no OS notification and no notice while focused on the session itself (NOTF-03)
 *   - the two-theme visual pass of the tabs, the switches (disabled state) and
 *     the notice stack
 *
 * CODE READING ONLY (not reproducible on a Windows desktop):
 *   - NOTF-06: an OS without notification support. `showOs` returns before
 *     constructing anything when `Notification.isSupported()` is false
 *     (`src/main/index.ts`, the `showOs` helper)
 *   - NOTF-21: a click after the window was destroyed. `revealWindow` returns on
 *     a missing or destroyed window and `emitToWindow` on a missing one; on
 *     Windows closing the last window quits the app, so the click cannot outlive it
 *
 * Requires: `claude` on PATH. Sessions run in C:/Windows, never in a repo, and no
 * input is typed until the terminal shows `claude --version` has printed: on this
 * machine a registry agent is the real CLI, and text sent to it is a prompt.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-notifications.mjs              (in another)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const SMOKE_AGENT = 'Claude (notifications smoke)'
const TITLE_A = 'Notify smoke A'
const TITLE_B = 'Notify smoke B'
const SWITCH_KEYS = [
  'notify',
  'notifyNeedsApproval',
  'notifyNeedsInput',
  'notifyWaiting',
  'notifyError'
]
const SETTINGS_PATH = join(
  process.env.APPDATA ?? '',
  'playground',
  'agent-hooks',
  'claude-settings.json'
)

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
function send(ws, method, params = {}) {
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

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  const r = result.result
  if (r.subtype === 'error') throw new Error(r.description)
  return r.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function waitFor(ws, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await evaluate(ws, expression)
    if (value) return value
    await sleep(250)
  }
  return null
}

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

const config = await evaluate(ws, `window.api.invoke('config:get')`)
const originalSwitches = Object.fromEntries(SWITCH_KEYS.map((k) => [k, config.ui[k]]))
const shell = config.ui.defaultShell
const originalDirection = config.ui.direction
const CWD = 'C:/Windows'
const VERSION_PATTERN = /\d+\.\d+\.\d+ \(Claude Code\)/
const created = []

async function cleanup() {
  // null marks a switch that was absent; it goes back as undefined, which the
  // config file drops, so an absent key stays absent.
  const restore = JSON.stringify(
    Object.fromEntries(SWITCH_KEYS.map((k) => [k, originalSwitches[k] ?? null]))
  )
  const ids = JSON.stringify(created)
  await evaluate(
    ws,
    `(async () => {
       for (const id of ${ids}) { try { await window.api.invoke('sessions:stop', { id }) } catch {} }
       for (const id of ${ids}) { try { await window.api.invoke('sessions:remove', { id }) } catch {} }
       const cfg = await window.api.invoke('config:get')
       await window.api.invoke('config:patch', {
         agents: cfg.agents.filter((a) => a.name !== ${JSON.stringify(SMOKE_AGENT)}),
         ui: {
           ...Object.fromEntries(Object.entries(${restore}).map(([k, v]) => [k, v ?? undefined])),
           direction: ${JSON.stringify(originalDirection)}
         }
       })
       return true
     })()`
  )
}

function finish() {
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}

async function readSwitches() {
  const cfg = await evaluate(ws, `window.api.invoke('config:get')`)
  return Object.fromEntries(SWITCH_KEYS.map((k) => [k, cfg.ui[k]]))
}

// Start from every switch on, so the checks below read a known baseline.
await evaluate(
  ws,
  `window.api.invoke('config:patch', { ui: ${JSON.stringify(
    Object.fromEntries(SWITCH_KEYS.map((k) => [k, true]))
  )} }).then(() => true)`
)

// --- 1. Settings: tabs (NOTF-28, NOTF-29) ---
await evaluate(ws, `(document.querySelector('.topbar-icon-btn[title="Settings"]').click(), true)`)
await waitFor(ws, `Boolean(document.querySelector('.set-tabs'))`, 5000)

const opened = JSON.parse(
  await evaluate(
    ws,
    `JSON.stringify({
       active: document.querySelector('.set-tab[aria-selected="true"]')?.textContent ?? null,
       title: document.querySelector('.dialog-task-title')?.textContent ?? null
     })`
  )
)
check(
  'the settings dialog opens on the General tab (NOTF-28)',
  opened.active === 'General' && opened.title === 'Azure DevOps, agents & shell',
  JSON.stringify(opened)
)

const clickTab = (label) =>
  evaluate(
    ws,
    `(() => {
       const tab = [...document.querySelectorAll('.set-tab')].find((t) => t.textContent === ${JSON.stringify(label)})
       tab?.click()
       return Boolean(tab)
     })()`
  )

const EDIT = 'smoke/{id}-unsaved'
await evaluate(
  ws,
  `(() => {
     // The branch template is the first input whose placeholder is a template.
     const branch = [...document.querySelectorAll('.dialog-input')].find((i) => i.placeholder && i.placeholder.includes('{'))
     const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
     setter.call(branch, ${JSON.stringify(EDIT)})
     branch.dispatchEvent(new Event('input', { bubbles: true }))
     return true
   })()`
)
await clickTab('Notifications')
await sleep(150)
const onNotifications = await evaluate(
  ws,
  `document.querySelector('.dialog-task-title')?.textContent ?? ''`
)
check(
  'the header title follows the Notifications tab',
  onNotifications === 'Agent notifications',
  onNotifications
)
await clickTab('General')
await sleep(150)
const kept = await evaluate(
  ws,
  `[...document.querySelectorAll('.dialog-input')].find((i) => i.placeholder && i.placeholder.includes('{'))?.value ?? ''`
)
check('an unsaved General edit survives a tab round trip (NOTF-29)', kept === EDIT, kept)

// An open agent form is the other piece of General state that must survive.
const FORM_NAME = 'Unsaved smoke agent'
await evaluate(ws, `(document.querySelector('.set-agent-add')?.click(), true)`)
await sleep(150)
await evaluate(
  ws,
  `(() => {
     const name = document.querySelector('.set-agent-form input')
     const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
     setter.call(name, ${JSON.stringify(FORM_NAME)})
     name.dispatchEvent(new Event('input', { bubbles: true }))
     return Boolean(name)
   })()`
)
await clickTab('Notifications')
await sleep(150)
await clickTab('General')
await sleep(150)
const formKept = await evaluate(
  ws,
  `document.querySelector('.set-agent-form input')?.value ?? null`
)
check(
  'an open agent form survives a tab round trip (NOTF-29)',
  formKept === FORM_NAME,
  String(formKept)
)

// --- 2. Settings: switches (NOTF-16, NOTF-18, NOTF-19, NOTF-20) ---
await clickTab('Notifications')
await sleep(150)

const checkboxes = () =>
  evaluate(
    ws,
    `JSON.stringify([...document.querySelectorAll('[role="tabpanel"] input[type="checkbox"]')].map((c) => ({
       label: c.closest('label')?.querySelector('.dialog-check-text')?.firstChild?.textContent?.trim() ?? '',
       checked: c.checked,
       disabled: c.disabled
     })))`
  ).then(JSON.parse)

const clickCheckbox = (label) =>
  evaluate(
    ws,
    `(() => {
       const box = [...document.querySelectorAll('[role="tabpanel"] input[type="checkbox"]')].find(
         (c) => c.closest('label')?.querySelector('.dialog-check-text')?.firstChild?.textContent?.trim() === ${JSON.stringify(label)}
       )
       box?.click()
       return Boolean(box)
     })()`
  )

const initial = await checkboxes()
check(
  'the Notifications tab offers the master and one switch per state (NOTF-18)',
  JSON.stringify(initial.map((c) => c.label)) ===
    JSON.stringify([
      'Notify me about agent sessions',
      'Needs approval',
      'Needs input',
      'Finished its turn',
      'Turn failed'
    ]),
  initial.map((c) => c.label).join(', ')
)

await clickCheckbox('Finished its turn')
await sleep(300)
let switches = await readSwitches()
check(
  'a state switch persists immediately and only its own key (NOTF-16)',
  switches.notifyWaiting === false &&
    switches.notify === true &&
    switches.notifyNeedsApproval === true,
  JSON.stringify(switches)
)

await clickCheckbox('Notify me about agent sessions')
await sleep(300)
switches = await readSwitches()
const masterOff = await checkboxes()
check(
  'the master persists without rewriting the state switches (NOTF-19)',
  switches.notify === false && switches.notifyWaiting === false && switches.notifyError === true,
  JSON.stringify(switches)
)
check(
  'state switches are disabled and keep their values while the master is off (NOTF-20)',
  masterOff.slice(1).every((c) => c.disabled) &&
    JSON.stringify(masterOff.slice(1).map((c) => c.checked)) ===
      JSON.stringify([true, true, false, true]),
  JSON.stringify(masterOff.slice(1))
)

await clickCheckbox('Notify me about agent sessions')
await sleep(300)
const masterOn = await checkboxes()
check(
  'turning the master back on restores the previous state choices (NOTF-19)',
  masterOn.slice(1).every((c) => !c.disabled) &&
    JSON.stringify(masterOn.map((c) => c.checked)) ===
      JSON.stringify([true, true, true, false, true]),
  JSON.stringify(masterOn)
)

// Close without saving: the unsaved template edit is discarded.
await evaluate(
  ws,
  `([...document.querySelectorAll('.dialog-btn-ghost')].find((b) => b.textContent === 'Cancel')?.click(), true)`
)

// --- 3. Sessions to notify about ---
let settings
try {
  settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
} catch (err) {
  check('the app wrote its hook settings file', false, `${SETTINGS_PATH}: ${err.message}`)
  await cleanup()
  finish()
}
const url = settings?.hooks?.Stop?.[0]?.hooks?.[0]?.url
check('the app wrote its hook settings file', Boolean(url), url ?? SETTINGS_PATH)

await evaluate(
  ws,
  `(async () => {
     const cfg = await window.api.invoke('config:get')
     const agents = cfg.agents.filter((a) => a.name !== ${JSON.stringify(SMOKE_AGENT)})
     await window.api.invoke('config:patch', {
       agents: [...agents, { name: ${JSON.stringify(SMOKE_AGENT)}, command: 'claude', args: ['--version'], color: '--accent' }]
     })
     return true
   })()`
)

async function spawn(title) {
  const id = await evaluate(
    ws,
    `(async () => {
       const view = await window.api.invoke('sessions:spawn', { agentName: ${JSON.stringify(SMOKE_AGENT)}, cwd: ${JSON.stringify(CWD)} })
       await window.api.invoke('sessions:rename', { id: view.id, title: ${JSON.stringify(title)} })
       return view.id
     })()`
  )
  created.push(id)
  return id
}

const idA = await spawn(TITLE_A)
await spawn(TITLE_B)
// A direct-IPC spawn pushes no event; a status change makes the renderer re-fetch.
const nudge = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${JSON.stringify(CWD)}, adhocCommand: 'exit' })).id)()`
)
created.push(nudge)
await evaluate(
  ws,
  `(async () => { try { await window.api.invoke('sessions:stop', { id: '${nudge}' }) } catch {} return true })()`
)

await evaluate(
  ws,
  `(() => {
     const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => /Agents/.test(b.textContent))
     seg?.click()
     return true
   })()`
)

const selectRow = (title) =>
  waitFor(
    ws,
    `(() => {
       const row = [...document.querySelectorAll('.rail-row')].find((r) => r.querySelector('.rail-row-label')?.textContent === ${JSON.stringify(title)})
       row?.click()
       return Boolean(row)
     })()`,
    10000
  )

const selectedLabel = () =>
  evaluate(ws, `document.querySelector('.rail-row.selected .rail-row-label')?.textContent ?? ''`)

// Read session A's token from its own shell.
await selectRow(TITLE_A)
// Type nothing until `claude --version` has printed and exited: before that the
// input would reach the real CLI as a prompt.
const versionShown = await waitFor(
  ws,
  `new RegExp(${JSON.stringify(VERSION_PATTERN.source)}).test(document.querySelector('.xterm-rows')?.textContent ?? '')`,
  20000
)
check('the smoke agent printed its version and left the shell', Boolean(versionShown))
if (!versionShown) {
  await cleanup()
  finish()
}
await sleep(1500)
const echo = shell === 'cmd' ? 'echo %PLAYGROUND_ACTIVITY_TOKEN%' : '$env:PLAYGROUND_ACTIVITY_TOKEN'
await evaluate(
  ws,
  `(window.api.send('session:input', { id: '${idA}', data: ${JSON.stringify(echo + '\r')} }), true)`
)
const token = await waitFor(
  ws,
  `(() => {
     const text = document.querySelector('.xterm-rows')?.textContent ?? ''
     const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
     return m ? m[0] : null
   })()`,
  10000
)
check("read session A's hook token from its shell", Boolean(token))
if (!token) {
  await cleanup()
  finish()
}

async function hook(name, extra = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: 'smoke', hook_event_name: name, ...extra })
  })
  return res.status
}

// Put B on screen, so A is not the attached session.
await selectRow(TITLE_B)
await sleep(500)

const focused = await evaluate(ws, `document.hasFocus()`)
if (!focused) {
  console.log('\n>>> Click the playground window now: the in-app checks need it focused (30 s).\n')
}
const gotFocus = focused || (await waitFor(ws, `document.hasFocus()`, 30000))
check('the playground window is focused for the in-app checks', Boolean(gotFocus))
if (!gotFocus) {
  await cleanup()
  finish()
}

const noticeText = () =>
  evaluate(
    ws,
    `JSON.stringify([...document.querySelectorAll('.session-notice-open')].map((b) => b.textContent))`
  ).then(JSON.parse)

// --- 4. A first event never notifies (NOTF-27); a blocked state does (NOTF-02, NOTF-04) ---
// The first event puts A straight into a notifiable state, as an idle prompt on
// a never-prompted session would.
const status = await hook('Notification', {
  notification_type: 'idle_prompt',
  message: 'Claude is waiting for your input'
})
check('the hook endpoint accepts the token', status >= 200 && status < 300, `${status}`)
await sleep(1200)
check(
  "a session's first activity event raises no notice (NOTF-27)",
  (await noticeText()).length === 0
)

await hook('UserPromptSubmit', { prompt: 'smoke' })

await hook('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'echo ok' } })
const approvalNotice = await waitFor(
  ws,
  `[...document.querySelectorAll('.session-notice-open')].map((b) => b.textContent).join('|') || null`,
  5000
)
check(
  'a blocked session not on screen raises one in-app notice naming the tool (NOTF-02, NOTF-04)',
  approvalNotice === `Claude (notifications smoke) · ${TITLE_A}Needs approval to run Bash`,
  approvalNotice ?? '(none)'
)

// --- 5. Clicking the notice opens the session (NOTF-05) ---
await evaluate(ws, `(document.querySelector('.session-notice-open')?.click(), true)`)
await sleep(500)
check(
  'clicking the notice selects its session',
  (await selectedLabel()) === TITLE_A,
  await selectedLabel()
)
check('the clicked notice is gone', (await noticeText()).length === 0)

// --- 6. A state switched off stays silent; switched on, it notifies (NOTF-14) ---
await selectRow(TITLE_B)
await sleep(500)
await evaluate(
  ws,
  `window.api.invoke('config:patch', { ui: { notifyWaiting: false } }).then(() => true)`
)
await hook('PostToolUse', { tool_name: 'Bash' })
await hook('Stop')
await sleep(1500)
check(
  'entering a state whose switch is off raises no notice (NOTF-14)',
  (await noticeText()).length === 0
)

await evaluate(
  ws,
  `window.api.invoke('config:patch', { ui: { notifyWaiting: true } }).then(() => true)`
)
await hook('UserPromptSubmit', { prompt: 'smoke' })
await hook('Stop')
const finishedNotice = await waitFor(
  ws,
  `[...document.querySelectorAll('.session-notice-open')].map((b) => b.textContent).join('|') || null`,
  5000
)
check(
  'the same transition notifies once its switch is back on',
  finishedNotice === `Claude (notifications smoke) · ${TITLE_A}Finished its turn`,
  finishedNotice ?? '(none)'
)

// --- 7. The notice dismisses itself ---
const gone = await waitFor(ws, `document.querySelectorAll('.session-notice').length === 0`, 10000)
check('an unclicked notice dismisses itself after a few seconds', Boolean(gone))

// --- 8. From another direction, a notice for a stopped session still opens it
//        in the agents direction (NOTF-05, NOTF-23) ---
await hook('UserPromptSubmit', { prompt: 'smoke' })
await hook('Stop')
const lateNotice = await waitFor(
  ws,
  `document.querySelectorAll('.session-notice-open').length === 1`,
  5000
)
check('a new transition raises a notice again', Boolean(lateNotice))

await evaluate(
  ws,
  `(() => {
     const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => /Tree/.test(b.textContent))
     seg?.click()
     return true
   })()`
)
await evaluate(
  ws,
  `(async () => { try { await window.api.invoke('sessions:stop', { id: '${idA}' }) } catch {} return true })()`
)
const stoppedInTree = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const s = (await window.api.invoke('sessions:list')).find((s) => s.id === '${idA}')
       return JSON.stringify({
         status: s?.status ?? null,
         direction: document.querySelector('.topbar-segment.active')?.textContent?.trim() ?? null,
         notice: document.querySelectorAll('.session-notice-open').length
       })
     })()`
  )
)
check(
  'the setup is a stopped session, the Tree direction and its notice still up',
  stoppedInTree.status === 'stopped' &&
    stoppedInTree.direction === 'Tree' &&
    stoppedInTree.notice === 1,
  JSON.stringify(stoppedInTree)
)

await evaluate(ws, `(document.querySelector('.session-notice-open')?.click(), true)`)
await sleep(600)
const opened2 = JSON.parse(
  await evaluate(
    ws,
    `JSON.stringify({
       direction: document.querySelector('.topbar-segment.active')?.textContent?.trim() ?? null,
       selected: document.querySelector('.rail-row.selected .rail-row-label')?.textContent ?? null
     })`
  )
)
check(
  'clicking it switches to the agents direction (NOTF-05)',
  opened2.direction === 'Agents',
  JSON.stringify(opened2)
)
check(
  'and selects the session even though it was stopped (NOTF-23)',
  opened2.selected === TITLE_A,
  JSON.stringify(opened2)
)

// --- Cleanup ---
await cleanup()
const after = await evaluate(
  ws,
  `(async () => {
     const cfg = await window.api.invoke('config:get')
     const ids = (await window.api.invoke('sessions:list')).map((s) => s.id)
     return JSON.stringify({
       leftover: ${JSON.stringify(created)}.filter((id) => ids.includes(id)).length,
       agent: cfg.agents.some((a) => a.name === ${JSON.stringify(SMOKE_AGENT)}),
       switches: Object.fromEntries(${JSON.stringify(SWITCH_KEYS)}.map((k) => [k, cfg.ui[k]]))
     })
   })()`
)
const state = JSON.parse(after)
check(
  'cleanup removed only the smoke sessions and agent, and restored the switches',
  state.leftover === 0 &&
    !state.agent &&
    JSON.stringify(state.switches) === JSON.stringify(originalSwitches),
  after
)

finish()
