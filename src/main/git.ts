import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Stdout ceiling for any git call: far above what a large repository produces. */
const MAX_STDOUT_BYTES = 64 * 1024 * 1024

/**
 * The single way this app runs git (AD-023, STBR-27): `execFile`, so no shell
 * ever parses the arguments, a hidden window, and `GIT_TERMINAL_PROMPT=0`.
 * `timeoutMs` maps to `execFile`'s `timeout`: the process is killed once it
 * elapses, and the rejection satisfies `isTimeout` (STBR-24).
 */
export function git(
  cwd: string,
  args: string[],
  opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string }> {
  // GIT_TERMINAL_PROMPT=0: a fetch with no cached credentials fails fast instead
  // of hanging the main process on an un-answerable prompt (WBR-02 → blocks).
  return run('git', args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    timeout: opts.timeoutMs,
    // execFile defaults to 1 MiB of stdout and turns anything larger into
    // "stdout maxBuffer length exceeded" — a message that says nothing about
    // the repository being big. A large repository reaches that on ordinary
    // commands, so the ceiling is a safety net here rather than a limit any
    // caller is meant to rely on; the callers that need a real cap measure it
    // themselves, as file-diff does before reading a blob.
    maxBuffer: MAX_STDOUT_BYTES
  })
}

/**
 * How a module runs git when a test needs to stand in for it. Injectable so a
 * test can prove what a code path did NOT ask for — the only way to show that
 * a listing never read a subtree, since the evidence is an absence.
 */
export type GitRunner = (cwd: string, args: string[]) => Promise<{ stdout: string }>

/** Git's own first stderr line (e.g. "fatal: …") reads better than execFile's wrapper message. */
export function gitFailureLine(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr
  const line = stderr?.split(/\r?\n/).find((l) => l.trim() !== '')
  if (line) return line.trim()
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}

/** True when `execFile` killed the process because `timeoutMs` elapsed, not when git merely failed. */
export function isTimeout(err: unknown): boolean {
  return (err as { killed?: unknown } | null)?.killed === true
}
