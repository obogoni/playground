/* CDP smoke for AM3 Agent Config & Integration (AGCF-01..08). Proves the
 * automatable slice against a running dev app:
 *   1. (AGCF-01) Settings shows the Coding-agents editor (3 seeded rows + Add)
 *   2. (AGCF-02) Default-shell segmented toggles + persists to config
 *   3. (AGCF-03) New Session dialog renders registry chips + the Ad-hoc chip;
 *      ad-hoc reveals a command input; spawning ad-hoc persists `command` and
 *      leaves the registry unchanged
 *   4. (AGCF-04) rename trims + persists; empty keeps prior; duplicate clones
 *      into a 2nd independent running session
 *   5. (AGCF-06) >=4 running sessions show the rail concurrency banner
 *   6. (AGCF-07) the agent card tile is tinted (inline color-mix style)
 *   7. (AGCF-08) a stopped session exposes a lastOutput preview
 *
 * NOT automatable here (hand-verify): AGCF-05 remove-worktree confirm (needs a
 * registered workspace + worktree), per-agent live add/edit/delete reflection
 * through the Settings form, and the visual colour/theme-toggle confirmation.
 *
 * Agents are shell-hosted, so `claude`/`codex` need not be installed — pwsh
 * stays live and streams, which is enough to prove the wiring.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-agent-config.mjs               (in another)
 */

const PORT = Number(process.env.SMOKE_PORT) || 9222
const CWD = 'C:/Windows'

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

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send(ws, 'Runtime.enable')

for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
  if (i >= 30) throw new Error('Top bar never appeared after 30s')
  await sleep(1000)
}

// Baseline registry length so we can assert ad-hoc never mutates it.
const baseAgents = await evaluate(
  ws,
  `(async () => (await window.api.invoke('config:get')).agents.length)()`
)

// --- 1. AGCF-01: Settings shows the Coding-agents editor ---
await evaluate(
  ws,
  `(() => {
     const gear = document.querySelector('.topbar-icon-btn[title="Settings"]')
     if (gear) gear.click()
     return true
   })()`
)
await sleep(400)
let settings = await evaluate(
  ws,
  `(() => ({
     open: !!document.querySelector('.dialog-backdrop'),
     rows: document.querySelectorAll('.set-agent-row').length,
     add: !!document.querySelector('.set-agent-add'),
     shell: document.querySelectorAll('.set-shell-segment').length
   }))()`
)
// Fallback: the gear selector is theme/markup-dependent; open Settings via state
// is not exposed, so if it didn't open, report it rather than silently passing.
check('Settings opens with the Coding-agents editor', settings.open && settings.rows >= 3, `${settings.rows} agent rows`)
check('Settings has an "Add agent" affordance', settings.add)
check('Settings has the Default-shell segmented (pwsh|cmd)', settings.shell === 2)

// --- 2. AGCF-02: default shell toggles + persists ---
if (settings.shell === 2) {
  await evaluate(
    ws,
    `(() => { const b = [...document.querySelectorAll('.set-shell-segment')].find((x) => x.textContent.trim() === 'cmd'); if (b) b.click(); return true })()`
  )
  await sleep(300)
  const shellNow = await evaluate(
    ws,
    `(async () => (await window.api.invoke('config:get')).ui.defaultShell)()`
  )
  check('default shell persists to config (cmd)', shellNow === 'cmd', shellNow)
  // restore to pwsh
  await evaluate(
    ws,
    `(() => { const b = [...document.querySelectorAll('.set-shell-segment')].find((x) => x.textContent.trim() === 'pwsh'); if (b) b.click(); return true })()`
  )
  await sleep(200)
} else {
  check('default shell persists to config (cmd)', false, 'shell segmented not found')
}
// close settings
await evaluate(ws, `(() => { const b = document.querySelector('.dialog-btn-ghost'); if (b) b.click(); return true })()`)
await sleep(200)

// --- 3. AGCF-03: ad-hoc chip + spawn ---
// Switch to Agents and open the New Session dialog.
await evaluate(
  ws,
  `(() => { const s = [...document.querySelectorAll('.topbar-segment')].find((b) => /Agents/.test(b.textContent)); if (s) s.click(); return true })()`
)
await sleep(300)
await evaluate(
  ws,
  `(() => { const b = document.querySelector('.session-rail-new') || document.querySelector('.agents-empty-new'); if (b) b.click(); return true })()`
)
await sleep(300)
const dlg = await evaluate(
  ws,
  `(() => {
     const adhoc = document.querySelector('.ns-agent-chip.adhoc')
     if (adhoc) adhoc.click()
     return { chips: document.querySelectorAll('.ns-agent-chip').length, hasAdhoc: !!adhoc }
   })()`
)
check('New Session shows registry chips + an Ad-hoc chip', dlg.hasAdhoc && dlg.chips === baseAgents + 1, `${dlg.chips} chips, base ${baseAgents}`)
await sleep(250) // let React re-render after the ad-hoc click
const adhocInput = await evaluate(ws, `!!document.querySelector('.ns-adhoc-input')`)
check('selecting Ad-hoc reveals a command input', adhocInput)
await evaluate(ws, `(() => { const b = document.querySelector('.dialog-btn-ghost'); if (b) b.click(); return true })()`)
await sleep(150)

// Spawn an ad-hoc session via IPC (the dialog cwd grid needs registered
// workspaces; the engine path doesn't).
const adhocView = JSON.parse(
  await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: '${CWD}', adhocCommand: 'echo SMOKE_PREVIEW_OK' })))()`
  )
)
check('ad-hoc spawn persists the command + Ad-hoc agent', adhocView.agent === 'Ad-hoc' && adhocView.command === 'echo SMOKE_PREVIEW_OK')
const afterAdhocAgents = await evaluate(
  ws,
  `(async () => (await window.api.invoke('config:get')).agents.length)()`
)
check('ad-hoc leaves the registry unchanged', afterAdhocAgents === baseAgents, `${afterAdhocAgents} vs ${baseAgents}`)

// --- 4. AGCF-04: rename + duplicate ---
const renamed = JSON.parse(
  await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.invoke('sessions:rename', { id: '${adhocView.id}', title: '  Smoke renamed  ' })))()`
  )
)
check('rename trims + persists the title', renamed.title === 'Smoke renamed', renamed.title)
const noop = JSON.parse(
  await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.invoke('sessions:rename', { id: '${adhocView.id}', title: '   ' })))()`
  )
)
check('empty rename keeps the prior title', noop.title === 'Smoke renamed', noop.title)
const dup = JSON.parse(
  await evaluate(
    ws,
    `(async () => JSON.stringify(await window.api.invoke('sessions:duplicate', { id: '${adhocView.id}' })))()`
  )
)
check('duplicate clones into a new independent running session', dup.id !== adhocView.id && dup.agent === 'Ad-hoc' && dup.status === 'running', `new id ${dup.id?.slice(0, 8)}`)

// --- 5. AGCF-06: concurrency banner at >=4 running ---
// (5 running total: adhocView + dup + 3 extras.)
const extra = []
for (let i = 0; i < 3; i++) {
  const v = JSON.parse(
    await evaluate(
      ws,
      `(async () => JSON.stringify(await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: '${CWD}', adhocCommand: 'echo n${i}' })))()`
    )
  )
  extra.push(v.id)
}
// Direct-IPC spawns push no event, so the rail's list is stale — stop one extra
// to fire session:status, which the App subscribes to and re-fetches on, forcing
// a live rail repaint (leaving 4 running, still at/above the banner threshold).
await evaluate(ws, `(async () => { await window.api.invoke('sessions:stop', { id: '${extra[0]}' }); return true })()`)
await sleep(900)
const runningCount = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:list')).filter((s) => s.status === 'running').length)()`
)
const banner = await evaluate(ws, `!!document.querySelector('.session-rail-warning')`)
check('concurrency banner shows at >=4 running', runningCount >= 4 && banner, `${runningCount} running, banner ${banner}`)

// --- 6. AGCF-07: agent tile is tinted ---
const tinted = await evaluate(
  ws,
  `(() => { const t = document.querySelector('.session-card-tile'); return t ? /color-mix/.test(t.getAttribute('style') || '') : false })()`
)
check('agent card tile is colour-tinted (inline style)', tinted)

// --- 7. AGCF-08: stopped session exposes a lastOutput preview ---
// Let the first ad-hoc echo flush into its buffer, then stop it.
await sleep(1500)
await evaluate(ws, `(async () => { await window.api.invoke('sessions:stop', { id: '${adhocView.id}' }); return true })()`)
await sleep(800)
const stopped = JSON.parse(
  await evaluate(ws, `(async () => JSON.stringify((await window.api.invoke('sessions:list')).find((s) => s.id === '${adhocView.id}')))()`)
)
const previewDom = await evaluate(ws, `document.querySelectorAll('.session-card-preview').length`)
check('stopped session exposes a lastOutput preview', !!stopped && typeof stopped.lastOutput === 'string' && stopped.lastOutput.length > 0, `dom previews: ${previewDom}`)

// --- Cleanup: stop + remove every smoke session, restore shell ---
await evaluate(
  ws,
  `(async () => {
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {} }
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
     await window.api.invoke('config:patch', { ui: { defaultShell: 'pwsh' } })
     return true
   })()`
)
const remaining = await evaluate(ws, `(async () => (await window.api.invoke('sessions:list')).length)()`)
check('cleanup removed the smoke sessions', remaining === 0, `${remaining} left`)

const passed = checks.filter((c) => c.ok).length
console.log(`\n${passed}/${checks.length} checks passed`)
ws.close()
process.exit(passed === checks.length ? 0 : 1)
