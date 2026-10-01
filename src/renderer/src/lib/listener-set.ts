/** A typed set of callbacks; emitting calls each one with the value. */
export interface ListenerSet<T> {
  /** Adds `cb` (once, however often it is added); returns its remove function. */
  add: (cb: (value: T) => void) => () => void
  emit: (value: T) => void
}

/**
 * Listeners for a signal that must not become React state, such as the
 * recount signal the status bar follows (PERF-12, PERF-13). A listener that
 * throws is logged and does not stop the others.
 */
export function createListenerSet<T>(
  log: (...args: unknown[]) => void = console.error
): ListenerSet<T> {
  const listeners = new Set<(value: T) => void>()
  return {
    add(cb) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    emit(value) {
      for (const cb of [...listeners]) {
        try {
          cb(value)
        } catch (err) {
          log('listener failed', err)
        }
      }
    }
  }
}
