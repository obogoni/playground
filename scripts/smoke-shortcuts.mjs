/* CDP smoke for the launch-shortcuts feature (LNCH-01..05) plus the VS 2022
 * (admin) launcher rendering (VSAD-01/03). Assumes the app is running with
 * --remote-debugging-port=9222 and a seeded workspace named wtm-smoke-*
 * containing repo `api` plus linked worktree `api-feature-42`. Opens real tool
 * windows (Explorer / Windows Terminal / VS Code) — run the PowerShell wrapper
 * that cleans them up afterwards. The VS 2022 elevation path is never invoked
 * here (it would pop UAC); it's hand-verified per the spec's Testing Notes.
 * Run: node scripts/smoke-shortcuts.mjs
 */

import { rmSync } from 'fs'

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

// Locate the seeded worktrees: feature/42 gets real launches; feature/43 is
// never opened by any tool, so it stays deletable for the vanished-path check.
const tree = await evaluate(ws, `window.api.invoke('tree:get')`)
const wsNode = tree.find((w) => w.displayName.startsWith('wtm-smoke-'))
const api = wsNode?.repos.find((r) => r.name === 'api')
const sibling = api?.worktrees.find((w) => w.branch === 'feature/42')
const victim = api?.worktrees.find((w) => w.branch === 'feature/43')
check('seeded workspace with sibling worktrees present', Boolean(sibling && victim))

// LNCH-01: selecting a worktree renders the three launcher cards
// (top-bar refresh first so the sidebar reflects the seeded disk state)
const cards = await evaluate(
  ws,
  `(async () => {
     document.querySelector('.topbar-icon-btn').click()
     await new Promise((r) => setTimeout(r, 1200))
     document.querySelectorAll('.sidebar-worktree')[1].click()
     await new Promise((r) => setTimeout(r, 400))
     return [...document.querySelectorAll('.detail-launcher')].map((card) => ({
       label: card.querySelector('.detail-launcher-label')?.textContent,
       command: card.querySelector('.detail-launcher-command')?.textContent
     }))
   })()`
)
check('four launcher cards render', cards.length === 4, JSON.stringify(cards))
check(
  'card labels and commands per §1b + VS 2022 (VSAD-01)',
  cards[0]?.label === 'File Explorer' &&
    cards[0]?.command === 'explorer.exe' &&
    cards[1]?.label === 'Windows Terminal' &&
    cards[1]?.command === 'wt.exe' &&
    cards[2]?.label === 'VS Code' &&
    cards[2]?.command === 'code' &&
    cards[3]?.label === 'Visual Studio 2022' &&
    cards[3]?.command === 'devenv.exe'
)
// VSAD-01: the VS card carries the elevation marker (shield tile + admin badge)
const vsAdmin = await evaluate(
  ws,
  `(() => {
     const card = document.querySelectorAll('.detail-launcher')[3]
     return {
       tile: Boolean(card?.querySelector('.detail-launcher-tile.amber')),
       admin: card?.querySelector('.detail-launcher-admin')?.textContent
     }
   })()`
)
check(
  'VS card marked elevated',
  vsAdmin.tile === true && vsAdmin.admin === 'admin',
  JSON.stringify(vsAdmin)
)

// LNCH-05: a launch against a vanished path fails with a clear message
const badLaunch = await evaluate(
  ws,
  `window.api.invoke('shortcuts:launch', { tool: 'terminal', path: 'C:\\\\wtm-smoke-no-such-dir' })`
)
check(
  'launch on missing path returns clear failure',
  badLaunch.ok === false && /no longer exists/.test(badLaunch.error ?? ''),
  JSON.stringify(badLaunch)
)

// LNCH-02: clicking the Explorer card opens it and shows no toast
const explorer = await evaluate(
  ws,
  `(async () => {
     document.querySelectorAll('.detail-launcher')[0].click()
     await new Promise((r) => setTimeout(r, 900))
     return { toast: Boolean(document.querySelector('.toast')) }
   })()`
)
check('explorer card launches without toast', explorer.toast === false)

// LNCH-03/04: terminal and VS Code launch ok against the real path
const wt = await evaluate(
  ws,
  `window.api.invoke('shortcuts:launch', { tool: 'terminal', path: ${JSON.stringify(sibling.path)} })`
)
check('wt.exe launch reports ok', wt.ok === true, JSON.stringify(wt))
const code = await evaluate(
  ws,
  `window.api.invoke('shortcuts:launch', { tool: 'vscode', path: ${JSON.stringify(sibling.path)} })`
)
check('vscode launch reports ok', code.ok === true, JSON.stringify(code))

// LNCH-05 end-to-end: delete a worktree dir externally, click a card → toast
rmSync(victim.path, { recursive: true, force: true })
const toast = await evaluate(
  ws,
  `(async () => {
     const rows = [...document.querySelectorAll('.sidebar-worktree')]
     rows[rows.length - 1].click()
     await new Promise((r) => setTimeout(r, 400))
     document.querySelectorAll('.detail-launcher')[1].click()
     await new Promise((r) => setTimeout(r, 600))
     return document.querySelector('.toast')?.textContent ?? null
   })()`
)
check(
  'card click on vanished worktree shows toast',
  typeof toast === 'string' && /Couldn't launch Windows Terminal/.test(toast),
  String(toast)
)

// VSAD-03: each board card footer gains a VS 2022 (admin) button. Last, since
// it leaves the app in the board direction. The button is never clicked here —
// elevation/UAC is hand-verified (see spec Testing Notes).
const boardVs = await evaluate(
  ws,
  `(async () => {
     ;[...document.querySelectorAll('.topbar-segment')]
       .find((b) => /board/i.test(b.textContent || ''))?.click()
     await new Promise((r) => setTimeout(r, 600))
     const cards = [...document.querySelectorAll('.board-card')]
     return {
       count: cards.length,
       allHaveVs: cards.every((card) =>
         Boolean(card.querySelector('.board-launch-btn.amber[title="Visual Studio 2022 (admin)"]'))
       )
     }
   })()`
)
check(
  'board cards expose VS 2022 (admin) button (VSAD-03)',
  boardVs.count > 0 && boardVs.allHaveVs === true,
  JSON.stringify(boardVs)
)

ws.close()
const failed = checks.filter((c) => !c.ok).length
console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed === 0 ? 0 : 1)
