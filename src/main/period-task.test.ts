import { describe, expect, it } from 'vitest'
import type { PeriodSnapshotFields, TimePeriod } from '../shared/time'
import { reassignFields, withSessionTask } from './period-task'

const pinned = new Map<number, string>([
  [12345, 'Fix login redirect'],
  [67890, 'Widget export']
])
const pinnedTitle = (id: number): string | null => pinned.get(id) ?? null

function snapshot(branch: string | null, taskId: number | null): PeriodSnapshotFields {
  return {
    workspacePath: 'D:\\acme',
    repoName: 'app',
    branch,
    taskId,
    taskTitle: taskId === null ? null : pinnedTitle(taskId)
  }
}

function period(branch: string | null, taskId: number | null): TimePeriod {
  return {
    id: 'p1',
    sessionId: 's1',
    agent: 'Claude',
    cwd: 'D:\\acme\\app',
    ...snapshot(branch, taskId),
    start: '2026-09-16T09:00:00.000Z',
    end: '2026-09-16T12:00:00.000Z'
  }
}

describe('withSessionTask', () => {
  it('returns the branch snapshot unchanged when the session has no link (HTSK-10)', () => {
    const branchSnapshot = snapshot('feature/67890-x', 67890)

    const fields = withSessionTask(branchSnapshot, null, pinnedTitle)

    expect(fields).toEqual(snapshot('feature/67890-x', 67890))
    expect('taskByHand' in fields).toBe(false)
  })

  it('records the linked task over another task branch, with the flag (HTSK-11, HTSK-36)', () => {
    const fields = withSessionTask(
      snapshot('feature/67890-x', 67890),
      { id: 12345, title: 'Linked title' },
      pinnedTitle
    )

    expect(fields).toEqual({
      ...snapshot('feature/67890-x', 67890),
      taskId: 12345,
      taskTitle: 'Linked title',
      taskByHand: true
    })
  })

  it('takes the pinned title when the link has none, and null when nothing is pinned (HTSK-06)', () => {
    const pinnedCase = withSessionTask(
      snapshot('develop', null),
      { id: 12345, title: null },
      pinnedTitle
    )
    const unknownCase = withSessionTask(
      snapshot('develop', null),
      { id: 555, title: null },
      pinnedTitle
    )

    expect(pinnedCase.taskTitle).toBe('Fix login redirect')
    expect(unknownCase.taskId).toBe(555)
    expect(unknownCase.taskTitle).toBeNull()
  })

  it('records no flag when the link names the task the branch already names (HTSK-37)', () => {
    const fields = withSessionTask(
      snapshot('feature/12345-fix-login-redirect', 12345),
      { id: 12345, title: 'Another title' },
      pinnedTitle
    )

    expect(fields).toEqual(snapshot('feature/12345-fix-login-redirect', 12345))
    expect('taskByHand' in fields).toBe(false)
  })

  it('flags a link recorded outside a git folder, where the branch is null (HTSK-36)', () => {
    const fields = withSessionTask(snapshot(null, null), { id: 12345, title: null }, pinnedTitle)

    expect(fields).toEqual({
      ...snapshot(null, null),
      taskId: 12345,
      taskTitle: 'Fix login redirect',
      taskByHand: true
    })
  })
})

describe('reassignFields', () => {
  it('records a task that differs from the branch with the flag (HTSK-25, HTSK-36)', () => {
    expect(
      reassignFields(
        period('feature/67890-x', 67890),
        { kind: 'task', id: 12345, title: 'Chosen title' },
        pinnedTitle
      )
    ).toEqual({ taskId: 12345, taskTitle: 'Chosen title', taskByHand: true })
  })

  it('takes the pinned title when the chosen task has none (HTSK-06, HTSK-25)', () => {
    expect(
      reassignFields(period('develop', null), { kind: 'task', id: 12345, title: null }, pinnedTitle)
    ).toEqual({ taskId: 12345, taskTitle: 'Fix login redirect', taskByHand: true })
  })

  it("records the branch's own task with no flag key (HTSK-37)", () => {
    const fields = reassignFields(
      { ...period('feature/67890-x', null), taskByHand: true },
      { kind: 'task', id: 67890, title: 'Widget export' },
      pinnedTitle
    )

    expect(fields).toEqual({ taskId: 67890, taskTitle: 'Widget export' })
    expect('taskByHand' in fields).toBe(false)
  })

  it('records No task with the flag on a task branch and without it on develop (HTSK-26, HTSK-36, HTSK-37)', () => {
    const onTaskBranch = reassignFields(
      period('feature/67890-x', 67890),
      { kind: 'none' },
      pinnedTitle
    )
    const onDevelop = reassignFields(period('develop', 12345), { kind: 'none' }, pinnedTitle)

    expect(onTaskBranch).toEqual({ taskId: null, taskTitle: null, taskByHand: true })
    expect(onDevelop).toEqual({ taskId: null, taskTitle: null })
    expect('taskByHand' in onDevelop).toBe(false)
  })

  it("restores the branch's task and pinned title with no flag key for From branch (HTSK-27, HTSK-37)", () => {
    const fields = reassignFields(
      { ...period('feature/67890-x', 12345), taskTitle: 'Fix login redirect', taskByHand: true },
      { kind: 'branch' },
      pinnedTitle
    )

    expect(fields).toEqual({ taskId: 67890, taskTitle: 'Widget export' })
    expect('taskByHand' in fields).toBe(false)
  })

  it('restores null / null for From branch on a period with no branch (HTSK-27)', () => {
    const fields = reassignFields(
      { ...period(null, 12345), taskByHand: true },
      { kind: 'branch' },
      pinnedTitle
    )

    expect(fields).toEqual({ taskId: null, taskTitle: null })
    expect('taskByHand' in fields).toBe(false)
  })
})
