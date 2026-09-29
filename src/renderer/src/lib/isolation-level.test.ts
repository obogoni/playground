import { describe, expect, it } from 'vitest'
import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import {
  isolationLevelOf,
  openWorktreeTarget,
  repoSpawnCwd,
  samePath,
  workspaceSpawnCwd
} from './isolation-level'

function wt(path: string, branch: string, isDefault: boolean): WorktreeNode {
  return { id: path, branch, path, isDefault, dirty: false, changes: 0 }
}

/** `playground` is a plain repo under the workspace; `root` sits AT the
 *  workspace path (AC 6), so its primary checkout path equals `ws.path`. */
const PG_MAIN = wt('M:/Obogoni/playground', 'main', true)
const PG_LINKED = wt('M:/Obogoni/playground-24173', 'user/otavio/24173-fix-login', false)
const PG_REPO: RepoNode = {
  name: 'playground',
  path: 'M:/Obogoni/playground',
  worktrees: [PG_MAIN, PG_LINKED]
}

const WS_PLAIN: WorkspaceNode = {
  id: 'm:/obogoni',
  path: 'M:/Obogoni',
  displayName: 'obogoni',
  repos: [PG_REPO]
}

const ROOT_MAIN = wt('C:/mono', 'develop', true)
const ROOT_LINKED = wt('C:/mono-wt/Code-9', 'feature/9-x', false)
const ROOT_REPO: RepoNode = { name: 'mono', path: 'C:/mono', worktrees: [ROOT_MAIN, ROOT_LINKED] }
const WS_REPO_AT_ROOT: WorkspaceNode = {
  id: 'c:/mono',
  path: 'C:/mono',
  displayName: 'mono',
  repos: [ROOT_REPO]
}

const tree: WorkspaceNode[] = [WS_PLAIN, WS_REPO_AT_ROOT]

describe('isolationLevelOf (ISO-01)', () => {
  it('returns worktree with its workspace and repo for a linked worktree path (AC 1)', () => {
    const match = isolationLevelOf(tree, PG_LINKED.path)

    expect(match).not.toBeNull()
    expect(match?.level).toBe('worktree')
    expect(match?.path).toBe('M:/Obogoni/playground-24173')
    expect(match?.worktree).toBe(PG_LINKED)
    expect(match?.repo).toBe(PG_REPO)
    expect(match?.workspace).toBe(WS_PLAIN)
  })

  it('returns repo with that repo and its workspace for a primary checkout path (AC 2)', () => {
    const match = isolationLevelOf(tree, PG_MAIN.path)

    expect(match?.level).toBe('repo')
    expect(match?.path).toBe('M:/Obogoni/playground')
    expect(match?.repo).toBe(PG_REPO)
    expect(match?.worktree).toBe(PG_MAIN)
    expect(match?.workspace).toBe(WS_PLAIN)
  })

  it('returns workspace for a workspace path that is not a primary checkout (AC 3)', () => {
    const match = isolationLevelOf(tree, WS_PLAIN.path)

    expect(match?.level).toBe('workspace')
    expect(match?.path).toBe('M:/Obogoni')
    expect(match?.workspace).toBe(WS_PLAIN)
    expect(match?.repo).toBeUndefined()
    expect(match?.worktree).toBeUndefined()
  })

  it('returns null for a path the tree does not hold (AC 4)', () => {
    expect(isolationLevelOf(tree, 'C:/scratch/sandbox')).toBeNull()
  })

  it('returns null for a subfolder of a repo (Edge Case "subfolder")', () => {
    expect(isolationLevelOf(tree, 'M:/Obogoni/playground/src')).toBeNull()
  })

  it('returns null for any path against an empty tree', () => {
    expect(isolationLevelOf([], 'M:/Obogoni')).toBeNull()
  })
})

describe('isolationLevelOf normalization and precedence (ISO-02)', () => {
  it('matches `M:\\Obogoni\\` to the workspace path `m:/obogoni` (AC 5)', () => {
    const lower: WorkspaceNode = { ...WS_PLAIN, path: 'm:/obogoni' }
    const match = isolationLevelOf([lower], 'M:\\Obogoni\\')

    expect(match?.level).toBe('workspace')
    expect(match?.path).toBe('m:/obogoni')
  })

  it('returns the tree spelling for a cwd differing in case and separators (AC 5)', () => {
    const match = isolationLevelOf(tree, 'm:\\obogoni\\PLAYGROUND-24173')

    expect(match?.level).toBe('worktree')
    expect(match?.path).toBe('M:/Obogoni/playground-24173')
  })

  it('ignores one trailing separator on the tree side too (AC 5)', () => {
    const trailing: WorkspaceNode = { ...WS_PLAIN, path: 'M:\\Obogoni\\', repos: [] }

    expect(isolationLevelOf([trailing], 'M:/Obogoni')?.level).toBe('workspace')
  })

  it('returns repo when the workspace path equals a primary checkout path (AC 6)', () => {
    const match = isolationLevelOf(tree, 'C:/mono')

    expect(match?.level).toBe('repo')
    expect(match?.repo).toBe(ROOT_REPO)
    expect(match?.workspace).toBe(WS_REPO_AT_ROOT)
  })

  it('still returns worktree for a linked worktree of the repo at the workspace path (AC 1, 6)', () => {
    expect(isolationLevelOf(tree, ROOT_LINKED.path)?.level).toBe('worktree')
  })
})

describe('isolationLevelOf on degraded trees', () => {
  it('derives workspace for a missing workspace from the node the tree holds', () => {
    const missing: WorkspaceNode = { ...WS_PLAIN, missing: true, repos: [] }

    expect(isolationLevelOf([missing], 'M:/Obogoni')?.level).toBe('workspace')
  })

  it('derives the other nodes of a workspace whose repo has an error', () => {
    const broken: RepoNode = {
      name: 'broken',
      path: 'M:/Obogoni/broken',
      worktrees: [],
      error: 'x'
    }
    const ws: WorkspaceNode = { ...WS_PLAIN, repos: [broken, PG_REPO] }

    expect(isolationLevelOf([ws], 'M:/Obogoni/broken')).toBeNull()
    expect(isolationLevelOf([ws], PG_LINKED.path)?.level).toBe('worktree')
    expect(isolationLevelOf([ws], 'M:/Obogoni')?.level).toBe('workspace')
  })

  it('returns workspace for a workspace with no repos (Edge Case "no repos")', () => {
    const empty: WorkspaceNode = {
      id: 'd:/empty',
      path: 'D:/empty',
      displayName: 'empty',
      repos: []
    }

    expect(isolationLevelOf([empty], 'D:/empty')).toEqual({
      level: 'workspace',
      path: 'D:/empty',
      workspace: empty
    })
  })
})

describe('samePath (ISO-02)', () => {
  it.each([
    ['M:\\Obogoni\\', 'm:/obogoni'],
    ['C:/code/x', 'c:\\CODE\\X'],
    ['C:/code/x/', 'C:/code/x']
  ])('treats %s and %s as the same path', (a, b) => {
    expect(samePath(a, b)).toBe(true)
  })

  it.each([
    ['C:/code/x', 'C:/code/xy'],
    ['C:/code/x', 'C:/code/x/sub'],
    ['C:/code/x//', 'C:/code/x']
  ])('treats %s and %s as different paths', (a, b) => {
    expect(samePath(a, b)).toBe(false)
  })
})

describe('row spawn targets (ISO-04)', () => {
  it('spawns a workspace row at the workspace path', () => {
    expect(workspaceSpawnCwd(WS_PLAIN)).toBe('M:/Obogoni')
  })

  it('offers no spawn on a missing workspace (Spawn from rows AC 5)', () => {
    expect(workspaceSpawnCwd({ ...WS_PLAIN, missing: true })).toBeNull()
  })

  it('spawns a workspace with no repos at its path (Edge Case "no repos")', () => {
    expect(workspaceSpawnCwd({ ...WS_PLAIN, repos: [] })).toBe('M:/Obogoni')
  })

  it("spawns a repo row at its primary checkout's path", () => {
    const moved: RepoNode = {
      ...PG_REPO,
      path: 'M:/Obogoni/PLAYGROUND',
      worktrees: [PG_LINKED, PG_MAIN]
    }

    expect(repoSpawnCwd(moved)).toBe('M:/Obogoni/playground')
  })

  it('offers no spawn on a repo with a git error (Spawn from rows AC 6)', () => {
    expect(repoSpawnCwd({ ...PG_REPO, error: 'not a git repository' })).toBeNull()
  })

  it('offers no spawn on a repo without a primary checkout (Spawn from rows AC 6)', () => {
    expect(repoSpawnCwd({ ...PG_REPO, worktrees: [PG_LINKED] })).toBeNull()
  })
})

describe('openWorktreeTarget (ISO-10)', () => {
  const at = (cwd: string, pathMissing = false): { cwd: string; pathMissing: boolean } => ({
    cwd,
    pathMissing
  })

  it("selects a worktree session's own worktree node (Rail group AC 7)", () => {
    expect(openWorktreeTarget(tree, at(PG_LINKED.path))).toBe(PG_LINKED.id)
  })

  it('selects the primary checkout for a repo session (Rail group AC 7)', () => {
    expect(openWorktreeTarget(tree, at(PG_MAIN.path))).toBe(PG_MAIN.id)
  })

  it('hides the button for a workspace session (Rail group AC 7)', () => {
    expect(openWorktreeTarget(tree, at(WS_PLAIN.path))).toBeNull()
  })

  it('hides the button for a session with no level', () => {
    expect(openWorktreeTarget(tree, at('C:/scratch/sandbox'))).toBeNull()
  })

  it('hides the button when the session path is missing', () => {
    expect(openWorktreeTarget(tree, at(PG_LINKED.path, true))).toBeNull()
    expect(openWorktreeTarget(tree, at(PG_MAIN.path, true))).toBeNull()
  })

  it("returns the tree's id for a cwd differing only in case", () => {
    const odd = wt('M:/Obogoni/Odd-Case', 'feature/1-x', false)
    const oddTree: WorkspaceNode[] = [
      { ...WS_PLAIN, repos: [{ ...PG_REPO, worktrees: [PG_MAIN, { ...odd, id: 'node-odd' }] }] }
    ]

    expect(openWorktreeTarget(oddTree, at('m:/obogoni/odd-case'))).toBe('node-odd')
  })
})
