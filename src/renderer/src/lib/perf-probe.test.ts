import { describe, expect, it } from 'vitest'
import {
  formatRenderLine,
  LONG_TASK_MS,
  PERF_FLAG_KEY,
  perfEnabled,
  startLongTaskLog,
  type LongTaskObserverCtor
} from './perf-probe'

interface FakeObserver {
  /** Delivers one batch of entries, as the browser does. */
  deliver(durations: number[]): void
  observed: unknown[]
  disconnected: number
}

function fakeObserverCtor(opts: { observeThrows?: boolean } = {}): {
  Ctor: LongTaskObserverCtor
  instances: FakeObserver[]
} {
  const instances: FakeObserver[] = []
  class Ctor {
    readonly #fake: FakeObserver
    constructor(cb: (list: { getEntries(): Array<{ duration: number }> }) => void) {
      this.#fake = {
        deliver: (durations) =>
          cb({ getEntries: () => durations.map((duration) => ({ duration })) }),
        observed: [],
        disconnected: 0
      }
      instances.push(this.#fake)
    }
    observe(options: unknown): void {
      if (opts.observeThrows) throw new TypeError('longtask not supported')
      this.#fake.observed.push(options)
    }
    disconnect(): void {
      this.#fake.disconnected++
    }
  }
  return { Ctor, instances }
}

describe('perf flag (PERF-18)', () => {
  it('pins the flag key', () => {
    expect(PERF_FLAG_KEY).toBe('playground.debug.perf')
  })

  it("is enabled only when the stored value is '1'", () => {
    expect(perfEnabled(() => '1')).toBe(true)
    expect(perfEnabled(() => null)).toBe(false)
    expect(perfEnabled(() => '0')).toBe(false)
    expect(perfEnabled(() => 'true')).toBe(false)
  })

  it('reads as disabled when the storage read throws', () => {
    expect(
      perfEnabled(() => {
        throw new Error('storage blocked')
      })
    ).toBe(false)
  })
})

describe('startLongTaskLog (PERF-15)', () => {
  it('pins the 50 ms long-task threshold', () => {
    expect(LONG_TASK_MS).toBe(50)
  })

  it('observes longtask entries', () => {
    const { Ctor, instances } = fakeObserverCtor()
    startLongTaskLog(
      Ctor,
      () => {},
      () => {}
    )
    expect(instances).toHaveLength(1)
    expect(instances[0].observed).toEqual([{ type: 'longtask', buffered: true }])
  })

  it('logs a 50 ms task and skips a 49 ms one', () => {
    const { Ctor, instances } = fakeObserverCtor()
    const lines: string[] = []
    startLongTaskLog(
      Ctor,
      (line) => lines.push(line),
      () => {}
    )
    instances[0].deliver([49])
    expect(lines).toEqual([])
    instances[0].deliver([50])
    expect(lines).toEqual(['[perf] longtask 50ms'])
  })

  it('logs every qualifying entry of a batch, rounded to whole ms', () => {
    const { Ctor, instances } = fakeObserverCtor()
    const lines: string[] = []
    startLongTaskLog(
      Ctor,
      (line) => lines.push(line),
      () => {}
    )
    instances[0].deliver([120.4, 12, 66.6])
    expect(lines).toEqual(['[perf] longtask 120ms', '[perf] longtask 67ms'])
  })

  it('warns once and returns a no-op stop when observe throws', () => {
    const { Ctor } = fakeObserverCtor({ observeThrows: true })
    const warnings: string[] = []
    let stop: () => void = () => {}
    expect(() => {
      stop = startLongTaskLog(
        Ctor,
        () => {},
        (msg) => warnings.push(msg)
      )
    }).not.toThrow()
    expect(warnings).toHaveLength(1)
    expect(() => stop()).not.toThrow()
  })

  it('stop disconnects the observer', () => {
    const { Ctor, instances } = fakeObserverCtor()
    const stop = startLongTaskLog(
      Ctor,
      () => {},
      () => {}
    )
    stop()
    expect(instances[0].disconnected).toBe(1)
  })
})

describe('formatRenderLine (PERF-17)', () => {
  it('names the component and the id', () => {
    expect(formatRenderLine('SessionRow', 'a')).toBe('[perf] render SessionRow a')
  })

  it('names the component alone when there is no id', () => {
    expect(formatRenderLine('TopBar')).toBe('[perf] render TopBar')
  })
})
