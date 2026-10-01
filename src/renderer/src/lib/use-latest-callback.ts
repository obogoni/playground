import { useCallback, useInsertionEffect, useRef } from 'react'

/**
 * A callback whose identity never changes but which always calls the latest
 * `fn` passed in. Lets a memoized child ignore function props in its comparator
 * without ever running a stale handler (PERF-09).
 *
 * The ref is updated in an insertion effect, which runs before refs attach and
 * before layout effects, so a ref callback or an event fired after the commit
 * already sees the new `fn`. Do not call the result during render.
 */
export function useLatestCallback<F extends (...args: never[]) => unknown>(fn: F): F {
  const ref = useRef(fn)
  useInsertionEffect(() => {
    ref.current = fn
  })
  const stable = useCallback((...args: Parameters<F>) => ref.current(...args), [])
  return stable as unknown as F
}
