/**
 * Message protocol between main's `PtyHostClient` and the PTY host utility
 * process (`pty-host.ts`), which owns every node-pty instance (PTYH-01).
 * Every PTY-scoped message carries a client-assigned `ptyId`: the session id is
 * reused by a respawn and the OS `pid` is unknown until the spawn returns, so
 * neither can key the protocol.
 *
 * The host handles messages one at a time in arrival order, so a `write`,
 * `kill` or `killAll` posted after a `spawn` always finds that PTY created
 * (PTYH-08, PTYH-19).
 */

/** Main → host. */
export type ToHost =
  | {
      type: 'spawn'
      ptyId: number
      file: string
      args: string[]
      cwd: string
      env: Record<string, string>
    }
  | { type: 'write'; ptyId: number; data: string }
  | { type: 'resize'; ptyId: number; cols: number; rows: number }
  | { type: 'kill'; ptyId: number }
  /** Kill every PTY, then exit the host process with code 0. */
  | { type: 'killAll' }

/** Host → main. */
export type FromHost =
  | { type: 'spawned'; ptyId: number; pid: number }
  | { type: 'spawn-failed'; ptyId: number; message: string }
  | { type: 'data'; ptyId: number; data: string }
  | { type: 'exit'; ptyId: number; exitCode: number }
