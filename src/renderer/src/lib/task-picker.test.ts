import { describe, expect, it } from 'vitest'
import type { PinnedTaskView, WorkItemDetails } from '../../../shared/tasks'
import { lookupEntry, pickerEntries } from './task-picker'

function pin(id: number, details: WorkItemDetails | null, org = 'acme'): PinnedTaskView {
  return {
    id,
    org,
    project: 'platform',
    url: `https://dev.azure.com/${org}/platform/_workitems/edit/${id}`,
    details
  }
}

const story: WorkItemDetails = { title: 'Fix login redirect', type: 'User Story', state: 'Active' }
const childTask: WorkItemDetails = {
  title: 'Add the redirect test',
  type: 'Task',
  state: 'New',
  parentType: 'Bug'
}

describe('pickerEntries: which choices each picker offers (HTSK-01, HTSK-18, HTSK-24)', () => {
  const tasks = [pin(9201, story), pin(9202, null)]

  it('offers a session From branch then the pins, with no No task', () => {
    const entries = pickerEntries(tasks, { fromBranch: true, noTask: false })

    expect(entries.map((e) => e.label)).toEqual(['From branch', '#9201', '#9202'])
    expect(entries.some((e) => e.choice.kind === 'none')).toBe(false)
  })

  it('offers the drawer No task, From branch, then the pins', () => {
    const entries = pickerEntries(tasks, { fromBranch: true, noTask: true })

    expect(entries.map((e) => e.label)).toEqual(['No task', 'From branch', '#9201', '#9202'])
  })

  it('From branch chooses the branch and No task chooses none', () => {
    const [none, branch] = pickerEntries([], { fromBranch: true, noTask: true })

    expect(none.choice).toEqual({ kind: 'none' })
    expect(branch.choice).toEqual({ kind: 'branch' })
    expect(none.badgeType).toBeNull()
    expect(none.title).toBeNull()
    expect(branch.badgeType).toBeNull()
    expect(branch.title).toBeNull()
  })
})

describe('pickerEntries: pinned task rows (HTSK-01, HTSK-06)', () => {
  it('shows a pin with details as #id, its badge type and its title, and chooses both', () => {
    const [entry] = pickerEntries([pin(9201, story)], { fromBranch: false, noTask: false })

    expect(entry.label).toBe('#9201')
    expect(entry.badgeType).toBe('User Story')
    expect(entry.title).toBe('Fix login redirect')
    expect(entry.choice).toEqual({ kind: 'task', id: 9201, title: 'Fix login redirect' })
  })

  it("shows a Task pin with its parent's type on the badge", () => {
    const [entry] = pickerEntries([pin(9203, childTask)], { fromBranch: false, noTask: false })

    expect(entry.badgeType).toBe('Bug')
  })

  it('shows a pin without details as #id alone and chooses a null title', () => {
    const [entry] = pickerEntries([pin(9201, null)], { fromBranch: false, noTask: false })

    expect(entry.label).toBe('#9201')
    expect(entry.badgeType).toBeNull()
    expect(entry.title).toBeNull()
    expect(entry.choice).toEqual({ kind: 'task', id: 9201, title: null })
  })

  it('keeps only the first pin of a repeated id', () => {
    const entries = pickerEntries(
      [pin(9201, story, 'acme'), pin(9202, null), pin(9201, childTask, 'contoso')],
      { fromBranch: false, noTask: false }
    )

    expect(entries.map((e) => e.label)).toEqual(['#9201', '#9202'])
    expect(entries[0].title).toBe('Fix login redirect')
  })
})

describe('lookupEntry: the looked-up row (HTSK-02, HTSK-06)', () => {
  it('reads {type} #{id} {title} and chooses the id and the title', () => {
    const entry = lookupEntry({ id: 4821, type: 'User Story', title: 'Diagnose login loop' })

    expect(entry.text).toBe('User Story #4821 Diagnose login loop')
    expect(entry.choice).toEqual({ kind: 'task', id: 4821, title: 'Diagnose login loop' })
  })
})
