/* CDP smoke for the pinned-tasks-pane feature (PNTK-01..05). Assumes the app
 * is running with --remote-debugging-port=9222 against a swapped config with
 * no ado defaults and no pins, and an az CLI that is logged in to an org
 * containing the work item in SMOKE_TASK_URL (default: triadesolucoes /
 * MultiClubes #21211).
 * Run: node scripts/smoke-tasks.mjs
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const PORT = 9222
const TASK_URL =
  process.env.SMOKE_TASK_URL ??
  'https://dev.azure.com/triadesolucoes/MultiClubes/_workitems/edit/21211'
const TASK_ID = Number(TASK_URL.match(/\/edit\/(\d+)/)[1])
const CONFIG_PATH = join(process.env.APPDATA, 'playground', 'config.json')

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
function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      if (msg.error) return reject(new Error(JSON.stringify(msg.error)))
      const r = msg.result.result
      if (r.subtype === 'error') return reject(new Error(r.description))
      resolve(r.value)
    }
    ws.addEventListener('message', onMessage)
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true }
      })
    )
  })
}

/* Type into the add row (React-controlled input) and click Pin. */
const pinExpr = (input, waitMs) => `(async () => {
  const field = document.querySelector('.tasks-add-input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(field, ${JSON.stringify(input)})
  field.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('.tasks-pin-btn').click()
  await new Promise((r) => setTimeout(r, ${waitMs}))
  const card = [...document.querySelectorAll('.task-card')].find((c) =>
    c.querySelector('.task-card-id')?.textContent === '#' + ${TASK_ID}
  )
  return {
    error: document.querySelector('.tasks-add-error')?.textContent ?? null,
    inputValue: document.querySelector('.tasks-add-input').value,
    count: document.querySelector('.tasks-count')?.textContent ?? null,
    card: card
      ? {
          pills: [...card.querySelectorAll('.task-pill')].map((p) => p.textContent.trim()),
          title: card.querySelector('.task-card-title')?.textContent ?? null
        }
      : null
  }
})()`

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

// Wait until the renderer has hydrated the tasks pane before driving it.
for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.tasks-pane') !== null`)) break
  if (i >= 30) throw new Error('Tasks pane never appeared after 30s')
  await new Promise((r) => setTimeout(r, 1000))
}

// PNTK-03: pane renders with header, count, empty state; sync starts unconnected
const initial = await evaluate(
  ws,
  `({
    header: document.querySelector('.tasks-pane .pane-header-label')?.textContent ?? null,
    count: document.querySelector('.tasks-count')?.textContent ?? null,
    empty: document.querySelector('.tasks-empty')?.textContent ?? null,
    sync: document.querySelector('.topbar-sync')?.textContent ?? null
  })`
)
check(
  'tasks pane renders header, zero count, empty state (PNTK-03)',
  initial.header === 'Pinned tasks' &&
    initial.count === '0 items' &&
    /paste a work item/i.test(initial.empty ?? ''),
  JSON.stringify(initial)
)
check(
  'sync status starts not connected (PNTK-05)',
  /not connected/.test(initial.sync ?? ''),
  JSON.stringify(initial.sync)
)

// PNTK-02/03: malformed input → inline error, nothing pinned
const malformed = await evaluate(ws, pinExpr('not-a-work-item', 600))
check(
  'malformed input shows inline error (PNTK-02)',
  malformed.error !== null && malformed.count === '0 items',
  JSON.stringify(malformed.error)
)

// PNTK-02: bare ID without configured defaults → inline error naming the config keys
const bareId = await evaluate(ws, pinExpr(String(TASK_ID), 600))
check(
  'bare ID without defaults explains the config requirement (PNTK-02)',
  /defaultOrg/.test(bareId.error ?? '') && bareId.count === '0 items',
  JSON.stringify(bareId.error)
)

// PNTK-01/02/03: real URL pin resolves live details into a card
const pinned = await evaluate(ws, pinExpr(TASK_URL, 15000))
check(
  'URL pin creates a card with live type/state pills and title (PNTK-01/03)',
  Boolean(pinned.card) &&
    pinned.card.pills.length === 2 &&
    pinned.card.pills.every((p) => p.length > 0) &&
    (pinned.card.title ?? '').length > 0 &&
    pinned.count === '1 item' &&
    pinned.inputValue === '',
  JSON.stringify(pinned)
)

// PNTK-02: persisted to global config
const persisted = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
check(
  'pin persisted to config.json (PNTK-02)',
  Array.isArray(persisted.pinnedTasks) && persisted.pinnedTasks.some((t) => t.id === TASK_ID),
  JSON.stringify(persisted.pinnedTasks)
)

// PNTK-02: duplicate pin refused inline
const duplicate = await evaluate(ws, pinExpr(TASK_URL, 4000))
check(
  'duplicate pin refused inline (PNTK-02)',
  /already pinned/.test(duplicate.error ?? '') && duplicate.count === '1 item',
  JSON.stringify(duplicate.error)
)

// PNTK-05: sync status connected after a successful fetch
const sync = await evaluate(
  ws,
  `({
    text: document.querySelector('.topbar-sync')?.textContent ?? null,
    connected: document.querySelector('.topbar-sync-dot')?.classList.contains('connected') ?? null
  })`
)
check(
  'sync status shows org + synced time with green dot (PNTK-05)',
  /az · .+ · synced/.test(sync.text ?? '') && sync.connected === true,
  JSON.stringify(sync)
)

// PNTK-05: tasks:refresh IPC reports ok auth with resolved details
const snapshot = await evaluate(ws, `window.api.invoke('tasks:refresh')`)
check(
  'tasks:refresh resolves details with auth ok (PNTK-01/05)',
  snapshot.auth === 'ok' &&
    snapshot.tasks.length === 1 &&
    snapshot.tasks[0].details !== null &&
    typeof snapshot.lastSyncAt === 'number',
  JSON.stringify({ auth: snapshot.auth, details: snapshot.tasks[0]?.details })
)

// PNTK-03: hover ✕ unpins; card gone and removal persisted
const unpinned = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.task-unpin-btn').click()
    await new Promise((r) => setTimeout(r, 800))
    return {
      cards: document.querySelectorAll('.task-card').length,
      count: document.querySelector('.tasks-count')?.textContent ?? null
    }
  })()`
)
const afterUnpin = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
check(
  'unpin removes the card (PNTK-03)',
  unpinned.cards === 0 && unpinned.count === '0 items',
  JSON.stringify(unpinned)
)
check(
  'unpin persisted to config.json (PNTK-02)',
  Array.isArray(afterUnpin.pinnedTasks) && afterUnpin.pinnedTasks.length === 0,
  JSON.stringify(afterUnpin.pinnedTasks)
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
