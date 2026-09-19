import { describe, expect, it } from 'vitest'
import {
  clockToggleTitle,
  formatDayHeader,
  formatHm,
  formatHmCompact,
  formatHms
} from './time-format'

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN

describe('formatHms', () => {
  it('renders zero as 00:00:00 (TIME-30)', () => {
    expect(formatHms(0)).toBe('00:00:00')
  })

  it('floors to the second', () => {
    expect(formatHms(59_999)).toBe('00:00:59')
  })

  it('renders hours, minutes and seconds zero-padded', () => {
    expect(formatHms(2 * HOUR + 28 * MIN + 5 * SEC)).toBe('02:28:05')
  })

  it('keeps counting hours past 99', () => {
    expect(formatHms(100 * HOUR)).toBe('100:00:00')
  })
})

describe('formatHm', () => {
  it('renders zero as 00:00 (TIME-30)', () => {
    expect(formatHm(0)).toBe('00:00')
  })

  it('floors to the minute', () => {
    expect(formatHm(59_999)).toBe('00:00')
    expect(formatHm(2 * HOUR + 28 * MIN + 59 * SEC)).toBe('02:28')
  })

  it('renders 100 h and more as 100:00', () => {
    expect(formatHm(100 * HOUR)).toBe('100:00')
  })
})

describe('formatHmCompact', () => {
  it('renders zero as 0h00', () => {
    expect(formatHmCompact(0)).toBe('0h00')
  })

  it('renders 2h28m as 2h28 and 5 min as 0h05', () => {
    expect(formatHmCompact(2 * HOUR + 28 * MIN)).toBe('2h28')
    expect(formatHmCompact(5 * MIN)).toBe('0h05')
  })

  it('floors to the minute', () => {
    expect(formatHmCompact(6 * HOUR + 42 * MIN + 59_999)).toBe('6h42')
  })
})

describe('formatDayHeader', () => {
  it('renders 2026-09-16 as 16/09/2026 (qua)', () => {
    expect(formatDayHeader(new Date(2026, 8, 16, 14, 30))).toBe('16/09/2026 (qua)')
  })

  it('uses the pt-BR abbreviation for every weekday', () => {
    const week = [13, 14, 15, 16, 17, 18, 19].map((d) => formatDayHeader(new Date(2026, 8, d)))
    expect(week).toEqual([
      '13/09/2026 (dom)',
      '14/09/2026 (seg)',
      '15/09/2026 (ter)',
      '16/09/2026 (qua)',
      '17/09/2026 (qui)',
      '18/09/2026 (sex)',
      '19/09/2026 (sáb)'
    ])
  })

  it('zero-pads day and month', () => {
    expect(formatDayHeader(new Date(2026, 0, 5))).toBe('05/01/2026 (seg)')
  })
})

describe('clockToggleTitle', () => {
  it('offers to pause a counting clock (STRP-12)', () => {
    expect(clockToggleTitle(12 * MIN + 34 * SEC, false)).toBe(
      'current run 00:12:34 · click to pause'
    )
  })

  it('offers to resume a paused clock (STRP-12)', () => {
    expect(clockToggleTitle(12 * MIN + 34 * SEC, true)).toBe(
      'current run 00:12:34 · click to resume'
    )
  })

  it('reads a run past 24 h the way the counter does', () => {
    expect(clockToggleTitle(25 * HOUR + 999, false)).toBe('current run 25:00:00 · click to pause')
  })
})
