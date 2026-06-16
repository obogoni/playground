/* CDP smoke for AM2 Agent Sessions (AGSN-01..05). Proves the automatable slice
 * of the master-detail Agents direction end-to-end against a running dev app:
 *   1. the Agents segment switches and shows the rail + empty state
 *   2. the New Session dialog renders the 3 seeded agent chips, Spawn disabled
 *   3. spawning N sessions (direct IPC) yields independent ids, both running
 *   4. attach replays/streams session:data; typed input round-trips
 *   5. stop → session:status 'stopped' pushes; the rail reflects it live; the
 *      other session keeps running (independence); remove clears them
 *
 * Agents are shell-hosted, so `claude` need not be installed — pwsh stays live
 * and streams its prompt/"not recognized", which is enough to prove the wiring.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-agents.mjs                      (in another)
 */

const PORT = Number(process.env.SMOKE_PORT) || 9222
const CWD_A = 'C:/Windows'
const CWD_B = 'C:/'

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

// Install renderer-side capture of the streaming channels before anything spawns.
await evaluate(
  ws,
  `(() => {
     window.__smk = { data: [], status: [] }
     window.api.on('session:data', (p) => window.__smk.data.push(p))
     window.api.on('session:status', (p) => window.__smk.status.push(p))
     return true
   })()`
)

// 1. Switch to the Agents direction.
const switched = await evaluate(
  ws,
  `(() => {
     const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => /Agents/.test(b.textContent))
     if (!seg) return false
     seg.click()
     return true
   })()`
)
check('Agents segment exists and switches', switched)
await sleep(400)
const railPresent = await evaluate(
  ws,
  `document.querySelector('.session-rail') !== null || document.querySelector('.agents-detail-empty') !== null`
)
check('Agents direction renders the rail / empty state', railPresent)

// 2. Open the New Session dialog and inspect it.
await evaluate(
  ws,
  `(() => {
     const btn = document.querySelector('.session-rail-new') || document.querySelector('.agents-empty-new')
     if (btn) btn.click()
     return true
   })()`
)
await sleep(300)
const dialog = await evaluate(
  ws,
  `(() => {
     const chips = document.querySelectorAll('.ns-agent-chip').length
     const spawn = document.querySelector('.dialog-btn-primary')
     return { chips, spawnDisabled: spawn ? spawn.disabled : null, hasBrowse: !!document.querySelector('.ns-browse') }
   })()`
)
check('New Session dialog shows 3 seeded agents', dialog.chips === 3, `${dialog.chips} chips`)
check('Spawn is disabled until a cwd is chosen', dialog.spawnDisabled === true)
check('Browse-for-a-folder affordance present', dialog.hasBrowse === true)
// Close the dialog.
await evaluate(ws, `(() => { const b = document.querySelector('.dialog-btn-ghost'); if (b) b.click(); return true })()`)

// 3. Spawn two sessions (direct IPC — the dialog cwd grid needs registered
//    workspaces, which the engine checks don't depend on).
const id1 = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Claude', cwd: '${CWD_A}' })).id)()`
)
const id2 = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Codex', cwd: '${CWD_B}' })).id)()`
)
const listed = JSON.parse(
  await evaluate(ws, `(async () => JSON.stringify(await window.api.invoke('sessions:list')))()`)
)
const running = listed.filter((s) => s.status === 'running')
check(
  'spawn yields two independent running sessions',
  id1 && id2 && id1 !== id2 && running.length >= 2,
  `ids ${id1?.slice(0, 8)} / ${id2?.slice(0, 8)}, ${running.length} running`
)

// 4. Attach session 1; the buffer replays + live deltas stream over session:data.
await evaluate(ws, `(async () => { await window.api.invoke('sessions:attach', { id: '${id1}' }); return true })()`)
let dataForId1 = 0
for (let i = 0; i < 20; i++) {
  await sleep(500)
  dataForId1 = await evaluate(ws, `window.__smk.data.filter((d) => d.id === '${id1}').length`)
  if (dataForId1 > 0) break
}
check('attached session streams session:data', dataForId1 > 0, `${dataForId1} chunks`)

const before = await evaluate(ws, `window.__smk.data.filter((d) => d.id === '${id1}').length`)
await evaluate(
  ws,
  `(() => { window.api.send('session:input', { id: '${id1}', data: 'echo SMOKE_OK_42\\r' }); return true })()`
)
let after = before
for (let i = 0; i < 20; i++) {
  await sleep(500)
  after = await evaluate(ws, `window.__smk.data.filter((d) => d.id === '${id1}').length`)
  if (after > before) break
}
check('typed input round-trips (more output after echo)', after > before, `${before} → ${after} chunks`)

// 5. Stop session 1: status pushes 'stopped'; session 2 stays running.
await evaluate(ws, `(async () => { await window.api.invoke('sessions:stop', { id: '${id1}' }); return true })()`)
await sleep(800)
const stoppedEvent = await evaluate(
  ws,
  `window.__smk.status.some((s) => s.id === '${id1}' && s.status === 'stopped')`
)
check('stop pushes session:status stopped', stoppedEvent)
const list2 = JSON.parse(
  await evaluate(ws, `(async () => JSON.stringify(await window.api.invoke('sessions:list')))()`)
)
const s1 = list2.find((s) => s.id === id1)
const s2 = list2.find((s) => s.id === id2)
check(
  'stopped one session, the other keeps running (independence)',
  s1?.status === 'stopped' && s2?.status === 'running'
)
// The App subscribes to session:status → the rail repaints live.
const cards = await evaluate(ws, `document.querySelectorAll('.session-card').length`)
check('rail reflects the sessions live', cards >= 2, `${cards} cards`)

// Cleanup: stop + remove both so the dev config returns to clean.
await evaluate(
  ws,
  `(async () => {
     for (const s of await window.api.invoke('sessions:list')) {
       try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {}
     }
     for (const s of await window.api.invoke('sessions:list')) {
       try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {}
     }
     return true
   })()`
)
const remaining = JSON.parse(
  await evaluate(ws, `(async () => JSON.stringify(await window.api.invoke('sessions:list')))()`)
)
check('cleanup removed the smoke sessions', remaining.length === 0, `${remaining.length} left`)

const passed = checks.filter((c) => c.ok).length
console.log(`\n${passed}/${checks.length} checks passed`)
ws.close()
process.exit(passed === checks.length ? 0 : 1)
