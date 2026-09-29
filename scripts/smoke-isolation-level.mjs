/* CDP smoke for Agent Isolation Level (ISO-03, 05, 08, 10). Walks the spec's
 * Success Criteria through the real UI against a running dev app:
 *   1. right-click a workspace header → Spawn agent here → the dialog opens on
 *      `Workspace` with the workspace chip selected (ISO-03, ISO-05)
 *   2. switching that dialog to `Repo` clears the Workspace pick and disables
 *      Spawn (ISO-06)
 *   3. spawning an Ad-hoc `pwd` there prints the workspace path, the rail shows
 *      `Workspace · <name>` and the detail has no "Open worktree" (ISO-08, ISO-10)
 *   4. the same from a repo row: dialog on `Repo` with the primary checkout
 *      selected, `pwd` prints the repo root, the rail shows `Repo · <name>` with
 *      the branch as note, and "Open worktree" selects the primary checkout
 *
 * NOT automatable here (hand-verify, log the result in validation.md):
 *   - ISO-11: from the workspace-level Claude session run `start-task` for a
 *     real task, switch windows and back; the new worktree appears under its
 *     repo with its task card pinned, with no manual pin
 *   - the visual pass of the level selector and the level group header in both
 *     themes
 *
 * Seeding needs a registered, non-missing workspace that is not itself a repo
 * and holds at least one healthy repo whose primary checkout branch carries no
 * task ID (a task ID would put the session in the task's group, by design).
 * Without one the script says so rather than passing silently.
 *
 * Existing sessions are left alone: only the sessions this script spawns are
 * stopped and removed on the way out.
 *
 * Run: npm run dev -- -- --remote-debugging-port=9222   (in one shell)
 *      node scripts/smoke-isolation-level.mjs            (in another)
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

const target = await pageTarget()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
await send(ws, 'Runtime.enable')

for (let i = 0; ; i++) {
  if (await evaluate(ws, `document.querySelector('.topbar') !== null`)) break
  if (i >= 30) throw new Error('Top bar never appeared after 30s')
  await sleep(1000)
}

const before = new Set(
  JSON.parse(
    await evaluate(
      ws,
      `(async () => JSON.stringify((await window.api.invoke('sessions:list')).map((s) => s.id)))()`
    )
  )
)

// Page-side helpers so every expression below stays short. `norm` mirrors
// normalizePath (case, slashes, one trailing separator).
await evaluate(
  ws,
  `(() => {
     const text = (el, sel) => (el?.querySelector(sel)?.textContent ?? '').trim()
     const norm = (p) => p.replace(/\\\\/g, '/').toLowerCase().replace(/\\/$/, '')
     window.__iso = {
       text,
       norm,
       data: [],
       direction: (name) => {
         const seg = [...document.querySelectorAll('.topbar-segment')].find((b) => b.textContent.includes(name))
         if (seg) seg.click()
         return !!seg
       },
       rightClick: (el) => {
         const r = el.getBoundingClientRect()
         el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + 8 }))
       },
       spawnHere: () => {
         const item = [...document.querySelectorAll('.sidebar-ctx-item')].find((b) => /Spawn agent here/.test(b.textContent))
         if (item) item.click()
         return !!item
       },
       dialog: () => {
         const selected = document.querySelector('.ns-cwd-chip.selected')
         const spawn = document.querySelector('.dialog-btn-primary')
         return {
           open: document.querySelector('.ns-level-segmented') !== null,
           levels: [...document.querySelectorAll('.ns-level-segment')].map((b) => b.textContent.trim()),
           level: text(document, '.ns-level-segment.selected'),
           line1: selected ? text(selected, '.ns-cwd-branch') : null,
           line2: selected ? text(selected, '.ns-cwd-sub') : null,
           spawnDisabled: spawn ? spawn.disabled : null
         }
       },
       segment: (label) => {
         const b = [...document.querySelectorAll('.ns-level-segment')].find((s) => s.textContent.trim() === label)
         if (b) b.click()
         return !!b
       },
       cancel: () => document.querySelector('.dialog-btn-ghost')?.click(),
       group: (label) =>
         [...document.querySelectorAll('.rail-group')].find((g) => text(g, '.rail-group-name') === label) ?? null,
       openWorktreeBtn: () =>
         [...document.querySelectorAll('.agents-detail-btn')].find((b) => /Open worktree/.test(b.textContent)) ?? null
     }
     window.api.on('session:data', (p) => window.__iso.data.push(p))
     return true
   })()`
)

// Sets the controlled Ad-hoc input the way React sees a keystroke, then spawns.
async function spawnAdhocPwd() {
  await evaluate(ws, `document.querySelector('.ns-agent-chip.adhoc')?.click()`)
  await sleep(200)
  await evaluate(
    ws,
    `(() => {
       const input = document.querySelector('.ns-adhoc-input')
       const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
       setter.call(input, 'pwd')
       input.dispatchEvent(new Event('input', { bubbles: true }))
       return true
     })()`
  )
  await sleep(200)
  await evaluate(ws, `document.querySelector('.dialog-btn-primary')?.click()`)
  // spawnSession selects the new session and switches to Agents.
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    const id = await evaluate(
      ws,
      `(async () => {
         const known = ${JSON.stringify([...before])}
         const list = await window.api.invoke('sessions:list')
         return list.filter((s) => !known.includes(s.id)).map((s) => s.id)
       })()`
    )
    const fresh = id.filter((x) => !spawned.includes(x))
    if (fresh.length > 0) {
      spawned.push(fresh[0])
      return fresh[0]
    }
  }
  return null
}

// The terminal output of `pwd` names the cwd; ANSI and wrapping stripped.
async function printed(id, path) {
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    const hit = await evaluate(
      ws,
      `(() => {
         const out = window.__iso.data.filter((d) => d.id === '${id}').map((d) => d.data).join('')
         const plain = out.replace(/\\u001b\\[[0-9;?]*[A-Za-z]/g, '').replace(/[\\r\\n]/g, '')
         return window.__iso.norm(plain).includes(window.__iso.norm(${JSON.stringify(path)}))
       })()`
    )
    if (hit) return true
    if (i === 6) {
      await evaluate(
        ws,
        `(async () => { await window.api.invoke('sessions:attach', { id: '${id}' }); return true })()`
      )
    }
  }
  return false
}

const spawned = []

async function cleanup() {
  await evaluate(
    ws,
    `(async () => {
       const ids = ${JSON.stringify(spawned)}
       for (const id of ids) { try { await window.api.invoke('sessions:stop', { id }) } catch {} }
       for (const id of ids) { try { await window.api.invoke('sessions:remove', { id }) } catch {} }
       return true
     })()`
  )
}

function summarise() {
  const passed = checks.filter((c) => c.ok).length
  console.log(`\n${passed}/${checks.length} checks passed`)
  ws.close()
  process.exit(passed === checks.length ? 0 : 1)
}

// --- Seed: a workspace that is not a repo, with a task-less healthy repo ---
const seed = JSON.parse(
  await evaluate(
    ws,
    `(async () => {
       const taskId = (branch) => {
         const segments = branch.split('/').filter((s) => s !== '')
         const last = segments[segments.length - 1]
         if (last === undefined) return null
         const m = /(?<![A-Za-z0-9])\\d{2,}(?![A-Za-z0-9])/.exec(last)
         return m ? Number(m[0]) : null
       }
       const norm = window.__iso.norm
       const tree = await window.api.invoke('tree:get')
       const primaries = tree.flatMap((w) => (w.repos ?? []).flatMap((r) => r.worktrees.filter((t) => t.isDefault)))
       for (const w of tree) {
         if (w.missing) continue
         if (primaries.some((p) => norm(p.path) === norm(w.path))) continue
         for (const repo of w.repos ?? []) {
           if (repo.error) continue
           const primary = repo.worktrees.find((t) => t.isDefault)
           if (!primary || taskId(primary.branch) !== null) continue
           return JSON.stringify({
             wsName: w.displayName, wsPath: w.path, wsId: w.id,
             repoName: repo.name, repoPath: primary.path, branch: primary.branch, primaryId: primary.id
           })
         }
       }
       return JSON.stringify(null)
     })()`
  )
)
if (!seed) {
  check(
    'a workspace (not itself a repo) with a task-less healthy repo is registered',
    false,
    'register such a workspace, then re-run'
  )
  summarise()
}
check(
  'a workspace (not itself a repo) with a task-less healthy repo is registered',
  true,
  `${seed.wsName} / ${seed.repoName} (${seed.branch})`
)

// The workspace must be expanded for its repo rows to render.
async function toTree() {
  await evaluate(ws, `window.__iso.direction('Tree')`)
  await sleep(500)
  await evaluate(
    ws,
    `(() => {
       const row = [...document.querySelectorAll('.sidebar-workspace-row')]
         .find((r) => window.__iso.text(r, '.sidebar-workspace-name') === ${JSON.stringify(seed.wsName)})
       const chevron = row?.querySelector('.sidebar-workspace-chevron')
       if (chevron?.getAttribute('aria-expanded') === 'false') chevron.click()
       return true
     })()`
  )
  await sleep(300)
}

const expandedOf = `(() => {
  const row = [...document.querySelectorAll('.sidebar-workspace-row')]
    .find((r) => window.__iso.text(r, '.sidebar-workspace-name') === ${JSON.stringify(seed.wsName)})
  return row?.querySelector('.sidebar-workspace-chevron')?.getAttribute('aria-expanded') ?? null
})()`

async function spawnFromWorkspaceRow() {
  await toTree()
  const ok = await evaluate(
    ws,
    `(() => {
       const row = [...document.querySelectorAll('.sidebar-workspace-row')]
         .find((r) => window.__iso.text(r, '.sidebar-workspace-name') === ${JSON.stringify(seed.wsName)})
       if (!row) return null
       window.__iso.rightClick(row)
       return row.querySelector('.sidebar-workspace-chevron')?.getAttribute('aria-expanded') ?? null
     })()`
  )
  await sleep(250)
  // Read after React re-rendered: a right-click must not toggle collapse.
  const expanded = ok === null ? null : await evaluate(ws, expandedOf)
  const menu = await evaluate(ws, `window.__iso.spawnHere()`)
  await sleep(400)
  return { ok: expanded, menu }
}

// --- 1. Workspace row → dialog on Workspace, chip selected ---
const wsMenu = await spawnFromWorkspaceRow()
const wsDialog = await evaluate(ws, `window.__iso.dialog()`)
check(
  'right-click on the workspace header shows "Spawn agent here" and keeps it expanded',
  wsMenu.menu === true && wsMenu.ok === 'true',
  `menu ${wsMenu.menu}, aria-expanded ${wsMenu.ok}`
)
check(
  'the dialog shows Workspace, Repo, Worktree in that order',
  wsDialog.levels.join('|') === 'Workspace|Repo|Worktree',
  wsDialog.levels.join(' | ')
)
check(
  'the dialog opens on Workspace with the workspace chip selected',
  wsDialog.level === 'Workspace' &&
    wsDialog.line1 === seed.wsName &&
    wsDialog.line2 !== null &&
    (await evaluate(
      ws,
      `window.__iso.norm(${JSON.stringify(wsDialog.line2 ?? '')}) === window.__iso.norm(${JSON.stringify(seed.wsPath)})`
    )),
  `${wsDialog.level}: ${wsDialog.line1} / ${wsDialog.line2}`
)

// --- 2. Switching to Repo clears the Workspace pick and disables Spawn ---
await evaluate(ws, `window.__iso.segment('Repo')`)
await sleep(250)
const switched = await evaluate(ws, `window.__iso.dialog()`)
check(
  'switching to Repo clears the Workspace selection and disables Spawn',
  switched.level === 'Repo' && switched.line1 === null && switched.spawnDisabled === true,
  `level ${switched.level}, selected ${switched.line1}, spawn disabled ${switched.spawnDisabled}`
)
await evaluate(ws, `window.__iso.cancel()`)
await sleep(300)

// --- 3. Spawn an Ad-hoc pwd at the workspace root ---
await spawnFromWorkspaceRow()
const wsId = await spawnAdhocPwd()
check('the workspace-level session spawned', wsId !== null, wsId ?? 'no new session')
if (wsId) {
  check('its terminal prints the workspace path', await printed(wsId, seed.wsPath), seed.wsPath)
  await sleep(500)
  const wsRail = JSON.parse(
    await evaluate(
      ws,
      `(() => {
         const g = window.__iso.group(${JSON.stringify(`Workspace · ${seed.wsName}`)})
         return JSON.stringify({
           group: g !== null,
           note: window.__iso.text(g, '.rail-group-note.level'),
           openBtn: window.__iso.openWorktreeBtn() !== null
         })
       })()`
    )
  )
  check(
    `the rail shows "Workspace · ${seed.wsName}"`,
    wsRail.group === true,
    `note: ${wsRail.note || 'none'}`
  )
  check('the workspace session has no "Open worktree" button', wsRail.openBtn === false)
}

// --- 4. Repo row → dialog on Repo, spawn, rail, Open worktree ---
await toTree()
const repoMenu = await evaluate(
  ws,
  `(() => {
     const section = [...document.querySelectorAll('.sidebar-workspace')]
       .find((s) => window.__iso.text(s, '.sidebar-workspace-name') === ${JSON.stringify(seed.wsName)})
     const row = [...(section?.querySelectorAll('.sidebar-repo-row') ?? [])]
       .find((r) => window.__iso.text(r, '.sidebar-repo-name') === ${JSON.stringify(seed.repoName)})
     if (!row) return false
     window.__iso.rightClick(row)
     return true
   })()`
)
await sleep(250)
const repoItem = await evaluate(ws, `window.__iso.spawnHere()`)
await sleep(400)
const repoDialog = await evaluate(ws, `window.__iso.dialog()`)
check(
  'right-click on the repo row shows "Spawn agent here"',
  repoMenu === true && repoItem === true
)
check(
  'the dialog opens on Repo with the primary checkout selected',
  repoDialog.level === 'Repo' &&
    repoDialog.line1 === seed.repoName &&
    repoDialog.line2 === `${seed.branch} · ${seed.wsName}`,
  `${repoDialog.level}: ${repoDialog.line1} / ${repoDialog.line2}`
)
const repoId = repoDialog.open ? await spawnAdhocPwd() : null
check('the repo-level session spawned', repoId !== null, repoId ?? 'no new session')
if (repoId) {
  check('its terminal prints the repo root', await printed(repoId, seed.repoPath), seed.repoPath)
  await sleep(500)
  const repoRail = JSON.parse(
    await evaluate(
      ws,
      `(() => {
         const g = window.__iso.group(${JSON.stringify(`Repo · ${seed.repoName}`)})
         return JSON.stringify({
           group: g !== null,
           note: window.__iso.text(g, '.rail-group-note.level'),
           openBtn: window.__iso.openWorktreeBtn() !== null
         })
       })()`
    )
  )
  check(
    `the rail shows "Repo · ${seed.repoName}" with the branch as note`,
    repoRail.group === true && repoRail.note === seed.branch,
    `note: ${repoRail.note || 'none'}`
  )
  check('the repo session shows "Open worktree"', repoRail.openBtn === true)
  await evaluate(ws, `window.__iso.openWorktreeBtn()?.click()`)
  await sleep(700)
  const opened = JSON.parse(
    await evaluate(
      ws,
      `(() => JSON.stringify({
         tree: document.querySelector('.topbar-segment.active')?.textContent.includes('Tree') ?? false,
         branch: window.__iso.text(document.querySelector('.sidebar-worktree.selected'), '.sidebar-worktree-branch')
       }))()`
    )
  )
  check(
    '"Open worktree" selects the primary checkout in the Tree',
    opened.tree === true && opened.branch === seed.branch,
    `tree ${opened.tree}, selected ${opened.branch || 'none'}`
  )
}

await cleanup()
const leftover = await evaluate(
  ws,
  `(async () => {
     const ids = ${JSON.stringify(spawned)}
     return (await window.api.invoke('sessions:list')).filter((s) => ids.includes(s.id)).length
   })()`
)
check('cleanup removed the smoke sessions', leftover === 0, `${leftover} left`)

summarise()
