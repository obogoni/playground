import { isProbeEnabled } from './terminal-modes'

/** `localStorage` key that turns the renderer perf logging on; `'1'` = on (PERF-15, PERF-17). */
export const PERF_FLAG_KEY = 'playground.debug.perf'
/** A task at least this long is logged (PERF-15). */
export const LONG_TASK_MS = 50

/**
 * Whether the renderer perf logging is on. A throwing read (storage blocked or
 * unavailable) reads as off, like the terminal mode probe (PERF-18).
 */
export function perfEnabled(
  read: () => string | null = () => localStorage.getItem(PERF_FLAG_KEY)
): boolean {
  return isProbeEnabled(read)
}

/** The slice of `PerformanceObserver` the long-task log uses. */
export type LongTaskObserverCtor = new (
  cb: (list: { getEntries(): Array<{ duration: number }> }) => void
) => { observe(options: { type: string; buffered?: boolean }): void; disconnect(): void }

/**
 * Logs every renderer long task of 50 ms or more as `[perf] longtask <ms>ms`
 * (PERF-15). A runtime without `longtask` support makes `observe` throw: that is
 * warned once and the log stays off, the app unaffected. Returns the stop function.
 */
export function startLongTaskLog(
  Observer: LongTaskObserverCtor = PerformanceObserver,
  log: (line: string) => void = console.debug,
  warn: (msg: string, err: unknown) => void = console.warn
): () => void {
  const observer = new Observer((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration >= LONG_TASK_MS) log(`[perf] longtask ${Math.round(entry.duration)}ms`)
    }
  })
  try {
    observer.observe({ type: 'longtask', buffered: true })
  } catch (err) {
    warn('[perf] longtask observer unavailable', err)
    return () => {}
  }
  return () => observer.disconnect()
}

/** `[perf] render <Component> <id?>`, one line per profiled commit (PERF-17). */
export function formatRenderLine(component: string, id?: string): string {
  return id === undefined ? `[perf] render ${component}` : `[perf] render ${component} ${id}`
}
