import { describe, expect, it } from 'vitest'
import { badgeTypeOf, typeClass } from './task-pills'

describe('typeClass', () => {
  it('maps each ADO process type to its tp-* class (TYPE-01)', () => {
    expect(typeClass('Bug')).toBe('tp-bug')
    expect(typeClass('Task')).toBe('tp-task')
    expect(typeClass('User Story')).toBe('tp-user-story')
    expect(typeClass('Feature')).toBe('tp-feature')
    expect(typeClass('Epic')).toBe('tp-epic')
    expect(typeClass('Issue')).toBe('tp-issue')
    expect(typeClass('Code Review Request')).toBe('tp-code-review')
    expect(typeClass('Code Review Response')).toBe('tp-code-review')
    expect(typeClass('Fault')).toBe('tp-fault')
    expect(typeClass('Initiative')).toBe('tp-initiative')
    expect(typeClass('Request')).toBe('tp-request')
    expect(typeClass('Test Case')).toBe('tp-test-case')
    expect(typeClass('Test Plan')).toBe('tp-test-plan')
    expect(typeClass('Test Suite')).toBe('tp-test-suite')
    expect(typeClass('Feedback Request')).toBe('tp-feedback')
    expect(typeClass('Feedback Response')).toBe('tp-feedback')
    expect(typeClass('Shared Steps')).toBe('tp-shared-steps')
    expect(typeClass('Shared Parameter')).toBe('tp-shared-parameter')
  })

  it('falls back to muted for types the process does not define (TYPE-02, TYPE-06)', () => {
    expect(typeClass('Product Backlog Item')).toBe('muted')
    expect(typeClass('Impediment')).toBe('muted')
    expect(typeClass('Chore')).toBe('muted')
    expect(typeClass('Requirement')).toBe('muted')
  })

  it('matches types case-insensitively and trim-safe (TYPE-03)', () => {
    expect(typeClass('user story')).toBe('tp-user-story')
    expect(typeClass('USER STORY')).toBe('tp-user-story')
    expect(typeClass('  User Story  ')).toBe('tp-user-story')
    expect(typeClass('BUG')).toBe('tp-bug')
  })

  it('renders empty and whitespace types neutral (TYPE-05)', () => {
    expect(typeClass('')).toBe('muted')
    expect(typeClass('   ')).toBe('muted')
  })
})

describe('badgeTypeOf', () => {
  it('prefers a resolved parentType over the item own type (BPTK-01)', () => {
    expect(
      badgeTypeOf({
        title: 'Task under a Fault',
        type: 'Task',
        state: 'Active',
        parentType: 'Fault'
      })
    ).toBe('Fault')
  })

  it('keeps the item own type when parentType is null (resolution failed)', () => {
    expect(badgeTypeOf({ title: 'Task', type: 'Task', state: 'Active', parentType: null })).toBe(
      'Task'
    )
  })

  it('keeps the item own type when parentType is absent (non-Task pins)', () => {
    expect(badgeTypeOf({ title: 'A Bug', type: 'Bug', state: 'Active' })).toBe('Bug')
  })
})
