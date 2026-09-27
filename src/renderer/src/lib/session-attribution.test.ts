import { describe, expect, it } from 'vitest'
import type { WorkspaceNode } from '../../../shared/tree'
import { deriveAttribution } from './session-attribution'

const WT_TASK = { path: 'C:/code/Code-12345', branch: 'feature/12345-x' }
const WT_OTHER = { path: 'C:/code/Code-67890', branch: 'feature/67890-x' }
const WT_DEVELOP = { path: 'C:/code/playground', branch: 'develop' }
const DETACHED = 'C:/scratch/notes'

function tree(...worktrees: { path: string; branch: string }[]): WorkspaceNode[] {
  return [
    {
      id: 'c:/code',
      path: 'C:/code',
      displayName: 'code',
      repos: [
        {
          name: 'playground',
          path: 'C:/code/playground',
          worktrees: worktrees.map((w) => ({
            id: w.path,
            branch: w.branch,
            path: w.path,
            isDefault: false,
            dirty: false,
            changes: 0
          }))
        }
      ]
    }
  ]
}

const workspace = tree(WT_TASK, WT_OTHER, WT_DEVELOP)
const link = { id: 4821, title: 'Diagnose login loop' }

describe('deriveAttribution without a link (HTSK-10)', () => {
  it('takes the task from the worktree branch', () => {
    expect(deriveAttribution(workspace, WT_TASK.path)).toEqual({
      branch: 'feature/12345-x',
      taskId: 12345,
      detached: false,
      linked: false,
      linkTitle: null
    })
  })

  it('a null link reads like no link', () => {
    expect(deriveAttribution(workspace, WT_TASK.path, null)).toEqual({
      branch: 'feature/12345-x',
      taskId: 12345,
      detached: false,
      linked: false,
      linkTitle: null
    })
  })

  it('a cwd outside every worktree is detached with no task', () => {
    expect(deriveAttribution(workspace, DETACHED)).toEqual({
      branch: null,
      taskId: null,
      detached: true,
      linked: false,
      linkTitle: null
    })
  })
})

describe('deriveAttribution with a link: the link wins (HTSK-11, HTSK-18)', () => {
  it('a link on develop gives the linked task and its title', () => {
    expect(deriveAttribution(workspace, WT_DEVELOP.path, link)).toEqual({
      branch: 'develop',
      taskId: 4821,
      detached: false,
      linked: true,
      linkTitle: 'Diagnose login loop'
    })
  })

  it('a link on a detached cwd gives the linked task and stays detached', () => {
    expect(deriveAttribution(workspace, DETACHED, link)).toEqual({
      branch: null,
      taskId: 4821,
      detached: true,
      linked: true,
      linkTitle: 'Diagnose login loop'
    })
  })

  it("a link on another task's worktree gives the linked task and keeps the branch", () => {
    expect(deriveAttribution(workspace, WT_OTHER.path, link)).toEqual({
      branch: 'feature/67890-x',
      taskId: 4821,
      detached: false,
      linked: true,
      linkTitle: 'Diagnose login loop'
    })
  })

  it('a link with no title gives a null link title', () => {
    expect(deriveAttribution(workspace, WT_DEVELOP.path, { id: 4821, title: null })).toEqual({
      branch: 'develop',
      taskId: 4821,
      detached: false,
      linked: true,
      linkTitle: null
    })
  })
})
