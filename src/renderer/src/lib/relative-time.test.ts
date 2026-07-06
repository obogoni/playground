import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

const NOW = 1_700_000_000_000

describe('relativeTime', () => {
  it('renders "just now" under a minute', () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe('just now')
  })

  it('renders minutes for < 1h', () => {
    expect(relativeTime(NOW - 4 * 60_000, NOW)).toBe('4m ago')
    expect(relativeTime(NOW - 59 * 60_000, NOW)).toBe('59m ago')
  })

  it('renders hours for >= 1h (floored)', () => {
    expect(relativeTime(NOW - 60 * 60_000, NOW)).toBe('1h ago')
    expect(relativeTime(NOW - 150 * 60_000, NOW)).toBe('2h ago')
  })

  it('crosses the just-now/minute boundary (59s → just now, 61s → 1m ago)', () => {
    expect(relativeTime(NOW - 59_000, NOW)).toBe('just now')
    expect(relativeTime(NOW - 61_000, NOW)).toBe('1m ago')
  })
})
