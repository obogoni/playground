/* Follow-up TREE-06 check: after an external worktree removal, the top-bar
 * refresh reconciles the sidebar and clears a vanished selection. */
const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))

const expression = `(async () => {
  document.querySelector('.topbar-icon-btn').click()
  await new Promise((r) => setTimeout(r, 1500))
  return {
    rows: document.querySelectorAll('.sidebar-worktree').length,
    emptyDetail: Boolean(document.querySelector('.detail-empty'))
  }
})()`

const result = await new Promise((resolve) => {
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id === 1) resolve(m.result.result.value)
  })
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { awaitPromise: true, returnByValue: true, expression }
    })
  )
})

console.log(JSON.stringify(result))
const ok = result.rows === 1 && result.emptyDetail === true
console.log(ok ? 'PASS  refresh reconciles tree and clears vanished selection' : 'FAIL')
process.exit(ok ? 0 : 1)
