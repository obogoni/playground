/* CDP smoke for Session Name (SNAME-01..15, AD-040). Proves what the unit tests
 * structurally cannot: a REAL `claude agents --json`, spawned by main, naming
 * REAL Claude Code sessions on the rail — end to end through the poller, the
 * manager and the renderer.
 *
 * It drives two sessions on one worktree:
 *   spawn A and B → first prompt in each → both rows read a distinct name
 *   (the default display name, `repos-xx`) → `/rename alpha` in A → A's row
 *   reads `alpha` and its tooltip `<agent> · alpha` → stop A → A's row reads
 *   the agent name again while B keeps its name.
 *
 * COST: this is the only part of the feature that spends tokens. It submits
 * ONE trivial prompt per session ("reply with only the word ok") — the first
 * hook event is what gives the app a `session_id` to look up.
 *
 * It registers a throwaway agent so its rows are told apart from any session
 * the developer already has open; only the sessions it spawned are stopped and
 * removed, and the agent is removed on the way out.
 *
 * NOT automatable here (hand-verify): a screen reader announcing the row; the
 * 30 s cadence itself is only bounded (≤ 35 s), not measured.
 *
 * Requires: a registered workspace holding at least one worktree, `claude` on
 * PATH, a logged-in Claude Code, and NO other instance of this app running:
 * every launch rewrites `agent-hooks/claude-settings.json` with the port of its
 * own hook server, so a second instance's sessions report to the wrong one and
 * get 401 — no hook event, no session_id, no name (seen 2026-09-19).
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-session-name.mjs               (in another)
 */

const PORT = Number(process.env.SMOKE_PORT) || 9222
const SMOKE_AGENT = 'Claude (name smoke)'
const PROMPT = 'Reply with only the word ok.'
/** One 30 s interval plus a ~2 s call plus slack (SNAME-10). */
const NAME_WAIT_MS = 35000

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

function summarise(ws) {
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}

/** `{ id → { name, status } }` for the sessions this script spawned. */
async function views(ws, ids) {
  return JSON.parse(
    await evaluate(
      ws,
      `(async () => {
         const all = await window.api.invoke('sessions:list')
         const out = {}
         for (const id of ${JSON.stringify(ids)}) {
           const s = all.find((s) => s.id === id)
           out[id] = { name: s?.name ?? null, status: s?.status ?? null }
         }
         return JSON.stringify(out)
       })()`
    )
  )
}

/** Poll `sessions:list` until `predicate(views)` holds. */
async function waitFor(ws, ids, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await views(ws, ids)
    if (predicate(last)) return last
    await sleep(500)
  }
  return null
}

/** The rail rows of the throwaway agent: `{ label, title }` in visual order. */
async function smokeRows(ws) {
  return JSON.parse(
    await evaluate(
      ws,
      `(() => {
         const rows = [...document.querySelectorAll('.rail-row')]
           .filter((r) => (r.title || '').includes(${JSON.stringify(SMOKE_AGENT)}))
         return JSON.stringify(rows.map((r) => ({
           label: r.querySelector('.rail-row-label')?.textContent ?? null,
           title: r.title
         })))
       })()`
    )
  )
}

function type(ws, id, text) {
  return evaluate(
    ws,
    `(window.api.send('session:input', { id: '${id}', data: ${JSON.stringify(text)} }), true)`
  )
}

async function submit(ws, id, text) {
  await type(ws, id, text)
  await sleep(600)
  await type(ws, id, '\r')
}

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

// Switch to the Agents direction: the rail only exists there.
await evaluate(
  ws,
  `(() => {
     const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => /Agents/.test(b.textContent))
     if (seg) seg.click()
     return true
   })()`
)
await sleep(400)
check(
  'the Agents direction is open (the rail is what these checks read)',
  await evaluate(ws, `Boolean(document.querySelector('.session-rail'))`)
)

// --- A throwaway agent, and what the config held before we touched it ---
const before = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       const agents = cfg.agents.filter((a) => a.name !== ${JSON.stringify(SMOKE_AGENT)})
       await window.api.invoke('config:patch', {
         agents: [...agents, { name: ${JSON.stringify(SMOKE_AGENT)}, command: 'claude', args: [], color: '--accent' }]
       })
       return JSON.stringify({ sessions: (await window.api.invoke('sessions:list')).length, agents: agents.length })
     })()`
  )
)

// Prefer this app's own repo: Claude Code has already been run there, so no
// trust prompt swallows the first keystrokes. Any registered worktree works.
const wt = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const all = []
       for (const wsNode of await window.api.invoke('tree:get')) {
         for (const repo of wsNode.repos ?? []) {
           for (const w of repo.worktrees ?? []) all.push({ path: w.path, branch: w.branch, repo: repo.name })
         }
       }
       return JSON.stringify(all.find((w) => w.repo === 'playground') ?? all[0] ?? null)
     })()`
  )
)
if (!wt) {
  check('a worktree is registered (session seed)', false, 'register a workspace, then re-run')
  summarise(ws)
}
check('a worktree is registered (session seed)', true, wt.branch)

// --- 1. Two Claude sessions on one worktree, unnamed until their first turn ---
const spawnOne = () =>
  evaluate(
    ws,
    `(async () => (await window.api.invoke('sessions:spawn', { agentName: ${JSON.stringify(SMOKE_AGENT)}, cwd: ${JSON.stringify(wt.path)} })).id)()`
  )
const a = await spawnOne()
const b = await spawnOne()
// A direct-IPC spawn pushes no event, so nudge the renderer into re-fetching.
const dummy = await evaluate(
  ws,
  `(async () => (await window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: ${JSON.stringify(wt.path)}, adhocCommand: 'cmd /c exit' })).id)()`
)
await evaluate(
  ws,
  `(async () => { try { await window.api.invoke('sessions:stop', { id: '${dummy}' }) } catch {} try { await window.api.invoke('sessions:remove', { id: '${dummy}' }) } catch {} return true })()`
)

await sleep(12000)
const fresh = await views(ws, [a, b])
check(
  'freshly spawned sessions have no name before their first turn (SNAME-03)',
  fresh[a].name === null && fresh[b].name === null,
  JSON.stringify(fresh)
)
// No RAIL-13 ordinal here: a worktree on an untagged branch puts each session
// in its own orphan group, so nothing collides (numbering inside a task group
// is unit-tested in rail-groups.test.ts).
let rows = await smokeRows(ws)
check(
  'the two rows read the agent name (SNAME-03)',
  rows.length === 2 && rows.every((r) => r.label === SMOKE_AGENT),
  rows.map((r) => r.label).join(' / ')
)

// --- 2. The first prompt gives main a session_id; the listing names both ---
await submit(ws, a, PROMPT)
await submit(ws, b, PROMPT)
const named = await waitFor(
  ws,
  [a, b],
  (v) => Boolean(v[a].name) && Boolean(v[b].name) && v[a].name !== v[b].name,
  NAME_WAIT_MS
)
check(
  'both sessions carry a distinct name within one interval of their first turn (SNAME-01, SNAME-10)',
  Boolean(named),
  JSON.stringify(named ?? (await views(ws, [a, b])))
)
rows = await smokeRows(ws)
check(
  'the rows render the names as their labels (SNAME-01)',
  Boolean(named) &&
    rows
      .map((r) => r.label)
      .sort()
      .join('|') === [named[a].name, named[b].name].sort().join('|'),
  rows.map((r) => r.label).join(' / ')
)
check(
  'a named row reads `<agent> · <name>` in its tooltip (SNAME-05)',
  Boolean(named) && rows.every((r) => r.title.startsWith(`${SMOKE_AGENT} · `)),
  rows.map((r) => r.title).join(' / ')
)

// --- 3. /rename shows within one interval, in place (SNAME-02) ---
await submit(ws, a, '/rename alpha')
const renamed = await waitFor(ws, [a, b], (v) => v[a].name === 'alpha', NAME_WAIT_MS)
check(
  '/rename alpha reaches the row within one interval (SNAME-02)',
  Boolean(renamed),
  JSON.stringify(renamed ?? (await views(ws, [a, b])))
)
rows = await smokeRows(ws)
const alphaRow = rows.find((r) => r.label === 'alpha')
check(
  'the renamed row reads alpha (SNAME-01)',
  Boolean(alphaRow),
  rows.map((r) => r.label).join(' / ')
)
check(
  'its tooltip reads `<agent> · alpha · <branch>` (SNAME-05)',
  Boolean(alphaRow) && alphaRow.title.startsWith(`${SMOKE_AGENT} · alpha · `),
  alphaRow?.title ?? ''
)
check(
  'the other session keeps its own name (SNAME-11)',
  Boolean(renamed) && renamed[b].name === named?.[b].name,
  renamed?.[b].name ?? ''
)

// --- 4. Stopping drops the name; the row falls back to the agent name (SNAME-04) ---
await evaluate(
  ws,
  `(async () => { await window.api.invoke('sessions:stop', { id: '${a}' }); return true })()`
)
const stopped = await waitFor(ws, [a, b], (v) => v[a].status === 'stopped', 10000)
check(
  'a stopped session lists no name (SNAME-04)',
  Boolean(stopped) && stopped[a].name === null,
  JSON.stringify(stopped ?? (await views(ws, [a, b])))
)
await sleep(500)
rows = await smokeRows(ws)
check(
  'the stopped row reads the agent name while the live one keeps its name (SNAME-03, SNAME-04)',
  rows.some((r) => r.label === SMOKE_AGENT) &&
    rows.some((r) => r.label === (renamed?.[b].name ?? named?.[b].name)),
  rows.map((r) => r.label).join(' / ')
)

// --- Cleanup: only what this script created ---
await evaluate(
  ws,
  `(async () => {
     for (const id of ${JSON.stringify([a, b])}) {
       try { await window.api.invoke('sessions:stop', { id }) } catch {}
       try { await window.api.invoke('sessions:remove', { id }) } catch {}
     }
     const cfg = await window.api.invoke('config:get')
     await window.api.invoke('config:patch', {
       agents: cfg.agents.filter((a) => a.name !== ${JSON.stringify(SMOKE_AGENT)})
     })
     return true
   })()`
)
const after = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const cfg = await window.api.invoke('config:get')
       return JSON.stringify({
         sessions: (await window.api.invoke('sessions:list')).length,
         agents: cfg.agents.length,
         smokeAgent: cfg.agents.some((a) => a.name === ${JSON.stringify(SMOKE_AGENT)})
       })
     })()`
  )
)
check(
  'cleanup left the config as it was found',
  after.sessions === before.sessions && after.agents === before.agents && !after.smokeAgent,
  `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`
)

summarise(ws)
