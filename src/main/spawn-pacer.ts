/** How many git processes run at once (PERF-22): enough to overlap git's own work. */
export const MAX_RUNNING = 4

export interface SpawnPacerOptions {
  maxRunning?: number
  /** Yields to the event loop before each start; `setImmediate` in production. */
  defer?: (fn: () => void) => void
}

/**
 * Spaces out process starts (PERF-22). Creating a process blocks the main
 * process for 35–65 ms on the owner's machine even through async `execFile`,
 * and `tree:get` asked for a git process per repo and per worktree at once,
 * so the spawns stacked into 460–660 ms freezes. Here every start waits for
 * its own event-loop turn — keystrokes are handled between two spawns — and
 * at most `maxRunning` processes run at a time, in request order.
 */
export function createSpawnPacer({
  maxRunning = MAX_RUNNING,
  defer = setImmediate
}: SpawnPacerOptions = {}): <T>(start: () => Promise<T>) => Promise<T> {
  const queue: (() => void)[] = []
  let running = 0
  let pumping = false

  const pump = (): void => {
    if (pumping || queue.length === 0 || running >= maxRunning) return
    pumping = true
    defer(() => {
      pumping = false
      if (running < maxRunning) queue.shift()?.()
      pump()
    })
  }

  return <T>(start: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        running++
        let started: Promise<T>
        try {
          started = start()
        } catch (err) {
          started = Promise.reject(err)
        }
        started.then(resolve, reject).finally(() => {
          running--
          pump()
        })
      })
      pump()
    })
}
