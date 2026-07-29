import type { PostCreateHookResult } from '../shared/worktrees'

/** How long a repo's init command may run before it is killed (WPC-05). */
export const HOOK_TIMEOUT_MS = 120000

/** Upper bound on the captured output carried back to the caller (WPC-11). */
export const HOOK_OUTPUT_MAX_CHARS = 4000

/** What a hook shell reports back; `timedOut` marks the killed-for-time path. */
export interface HookShellResult {
  code: number
  stdout: string
  stderr: string
  timedOut?: boolean
}

/**
 * The one I/O seam of the hook: runs `cmd` through a shell and captures its
 * outcome. Never throws — a spawn failure comes back as `code: -1`. The real
 * implementation lives in `index.ts` (thin, hand-verified, like `runShell`);
 * tests inject a fake.
 */
export type HookShell = (
  cmd: string,
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }
) => Promise<HookShellResult>

/** Where the hook runs and what it is initializing. */
export interface HookContext {
  worktreePath: string
  repoPath: string
  branch: string
}

/**
 * Runs a repo's post-create command in a freshly created worktree and shapes the
 * outcome (WPC-01). The command runs with `cwd` set to the worktree — never
 * interpolated into the command string, so a path with spaces needs no quoting
 * (WPC-20) — and with the three `PLAYGROUND_*` context variables layered over the
 * inherited environment (WPC-09).
 *
 * Success is exactly "exited 0" (WPC-02/WPC-24): a command that exits 0 without
 * doing anything is reported as a success, because the exit code is the whole
 * contract. Everything else — a non-zero exit (WPC-03), a spawn failure (WPC-04),
 * a timeout kill (WPC-05) — comes back `ok: false` with the evidence attached.
 */
export async function runPostCreateHook(
  command: string,
  ctx: HookContext,
  shell: HookShell
): Promise<PostCreateHookResult> {
  const result = await shell(command, {
    cwd: ctx.worktreePath,
    env: {
      ...process.env,
      PLAYGROUND_WORKTREE_PATH: ctx.worktreePath,
      PLAYGROUND_REPO_PATH: ctx.repoPath,
      PLAYGROUND_BRANCH: ctx.branch
    },
    timeoutMs: HOOK_TIMEOUT_MS
  })
  return {
    ok: result.code === 0,
    command,
    code: result.code,
    output: combinedTail(result),
    ...(result.timedOut === true ? { timedOut: true } : {})
  }
}

/**
 * Both streams in one field, newest-last, bounded to the last
 * `HOOK_OUTPUT_MAX_CHARS` characters — the tail is what diagnoses a failure, and
 * an unbounded string would be held in main and shipped over IPC. A silent
 * command yields '' rather than undefined, so consumers need no absent-vs-empty
 * branch (WPC-23).
 */
function combinedTail({ stdout, stderr }: HookShellResult): string {
  const combined = [stdout, stderr].filter((stream) => stream !== '').join('\n')
  return combined.length > HOOK_OUTPUT_MAX_CHARS ? combined.slice(-HOOK_OUTPUT_MAX_CHARS) : combined
}
