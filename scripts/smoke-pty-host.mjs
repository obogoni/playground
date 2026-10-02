/* pty-host smoke (#155). Launches the built app on a temp userData, drives
 * sessions over IPC through CDP, and checks processes with a unique marker in
 * their command line. Hand-run, never in CI (TESTING.md).
 *
 * Run against the dev build:  npx electron-vite build && node scripts/smoke-pty-host.mjs
 * Run against a package:      SMOKE_EXE=dist/win-unpacked/playground.exe node scripts/smoke-pty-host.mjs
 * Env: RUN2_ONLY=1 skips run 1; RUN2_ITER=N repeats the quit-during-spawn run;
 *      SMOKE_PERF=1 adds run 3, a main-process CPU profile of spawn/respawn/duplicate (PTYH-02);
 *      PERF_ONLY=1 runs only run 3.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

const PORT = Number(process.env.SMOKE_PORT) || 9334
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MARK = `ptysmoke${Date.now()}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const checks = []
function check(name, ok, detail = '') {
  checks.push({ name, ok })
  console.log(
    `${String(checks.length).padStart(2)}. ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  )
}

function procs(filter) {
  const ps = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ${filter} } | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)" }`
    ],
    { encoding: 'utf8' }
  )
  return ps.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [pid, ppid, name] = l.split('|')
      return { pid: Number(pid), ppid: Number(ppid), name }
    })
}
const marked = (tag) => procs(`$_.CommandLine -like '*${MARK}${tag}*'`)

async function launch(extraEnv = {}, extraFlags = []) {
  const userData = mkdtempSync(join(tmpdir(), 'pty-smoke-'))
  const env = { ...process.env, ...extraEnv }
  delete env.ELECTRON_RUN_AS_NODE
  const flags = [...extraFlags, `--user-data-dir=${userData}`, `--remote-debugging-port=${PORT}`]
  const exe = process.env.SMOKE_EXE
  const app = spawn(exe ? join(ROOT, exe) : electron, exe ? flags : ['.', ...flags], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  app.stdout.on('data', (c) => (output += c))
  app.stderr.on('data', (c) => (output += c))
  const exited = new Promise((resolve) => app.on('exit', (code) => resolve(code)))
  let target
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      target = targets.find((t) => t.type === 'page')
    } catch {
      /* not up */
    }
    if (!target) await sleep(1000)
  }
  if (!target) throw new Error('no CDP page')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })
  let nextId = 1
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const onMessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id !== id) return
        ws.removeEventListener('message', onMessage)
        if (msg.error) reject(new Error(msg.error.message))
        else if (msg.result.exceptionDetails)
          reject(new Error(JSON.stringify(msg.result.exceptionDetails)))
        else resolve(msg.result.result.value)
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
  for (let i = 0; i < 60 && (await evaluate('document.readyState')) !== 'complete'; i++)
    await sleep(250)
  await evaluate(`(() => {
    window.__ev = []
    for (const ch of ['session:data', 'session:exit', 'session:status'])
      window.api.on(ch, (p) => window.__ev.push({ ch, p }))
    return true
  })()`)
  const close = () =>
    ws.send(
      JSON.stringify({
        id: 99999,
        method: 'Runtime.evaluate',
        params: { expression: 'window.close()' }
      })
    )
  const cleanup = async () => {
    if (app.exitCode === null) {
      spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'])
      await exited
    }
    await rm(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(
      () => {}
    )
  }
  return { app, evaluate, close, exited, cleanup, output: () => output }
}

const cmd = (tag) => `node -e 'setInterval(()=>{},1e3)' ${MARK}${tag}`
const spawnExpr = (tag) =>
  `window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: 'C:\\\\Windows', adhocCommand: ${JSON.stringify(cmd(tag))} })`

async function waitFor(pred, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await pred()) return true
    await sleep(250)
  }
  return false
}

// --- Run 1: spawn/attach/type/resize/stop, host crash, respawn, quit with 3 sessions ---
if (!process.env.RUN2_ONLY && !process.env.PERF_ONLY) {
  const r = await launch()
  try {
    const a = await r.evaluate(spawnExpr('A'))
    check('spawn resolves a running session', a?.status === 'running', a?.status)
    await r.evaluate(`window.api.invoke('sessions:attach', { id: '${a.id}' })`)
    // No xterm is mounted for this session: answer ConPTY's cursor query ourselves.
    await r.evaluate(`window.api.send('session:input', { id: '${a.id}', data: '\x1b[1;1R' })`)
    await sleep(3000)
    // node is blocking pwsh; Ctrl+C ends it, then pwsh echoes typed input.
    await r.evaluate(`window.api.send('session:input', { id: '${a.id}', data: '\\x03' })`)
    await sleep(1000)
    await r.evaluate(`window.api.send('session:resize', { id: '${a.id}', cols: 100, rows: 30 })`)
    await r.evaluate(
      `window.api.send('session:input', { id: '${a.id}', data: 'echo typed-${MARK}\\r' })`
    )
    const echoed = await waitFor(() =>
      r.evaluate(
        `window.__ev.some((e) => e.ch === 'session:data' && e.p.id === '${a.id}' && e.p.data.includes('typed-${MARK}'))`
      )
    )
    check('typed input echoes on session:data after Ctrl+C and resize', echoed)
    if (!echoed)
      console.log(
        'DATA A:',
        JSON.stringify(
          await r.evaluate(
            `window.__ev.filter((e) => e.ch === 'session:data').map((e) => e.p.data).join('')`
          )
        ).slice(-1500)
      )
    {
      const t = await r.evaluate(
        `window.api.invoke('sessions:spawn', { agentName: 'Ad-hoc', cwd: 'C:\\\\Windows', adhocCommand: 'Write-Output ready-${MARK}' })`
      )
      await r.evaluate(`window.api.invoke('sessions:attach', { id: '${t.id}' })`)
      await r.evaluate(`window.api.send('session:input', { id: '${t.id}', data: '\\x1b[1;1R' })`)
      const has = (txt) =>
        r.evaluate(
          `window.__ev.filter((e) => e.ch === 'session:data' && e.p.id === '${t.id}').map((e) => e.p.data).join('').includes('${txt}')`
        )
      const ready = await waitFor(() => has(`ready-${MARK}`), 20000)
      await r.evaluate(`window.api.send('session:resize', { id: '${t.id}', cols: 90, rows: 25 })`)
      await r.evaluate(
        `window.api.send('session:input', { id: '${t.id}', data: 'echo typed2-${MARK}\\r' })`
      )
      const typed = await waitFor(() => has(`typed2-${MARK}`), 20000)
      check(
        'plain pwsh session: output, then typed input after resize echoes',
        ready && typed,
        `ready=${ready} typed=${typed}`
      )
      await r.evaluate(`window.api.invoke('sessions:stop', { id: '${t.id}' })`)
    }
    await r.evaluate(`window.api.invoke('sessions:stop', { id: '${a.id}' })`)
    const list1 = await r.evaluate(`window.api.invoke('sessions:list')`)
    check('stop turns the session stopped', list1.find((s) => s.id === a.id)?.status === 'stopped')
    const exitA = await waitFor(() =>
      r.evaluate(
        `window.__ev.some((e) => e.ch === 'session:exit' && e.p.id === '${a.id}' && !('hostExited' in e.p))`
      )
    )
    check('a normal exit emits session:exit without hostExited', exitA)

    // Replay on re-attach.
    const b = await r.evaluate(spawnExpr('B'))
    await sleep(2500)
    await r.evaluate(`window.__ev.length = 0`)
    await r.evaluate(`window.api.invoke('sessions:attach', { id: '${b.id}' })`)
    const replay = await waitFor(() =>
      r.evaluate(
        `window.__ev.some((e) => e.ch === 'session:data' && e.p.id === '${b.id}' && e.p.data.length > 0)`
      )
    )
    check('attach replays scrollback on session:data', replay)
    const c = await r.evaluate(spawnExpr('C'))

    // Host crash.
    await waitFor(async () => marked('B').some((p) => p.name === 'node.exe'))
    const shellB = marked('B').find((p) => p.name === 'pwsh.exe')
    const host = shellB ? procs(`$_.ProcessId -eq ${shellB.ppid}`)[0] : undefined
    check(
      'found the PTY host (parent of the shell)',
      !!host,
      host ? `${host.name} ${host.pid}` : 'none'
    )
    if (host) {
      spawnSync('taskkill', ['/pid', String(host.pid), '/F'])
      const notice = await waitFor(() =>
        r.evaluate(
          `['${b.id}', '${c.id}'].every((id) => window.__ev.some((e) => e.ch === 'session:exit' && e.p.id === id && e.p.hostExited === true && e.p.exitCode === -1))`
        )
      )
      check('host kill emits session:exit {exitCode:-1, hostExited:true} for both sessions', notice)
      const list2 = await r.evaluate(`window.api.invoke('sessions:list')`)
      check(
        'both sessions stopped after the host crash',
        [b.id, c.id].every((id) => list2.find((s) => s.id === id)?.status === 'stopped')
      )
      check('app still up after the host crash', r.app.exitCode === null)
      check('host crash logged', /\[pty-host\] exited unexpectedly \(code/.test(r.output()))
      const again = await r.evaluate(`window.api.invoke('sessions:respawn', { id: '${b.id}' })`)
      check('respawn after the crash starts a new host and runs', again?.status === 'running')
    }

    await r.evaluate(spawnExpr('D'))
    await r.evaluate(spawnExpr('E'))
    await waitFor(async () =>
      ['B', 'D', 'E'].every((t) => marked(t).some((p) => p.name === 'node.exe'))
    )
    const before = ['B', 'D', 'E'].flatMap((t) => marked(t))
    check(
      '3 sessions running with their node children before quit',
      before.filter((p) => p.name === 'node.exe').length === 3
    )
    r.close()
    const code = await Promise.race([r.exited, sleep(20000).then(() => 'timeout')])
    check('app exits after its window closes', code !== 'timeout', `exit ${code}`)
    await sleep(4000)
    const left = ['A', 'B', 'C', 'D', 'E'].flatMap((t) => marked(t))
    check('no marked shell/agent process left after quit', left.length === 0, JSON.stringify(left))
    check('no unhandled rejection', !/UnhandledPromiseRejection/.test(r.output()))
  } finally {
    await r.cleanup()
    console.log('--- run 1 main output (tail) ---\n' + r.output().split('\n').slice(-25).join('\n'))
  }
}

// --- Run 2: quit right after a spawn is requested ---
for (
  let iter = 0;
  iter < (process.env.PERF_ONLY ? 0 : Number(process.env.RUN2_ITER) || 1);
  iter++
) {
  const r = await launch()
  try {
    await sleep(1500) // host started at ready
    await r.evaluate(`(${spawnExpr('Q')}.catch(() => {}), true)`)
    r.close()
    const code = await Promise.race([r.exited, sleep(20000).then(() => 'timeout')])
    check('run 2: app exits after a quit during a spawn', code !== 'timeout', `exit ${code}`)
    await sleep(4000)
    const left = marked('Q')
    check(
      'run 2: no process from the in-flight spawn is left',
      left.length === 0,
      JSON.stringify(left)
    )
  } finally {
    await r.cleanup()
    console.log('--- run 2 main output (tail) ---\n' + r.output().split('\n').slice(-15).join('\n'))
  }
}

// --- Run 3: main-process CPU profile around spawn, respawn and duplicate (PTYH-02) ---
// Opens the main process inspector, samples at 1 ms, and reports the longest
// stretch of consecutive non-idle samples while each action runs.
if (process.env.SMOKE_PERF) {
  const INSPECT_PORT = Number(process.env.SMOKE_INSPECT_PORT) || 9339
  const r = await launch({}, [`--inspect=${INSPECT_PORT}`])
  let main
  try {
    let wsUrl
    for (let i = 0; i < 20 && !wsUrl; i++) {
      try {
        wsUrl = (await (await fetch(`http://127.0.0.1:${INSPECT_PORT}/json/list`)).json())[0]
          ?.webSocketDebuggerUrl
      } catch {
        /* not up */
      }
      if (!wsUrl) await sleep(500)
    }
    if (!wsUrl) throw new Error('no main-process inspector')
    main = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      main.addEventListener('open', resolve)
      main.addEventListener('error', reject)
    })
    let nextId = 1
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        const onMessage = (event) => {
          const msg = JSON.parse(event.data)
          if (msg.id !== id) return
          main.removeEventListener('message', onMessage)
          if (msg.error) reject(new Error(msg.error.message))
          else resolve(msg.result)
        }
        main.addEventListener('message', onMessage)
        main.send(JSON.stringify({ id, method, params }))
      })
    await send('Profiler.enable')
    await send('Profiler.setSamplingInterval', { interval: 1000 })

    // Longest run of consecutive non-idle samples, in ms, and the hottest frame in it.
    const longestBusy = (profile) => {
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      const parent = new Map()
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
      let best = { ms: 0, frames: new Map() }
      let cur = { ms: 0, frames: new Map() }
      profile.samples.forEach((id, i) => {
        const node = byId.get(id)
        const dt = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i]) / 1000
        if (node.callFrame.functionName === '(idle)') {
          if (cur.ms > best.ms) best = cur
          cur = { ms: 0, frames: new Map() }
          return
        }
        cur.ms += dt
        // Attribute the sample to its nearest frame in the app bundle.
        let n = node
        while (n && !n.callFrame.url.includes('/out/main/')) n = byId.get(parent.get(n.id))
        const name = n
          ? `${n.callFrame.functionName} ${n.callFrame.url.split(/[\\/]/).pop()}:${n.callFrame.lineNumber + 1}`
          : '(anonymous)'
        cur.frames.set(name, (cur.frames.get(name) ?? 0) + dt)
      })
      if (cur.ms > best.ms) best = cur
      const top = [...best.frames.entries()].sort((a, b) => b[1] - a[1])[0]
      // Main-process time spent inside node-pty (PTY creation in main, PTYH-01/02).
      const inPty = (node) => {
        for (let n = node; n; n = byId.get(parent.get(n.id)))
          if (
            n.callFrame.url.includes('node-pty') ||
            n.callFrame.functionName === 'WindowsPtyAgent'
          )
            return true
        return false
      }
      const ptyMs = profile.samples.reduce(
        (sum, id, i) =>
          sum +
          (inPty(byId.get(id)) ? (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i]) / 1000 : 0),
        0
      )
      return { ms: best.ms, ptyMs, top: top ? `${top[0]} (${top[1].toFixed(0)} ms)` : '-' }
    }
    const profiled = async (label, action) => {
      await sleep(1500)
      await send('Profiler.start')
      const value = await action()
      await sleep(500)
      const { profile } = await send('Profiler.stop')
      const busy = longestBusy(profile)
      console.log(
        `    ${label}: longest main busy stretch ${busy.ms.toFixed(1)} ms; hottest ${busy.top}; in node-pty ${busy.ptyMs.toFixed(1)} ms`
      )
      return { busy, value }
    }

    await sleep(3000) // host forked at ready
    const idle = await profiled('idle', async () => null)
    const spawned = await profiled('spawn', () => r.evaluate(spawnExpr('P')))
    await r.evaluate(`window.api.invoke('sessions:stop', { id: '${spawned.value.id}' })`)
    const respawned = await profiled('respawn', () =>
      r.evaluate(`window.api.invoke('sessions:respawn', { id: '${spawned.value.id}' })`)
    )
    const duplicated = await profiled('duplicate', () =>
      r.evaluate(`window.api.invoke('sessions:duplicate', { id: '${spawned.value.id}' })`)
    )
    for (const [label, m] of [
      ['spawn', spawned],
      ['respawn', respawned],
      ['duplicate', duplicated]
    ])
      check(
        `run 3: ${label} spends no main-process time in node-pty`,
        m.busy.ptyMs === 0,
        `node-pty ${m.busy.ptyMs.toFixed(1)} ms; longest busy stretch ${m.busy.ms.toFixed(1)} ms (idle ${idle.busy.ms.toFixed(1)} ms), hottest ${m.busy.top}`
      )
  } finally {
    main?.close()
    r.close()
    await Promise.race([r.exited, sleep(20000)])
    await r.cleanup()
  }
}

const passed = checks.filter((c) => c.ok).length
console.log(`\n${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
