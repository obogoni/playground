/* CDP smoke for the AM1 agent spike (ASPK-02/03/04). Proves the automatable
 * slice of the embedded terminal end-to-end against a running dev app:
 *   1. clicking the throwaway TopBar toggle spawns a PTY and the overlay opens
 *   2. PTY output streams over session:data and xterm renders it (non-empty)
 *   3. typed keystrokes round-trip over session:input and change what renders
 *
 * The hard-coded agent is `claude`, auto-run inside pwsh. Answering a real
 * interactive prompt is the manual half of the gate — this script proves the
 * plumbing (spawn → stream → render → input), not the agent's semantics.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-agent.mjs                       (in another)
 */

const PORT = Number(process.env.SMOKE_PORT) || 9222

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

/* Pulls the visible terminal text out of xterm's rendered rows. */
const TERMINAL_TEXT = `
  (() => {
    const rows = document.querySelector('.terminal-pane .xterm-rows')
    return rows ? rows.innerText.replace(/\\u00a0/g, ' ').trim() : null
  })()
`

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send(ws, 'Runtime.enable')
await send(ws, 'Input.enable').catch(() => {})

for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
  if (i >= 30) throw new Error('Top bar never appeared after 30s')
  await sleep(1000)
}

// 1. Click the throwaway spike toggle.
const clicked = await evaluate(
  ws,
  `(() => {
     const btn = [...document.querySelectorAll('.topbar-icon-btn')]
       .find((b) => b.title === 'Toggle agent terminal (spike)')
     if (!btn) return false
     btn.click()
     return true
   })()`
)
check('spike toggle button exists and was clicked', clicked)

// 2. Overlay opens and the terminal renders PTY output.
let text = null
for (let i = 0; i < 30; i++) {
  await sleep(1000)
  text = await evaluate(ws, TERMINAL_TEXT)
  if (text && text.length > 0) break
}
check('embedded terminal renders PTY output', !!text && text.length > 0, `${text?.length ?? 0} chars`)
console.log('\n--- terminal after spawn ---\n' + (text ?? '(empty)') + '\n----------------------------\n')

// 3. Type into the terminal and confirm the render changes (input round-trip).
await evaluate(
  ws,
  `(() => {
     const ta = document.querySelector('.terminal-pane .xterm-helper-textarea')
     if (ta) ta.focus()
   })()`
)
const before = text ?? ''
for (const ch of 'echo SMOKE_OK_42') {
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', text: ch })
  await send(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', text: ch })
}
let after = before
for (let i = 0; i < 10; i++) {
  await sleep(500)
  after = await evaluate(ws, TERMINAL_TEXT)
  if (after !== before) break
}
check('typed keystrokes round-trip and change the rendered terminal', after !== before)
console.log('\n--- terminal after typing ---\n' + after + '\n-----------------------------\n')

const passed = checks.filter((c) => c.ok).length
console.log(`\n${passed}/${checks.length} checks passed`)
ws.close()
process.exit(passed === checks.length ? 0 : 1)
