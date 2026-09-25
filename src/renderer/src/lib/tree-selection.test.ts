import { describe, expect, it } from 'vitest'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import {
  findWorktree,
  selectionAfterRefresh,
  selectionAfterRemove,
  worktreeIdForPath
} from './tree-selection'

function wt(id: string, isDefault = false): WorktreeNode {
  return { id, branch: id, path: id, isDefault, dirty: false, changes: 0 }
}

const tree: WorkspaceNode[] = [
  {
    id: 'ws1',
    path: 'ws1',
    displayName: 'WS One',
    repos: [
      {
        name: 'repo-a',
        path: '/repo-a',
        worktrees: [wt('/repo-a/main', true), wt('/repo-a/feat')]
      },
      { name: 'repo-b', path: '/repo-b', worktrees: [wt('/repo-b/main', true)] }
    ]
  }
]

describe('findWorktree', () => {
  it('resolves a selection id to its workspace/repo context', () => {
    const found = findWorktree(tree, '/repo-a/feat')
    expect(found).not.toBeNull()
    expect(found?.repoName).toBe('repo-a')
    expect(found?.repoPath).toBe('/repo-a')
    expect(found?.workspaceName).toBe('WS One')
    expect(found?.worktree.id).toBe('/repo-a/feat')
  })

  it('returns null for an unknown id and for a null id', () => {
    expect(findWorktree(tree, '/nope')).toBeNull()
    expect(findWorktree(tree, null)).toBeNull()
    expect(findWorktree([], '/repo-a/main')).toBeNull()
  })
})

describe('selectionAfterRefresh', () => {
  it('keeps the selection when its worktree still exists', () => {
    expect(selectionAfterRefresh(tree, '/repo-a/feat')).toBe('/repo-a/feat')
  })

  it('drops the selection when its worktree is gone or the tree is empty', () => {
    expect(selectionAfterRefresh(tree, '/repo-a/deleted')).toBeNull()
    expect(selectionAfterRefresh([], '/repo-a/main')).toBeNull()
    expect(selectionAfterRefresh(tree, null)).toBeNull()
  })
})

describe('selectionAfterRemove', () => {
  it("lands on the repo's default checkout", () => {
    expect(selectionAfterRemove(tree, '/repo-a')).toBe('/repo-a/main')
    expect(selectionAfterRemove(tree, '/repo-b')).toBe('/repo-b/main')
  })

  it('returns null when the repo is not found', () => {
    expect(selectionAfterRemove(tree, '/missing')).toBeNull()
    expect(selectionAfterRemove([], '/repo-a')).toBeNull()
  })

  it('returns null when the repo has no default worktree', () => {
    const noDefault: WorkspaceNode[] = [
      {
        id: 'w',
        path: 'w',
        displayName: 'w',
        repos: [{ name: 'r', path: '/r', worktrees: [wt('/r/x')] }]
      }
    ]
    expect(selectionAfterRemove(noDefault, '/r')).toBeNull()
  })
})

describe('worktreeIdForPath', () => {
  it('resolves the folder a session was spawned in', () => {
    expect(worktreeIdForPath(tree, '/repo-a/feat')).toBe('/repo-a/feat')
  })

  it('resolves a folder inside a worktree to that worktree', () => {
    // An agent may be started deeper than the worktree root.
    expect(worktreeIdForPath(tree, '/repo-a/feat/src/lib')).toBe('/repo-a/feat')
  })

  it('ignores case and separator, because Windows does', () => {
    expect(worktreeIdForPath(tree, '\\REPO-A\\FEAT\\src')).toBe('/repo-a/feat')
  })

  it('does not match a sibling whose name merely starts the same', () => {
    expect(worktreeIdForPath(tree, '/repo-a/feature-two')).toBeNull()
  })

  it('prefers the deepest worktree when one is nested in another', () => {
    const nested: WorkspaceNode[] = [
      {
        id: 'ws1',
        path: 'ws1',
        displayName: 'WS One',
        repos: [
          {
            name: 'repo-a',
            path: '/repo-a',
            worktrees: [wt('/repo-a', true), wt('/repo-a/nested')]
          }
        ]
      }
    ]

    expect(worktreeIdForPath(nested, '/repo-a/nested/src')).toBe('/repo-a/nested')
  })

  it('returns null for a folder no worktree holds, and for no folder', () => {
    // The caller leaves the selection alone: there is nothing better to point
    // at than where the user already was.
    expect(worktreeIdForPath(tree, '/somewhere/else')).toBeNull()
    expect(worktreeIdForPath(tree, null)).toBeNull()
  })
})
