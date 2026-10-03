/** The slice of `window` the watcher reads; injected so it runs without a DOM. */
export type DprWindow = Pick<Window, 'devicePixelRatio' | 'matchMedia'>

/**
 * Calls `onChange` with the new ratio on every `devicePixelRatio` change, such
 * as the window moving to a monitor with another display scale (TROW-09). A
 * `(resolution: Xdppx)` query fires only when the ratio leaves X, so after each
 * change the query is re-armed on the new ratio (TROW-10), as xterm's own
 * monitor does. The returned function removes the current listener; nothing is
 * called after it.
 */
export function watchDevicePixelRatio(win: DprWindow, onChange: (dpr: number) => void): () => void {
  let query: MediaQueryList
  const arm = (): void => {
    query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`)
    query.addEventListener('change', handle)
  }
  function handle(): void {
    query.removeEventListener('change', handle)
    arm()
    onChange(win.devicePixelRatio)
  }
  arm()
  return () => query.removeEventListener('change', handle)
}
