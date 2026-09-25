import { describe, expect, it } from 'vitest'
import { clip, mergeIntervals, splitAtLocalMidnight, unionMs } from './time-intervals'

const MIN = 60_000
const HOUR = 60 * MIN

/** Local wall-clock instant; avoids DST dates (design §Risks). */
const at = (d: number, h: number, mi = 0, s = 0): number => new Date(2026, 8, d, h, mi, s).getTime()

describe('unionMs', () => {
  it('sums disjoint intervals', () => {
    expect(unionMs([iv(at(16, 9), at(16, 10)), iv(at(16, 11), at(16, 11, 30))])).toBe(90 * MIN)
  })

  it('counts overlapping intervals once (TIME-28: two sessions 09–10 add 1h, not 2h)', () => {
    expect(unionMs([iv(at(16, 9), at(16, 10)), iv(at(16, 9), at(16, 10))])).toBe(HOUR)
    expect(unionMs([iv(at(16, 9), at(16, 10)), iv(at(16, 9, 30), at(16, 10, 30))])).toBe(90 * MIN)
  })

  it('counts a nested interval once', () => {
    expect(unionMs([iv(at(16, 9), at(16, 12)), iv(at(16, 10), at(16, 11))])).toBe(3 * HOUR)
  })

  it('does not bridge a gap between intervals', () => {
    expect(unionMs([iv(at(16, 9), at(16, 10)), iv(at(16, 10, 0, 30), at(16, 11))])).toBe(
      HOUR + 59.5 * MIN
    )
  })

  it('is 0 for no intervals', () => {
    expect(unionMs([])).toBe(0)
  })
})

describe('mergeIntervals', () => {
  it('keeps disjoint intervals apart, sorted by start', () => {
    const late = iv(at(16, 14), at(16, 15))
    const early = iv(at(16, 9), at(16, 10))
    expect(mergeIntervals([late, early], MIN)).toEqual([early, late])
  })

  it('merges overlapping intervals into their hull', () => {
    expect(mergeIntervals([iv(at(16, 9), at(16, 10)), iv(at(16, 9, 30), at(16, 11))], MIN)).toEqual(
      [iv(at(16, 9), at(16, 11))]
    )
  })

  it('merges a nested interval into its container', () => {
    expect(mergeIntervals([iv(at(16, 10), at(16, 11)), iv(at(16, 9), at(16, 12))], MIN)).toEqual([
      iv(at(16, 9), at(16, 12))
    ])
  })

  it('merges identical intervals into one', () => {
    expect(mergeIntervals([iv(at(16, 9), at(16, 10)), iv(at(16, 9), at(16, 10))], MIN)).toEqual([
      iv(at(16, 9), at(16, 10))
    ])
  })

  it('merges touching intervals (gap 0)', () => {
    expect(mergeIntervals([iv(at(16, 9), at(16, 10)), iv(at(16, 10), at(16, 11))], 0)).toEqual([
      iv(at(16, 9), at(16, 11))
    ])
  })

  it('merges a gap of exactly 60 s (TIME-36)', () => {
    expect(mergeIntervals([iv(at(16, 9), at(16, 10)), iv(at(16, 10, 1), at(16, 11))], MIN)).toEqual(
      [iv(at(16, 9), at(16, 11))]
    )
  })

  it('keeps a gap of 61 s apart (TIME-36)', () => {
    const a = iv(at(16, 9), at(16, 10))
    const b = iv(at(16, 10, 1, 1), at(16, 11))
    expect(mergeIntervals([a, b], MIN)).toEqual([a, b])
  })

  it('returns [] for no intervals', () => {
    expect(mergeIntervals([], MIN)).toEqual([])
  })
})

describe('clip', () => {
  const day = iv(at(16, 0), at(17, 0))

  it('returns null for an interval outside the range', () => {
    expect(clip(iv(at(15, 9), at(15, 10)), day)).toBeNull()
    expect(clip(iv(at(17, 0), at(17, 1)), day)).toBeNull()
  })

  it('cuts an interval partially inside the range to the range bounds', () => {
    expect(clip(iv(at(15, 23), at(16, 1)), day)).toEqual(iv(at(16, 0), at(16, 1)))
    expect(clip(iv(at(16, 23), at(17, 2)), day)).toEqual(iv(at(16, 23), at(17, 0)))
  })

  it('returns an interval fully inside the range unchanged', () => {
    expect(clip(iv(at(16, 9), at(16, 10)), day)).toEqual(iv(at(16, 9), at(16, 10)))
  })
})

describe('splitAtLocalMidnight', () => {
  it('returns a same-day interval as a single piece', () => {
    expect(splitAtLocalMidnight(iv(at(16, 9), at(16, 10)))).toEqual([iv(at(16, 9), at(16, 10))])
  })

  it('splits an interval crossing one midnight into the two days (TIME-37)', () => {
    expect(splitAtLocalMidnight(iv(at(16, 23), at(17, 1)))).toEqual([
      iv(at(16, 23), at(17, 0)),
      iv(at(17, 0), at(17, 1))
    ])
  })

  it('splits an interval crossing two midnights into three days', () => {
    expect(splitAtLocalMidnight(iv(at(16, 22), at(18, 2)))).toEqual([
      iv(at(16, 22), at(17, 0)),
      iv(at(17, 0), at(18, 0)),
      iv(at(18, 0), at(18, 2))
    ])
  })

  it('keeps an interval ending exactly at midnight on its own day, with no empty piece', () => {
    expect(splitAtLocalMidnight(iv(at(16, 23), at(17, 0)))).toEqual([iv(at(16, 23), at(17, 0))])
  })
})

function iv(start: number, end: number): { start: number; end: number } {
  return { start, end }
}
