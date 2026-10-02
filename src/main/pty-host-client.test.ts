import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FromHost, ToHost } from '../shared/pty-host-protocol'
import { PtyHostClient, type HostTransport } from './pty-host-client'
import type { PtyHandle } from './pty-port'
import type { SpawnPlan } from './spawn-plan'

interface FakeTransport extends HostTransport {
  posted: ToHost[]
  kills: number
  emit(m: FromHost): void
  exit(code: number): void
}

function fakeTransport(): FakeTransport {
  let msgCb: ((m: FromHost) => void) | undefined
  let exitCb: ((code: number) => void) | undefined
  const t: FakeTransport = {
    posted: [],
    kills: 0,
    post: (m) => {
      t.posted.push(m)
    },
    onMessage: (cb) => {
      msgCb = cb
    },
    onExit: (cb) => {
      exitCb = cb
    },
    kill: () => {
      t.kills++
    },
    emit: (m) => msgCb?.(m),
    exit: (code) => exitCb?.(code)
  }
  return t
}

interface Harness {
  client: PtyHostClient
  transports: FakeTransport[]
  logs: Array<{ line: string; err?: unknown }>
  /** The transport the client forked most recently. */
  t(): FakeTransport
}

function setup(): Harness {
  const transports: FakeTransport[] = []
  const logs: Array<{ line: string; err?: unknown }> = []
  const client = new PtyHostClient({
    fork: () => {
      const t = fakeTransport()
      transports.push(t)
      return t
    },
    log: (line, err) => logs.push({ line, err })
  })
  return { client, transports, logs, t: () => transports[transports.length - 1] }
}

const PLAN: SpawnPlan = {
  file: 'pwsh.exe',
  args: ['-NoExit', '-Command', 'claude'],
  cwd: 'C:\\repo',
  autoCommand: 'claude'
}

function spawnIdOf(m: ToHost | undefined): number {
  if (m?.type !== 'spawn') throw new Error(`expected a spawn message, got ${m?.type}`)
  return m.ptyId
}

/** Spawn and acknowledge, returning the handle and its ptyId. */
async function spawned(h: Harness): Promise<{ handle: PtyHandle; ptyId: number }> {
  const p = h.client.spawn(PLAN)
  const ptyId = spawnIdOf(h.t().posted.at(-1))
  h.t().emit({ type: 'spawned', ptyId, pid: 4242 })
  return { handle: await p, ptyId }
}

describe('PtyHostClient.spawn', () => {
  it('posts spawn with the plan and buildPtyEnv of the developer env plus overrides', () => {
    const h = setup()
    void h.client.spawn(PLAN, { PLAYGROUND_ACTIVITY_TOKEN: 'tok-1', TERM: 'dumb' })

    const m = h.t().posted[0]
    expect(m).toEqual({
      type: 'spawn',
      ptyId: spawnIdOf(m),
      file: 'pwsh.exe',
      args: ['-NoExit', '-Command', 'claude'],
      cwd: 'C:\\repo',
      env: {
        ...process.env,
        PLAYGROUND_ACTIVITY_TOKEN: 'tok-1',
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        FORCE_HYPERLINK: '1'
      }
    })
  })

  it('assigns a fresh ptyId to every spawn', () => {
    const h = setup()
    void h.client.spawn(PLAN)
    void h.client.spawn(PLAN)
    void h.client.spawn(PLAN)

    const ids = h.t().posted.map(spawnIdOf)
    expect(new Set(ids).size).toBe(3)
  })

  it('resolves two in-flight spawns independently, each with its own handle (PTYH-05)', async () => {
    const h = setup()
    const p1 = h.client.spawn(PLAN)
    const p2 = h.client.spawn(PLAN)
    const [id1, id2] = h.t().posted.map(spawnIdOf)
    h.t().emit({ type: 'spawned', ptyId: id2, pid: 2 })
    h.t().emit({ type: 'spawned', ptyId: id1, pid: 1 })
    const [a, b] = await Promise.all([p1, p2])

    a.write('to-a')
    b.write('to-b')
    expect(h.t().posted.slice(2)).toEqual([
      { type: 'write', ptyId: id1, data: 'to-a' },
      { type: 'write', ptyId: id2, data: 'to-b' }
    ])
  })

  it('rejects with the host message on spawn-failed and logs the plan (#89 line)', async () => {
    const h = setup()
    const p = h.client.spawn(PLAN)
    const ptyId = spawnIdOf(h.t().posted[0])
    h.t().emit({
      type: 'spawn-failed',
      ptyId,
      message: 'Cannot create process, error code: 267'
    })

    await expect(p).rejects.toThrow('Cannot create process, error code: 267')
    expect(h.logs).toHaveLength(1)
    expect(h.logs[0].line).toBe(
      'Failed to spawn PTY: file=pwsh.exe args=["-NoExit","-Command","claude"] cwd=C:\\repo'
    )
    expect((h.logs[0].err as Error).message).toBe('Cannot create process, error code: 267')
  })

  it('forks the host once for several spawns', () => {
    const h = setup()
    void h.client.spawn(PLAN)
    void h.client.spawn(PLAN)

    expect(h.transports).toHaveLength(1)
  })
})

describe('PtyHostClient handle', () => {
  it('delivers data and exit that arrived before the listeners, in order, on registration', async () => {
    const h = setup()
    const p = h.client.spawn(PLAN)
    const ptyId = spawnIdOf(h.t().posted[0])
    h.t().emit({ type: 'spawned', ptyId, pid: 1 })
    h.t().emit({ type: 'data', ptyId, data: 'one' })
    h.t().emit({ type: 'data', ptyId, data: 'two' })
    h.t().emit({ type: 'exit', ptyId, exitCode: 3 })
    const handle = await p

    const seen: string[] = []
    handle.onData((d) => seen.push(`data:${d}`))
    handle.onExit((e) => seen.push(`exit:${e.exitCode}`))
    expect(seen).toEqual(['data:one', 'data:two', 'exit:3'])
  })

  it('holds a buffered exit until the earlier data is delivered, even if onExit registers first', async () => {
    const h = setup()
    const p = h.client.spawn(PLAN)
    const ptyId = spawnIdOf(h.t().posted[0])
    h.t().emit({ type: 'spawned', ptyId, pid: 1 })
    h.t().emit({ type: 'data', ptyId, data: 'last words' })
    h.t().emit({ type: 'exit', ptyId, exitCode: 0 })
    const handle = await p

    const seen: string[] = []
    handle.onExit((e) => seen.push(`exit:${e.exitCode}`))
    expect(seen).toEqual([])
    handle.onData((d) => seen.push(`data:${d}`))
    expect(seen).toEqual(['data:last words', 'exit:0'])
  })

  it('delivers live data in order and exit after every earlier data', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    const seen: string[] = []
    handle.onData((d) => seen.push(`data:${d}`))
    handle.onExit((e) => seen.push(`exit:${e.exitCode}`))
    h.t().emit({ type: 'data', ptyId, data: 'a' })
    h.t().emit({ type: 'data', ptyId, data: 'b' })
    h.t().emit({ type: 'exit', ptyId, exitCode: 130 })

    expect(seen).toEqual(['data:a', 'data:b', 'exit:130'])
  })

  it('routes data to the handle of its ptyId only', async () => {
    const h = setup()
    const a = await spawned(h)
    const b = await spawned(h)
    const seenA: string[] = []
    const seenB: string[] = []
    a.handle.onData((d) => seenA.push(d))
    b.handle.onData((d) => seenB.push(d))
    h.t().emit({ type: 'data', ptyId: b.ptyId, data: 'for b' })

    expect(seenA).toEqual([])
    expect(seenB).toEqual(['for b'])
  })

  it('posts write, resize and kill in call order', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    handle.write('ls\r')
    handle.resize(120, 40)
    handle.write('\x03')
    handle.kill()

    expect(h.t().posted.slice(1)).toEqual([
      { type: 'write', ptyId, data: 'ls\r' },
      { type: 'resize', ptyId, cols: 120, rows: 40 },
      { type: 'write', ptyId, data: '\x03' },
      { type: 'kill', ptyId }
    ])
  })

  it('drops write, resize and kill after the PTY exited, without throwing', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    handle.onExit(() => {})
    h.t().emit({ type: 'exit', ptyId, exitCode: 0 })
    const before = h.t().posted.length

    expect(() => {
      handle.write('x')
      handle.resize(80, 24)
      handle.kill()
    }).not.toThrow()
    expect(h.t().posted).toHaveLength(before)
  })
})

describe('PtyHostClient host crash', () => {
  it('fires every live handle onExit once with exitCode -1 and hostExited', async () => {
    const h = setup()
    const a = await spawned(h)
    const b = await spawned(h)
    const exitsA: unknown[] = []
    const exitsB: unknown[] = []
    a.handle.onExit((e) => exitsA.push(e))
    b.handle.onExit((e) => exitsB.push(e))
    h.t().exit(1)
    h.t().exit(1)

    expect(exitsA).toEqual([{ exitCode: -1, hostExited: true }])
    expect(exitsB).toEqual([{ exitCode: -1, hostExited: true }])
  })

  it('delivers the host-exit after data already queued for the handle', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    h.t().emit({ type: 'data', ptyId, data: 'tail' })
    h.t().exit(1)
    const seen: unknown[] = []
    handle.onExit((e) => seen.push(e))
    handle.onData((d) => seen.push(d))

    expect(seen).toEqual(['tail', { exitCode: -1, hostExited: true }])
  })

  it('does not fire a host-exit for a handle whose PTY already exited', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    const seen: unknown[] = []
    handle.onExit((e) => seen.push(e))
    h.t().emit({ type: 'exit', ptyId, exitCode: 0 })
    h.t().exit(1)

    expect(seen).toEqual([{ exitCode: 0 }])
  })

  it('rejects a pending spawn with "PTY host exited unexpectedly"', async () => {
    const h = setup()
    const p = h.client.spawn(PLAN)
    h.t().exit(3221225477)

    await expect(p).rejects.toThrow('PTY host exited unexpectedly')
  })

  it('logs the exit code of the host', () => {
    const h = setup()
    h.client.start()
    h.t().exit(3221225477)

    expect(h.logs.map((l) => l.line)).toEqual(['[pty-host] exited unexpectedly (code 3221225477)'])
  })

  it('drops write, resize and kill on a handle after the host exited', async () => {
    const h = setup()
    const { handle } = await spawned(h)
    const crashed = h.t()
    const before = crashed.posted.length
    crashed.exit(1)
    handle.write('x')
    handle.resize(80, 24)
    handle.kill()

    expect(crashed.posted).toHaveLength(before)
  })

  it('forks a new host on the next spawn and spawns the session in it', async () => {
    const h = setup()
    await spawned(h)
    h.transports[0].exit(1)

    expect(h.transports).toHaveLength(1)
    expect(h.client.alive).toBe(false)
    const p = h.client.spawn(PLAN)
    expect(h.transports).toHaveLength(2)
    const ptyId = spawnIdOf(h.transports[1].posted[0])
    h.transports[1].emit({ type: 'spawned', ptyId, pid: 7 })
    await expect(p).resolves.toBeDefined()
    expect(h.client.alive).toBe(true)
  })

  it('issues no spawn after a crash until one is requested (no auto-respawn)', async () => {
    const h = setup()
    await spawned(h)
    await spawned(h)
    h.transports[0].exit(1)

    expect(h.transports).toHaveLength(1)
    expect(h.transports[0].posted.filter((m) => m.type === 'spawn')).toHaveLength(2)
  })

  it('ignores messages and exits from a host that already crashed', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    const seen: unknown[] = []
    handle.onData((d) => seen.push(d))
    h.transports[0].exit(1)
    void h.client.spawn(PLAN)
    h.transports[0].emit({ type: 'data', ptyId, data: 'ghost' })
    h.transports[0].exit(1)

    expect(seen).toEqual([])
    expect(h.client.alive).toBe(true)
    expect(h.logs).toHaveLength(1)
  })

  it('rejects the spawn when the fork throws, and the next spawn retries the fork', async () => {
    let calls = 0
    const transports: FakeTransport[] = []
    const client = new PtyHostClient({
      fork: () => {
        calls++
        if (calls === 1) throw new Error('fork failed')
        const t = fakeTransport()
        transports.push(t)
        return t
      },
      log: () => {}
    })

    await expect(client.spawn(PLAN)).rejects.toThrow('fork failed')
    expect(client.alive).toBe(false)
    void client.spawn(PLAN)
    expect(calls).toBe(2)
    expect(transports[0].posted.map((m) => m.type)).toEqual(['spawn'])
  })
})

describe('PtyHostClient.start', () => {
  it('forks the host eagerly and reuses it for the first spawn', () => {
    const h = setup()
    expect(h.client.alive).toBe(false)
    h.client.start()

    expect(h.transports).toHaveLength(1)
    expect(h.client.alive).toBe(true)
    void h.client.spawn(PLAN)
    expect(h.transports).toHaveLength(1)
    expect(h.transports[0].posted.map((m) => m.type)).toEqual(['spawn'])
  })

  it('logs a fork that throws instead of throwing, and the next spawn retries the fork', () => {
    let calls = 0
    const logs: string[] = []
    const client = new PtyHostClient({
      fork: () => {
        calls++
        if (calls === 1) throw new Error('fork failed')
        return fakeTransport()
      },
      log: (line) => logs.push(line)
    })

    expect(() => client.start()).not.toThrow()
    expect(logs).toEqual(['[pty-host] failed to start'])
    void client.spawn(PLAN)
    expect(calls).toBe(2)
    expect(client.alive).toBe(true)
  })
})

describe('PtyHostClient.shutdown', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts killAll after every earlier message', async () => {
    const h = setup()
    const { handle, ptyId } = await spawned(h)
    handle.write('exit\r')
    handle.kill()
    void h.client.shutdown(3000)

    expect(h.t().posted.slice(1)).toEqual([
      { type: 'write', ptyId, data: 'exit\r' },
      { type: 'kill', ptyId },
      { type: 'killAll' }
    ])
  })

  it('resolves when the host exits, without killing it', async () => {
    const h = setup()
    h.client.start()
    let done = false
    const p = h.client.shutdown(3000).then(() => {
      done = true
    })
    await Promise.resolve()
    expect(done).toBe(false)
    h.t().exit(0)
    await p

    expect(done).toBe(true)
    expect(h.t().kills).toBe(0)
    expect(h.client.alive).toBe(false)
  })

  it('kills the host at exactly 3000 ms when it has not exited, then resolves', async () => {
    vi.useFakeTimers()
    const h = setup()
    h.client.start()
    let done = false
    const p = h.client.shutdown(3000).then(() => {
      done = true
    })

    await vi.advanceTimersByTimeAsync(2999)
    expect(h.t().kills).toBe(0)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.t().kills).toBe(1)
    await p
    expect(done).toBe(true)
  })

  it('treats an exit during shutdown as no crash: no hostExited finalize, no crash log', async () => {
    const h = setup()
    const { handle } = await spawned(h)
    const exits: unknown[] = []
    handle.onExit((e) => exits.push(e))
    const p = h.client.shutdown(3000)
    h.t().exit(0)
    await p

    expect(exits).toEqual([])
    expect(h.logs).toEqual([])
  })

  it('does not kill the host after it exited before the deadline', async () => {
    vi.useFakeTimers()
    const h = setup()
    h.client.start()
    const p = h.client.shutdown(3000)
    h.t().exit(0)
    await p
    await vi.advanceTimersByTimeAsync(5000)

    expect(h.t().kills).toBe(0)
  })

  it('settles a spawn still pending when the host exits on shutdown', async () => {
    const h = setup()
    const pending = h.client.spawn(PLAN)
    const p = h.client.shutdown(3000)
    h.t().exit(0)
    await p

    await expect(pending).rejects.toThrow('PTY host shut down')
  })

  it('resolves immediately with no live host, without forking', async () => {
    const h = setup()
    await h.client.shutdown(3000)

    expect(h.transports).toHaveLength(0)
  })

  it('resolves immediately after the host crashed', async () => {
    const h = setup()
    h.client.start()
    h.t().exit(1)
    await h.client.shutdown(3000)

    expect(h.t().posted).toEqual([])
  })
})
