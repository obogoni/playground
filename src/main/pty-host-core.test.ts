import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromHost, ToHost } from '../shared/pty-host-protocol'
import { createPtyHost, type IPtyLike, type PtySpawnOptions } from './pty-host-core'

interface FakePty extends IPtyLike {
  file: string
  args: string[]
  opts: PtySpawnOptions
  writes: string[]
  resizes: Array<[number, number]>
  kills: number
  emitData(data: string): void
  emitExit(exitCode: number): void
}

function fakeFactory(): {
  spawn: (file: string, args: string[], opts: PtySpawnOptions) => IPtyLike
  ptys: FakePty[]
  failWith?: unknown
} {
  const ptys: FakePty[] = []
  const factory = {
    ptys,
    failWith: undefined as unknown,
    spawn(file: string, args: string[], opts: PtySpawnOptions): IPtyLike {
      if (factory.failWith !== undefined) throw factory.failWith
      let dataCb: ((d: string) => void) | undefined
      let exitCb: ((e: { exitCode: number }) => void) | undefined
      const p: FakePty = {
        pid: 1000 + ptys.length,
        file,
        args,
        opts,
        writes: [],
        resizes: [],
        kills: 0,
        onData: (cb) => {
          dataCb = cb
        },
        onExit: (cb) => {
          exitCb = cb
        },
        write: (d) => {
          p.writes.push(d)
        },
        resize: (c, r) => {
          p.resizes.push([c, r])
        },
        kill: () => {
          p.kills++
        },
        emitData: (d) => dataCb?.(d),
        emitExit: (code) => exitCb?.({ exitCode: code })
      }
      ptys.push(p)
      return p
    }
  }
  return factory
}

function setup(): {
  host: { handle(m: ToHost): void }
  factory: ReturnType<typeof fakeFactory>
  posted: FromHost[]
  exits: number[]
} {
  const factory = fakeFactory()
  const posted: FromHost[] = []
  const exits: number[] = []
  const host = createPtyHost({
    spawn: (file, args, opts) => factory.spawn(file, args, opts),
    post: (m) => posted.push(m),
    exit: (code) => exits.push(code)
  })
  return { host, factory, posted, exits }
}

const ENV = { PATH: 'C:\\bin', TERM: 'xterm-256color' }

function spawnMsg(ptyId: number): ToHost {
  return { type: 'spawn', ptyId, file: 'pwsh.exe', args: ['-NoExit'], cwd: 'C:\\repo', env: ENV }
}

describe('createPtyHost', () => {
  it('spawns with the plan, xterm-256color and ConPTY, and posts spawned with the pid', () => {
    const { host, factory, posted } = setup()
    host.handle(spawnMsg(7))

    expect(factory.ptys).toHaveLength(1)
    const p = factory.ptys[0]
    expect(p.file).toBe('pwsh.exe')
    expect(p.args).toEqual(['-NoExit'])
    expect(p.opts).toEqual({
      name: 'xterm-256color',
      cwd: 'C:\\repo',
      env: ENV,
      useConpty: true
    })
    expect(posted).toEqual([{ type: 'spawned', ptyId: 7, pid: 1000 }])
  })

  it('posts spawn-failed with the error message when the factory throws', () => {
    const { host, factory, posted } = setup()
    factory.failWith = new Error('Cannot create process, error code: 267')
    host.handle(spawnMsg(3))

    expect(posted).toEqual([
      { type: 'spawn-failed', ptyId: 3, message: 'Cannot create process, error code: 267' }
    ])
  })

  it('posts data and exit per ptyId in the PTY event order', () => {
    const { host, factory, posted } = setup()
    host.handle(spawnMsg(1))
    host.handle(spawnMsg(2))
    const [a, b] = factory.ptys
    a.emitData('a1')
    b.emitData('b1')
    a.emitData('a2')
    a.emitExit(0)
    b.emitExit(5)

    expect(posted.slice(2)).toEqual([
      { type: 'data', ptyId: 1, data: 'a1' },
      { type: 'data', ptyId: 2, data: 'b1' },
      { type: 'data', ptyId: 1, data: 'a2' },
      { type: 'exit', ptyId: 1, exitCode: 0 },
      { type: 'exit', ptyId: 2, exitCode: 5 }
    ])
  })

  it('routes write, resize and kill to the PTY with that ptyId', () => {
    const { host, factory } = setup()
    host.handle(spawnMsg(1))
    host.handle(spawnMsg(2))
    host.handle({ type: 'write', ptyId: 2, data: 'ls\r' })
    host.handle({ type: 'resize', ptyId: 2, cols: 120, rows: 40 })
    host.handle({ type: 'write', ptyId: 1, data: 'x' })
    host.handle({ type: 'kill', ptyId: 1 })
    const [a, b] = factory.ptys

    expect(a.writes).toEqual(['x'])
    expect(a.kills).toBe(1)
    expect(b.writes).toEqual(['ls\r'])
    expect(b.resizes).toEqual([[120, 40]])
    expect(b.kills).toBe(0)
  })

  it('drops write, resize and kill on an unknown ptyId without throwing', () => {
    const { host, factory, posted } = setup()
    host.handle(spawnMsg(1))

    expect(() => {
      host.handle({ type: 'write', ptyId: 99, data: 'x' })
      host.handle({ type: 'resize', ptyId: 99, cols: 80, rows: 24 })
      host.handle({ type: 'kill', ptyId: 99 })
    }).not.toThrow()
    expect(factory.ptys[0].writes).toEqual([])
    expect(factory.ptys[0].resizes).toEqual([])
    expect(factory.ptys[0].kills).toBe(0)
    expect(posted).toHaveLength(1)
  })

  it('drops write, resize and kill on an exited ptyId without throwing', () => {
    const { host, factory } = setup()
    host.handle(spawnMsg(1))
    const p = factory.ptys[0]
    p.emitExit(0)

    expect(() => {
      host.handle({ type: 'write', ptyId: 1, data: 'x' })
      host.handle({ type: 'resize', ptyId: 1, cols: 80, rows: 24 })
      host.handle({ type: 'kill', ptyId: 1 })
    }).not.toThrow()
    expect(p.writes).toEqual([])
    expect(p.resizes).toEqual([])
    expect(p.kills).toBe(0)
  })

  it('killAll kills every live PTY and exits with code 0 once the last one has exited', () => {
    const { host, factory, exits } = setup()
    host.handle(spawnMsg(1))
    host.handle(spawnMsg(2))
    host.handle(spawnMsg(3))
    factory.ptys[1].emitExit(0)
    host.handle({ type: 'killAll' })

    expect(factory.ptys.map((p) => p.kills)).toEqual([1, 0, 1])
    expect(exits).toEqual([])
    factory.ptys[0].emitExit(-1073741510)
    expect(exits).toEqual([])
    factory.ptys[2].emitExit(-1073741510)
    expect(exits).toEqual([0])
  })

  it('killAll exits at once when no PTY is live', () => {
    const { host, exits } = setup()
    host.handle({ type: 'killAll' })

    expect(exits).toEqual([0])
  })

  it('killAll posts every PTY exit before the host exits', () => {
    const factory = fakeFactory()
    const events: string[] = []
    const host = createPtyHost({
      spawn: factory.spawn,
      post: (m) => {
        if (m.type === 'exit') events.push(`exit-msg${m.ptyId}`)
      },
      exit: (code) => events.push(`host-exit${code}`)
    })
    host.handle(spawnMsg(1))
    host.handle(spawnMsg(2))
    host.handle({ type: 'killAll' })
    factory.ptys[0].emitExit(1)
    factory.ptys[1].emitExit(1)

    expect(events).toEqual(['exit-msg1', 'exit-msg2', 'host-exit0'])
  })

  it('killAll waits for a PTY spawned just before it, whose kill node-pty defers', () => {
    const { host, factory, exits } = setup()
    host.handle(spawnMsg(4))
    host.handle({ type: 'killAll' })

    expect(factory.ptys[0].kills).toBe(1)
    expect(exits).toEqual([])
    factory.ptys[0].emitExit(-1073741510)
    expect(exits).toEqual([0])
  })

  describe('grace deadline', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('exits with code 0 at 2500 ms when a killed PTY never exits', () => {
      const { host, exits } = setup()
      host.handle(spawnMsg(1))
      host.handle({ type: 'killAll' })

      vi.advanceTimersByTime(2499)
      expect(exits).toEqual([])
      vi.advanceTimersByTime(1)
      expect(exits).toEqual([0])
    })

    it('exits only once when the last PTY exits before the deadline', () => {
      const { host, factory, exits } = setup()
      host.handle(spawnMsg(1))
      host.handle({ type: 'killAll' })
      factory.ptys[0].emitExit(1)
      vi.advanceTimersByTime(2500)

      expect(exits).toEqual([0])
    })
  })
})
