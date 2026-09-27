import type { Stats } from 'node:fs'
import { lstat as fsLstat } from 'node:fs/promises'
import type { ChangedPath, DiscardKept, DiscardResult } from '../shared/files'
import { resolveInside } from './file-reader'
import { git, gitFailureLine, type GitRunner } from './git'

/**
 * What the discard needs from the outside world. `trash` is Electron's
 * `shell.trashItem` in the app and a stand-in in tests, so a refusal can be
 * staged; `run` defaults to the app's one git runner (AD-023).
 */
export interface DiscardDeps {
  /** Moves one absolute path to the Recycle Bin; rejects when it will not. */
  trash: (absPath: string) => Promise<void>
  run?: GitRunner
  lstat?: (absPath: string) => Promise<Stats>
}

/**
 * Index and working tree back to the last commit, every pathspec literal
 * (FDSC-09). The revision is fixed here: nothing in a request can name another
 * (FDSC-42).
 */
const RESTORE = ['--literal-pathspecs', 'restore', '--source=HEAD', '--staged', '--worktree', '--']

/**
 * Drops an added file's index entry. Unlike `restore --source=HEAD` it works
 * before the first commit, where there is no HEAD to resolve (FDSC-46).
 */
const UNSTAGE = ['--literal-pathspecs', 'rm', '--cached', '--quiet', '--ignore-unmatch', '--']

/** Joined-path budget per restore call, far under Windows' 32,767-character command line (FDSC-49). */
const MAX_CHUNK_CHARS = 8000

interface Restore {
  index: number
  paths: string[]
}

/** What one entry needs: paths for the Recycle Bin first, then its git step. */
interface Plan {
  index: number
  entry: ChangedPath
  /** Absolute paths to move to the Recycle Bin, when something is there. */
  bin: string[]
  after: 'restore' | 'unstage' | 'none'
}

/**
 * Discards uncommitted entries of one worktree and reports one result per
 * entry, in the request's order. Never rejects: every failure is an entry kept
 * with its cause. The module never deletes a file itself (FDSC-17): a file
 * leaves the worktree through the Recycle Bin or through git's restore.
 *
 * Two phases, so the Recycle Bin always acts before git, and git never runs
 * for an entry the Recycle Bin refused (FDSC-18).
 */
export async function discardChanges(
  worktreePath: string,
  entries: ChangedPath[],
  deps: DiscardDeps
): Promise<DiscardResult> {
  const run = deps.run ?? git
  const lstat = deps.lstat ?? fsLstat
  const kept = new Map<number, DiscardKept>()
  const plans: Plan[] = []

  entries.forEach((entry, index) => {
    // A path that escapes the worktree is kept and never touched (FDSC-23).
    const abs = resolveInside(worktreePath, entry.path)
    if (abs === null) {
      kept.set(index, { cause: 'outside' })
      return
    }
    if (entry.status === 'untracked') plans.push({ index, entry, bin: [abs], after: 'none' })
    else if (entry.status === 'added') plans.push({ index, entry, bin: [abs], after: 'unstage' })
    else plans.push({ index, entry, bin: [], after: 'restore' })
  })

  // Phase A: the Recycle Bin, one entry at a time.
  for (const plan of plans) {
    const why = await toRecycleBin(plan.bin, deps.trash, lstat)
    if (why) kept.set(plan.index, why)
  }
  const live = plans.filter((plan) => !kept.has(plan.index))

  // Phase B: git, for what the Recycle Bin did not keep.
  for (const plan of live.filter((p) => p.after === 'unstage')) {
    try {
      await run(worktreePath, [...UNSTAGE, plan.entry.path])
    } catch (err) {
      // The file stays in the Recycle Bin, where it can be restored (FDSC-48).
      kept.set(plan.index, { cause: 'git', detail: gitFailureLine(err) })
    }
  }
  const restores = live
    .filter((p) => p.after === 'restore')
    .map((p): Restore => ({ index: p.index, paths: [p.entry.path] }))
  for (const chunk of chunksOf(restores)) {
    try {
      await run(worktreePath, [...RESTORE, ...chunk.flatMap((r) => r.paths)])
    } catch (err) {
      // One unknown path fails the whole call and restores nothing, so each
      // entry is retried alone and a failure lands on its own entry (FDSC-08).
      if (chunk.length === 1) {
        kept.set(chunk[0].index, { cause: 'git', detail: gitFailureLine(err) })
        continue
      }
      for (const restore of chunk) {
        try {
          await run(worktreePath, [...RESTORE, ...restore.paths])
        } catch (single) {
          kept.set(restore.index, { cause: 'git', detail: gitFailureLine(single) })
        }
      }
    }
  }

  return {
    files: entries.map((entry, index) => {
      const why = kept.get(index)
      return why ? { path: entry.path, kept: why } : { path: entry.path }
    })
  }
}

/**
 * Moves each path to the Recycle Bin, or says why the entry stays. A path with
 * nothing on it is skipped (FDSC-44); a link or junction is never moved, since
 * its target can be a shared folder (FDSC-22; `isSymbolicLink()` is true for
 * both on Windows).
 */
async function toRecycleBin(
  paths: string[],
  trash: DiscardDeps['trash'],
  lstat: (absPath: string) => Promise<Stats>
): Promise<DiscardKept | null> {
  for (const abs of paths) {
    let info: Stats
    try {
      info = await lstat(abs)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      return { cause: 'recycle-bin', detail: messageOf(err) }
    }
    if (info.isSymbolicLink()) return { cause: 'link' }
    try {
      await trash(abs)
    } catch (err) {
      return { cause: 'recycle-bin', detail: messageOf(err) }
    }
  }
  return null
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Consecutive restores whose joined paths stay under `MAX_CHUNK_CHARS`. */
function chunksOf(restores: Restore[]): Restore[][] {
  const chunks: Restore[][] = []
  let current: Restore[] = []
  let size = 0
  for (const restore of restores) {
    const length = restore.paths.reduce((sum, p) => sum + p.length + 1, 0)
    if (current.length > 0 && size + length > MAX_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(restore)
    size += length
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}
