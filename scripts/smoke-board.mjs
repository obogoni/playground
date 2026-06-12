/* CDP smoke for the board direction (BORD-01..04). Assumes the app is running
 * with --remote-debugging-port=9222 against a swapped config containing one
 * workspace with one clean git repo, no ado defaults, no pins, and an az CLI
 * logged in to an org containing the work item in SMOKE_TASK_URL (required).
 * Run: SMOKE_TASK_URL=<work item URL> node scripts/smoke-board.mjs
 *
 * Re-runs need a fresh seed repo (or `git branch -D feature/<id>-board-smoke`):
 * cleanup removes the worktree but `git worktree remove` keeps the branch.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const PORT = 9222
const TASK_URL = process.env.SMOKE_TASK_URL
if (!TASK_URL) {
  console.error(
    'SMOKE_TASK_URL is required (a dev.azure.com work item URL, e.g. https://dev.azure.com/<org>/<project>/_workitems/edit/<id>)'
  )
  process.exit(1)
}
const taskIdMatch = TASK_URL.match(/\/edit\/(\d+)/)
if (!taskIdMatch) {
  console.error(
    `SMOKE_TASK_URL does not look like a work item URL (expected .../_workitems/edit/<id>): ${TASK_URL}`
  )
  process.exit(1)
}
const TASK_ID = Number(taskIdMatch[1])
const SMOKE_BRANCH = `feature/${TASK_ID}-board-smoke`
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

/* Statements that set a React-controlled input's value so the change handler fires. */
const setInput = (selector, value) => `
  const field = document.querySelector(${JSON.stringify(selector)})
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(field, ${JSON.stringify(value)})
  field.dispatchEvent(new Event('input', { bubbles: true }))
`

const pressKey = (selector, key) => `
  document.querySelector(${JSON.stringify(selector)}).dispatchEvent(
    new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true })
  )
`

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

// Wait until the renderer has hydrated before driving it.
for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
  if (i >= 30) throw new Error('Top bar never appeared after 30s')
  await new Promise((r) => setTimeout(r, 1000))
}

// BORD-01: switching the segmented control to Board replaces the placeholder
const board = await evaluate(
  ws,
  `(async () => {
    ;[...document.querySelectorAll('.topbar-segment')].find((b) => b.textContent === 'Board').click()
    await new Promise((r) => setTimeout(r, 400))
    return {
      board: document.querySelector('.board') !== null,
      label: document.querySelector('.board-strip-label')?.textContent ?? null,
      chips: document.querySelectorAll('.board-chip').length,
      pinBtn: document.querySelector('.board-pin-btn')?.textContent ?? null
    }
  })()`
)
check(
  'Board direction renders strip with PINNED label + dashed Pin button (BORD-01)',
  board.board && board.label === 'Pinned' && board.chips === 0 && board.pinBtn === 'Pin task',
  JSON.stringify(board)
)

// BORD-04: Pin task expands to an inline input; Esc collapses it
const pinOpen = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.board-pin-btn').click()
    await new Promise((r) => setTimeout(r, 200))
    const input = document.querySelector('.board-pin-input')
    const opened = { input: input !== null, focused: document.activeElement === input }
    ${pressKey('.board-pin-input', 'Escape')}
    await new Promise((r) => setTimeout(r, 200))
    return {
      ...opened,
      closedBack: document.querySelector('.board-pin-input') === null &&
        document.querySelector('.board-pin-btn') !== null
    }
  })()`
)
check(
  'Pin task expands to a focused inline input; Esc collapses (BORD-04)',
  pinOpen.input && pinOpen.focused && pinOpen.closedBack,
  JSON.stringify(pinOpen)
)

// BORD-04: invalid input → inline error, input stays open
const pinError = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.board-pin-btn').click()
    await new Promise((r) => setTimeout(r, 200))
    ${setInput('.board-pin-input', 'not-a-task')}
    ${pressKey('.board-pin-input', 'Enter')}
    await new Promise((r) => setTimeout(r, 1500))
    return {
      error: document.querySelector('.board-pin-error')?.textContent ?? null,
      inputOpen: document.querySelector('.board-pin-input') !== null
    }
  })()`
)
check(
  'invalid pin input shows inline error and stays open (BORD-04)',
  (pinError.error ?? '').length > 0 && pinError.inputOpen,
  JSON.stringify(pinError)
)

// BORD-04: pinning the live work item from the board adds a chip
const pinned = await evaluate(
  ws,
  `(async () => {
    ${setInput('.board-pin-input', TASK_URL)}
    ${pressKey('.board-pin-input', 'Enter')}
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (document.querySelector('.board-chip')) break
    }
    const chip = document.querySelector('.board-chip')
    return {
      collapsed: document.querySelector('.board-pin-input') === null,
      id: chip?.querySelector('.board-chip-id')?.textContent ?? null,
      title: chip?.querySelector('.board-chip-title')?.textContent ?? null,
      unavailable: chip?.querySelector('.board-chip-title.unavailable') !== null,
      dotClass: chip?.querySelector('.board-chip-dot')?.className ?? null,
      count: chip?.querySelector('.board-chip-count')?.textContent ?? null
    }
  })()`
)
check(
  'pin from the board adds a chip with dot, #id, title, count 0 (BORD-04/01)',
  pinned.collapsed &&
    pinned.id === `#${TASK_ID}` &&
    (pinned.title ?? '').length > 0 &&
    pinned.unavailable === false &&
    !(pinned.dotClass ?? '').includes('faint') &&
    pinned.count === '0',
  JSON.stringify(pinned)
)
const TASK_TITLE = pinned.title

// BORD-02: canvas groups workspace → repo → cards; primary checkout untagged
const grid = await evaluate(
  ws,
  `(() => {
    const card = document.querySelector('.board-card')
    return {
      workspace: document.querySelector('.board-workspace-name')?.textContent ?? null,
      path: document.querySelector('.board-workspace-path')?.textContent ?? null,
      repo: document.querySelector('.board-repo-name')?.textContent ?? null,
      cards: document.querySelectorAll('.board-card').length,
      branch: card?.querySelector('.board-card-branch')?.textContent ?? null,
      untagged: card?.querySelector('.board-card-task.untagged')?.textContent ?? null,
      launchers: card ? card.querySelectorAll('.board-launch-btn').length : 0,
      footerRepo: card?.querySelector('.board-card-repo')?.textContent ?? null
    }
  })()`
)
check(
  'canvas shows workspace/repo headers and the primary-checkout card (BORD-02)',
  (grid.workspace ?? '').length > 0 &&
    (grid.path ?? '').length > 0 &&
    (grid.repo ?? '').length > 0 &&
    grid.cards === 1 &&
    (grid.branch ?? '').length > 0 &&
    grid.untagged === 'primary checkout — no task' &&
    grid.launchers === 3 &&
    grid.footerRepo === grid.repo,
  JSON.stringify(grid)
)

// Setup: create a task-linked worktree through the app's own IPC, then refresh.
const created = await evaluate(
  ws,
  `(async () => {
    const tree = await window.api.invoke('tree:get')
    const repo = tree[0]?.repos[0]
    if (!repo) return { ok: false, error: 'no repo in seed workspace' }
    const result = await window.api.invoke('worktrees:create', {
      repoPath: repo.path,
      branch: ${JSON.stringify(SMOKE_BRANCH)},
      baseBranch: repo.worktrees.find((w) => w.isDefault)?.branch
    })
    if (!result.ok) return result
    document.querySelector('.topbar-icon-btn[title="Refresh"]').click()
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (document.querySelectorAll('.board-card').length === 2) break
    }
    return { ok: true }
  })()`
)
if (!created.ok) throw new Error(`Worktree setup failed: ${JSON.stringify(created)}`)

// BORD-02: the new card carries the full task block; BORD-01: chip count flips to 1
const taskCard = await evaluate(
  ws,
  `(() => {
    const card = [...document.querySelectorAll('.board-card')].find(
      (c) => c.querySelector('.board-card-branch')?.textContent === ${JSON.stringify(SMOKE_BRANCH)}
    )
    return {
      found: card !== undefined,
      pill: card?.querySelector('.task-pill')?.textContent.trim() ?? null,
      id: card?.querySelector('.board-card-task-id')?.textContent ?? null,
      state: card?.querySelector('.board-card-state')?.textContent.trim() ?? null,
      title: card?.querySelector('.board-card-task-title')?.textContent ?? null,
      chipCount: document.querySelector('.board-chip-count')?.textContent ?? null
    }
  })()`
)
check(
  'task-linked card shows type pill, #id, state, title; chip count flips to 1 (BORD-02/01)',
  taskCard.found &&
    (taskCard.pill ?? '').length > 0 &&
    taskCard.id === `#${TASK_ID}` &&
    (taskCard.state ?? '').length > 0 &&
    taskCard.title === TASK_TITLE &&
    taskCard.chipCount === '1',
  JSON.stringify(taskCard)
)

// BORD-03: chip click → active chip, banner, highlighted/dimmed split
const highlight = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.board-chip').click()
    await new Promise((r) => setTimeout(r, 300))
    const cards = [...document.querySelectorAll('.board-card')]
    return {
      active: document.querySelector('.board-chip')?.classList.contains('active') ?? null,
      banner: document.querySelector('.board-banner')?.textContent ?? null,
      highlighted: cards.filter((c) => c.classList.contains('highlighted')).length,
      dimmed: cards.filter((c) => c.classList.contains('dimmed')).length
    }
  })()`
)
check(
  'chip click highlights its card, dims the rest, shows the banner (BORD-03)',
  highlight.active === true &&
    (highlight.banner ?? '').includes(`Showing worktrees for #${TASK_ID}`) &&
    highlight.highlighted === 1 &&
    highlight.dimmed === 1,
  JSON.stringify(highlight)
)

// BORD-03: banner ✕ clears; re-click toggles on and off
const cleared = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.board-banner-clear').click()
    await new Promise((r) => setTimeout(r, 200))
    const afterClear = {
      banner: document.querySelector('.board-banner') === null,
      active: document.querySelector('.board-chip.active') === null,
      dimmed: document.querySelectorAll('.board-card.dimmed').length
    }
    document.querySelector('.board-chip').click()
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector('.board-chip').click()
    await new Promise((r) => setTimeout(r, 200))
    return {
      ...afterClear,
      toggledOff: document.querySelector('.board-banner') === null &&
        document.querySelector('.board-chip.active') === null
    }
  })()`
)
check(
  'banner ✕ clears the highlight; chip re-click toggles off (BORD-03)',
  cleared.banner && cleared.active && cleared.dimmed === 0 && cleared.toggledOff,
  JSON.stringify(cleared)
)

// BORD-03: highlight does not survive a direction round-trip
const roundTrip = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.board-chip').click()
    await new Promise((r) => setTimeout(r, 200))
    const armed = document.querySelector('.board-chip.active') !== null
    const segs = [...document.querySelectorAll('.topbar-segment')]
    segs.find((b) => b.textContent === 'Tree').click()
    await new Promise((r) => setTimeout(r, 300))
    segs.find((b) => b.textContent === 'Board').click()
    await new Promise((r) => setTimeout(r, 300))
    return {
      armed,
      banner: document.querySelector('.board-banner') === null,
      active: document.querySelector('.board-chip.active') === null
    }
  })()`
)
check(
  'highlight clears on a Tree/Board round-trip — transient state (BORD-03)',
  roundTrip.armed && roundTrip.banner && roundTrip.active,
  JSON.stringify(roundTrip)
)

// Cleanup: remove the worktree and unpin through the app's own IPC.
const cleanup = await evaluate(
  ws,
  `(async () => {
    const tree = await window.api.invoke('tree:get')
    const repo = tree[0]?.repos[0]
    const wt = repo?.worktrees.find((w) => !w.isDefault)
    if (!wt) return { removed: false, reason: 'no non-default worktree found' }
    const removed = await window.api.invoke('worktrees:remove', {
      repoPath: repo.path,
      worktreePath: wt.path
    })
    const pin = (await window.api.invoke('tasks:list')).tasks[0]
    const unpinned = pin
      ? await window.api.invoke('tasks:unpin', { id: pin.id, org: pin.org, project: pin.project })
      : null
    return { removed: removed.ok, reason: removed.error ?? null, pins: unpinned?.tasks.length ?? -1 }
  })()`
)
const persisted = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
check(
  'cleanup: worktree removed and task unpinned via IPC',
  cleanup.removed === true &&
    cleanup.pins === 0 &&
    Array.isArray(persisted.pinnedTasks) &&
    persisted.pinnedTasks.length === 0,
  JSON.stringify(cleanup)
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
