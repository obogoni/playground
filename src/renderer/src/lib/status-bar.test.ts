import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import type { WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import type { SyncState } from '../../../shared/git'
import { barTargetFor, fetchAgeLabel, splitBranch, syncSectionFor } from './status-bar'

function wt(path: string, branch: string, isDefault = false): WorktreeNode {
  return { id: path, branch, path, isDefault, dirty: false, changes: 0 }
}

function session(id: string, cwd: string): SessionView {
  return { id, agent: 'Ad-hoc', cwd, title: id, status: 'running', pathMissing: false }
}

const tree: WorkspaceNode[] = [
  {
    id: 'c:/work/acme',
    path: 'C:/work/acme',
    displayName: 'Acme',
    repos: [
      {
        name: 'widget',
        path: 'C:/work/acme/widget',
        worktrees: [
          wt('C:/work/acme/widget', 'main', true),
          wt('C:/work/acme/widget-12345', 'user/dev/4821-fix-login/12345-endpoint')
        ]
      }
    ]
  }
]

const sessions = [session('s-wt', 'C:/work/acme/widget-12345'), session('s-adhoc', 'C:/Windows')]

describe('barTargetFor', () => {
  it("describes the selected session's worktree in Agents, not the tree selection (STBR-03)", () => {
    const target = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: 's-wt'
    })
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.repoName).toBe('widget')
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget-12345')
    expect(target.selected.worktree.branch).toBe('user/dev/4821-fix-login/12345-endpoint')
  })

  it("returns the folder target carrying the path when the session's cwd is no worktree (STBR-04)", () => {
    const target = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: 's-adhoc'
    })
    expect(target).toEqual({ kind: 'folder', path: 'C:/Windows' })
  })

  const agentsTargetFor = (cwd: string, worktrees = tree): ReturnType<typeof barTargetFor> =>
    barTargetFor({
      direction: 'agents',
      tree: worktrees,
      selectedId: null,
      sessions: [session('s', cwd)],
      selectedSessionId: 's'
    })

  it("describes the worktree when the session's cwd is a folder inside it (STBR-04)", () => {
    const target = agentsTargetFor('C:/work/acme/widget-12345/src/main')
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget-12345')
  })

  it('matches a cwd written with backslashes, another drive-letter case and a trailing slash', () => {
    const target = agentsTargetFor('c:\\work\\acme\\widget-12345\\src\\')
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget-12345')
  })

  it('does not treat a sibling folder sharing a name prefix as inside the worktree', () => {
    expect(agentsTargetFor('C:/work/acme/widget-123456')).toEqual({
      kind: 'folder',
      path: 'C:/work/acme/widget-123456'
    })
  })

  it('describes the deepest worktree when worktrees nest', () => {
    const nested: WorkspaceNode[] = [
      {
        ...tree[0],
        repos: [
          {
            ...tree[0].repos[0],
            worktrees: [
              wt('C:/work/acme/widget', 'main', true),
              wt('C:/work/acme/widget/.worktrees/12345', 'user/dev/4821-fix-login/12345-endpoint')
            ]
          }
        ]
      }
    ]
    const target = agentsTargetFor('C:/work/acme/widget/.worktrees/12345/src', nested)
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget/.worktrees/12345')
  })

  it('returns the tree-selected worktree in every other direction, ignoring the session (STBR-02)', () => {
    for (const direction of ['tree', 'board', 'workflows'] as const) {
      const target = barTargetFor({
        direction,
        tree,
        selectedId: 'C:/work/acme/widget',
        sessions,
        selectedSessionId: 's-wt'
      })
      expect(target.kind, direction).toBe('worktree')
      if (target.kind !== 'worktree') return
      expect(target.selected.worktree.path, direction).toBe('C:/work/acme/widget')
      expect(target.selected.repoName, direction).toBe('widget')
    }
  })

  it('returns the none target when nothing is selected anywhere (STBR-05)', () => {
    for (const direction of ['tree', 'board', 'agents', 'workflows'] as const) {
      const target = barTargetFor({
        direction,
        tree,
        selectedId: null,
        sessions,
        selectedSessionId: null
      })
      expect(target, direction).toEqual({ kind: 'none' })
    }
  })

  it('falls back to the tree selection in Agents when no session is selected', () => {
    const target = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: null
    })
    expect(target.kind).toBe('worktree')
    if (target.kind !== 'worktree') return
    expect(target.selected.worktree.path).toBe('C:/work/acme/widget')
  })

  it('treats a session id that no longer exists as no session selected', () => {
    const withSelection = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: 'C:/work/acme/widget',
      sessions,
      selectedSessionId: 's-gone'
    })
    expect(withSelection.kind).toBe('worktree')
    if (withSelection.kind !== 'worktree') return
    expect(withSelection.selected.worktree.path).toBe('C:/work/acme/widget')

    const withoutSelection = barTargetFor({
      direction: 'agents',
      tree,
      selectedId: null,
      sessions,
      selectedSessionId: 's-gone'
    })
    expect(withoutSelection).toEqual({ kind: 'none' })
  })
})

describe('splitBranch', () => {
  it('splits an even-length name into two equal halves (STBR-06)', () => {
    expect(splitBranch('user/dev/4821-fix-login/12345-endpoint')).toEqual({
      head: 'user/dev/4821-fix-l',
      tail: 'ogin/12345-endpoint'
    })
  })

  it('gives the extra character of an odd-length name to the head', () => {
    expect(splitBranch('widget')).toEqual({ head: 'wid', tail: 'get' })
    expect(splitBranch('widgets')).toEqual({ head: 'widg', tail: 'ets' })
  })

  it('loses no character, whatever the length', () => {
    for (const branch of ['', 'm', 'main', '(detached abc1234)', 'user/dev/12345-endpoint']) {
      const { head, tail } = splitBranch(branch)
      expect(head + tail).toBe(branch)
      expect(head.length - tail.length).toBeGreaterThanOrEqual(0)
      expect(head.length - tail.length).toBeLessThanOrEqual(1)
    }
  })
})

describe('syncSectionFor', () => {
  const tracking: SyncState = {
    branch: 'user/dev/4821-fix-login/12345-endpoint',
    upstream: 'origin/user/dev/4821-fix-login/12345-endpoint',
    behind: 2,
    ahead: 1,
    remotes: ['origin'],
    lastFetchAt: 1_700_000_000_000
  }

  it('carries both counts while the branch has an upstream (STBR-09)', () => {
    expect(syncSectionFor(tracking)).toEqual({ kind: 'counts', behind: 2, ahead: 1 })
  })

  it('carries 0 / 0 when the branch is in sync (STBR-09)', () => {
    expect(syncSectionFor({ ...tracking, behind: 0, ahead: 0 })).toEqual({
      kind: 'counts',
      behind: 0,
      ahead: 0
    })
  })

  it('reads no-upstream when a remote exists, carrying the remotes Publish offers (STBR-12)', () => {
    const state: SyncState = { ...tracking, upstream: null, behind: 0, ahead: 0 }
    expect(syncSectionFor({ ...state, remotes: ['origin', 'fork'] })).toEqual({
      kind: 'no-upstream',
      remotes: ['origin', 'fork']
    })
  })

  it('reads no-remote only when the repository has no remote (STBR-13)', () => {
    const state: SyncState = { ...tracking, upstream: null, behind: 0, ahead: 0, remotes: [] }
    expect(syncSectionFor(state)).toEqual({ kind: 'no-remote' })
  })

  it('ranks detached above no-upstream (STBR-08, STBR-13)', () => {
    const state: SyncState = {
      branch: null,
      detachedSha: 'abc1234',
      upstream: null,
      behind: 0,
      ahead: 0,
      remotes: ['origin'],
      lastFetchAt: null
    }
    expect(syncSectionFor(state)).toEqual({ kind: 'detached', sha: 'abc1234' })
  })

  it('lets an error win over every other case, so no stale counts show (STBR-14)', () => {
    const error = "fatal: ambiguous argument '@{upstream}': unknown revision"
    expect(syncSectionFor({ ...tracking, error })).toEqual({ kind: 'error', message: error })
    expect(
      syncSectionFor({ ...tracking, branch: null, detachedSha: 'abc1234', remotes: [], error })
    ).toEqual({ kind: 'error', message: error })
  })
})

describe('fetchAgeLabel', () => {
  const NOW = 1_700_000_000_000

  it('reads never when the repo has never fetched (STBR-22)', () => {
    expect(fetchAgeLabel(null, NOW)).toBe('never')
  })

  it('reads the relative time of the last fetch (STBR-22)', () => {
    expect(fetchAgeLabel(NOW - 5 * 60_000, NOW)).toBe('5m ago')
    expect(fetchAgeLabel(NOW - 3 * 86_400_000, NOW)).toBe('3d ago')
  })

  it('reads just now for a timestamp in the future, never a negative', () => {
    expect(fetchAgeLabel(NOW + 10 * 60_000, NOW)).toBe('just now')
  })
})
