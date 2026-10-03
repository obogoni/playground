import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
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
 * Git's subcommand (PDIAG-10): the first argument that does not start with `-`, skipping
 * the value after `-c` or `-C`; `(none)` when no argument qualifies.
 */
export function gitSubcommand(args: readonly string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-c' || arg === '-C') i++
    else if (!arg.startsWith('-')) return arg
  }
  return '(none)'
}

/**
 * A worktree's name in a line (PDIAG-05): the last non-empty segment of its path, split on
 * `/` and `\`; `(none)` for a path with no segment, such as a drive root (PDIAG-47).
 */
export function folderOf(path: string): string {
  const segments = path.split(/[\\/]/).filter((s) => s !== '' && !/^[A-Za-z]:$/.test(s))
  return segments.at(-1) ?? '(none)'
}

interface Timing {
  count: number
  totalMs: number
  maxMs: number
}

const timing = (): Timing => ({ count: 0, totalMs: 0, maxMs: 0 })

const addDuration = (t: Timing, ms: number): void => {
  t.totalMs += ms
  t.maxMs = Math.max(t.maxMs, ms)
}

const roundTiming = (t: Timing): Timing => ({
  count: t.count,
  totalMs: round3(t.totalMs),
  maxMs: round3(t.maxMs)
})

/** One worktree's git figures in the current window. */
interface WorktreeGit {
  count: number
  peakConcurrent: number
  /** Per subcommand: its count, its `maxPerSecond`, and its starts inside the last span. */
  bySubcommand: Map<string, { count: number; maxPerSecond: number; starts: number[] }>
}

/** The git figures of the current window; replaced at every line (PDIAG-06). */
interface GitWindow {
  total: Timing
  peakConcurrent: number
  wait: { totalMs: number; maxMs: number }
  bySubcommand: Map<string, Timing>
  byWorktree: Map<string, WorktreeGit>
}

const getOr = <K, V>(map: Map<K, V>, key: K, make: () => V): V => {
  let value = map.get(key)
  if (value === undefined) {
    value = make()
    map.set(key, value)
  }
  return value
}

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

  // Processes running now, overall and per worktree; they outlive a window (PDIAG-06).
  let running = 0
  const runningByWorktree = new Map<string, number>()

  const worktreeGit = (key: string): WorktreeGit =>
    getOr(gitWindow.byWorktree, key, () => ({
      count: 0,
      peakConcurrent: 0,
      bySubcommand: new Map()
    }))

  const newGitWindow = (): GitWindow => ({
    total: timing(),
    peakConcurrent: running,
    wait: { totalMs: 0, maxMs: 0 },
    bySubcommand: new Map(),
    byWorktree: new Map()
  })

  let gitWindow = newGitWindow()

  const gitRequested = (cwd: string, args: readonly string[]): (() => () => void) => {
    if (stopped) return noopStart
    const subcommand = gitSubcommand(args)
    const worktree = folderOf(cwd)
    const requestedAt = clock.now()
    let started = false
    return () => {
      if (started || stopped) return noop
      started = true
      const startedAt = clock.now()
      const waited = startedAt - requestedAt
      gitWindow.wait.totalMs += waited
      gitWindow.wait.maxMs = Math.max(gitWindow.wait.maxMs, waited)

      gitWindow.total.count++
      getOr(gitWindow.bySubcommand, subcommand, timing).count++
      running++
      gitWindow.peakConcurrent = Math.max(gitWindow.peakConcurrent, running)

      const wt = worktreeGit(worktree)
      wt.count++
      const wtRunning = (runningByWorktree.get(worktree) ?? 0) + 1
      runningByWorktree.set(worktree, wtRunning)
      wt.peakConcurrent = Math.max(wt.peakConcurrent, wtRunning)

      // Sliding span (PDIAG-13): starts a full span or more before this one fall out.
      const sub = getOr(wt.bySubcommand, subcommand, () => ({
        count: 0,
        maxPerSecond: 0,
        starts: [] as number[]
      }))
      sub.count++
      sub.starts = sub.starts.filter((s) => startedAt - s < PER_SECOND_SPAN_MS)
      sub.starts.push(startedAt)
      sub.maxPerSecond = Math.max(sub.maxPerSecond, sub.starts.length)

      let ended = false
      return () => {
        if (ended || stopped) return
        ended = true
        const ms = clock.now() - startedAt
        running--
        runningByWorktree.set(worktree, (runningByWorktree.get(worktree) ?? 1) - 1)
        addDuration(gitWindow.total, ms)
        addDuration(getOr(gitWindow.bySubcommand, subcommand, timing), ms)
      }
    }
  }

  const gitSection = (): DiagnosticsLine['git'] => {
    const g = gitWindow
    return {
      ...roundTiming(g.total),
      peakConcurrent: g.peakConcurrent,
      wait: { totalMs: round3(g.wait.totalMs), maxMs: round3(g.wait.maxMs) },
      bySubcommand: Object.fromEntries(
        [...g.bySubcommand].map(([sub, t]) => [sub, roundTiming(t)])
      ),
      byWorktree: Object.fromEntries(
        [...g.byWorktree].map(([key, wt]) => [
          key,
          {
            count: wt.count,
            peakConcurrent: wt.peakConcurrent,
            bySubcommand: Object.fromEntries(
              [...wt.bySubcommand].map(([sub, s]) => [
                sub,
                { count: s.count, maxPerSecond: s.maxPerSecond }
              ])
            )
          }
        ])
      )
    }
  }

  /** A new window starts its peaks from the processes still running (PDIAG-06). */
  const resetGit = (): void => {
    gitWindow = newGitWindow()
    for (const [key, n] of runningByWorktree) {
      if (n > 0) worktreeGit(key).peakConcurrent = n
    }
  }

  // Output, recounts, emits and listings of the current window; replaced at every line.
  let pty = new Map<string, DiagnosticsLine['pty'][string]>()
  let emits = {
    'worktree:status': new Map<string, number>(),
    'files:changed': new Map<string, number>()
  }
  let recounts = new Map<string, number>()
  let names = timing()

  const bump = (map: Map<string, number>, key: string): void => {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  const measureAppend = (sessionId: string, chunk: string, append: () => void): void => {
    if (stopped) return append()
    const startedAt = clock.now()
    try {
      append()
    } finally {
      const ms = clock.now() - startedAt
      const s = getOr(pty, sessionId, () => ({ chunks: 0, bytes: 0, appendMs: 0, appendMaxMs: 0 }))
      s.chunks++
      s.bytes += Buffer.byteLength(chunk, 'utf8')
      s.appendMs += ms
      s.appendMaxMs = Math.max(s.appendMaxMs, ms)
    }
  }

  const nameListingStarted = (): (() => void) => {
    if (stopped) return noop
    names.count++
    const startedAt = clock.now()
    let ended = false
    return () => {
      if (ended || stopped) return
      ended = true
      addDuration(names, clock.now() - startedAt)
    }
  }

  const resetActivity = (): void => {
    pty = new Map()
    emits = { 'worktree:status': new Map(), 'files:changed': new Map() }
    recounts = new Map()
    names = timing()
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
      git: gitSection(),
      pty: Object.fromEntries(
        [...pty].map(([id, s]) => [
          id,
          { ...s, appendMs: round3(s.appendMs), appendMaxMs: round3(s.appendMaxMs) }
        ])
      ),
      emits: {
        'worktree:status': Object.fromEntries(emits['worktree:status']),
        'files:changed': Object.fromEntries(emits['files:changed'])
      },
      recounts: Object.fromEntries(recounts),
      names: roundTiming(names)
    }
    windowStart = end
    resetGit()
    resetActivity()
    monitor.reset()
    write(JSON.stringify(line) + '\n')
  }

  const cancel = clock.every(deps.intervalMs ?? FLUSH_INTERVAL_MS, flush)

  return {
    enabled: true,
    gitRequested,
    measureAppend,
    emitted: (channel, worktreePath) => {
      if (!stopped) bump(emits[channel], folderOf(worktreePath))
    },
    recountStarted: (worktreePath) => {
      if (!stopped) bump(recounts, folderOf(worktreePath))
    },
    nameListingStarted,
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

/** The app's clock: `performance.now()` for durations, `Date.now()` for timestamps. */
export const realClock: DiagnosticsClock = {
  now: () => performance.now(),
  wallNow: () => Date.now(),
  every: (ms, fn) => {
    const handle = setInterval(fn, ms)
    return () => clearInterval(handle)
  }
}

/** Main's event-loop delay histogram at a 10 ms resolution, enabled (PDIAG-17). */
export function nodeLoopMonitor(): LoopDelayMonitor {
  const h = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS })
  h.enable()
  return h
}

/** Appends each line to `path` asynchronously; the file is created by the first line. */
export function appendWriter(path: string): LogWriter {
  return (line) => appendFile(path, line, 'utf8')
}

/**
 * The app's module: `NOOP_DIAGNOSTICS` unless the switch is on, decided before any port
 * is touched (PDIAG-02); otherwise a live module writing `<userData>/perf-diagnostics.jsonl`.
 */
export function createAppDiagnostics(opts: {
  env: NodeJS.ProcessEnv
  userDataPath: string
  version: string
  intervalMs?: number // tests only; the app never passes it
  /** Tests only, to see which ports were touched; the app passes none and gets the real ones. */
  ports?: Partial<Pick<DiagnosticsDeps, 'clock' | 'startLoopMonitor'>>
}): Diagnostics {
  if (!diagnosticsEnabled(opts.env)) return NOOP_DIAGNOSTICS
  return createDiagnostics({
    clock: opts.ports?.clock ?? realClock,
    writer: appendWriter(join(opts.userDataPath, DIAGNOSTICS_LOG_FILE)),
    startLoopMonitor: opts.ports?.startLoopMonitor ?? nodeLoopMonitor,
    meta: { pid: process.pid, version: opts.version },
    log: (msg) => console.error(msg),
    intervalMs: opts.intervalMs
  })
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
