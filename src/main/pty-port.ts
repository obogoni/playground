import * as pty from 'node-pty'
import type { SpawnPlan } from './spawn-plan'
import { buildPtyEnv } from './terminal-env'

/**
 * Live handle on one running PTY. Deliberately tiny — the surface AM2's
 * SessionManager will depend on (mirrors TaskBoard ← WorkItemSource).
 */
export interface PtyHandle {
  onData(cb: (data: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

/**
 * node-pty adapter — the only file that imports node-pty (PRD §Modules
 * PtyPort). Kept thin on purpose so the untested OS boundary is minimal
 * (TESTING.md): its behavior is hand-verified through the embedded terminal
 * and the packaged build, not units.
 */
export class PtyPort {
  /**
   * Spawn the shell from a SpawnPlan as a Windows ConPTY, inheriting the
   * developer's environment (PATH etc., PRD story 40) plus any overrides.
   */
  spawn(plan: SpawnPlan, env?: NodeJS.ProcessEnv): PtyHandle {
    let proc: pty.IPty
    try {
      proc = pty.spawn(plan.file, plan.args, {
        name: 'xterm-256color',
        cwd: plan.cwd,
        env: buildPtyEnv({ ...process.env, ...env }),
        useConpty: true
      })
    } catch (err) {
      // The renderer surfaces the reason in a toast, which is gone the moment it
      // fades; a packaged build has no DevTools to fall back on (#89). Logging the
      // plan here is what lets an intermittent failure be attributed after the
      // fact — which of file/args/cwd the OS actually rejected.
      console.error(
        `Failed to spawn PTY: file=${plan.file} args=${JSON.stringify(plan.args)} cwd=${plan.cwd}`,
        err
      )
      throw err
    }

    return {
      onData: (cb) => proc.onData(cb),
      onExit: (cb) => proc.onExit(({ exitCode }) => cb({ exitCode })),
      write: (data) => proc.write(data),
      resize: (cols, rows) => proc.resize(cols, rows),
      kill: () => proc.kill()
    }
  }
}
