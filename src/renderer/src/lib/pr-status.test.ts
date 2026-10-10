import { describe, expect, it } from 'vitest'
import type {
  PrDetail,
  PrSearch,
  PrSummary,
  PrTarget,
  Reviewer,
  ReviewerState
} from '../../../shared/files'
import { prKey } from './pr-view'
import type { PrRead } from './pr-lookup'
import { prChip, reviewLines, reviewMark } from './pr-status'

function reviewer(
  name: string,
  state: ReviewerState,
  extra: Partial<Pick<Reviewer, 'isGroup' | 'isRequired'>> = {}
): Reviewer {
  return { name, state, isGroup: false, isRequired: false, ...extra }
}

describe('reviewMark', () => {
  it('marks a rejection, whatever else the reviewers said (SPRL-04)', () => {
    // Azure DevOps-shaped: votes -10, 10, -5.
    expect(
      reviewMark([
        reviewer('Ana', 'approved'),
        reviewer('Bruno', 'rejected'),
        reviewer('Carla', 'waiting-for-author')
      ])
    ).toBe('rejected')
  })

  it('marks waiting for the author when nobody rejected (SPRL-05)', () => {
    expect(reviewMark([reviewer('Ana', 'approved'), reviewer('Bruno', 'waiting-for-author')])).toBe(
      'changes'
    )
  })

  it("marks GitHub's requested changes like waiting for the author (SPRL-05)", () => {
    expect(
      reviewMark([reviewer('octo-a', 'approved'), reviewer('octo-b', 'changes-requested')])
    ).toBe('changes')
  })

  it('marks an approval when nobody rejected or asked for changes (SPRL-06)', () => {
    expect(reviewMark([reviewer('Ana', 'approved'), reviewer('Bruno', 'no-vote')])).toBe('approved')
  })

  it('counts an approval with suggestions as an approval (SPRL-06)', () => {
    expect(reviewMark([reviewer('Ana', 'approved-with-suggestions')])).toBe('approved')
  })

  it('marks nothing when no reviewer voted (SPRL-07)', () => {
    expect(reviewMark([reviewer('Ana', 'no-vote'), reviewer('Bruno', 'no-vote')])).toBeNull()
    expect(reviewMark([])).toBeNull()
  })

  it("marks nothing for GitHub's comments and dismissed reviews (SPRL-07)", () => {
    expect(
      reviewMark([reviewer('octo-a', 'commented'), reviewer('octo-b', 'dismissed')])
    ).toBeNull()
  })

  it('weighs a group and a required reviewer like anyone else (SPRL-04..06)', () => {
    expect(
      reviewMark([
        reviewer('Platform Team', 'approved', { isGroup: true, isRequired: true }),
        reviewer('Ana', 'rejected')
      ])
    ).toBe('rejected')
    expect(
      reviewMark([
        reviewer('Platform Team', 'no-vote', { isGroup: true, isRequired: true }),
        reviewer('Ana', 'approved')
      ])
    ).toBe('approved')
  })
})

describe('reviewLines', () => {
  it('lists every reviewer with their state, in order (SPRL-08)', () => {
    expect(
      reviewLines([
        reviewer('Ana', 'approved-with-suggestions'),
        reviewer('Platform Team', 'no-vote', { isGroup: true }),
        reviewer('octo-b', 'changes-requested'),
        reviewer('Bruno', 'waiting-for-author')
      ])
    ).toEqual([
      'Ana: Approved with suggestions',
      'Platform Team: No vote',
      'octo-b: Changes requested',
      'Bruno: Waiting for author'
    ])
  })
})

const ADO: PrTarget = { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
const GH: PrTarget = { provider: 'github', owner: 'contoso', repo: 'widget' }

function summary(target: PrTarget, id: number, extra: Partial<PrSummary> = {}): PrSummary {
  return {
    target,
    id,
    title: `Fix login redirect ${id}`,
    targetBranch: 'main',
    isDraft: false,
    ...extra
  }
}

function found(...prs: PrSummary[]): PrSearch {
  return { kind: 'found', prs }
}

function read(pr: PrSummary, reviewers: Reviewer[]): [string, PrRead] {
  const detail = { ...pr, reviewers } as PrDetail
  return [prKey(pr), { detail, failure: null }]
}

const NONE: PrSearch = { kind: 'none', createUrlAvailable: false }

describe('prChip', () => {
  it('shows one Azure DevOps PR with its draft flag, mark and reviewers (SPRL-03, 04, 08)', () => {
    const pr = summary(ADO, 7, { isDraft: true })
    const chip = prChip(
      { 'azure-devops': found(pr), github: NONE },
      Object.fromEntries([read(pr, [reviewer('Ana', 'rejected'), reviewer('Bruno', 'approved')])])
    )
    expect(chip).toEqual({
      kind: 'one',
      item: {
        pr,
        review: { kind: 'read', mark: 'rejected', lines: ['Ana: Rejected', 'Bruno: Approved'] }
      },
      notes: []
    })
  })

  it('shows one GitHub PR the same way (SPRL-03, 06)', () => {
    const pr = summary(GH, 12)
    const chip = prChip(
      { 'azure-devops': { kind: 'no-remote' }, github: found(pr) },
      Object.fromEntries([read(pr, [reviewer('octo-a', 'approved')])])
    )
    expect(chip.kind).toBe('one')
    if (chip.kind !== 'one') return
    expect(chip.item.pr).toBe(pr)
    expect(chip.item.review).toEqual({
      kind: 'read',
      mark: 'approved',
      lines: ['octo-a: Approved']
    })
  })

  it('lists several PRs with each one its own mark (SPRL-12)', () => {
    const toMain = summary(GH, 12)
    const toRelease = summary(GH, 13, { targetBranch: 'release/2.0' })
    const chip = prChip(
      { 'azure-devops': NONE, github: found(toMain, toRelease) },
      Object.fromEntries([
        read(toMain, [reviewer('octo-a', 'changes-requested')]),
        read(toRelease, [])
      ])
    )
    expect(chip).toEqual({
      kind: 'many',
      items: [
        {
          pr: toMain,
          review: { kind: 'read', mark: 'changes', lines: ['octo-a: Changes requested'] }
        },
        { pr: toRelease, review: { kind: 'read', mark: null, lines: [] } }
      ],
      notes: []
    })
  })

  it("counts each provider's PRs, Azure DevOps first (SPRL-12)", () => {
    const ado = summary(ADO, 7)
    const gh = summary(GH, 7)
    const chip = prChip({ 'azure-devops': found(ado), github: found(gh) }, {})
    expect(chip.kind).toBe('many')
    if (chip.kind !== 'many') return
    expect(chip.items.map((item) => item.pr)).toEqual([ado, gh])
  })

  it("keeps the other provider's PRs when one fails, with the failure as a note (SPRL-19)", () => {
    const a = summary(GH, 12)
    const b = summary(GH, 13)
    const many = prChip({ 'azure-devops': { kind: 'auth' }, github: found(a, b) }, {})
    expect(many.kind).toBe('many')
    if (many.kind !== 'many') return
    expect(many.items.map((item) => item.pr)).toEqual([a, b])
    expect(many.notes).toEqual(['Azure DevOps sign-in failed — run az login'])

    const one = prChip(
      {
        'azure-devops': found(summary(ADO, 7)),
        github: { kind: 'error', message: 'socket hang up' }
      },
      {}
    )
    expect(one.kind).toBe('one')
    if (one.kind !== 'one') return
    expect(one.notes).toEqual(['GitHub: socket hang up'])
  })

  it('offers Create PR on the provider that says creation is available (SPRL-15)', () => {
    expect(
      prChip({ 'azure-devops': NONE, github: { kind: 'none', createUrlAvailable: true } }, {})
    ).toEqual({ kind: 'create', provider: 'github' })
    expect(
      prChip(
        {
          'azure-devops': { kind: 'none', createUrlAvailable: true },
          github: { kind: 'no-remote' }
        },
        {}
      )
    ).toEqual({ kind: 'create', provider: 'azure-devops' })
  })

  it('shows nothing when no provider can create one (SPRL-16)', () => {
    expect(prChip({ 'azure-devops': NONE, github: NONE }, {})).toEqual({ kind: 'hidden' })
  })

  it('says why when a provider failed and none found a PR (SPRL-17)', () => {
    expect(prChip({ 'azure-devops': { kind: 'auth' }, github: NONE }, {})).toEqual({
      kind: 'unknown',
      reason: 'Azure DevOps sign-in failed — run az login'
    })
    expect(
      prChip(
        {
          'azure-devops': { kind: 'no-remote' },
          github: { kind: 'error', message: 'socket hang up' }
        },
        {}
      )
    ).toEqual({ kind: 'unknown', reason: 'GitHub: socket hang up' })
  })

  it('says until when a rate-limited provider refuses (SPRL-17)', () => {
    const chip = prChip(
      { 'azure-devops': { kind: 'no-remote' }, github: { kind: 'rate-limited', resetAt: 0 } },
      {}
    )
    expect(chip.kind).toBe('unknown')
    if (chip.kind !== 'unknown') return
    expect(chip.reason).toContain('GitHub refuses requests until')
  })

  it('prefers saying why over Create PR when a provider failed (SPRL-15, 17)', () => {
    expect(
      prChip(
        { 'azure-devops': { kind: 'none', createUrlAvailable: true }, github: { kind: 'auth' } },
        {}
      ).kind
    ).toBe('unknown')
  })

  it('shows nothing without a recognised remote or on a detached HEAD (SPRL-18)', () => {
    expect(
      prChip({ 'azure-devops': { kind: 'no-remote' }, github: { kind: 'no-remote' } }, {})
    ).toEqual({ kind: 'hidden' })
    expect(
      prChip({ 'azure-devops': { kind: 'detached' }, github: { kind: 'detached' } }, {})
    ).toEqual({ kind: 'hidden' })
  })

  it('shows nothing before any provider answered (no placeholder that reads as no PR)', () => {
    expect(prChip({}, {})).toEqual({ kind: 'hidden' })
  })

  it('shows a PR whose reviewers could not be read without a mark, saying so (edge case)', () => {
    const pr = summary(ADO, 7, { isDraft: true })
    const chip = prChip(
      { 'azure-devops': found(pr), github: NONE },
      {
        [prKey(pr)]: {
          detail: null,
          failure: { provider: 'azure-devops', kind: 'error', message: 'HTTP 500' }
        }
      }
    )
    expect(chip).toEqual({
      kind: 'one',
      item: { pr, review: { kind: 'failed', reason: 'The reviewers could not be read: HTTP 500' } },
      notes: []
    })
  })

  it('says nothing about reviewers not read yet', () => {
    const pr = summary(GH, 12)
    const chip = prChip({ github: found(pr) }, {})
    expect(chip).toEqual({ kind: 'one', item: { pr, review: { kind: 'pending' } }, notes: [] })
  })
})
