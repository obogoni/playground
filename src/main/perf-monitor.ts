import { monitorEventLoopDelay } from 'node:perf_hooks'

/** How often the loop-delay line is logged (PERF-16). */
export const LOOP_LOG_INTERVAL_MS = 10_000
/** Sampling resolution of the event-loop delay histogram (PERF-16). */
export const LOOP_RESOLUTION_MS = 10

/** The slice of Node's `IntervalHistogram` the logger reads; values are in ns. */
export interface LoopHistogram {
  enable(): boolean
  disable(): boolean
  reset(): void
  percentile(p: number): number
  readonly max: number
}

export interface LoopDelayLogDeps {
  /** `process.env.PLAYGROUND_DEBUG_PERF === '1'` at startup; false starts nothing (PERF-18). */
  enabled: boolean
  monitor?: (opts: { resolution: number }) => LoopHistogram
  every?: (cb: () => void, ms: number) => unknown
  clear?: (handle: unknown) => void
  log?: (line: string) => void
}

const ms = (ns: number): string => (ns / 1e6).toFixed(1)

/** `[perf] loop p50=… p99=… max=…`, in ms with one decimal (PERF-16). */
export function formatLoopLine(h: LoopHistogram): string {
  return `[perf] loop p50=${ms(h.percentile(50))} p99=${ms(h.percentile(99))} max=${ms(h.max)}`
}

/**
 * Debug-only main-process event-loop delay log (PERF-16): every 10 s, one line with
 * the window's p50 / p99 / max, then the histogram is reset so each line covers
 * only its own window. Disabled → no monitor, no interval, no log (PERF-18).
 * Returns the stop function for quit.
 */
export function startLoopDelayLog({
  enabled,
  monitor = monitorEventLoopDelay,
  every = setInterval,
  clear = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  log = console.log
}: LoopDelayLogDeps): () => void {
  if (!enabled) return () => {}
  const h = monitor({ resolution: LOOP_RESOLUTION_MS })
  h.enable()
  const handle = every(() => {
    log(formatLoopLine(h))
    h.reset()
  }, LOOP_LOG_INTERVAL_MS)
  return () => {
    clear(handle)
    h.disable()
  }
}
