/* CDP smoke for per-workspace config (PWCF-01..04). Assumes the app is running
 * with --remote-debugging-port=9222 against a swapped config containing two
 * workspaces (each with one clean git repo), no ado defaults, no pins, the
 * second workspace carrying .app/config.json with "task/{id}-{slug}", and an
 * az CLI logged in to an org containing the work item in SMOKE_TASK_URL.
 * Run: SMOKE_TASK_URL=<work item URL> node scripts/smoke-config.mjs
 *
 * The start-work dialog is only opened and cancelled — no worktree is ever
 * created, so re-runs need no git cleanup. The script edits the second
 * workspace's .app/config.json in place to exercise read-on-use and the
 * malformed-JSON fallback.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const PORT = 9222
const TASK_URL = process.env.SMOKE_TASK_URL
if (!TASK_URL) {
  console.error(
    'SMOKE_TASK_URL is required (a dev.azure.com work item URL, e.g. https://dev.azure.com/<org>/<project>/_workitems/edit/<id>)'
  )
  process.exit(1)
}
const urlMatch = TASK_URL.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_workitems\/edit\/(\d+)/)
if (!urlMatch) {
  console.error(`SMOKE_TASK_URL does not look like a work item URL: ${TASK_URL}`)
  process.exit(1)
}
const [, ORG, PROJECT, TASK_ID] = urlMatch
const CONFIG_PATH = join(process.env.APPDATA, 'playground', 'config.json')
const seededConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
const WSB_OVERRIDE = join(seededConfig.workspaces[1].path, '.app', 'config.json')

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

/* Sets the value of the index-th match of selector so React's handler fires. */
const setInputAt = (selector, index, value) => `
  {
    const field = document.querySelectorAll(${JSON.stringify(selector)})[${index}]
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
`

const pressKeyAt = (selector, index, key) => `
  document.querySelectorAll(${JSON.stringify(selector)})[${index}].dispatchEvent(
    new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true })
  )
`

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

for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
  if (i >= 30) throw new Error('Top bar never appeared after 30s')
  await sleep(1000)
}

async function pinBareId() {
  await evaluate(ws, setInputAt('.tasks-add-input', 0, TASK_ID))
  await evaluate(ws, pressKeyAt('.tasks-add-input', 0, 'Enter'))
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    const state = await evaluate(
      ws,
      `({
        error: document.querySelector('.tasks-add-error')?.textContent ?? null,
        cards: document.querySelectorAll('.task-card').length,
        title: document.querySelector('.task-card-title')?.textContent ?? null
      })`
    )
    if (state.error || state.cards > 0) return state
  }
  throw new Error('Pin attempt produced neither a card nor an error after 10s')
}

async function openDialog(clickExpr, kicker) {
  await evaluate(ws, clickExpr)
  await sleep(400)
  const got = await evaluate(ws, `document.querySelector('.dialog-kicker')?.textContent ?? null`)
  if (got !== kicker) throw new Error(`Expected "${kicker}" dialog, got "${got}"`)
}

const cancelDialog = async () => {
  await evaluate(
    ws,
    `[...document.querySelectorAll('.dialog-btn-ghost')].find((b) => b.textContent === 'Cancel').click()`
  )
  await sleep(300)
}

const startWorkBranch = () =>
  evaluate(ws, `document.querySelectorAll('.dialog-panel .dialog-branch-row .dialog-input')[1].value`)

const pickRepoChip = async (name) => {
  await evaluate(
    ws,
    `[...document.querySelectorAll('.dialog-repo-chip')].find(
      (c) => c.querySelector('.dialog-repo-chip-name').textContent === ${JSON.stringify(name)}
    ).click()`
  )
  await sleep(500)
}

// PWCF-01 pre-state: a bare ID without defaults fails with the guidance message
const before = await pinBareId()
check(
  'Bare-ID pin without defaults fails with config guidance (PWCF-01)',
  before.cards === 0 && (before.error ?? '').includes('defaultOrg'),
  before.error ?? `cards=${before.cards}`
)

// PWCF-01: gear opens the settings dialog showing current values
await openDialog(`document.querySelector('button[title="Settings"]').click()`, 'Settings')
const fields = await evaluate(
  ws,
  `[...document.querySelectorAll('.dialog-panel .dialog-input')].map((f) => f.value)`
)
check(
  'Settings dialog opens with empty org/project and the default template (PWCF-01/02)',
  fields.length === 3 && fields[0] === '' && fields[1] === '' && fields[2] === '{type}/{id}-{slug}',
  JSON.stringify(fields)
)

// PWCF-01: Esc closes without saving
await evaluate(ws, pressKeyAt('.dialog-panel .dialog-input', 0, 'Escape'))
await sleep(300)
const escClosed = await evaluate(ws, `document.querySelector('.dialog-panel') === null`)
check('Esc closes the settings dialog without saving (PWCF-01)', escClosed)

// PWCF-01/02: save org/project and a custom global template
await openDialog(`document.querySelector('button[title="Settings"]').click()`, 'Settings')
await evaluate(ws, setInputAt('.dialog-panel .dialog-input', 0, ORG))
await evaluate(ws, setInputAt('.dialog-panel .dialog-input', 1, PROJECT))
await evaluate(ws, setInputAt('.dialog-panel .dialog-input', 2, 'wip/{id}-{slug}'))
await evaluate(
  ws,
  `[...document.querySelectorAll('.dialog-btn-primary')].find((b) => b.textContent === 'Save').click()`
)
await sleep(500)
const persisted = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')).ado
check(
  'Save persists org/project/template to config.json (PWCF-01/02)',
  persisted.defaultOrg === ORG &&
    persisted.defaultProject === PROJECT &&
    persisted.branchTemplate === 'wip/{id}-{slug}',
  JSON.stringify(persisted)
)

// PWCF-01: the same bare ID now resolves against the saved defaults
const after = await pinBareId()
check(
  'Bare-ID pin resolves after saving defaults (PWCF-01)',
  after.cards === 1 && after.title !== null,
  after.title ?? after.error ?? ''
)

// PWCF-02/03: start-work prefills from the saved global template for repo A
await openDialog(
  `[...document.querySelectorAll('.task-start-btn')].at(0).click()`,
  'Start work'
)
await sleep(500)
const branchA = await startWorkBranch()
check(
  'Start-work prefill uses the edited global template for the no-override workspace (PWCF-02)',
  branchA.startsWith(`wip/${TASK_ID}-`),
  branchA
)

// PWCF-03: switching to the override workspace re-renders the untouched prefill
await pickRepoChip('beta')
const branchB = await startWorkBranch()
check(
  'Repo switch re-renders the prefill from the .app/ override (PWCF-03)',
  branchB.startsWith(`task/${TASK_ID}-`),
  branchB
)

// PWCF-03: a manual edit makes the branch sticky across repo switches
await evaluate(ws, setInputAt('.dialog-panel .dialog-branch-row .dialog-input', 1, 'my/custom-branch'))
await pickRepoChip('alpha')
const branchSticky = await startWorkBranch()
check(
  'Edited branch survives a repo switch — template never re-applies (PWCF-03)',
  branchSticky === 'my/custom-branch',
  branchSticky
)
await cancelDialog()

// PWCF-03: the override file is read on use — an on-disk edit shows without restart
writeFileSync(WSB_OVERRIDE, '{ "branchTemplate": "chore/{id}" }\n', 'utf8')
await openDialog(`[...document.querySelectorAll('.task-start-btn')].at(0).click()`, 'Start work')
await sleep(500)
await pickRepoChip('beta')
const branchEdited = await startWorkBranch()
check(
  'On-disk override edit applies at next dialog open, no restart (PWCF-03)',
  branchEdited === `chore/${TASK_ID}`,
  branchEdited
)
await cancelDialog()

// PWCF-04: malformed override JSON degrades silently to the global template
writeFileSync(WSB_OVERRIDE, '{ this is not json', 'utf8')
await openDialog(`[...document.querySelectorAll('.task-start-btn')].at(0).click()`, 'Start work')
await sleep(500)
await pickRepoChip('beta')
const branchMalformed = await startWorkBranch()
check(
  'Malformed .app/config.json falls back to the global template (PWCF-04)',
  branchMalformed.startsWith(`wip/${TASK_ID}-`),
  branchMalformed
)
await cancelDialog()

// PWCF-02: a blank saved template falls back to the default at render time
await openDialog(`document.querySelector('button[title="Settings"]').click()`, 'Settings')
await evaluate(ws, setInputAt('.dialog-panel .dialog-input', 2, ''))
await evaluate(
  ws,
  `[...document.querySelectorAll('.dialog-btn-primary')].find((b) => b.textContent === 'Save').click()`
)
await sleep(500)
await openDialog(`[...document.querySelectorAll('.task-start-btn')].at(0).click()`, 'Start work')
await sleep(500)
const branchDefault = await startWorkBranch()
check(
  'Blank saved template falls back to {type}/{id}-{slug} (PWCF-02)',
  new RegExp(`^(feature|bugfix)/${TASK_ID}-`).test(branchDefault),
  branchDefault
)
await cancelDialog()

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
