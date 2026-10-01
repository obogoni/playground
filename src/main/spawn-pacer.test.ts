import { describe, expect, it } from 'vitest'
import { createSpawnPacer, MAX_RUNNING } from './spawn-pacer'

/** A `defer` the test turns by hand: each `turn()` runs what was deferred before it. */
function manualLoop(): {
  defer: (fn: () => void) => void
  turn: () => Promise<void>
  pending: () => number
} {
  let queue: (() => void)[] = []
  return {
    defer: (fn) => {
      queue.push(fn)
    },
    pending: () => queue.length,
    turn: async () => {
      const due = queue
      queue = []
      for (const fn of due) fn()
      // Let settled promises run their continuations before the next turn.
      await new Promise((r) => setTimeout(r, 0))
    }
  }
}

/** A start the test settles by hand, recording when it began. */
interface Controlled {
  start: () => Promise<string>
  resolve: (v: string) => void
  reject: (e: Error) => void
}

function controlled(log: string[], id: string): Controlled {
  let settle!: { resolve: (v: string) => void; reject: (e: Error) => void }
  const start = (): Promise<string> => {
    log.push(id)
    return new Promise((resolve, reject) => {
      settle = { resolve, reject }
    })
  }
  return {
    start,
    resolve: (v: string) => settle.resolve(v),
    reject: (e: Error) => settle.reject(e)
  }
}

describe('createSpawnPacer', () => {
  it('runs at most 4 git processes at once by default (PERF-22)', () => {
    expect(MAX_RUNNING).toBe(4)
  })

  it('starts nothing on the caller stack and one call per event-loop turn, in request order (AC 1, AC 3)', async () => {
    const loop = manualLoop()
    const pace = createSpawnPacer({ maxRunning: 10, defer: loop.defer })
    const started: string[] = []
    const calls = ['a', 'b', 'c'].map((id) => controlled(started, id))
    for (const c of calls) void pace(c.start)
    expect(started).toEqual([])
    await loop.turn()
    expect(started).toEqual(['a'])
    await loop.turn()
    expect(started).toEqual(['a', 'b'])
    await loop.turn()
    expect(started).toEqual(['a', 'b', 'c'])
  })

  it('holds the 5th call until one of 4 running settles (AC 2)', async () => {
    const loop = manualLoop()
    const pace = createSpawnPacer({ defer: loop.defer })
    const started: string[] = []
    const calls = ['1', '2', '3', '4', '5', '6'].map((id) => controlled(started, id))
    for (const c of calls) void pace(c.start)
    for (let i = 0; i < 8; i++) await loop.turn()
    expect(started).toEqual(['1', '2', '3', '4'])
    calls[1].resolve('ok')
    for (let i = 0; i < 3; i++) await loop.turn()
    expect(started).toEqual(['1', '2', '3', '4', '5'])
  })

  it('goes idle while every slot is busy instead of spinning the event loop (AC 2)', async () => {
    const loop = manualLoop()
    const pace = createSpawnPacer({ defer: loop.defer })
    const started: string[] = []
    for (const id of ['1', '2', '3', '4', '5', '6']) void pace(controlled(started, id).start)
    for (let i = 0; i < 8; i++) await loop.turn()
    expect(started).toEqual(['1', '2', '3', '4'])
    // Nothing can start until a process settles, so no turn is left scheduled.
    expect(loop.pending()).toBe(0)
  })

  it('yields with setImmediate by default (AC 1)', async () => {
    const real = globalThis.setImmediate
    const deferred: (() => void)[] = []
    globalThis.setImmediate = ((fn: () => void) => {
      deferred.push(fn)
    }) as unknown as typeof setImmediate
    try {
      const pace = createSpawnPacer()
      const started: string[] = []
      void pace(controlled(started, 'a').start)
      expect(started).toEqual([])
      expect(deferred).toHaveLength(1)
      deferred.shift()!()
      expect(started).toEqual(['a'])
    } finally {
      globalThis.setImmediate = real
    }
  })

  it('resolves and rejects each call with its own process result (AC 3)', async () => {
    const loop = manualLoop()
    const pace = createSpawnPacer({ defer: loop.defer })
    const started: string[] = []
    const a = controlled(started, 'a')
    const b = controlled(started, 'b')
    const pa = pace(a.start)
    const pb = pace(b.start)
    await loop.turn()
    await loop.turn()
    b.reject(new Error('fatal: not a git repository'))
    a.resolve('main')
    await expect(pa).resolves.toBe('main')
    await expect(pb).rejects.toThrow('fatal: not a git repository')
  })

  it('frees the slot of a failed or timed-out call so the next one starts (AC 4)', async () => {
    const loop = manualLoop()
    const pace = createSpawnPacer({ maxRunning: 1, defer: loop.defer })
    const started: string[] = []
    const a = controlled(started, 'a')
    const b = controlled(started, 'b')
    const pa = pace(a.start)
    void pace(b.start)
    await loop.turn()
    await loop.turn()
    expect(started).toEqual(['a'])
    a.reject(Object.assign(new Error('timed out'), { killed: true }))
    await pa.catch(() => {})
    await loop.turn()
    expect(started).toEqual(['a', 'b'])
  })

  it('rejects a start that throws synchronously and frees its slot (AC 4)', async () => {
    const loop = manualLoop()
    const pace = createSpawnPacer({ maxRunning: 1, defer: loop.defer })
    const started: string[] = []
    const after = controlled(started, 'after')
    const failing = pace(() => {
      throw new Error('spawn EINVAL')
    })
    // Observed before the turn that rejects it, so it is never an unhandled rejection.
    const rejected = expect(failing).rejects.toThrow('spawn EINVAL')
    void pace(after.start)
    await loop.turn()
    await rejected
    await loop.turn()
    expect(started).toEqual(['after'])
  })
})
