import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { WorktreeNode } from '../shared/tree'
import type { CreateWorktreeResult, RemoveWorktreeResult } from '../shared/worktrees'
import { worktreeNameFor, worktreePathFor } from '../shared/worktrees'

const run = promisify(execFile)

/** Raised when git itself fails for a repo (not installed, not a repo, …). */
export class GitError extends Error {
  constructor(repoPath: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    super(`git failed in ${repoPath}: ${detail.split('\n')[0]}`)
    this.name = 'GitError'
  }
}

/**
 * Per-repo worktree reads (PRD WorktreeManager, list-only in M1 — create and
 * remove arrive with the M2 lifecycle feature). Hides the `git` subprocess and
 * the `--porcelain` block format. No shell — execFile keeps paths quote-safe.
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeNode[]> {
  let stdout: string
  try {
    ;({ stdout } = await git(repoPath, ['worktree', 'list', '--porcelain']))
  } catch (err) {
    throw new GitError(repoPath, err)
  }

  const blocks = parsePorcelainBlocks(stdout)
  return Promise.all(
    blocks.map(async (block, index) => {
      const { dirty, changes } = await statusOf(block.path)
      return {
        id: block.path,
        branch: block.branch,
        path: block.path,
        // Git guarantees the main working tree is the first entry.
        isDefault: index === 0,
        dirty,
        changes
      }
    })
  )
}

/**
 * `git worktree add` at the PRD flat-sibling path (CRWT-02), with the folder
 * name rendered from the effective worktree template (WTNT-01). With a base:
 * `-b <branch> <base>`; without: checks out the existing branch. When
 * `updateBase` is set and a base is given, the local base is first
 * fast-forwarded to its remote upstream (WBR-01) — a refresh failure blocks the
 * create (WBR-02). Failures are returned (dialog shows them inline), never thrown.
 */
export async function createWorktree(
  repoPath: string,
  branch: string,
  baseBranch?: string,
  worktreeTemplate?: string,
  updateBase?: boolean
): Promise<CreateWorktreeResult> {
  if (worktreeNameFor(repoPath, branch, worktreeTemplate) === '') {
    return {
      ok: false,
      error: `The worktree template produced an empty folder name for branch "${branch}"`
    }
  }
  const target = worktreePathFor(repoPath, branch, worktreeTemplate)
  if (existsSync(target)) {
    return { ok: false, error: `Target path already exists: ${target}` }
  }
  // Refresh the base from its remote before cutting the branch (WBR-01/02). Only
  // meaningful on the new-branch-from-base path; the existing-branch checkout
  // (empty base) has nothing to refresh (WBR-D4).
  if (updateBase && baseBranch) {
    const refreshed = await refreshBaseFromRemote(repoPath, baseBranch)
    if (!refreshed.ok) return refreshed
  }
  const args = baseBranch
    ? ['worktree', 'add', target, '-b', branch, baseBranch]
    : ['worktree', 'add', target, branch]
  try {
    await git(repoPath, args)
    return { ok: true, path: target }
  } catch (err) {
    return { ok: false, error: gitFailureLine(err) }
  }
}

/**
 * Fast-forward the local `baseBranch` to its configured remote upstream so a
 * branch cut from it starts current (WBR-01). Fast-forward only: a missing
 * upstream, a fetch failure, a dirty base checkout, or a diverged (non-ff) base
 * all return `{ ok: false }` and block the create (WBR-02) — never a silent
 * stale base. Side-effect-free when the caller doesn't opt in.
 */
async function refreshBaseFromRemote(
  repoPath: string,
  baseBranch: string
): Promise<CreateWorktreeResult> {
  const noUpstream: CreateWorktreeResult = {
    ok: false,
    error: `Base branch "${baseBranch}" has no remote upstream to refresh from. Uncheck "Update base branch from remote" to skip.`
  }
  // 1. Resolve the base branch's upstream (e.g. "origin/main").
  let upstream: string
  try {
    const { stdout } = await git(repoPath, [
      'rev-parse',
      '--abbrev-ref',
      `${baseBranch}@{upstream}`
    ])
    upstream = stdout.trim()
  } catch {
    return noUpstream
  }
  // An upstream with no `<remote>/` prefix is a local-ref tracking branch — there
  // is no remote to refresh from, so treat it like the missing-upstream case.
  const slash = upstream.indexOf('/')
  if (slash < 0) {
    return noUpstream
  }
  const remote = upstream.slice(0, slash)
  const remoteBranch = upstream.slice(slash + 1)

  // 2. Update the remote-tracking ref (credential prompts suppressed; failure blocks).
  try {
    await git(repoPath, ['fetch', remote, remoteBranch])
  } catch (err) {
    return { ok: false, error: gitFailureLine(err) }
  }

  // 3. Fast-forward the local base to the fetched upstream tip.
  const hosting = await worktreeHosting(repoPath, baseBranch)
  try {
    if (hosting) {
      // Base is checked out (the normal case): ff-merge in place — aborts if dirty.
      await git(hosting, ['merge', '--ff-only', upstream])
    } else {
      // Base not checked out anywhere: fast-forward the ref directly (ff-only by default).
      await git(repoPath, ['fetch', remote, `${remoteBranch}:${baseBranch}`])
    }
  } catch (err) {
    return { ok: false, error: ffFailureLine(err, baseBranch, upstream) }
  }
  return { ok: true }
}

/** Path of the worktree that has `branch` checked out, or null if none does. */
async function worktreeHosting(repoPath: string, branch: string): Promise<string | null> {
  try {
    const { stdout } = await git(repoPath, ['worktree', 'list', '--porcelain'])
    const block = parsePorcelainBlocks(stdout).find((b) => b.branch === branch)
    return block ? block.path : null
  } catch {
    return null
  }
}

/** A non-fast-forward reads better as "diverged"; anything else keeps git's own line. */
function ffFailureLine(err: unknown, baseBranch: string, upstream: string): string {
  const stderr = (err as { stderr?: string }).stderr ?? ''
  if (/non-fast-forward|not possible to fast-forward|\[rejected\]/i.test(stderr)) {
    return `Local "${baseBranch}" has diverged from ${upstream} — can't fast-forward. Uncheck "Update base branch from remote" to skip.`
  }
  return gitFailureLine(err)
}

/**
 * `git worktree remove` with the PRD guards (DLWT-01): refuses the repo's
 * primary checkout, and refuses a dirty worktree unless force — dirtiness is
 * re-checked fresh here, not trusted from the renderer's tree snapshot.
 * Failures (guards included) are returned, never thrown.
 */
export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  opts: { force?: boolean } = {}
): Promise<RemoveWorktreeResult> {
  if (samePath(repoPath, worktreePath)) {
    return { ok: false, error: "This is the repo's primary checkout — it can't be removed here." }
  }
  if (!opts.force) {
    const { dirty, changes } = await statusOf(worktreePath)
    if (dirty) {
      return {
        ok: false,
        error: `${changes} uncommitted change${changes === 1 ? '' : 's'} — commit or stash before removing.`
      }
    }
  }
  const args = opts.force
    ? ['worktree', 'remove', '--force', worktreePath]
    : ['worktree', 'remove', worktreePath]
  try {
    await git(repoPath, args)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: gitFailureLine(err) }
  }
}

/** Paths from the tree snapshot and the registry may differ in case/separators. */
function samePath(a: string, b: string): boolean {
  const norm = (p: string): string => p.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** Git's own first stderr line (e.g. "fatal: …") reads better than execFile's wrapper message. */
function gitFailureLine(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr
  const line = stderr?.split(/\r?\n/).find((l) => l.trim() !== '')
  if (line) return line.trim()
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}

interface PorcelainBlock {
  path: string
  branch: string
}

/**
 * Blocks are separated by blank lines:
 *   worktree <path>
 *   HEAD <sha>
 *   branch refs/heads/<name>   (or `detached`, or `bare`)
 */
function parsePorcelainBlocks(stdout: string): PorcelainBlock[] {
  const blocks: PorcelainBlock[] = []
  for (const raw of stdout.split(/\r?\n\r?\n/)) {
    const lines = raw.split(/\r?\n/).filter(Boolean)
    if (lines.length === 0) continue
    const path = lines
      .find((l) => l.startsWith('worktree '))
      ?.slice('worktree '.length)
      .replaceAll('/', '\\')
    if (!path) continue
    const branchLine = lines.find((l) => l.startsWith('branch '))
    const head = lines.find((l) => l.startsWith('HEAD '))?.slice('HEAD '.length)
    let branch: string
    if (branchLine) {
      branch = branchLine.slice('branch '.length).replace(/^refs\/heads\//, '')
    } else if (lines.includes('bare')) {
      branch = '(bare)'
    } else {
      branch = `(detached ${head ? head.slice(0, 7) : '?'})`
    }
    blocks.push({ path, branch })
  }
  return blocks
}

async function statusOf(worktreePath: string): Promise<{ dirty: boolean; changes: number }> {
  try {
    const { stdout } = await git(worktreePath, ['status', '--porcelain'])
    const changes = stdout.split(/\r?\n/).filter(Boolean).length
    return { dirty: changes > 0, changes }
  } catch {
    // A worktree whose path vanished or whose gitdir is broken: report clean
    // rather than failing the whole repo listing.
    return { dirty: false, changes: 0 }
  }
}

function git(cwd: string, args: string[]): Promise<{ stdout: string }> {
  // GIT_TERMINAL_PROMPT=0: a fetch with no cached credentials fails fast instead
  // of hanging the main process on an un-answerable prompt (WBR-02 → blocks).
  return run('git', args, {
    cwd,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
}
