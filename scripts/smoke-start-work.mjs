/* CDP smoke for the start-work-from-task feature (STWK-02..05; STWK-01 is
 * covered by Vitest). Assumes the app is running with
 * --remote-debugging-port=9222 against a swapped config containing one
 * workspace with one clean git repo, no ado defaults, no pins, and an az CLI
 * logged in to an org containing the work item in SMOKE_TASK_URL (required).
 * Run: SMOKE_TASK_URL=<work item URL> node scripts/smoke-start-work.mjs
 *
 * Re-runs need a fresh seed repo (or `git branch -D` the templated branch):
 * cleanup removes the worktree but `git worktree remove` keeps the branch,
 * so the next create fails on the branch collision.
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
  if (await evaluate(ws, `document.querySelector('.tasks-pane') !== null`)) break
  if (i >= 30) throw new Error('Tasks pane never appeared after 30s')
  await new Promise((r) => setTimeout(r, 1000))
}

// Precondition: pin the live work item through the add row.
const pinned = await evaluate(
  ws,
  `(async () => {
    ${setInput('.tasks-add-input', TASK_URL)}
    document.querySelector('.tasks-pin-btn').click()
    await new Promise((r) => setTimeout(r, 15000))
    const card = document.querySelector('.task-card')
    return {
      error: document.querySelector('.tasks-add-error')?.textContent ?? null,
      title: card?.querySelector('.task-card-title')?.textContent ?? null
    }
  })()`
)
if (!pinned.title) throw new Error(`Pin precondition failed: ${JSON.stringify(pinned)}`)
const TASK_TITLE = pinned.title

// STWK-04: fresh pin → "No worktree yet" + primary "Start work" button
const footer0 = await evaluate(
  ws,
  `({
    wt: document.querySelector('.task-card-wt')?.textContent ?? null,
    none: document.querySelector('.task-card-wt')?.classList.contains('none') ?? null,
    label: document.querySelector('.task-start-btn')?.textContent ?? null,
    primary: document.querySelector('.task-start-btn')?.classList.contains('primary') ?? null,
    disabled: document.querySelector('.task-start-btn')?.disabled ?? null
  })`
)
check(
  'fresh pin shows "No worktree yet" + primary Start work (STWK-04)',
  footer0.wt === 'No worktree yet' &&
    footer0.none === true &&
    footer0.label === 'Start work' &&
    footer0.primary === true &&
    footer0.disabled === false,
  JSON.stringify(footer0)
)

// STWK-02: Start work opens the §3 dialog with template-prefilled branch
const dialog = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.task-start-btn').click()
    await new Promise((r) => setTimeout(r, 400))
    return {
      kicker: document.querySelector('.dialog-kicker')?.textContent ?? null,
      id: document.querySelector('.dialog-task-id')?.textContent ?? null,
      title: document.querySelector('.dialog-task-title')?.textContent ?? null,
      chips: document.querySelectorAll('.dialog-repo-chip').length,
      chipSelected: document.querySelector('.dialog-repo-chip')?.classList.contains('selected') ?? null,
      base: document.querySelectorAll('.dialog-input')[0]?.value ?? null,
      branch: document.querySelectorAll('.dialog-input')[1]?.value ?? null,
      note: document.querySelector('.dialog-label-note')?.textContent ?? null,
      preview: document.querySelector('.dialog-path-value')?.textContent ?? null
    }
  })()`
)
const branchPattern = new RegExp(`^(feature|bugfix)/${TASK_ID}-[a-z0-9-]+$`)
check(
  'dialog opens with task header, repo chip selected, base branch (STWK-02)',
  dialog.kicker === 'Start work' &&
    dialog.id === `#${TASK_ID}` &&
    dialog.title === TASK_TITLE &&
    dialog.chips === 1 &&
    dialog.chipSelected === true &&
    (dialog.base ?? '').length > 0,
  JSON.stringify(dialog)
)
check(
  'branch is pre-filled from the {type}/{id}-{slug} template (STWK-02)',
  branchPattern.test(dialog.branch ?? '') && dialog.note === '· from template',
  JSON.stringify({ branch: dialog.branch, note: dialog.note })
)
check(
  'path preview shows the flat-sibling path for the templated branch (STWK-02)',
  (dialog.preview ?? '').endsWith(`-${dialog.branch.replaceAll('/', '-')}`),
  JSON.stringify(dialog.preview)
)

// STWK-02: editing the branch updates the preview live; template not re-applied
const edited = await evaluate(
  ws,
  `(async () => {
    ${setInput('.dialog-branch-row div:nth-child(2) .dialog-input', `spike/${TASK_ID}-edited by hand!`)}
    await new Promise((r) => setTimeout(r, 200))
    return {
      branch: document.querySelectorAll('.dialog-input')[1]?.value ?? null,
      preview: document.querySelector('.dialog-path-value')?.textContent ?? null
    }
  })()`
)
check(
  'editing the branch updates the path preview live with sanitization (STWK-02)',
  edited.branch === `spike/${TASK_ID}-edited by hand!` &&
    (edited.preview ?? '').endsWith(`-spike-${TASK_ID}-edited-by-hand`),
  JSON.stringify(edited)
)

// STWK-02: create with the original templated branch → dialog closes,
// sidebar refreshes and selects the new worktree
const created = await evaluate(
  ws,
  `(async () => {
    ${setInput('.dialog-branch-row div:nth-child(2) .dialog-input', dialog.branch)}
    await new Promise((r) => setTimeout(r, 200))
    document.querySelector('.dialog-btn-primary').click()
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if (!document.querySelector('.dialog-panel')) break
    }
    await new Promise((r) => setTimeout(r, 1500))
    const selected = document.querySelector('.sidebar-worktree.selected')
    return {
      dialogOpen: document.querySelector('.dialog-panel') !== null,
      error: document.querySelector('.dialog-error')?.textContent ?? null,
      selectedBranch: selected?.querySelector('.sidebar-worktree-branch')?.textContent ?? null
    }
  })()`
)
check(
  'create closes the dialog and selects the new worktree (STWK-02)',
  created.dialogOpen === false && created.selectedBranch === dialog.branch,
  JSON.stringify(created)
)

// STWK-03: the selected sidebar row carries the §1a task tag
const tag = await evaluate(
  ws,
  `(() => {
    const row = document.querySelector('.sidebar-worktree.selected')
    return {
      pill: row?.querySelector('.task-pill')?.textContent.trim() ?? null,
      id: row?.querySelector('.sidebar-task-id')?.textContent ?? null,
      title: row?.querySelector('.sidebar-task-title')?.textContent ?? null,
      dot: row?.querySelector('.sidebar-state-dot') !== null
    }
  })()`
)
check(
  'sidebar row shows type pill, #id, title, state dot (STWK-03)',
  (tag.pill ?? '').length > 0 && tag.id === `#${TASK_ID}` && tag.title === TASK_TITLE && tag.dot,
  JSON.stringify(tag)
)

// STWK-05: detail pane renders the §1b linked-task card linking to ADO
const linked = await evaluate(
  ws,
  `(() => {
    const card = document.querySelector('.detail-task-card')
    return {
      href: card?.getAttribute('href') ?? null,
      pills: card ? [...card.querySelectorAll('.task-pill')].map((p) => p.textContent.trim()) : [],
      id: card?.querySelector('.detail-task-id')?.textContent ?? null,
      title: card?.querySelector('.detail-task-title')?.textContent ?? null,
      open: card?.querySelector('.detail-task-open')?.textContent ?? null
    }
  })()`
)
check(
  'detail pane shows the linked-task card with ADO link (STWK-05)',
  (linked.href ?? '').includes(`/_workitems/edit/${TASK_ID}`) &&
    linked.pills.length === 2 &&
    linked.id === `#${TASK_ID}` &&
    linked.title === TASK_TITLE &&
    /Open in Azure DevOps/.test(linked.open ?? ''),
  JSON.stringify(linked)
)

// STWK-04: footer flips to "1 worktree" + ghost "New branch" without restart
const footer1 = await evaluate(
  ws,
  `({
    wt: document.querySelector('.task-card-wt')?.textContent ?? null,
    label: document.querySelector('.task-start-btn')?.textContent ?? null,
    ghost: document.querySelector('.task-start-btn')?.classList.contains('ghost') ?? null
  })`
)
check(
  'footer flips to "1 worktree" + ghost New branch (STWK-04)',
  footer1.wt === '1 worktree' && footer1.label === 'New branch' && footer1.ghost === true,
  JSON.stringify(footer1)
)

// STWK-03/05: unpin while the worktree exists → "#id — not pinned" degradation
const unpinned = await evaluate(
  ws,
  `(async () => {
    document.querySelector('.task-unpin-btn').click()
    await new Promise((r) => setTimeout(r, 800))
    const row = document.querySelector('.sidebar-worktree.selected')
    return {
      line2: row?.querySelector('.sidebar-task-note')?.textContent ?? null,
      detailNote: document.querySelector('.detail-task-note')?.textContent ?? null,
      cardGone: document.querySelector('.detail-task-card') === null
    }
  })()`
)
check(
  'unpinned task degrades to "#id — not pinned" in sidebar and detail (STWK-03/05)',
  unpinned.line2 === `#${TASK_ID} — not pinned` &&
    unpinned.detailNote === `#${TASK_ID} — not pinned` &&
    unpinned.cardGone,
  JSON.stringify(unpinned)
)
const persisted = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
check(
  'unpin persisted; created worktree untouched on disk (cleanup precondition)',
  Array.isArray(persisted.pinnedTasks) && persisted.pinnedTasks.length === 0,
  JSON.stringify(persisted.pinnedTasks)
)

// Cleanup: remove the created worktree through the app's own guarded IPC.
const cleanup = await evaluate(
  ws,
  `(async () => {
    const tree = await window.api.invoke('tree:get')
    const repo = tree[0]?.repos[0]
    const wt = repo?.worktrees.find((w) => !w.isDefault)
    if (!wt) return { removed: false, reason: 'no non-default worktree found' }
    const result = await window.api.invoke('worktrees:remove', {
      repoPath: repo.path,
      worktreePath: wt.path
    })
    return { removed: result.ok, reason: result.error ?? null }
  })()`
)
check(
  'cleanup: created worktree removed via worktrees:remove',
  cleanup.removed === true,
  JSON.stringify(cleanup)
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
