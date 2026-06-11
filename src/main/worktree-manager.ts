import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { WorktreeNode } from '../shared/tree'
import type { CreateWorktreeResult } from '../shared/worktrees'
import { sanitizeBranch, worktreePathFor } from '../shared/worktrees'

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
 * `git worktree add` at the PRD flat-sibling path (CRWT-02). With a base:
 * `-b <branch> <base>`; without: checks out the existing branch. Failures are
 * returned (dialog shows them inline), never thrown.
 */
export async function createWorktree(
  repoPath: string,
  branch: string,
  baseBranch?: string
): Promise<CreateWorktreeResult> {
  if (sanitizeBranch(branch) === '') {
    return { ok: false, error: `Branch name "${branch}" sanitizes to an empty path segment` }
  }
  const target = worktreePathFor(repoPath, branch)
  if (existsSync(target)) {
    return { ok: false, error: `Target path already exists: ${target}` }
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
  return run('git', args, { cwd, windowsHide: true })
}
