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
}

/**
 * Index and working tree back to the last commit, every pathspec literal
 * (FDSC-09). The revision is fixed here: nothing in a request can name another
 * (FDSC-42).
 */
const RESTORE = ['--literal-pathspecs', 'restore', '--source=HEAD', '--staged', '--worktree', '--']

/** Joined-path budget per restore call, far under Windows' 32,767-character command line (FDSC-49). */
const MAX_CHUNK_CHARS = 8000

interface Restore {
  index: number
  paths: string[]
}

/**
 * Discards uncommitted entries of one worktree and reports one result per
 * entry, in the request's order. Never rejects: every failure is an entry kept
 * with its cause. The module never deletes a file itself (FDSC-17): a tracked
 * file goes back through git's restore.
 */
export async function discardChanges(
  worktreePath: string,
  entries: ChangedPath[],
  deps: DiscardDeps
): Promise<DiscardResult> {
  const run = deps.run ?? git
  const kept = new Map<number, DiscardKept>()
  const restores: Restore[] = []

  entries.forEach((entry, index) => {
    const paths = [entry.path]
    // A path that escapes the worktree is kept and never reaches git (FDSC-23).
    if (paths.some((p) => resolveInside(worktreePath, p) === null)) {
      kept.set(index, { cause: 'outside' })
      return
    }
    restores.push({ index, paths })
  })

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
