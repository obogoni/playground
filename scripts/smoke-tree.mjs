/* CDP smoke for the workspace-sidebar-tree feature. Assumes the app is
 * running with --remote-debugging-port=9222 and a seeded workspace containing
 * repo `api` (dirty primary checkout) plus linked worktree `api-feature-42`.
 * Run: node scripts/smoke-tree.mjs
 */

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

// 1. tree:get returns the seeded workspace with repo and both worktrees
const tree = await evaluate(ws, `window.api.invoke('tree:get')`)
const wsNode = tree.find((w) => w.displayName.startsWith('wtm-smoke-'))
check('tree:get returns seeded workspace', Boolean(wsNode))
const api = wsNode?.repos.find((r) => r.name === 'api')
check(
  'repo api discovered (worktree sibling not a repo)',
  wsNode?.repos.length === 1 && Boolean(api)
)
check(
  'two worktrees listed: main (default) + feature/42',
  api?.worktrees.length === 2 &&
    api.worktrees[0].branch === 'main' &&
    api.worktrees[0].isDefault === true &&
    api.worktrees[1].branch === 'feature/42' &&
    api.worktrees[1].isDefault === false
)
check(
  'dirty status: primary dirty (1 change), sibling clean',
  api?.worktrees[0].dirty === true &&
    api.worktrees[0].changes === 1 &&
    api.worktrees[1].dirty === false
)

// 2. Sidebar rendered the tree (give React a moment after initial load)
await new Promise((r) => setTimeout(r, 500))
const rows = await evaluate(ws, `document.querySelectorAll('.sidebar-worktree').length`)
check('sidebar renders 2 worktree rows', rows === 2)

// 3. Clicking the dirty primary row selects it and fills the detail pane
const detail = await evaluate(
  ws,
  `(async () => {
     document.querySelectorAll('.sidebar-worktree')[0].click()
     await new Promise((r) => setTimeout(r, 300))
     return {
       selected: document.querySelectorAll('.sidebar-worktree.selected').length,
       title: document.querySelector('.detail-title')?.textContent,
       pills: [...document.querySelectorAll('.detail-pill')].map((p) => p.textContent.trim()),
       path: document.querySelector('.detail-location-path')?.textContent
     }
   })()`
)
check('row selection applied', detail.selected === 1)
check('detail title shows branch', detail.title === 'main', String(detail.title))
check(
  'pills: dirty + primary',
  detail.pills.length === 2 &&
    detail.pills[0].includes('1 uncommitted change') &&
    detail.pills[1] === 'primary',
  JSON.stringify(detail.pills)
)
check('location row shows worktree path', Boolean(detail.path?.includes('wtm-smoke-')))

// 4. Selecting the clean sibling shows the green pill, no primary pill
const clean = await evaluate(
  ws,
  `(async () => {
     document.querySelectorAll('.sidebar-worktree')[1].click()
     await new Promise((r) => setTimeout(r, 300))
     return {
       title: document.querySelector('.detail-title')?.textContent,
       pills: [...document.querySelectorAll('.detail-pill')].map((p) => p.textContent.trim())
     }
   })()`
)
check('sibling detail shows feature/42', clean.title === 'feature/42', String(clean.title))
check(
  'clean pill only',
  clean.pills.length === 1 && clean.pills[0] === 'Working tree clean',
  JSON.stringify(clean.pills)
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
