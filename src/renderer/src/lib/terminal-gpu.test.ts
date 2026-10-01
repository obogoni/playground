import { describe, expect, it } from 'vitest'
import { attachGpuRenderer, type GpuAddon } from './terminal-gpu'

interface FakeAddon extends GpuAddon {
  disposed: number
  /** Fires the context-loss event, as the WebGL renderer does on a GPU reset. */
  loseContext(): void
}

function fakeAddon(): FakeAddon {
  let lossCb: (() => void) | null = null
  const addon: FakeAddon = {
    disposed: 0,
    onContextLoss: (cb) => {
      lossCb = cb
      return { dispose: () => (lossCb = null) }
    },
    dispose: () => {
      addon.disposed++
    },
    loseContext: () => lossCb?.()
  }
  return addon
}

function fakeTerm(opts: { loadThrows?: Error } = {}): {
  term: { loadAddon(addon: FakeAddon): void }
  loaded: FakeAddon[]
} {
  const loaded: FakeAddon[] = []
  return {
    loaded,
    term: {
      loadAddon: (addon) => {
        if (opts.loadThrows) throw opts.loadThrows
        loaded.push(addon)
      }
    }
  }
}

function recorder(): { warn: (msg: string, err: unknown) => void; calls: unknown[][] } {
  const calls: unknown[][] = []
  return { calls, warn: (msg, err) => calls.push([msg, err]) }
}

describe('attachGpuRenderer', () => {
  it('renders through WebGL when the addon loads (PERF-04)', () => {
    const addon = fakeAddon()
    const { term, loaded } = fakeTerm()
    const { warn, calls } = recorder()
    const gpu = attachGpuRenderer(term, () => addon, warn)
    expect(gpu.kind()).toBe('webgl')
    expect(loaded).toEqual([addon])
    expect(calls).toEqual([])
  })

  it('keeps the DOM renderer and warns once when creating the addon throws (PERF-05)', () => {
    const err = new Error('WebGL2 not supported')
    const { term, loaded } = fakeTerm()
    const { warn, calls } = recorder()
    let gpu: ReturnType<typeof attachGpuRenderer> | undefined
    expect(() => {
      gpu = attachGpuRenderer(
        term,
        () => {
          throw err
        },
        warn
      )
    }).not.toThrow()
    expect(gpu?.kind()).toBe('dom')
    expect(loaded).toEqual([])
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe(err)
  })

  it('keeps the DOM renderer and warns once when loading the addon throws (PERF-05)', () => {
    const err = new Error('could not create a WebGL2 context')
    const { term } = fakeTerm({ loadThrows: err })
    const { warn, calls } = recorder()
    let gpu: ReturnType<typeof attachGpuRenderer> | undefined
    expect(() => {
      gpu = attachGpuRenderer(term, fakeAddon, warn)
    }).not.toThrow()
    expect(gpu?.kind()).toBe('dom')
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe(err)
    expect(() => gpu?.dispose()).not.toThrow()
    expect(calls).toHaveLength(1)
  })

  it('disposes the addon and falls back to DOM on context loss (PERF-06)', () => {
    const addon = fakeAddon()
    const gpu = attachGpuRenderer(fakeTerm().term, () => addon, recorder().warn)
    addon.loseContext()
    expect(addon.disposed).toBe(1)
    expect(gpu.kind()).toBe('dom')
  })

  it('disposes the addon exactly once on context loss then unmount (PERF-06 edge case)', () => {
    const addon = fakeAddon()
    const gpu = attachGpuRenderer(fakeTerm().term, () => addon, recorder().warn)
    addon.loseContext()
    gpu.dispose()
    expect(addon.disposed).toBe(1)
  })

  it('disposes the addon with the pane, once, however often unmount runs (PERF-07)', () => {
    const addon = fakeAddon()
    const gpu = attachGpuRenderer(fakeTerm().term, () => addon, recorder().warn)
    gpu.dispose()
    gpu.dispose()
    addon.loseContext()
    expect(addon.disposed).toBe(1)
    expect(gpu.kind()).toBe('dom')
  })
})
