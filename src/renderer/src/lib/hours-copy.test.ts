import { describe, expect, it } from 'vitest'
import { formatDayCopy } from './hours-copy'
import type { DayReport, GroupReport } from './hours-report'

const at = (h: number, mi = 0): number => new Date(2026, 8, 16, h, mi).getTime()

function group(label: string, blocks: Array<[number, number]>): GroupReport {
  return {
    key: label,
    label,
    taskId: null,
    cwd: null,
    totalMs: 0,
    blocks: blocks.map(([start, end]) => ({ start, end, durationMs: end - start, periods: [] }))
  }
}

function day(totalMs: number, groups: GroupReport[]): DayReport {
  return { date: new Date(2026, 8, 16), totalMs, groups }
}

describe('formatDayCopy', () => {
  it('renders the header and one padded line per block in the exact format (TIME-39)', () => {
    const d = day(6 * 3_600_000 + 42 * 60_000, [
      group('Task #12345 Fix login redirect', [[at(9, 12), at(11, 40)]]),
      group('Task #4821', [[at(13, 0), at(17, 14)]])
    ])
    expect(formatDayCopy(d)).toBe(
      [
        '16/09/2026 (qua) — total 6h42',
        '09:12–11:40  Task #12345 Fix login redirect  2h28',
        '13:00–17:14  Task #4821                      4h14'
      ].join('\n')
    )
  })

  it('orders lines chronologically across groups (TIME-39)', () => {
    const d = day(3 * 3_600_000, [
      group('Task #12345', [
        [at(9), at(10)],
        [at(14), at(15)]
      ]),
      group('Task #4821', [[at(11), at(12)]])
    ])
    expect(formatDayCopy(d).split('\n').slice(1)).toEqual([
      '09:00–10:00  Task #12345  1h00',
      '11:00–12:00  Task #4821   1h00',
      '14:00–15:00  Task #12345  1h00'
    ])
  })

  it('uses the group label for task-less time: No task · <folder leaf> (TIME-40)', () => {
    const d = day(30 * 60_000, [group('No task · scratch', [[at(8), at(8, 30)]])])
    expect(formatDayCopy(d).split('\n')[1]).toBe('08:00–08:30  No task · scratch  0h30')
  })

  it('pads nothing extra on a single-line day', () => {
    const d = day(5 * 60_000, [group('Task #12345', [[at(9), at(9, 5)]])])
    expect(formatDayCopy(d)).toBe('16/09/2026 (qua) — total 0h05\n09:00–09:05  Task #12345  0h05')
  })

  it('prints the block duration, not its hull, when the block has gaps (TIME-36)', () => {
    const g = group('Task #12345', [])
    g.blocks = [{ start: at(9), end: at(10, 1), durationMs: 60 * 60_000, periods: [] }]
    expect(formatDayCopy(day(60 * 60_000, [g])).split('\n')[1]).toBe(
      '09:00–10:01  Task #12345  1h00'
    )
  })
})
