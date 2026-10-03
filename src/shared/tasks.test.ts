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
      'feature/1-configuracao-ambiente'
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
    expect(branchNameFor(task(42, 'Bug', 'Crash on save'), '{id}-{slug}')).toBe('42-crash-save')
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
    ).toBe('user/jdoe/10001-configuracao-ambiente/10002-nested-branch')
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

describe('branchNameFor — concise slugs (BSLG-01..11, 31..33)', () => {
  const FILLER_WORDS = [
    'a',
    'o',
    'os',
    'as',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'em',
    'no',
    'na',
    'com',
    'para',
    'por',
    'e',
    'ou',
    'um',
    'uma',
    'via',
    'the',
    'of',
    'to',
    'in',
    'on',
    'for',
    'and',
    'or',
    'with'
  ]
  const AC8_TITLE =
    'Ajustar a validação dos campos do cadastro de clientes com o novo serviço de endereços'
  const slug = (title: string): string => branchNameFor(task(7, 'Task', title), '{slug}')

  it.each(FILLER_WORDS)('leaves out the filler word "%s" (BSLG-01)', (word) => {
    expect(branchNameFor(task(7, 'Task', `Fix ${word} login`), null)).toBe('feature/7-fix-login')
  })

  it('compares filler words after transliteration and lowercasing (BSLG-01)', () => {
    expect(slug('Fix À login')).toBe('fix-login')
    expect(slug('Fix DE login')).toBe('fix-login')
  })

  it('keeps words that only resemble filler words (BSLG-01)', () => {
    expect(slug('Fix an at by nas pela login')).toBe('fix-an-at-by-nas-pela-login')
  })

  it('collapses a word repeated back to back, after the filler words go (BSLG-02)', () => {
    expect(slug('Fix fix FIX login')).toBe('fix-login')
    expect(slug('Validação de validação')).toBe('validacao')
  })

  it('keeps equal words that a non-filler word separates (BSLG-33)', () => {
    expect(slug('login fix login')).toBe('login-fix-login')
  })

  it('keeps every remaining word when they join to exactly 40 characters (BSLG-04)', () => {
    expect(slug('Revisar fluxo de pagamento recorrente via banco')).toBe(
      'revisar-fluxo-pagamento-recorrente-banco'
    )
  })

  it('cuts at the last whole word when the words join to more than 40 (BSLG-03)', () => {
    expect(slug('Revisar fluxo de pagamento recorrente via bancos')).toBe(
      'revisar-fluxo-pagamento-recorrente'
    )
    expect(slug(AC8_TITLE)).toBe('ajustar-validacao-campos-cadastro')
  })

  it('keeps a 40-letter word whole and cuts a 41-letter word to 40 (BSLG-32)', () => {
    const forty = 'abcdefghij'.repeat(4)
    expect(slug(forty)).toBe(forty)
    expect(slug(`${forty}k`)).toBe(forty)
  })

  it('cuts a first word longer than 40 to its first 40 characters (BSLG-05)', () => {
    expect(slug('Supercalifragilisticexpialidociousextraordinarily long')).toBe(
      'supercalifragilisticexpialidociousextrao'
    )
  })

  it('falls back to all the words when only filler words remain, still capped (BSLG-06)', () => {
    expect(slug('De a para')).toBe('de-a-para')
    expect(slug('De de para')).toBe('de-para')
    expect(slug('Para por para com para de dos das para em no na e ou um uma')).toBe(
      'para-por-para-com-para-de-dos-das-para'
    )
  })

  it('keeps numbers, single digits included (BSLG-07)', () => {
    expect(slug('Migrar para v2 em 3 etapas')).toBe('migrar-v2-3-etapas')
  })

  it('still trims the segment of an empty slug (BSLG-31)', () => {
    expect(branchNameFor(task(4821, 'Task', '!!!'), null)).toBe('feature/4821')
  })

  it('shortens both slugs of the nested template (BSLG-08)', () => {
    expect(
      branchNameFor(task(10002, 'Task', AC8_TITLE), 'user/{dev}/{usId}-{usSlug}/{id}-{slug}', {
        devAlias: 'dev',
        parent: { id: 10001, title: AC8_TITLE }
      })
    ).toBe(
      'user/dev/10001-ajustar-validacao-campos-cadastro/10002-ajustar-validacao-campos-cadastro'
    )
  })

  it('applies the rule to {slug} and {usSlug} only (BSLG-09)', () => {
    expect(branchNameFor(task(7, 'Task', 'Fix login'), 'de/{id}-{slug}')).toBe('de/7-fix-login')
    expect(
      branchNameFor(task(10002, 'Bug', 'Fix login'), 'user/{dev}/{usId}-{usSlug}/{id}-{slug}', {
        devAlias: 'of',
        parent: { id: 10001, title: 'Checkout flow' }
      })
    ).toBe('user/of/10001-checkout-flow/10002-fix-login')
    expect(branchNameFor(task(10002, 'Bug', 'Fix the login'), '{type}/{id}-{slug}')).toBe(
      'bugfix/10002-fix-login'
    )
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

  it('reads a branch made by the previous slug rule (BSLG-11)', () => {
    expect(taskIdFromBranch('feature/4821-configuracao-de-ambiente')).toBe(4821)
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

  it('reads a branch made by the previous slug rule (BSLG-11)', () => {
    expect(taskIdFromTemplate('{type}/{id}-{slug}', 'feature/4821-configuracao-de-ambiente')).toBe(
      4821
    )
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
    const titles = [
      'Fix login redirect',
      '!!!',
      'Ajustar a validação dos campos do cadastro de clientes com o novo serviço de endereços',
      'De a para',
      'Supercalifragilisticexpialidociousextraordinarily'
    ]
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
