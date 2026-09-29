import { describe, expect, it } from 'vitest'
import type { WorkspaceNode, WorktreeNode } from '../shared/tree'
import { derivedTaskRefs } from './worktree-tasks'

const acme = { defaultOrg: 'acme', defaultProject: 'platform' }

const wt = (branch: string): WorktreeNode => ({
  id: `/wt/${branch}`,
  path: `/wt/${branch}`,
  branch,
  isDefault: false,
  dirty: false,
  changes: 0
})

const workspace = (path: string, branches: string[]): WorkspaceNode => ({
  id: path,
  path,
  displayName: path,
  repos: [{ name: 'repo', path: `${path}/repo`, worktrees: branches.map(wt) }]
})

const url = (id: number): string => `https://dev.azure.com/acme/platform/_workitems/edit/${id}`

describe('derivedTaskRefs', () => {
  it('derives one ref per matching worktree with the default org/project and canonical url', () => {
    const tree = [workspace('/ws', ['user/otavio/4821-fix', 'main'])]

    expect(derivedTaskRefs(tree, () => 'user/otavio/{id}-{slug}', acme)).toEqual([
      { id: 4821, org: 'acme', project: 'platform', url: url(4821) }
    ])
  })

  it('derives the same id carried by worktrees in two workspaces once (APIN-05)', () => {
    const tree = [
      workspace('/a', ['user/otavio/4821-fix']),
      workspace('/b', ['user/otavio/4821-other', 'user/otavio/77-x'])
    ]

    expect(derivedTaskRefs(tree, () => 'user/otavio/{id}-{slug}', acme).map((r) => r.id)).toEqual([
      4821, 77
    ])
  })

  it("matches each workspace's worktrees against that workspace's template (APIN-05)", () => {
    const tree = [
      workspace('/a', ['team/10-x', 'user/otavio/20-y']),
      workspace('/b', ['team/30-x', 'user/otavio/40-y'])
    ]
    const templateFor = (path: string): string =>
      path === '/a' ? 'team/{id}-{slug}' : 'user/otavio/{id}-{slug}'

    expect(derivedTaskRefs(tree, templateFor, acme).map((r) => r.id)).toEqual([10, 40])
  })

  it('derives nothing when the default org or project is unset (APIN-07)', () => {
    const tree = [workspace('/ws', ['user/otavio/4821-fix'])]
    const template = (): string => 'user/otavio/{id}-{slug}'

    expect(derivedTaskRefs(tree, template, { defaultOrg: null, defaultProject: 'p' })).toEqual([])
    expect(derivedTaskRefs(tree, template, { defaultOrg: 'o', defaultProject: null })).toEqual([])
  })

  it('skips detached and non-matching worktrees', () => {
    const tree = [workspace('/ws', ['(detached abc1234)', 'feature/99-x', 'develop'])]

    expect(derivedTaskRefs(tree, () => 'user/otavio/{id}-{slug}', acme)).toEqual([])
  })
})
