import * as pty from 'node-pty'
import type { SpawnPlan } from './spawn-plan'

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
    const proc = pty.spawn(plan.file, plan.args, {
      name: 'xterm-color',
      cwd: plan.cwd,
      env: { ...process.env, ...env } as Record<string, string>,
      useConpty: true
    })

    return {
      onData: (cb) => proc.onData(cb),
      onExit: (cb) => proc.onExit(({ exitCode }) => cb({ exitCode })),
      write: (data) => proc.write(data),
      resize: (cols, rows) => proc.resize(cols, rows),
      kill: () => proc.kill()
    }
  }
}
