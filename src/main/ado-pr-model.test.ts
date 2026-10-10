import { describe, expect, it } from 'vitest'
import { pickRemoteRepos, sourceRemote, toChangedPaths, voteLabel } from './ado-pr-model'

// Every name here is fictitious: this repository is public and the spec's
// privacy guardrail forbids a real organisation, project or repository name.

describe('toChangedPaths', () => {
  // The shapes follow the reference's Iteration Changes example: ADO roots
  // every path at `/` and names the change type in words.
  it('maps each change type to the status the other modes use', () => {
    expect(
      toChangedPaths([
        { changeTrackingId: 1, changeType: 'add', item: { path: '/src/new.ts' } },
        { changeTrackingId: 2, changeType: 'edit', item: { path: '/src/app.ts' } },
        { changeTrackingId: 3, changeType: 'delete', item: { path: '/src/old.ts' } },
        {
          changeTrackingId: 4,
          changeType: 'rename',
          item: { path: '/src/moved.ts' },
          originalPath: '/src/before.ts'
        },
        {
          changeTrackingId: 5,
          changeType: 'edit, rename',
          item: { path: '/src/reworked.ts' },
          originalPath: '/src/draft.ts'
        }
      ]).map((file) => [file.path, file.status])
    ).toEqual([
      ['src/new.ts', 'added'],
      ['src/app.ts', 'modified'],
      ['src/old.ts', 'deleted'],
      ['src/moved.ts', 'renamed'],
      ['src/reworked.ts', 'renamed']
    ])
  })

  it("strips ADO's leading slash and keeps the original path and change tracking id", () => {
    expect(
      toChangedPaths([
        {
          changeTrackingId: 7,
          changeType: 'rename',
          item: { path: '/docs/guide.md' },
          originalPath: '/docs/readme.md'
        },
        { changeTrackingId: 8, changeType: 'edit', item: { path: '/package.json' } }
      ])
    ).toEqual([
      { path: 'docs/guide.md', status: 'renamed', oldPath: 'docs/readme.md', changeTrackingId: 7 },
      { path: 'package.json', status: 'modified', changeTrackingId: 8 }
    ])
  })
})

describe('voteLabel', () => {
  it('maps the five documented votes to their states', () => {
    expect([10, 5, 0, -5, -10].map(voteLabel)).toEqual([
      'approved',
      'approved-with-suggestions',
      'no-vote',
      'waiting-for-author',
      'rejected'
    ])
  })

  it('maps a vote the reference does not document to no vote', () => {
    expect(voteLabel(7)).toBe('no-vote')
    expect(voteLabel(-1)).toBe('no-vote')
  })
})

describe('pickRemoteRepos (FPRA-02/06)', () => {
  it('yields only the azure devops remote of a repository that also has a github one', () => {
    expect(
      pickRemoteRepos([
        { name: 'origin', url: 'https://github.com/acme/widget.git' },
        { name: 'fork', url: 'https://acme@dev.azure.com/acme/platform/_git/widget' }
      ])
    ).toEqual([{ name: 'fork', target: { org: 'acme', project: 'platform', repo: 'widget' } }])
  })

  it('yields none when no remote is on azure devops', () => {
    expect(
      pickRemoteRepos([
        { name: 'origin', url: 'https://github.com/acme/widget.git' },
        { name: 'mirror', url: 'https://git.example.com/acme/widget.git' }
      ])
    ).toEqual([])
  })
})

describe('sourceRemote (FPRA-02)', () => {
  const repos = [
    { name: 'origin', target: { org: 'acme', project: 'platform', repo: 'widget' } },
    { name: 'fork', target: { org: 'acme', project: 'platform', repo: 'widget-fork' } }
  ]

  it('is the azure devops remote the branch tracks, a fork included', () => {
    expect(sourceRemote('fork', repos)).toEqual(repos[1])
  })

  it('is none when the branch tracks nothing, or a remote not on azure devops', () => {
    expect(sourceRemote(null, repos)).toBeNull()
    expect(sourceRemote('github', repos)).toBeNull()
  })
})
