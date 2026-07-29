import type { CreateWorktreeResult, PostCreateHookResult } from '../shared/worktrees'

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

/** `createWorktree`'s exact shape — what the decorator consumes and returns. */
export type CreateWorktreeFn = (
  repoPath: string,
  branch: string,
  baseBranch?: string,
  worktreeTemplate?: string,
  updateBase?: boolean,
  onExisting?: 'reuse' | 'recreate'
) => Promise<CreateWorktreeResult>

export interface PostCreateHookDeps {
  /** Reads the repo's declared command; null when it declares none. */
  readCommand(repoPath: string): string | null
  shell: HookShell
}

/**
 * Wraps a create with the repo's post-create hook, returning a function with the
 * **identical signature** so it is a drop-in for every caller (WPC-10). Wiring
 * this once in `index.ts` and handing it to both the IPC handler and the workflow
 * ctx is what makes the hook non-optional — no call site can bypass it.
 *
 * The hook runs **iff the create actually produced a worktree**: `ok` with a
 * `path`. That single test covers every no-worktree outcome without enumerating
 * them (WPC-08) — a branch-exists conflict, an empty rendered template, an
 * existing target path, a blocked base refresh and a failed `git worktree add`
 * are all `ok: false` — while the successful `reuse`/`recreate` paths are
 * `ok: true` with a path and so do run it.
 *
 * A repo that declares no command is returned untouched, with **no `hook` key at
 * all**, keeping the pre-feature result shape byte-identical (WPC-06). A hook
 * that fails never invalidates the create: `ok` and `path` pass through and the
 * failure rides along in `hook` (WPC-03) — nothing here removes a worktree.
 */
export function withPostCreateHook(
  create: CreateWorktreeFn,
  deps: PostCreateHookDeps
): CreateWorktreeFn {
  return async (repoPath, branch, baseBranch, worktreeTemplate, updateBase, onExisting) => {
    const result = await create(
      repoPath,
      branch,
      baseBranch,
      worktreeTemplate,
      updateBase,
      onExisting
    )
    if (!result.ok || typeof result.path !== 'string') return result
    const command = deps.readCommand(repoPath)
    if (command === null) return result
    const hook = await runPostCreateHook(
      command,
      { worktreePath: result.path, repoPath, branch },
      deps.shell
    )
    return { ...result, hook }
  }
}
