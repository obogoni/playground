import type { SpawnPlan } from './spawn-plan'

/**
 * Live handle on one running PTY. Deliberately tiny — the surface AM2's
 * SessionManager will depend on (mirrors TaskBoard ← WorkItemSource).
 */
export interface PtyHandle {
  onData(cb: (data: string) => void): void
  /** `hostExited` is set when the PTY host process died under the PTY (PTYH-22). */
  onExit(cb: (e: { exitCode: number; hostExited?: true }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

/**
 * The seam `SessionManager` spawns PTYs through. node-pty lives only in the
 * PTY host utility process (PTYH-01, AD-053); `PtyHostClient` serves this
 * interface from main, so a ConPTY's synchronous creation never blocks main.
 * Resolves once the PTY exists and rejects with the host's error otherwise.
 */
export interface PtyPort {
  spawn(plan: SpawnPlan, env?: NodeJS.ProcessEnv): Promise<PtyHandle>
}
