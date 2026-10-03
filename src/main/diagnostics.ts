import { LOOP_RESOLUTION_MS } from './perf-monitor'

/** The switch: `PLAYGROUND_DEBUG_PERF=1` turns the log on (PDIAG-01, PDIAG-02). */
export const DIAGNOSTICS_ENV = 'PLAYGROUND_DEBUG_PERF'
/** The log's file name, directly in the user data folder. */
export const DIAGNOSTICS_LOG_FILE = 'perf-diagnostics.jsonl'
/** One line a minute (PDIAG-01). */
export const FLUSH_INTERVAL_MS = 60_000
/** The sliding span `maxPerSecond` counts starts in (PDIAG-13). */
export const PER_SECOND_SPAN_MS = 1_000

/** The probes the rest of main calls; a no-op unless the switch is on. */
export interface Diagnostics {
  readonly enabled: boolean
  /**
   * A git call was requested. Call the returned `start` when the spawn queue lets the process
   * run; call the `end` that `start` returns once the process has ended (any outcome).
   */
  gitRequested(cwd: string, args: readonly string[]): () => () => void
  /** Runs `append`, timing it, and records the chunk for `sessionId`. Disabled: just runs `append`. */
  measureAppend(sessionId: string, chunk: string, append: () => void): void
  /** Main sent this event for this worktree. */
  emitted(channel: 'worktree:status' | 'files:changed', worktreePath: string): void
  /** Main started a recount of this worktree (`recountWorktree`). */
  recountStarted(worktreePath: string): void
  /** `claude agents --json` is starting; call the returned function once it has settled. */
  nameListingStarted(): () => void
  /** Cancel the timer, disable the monitor; later probes are ignored. Idempotent. */
  stop(): void
}

const noop = (): void => {}
const noopStart = (): (() => void) => noop

export interface DiagnosticsClock {
  /** Monotonic milliseconds (`performance.now()`), for durations and spans. */
  now(): number
  /** Epoch milliseconds (`Date.now()`), for the line's `t`. */
  wallNow(): number
  /** Calls `fn` every `ms`; returns the cancel. */
  every(ms: number, fn: () => void): () => void
}

/** The slice of Node's `IntervalHistogram` the module reads; values in nanoseconds. */
export interface LoopDelayMonitor {
  percentile(p: number): number
  readonly max: number
  readonly count: number
  reset(): void
  disable(): void
}

export type LogWriter = (line: string) => Promise<void>

export interface DiagnosticsDeps {
  clock: DiagnosticsClock
  writer: LogWriter
  /** Creates and enables the monitor; called once, only by an enabled module. */
  startLoopMonitor: () => LoopDelayMonitor
  meta: { pid: number; version: string }
  /** Where a failed write is reported; `console.error` in the app. */
  log: (msg: string) => void
  intervalMs?: number // default FLUSH_INTERVAL_MS; tests pass their own
}

/** One log line, `v: 1` (design.md, Data Models). */
export interface DiagnosticsLine {
  v: 1
  t: string
  windowMs: number
  pid: number
  version: string
  loop: { p50Ms: number; p99Ms: number; maxMs: number; resolutionMs: number }
  git: {
    count: number
    totalMs: number
    maxMs: number
    peakConcurrent: number
    wait: { totalMs: number; maxMs: number }
    bySubcommand: Record<string, { count: number; totalMs: number; maxMs: number }>
    byWorktree: Record<
      string,
      {
        count: number
        peakConcurrent: number
        bySubcommand: Record<string, { count: number; maxPerSecond: number }>
      }
    >
  }
  pty: Record<string, { chunks: number; bytes: number; appendMs: number; appendMaxMs: number }>
  emits: { 'worktree:status': Record<string, number>; 'files:changed': Record<string, number> }
  recounts: Record<string, number>
  names: { count: number; totalMs: number; maxMs: number }
}

/** Milliseconds to 3 decimals, as every duration in a line is written. */
const round3 = (ms: number): number => Math.round(ms * 1000) / 1000
const nsToMs = (ns: number): number => round3(ns / 1e6)

/**
 * The live module: one timer, one loop monitor, counters, and a line every `intervalMs`
 * appended through `writer`, one write at a time, in window order.
 */
export function createDiagnostics(deps: DiagnosticsDeps): Diagnostics {
  const { clock, writer, meta, log } = deps
  const monitor = deps.startLoopMonitor()
  let windowStart = clock.now()
  let stopped = false
  let writes: Promise<void> = Promise.resolve()
  let failing = false

  const write = (text: string): void => {
    writes = writes
      .then(() => writer(text))
      .then(
        () => {
          failing = false
        },
        (err: unknown) => {
          if (failing) return
          failing = true
          const code = (err as { code?: unknown } | null)?.code ?? String(err)
          log(`[diagnostics] could not write ${DIAGNOSTICS_LOG_FILE}: ${String(code)}`)
        }
      )
  }

  const loopSection = (): DiagnosticsLine['loop'] => {
    const empty = monitor.count === 0
    return {
      p50Ms: empty ? 0 : nsToMs(monitor.percentile(50)),
      p99Ms: empty ? 0 : nsToMs(monitor.percentile(99)),
      maxMs: empty ? 0 : nsToMs(monitor.max),
      resolutionMs: LOOP_RESOLUTION_MS
    }
  }

  const flush = (): void => {
    if (stopped) return
    const end = clock.now()
    const line: DiagnosticsLine = {
      v: 1,
      t: new Date(clock.wallNow()).toISOString(),
      windowMs: Math.round(end - windowStart),
      pid: meta.pid,
      version: meta.version,
      loop: loopSection(),
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
      names: { count: 0, totalMs: 0, maxMs: 0 }
    }
    windowStart = end
    monitor.reset()
    write(JSON.stringify(line) + '\n')
  }

  const cancel = clock.every(deps.intervalMs ?? FLUSH_INTERVAL_MS, flush)

  return {
    enabled: true,
    gitRequested: () => noopStart,
    measureAppend: (_sessionId, _chunk, append) => append(),
    emitted: noop,
    recountStarted: noop,
    nameListingStarted: () => noop,
    stop: () => {
      if (stopped) return
      stopped = true
      cancel()
      monitor.disable()
    }
  }
}

/** The disabled module: no timer, no monitor, no file (PDIAG-02); appends run as they are (PDIAG-22). */
export const NOOP_DIAGNOSTICS: Diagnostics = Object.freeze({
  enabled: false,
  gitRequested: () => noopStart,
  measureAppend: (_sessionId: string, _chunk: string, append: () => void) => append(),
  emitted: noop,
  recountStarted: noop,
  nameListingStarted: () => noop,
  stop: noop
})

/** True only when the switch holds exactly `'1'` (PDIAG-02). */
export function diagnosticsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[DIAGNOSTICS_ENV] === '1'
}

let installed: Diagnostics = NOOP_DIAGNOSTICS

/** Makes `d` the module every probe reaches; `null` restores the no-op. */
export function installDiagnostics(d: Diagnostics | null): void {
  installed = d ?? NOOP_DIAGNOSTICS
}

/** The installed module: `NOOP_DIAGNOSTICS` until `installDiagnostics` says otherwise. */
export function diagnostics(): Diagnostics {
  return installed
}
