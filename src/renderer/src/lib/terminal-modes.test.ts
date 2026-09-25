import { describe, expect, it } from 'vitest'
import { formatModeLog, isProbeEnabled, modeName, PROBE_FLAG_KEY } from './terminal-modes'

describe('modeName (TSP-05)', () => {
  it('names the mouse tracking protocols', () => {
    expect(modeName(9)).toBe('x10')
    expect(modeName(1000)).toBe('vt200')
    expect(modeName(1002)).toBe('drag')
    expect(modeName(1003)).toBe('any')
  })

  it('names the mouse encodings', () => {
    expect(modeName(1005)).toBe('utf8-mouse')
    expect(modeName(1006)).toBe('sgr-mouse')
    expect(modeName(1015)).toBe('urxvt-mouse')
    expect(modeName(1016)).toBe('sgr-pixels')
  })

  it('names all three alternate-screen params the same', () => {
    expect(modeName(47)).toBe('alt-screen')
    expect(modeName(1047)).toBe('alt-screen')
    expect(modeName(1049)).toBe('alt-screen')
  })

  it('names focus events, bracketed paste and cursor visibility', () => {
    expect(modeName(1004)).toBe('focus')
    expect(modeName(2004)).toBe('bracketed-paste')
    expect(modeName(25)).toBe('cursor')
  })

  it('falls back to ?<n> for any other param', () => {
    expect(modeName(1)).toBe('?1')
    expect(modeName(12)).toBe('?12')
    expect(modeName(2026)).toBe('?2026')
  })
})

describe('formatModeLog (TSP-01)', () => {
  it('carries the session id, raw params, decoded names, tracking and buffer on a set', () => {
    const line = formatModeLog({
      sessionId: 's-42',
      final: 'h',
      params: [1049, 1003, 1006],
      tracking: 'any',
      buffer: 'alternate'
    })
    expect(line).toBe(
      '[term-modes] s-42 CSI ?1049;1003;1006h alt-screen,any,sgr-mouse tracking=any buffer=alternate'
    )
    expect(line.startsWith('[term-modes]')).toBe(true)
  })

  it('reports a reset with its own final byte and the state it left behind', () => {
    expect(
      formatModeLog({
        sessionId: 's-42',
        final: 'l',
        params: [1003],
        tracking: 'none',
        buffer: 'alternate'
      })
    ).toBe('[term-modes] s-42 CSI ?1003l any tracking=none buffer=alternate')
  })
})

describe('isProbeEnabled (TSP-04)', () => {
  it('is on only for exactly "1"', () => {
    expect(isProbeEnabled(() => '1')).toBe(true)
  })

  it('is off for an absent flag and for any other value', () => {
    expect(isProbeEnabled(() => null)).toBe(false)
    expect(isProbeEnabled(() => '0')).toBe(false)
    expect(isProbeEnabled(() => 'true')).toBe(false)
    expect(isProbeEnabled(() => '')).toBe(false)
  })

  it('is off when the storage read throws', () => {
    expect(
      isProbeEnabled(() => {
        throw new Error('storage blocked')
      })
    ).toBe(false)
  })

  it('reads the flag the spec names', () => {
    expect(PROBE_FLAG_KEY).toBe('playground.debug.terminalModes')
  })
})
