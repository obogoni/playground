import { describe, expect, it } from 'vitest'
import type { RemoteRef } from '../shared/files'
import { commitUrl, parseRemote } from './remote-url'

// Every URL here is fictitious: this repository is public and the spec's
// privacy guardrail forbids a real organisation, project or repository name.

const recognized: Array<[string, RemoteRef]> = [
  ['https://github.com/acme/widget.git', { provider: 'github', owner: 'acme', repo: 'widget' }],
  ['https://github.com/acme/widget', { provider: 'github', owner: 'acme', repo: 'widget' }],
  ['git@github.com:acme/widget.git', { provider: 'github', owner: 'acme', repo: 'widget' }],
  ['ssh://git@github.com/acme/widget.git', { provider: 'github', owner: 'acme', repo: 'widget' }],
  [
    'https://acme@dev.azure.com/acme/platform/_git/widget',
    { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
  ],
  [
    'git@ssh.dev.azure.com:v3/acme/platform/widget',
    { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
  ],
  [
    'https://acme.visualstudio.com/platform/_git/widget',
    { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
  ],
  [
    'https://acme.visualstudio.com/DefaultCollection/platform/_git/widget',
    { provider: 'azure-devops', org: 'acme', project: 'platform', repo: 'widget' }
  ]
]

const SHA = '0f2b9c1d4e6a8b3c5d7e9f0a1b2c3d4e5f6a7b8c'

describe('parseRemote', () => {
  it.each(recognized)('recognizes %s', (url, expected) => {
    expect(parseRemote(url)).toEqual(expected)
  })

  it('keeps no trace of a credential carried by the remote', () => {
    const parsed = parseRemote('https://user:token@github.com/acme/widget.git')
    expect(parsed).toEqual({ provider: 'github', owner: 'acme', repo: 'widget' })
    expect(JSON.stringify(parsed)).not.toContain('token')
    expect(JSON.stringify(parsed)).not.toContain('user')
  })

  it('decodes a project named with a space', () => {
    expect(parseRemote('https://dev.azure.com/acme/My%20Project/_git/widget')).toEqual({
      provider: 'azure-devops',
      org: 'acme',
      project: 'My Project',
      repo: 'widget'
    })
  })

  const rejected: string[] = [
    'https://gitlab.com/acme/widget.git',
    'C:\\repos\\widget',
    '',
    // Right host, wrong shape: an Azure DevOps path without `_git` names no repo.
    'https://dev.azure.com/acme/platform/widget',
    // The same, at the RIGHT length. The three-segment case above is rejected
    // for being too short and never reaches the `_git` guard, so deleting that
    // guard passed the whole suite until this row existed (sensor mutant M1).
    'https://dev.azure.com/acme/platform/notgit/widget',
    // A GitHub URL with an owner and no repository.
    'https://github.com/acme'
  ]

  it.each(rejected)('returns null for %s', (url) => {
    expect(parseRemote(url)).toBeNull()
  })
})

describe('commitUrl', () => {
  it('addresses a github commit', () => {
    expect(commitUrl({ provider: 'github', owner: 'acme', repo: 'widget' }, SHA)).toBe(
      `https://github.com/acme/widget/commit/${SHA}`
    )
  })

  // The three Azure DevOps remote forms parse to the same ref, so they must
  // reach the same page: `dev.azure.com`, whichever one the remote used.
  it.each([
    'https://acme@dev.azure.com/acme/platform/_git/widget',
    'git@ssh.dev.azure.com:v3/acme/platform/widget',
    'https://acme.visualstudio.com/DefaultCollection/platform/_git/widget'
  ])('addresses an azure devops commit from %s', (remote) => {
    const ref = parseRemote(remote)
    expect(ref).not.toBeNull()
    expect(commitUrl(ref as RemoteRef, SHA)).toBe(
      `https://dev.azure.com/acme/platform/_git/widget/commit/${SHA}`
    )
  })

  it('re-encodes a project named with a space', () => {
    expect(
      commitUrl(
        { provider: 'azure-devops', org: 'acme', project: 'My Project', repo: 'widget' },
        SHA
      )
    ).toBe(`https://dev.azure.com/acme/My%20Project/_git/widget/commit/${SHA}`)
  })

  // FCMT-28: nothing else may be opened, so no recognized remote — whatever
  // its own scheme — may produce an address that is not https.
  it.each(recognized)('builds an https address from %s', (url) => {
    const ref = parseRemote(url)
    expect(ref).not.toBeNull()
    expect(commitUrl(ref as RemoteRef, SHA).startsWith('https://')).toBe(true)
  })
})
