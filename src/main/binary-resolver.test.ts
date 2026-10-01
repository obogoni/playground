import { describe, expect, it } from 'vitest'
import { BinaryResolver, RELOOKUP_MS } from './binary-resolver'

/** A lookup the test settles by hand, counting how many were started. */
function deferredLookups(): {
  lookup: () => Promise<string | null>
  started: () => number
  settle: (value: string | null | Error) => Promise<void>
} {
  const pending: { resolve: (v: string | null) => void; reject: (e: Error) => void }[] = []
  let count = 0
  return {
    lookup: () =>
      new Promise((resolve, reject) => {
        count++
        pending.push({ resolve, reject })
      }),
    started: () => count,
    settle: async (value) => {
      const next = pending.shift()!
      if (value instanceof Error) next.reject(value)
      else next.resolve(value)
      // Let the resolver's then/catch run.
      await new Promise((r) => setTimeout(r, 0))
    }
  }
}

function resolverWith(
  lookups: ReturnType<typeof deferredLookups>,
  opts: { configured?: string | null; clock?: { t: number } } = {}
): BinaryResolver {
  const clock = opts.clock ?? { t: 0 }
  return new BinaryResolver({
    lookup: lookups.lookup,
    configured: () => opts.configured ?? null,
    now: () => clock.t
  })
}

describe('BinaryResolver', () => {
  it('re-looks up at most every 30 s (PERF-20)', () => {
    expect(RELOOKUP_MS).toBe(30_000)
  })

  it('starts the first lookup on construction and answers get() without waiting for it (PERF-20 AC 3)', () => {
    const lookups = deferredLookups()
    const resolver = resolverWith(lookups, { configured: 'D:\\tools\\claude.exe' })
    expect(lookups.started()).toBe(1)
    expect(resolver.get()).toBe('D:\\tools\\claude.exe')
  })

  it('throws `agent binary not found` before any path is known and none is configured (PERF-19 AC 2)', () => {
    const resolver = resolverWith(deferredLookups())
    expect(() => resolver.get()).toThrow('agent binary not found')
  })

  it('prefers the found path over the configured one once the lookup settles (PERF-19 AC 2)', async () => {
    const lookups = deferredLookups()
    const resolver = resolverWith(lookups, { configured: 'D:\\tools\\claude.exe' })
    await lookups.settle('C:\\Users\\OtávioBogoni\\.local\\bin\\claude.exe')
    expect(resolver.get()).toBe('C:\\Users\\OtávioBogoni\\.local\\bin\\claude.exe')
  })

  it('starts no lookup at +29,999 ms and exactly one at +30,000 ms (PERF-20 AC 4)', async () => {
    const lookups = deferredLookups()
    const clock = { t: 1_000 }
    const resolver = resolverWith(lookups, { clock })
    await lookups.settle('C:\\a\\claude.exe')
    clock.t = 1_000 + 29_999
    resolver.get()
    expect(lookups.started()).toBe(1)
    clock.t = 1_000 + 30_000
    expect(resolver.get()).toBe('C:\\a\\claude.exe')
    expect(lookups.started()).toBe(2)
  })

  it('never has two lookups in flight (PERF-20 AC 4)', () => {
    const lookups = deferredLookups()
    const clock = { t: 0 }
    const resolver = resolverWith(lookups, { clock, configured: 'C:\\c.exe' })
    clock.t = 60_000
    resolver.get()
    clock.t = 120_000
    resolver.get()
    expect(lookups.started()).toBe(1)
  })

  it('keeps the previous path when a later lookup finds nothing or rejects', async () => {
    const lookups = deferredLookups()
    const clock = { t: 0 }
    const resolver = resolverWith(lookups, { clock })
    await lookups.settle('C:\\a\\claude.exe')
    clock.t = 30_000
    resolver.get()
    await lookups.settle(null)
    expect(resolver.get()).toBe('C:\\a\\claude.exe')
    clock.t = 60_000
    resolver.get()
    await lookups.settle(new Error('EACCES'))
    expect(resolver.get()).toBe('C:\\a\\claude.exe')
    expect(lookups.started()).toBe(3)
  })
})
