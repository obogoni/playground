import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface RepoRef {
  name: string
  path: string
}

/**
 * Single-level scan of a workspace folder for git repositories (PRD
 * §Module decomposition: pure FS, no git invocation).
 *
 * A repo is a direct child directory containing a `.git` *directory*. Children
 * with a `.git` *file* are linked worktrees (e.g. flat-sibling
 * `<repo>-<branch>` folders) and are deliberately not repos — they surface as
 * worktrees of their repo via `git worktree list`. Dot-dirs and node_modules
 * are skipped. A missing workspace path rejects with ENOENT (callers mark the
 * workspace as missing).
 */
export async function scanRepos(workspacePath: string): Promise<RepoRef[]> {
  const entries = await readdir(workspacePath, { withFileTypes: true })
  const candidates = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules'
  )

  const repos = await Promise.all(
    candidates.map(async (e): Promise<RepoRef | null> => {
      const path = join(workspacePath, e.name)
      try {
        const gitStat = await stat(join(path, '.git'))
        return gitStat.isDirectory() ? { name: e.name, path } : null
      } catch {
        return null // no .git at all
      }
    })
  )

  return repos
    .filter((r): r is RepoRef => r !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}
