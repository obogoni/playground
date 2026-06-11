import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { scanRepos } from './repo-scanner'

describe('scanRepos', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'wtm-scan-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  /** A "repo" is any dir with a .git directory — no real git needed for scanning. */
  const makeRepo = (name: string): void => {
    mkdirSync(join(workspace, name, '.git'), { recursive: true })
  }

  it('finds repos that are direct children of the workspace', async () => {
    makeRepo('api')
    makeRepo('web')
    mkdirSync(join(workspace, 'not-a-repo'))

    const repos = await scanRepos(workspace)

    expect(repos).toEqual([
      { name: 'api', path: join(workspace, 'api') },
      { name: 'web', path: join(workspace, 'web') }
    ])
  })

  it('does not descend below one level', async () => {
    mkdirSync(join(workspace, 'group', 'nested-repo', '.git'), { recursive: true })

    expect(await scanRepos(workspace)).toEqual([])
  })

  it('ignores node_modules and dot-directories', async () => {
    mkdirSync(join(workspace, 'node_modules', 'pkg-repo', '.git'), { recursive: true })
    mkdirSync(join(workspace, '.cache', '.git'), { recursive: true })

    expect(await scanRepos(workspace)).toEqual([])
  })

  it('excludes children whose .git is a file (linked worktrees)', async () => {
    makeRepo('api')
    const worktree = join(workspace, 'api-feature-123')
    mkdirSync(worktree)
    writeFileSync(join(worktree, '.git'), 'gitdir: elsewhere', 'utf8')

    const repos = await scanRepos(workspace)

    expect(repos.map((r) => r.name)).toEqual(['api'])
  })

  it('returns stable name-sorted order regardless of creation order', async () => {
    makeRepo('zeta')
    makeRepo('alpha')
    makeRepo('midway')

    const repos = await scanRepos(workspace)

    expect(repos.map((r) => r.name)).toEqual(['alpha', 'midway', 'zeta'])
  })

  it('returns an empty list for a workspace with no repos', async () => {
    mkdirSync(join(workspace, 'docs'))
    writeFileSync(join(workspace, 'readme.md'), 'hi', 'utf8')

    expect(await scanRepos(workspace)).toEqual([])
  })

  it('rejects with ENOENT for a missing workspace path', async () => {
    await expect(scanRepos(join(workspace, 'gone'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
