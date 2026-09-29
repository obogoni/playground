import { describe, expect, it } from 'vitest'
import { branchNameFor, taskIdFromBranch, taskIdFromTemplate } from './tasks'

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
      'feature/1-configuracao-de-ambiente'
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
    ).toBe('user/jdoe/10001-configuracao-de-ambiente/10002-nested-branch')
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

describe('taskIdFromTemplate', () => {
  const MINE = 'user/otavio/{id}-{slug}'
  const NESTED = 'user/{dev}/{usId}-{usSlug}/{id}-{slug}'

  it('returns the id of a branch built from the template (APIN-01)', () => {
    expect(taskIdFromTemplate(MINE, 'user/otavio/4821-fix-login')).toBe(4821)
  })

  it('returns null when the literal text does not match (APIN-01)', () => {
    expect(taskIdFromTemplate(MINE, 'user/maria/4821-x')).toBeNull()
    expect(taskIdFromTemplate(MINE, 'main')).toBeNull()
  })

  it('matches {type} as feature or bugfix only (APIN-01)', () => {
    expect(taskIdFromTemplate('{type}/{id}-{slug}', 'feature/77-a')).toBe(77)
    expect(taskIdFromTemplate('{type}/{id}-{slug}', 'bugfix/77-a')).toBe(77)
    expect(taskIdFromTemplate('{type}/{id}-{slug}', 'chore/77-a')).toBeNull()
  })

  it('accepts a branch whose placeholder-only segment was dropped (APIN-02)', () => {
    expect(taskIdFromTemplate(NESTED, 'user/otavio/123-foo')).toBe(123)
    expect(taskIdFromTemplate(NESTED, 'user/otavio/9-us/123-foo')).toBe(123)
  })

  it('returns null for every branch when the template has no {id} (APIN-03)', () => {
    expect(taskIdFromTemplate('user/otavio/{slug}', 'user/otavio/4821-x')).toBeNull()
  })

  it('uses the default template when the template is null or blank (APIN-03)', () => {
    expect(taskIdFromTemplate(null, 'feature/4821-x')).toBe(4821)
    expect(taskIdFromTemplate('   ', 'bugfix/4821-x')).toBe(4821)
    expect(taskIdFromTemplate(null, 'user/otavio/4821-x')).toBeNull()
  })

  it('matches literal text case-insensitively (APIN-03)', () => {
    expect(taskIdFromTemplate(MINE, 'USER/Otavio/4821-x')).toBe(4821)
  })

  it('anchors the match at both ends of the branch (APIN-03)', () => {
    expect(taskIdFromTemplate(MINE, 'x/user/otavio/4821-a')).toBeNull()
    expect(taskIdFromTemplate(MINE, 'user/otavio/4821-a/extra')).toBeNull()
  })

  it('reads leading zeros as the number and rejects id 0', () => {
    expect(taskIdFromTemplate(MINE, 'user/otavio/0042-x')).toBe(42)
    expect(taskIdFromTemplate(MINE, 'user/otavio/0-x')).toBeNull()
  })

  it('never matches a detached HEAD', () => {
    expect(taskIdFromTemplate(MINE, '(detached abc1234)')).toBeNull()
    expect(taskIdFromTemplate('{id}', '(detached 1234567)')).toBeNull()
  })

  it('treats regex metacharacters in literal text as literals', () => {
    expect(taskIdFromTemplate('fix.{id}', 'fix.55')).toBe(55)
    expect(taskIdFromTemplate('fix.{id}', 'fixx55')).toBeNull()
  })

  it('recovers the id branchNameFor rendered, for every context (APIN-04)', () => {
    const templates = [
      MINE,
      NESTED,
      '{type}/{id}-{slug}',
      'user/{dev}/{id}-{slug}',
      '{dev}-{id}',
      '{id}/{slug}',
      'user/{id}/{dev}',
      '{type}/{id}-{slug}/{usId}'
    ]
    const titles = ['Fix login redirect', '!!!']
    const contexts = [
      {},
      { devAlias: 'otavio' },
      { devAlias: 'otavio', parent: { id: 9, title: 'Checkout flow' } },
      { parent: { id: 9, title: '' } }
    ]
    for (const template of templates) {
      for (const title of titles) {
        for (const type of ['Task', 'Bug']) {
          for (const ctx of contexts) {
            const branch = branchNameFor(task(4821, type, title), template, ctx)
            expect({ template, branch, id: taskIdFromTemplate(template, branch) }).toEqual({
              template,
              branch,
              id: 4821
            })
          }
        }
      }
    }
  })
})
