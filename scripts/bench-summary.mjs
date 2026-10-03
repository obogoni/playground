/* Bench summary (issue #147, PDIAG-36/37/41/51): turns the lines of
 * perf-diagnostics.jsonl into one row per phase and judges the targets.
 * Pure, no I/O: scripts/bench-sessions.mjs reads the file and prints the text.
 * Tested by scripts/bench-summary.test.ts.
 */

/**
 * @typedef {{
 *   label: string
 *   loopP50: number, loopP99: number, loopMax: number
 *   gitCount: number, gitWaitMaxMs: number, gitPeak: number
 *   worktreePeak: number, statusMaxPerSecond: number
 *   statusEmits: number, recounts: number
 *   ptyChunks: number, ptyKBps: number
 *   appendMeanMs: number, appendMaxMs: number
 *   names: number
 * }} Row
 * @typedef {{ name: string, value: number, limit: number, verdict: 'PASS' | 'FAIL' | 'n/a' }} TargetResult
 * @typedef {{ loopP99Ms: number, appendMeanMs: number, statusPerSecond: number, worktreePeak: number }} Targets
 */

/** Issue #147, Solution 3. The loop target can be recalibrated by the baseline (PDIAG-42). */
export const DEFAULT_TARGETS = Object.freeze({
  loopP99Ms: 30,
  appendMeanMs: 0.1,
  statusPerSecond: 1,
  worktreePeak: 1
})

/** One object per non-empty line; a line that is not JSON throws with its line number. */
export function parseLines(text) {
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return
    try {
      out.push(JSON.parse(line))
    } catch (err) {
      throw new Error(`perf-diagnostics.jsonl line ${i + 1} is not JSON: ${err.message}`)
    }
  })
  return out
}

const sum = (values) => values.reduce((a, b) => a + b, 0)
const max = (values) => values.reduce((a, b) => Math.max(a, b), 0)
const round3 = (n) => Math.round(n * 1000) / 1000

/** @returns {Row} */
export function rowOf(line, label = '') {
  const worktrees = Object.values(line.git.byWorktree)
  const sessions = Object.values(line.pty)
  const chunks = sum(sessions.map((s) => s.chunks))
  const bytes = sum(sessions.map((s) => s.bytes))
  return {
    label,
    loopP50: line.loop.p50Ms,
    loopP99: line.loop.p99Ms,
    loopMax: line.loop.maxMs,
    gitCount: line.git.count,
    gitWaitMaxMs: line.git.wait.maxMs,
    gitPeak: line.git.peakConcurrent,
    worktreePeak: max(worktrees.map((w) => w.peakConcurrent)),
    statusMaxPerSecond: max(worktrees.map((w) => w.bySubcommand.status?.maxPerSecond ?? 0)),
    statusEmits: sum(Object.values(line.emits['worktree:status'])),
    recounts: sum(Object.values(line.recounts)),
    ptyChunks: chunks,
    // bytes per ms is KB (1,000 bytes) per s
    ptyKBps: line.windowMs > 0 ? bytes / line.windowMs : 0,
    appendMeanMs: chunks > 0 ? sum(sessions.map((s) => s.appendMs)) / chunks : 0,
    appendMaxMs: max(sessions.map((s) => s.appendMaxMs)),
    names: line.names.count
  }
}

/** Line 1 is `startup`, line 2 `spawn`, then `steady 1` to `steady m`; later lines are ignored. */
export function phaseRows(lines, { minutes }) {
  const labels = [
    'startup',
    'spawn',
    ...Array.from({ length: minutes }, (_, i) => `steady ${i + 1}`)
  ]
  return lines.slice(0, labels.length).map((line, i) => rowOf(line, labels[i]))
}

const isSteady = (row) => row.label.startsWith('steady ')

/**
 * Every column at its largest over the steady rows; the append mean from the steady totals
 * (appendMs over chunks), not the largest row mean.
 * @returns {Row}
 */
export function worstRow(rows) {
  const steady = rows.filter(isSteady)
  const worst = { label: 'worst' }
  for (const key of Object.keys(rowOf(EMPTY_LINE))) {
    if (key !== 'label') worst[key] = max(steady.map((r) => r[key]))
  }
  const chunks = sum(steady.map((r) => r.ptyChunks))
  const appendMs = sum(steady.map((r) => r.appendMeanMs * r.ptyChunks))
  worst.appendMeanMs = chunks > 0 ? round3(appendMs / chunks) : 0
  return worst
}

const EMPTY_LINE = {
  windowMs: 0,
  loop: { p50Ms: 0, p99Ms: 0, maxMs: 0 },
  git: { count: 0, peakConcurrent: 0, wait: { maxMs: 0 }, byWorktree: {} },
  pty: {},
  emits: { 'worktree:status': {} },
  recounts: {},
  names: { count: 0 }
}

/**
 * The four targets over the steady rows. The loop target is judged only with 6 sessions, the
 * status target only with an index loop, the append target only when a chunk arrived.
 * @returns {TargetResult[]}
 */
export function judgeTargets(rows, { sessions, indexIntervalMs, targets = DEFAULT_TARGETS }) {
  const worst = worstRow(rows)
  const chunks = sum(rows.filter(isSteady).map((r) => r.ptyChunks))
  const strict = (value, limit) => (value < limit ? 'PASS' : 'FAIL')
  const inclusive = (value, limit) => (value <= limit ? 'PASS' : 'FAIL')
  return [
    {
      name: 'loopP99Ms',
      value: worst.loopP99,
      limit: targets.loopP99Ms,
      verdict: sessions === 6 ? strict(worst.loopP99, targets.loopP99Ms) : 'n/a'
    },
    {
      name: 'appendMeanMs',
      value: worst.appendMeanMs,
      limit: targets.appendMeanMs,
      verdict: chunks > 0 ? strict(worst.appendMeanMs, targets.appendMeanMs) : 'n/a'
    },
    {
      name: 'statusPerSecond',
      value: worst.statusMaxPerSecond,
      limit: targets.statusPerSecond,
      verdict:
        indexIntervalMs > 0 ? inclusive(worst.statusMaxPerSecond, targets.statusPerSecond) : 'n/a'
    },
    {
      name: 'worktreePeak',
      value: worst.worktreePeak,
      limit: targets.worktreePeak,
      verdict: inclusive(worst.worktreePeak, targets.worktreePeak)
    }
  ]
}

const fixed = (digits) => (n) => n.toFixed(digits)
const int = (n) => String(Math.round(n))
const loop = (r) =>
  [r.loopP50, r.loopP99, r.loopMax].map((n) => n.toFixed(1).padStart(5)).join(' / ')
const append = (r) => `${r.appendMeanMs.toFixed(3)} / ${r.appendMaxMs.toFixed(3)}`

/** Fixed columns: each value right-aligned under its header. */
const COLUMNS = [
  { head: 'loop p50/p99/max ms', format: loop },
  { head: 'git n', format: (r) => int(r.gitCount) },
  { head: 'wait', format: (r) => fixed(1)(r.gitWaitMaxMs) },
  { head: 'peak', format: (r) => int(r.gitPeak) },
  { head: 'wt peak', format: (r) => int(r.worktreePeak) },
  { head: 'status/s', format: (r) => int(r.statusMaxPerSecond) },
  { head: 'wt:status', format: (r) => int(r.statusEmits) },
  { head: 'recounts', format: (r) => int(r.recounts) },
  { head: 'chunks', format: (r) => int(r.ptyChunks) },
  { head: 'KB/s', format: (r) => fixed(1)(r.ptyKBps) },
  { head: 'append mean/max ms', format: append },
  { head: 'names', format: (r) => int(r.names) }
]
const LABEL_WIDTH = 10

const TARGET_TEXT = {
  loopP99Ms: (limit) => `loop p99 < ${limit} ms with 6 sessions`,
  appendMeanMs: (limit) => `append mean < ${limit} ms per chunk`,
  statusPerSecond: (limit) => `git status <= ${limit} per worktree per s`,
  worktreePeak: () => 'no overlapping git on one worktree'
}
const TARGET_VALUE = {
  loopP99Ms: fixed(1),
  appendMeanMs: fixed(3),
  statusPerSecond: int,
  worktreePeak: int
}

/** The text the bench prints: header, one line per row, the spawn round trip, the targets. */
export function formatSummary(options, rows, worst, targets, spawnMs) {
  const index = options.indexInterval > 0 ? `${options.indexInterval}ms` : 'off'
  const header =
    `bench-sessions  sessions=${options.sessions}  fps=${options.fps}  rows=${options.rows}` +
    `  files=${options.files}  index=${index}  minutes=${options.minutes}  commit=${options.commit}`
  const widths = COLUMNS.map((c) =>
    Math.max(c.head.length, ...[...rows, worst].map((r) => c.format(r).length))
  )
  const line = (label, cells) =>
    label.padEnd(LABEL_WIDTH) + cells.map((cell, i) => '  ' + cell.padStart(widths[i])).join('')
  const out = [
    header,
    line(
      'phase',
      COLUMNS.map((c) => c.head)
    )
  ]
  for (const r of [...rows, worst])
    out.push(
      line(
        r.label,
        COLUMNS.map((c) => c.format(r))
      )
    )
  out.push(
    spawnMs === null || spawnMs === undefined
      ? 'spawn: no session opened'
      : `spawn: longest sessions:spawn round trip ${Math.round(spawnMs)} ms`
  )
  out.push('targets')
  const texts = targets.map((t) => TARGET_TEXT[t.name](t.limit))
  const textWidth = Math.max(...texts.map((t) => t.length))
  targets.forEach((t, i) => {
    const value = TARGET_VALUE[t.name](t.value)
    out.push(`  ${texts[i].padEnd(textWidth)}  ${value.padStart(8)}   ${t.verdict}`)
  })
  return out.join('\n')
}
