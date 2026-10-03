import { afterEach, describe, expect, it } from 'vitest'
import {
  diagnostics,
  diagnosticsEnabled,
  DIAGNOSTICS_ENV,
  DIAGNOSTICS_LOG_FILE,
  FLUSH_INTERVAL_MS,
  installDiagnostics,
  NOOP_DIAGNOSTICS,
  PER_SECOND_SPAN_MS,
  type Diagnostics
} from './diagnostics'

afterEach(() => installDiagnostics(null))

describe('constants', () => {
  it('pins the switch, the file, the minute and the per-second span (L-009)', () => {
    expect(DIAGNOSTICS_ENV).toBe('PLAYGROUND_DEBUG_PERF')
    expect(DIAGNOSTICS_LOG_FILE).toBe('perf-diagnostics.jsonl')
    expect(FLUSH_INTERVAL_MS).toBe(60000)
    expect(PER_SECOND_SPAN_MS).toBe(1000)
  })
})

describe('diagnosticsEnabled', () => {
  it('is true only for exactly "1" (PDIAG-02)', () => {
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: '1' })).toBe(true)
    expect(diagnosticsEnabled({})).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: '' })).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: '0' })).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: 'true' })).toBe(false)
    expect(diagnosticsEnabled({ PLAYGROUND_DEBUG_PERF: ' 1' })).toBe(false)
  })
})

describe('diagnostics()', () => {
  it('answers the no-op before any install, the installed module after, and the no-op again on null', () => {
    expect(diagnostics()).toBe(NOOP_DIAGNOSTICS)
    const fake: Diagnostics = { ...NOOP_DIAGNOSTICS, enabled: true }
    installDiagnostics(fake)
    expect(diagnostics()).toBe(fake)
    installDiagnostics(null)
    expect(diagnostics()).toBe(NOOP_DIAGNOSTICS)
  })
})

describe('NOOP_DIAGNOSTICS', () => {
  it('is disabled and frozen (PDIAG-02)', () => {
    expect(NOOP_DIAGNOSTICS.enabled).toBe(false)
    expect(Object.isFrozen(NOOP_DIAGNOSTICS)).toBe(true)
  })

  it('runs the append exactly once and returns nothing (PDIAG-22)', () => {
    let appends = 0
    const result = NOOP_DIAGNOSTICS.measureAppend('s1', 'chunk', () => {
      appends++
    })
    expect(appends).toBe(1)
    expect(result).toBeUndefined()
  })

  it('hands out a git start whose end does nothing, and a listing end that does nothing', () => {
    const start = NOOP_DIAGNOSTICS.gitRequested('C:\\x\\bench-wt-1', ['status'])
    const end = start()
    expect(end()).toBeUndefined()
    expect(NOOP_DIAGNOSTICS.nameListingStarted()()).toBeUndefined()
  })

  it('can be stopped twice', () => {
    expect(() => {
      NOOP_DIAGNOSTICS.stop()
      NOOP_DIAGNOSTICS.stop()
    }).not.toThrow()
  })
})
