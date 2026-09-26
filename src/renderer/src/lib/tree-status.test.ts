import { describe, expect, it } from 'vitest'
import type { ActivityState } from '../../../shared/config'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { patchWorktreeStatus, worktreeForTurnEnd } from './tree-status'

function wt(path: string, changes = 0): WorktreeNode {
  return { id: path, branch: path, path, isDefault: false, dirty: changes > 0, changes }
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
        worktrees: [wt('/repo-a/main', 5), wt('/repo-a/feat', 2)]
      },
      { name: 'repo-b', path: '/repo-b', worktrees: [wt('/repo-b/main')] }
    ]
  }
]

const worktree = (t: WorkspaceNode[], path: string): WorktreeNode | undefined =>
  t.flatMap((ws) => ws.repos.flatMap((r) => r.worktrees)).find((w) => w.path === path)

describe('patchWorktreeStatus', () => {
  it("replaces that worktree's count and leaves the others as they were (SCRF-01)", () => {
    const patched = patchWorktreeStatus(tree, '/repo-a/main', { dirty: true, changes: 1 })

    expect(worktree(patched, '/repo-a/main')).toMatchObject({ dirty: true, changes: 1 })
    expect(worktree(patched, '/repo-a/feat')).toBe(worktree(tree, '/repo-a/feat'))
    expect(worktree(patched, '/repo-b/main')).toBe(worktree(tree, '/repo-b/main'))
  })

  it('clears the dirty flag when the recount finds nothing (SCRF-01)', () => {
    const patched = patchWorktreeStatus(tree, '/repo-a/feat', { dirty: false, changes: 0 })

    expect(worktree(patched, '/repo-a/feat')).toMatchObject({ dirty: false, changes: 0 })
  })

  it('gives the tree a new identity even when the count is unchanged (SCRF-03)', () => {
    const patched = patchWorktreeStatus(tree, '/repo-a/main', { dirty: true, changes: 5 })

    expect(patched).not.toBe(tree)
    expect(patched).toEqual(tree)
  })

  it('returns the same tree for a worktree it no longer holds (removed-worktree edge case)', () => {
    expect(patchWorktreeStatus(tree, '/repo-a/gone', { dirty: true, changes: 3 })).toBe(tree)
  })
})

describe('worktreeForTurnEnd', () => {
  const others: Array<ActivityState | undefined> = [
    undefined,
    'needs-approval',
    'needs-input',
    'error',
    'compacting'
  ]

  it('names the worktree when a turn goes from working to waiting (SCRF-07)', () => {
    expect(worktreeForTurnEnd(tree, 'working', 'waiting', '/repo-a/feat')).toBe('/repo-a/feat')
  })

  it('names the worktree when the agent exits mid-turn (SCRF-07)', () => {
    expect(worktreeForTurnEnd(tree, 'working', 'exited', '/repo-a/feat')).toBe('/repo-a/feat')
  })

  it('recounts nothing for any other transition (SCRF-07)', () => {
    for (const after of others) {
      expect(worktreeForTurnEnd(tree, 'working', after, '/repo-a/feat')).toBeNull()
    }
    for (const before of [...others, 'waiting', 'exited'] as const) {
      expect(worktreeForTurnEnd(tree, before, 'waiting', '/repo-a/feat')).toBeNull()
      expect(worktreeForTurnEnd(tree, before, 'exited', '/repo-a/feat')).toBeNull()
    }
    expect(worktreeForTurnEnd(tree, 'waiting', 'working', '/repo-a/feat')).toBeNull()
  })

  it('resolves a cwd in a subfolder to the worktree holding it (SCRF-07)', () => {
    expect(worktreeForTurnEnd(tree, 'working', 'waiting', '/repo-a/feat/src/lib')).toBe(
      '/repo-a/feat'
    )
  })

  it('recounts nothing for a cwd outside every worktree (SCRF-08)', () => {
    expect(worktreeForTurnEnd(tree, 'working', 'waiting', '/elsewhere')).toBeNull()
  })
})
