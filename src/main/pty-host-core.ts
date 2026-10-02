import type { FromHost, ToHost } from '../shared/pty-host-protocol'

/** The node-pty spawn options the host passes (same as the in-process adapter had). */
export interface PtySpawnOptions {
  name: string
  cwd: string
  env: Record<string, string>
  useConpty: boolean
}

/** The slice of node-pty's `IPty` the host uses. */
export interface IPtyLike {
  readonly pid: number
  onData(cb: (data: string) => void): unknown
  onExit(cb: (e: { exitCode: number }) => void): unknown
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

/**
 * How long `killAll` waits for the killed PTYs to exit before the host exits
 * anyway. Below main's 3 s force-kill (PTYH-18), so the host normally leaves on
 * its own terms.
 */
export const KILL_ALL_GRACE_MS = 2500

export interface PtyHostDeps {
  /** node-pty's `spawn`, injected so this logic is unit-testable. */
  spawn: (file: string, args: string[], opts: PtySpawnOptions) => IPtyLike
  post: (m: FromHost) => void
  exit: (code: number) => void
}

/**
 * The PTY host's message handling (PTYH-01), separated from the
 * utility-process entry (`pty-host.ts`) so it runs against a fake node-pty.
 * Messages are handled one at a time in arrival order and `spawn` is
 * synchronous, so a later `write`/`kill`/`killAll` always finds its PTY.
 */
export function createPtyHost(deps: PtyHostDeps): { handle(m: ToHost): void } {
  const live = new Map<number, IPtyLike>()
  let draining = false
  let exited = false

  function exitOnce(): void {
    if (exited) return
    exited = true
    deps.exit(0)
  }

  function spawn(m: Extract<ToHost, { type: 'spawn' }>): void {
    let proc: IPtyLike
    try {
      proc = deps.spawn(m.file, m.args, {
        name: 'xterm-256color',
        cwd: m.cwd,
        env: m.env,
        useConpty: true
      })
    } catch (err) {
      deps.post({
        type: 'spawn-failed',
        ptyId: m.ptyId,
        message: err instanceof Error ? err.message : String(err)
      })
      return
    }
    live.set(m.ptyId, proc)
    proc.onData((data) => deps.post({ type: 'data', ptyId: m.ptyId, data }))
    proc.onExit(({ exitCode }) => {
      live.delete(m.ptyId)
      deps.post({ type: 'exit', ptyId: m.ptyId, exitCode })
      if (draining && live.size === 0) exitOnce()
    })
    deps.post({ type: 'spawned', ptyId: m.ptyId, pid: proc.pid })
  }

  return {
    handle(m: ToHost): void {
      switch (m.type) {
        case 'spawn':
          spawn(m)
          return
        case 'write':
          live.get(m.ptyId)?.write(m.data)
          return
        case 'resize':
          live.get(m.ptyId)?.resize(m.cols, m.rows)
          return
        case 'kill':
          live.get(m.ptyId)?.kill()
          return
        case 'killAll':
          // node-pty defers kill() on Windows until the PTY is ready
          // (windowsTerminal.js _deferNoArgs), so exiting right after the kills
          // orphaned a PTY that was still starting (PTYH-19). Leave only once
          // every killed PTY has exited, or at the grace deadline.
          draining = true
          for (const proc of live.values()) proc.kill()
          if (live.size === 0) {
            exitOnce()
            return
          }
          setTimeout(exitOnce, KILL_ALL_GRACE_MS)
          return
      }
    }
  }
}
