import type { RepoNode, WorkspaceNode } from '../shared/tree'
import { scanRepos } from './repo-scanner'
import type { WorkspaceRegistry } from './workspace-registry'
import { listWorktrees } from './worktree-manager'

/**
 * Composes registry → RepoScanner → WorktreeManager into the snapshot the
 * renderer consumes via tree:get. Per-node failures degrade into `missing`
 * (workspace path gone) or `error` (git failed for one repo) — the snapshot
 * call itself never rejects for those.
 */
export async function buildTree(registry: WorkspaceRegistry): Promise<WorkspaceNode[]> {
  return Promise.all(
    registry.list().map(async (entry): Promise<WorkspaceNode> => {
      let repoRefs
      try {
        repoRefs = await scanRepos(entry.path)
      } catch {
        return { ...entry, missing: true, repos: [] }
      }

      const repos = await Promise.all(
        repoRefs.map(async (repo): Promise<RepoNode> => {
          try {
            return { ...repo, worktrees: await listWorktrees(repo.path) }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return { ...repo, worktrees: [], error: message }
          }
        })
      )

      return { ...entry, repos }
    })
  )
}
