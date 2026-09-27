import { describe, expect, it } from 'vitest'
import { fromLocalInput, handMarkTitle, splitDefault, toLocalInput } from './period-edit'

/** A local wall-clock instant on 2026-09-21 as a UTC ISO string. */
const at = (h: number, m: number, s: number, ms = 0): string =>
  new Date(2026, 8, 21, h, m, s, ms).toISOString()

describe('handMarkTitle: the hand mark tooltip (HTSK-38)', () => {
  it('names the branch the period was recorded on', () => {
    expect(handMarkTitle('develop')).toBe('Assigned by hand (branch: develop)')
  })

  it('says no branch when the period has none', () => {
    expect(handMarkTitle(null)).toBe('Assigned by hand (no branch)')
  })
})

describe('splitDefault: the midpoint, rounded down to the second, in local time (HTSK-33)', () => {
  it('is the exact midpoint of a period of whole minutes', () => {
    expect(splitDefault(at(9, 0, 0), at(12, 0, 0))).toBe('2026-09-21T10:30:00')
  })

  it('floors a midpoint at the half second instead of rounding it up', () => {
    expect(splitDefault(at(9, 0, 0), at(9, 0, 3))).toBe('2026-09-21T09:00:01')
    expect(splitDefault(at(9, 0, 0), at(9, 0, 5))).toBe('2026-09-21T09:00:02')
  })

  it('floors a midpoint above the half second', () => {
    expect(splitDefault(at(9, 0, 0), at(9, 0, 3, 400))).toBe('2026-09-21T09:00:01')
  })

  it('floors a midpoint below the half second', () => {
    expect(splitDefault(at(9, 0, 0), at(9, 0, 2, 600))).toBe('2026-09-21T09:00:01')
  })
})

describe('toLocalInput / fromLocalInput: the date-and-time field round trip (HTSK-33)', () => {
  it('shows an instant as local time to the second', () => {
    expect(toLocalInput(at(9, 15, 42))).toBe('2026-09-21T09:15:42')
  })

  it('reads back the same instant for a whole-second value', () => {
    const iso = at(9, 15, 42)

    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
  })

  it('reads an empty or invalid value as null', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('not a date')).toBeNull()
  })
})
