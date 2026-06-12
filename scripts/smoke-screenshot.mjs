/* Helper for the visual fidelity pass: re-stages pin + worktree, captures the
 * start-work dialog and the main 3-pane view to PNGs. Not part of the gate.
 * Run: SMOKE_TASK_URL=<url> node scripts/smoke-screenshot.mjs <outdir>
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

const PORT = 9222
const TASK_URL = process.env.SMOKE_TASK_URL
const OUT = process.argv[2] ?? '.'

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})

let nextId = 1
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    const onMessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
    .value
const shot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`saved ${name}`)
}

// Stage: pin the task, wait for details.
await evaluate(`(async () => {
  const field = document.querySelector('.tasks-add-input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(field, ${JSON.stringify(TASK_URL)})
  field.dispatchEvent(new Event('input', { bubbles: true }))
  document.querySelector('.tasks-pin-btn').click()
  await new Promise((r) => setTimeout(r, 12000))
})()`)

// Dialog open → §3 screenshot.
await evaluate(`(async () => {
  document.querySelector('.task-start-btn').click()
  await new Promise((r) => setTimeout(r, 500))
})()`)
await shot('start-work-dialog.png')

// Create → main 3-pane view with tag + linked card + footer.
await evaluate(`(async () => {
  document.querySelector('.dialog-btn-primary').click()
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (!document.querySelector('.dialog-panel')) break
  }
  await new Promise((r) => setTimeout(r, 1500))
})()`)
await shot('start-work-linked.png')

// Cleanup: remove worktree + unpin.
const cleaned = await evaluate(`(async () => {
  const tree = await window.api.invoke('tree:get')
  const repo = tree[0]?.repos[0]
  const wt = repo?.worktrees.find((w) => !w.isDefault)
  const removed = wt
    ? (await window.api.invoke('worktrees:remove', { repoPath: repo.path, worktreePath: wt.path })).ok
    : false
  const tasks = await window.api.invoke('tasks:list')
  for (const t of tasks.tasks) {
    await window.api.invoke('tasks:unpin', { id: t.id, org: t.org, project: t.project })
  }
  return removed
})()`)
console.log(`cleanup removed worktree: ${cleaned}`)
ws.close()
