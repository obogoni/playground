import { describe, expect, it } from 'vitest'
import type { PinnedTaskView } from '../../../shared/tasks'
import {
  carryValues,
  formBlockers,
  prefillValues,
  promptContext,
  resolveForm,
  type PromptContext
} from './prompt-form'
import type { LevelOption } from './session-levels'

const pin = (id: number, title: string | null): PinnedTaskView => ({
  id,
  org: 'org',
  project: 'proj',
  url: `https://dev.azure.com/org/proj/_workitems/edit/${id}`,
  details: title === null ? null : { title, type: 'Task', state: 'Active' }
})

const worktreeChip: LevelOption = {
  level: 'worktree',
  path: 'C:\\src\\app-123',
  branch: 'user/otavio/123-fix-login',
  repoName: 'app',
  workspaceName: 'ws',
  taskId: 123
}
const repoChip: LevelOption = {
  level: 'repo',
  path: 'C:\\src\\app',
  branch: 'main',
  repoName: 'app',
  workspaceName: 'ws',
  taskId: null
}
const workspaceChip: LevelOption = { level: 'workspace', path: 'C:\\src', workspaceName: 'ws' }

describe('promptContext', () => {
  it('takes branch from the chosen chip and worktree from the cwd (APR-19)', () => {
    const ctx = promptContext(null, repoChip, 'C:\\src\\app', [])
    expect(ctx.branch).toBe('main')
    expect(ctx.worktree).toBe('C:\\src\\app')
  })

  it('takes the hand-picked task id and title over the branch-derived one (APR-20)', () => {
    const ctx = promptContext({ id: 77, title: 'Picked' }, worktreeChip, worktreeChip.path, [
      pin(123, 'From pin')
    ])
    expect(ctx.taskId).toBe(77)
    expect(ctx.taskTitle).toBe('Picked')
  })

  it('falls back to the pin title when the hand-picked task has none (APR-20)', () => {
    const ctx = promptContext({ id: 77, title: null }, worktreeChip, worktreeChip.path, [
      pin(77, 'Cached title')
    ])
    expect(ctx.taskTitle).toBe('Cached title')
  })

  it('under From branch uses the chip-derived id and that pin title (APR-20)', () => {
    const ctx = promptContext(null, worktreeChip, worktreeChip.path, [
      pin(9, 'Other'),
      pin(123, 'Fix login')
    ])
    expect(ctx).toEqual({
      taskId: 123,
      taskTitle: 'Fix login',
      branch: 'user/otavio/123-fix-login',
      worktree: 'C:\\src\\app-123'
    })
  })

  it('knows no task, title or branch for a detached browsed folder (APR-21)', () => {
    expect(promptContext(null, null, 'D:\\elsewhere', [pin(123, 'Fix login')])).toEqual({
      taskId: null,
      taskTitle: null,
      branch: null,
      worktree: 'D:\\elsewhere'
    })
  })

  it('knows no branch or task at workspace level (APR-21)', () => {
    const ctx = promptContext(null, workspaceChip, 'C:\\src', [])
    expect(ctx.branch).toBeNull()
    expect(ctx.taskId).toBeNull()
  })

  it('has no title for a task with no cached details (APR-21)', () => {
    const ctx = promptContext(null, worktreeChip, worktreeChip.path, [pin(123, null)])
    expect(ctx.taskId).toBe(123)
    expect(ctx.taskTitle).toBeNull()
  })
})

const full: PromptContext = {
  taskId: 123,
  taskTitle: 'Fix login',
  branch: 'user/otavio/123-fix-login',
  worktree: 'C:\\src\\app-123'
}
const empty: PromptContext = { taskId: null, taskTitle: null, branch: null, worktree: 'D:\\x' }

describe('prefillValues', () => {
  it('fills the four context names from the context (APR-19, APR-20)', () => {
    expect(prefillValues(['worktree', 'taskTitle', 'branch', 'taskId'], full)).toEqual({
      worktree: 'C:\\src\\app-123',
      taskTitle: 'Fix login',
      branch: 'user/otavio/123-fix-login',
      taskId: '123'
    })
  })

  it('starts unknown context names empty (APR-21)', () => {
    expect(prefillValues(['taskId', 'taskTitle', 'branch'], empty)).toEqual({
      taskId: '',
      taskTitle: '',
      branch: ''
    })
  })

  it('starts any other name empty, case-sensitively (APR-22)', () => {
    expect(prefillValues(['goal', 'Branch'], full)).toEqual({ goal: '', Branch: '' })
  })
})

describe('carryValues', () => {
  it('restores the typed values when Next is pressed again on the same prompt (APR-27)', () => {
    const typed = { branch: 'edited-branch', goal: 'ship it' }
    expect(carryValues(typed, ['branch', 'goal'], full)).toEqual(typed)
  })

  it('keeps shared names, prefills new ones and drops absent ones on a prompt switch (APR-28)', () => {
    const typed = { goal: 'ship it', branch: 'edited-branch', notes: 'old' }
    expect(carryValues(typed, ['goal', 'taskId', 'scope'], full)).toEqual({
      goal: 'ship it',
      taskId: '123',
      scope: ''
    })
  })
})

describe('formBlockers', () => {
  it('lists every field empty after trimming, in field order (APR-23)', () => {
    const values = { a: 'x', b: '   ', c: '', d: ' y ' }
    expect(formBlockers(values, ['d', 'c', 'b', 'a'], 'text')).toEqual({
      emptyFields: ['c', 'b'],
      tooLong: null
    })
  })

  it('has no blockers when every field has text and the prompt fits (APR-23)', () => {
    expect(formBlockers({ a: 'x' }, ['a'], 'resolved')).toEqual({ emptyFields: [], tooLong: null })
  })

  it('reports the length of a resolved prompt over 8000 characters (APR-26)', () => {
    expect(formBlockers({}, [], 'a'.repeat(8001)).tooLong).toBe(8001)
  })

  it('does not block a resolved prompt of exactly 8000 characters (APR-26)', () => {
    expect(formBlockers({}, [], 'a'.repeat(8000)).tooLong).toBeNull()
  })
})

describe('resolveForm', () => {
  it('trims each value before substituting it and keeps inner whitespace (APR-37)', () => {
    expect(
      resolveForm('Review {{branch}} for #{{taskId}}: {{note}}.', {
        branch: '  feature/x \t',
        taskId: ' 42 ',
        note: '  two  words  '
      })
    ).toBe('Review feature/x for #42: two  words.')
  })
})
