import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitError, listWorktrees } from './worktree-manager'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('listWorktrees', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    // realpath: git resolves 8.3 short names / symlinked temp dirs in its output
    root = realpathSync(mkdtempSync(join(tmpdir(), 'wtm-wt-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('lists a repo with only its primary checkout', async () => {
    const worktrees = await listWorktrees(repo)

    expect(worktrees).toHaveLength(1)
    expect(worktrees[0]).toMatchObject({
      path: repo,
      branch: 'main',
      isDefault: true,
      dirty: false,
      changes: 0
    })
  })

  it('lists a linked flat-sibling worktree as non-default', async () => {
    const sibling = join(root, 'repo-feature-123')
    git(repo, 'worktree', 'add', sibling, '-b', 'feature/123')

    const worktrees = await listWorktrees(repo)

    expect(worktrees).toHaveLength(2)
    expect(worktrees[0]).toMatchObject({ branch: 'main', isDefault: true })
    expect(worktrees[1]).toMatchObject({
      path: sibling,
      branch: 'feature/123',
      isDefault: false
    })
  })

  it('counts modified and untracked files as changes', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed', 'utf8')
    writeFileSync(join(repo, 'new.txt'), 'untracked', 'utf8')

    const [primary] = await listWorktrees(repo)

    expect(primary.dirty).toBe(true)
    expect(primary.changes).toBe(2)
  })

  it('reports dirty only on the worktree that actually has changes', async () => {
    const sibling = join(root, 'repo-clean')
    git(repo, 'worktree', 'add', sibling, '-b', 'clean-branch')
    writeFileSync(join(repo, 'a.txt'), 'changed', 'utf8')

    const worktrees = await listWorktrees(repo)

    expect(worktrees.find((w) => w.path === repo)).toMatchObject({ dirty: true })
    expect(worktrees.find((w) => w.path === sibling)).toMatchObject({ dirty: false, changes: 0 })
  })

  it('labels a detached-HEAD worktree instead of crashing', async () => {
    const sha = git(repo, 'rev-parse', 'HEAD').trim()
    const sibling = join(root, 'repo-detached')
    git(repo, 'worktree', 'add', '--detach', sibling, sha)

    const worktrees = await listWorktrees(repo)
    const detached = worktrees.find((w) => w.path === sibling)

    expect(detached?.branch).toBe(`(detached ${sha.slice(0, 7)})`)
  })

  it('throws a GitError for a path that is not a git repo', async () => {
    const plain = join(root, 'not-a-repo')
    mkdirSync(plain)

    await expect(listWorktrees(plain)).rejects.toBeInstanceOf(GitError)
  })
})
