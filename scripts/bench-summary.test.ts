import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TARGETS,
  formatSummary,
  judgeTargets,
  parseLines,
  phaseRows,
  rowOf,
  worstRow
} from './bench-summary.mjs'

/** A diagnostics line (design.md, "One log line") with empty sections, overridable per test. */
function logLine(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    t: '2026-10-01T12:01:00.000Z',
    windowMs: 60000,
    pid: 4242,
    version: '0.1.0',
    loop: { p50Ms: 10, p99Ms: 12, maxMs: 20, resolutionMs: 10 },
    git: {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      peakConcurrent: 0,
      wait: { totalMs: 0, maxMs: 0 },
      bySubcommand: {},
      byWorktree: {}
    },
    pty: {},
    emits: { 'worktree:status': {}, 'files:changed': {} },
    recounts: {},
    names: { count: 0, totalMs: 0, maxMs: 0 },
    ...over
  }
}

/** A row whose every column is `n`, except the ones given. */
function row(label: string, n: number, over: Record<string, number> = {}): Record<string, unknown> {
  return {
    label,
    loopP50: n,
    loopP99: n,
    loopMax: n,
    gitCount: n,
    gitWaitMaxMs: n,
    gitPeak: n,
    worktreePeak: n,
    statusMaxPerSecond: n,
    statusEmits: n,
    recounts: n,
    ptyChunks: n,
    ptyKBps: n,
    appendMeanMs: n,
    appendMaxMs: n,
    names: n,
    ...over
  }
}

const byName = (results: { name: string }[], name: string): Record<string, unknown> =>
  results.find((r) => r.name === name) as Record<string, unknown>

describe('DEFAULT_TARGETS', () => {
  it('holds the four targets of issue #147', () => {
    expect(DEFAULT_TARGETS).toEqual({
      loopP99Ms: 30,
      appendMeanMs: 0.1,
      statusPerSecond: 1,
      worktreePeak: 1
    })
  })
})

describe('parseLines', () => {
  it('returns one object per line and skips blank lines', () => {
    const text = `${JSON.stringify({ a: 1 })}\n\n${JSON.stringify({ a: 2 })}\n  \n`
    expect(parseLines(text)).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('throws naming the line number of a line that is not JSON', () => {
    const text = `${JSON.stringify({ a: 1 })}\n\n{"a": 2\n`
    expect(() => parseLines(text)).toThrow(/line 3\b/)
  })
})

describe('phaseRows', () => {
  const lines = [1, 2, 3, 4, 5, 6].map((n) =>
    logLine({ loop: { p50Ms: n, p99Ms: n, maxMs: n, resolutionMs: 10 } })
  )

  it('labels five lines startup, spawn and steady 1 to 3 when minutes is 3', () => {
    const rows = phaseRows(lines.slice(0, 5), { minutes: 3 })
    expect(rows.map((r: { label: string }) => r.label)).toEqual([
      'startup',
      'spawn',
      'steady 1',
      'steady 2',
      'steady 3'
    ])
    expect(rows.map((r: { loopP50: number }) => r.loopP50)).toEqual([1, 2, 3, 4, 5])
  })

  it('ignores a line after the last steady minute', () => {
    const rows = phaseRows(lines, { minutes: 3 })
    expect(rows).toHaveLength(5)
    expect(rows.at(-1).label).toBe('steady 3')
  })
})

describe('rowOf', () => {
  const fixture = logLine({
    windowMs: 50000,
    loop: { p50Ms: 10.5, p99Ms: 31.25, maxMs: 61.2, resolutionMs: 10 },
    git: {
      count: 42,
      totalMs: 900,
      maxMs: 88,
      peakConcurrent: 4,
      wait: { totalMs: 140, maxMs: 96.5 },
      bySubcommand: { status: { count: 40, totalMs: 800, maxMs: 88 } },
      byWorktree: {
        'bench-wt-1': {
          count: 30,
          peakConcurrent: 3,
          bySubcommand: { status: { count: 28, maxPerSecond: 2 } }
        },
        'bench-wt-2': {
          count: 12,
          peakConcurrent: 1,
          bySubcommand: {
            status: { count: 10, maxPerSecond: 5 },
            'rev-parse': { count: 2, maxPerSecond: 9 }
          }
        }
      }
    },
    pty: {
      s1: { chunks: 100, bytes: 300000, appendMs: 4, appendMaxMs: 0.5 },
      s2: { chunks: 300, bytes: 200000, appendMs: 6, appendMaxMs: 1.25 }
    },
    emits: {
      'worktree:status': { 'bench-wt-1': 7, 'bench-wt-2': 2 },
      'files:changed': { 'bench-wt-1': 50 }
    },
    recounts: { 'bench-wt-1': 8, 'bench-wt-2': 3 },
    names: { count: 2, totalMs: 4000, maxMs: 2200 }
  })

  it('computes every column of a line with two sessions and two worktrees', () => {
    expect(rowOf(fixture, 'steady 1')).toEqual({
      label: 'steady 1',
      loopP50: 10.5,
      loopP99: 31.25,
      loopMax: 61.2,
      gitCount: 42,
      gitWaitMaxMs: 96.5,
      gitPeak: 4,
      worktreePeak: 3,
      statusMaxPerSecond: 5,
      statusEmits: 9,
      recounts: 11,
      ptyChunks: 400,
      ptyKBps: 10,
      appendMeanMs: 0.025,
      appendMaxMs: 1.25,
      names: 2
    })
  })

  it('gives appendMeanMs 0 and zeros for a line with no chunk and no worktree', () => {
    const r = rowOf(logLine(), 'startup')
    expect(r.appendMeanMs).toBe(0)
    expect(r.appendMaxMs).toBe(0)
    expect(r.ptyChunks).toBe(0)
    expect(r.ptyKBps).toBe(0)
    expect(r.worktreePeak).toBe(0)
    expect(r.statusMaxPerSecond).toBe(0)
  })
})

describe('worstRow', () => {
  it('takes each steady column at its largest and the append mean from the steady totals, ignoring startup and spawn', () => {
    const rows = [
      row('startup', 1000),
      row('spawn', 500),
      // 10 chunks at a mean of 0.5 ms, then 90 chunks at a mean of 0.1 ms: (5 + 9) / 100 = 0.14
      row('steady 1', 1, { loopP99: 40, ptyChunks: 10, appendMeanMs: 0.5, appendMaxMs: 3 }),
      row('steady 2', 2, { loopP99: 35, ptyChunks: 90, appendMeanMs: 0.1, appendMaxMs: 7 })
    ]
    const worst = worstRow(rows)
    expect(worst).toEqual(
      row('worst', 2, { loopP99: 40, ptyChunks: 90, appendMeanMs: 0.14, appendMaxMs: 7 })
    )
  })
})

describe('judgeTargets', () => {
  const steady = (over: Record<string, number>): Record<string, unknown>[] => [
    row('startup', 999),
    row('spawn', 999),
    row('steady 1', 0, { ptyChunks: 100, ...over })
  ]
  const judge = (
    over: Record<string, number>,
    opts: { sessions?: number; indexIntervalMs?: number } = {}
  ): Record<string, unknown>[] =>
    judgeTargets(steady(over), {
      sessions: 6,
      indexIntervalMs: 100,
      targets: DEFAULT_TARGETS,
      ...opts
    })

  it('passes the loop target one unit under 30 and fails it at 30 (strict)', () => {
    expect(byName(judge({ loopP99: 29 }), 'loopP99Ms')).toEqual({
      name: 'loopP99Ms',
      value: 29,
      limit: 30,
      verdict: 'PASS'
    })
    expect(byName(judge({ loopP99: 30 }), 'loopP99Ms').verdict).toBe('FAIL')
  })

  it('passes the append target one unit under 0.1 and fails it at 0.1 (strict)', () => {
    expect(byName(judge({ appendMeanMs: 0.099 }), 'appendMeanMs')).toEqual({
      name: 'appendMeanMs',
      value: 0.099,
      limit: 0.1,
      verdict: 'PASS'
    })
    expect(byName(judge({ appendMeanMs: 0.1 }), 'appendMeanMs').verdict).toBe('FAIL')
  })

  it('passes the status target at 1 and fails it one unit over (inclusive)', () => {
    expect(byName(judge({ statusMaxPerSecond: 1 }), 'statusPerSecond')).toEqual({
      name: 'statusPerSecond',
      value: 1,
      limit: 1,
      verdict: 'PASS'
    })
    expect(byName(judge({ statusMaxPerSecond: 2 }), 'statusPerSecond').verdict).toBe('FAIL')
  })

  it('passes the overlap target at 1 and fails it one unit over (inclusive)', () => {
    expect(byName(judge({ worktreePeak: 1 }), 'worktreePeak')).toEqual({
      name: 'worktreePeak',
      value: 1,
      limit: 1,
      verdict: 'PASS'
    })
    expect(byName(judge({ worktreePeak: 2 }), 'worktreePeak').verdict).toBe('FAIL')
  })

  it('judges only the steady rows', () => {
    const results = judge({ loopP99: 1, statusMaxPerSecond: 0, worktreePeak: 0 })
    expect(byName(results, 'loopP99Ms').value).toBe(1)
    expect(byName(results, 'statusPerSecond').value).toBe(0)
    expect(byName(results, 'worktreePeak').value).toBe(0)
  })

  it('reads the loop target n/a at 3 sessions', () => {
    expect(byName(judge({ loopP99: 50 }, { sessions: 3 }), 'loopP99Ms').verdict).toBe('n/a')
  })

  it('reads the status target n/a without an index loop', () => {
    expect(
      byName(judge({ statusMaxPerSecond: 5 }, { indexIntervalMs: 0 }), 'statusPerSecond').verdict
    ).toBe('n/a')
  })

  it('reads the append target n/a with no chunk, as with --sessions 0', () => {
    const results = judge({ ptyChunks: 0, appendMeanMs: 0 }, { sessions: 0, indexIntervalMs: 0 })
    expect(byName(results, 'appendMeanMs').verdict).toBe('n/a')
    expect(byName(results, 'worktreePeak').verdict).toBe('PASS')
  })

  it('uses the limits it is given', () => {
    const targets = { ...DEFAULT_TARGETS, loopP99Ms: 40 }
    const results = judgeTargets(steady({ loopP99: 35 }), {
      sessions: 6,
      indexIntervalMs: 0,
      targets
    })
    expect(byName(results, 'loopP99Ms')).toMatchObject({ limit: 40, verdict: 'PASS' })
  })
})

describe('formatSummary', () => {
  const options = {
    sessions: 6,
    minutes: 3,
    fps: 20,
    rows: 30,
    files: 500,
    indexInterval: 100,
    commit: 'abc1234'
  }
  const rows = [
    row('startup', 1),
    row('spawn', 2),
    row('steady 1', 3),
    row('steady 2', 4),
    row('steady 3', 5)
  ]
  const worst = worstRow(rows)
  const targets = judgeTargets(rows, {
    sessions: 6,
    indexIntervalMs: 100,
    targets: DEFAULT_TARGETS
  })

  it('prints the header, one line per row in order, the worst row, the spawn round trip and four target lines', () => {
    const lines = formatSummary(options, rows, worst, targets, 412).split('\n')
    expect(lines[0]).toBe(
      'bench-sessions  sessions=6  fps=20  rows=30  files=500  index=100ms  minutes=3  commit=abc1234'
    )
    expect(lines[1]).toMatch(/^phase\s+loop p50\/p99\/max ms\s+git n\s+wait\s+peak\s+wt peak/)
    expect(lines[1]).toMatch(/status\/s\s+wt:status\s+recounts\s+chunks\s+KB\/s/)
    expect(lines[1]).toMatch(/append mean\/max ms\s+names$/)
    expect(lines.slice(2, 8).map((l) => l.split(/\s{2,}/)[0])).toEqual([
      'startup',
      'spawn',
      'steady 1',
      'steady 2',
      'steady 3',
      'worst'
    ])
    expect(lines[2]).toMatch(/^startup\s+1\.0 \/\s+1\.0 \/\s+1\.0\s/)
    expect(lines[7]).toMatch(/^worst\s+5\.0 \/\s+5\.0 \/\s+5\.0\s/)
    // append mean from the steady totals: (3 * 3 + 4 * 4 + 5 * 5) / (3 + 4 + 5) = 4.167
    expect(lines[7]).toMatch(/4\.167 \/ 5\.000\s+5$/)
    expect(lines[8]).toBe('spawn: longest sessions:spawn round trip 412 ms')
    expect(lines[9]).toBe('targets')
    expect(lines.slice(10, 14)).toHaveLength(4)
    expect(lines[10]).toMatch(/^ {2}loop p99 < 30 ms with 6 sessions\s+5\.0\s+PASS$/)
    expect(lines[11]).toMatch(/^ {2}append mean < 0\.1 ms per chunk\s+4\.167\s+FAIL$/)
    expect(lines[12]).toMatch(/^ {2}git status <= 1 per worktree per s\s+5\s+FAIL$/)
    expect(lines[13]).toMatch(/^ {2}no overlapping git on one worktree\s+5\s+FAIL$/)
  })

  it('aligns every row to the header columns', () => {
    const lines = formatSummary(options, rows, worst, targets, 412).split('\n')
    const width = lines[1].length
    for (const l of lines.slice(2, 8)) expect(l).toHaveLength(width)
  })

  it('prints index=off without an index loop, and the spawn line with no session opened', () => {
    const text = formatSummary(
      { ...options, sessions: 0, indexInterval: 0 },
      rows,
      worst,
      targets,
      null
    )
    expect(text.split('\n')[0]).toContain('sessions=0')
    expect(text.split('\n')[0]).toContain('index=off')
    expect(text).toContain('spawn: no session opened')
  })
})
