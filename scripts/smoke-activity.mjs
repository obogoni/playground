/* CDP smoke for Session Activity Status (ACTV-01..27). Proves the slice unit
 * tests structurally cannot: a REAL Claude Code session reporting its lifecycle
 * through the injected hooks, end to end into the rail.
 *
 * It drives one session through the whole sequence:
 *   (no activity) → working → approval → (the keystroke that approves) →
 *   working → waiting → shell
 * checking the rail's label, aria-label, tooltip and header counts on the way.
 * A fresh session reports nothing until its first turn, because Claude Code
 * 2.1.273 does not deliver SessionStart to an http hook (measured 2026-09-15).
 *
 * COST: this is the only part of the feature that spends tokens. It submits ONE
 * trivial prompt that asks Claude to run a five-second shell command, so the
 * permission dialog and a silent tool run both happen in one turn.
 *
 * It registers a throwaway agent pinned to `--permission-mode default`, because
 * a registry entry running in auto mode never shows a permission dialog. The
 * agent and every session it spawns are removed on the way out.
 *
 * NOT automatable here (hand-verify):
 *   - the two-theme visual pass at 344px in light and dark: the spinning green
 *     loader (working/compacting), the blue waiting dot, the pink approval dot,
 *     the red error dot and the amber shell dot (ACTV-14..18)
 *   - prefers-reduced-motion: the loader must freeze with the OS setting on
 *     (ACTV-20)
 *   - the detail pane's pill, which this script never opens: it must mirror the
 *     row's state and add the tool, the subagent count and the error type
 *     (ACTV-24..27 — the wording itself is unit-tested in
 *     `src/renderer/src/lib/session-activity.test.ts`)
 *   - a screen reader announcing each row's state
 *   - the error state end to end: forcing a real rate limit is not something a
 *     script should do on purpose
 *
 * SPEC_DEVIATION: design.md's T11 says this script logs every live hook payload
 * and flags fields the documented shape does not predict.
 * Reason: a session's `--settings` file is fixed at spawn, so capturing payloads
 * would need a second Claude session and a second prompt. Instead it prints the
 * observed state sequence: a renamed event shows up as a transition that never
 * arrives and a check that fails.
 *
 * Requires: a registered workspace holding at least one worktree, `claude` on
 * PATH, and a logged-in Claude Code.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-activity.mjs                   (in another)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.SMOKE_PORT) || 9222
const SMOKE_AGENT = 'Claude (activity smoke)'
const PROMPT =
  "Run exactly this PowerShell command with your shell tool: Start-Sleep -Seconds 5; 'ok'. Then reply with only the word ok."
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

const seen = []
function summarise(ws) {
  const passed = checks.filter((c) => c.ok).length
  console.log(`\nobserved states: ${seen.join(' → ') || '(none)'}`)
  console.log(`${passed}/${checks.length} checks passed`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}

/** Poll the session's activity until `state` shows up, recording what passes by. */
async function waitForState(ws, id, state, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    const activity = JSON.parse(
      await evaluate(
        ws,
        `(async () => {
           const s = (await window.api.invoke('sessions:list')).find((s) => s.id === '${id}')
           return JSON.stringify(s?.activity ?? null)
         })()`
      )
    )
    if (activity && activity.state !== last) {
      last = activity.state
      seen.push(activity.tool ? `${activity.state}(${activity.tool})` : activity.state)
    }
    if (activity?.state === state) return activity
    await sleep(300)
  }
  return null
}

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

// --- 0. The app wrote a settings file and the endpoint it names is live ---
let settings
try {
  settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'))
} catch (err) {
  check('the app wrote its hook settings file', false, `${SETTINGS_PATH}: ${err.message}`)
  summarise(ws)
}
const url = settings?.hooks?.Stop?.[0]?.hooks?.[0]?.url
check('the app wrote its hook settings file', Boolean(url), url ?? SETTINGS_PATH)

const unauthorized = await fetch(url, { method: 'POST', body: '{}' }).then(
  (r) => r.status,
  (err) => err.message
)
check(
  'the hook endpoint is live and rejects an untokened POST (ACTV-04)',
  unauthorized === 401,
  `${unauthorized}`
)

// Switch to the Agents direction: the rail only exists there, and the row
// assertions below read it.
await evaluate(
  ws,
  `(() => {
     const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => /Agents/.test(b.textContent))
     if (seg) seg.click()
     return true
   })()`
)
await sleep(400)
const railPresent = await evaluate(ws, `Boolean(document.querySelector('.session-rail'))`)
check('the Agents direction is open (the rail is what these checks read)', railPresent)

// --- Clean slate + a throwaway agent that always asks for permission ---
await evaluate(
  ws,
  `(async () => {
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {} }
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
     const cfg = await window.api.invoke('config:get')
     const agents = cfg.agents.filter((a) => a.name !== ${JSON.stringify(SMOKE_AGENT)})
     await window.api.invoke('config:patch', {
       agents: [...agents, { name: ${JSON.stringify(SMOKE_AGENT)}, command: 'claude', args: ['--permission-mode', 'default'], color: '--accent' }]
     })
     return true
   })()`
)

const wt = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       for (const wsNode of await window.api.invoke('tree:get')) {
         for (const repo of wsNode.repos ?? []) {
           for (const w of repo.worktrees ?? []) return JSON.stringify({ path: w.path, branch: w.branch })
         }
       }
       return JSON.stringify(null)
     })()`
  )
)
if (!wt) {
  check('a worktree is registered (session seed)', false, 'register a workspace, then re-run')
  summarise(ws)
}
check('a worktree is registered (session seed)', true, wt.branch)

// --- 1. A Claude session launches with the hooks and reports nothing until its
//        first turn, because SessionStart never arrives (ACTV-01, ACTV-13) ---
const id = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: ${JSON.stringify(SMOKE_AGENT)}, cwd: ${JSON.stringify(wt.path)} })).id)()`
)
// A direct-IPC spawn pushes no event, so nudge the renderer into re-fetching.
const dummy = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${JSON.stringify(wt.path)}, adhocCommand: 'cmd /c exit' })).id)()`
)
await evaluate(
  ws,
  `(async () => { try { await window.api.invoke('sessions:stop', { id: '${dummy}' }) } catch {} return true })()`
)

// Claude Code 2.1.273 does not deliver SessionStart to an http hook, so a fresh
// session reports nothing until its first turn and the row reads `running`
// (measured; see the spec's assumption table). The state it must NOT be in is a
// derived one.
await sleep(12000)
const beforePrompt = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const s = (await window.api.invoke('sessions:list')).find((s) => s.id === '${id}')
       return JSON.stringify({ activity: s?.activity ?? null, status: s?.status ?? null })
     })()`
  )
)
check(
  'a freshly spawned session reports no activity and stays running (ACTV-13)',
  beforePrompt.activity === null && beforePrompt.status === 'running',
  JSON.stringify(beforePrompt)
)

const adhoc = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const s = (await window.api.invoke('sessions:list')).find((s) => s.id === '${dummy}')
       return JSON.stringify(s?.activity ?? null)
     })()`
  )
)
check('an ad-hoc session reports no activity at all (ACTV-02)', adhoc === null)

// --- 2. The prompt: working, then blocked on the permission dialog ---
await evaluate(
  ws,
  `(async () => {
     window.api.send('session:input', { id: '${id}', data: ${JSON.stringify(PROMPT)} })
     return true
   })()`
)
await sleep(600)
await evaluate(ws, `(window.api.send('session:input', { id: '${id}', data: '\\r' }), true)`)

const working = await waitForState(ws, id, 'working', 30000)
check('submitting a prompt reports working (ACTV-03)', Boolean(working))

const approval = await waitForState(ws, id, 'needs-approval', 90000)
check('the permission dialog reports needs-approval (ACTV-03)', Boolean(approval))
check(
  'the blocked state names the tool it is waiting on (ACTV-24)',
  Boolean(approval?.tool),
  approval?.tool ?? ''
)

// --- 3. The rail renders it (ACTV-16, ACTV-21, ACTV-23, ACTV-24) ---
const row = JSON.parse(
  await evaluate(
    ws,
    `(() => {
       const rows = [...document.querySelectorAll('.rail-row')]
       const el = rows.find((r) => (r.title || '').includes('Claude'))
       const status = el?.querySelector('.rail-row-status')
       return JSON.stringify({
         label: status?.textContent ?? null,
         aria: status?.getAttribute('aria-label') ?? null,
         title: el?.title ?? null,
         header: document.querySelector('.session-rail-count')?.textContent ?? null
       })
     })()`
  )
)
check('the row reads approval (ACTV-16)', row.label === 'approval', row.label ?? '')
check(
  'the row status carries an aria-label naming the state (ACTV-21)',
  row.aria === 'approval',
  row.aria ?? ''
)
check(
  'the tooltip names the tool it is blocked on (ACTV-24)',
  Boolean(approval?.tool) && (row.title ?? '').includes(approval.tool),
  row.title ?? ''
)
check(
  'the header counts one agent needing the user (ACTV-23)',
  (row.header ?? '').includes('1 need you'),
  row.header ?? ''
)

// --- 3b. Activity arrives without re-fetching the session list (ACTV-07) ---
// Counting needs a wrapper around the bridge, which contextBridge may freeze.
// If it cannot be installed the check reports SKIP rather than a false pass.
const counterInstalled = await evaluate(
  ws,
  `(() => {
     try {
       const original = window.api.invoke.bind(window.api)
       window.__actvListCalls = 0
       const patched = { ...window.api, invoke: (channel, ...rest) => {
         if (channel === 'sessions:list') window.__actvListCalls++
         return original(channel, ...rest)
       } }
       Object.defineProperty(window, 'api', { value: patched, configurable: true, writable: true })
       return window.api.invoke !== original
     } catch {
       return false
     }
   })()`
)
if (counterInstalled) {
  // Deliberately do NOT poll during this window: every sessions:list counted
  // here is one the renderer asked for on its own.
  await sleep(12000)
  const listCalls = await evaluate(ws, `window.__actvListCalls`)
  const label = await evaluate(
    ws,
    `(() => {
       const rows = [...document.querySelectorAll('.rail-row')]
       const el = rows.find((r) => (r.title || '').includes('Claude'))
       return el?.querySelector('.rail-row-status')?.textContent ?? ''
     })()`
  )
  check(
    'the rail follows the agent without re-fetching the session list (ACTV-07)',
    listCalls === 0 && label !== '',
    `${listCalls} sessions:list call(s) in 12s, row read "${label}"`
  )
} else {
  // Measured 2026-09-15: contextBridge freezes `window.api`, so the count cannot
  // be installed from the page in this build. ACTV-07's positive half is
  // unit-tested (`src/renderer/src/lib/session-activity.test.ts`); the negative
  // half ("without re-fetching") stays a code reading.
  console.log('SKIP  ACTV-07 IPC count — contextBridge freezes the bridge in this build')
}

// --- 4. Approving is a keystroke, and work resumes (ACTV-12) ---
await evaluate(ws, `(window.api.send('session:input', { id: '${id}', data: '1' }), true)`)
const resumed = await waitForState(ws, id, 'working', 15000)
check('the keystroke that approves resumes working (ACTV-12)', Boolean(resumed))

const header = await evaluate(
  ws,
  `document.querySelector('.session-rail-count')?.textContent ?? ''`
)
check('the header counts one working agent (ACTV-22)', header.includes('1 working'), header)

// --- 5. The turn ends (ACTV-03) ---
const done = await waitForState(ws, id, 'waiting', 180000)
check('the finished turn reports waiting (ACTV-03)', Boolean(done))

// --- 6. Leaving the agent drops to the hosting shell (ACTV-18) ---
await evaluate(ws, `(window.api.send('session:input', { id: '${id}', data: '/exit\\r' }), true)`)
const exited = await waitForState(ws, id, 'exited', 30000)
check('exiting the agent reports the exited state (ACTV-03)', Boolean(exited))

const shellLabel = await evaluate(
  ws,
  `(() => {
     const rows = [...document.querySelectorAll('.rail-row')]
     const el = rows.find((r) => (r.title || '').includes('Claude'))
     return el?.querySelector('.rail-row-status')?.textContent ?? ''
   })()`
)
check('the row reads shell once the agent has exited (ACTV-18)', shellLabel === 'shell', shellLabel)

// --- Cleanup: sessions and the throwaway agent ---
await evaluate(
  ws,
  `(async () => {
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:stop', { id: s.id }) } catch {} }
     for (const s of await window.api.invoke('sessions:list')) { try { await window.api.invoke('sessions:remove', { id: s.id }) } catch {} }
     const cfg = await window.api.invoke('config:get')
     await window.api.invoke('config:patch', {
       agents: cfg.agents.filter((a) => a.name !== ${JSON.stringify(SMOKE_AGENT)})
     })
     return true
   })()`
)
const leftovers = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       return JSON.stringify({
         sessions: (await window.api.invoke('sessions:list')).length,
         agent: cfg.agents.some((a) => a.name === ${JSON.stringify(SMOKE_AGENT)})
       })
     })()`
  )
)
check(
  'cleanup removed the smoke sessions and the throwaway agent',
  leftovers.sessions === 0 && !leftovers.agent,
  JSON.stringify(leftovers)
)

summarise(ws)
