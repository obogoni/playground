import { describe, expect, it } from 'vitest'
import type { RepoNode, WorkspaceNode, WorktreeNode } from '../../../shared/tree'
import { adoptBrowsed, cwdAfterLevelChange, initialLevel, levelOptions } from './session-levels'

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
  it('carries the task id of a primary checkout on a task branch, so a task card can highlight it', () => {
    const onTask: WorkspaceNode = {
      id: 'g:/t',
      path: 'G:/T',
      displayName: 't',
      repos: [repo('app', wt('G:/T/app', 'user/otavio/4821-fix-login', true))]
    }
    expect(levelOptions([onTask], 'repo')).toEqual([
      {
        level: 'repo',
        path: 'G:/T/app',
        repoName: 'app',
        branch: 'user/otavio/4821-fix-login',
        workspaceName: 't',
        taskId: 4821
      }
    ])
  })

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
        workspaceName: 'work',
        taskId: null
      },
      {
        level: 'repo',
        path: 'M:/Work/web',
        repoName: 'web',
        branch: 'develop',
        workspaceName: 'work',
        taskId: null
      },
      {
        level: 'repo',
        path: 'D:/Side/api',
        repoName: 'api',
        branch: 'trunk',
        workspaceName: 'side',
        taskId: null
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

describe('initialLevel (ISO-06)', () => {
  it('opens on Worktree without a source cwd (AC 5)', () => {
    expect(initialLevel(tree, undefined)).toBe('worktree')
  })

  it('opens on Worktree when the source cwd has no level (AC 5)', () => {
    expect(initialLevel(tree, 'C:/scratch/notes')).toBe('worktree')
  })

  it("opens on the source cwd's level (AC 6, Spawn from rows AC 2, 4, 7)", () => {
    expect(initialLevel(tree, 'M:/Work')).toBe('workspace')
    expect(initialLevel(tree, 'M:/Work/api')).toBe('repo')
    expect(initialLevel(tree, 'M:/Work/api-24173')).toBe('worktree')
  })

  it('derives the level from a source cwd spelled differently from the tree (AC 6)', () => {
    expect(initialLevel(tree, 'm:\\work\\')).toBe('workspace')
  })
})

describe('cwdAfterLevelChange (ISO-06)', () => {
  it("keeps the cwd when it is one of the new level's chips (AC 7)", () => {
    expect(cwdAfterLevelChange(tree, 'repo', 'M:/Work/api')).toBe('M:/Work/api')
  })

  it('clears a workspace cwd when switching to Repo (AC 7)', () => {
    expect(cwdAfterLevelChange(tree, 'repo', 'M:/Work')).toBeNull()
  })

  it('clears a primary checkout cwd when switching to Worktree (AC 7)', () => {
    expect(cwdAfterLevelChange(tree, 'worktree', 'M:/Work/api')).toBeNull()
  })

  it('clears a browsed folder with no level on any switch (AC 7)', () => {
    expect(cwdAfterLevelChange(tree, 'workspace', 'C:/scratch/notes')).toBeNull()
  })

  it('keeps nothing selected when nothing was (AC 7)', () => {
    expect(cwdAfterLevelChange(tree, 'workspace', null)).toBeNull()
  })
})

describe('adoptBrowsed (ISO-06)', () => {
  it("selects the level and the tree's spelling for a browsed folder with a level (AC 9)", () => {
    expect(adoptBrowsed(tree, 'm:\\work\\web')).toEqual({ level: 'repo', cwd: 'M:/Work/web' })
    expect(adoptBrowsed(tree, 'D:\\Side')).toEqual({ level: 'workspace', cwd: 'D:/Side' })
    expect(adoptBrowsed(tree, 'M:/Work/web-spike')).toEqual({
      level: 'worktree',
      cwd: 'M:/Work/web-spike'
    })
  })

  it('keeps a browsed folder with no level as browsed (AC 9, Edge Case "subfolder")', () => {
    expect(adoptBrowsed(tree, 'M:\\Work\\api\\src')).toEqual({
      level: null,
      cwd: 'M:\\Work\\api\\src'
    })
  })
})
