import { describe, expect, it } from 'vitest'
import { branchNameFor, taskIdFromBranch } from './tasks'

const task = (id: number, type: string, title: string): Parameters<typeof branchNameFor>[0] => ({
  id,
  details: { title, type, state: 'Active' }
})

describe('branchNameFor', () => {
  it('renders the default template for a Feature', () => {
    expect(branchNameFor(task(4821, 'Feature', 'Add OAuth refresh-token rotation!'), null)).toBe(
      'feature/4821-add-oauth-refresh-token-rotation'
    )
  })

  it('maps Bug to bugfix and every other type to feature', () => {
    expect(branchNameFor(task(7, 'Bug', 'Fix login'), null)).toBe('bugfix/7-fix-login')
    expect(branchNameFor(task(7, 'bug', 'Fix login'), null)).toBe('bugfix/7-fix-login')
    expect(branchNameFor(task(7, 'User Story', 'Fix login'), null)).toBe('feature/7-fix-login')
    expect(branchNameFor(task(7, 'Task', 'Fix login'), null)).toBe('feature/7-fix-login')
  })

  it('slugifies: lowercases, collapses non-alphanumeric runs, trims ends', () => {
    expect(branchNameFor(task(1, 'Task', '  Update   API & docs (v2)  '), null)).toBe(
      'feature/1-update-api-docs-v2'
    )
    expect(branchNameFor(task(1, 'Task', 'Configuração de ambiente'), null)).toBe(
      'feature/1-configura-o-de-ambiente'
    )
  })

  it('trims dangling separators when the slug is empty', () => {
    expect(branchNameFor(task(4821, 'Task', '!!!'), null)).toBe('feature/4821')
    expect(branchNameFor(task(4821, 'Task', ''), null)).toBe('feature/4821')
  })

  it('drops path segments the empty slug leaves behind', () => {
    expect(branchNameFor(task(9, 'Task', '???'), '{type}/{slug}/{id}')).toBe('feature/9')
  })

  it('falls back to the default template when blank or null', () => {
    expect(branchNameFor(task(5, 'Bug', 'Crash'), '')).toBe('bugfix/5-crash')
    expect(branchNameFor(task(5, 'Bug', 'Crash'), '   ')).toBe('bugfix/5-crash')
  })

  it('renders a custom template', () => {
    expect(branchNameFor(task(42, 'Bug', 'Crash on save'), 'task/{id}')).toBe('task/42')
    expect(branchNameFor(task(42, 'Bug', 'Crash on save'), '{id}-{slug}')).toBe('42-crash-on-save')
  })

  it('passes unknown placeholders through literally', () => {
    expect(branchNameFor(task(3, 'Task', 'Thing'), '{user}/{id}-{slug}')).toBe('{user}/3-thing')
  })

  it('renders {dev} from the devAlias context (TEMPLATE-01)', () => {
    expect(
      branchNameFor(task(10002, 'Task', 'Nested branch'), 'user/{dev}/{id}-{slug}', {
        devAlias: 'jdoe'
      })
    ).toBe('user/jdoe/10002-nested-branch')
  })

  it('renders {usId}/{usSlug} from the parent context (TEMPLATE-02)', () => {
    expect(
      branchNameFor(
        task(10002, 'Task', 'Nested branch'),
        'user/{dev}/{usId}-{usSlug}/{id}-{slug}',
        {
          devAlias: 'jdoe',
          parent: { id: 10001, title: 'User story' }
        }
      )
    ).toBe('user/jdoe/10001-user-story/10002-nested-branch')
  })

  it('renders the full nested format and slugifies the US title (TEMPLATE-03)', () => {
    expect(
      branchNameFor(
        task(10002, 'Task', 'Nested branch'),
        'user/{dev}/{usId}-{usSlug}/{id}-{slug}',
        {
          devAlias: 'jdoe',
          parent: { id: 10001, title: 'Configuração de ambiente' }
        }
      )
    ).toBe('user/jdoe/10001-configura-o-de-ambiente/10002-nested-branch')
  })

  it('drops empty parent/alias segments (TEMPLATE-04)', () => {
    const task10002 = task(10002, 'Task', 'Nested branch')
    const nested = 'user/{dev}/{usId}-{usSlug}/{id}-{slug}'
    expect(branchNameFor(task10002, nested, { devAlias: 'jdoe' })).toBe(
      'user/jdoe/10002-nested-branch'
    )
    expect(
      branchNameFor(task10002, nested, {
        parent: { id: 10001, title: 'User story' }
      })
    ).toBe('user/10001-user-story/10002-nested-branch')
    expect(branchNameFor(task10002, 'user/{dev}/{id}-{slug}', { devAlias: '   ' })).toBe(
      'user/10002-nested-branch'
    )
  })

  it('keeps legacy templates byte-identical with context present (TEMPLATE-05)', () => {
    const ctx = { devAlias: 'jdoe', parent: { id: 10001, title: 'User story' } }
    expect(
      branchNameFor(task(4821, 'Feature', 'Add OAuth refresh-token rotation!'), null, ctx)
    ).toBe('feature/4821-add-oauth-refresh-token-rotation')
    expect(branchNameFor(task(42, 'Bug', 'Crash on save'), 'task/{id}', ctx)).toBe('task/42')
  })

  it('still passes unknown placeholders through literally with context (TEMPLATE-06)', () => {
    expect(
      branchNameFor(task(3, 'Task', 'Thing'), '{user}/{id}-{slug}', {
        devAlias: 'jdoe',
        parent: { id: 7, title: 'Story' }
      })
    ).toBe('{user}/3-thing')
  })
})

describe('taskIdFromBranch', () => {
  it('extracts the ID from a templated branch', () => {
    expect(taskIdFromBranch('feature/4821-add-oauth-refresh-token-rotation')).toBe(4821)
    expect(taskIdFromBranch('bugfix/12-fix-login')).toBe(12)
  })

  it('takes the first standalone number within the last segment (BRANCH-04)', () => {
    expect(taskIdFromBranch('feature/123-fix-456')).toBe(123)
  })

  it('extracts the leaf task id from the nested user format (BRANCH-01)', () => {
    expect(
      taskIdFromBranch('user/jdoe/10001-user-story/10002-nested-branch')
    ).toBe(10002)
  })

  it('tags a parent-only nested branch with its last-segment number (edge case)', () => {
    expect(taskIdFromBranch('user/jdoe/10001-user-story')).toBe(10001)
  })

  it('returns null when the last segment has no number (BRANCH-05)', () => {
    expect(taskIdFromBranch('user/jdoe/user-story')).toBeNull()
  })

  it('tolerates trailing slashes by reading the last non-empty segment', () => {
    expect(taskIdFromBranch('feature/4821/')).toBe(4821)
  })

  it('works for hand-typed names with extra segments', () => {
    expect(taskIdFromBranch('user/otavio/4821-quick-spike')).toBe(4821)
    expect(taskIdFromBranch('4821')).toBe(4821)
  })

  it('ignores digits adjacent to letters', () => {
    expect(taskIdFromBranch('oauth2-rework')).toBeNull()
    expect(taskIdFromBranch('feature/sso2024migration')).toBeNull()
    expect(taskIdFromBranch('(detached abc1234)')).toBeNull()
  })

  it('ignores single digits', () => {
    expect(taskIdFromBranch('v2.0-cleanup')).toBeNull()
    expect(taskIdFromBranch('feature/phase-3')).toBeNull()
  })

  it('returns null when no number is present', () => {
    expect(taskIdFromBranch('main')).toBeNull()
    expect(taskIdFromBranch('feature/dark-mode')).toBeNull()
  })
})
