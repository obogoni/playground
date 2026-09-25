import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './time-snapshot'

const base = {
  cwd: 'D:\\acme\\app-12345',
  gitCommonDir: 'D:/acme/app/.git',
  branch: 'feature/12345-fix-login-redirect',
  workspacePaths: ['D:\\acme'],
  pinnedTitles: new Map<number, string>()
}

describe('buildSnapshot', () => {
  it('attributes a worktree of a registered workspace to its workspace, repo, branch and task (TIME-03)', () => {
    expect(buildSnapshot(base)).toEqual({
      workspacePath: 'D:\\acme',
      repoName: 'app',
      branch: 'feature/12345-fix-login-redirect',
      taskId: 12345,
      taskTitle: null
    })
  })

  it('leaves the workspace null when the repo is not in a registered workspace', () => {
    expect(buildSnapshot({ ...base, workspacePaths: ['D:\\contoso'] })).toMatchObject({
      workspacePath: null,
      repoName: 'app',
      taskId: 12345
    })
  })

  it('matches the workspace path case-insensitively', () => {
    expect(buildSnapshot({ ...base, workspacePaths: ['d:\\ACME'] }).workspacePath).toBe('d:\\ACME')
  })

  it('records a detached HEAD as null branch and null task', () => {
    expect(buildSnapshot({ ...base, branch: 'HEAD' })).toMatchObject({
      repoName: 'app',
      branch: null,
      taskId: null,
      taskTitle: null
    })
  })

  it('records a branch without an id with a null task', () => {
    expect(buildSnapshot({ ...base, branch: 'main' })).toMatchObject({
      branch: 'main',
      taskId: null,
      taskTitle: null
    })
  })

  it('takes the pinned task title when the task is pinned with cached details (TIME-03)', () => {
    const pinnedTitles = new Map([
      [12345, 'Fix login redirect'],
      [4821, 'Other task']
    ])
    expect(buildSnapshot({ ...base, pinnedTitles }).taskTitle).toBe('Fix login redirect')
  })

  it('records all nulls when git could not be read (TIME-12)', () => {
    expect(buildSnapshot({ ...base, gitCommonDir: null, branch: null })).toEqual({
      workspacePath: null,
      repoName: null,
      branch: null,
      taskId: null,
      taskTitle: null
    })
  })
})
