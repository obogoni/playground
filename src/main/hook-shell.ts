import { spawn } from 'node:child_process'
import type { HookShell, HookShellResult } from './post-create-hook'

/**
 * How long to keep waiting for stdio to flush after the shell has exited before
 * settling anyway. `close` (all stdio closed) carries the complete output and
 * normally fires within a millisecond of `exit`, so the happy path never waits
 * this long — it exists purely so a surviving grandchild holding the inherited
 * pipes open cannot stall the result forever.
 */
export const HOOK_FLUSH_GRACE_MS = 250

/**
 * The real `HookShell` (WPC-01): runs a repo's post-create command **through a
 * shell**, so a checked-in `.cmd`/`.ps1` works, in the new worktree with the
 * `PLAYGROUND_*` env the caller supplies. Never throws — a spawn error becomes
 * `code: -1` rather than a rejection.
 *
 * **Settling is deliberately not just `close`.** The timeout is `spawn`'s own: on
 * expiry Node signals the shell, and a non-null `signal` is the only reliable
 * "killed for time" marker (an exit code alone is ambiguous on Windows). But
 * `close` waits for every inherited pipe to reach EOF, and killing `cmd.exe` does
 * NOT kill its children — a surviving grandchild holds those pipes open, so `close`
 * can lag the kill by many seconds or never arrive at all. Waiting on it alone
 * would leave `worktrees:create` unresolved and the caller stuck.
 *
 * So whichever comes first wins: `close` (complete output, the normal case) or
 * `exit` plus a short flush grace period (guaranteed progress). Either way the
 * result is returned promptly. A detached grandchild may still outlive the shell —
 * that limitation stands (a real process-tree kill is out of scope) — but it can no
 * longer hold the create hostage.
 */
export const runHookShell: HookShell = (cmd, { cwd, env, timeoutMs }) => {
  return new Promise<HookShellResult>((resolve) => {
    const child = spawn(cmd, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
      timeout: timeoutMs,
      killSignal: 'SIGTERM'
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let graceTimer: NodeJS.Timeout | undefined

    const settle = (result: HookShellResult): void => {
      if (settled) return
      settled = true
      if (graceTimer) clearTimeout(graceTimer)
      resolve(result)
    }
    const outcome = (code: number | null, signal: NodeJS.Signals | null): HookShellResult =>
      signal !== null
        ? { code: -1, stdout, stderr, timedOut: true }
        : { code: code ?? -1, stdout, stderr }

    child.stdout?.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()))
    child.on('error', (err) => settle({ code: -1, stdout, stderr: stderr + String(err) }))
    child.on('close', (code, signal) => settle(outcome(code, signal)))
    child.on('exit', (code, signal) => {
      graceTimer = setTimeout(() => settle(outcome(code, signal)), HOOK_FLUSH_GRACE_MS)
      // Don't hold the event loop open just for the grace timer.
      graceTimer.unref?.()
    })
  })
}
