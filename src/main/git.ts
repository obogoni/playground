import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { diagnostics } from './diagnostics'
import { createSpawnPacer } from './spawn-pacer'

const run = promisify(execFile)

/** One queue for every git process the app starts (PERF-22). */
const pace = createSpawnPacer()

/** Stdout ceiling for any git call: far above what a large repository produces. */
const MAX_STDOUT_BYTES = 64 * 1024 * 1024

/**
 * The single way this app runs git (AD-023, STBR-27): `execFile`, so no shell
 * ever parses the arguments, a hidden window, `GIT_TERMINAL_PROMPT=0`, and
 * stdin ended (CRTO-06), so nothing git starts can wait on keyboard input.
 * `timeoutMs` maps to `execFile`'s `timeout`: the process is killed once it
 * elapses, and the rejection satisfies `isTimeout` (STBR-24). `input`, when
 * given, is written to the child's stdin before it is ended.
 */
export function git(
  cwd: string,
  args: string[],
  opts: { timeoutMs?: number; input?: string } = {}
): Promise<{ stdout: string }> {
  // GIT_TERMINAL_PROMPT=0: a fetch with no cached credentials fails fast instead
  // of hanging the main process on an un-answerable prompt (WBR-02 → blocks).
  // Paced: a tree refresh asks for many processes at once, and each spawn
  // blocks the main process, so they start one event-loop turn apart (PERF-22).
  // Diagnostics counts the process when the queue starts it, and the wait before (PDIAG-09, -15).
  const start = diagnostics().gitRequested(cwd, args)
  return pace(() => {
    const end = start()
    const started = run('git', args, {
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
    // execFile ignores a `stdio` option, so stdin is a pipe; ending it at once
    // gives git end of input instead of a read that waits forever (CRTO-06).
    if (opts.input !== undefined) started.child.stdin?.end(opts.input)
    else started.child.stdin?.end()
    return started.finally(end)
  })
}

/**
 * Prefix for every read that must not write the index (FWIG-15). `--no-optional-locks` stops
 * `status`'s refresh; `diff.autoRefreshIndex=false` stops `diff`'s, which the first does not.
 */
export const READ_ONLY_FLAGS: readonly string[] = [
  '--no-optional-locks',
  '-c',
  'diff.autoRefreshIndex=false'
]

/**
 * How a module runs git when a test needs to stand in for it. Injectable so a
 * test can prove what a code path did NOT ask for — the only way to show that
 * a listing never read a subtree, since the evidence is an absence.
 */
export type GitRunner = (
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number }
) => Promise<{ stdout: string }>

/**
 * The line of a git failure the app shows (BSLG-12, BSLG-13): git's first stderr
 * line that starts with `fatal:` or `error:`, so a progress note such as
 * `Preparing worktree …` printed before it never stands in for the reason; else
 * the first non-empty stderr line; else the Error message's first line. Trimmed.
 */
export function gitFailureLine(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr
  const lines = (stderr?.split(/\r?\n/) ?? []).map((l) => l.trim())
  const line = lines.find((l) => /^(fatal|error):/.test(l)) ?? lines.find((l) => l !== '')
  if (line) return line
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}

/** True when `execFile` killed the process because `timeoutMs` elapsed, not when git merely failed. */
export function isTimeout(err: unknown): boolean {
  return (err as { killed?: unknown } | null)?.killed === true
}
