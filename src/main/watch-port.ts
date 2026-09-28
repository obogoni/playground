import { realpathSync, watch } from 'node:fs'
import type { WatchPort } from './file-watcher'

/**
 * The real `fs.watch` behind `FileWatcher`'s port. A path that vanishes between
 * the selection and the watch throws synchronously, and an unwatchable path
 * errors asynchronously; neither may take the main process down, so both come
 * back as a handle that watches nothing.
 *
 * The path is watched in its long form: on Windows, `fs.watch` on a path spelled
 * with 8.3 short names (`C:\Users\EXAMPL~1\…`) does not throw but aborts the
 * process in libuv on the first event (`src\win\fs-event.c`, #121).
 */
export const watchPort: WatchPort = (path, opts, listener) => {
  try {
    const watcher = watch(
      realpathSync.native(path),
      { recursive: opts.recursive },
      (_event, filename) => listener(typeof filename === 'string' ? filename : '')
    )
    watcher.on('error', () => watcher.close())
    return { close: () => watcher.close() }
  } catch {
    return { close: () => {} }
  }
}
