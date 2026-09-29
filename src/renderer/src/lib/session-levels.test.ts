import { describe, expect, it } from 'vitest'
import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { levelOptions } from './session-levels'

function wt(path: string, branch: string, isDefault: boolean): WorktreeNode {
  return { id: path, branch, path, isDefault, dirty: false, changes: 0 }
}

function repo(name: string, ...worktrees: WorktreeNode[]): RepoNode {
  return { name, path: worktrees[0]?.path ?? `X:/${name}`, worktrees }
}

/** Two workspaces each holding a repo called `api` (Edge Case "same repo name"),
 *  a missing workspace and a workspace with no repos. */
const WORK: WorkspaceNode = {
  id: 'm:/work',
  path: 'M:/Work',
  displayName: 'work',
  repos: [
    repo(
      'api',
      wt('M:/Work/api', 'main', true),
      wt('M:/Work/api-24173', 'user/otavio/24173-fix-login', false)
    ),
    repo('web', wt('M:/Work/web', 'develop', true), wt('M:/Work/web-spike', 'spike', false))
  ]
}
const SIDE: WorkspaceNode = {
  id: 'd:/side',
  path: 'D:/Side',
  displayName: 'side',
  repos: [repo('api', wt('D:/Side/api', 'trunk', true))]
}
const GONE: WorkspaceNode = {
  id: 'e:/gone',
  path: 'E:/Gone',
  displayName: 'gone',
  missing: true,
  repos: []
}
const EMPTY: WorkspaceNode = { id: 'f:/empty', path: 'F:/Empty', displayName: 'empty', repos: [] }

const tree = [WORK, SIDE, GONE, EMPTY]

describe('levelOptions (ISO-05)', () => {
  it('lists one chip per non-missing workspace with its name and path (AC 2)', () => {
    expect(levelOptions(tree, 'workspace')).toEqual([
      { level: 'workspace', path: 'M:/Work', workspaceName: 'work' },
      { level: 'workspace', path: 'D:/Side', workspaceName: 'side' },
      { level: 'workspace', path: 'F:/Empty', workspaceName: 'empty' }
    ])
  })

  it('lists one chip per primary checkout with repo name, branch and workspace (AC 3)', () => {
    expect(levelOptions(tree, 'repo')).toEqual([
      {
        level: 'repo',
        path: 'M:/Work/api',
        repoName: 'api',
        branch: 'main',
        workspaceName: 'work'
      },
      {
        level: 'repo',
        path: 'M:/Work/web',
        repoName: 'web',
        branch: 'develop',
        workspaceName: 'work'
      },
      {
        level: 'repo',
        path: 'D:/Side/api',
        repoName: 'api',
        branch: 'trunk',
        workspaceName: 'side'
      }
    ])
  })

  it('tells two same-named repos apart by their workspace (Edge Case "same repo name")', () => {
    const apis = levelOptions(tree, 'repo').filter(
      (o) => o.level === 'repo' && o.repoName === 'api'
    )

    expect(apis.map((o) => (o.level === 'repo' ? o.workspaceName : ''))).toEqual(['work', 'side'])
  })

  it('lists only linked worktrees, with branch, repo, workspace and task id (AC 4)', () => {
    expect(levelOptions(tree, 'worktree')).toEqual([
      {
        level: 'worktree',
        path: 'M:/Work/api-24173',
        branch: 'user/otavio/24173-fix-login',
        repoName: 'api',
        workspaceName: 'work',
        taskId: 24173
      },
      {
        level: 'worktree',
        path: 'M:/Work/web-spike',
        branch: 'spike',
        repoName: 'web',
        workspaceName: 'work',
        taskId: null
      }
    ])
  })

  it('returns no options at any level for an empty tree (AC 8)', () => {
    expect(levelOptions([], 'workspace')).toEqual([])
    expect(levelOptions([], 'repo')).toEqual([])
    expect(levelOptions([], 'worktree')).toEqual([])
  })
})
