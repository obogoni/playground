import { describe, expect, it } from 'vitest'
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
