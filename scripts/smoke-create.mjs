/* CDP smoke for the create-worktree feature (CRWT-01..04). Assumes the app
 * is running with --remote-debugging-port=9222 and a seeded workspace named
 * wtm-smoke-* containing repo `api` (branch main) plus linked worktree
 * `api-feature-42` (branch feature/42).
 * Run: node scripts/smoke-create.mjs
 */

import { existsSync } from 'fs'

const PORT = 9222

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

/* React controlled inputs need the native setter + an input event. */
const setBranchExpr = (value) => `(() => {
  const input = document.querySelectorAll('.dialog-input')[1]
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    .set.call(input, ${JSON.stringify(value)})
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return {
    preview: document.querySelector('.dialog-path-value')?.textContent ?? null,
    error: document.querySelector('.dialog-error')?.textContent ?? null,
    createDisabled: document.querySelector('.dialog-btn-primary')?.disabled ?? null
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

const tree = await evaluate(ws, `window.api.invoke('tree:get')`)
const wsNode = tree.find((w) => w.displayName.startsWith('wtm-smoke-'))
const api = wsNode?.repos.find((r) => r.name === 'api')
check('seeded workspace with repo api present', Boolean(api))

// CRWT-01: repo-row "+" opens the dialog, repo pre-selected, base prefilled
const opened = await evaluate(
  ws,
  `(async () => {
     document.querySelector('.topbar-icon-btn').click()
     await new Promise((r) => setTimeout(r, 1200))
     document.querySelector('.sidebar-new-worktree-btn').click()
     await new Promise((r) => setTimeout(r, 300))
     return {
       open: Boolean(document.querySelector('.dialog-panel')),
       selectedChip: document.querySelector(
         '.dialog-repo-chip.selected .dialog-repo-chip-name'
       )?.textContent,
       base: document.querySelectorAll('.dialog-input')[0]?.value,
       createDisabled: document.querySelector('.dialog-btn-primary')?.disabled
     }
   })()`
)
check(
  'dialog opens with repo pre-selected and base prefilled',
  opened.open === true && opened.selectedChip === 'api' && opened.base === 'main',
  JSON.stringify(opened)
)
check('create disabled while branch empty (CRWT-04)', opened.createDisabled === true)

// CRWT-01: live sanitized path preview (slash → dash; full table is unit-tested)
const preview = await evaluate(ws, setBranchExpr('chore/smoke.test'))
const expectedPath = `${api.path}-chore-smoke.test`
check(
  'preview shows sanitized flat-sibling path',
  preview.preview === expectedPath && preview.createDisabled === false,
  JSON.stringify(preview)
)

// CRWT-04: existing branch name → inline error, dialog stays open
await evaluate(ws, setBranchExpr('feature/42'))
const conflict = await evaluate(
  ws,
  `(async () => {
     document.querySelector('.dialog-btn-primary').click()
     await new Promise((r) => setTimeout(r, 1200))
     return {
       open: Boolean(document.querySelector('.dialog-panel')),
       error: document.querySelector('.dialog-error')?.textContent ?? null
     }
   })()`
)
check(
  'existing branch shows inline error, dialog stays open',
  conflict.open === true && /feature\/42|already/.test(conflict.error ?? ''),
  JSON.stringify(conflict)
)

// CRWT-04: editing the branch clears the error
const cleared = await evaluate(ws, setBranchExpr('chore/smoke.test'))
check('editing the field clears the error', cleared.error === null)

// CRWT-01/02/03: create succeeds, dialog closes, new worktree selected
const created = await evaluate(
  ws,
  `(async () => {
     document.querySelector('.dialog-btn-primary').click()
     await new Promise((r) => setTimeout(r, 2000))
     return {
       open: Boolean(document.querySelector('.dialog-panel')),
       selectedBranch: document.querySelector(
         '.sidebar-worktree.selected .sidebar-worktree-branch'
       )?.textContent ?? null
     }
   })()`
)
check(
  'create closes dialog and selects the new worktree (CRWT-03)',
  created.open === false && created.selectedBranch === 'chore/smoke.test',
  JSON.stringify(created)
)
check('worktree exists on disk at the sibling path (CRWT-02)', existsSync(expectedPath))

// CRWT-04 via IPC: unknown base branch is returned, not thrown
const badBase = await evaluate(
  ws,
  `window.api.invoke('worktrees:create', { repoPath: ${JSON.stringify(api.path)}, branch: 'x/y', baseBranch: 'does-not-exist' })`
)
check(
  'unknown base returns git error',
  badBase.ok === false && Boolean(badBase.error),
  JSON.stringify(badBase)
)

// Edge case: branch sanitizing to an occupied sibling path is refused
const aliased = await evaluate(
  ws,
  `window.api.invoke('worktrees:create', { repoPath: ${JSON.stringify(api.path)}, branch: 'feature-42', baseBranch: 'main' })`
)
check(
  'path collision via sanitization alias is refused',
  aliased.ok === false && /exists/i.test(aliased.error ?? ''),
  JSON.stringify(aliased)
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
