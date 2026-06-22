import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sanitizeBranch, worktreeNameFor, worktreePathFor } from '../shared/worktrees'
import {
  changedFilesOf,
  createWorktree,
  GitError,
  listWorktrees,
  parseChangedFiles,
  removeWorktree
} from './worktree-manager'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('listWorktrees', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    // realpathSync.native: git emits the long, canonical path; the OS realpath
    // expands 8.3 short names (e.g. RUNNER~1 on CI) + resolves symlinked temp dirs
    // to match it. The JS realpathSync resolves symlinks but NOT 8.3 names.
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-wt-')))
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

describe('sanitizeBranch', () => {
  it.each([
    ['feature/123', 'feature-123'],
    ['a\\b', 'a-b'],
    ['fix: crash on load!', 'fix-crash-on-load'],
    ['a/-b', 'a-b'],
    ['/feat/', 'feat'],
    ['release_1.2-rc', 'release_1.2-rc'],
    ['///', '']
  ])('sanitizes %j to %j', (input, expected) => {
    expect(sanitizeBranch(input)).toBe(expected)
  })
})

describe('worktreeNameFor', () => {
  it('defaults to {repo}-{branch}, reproducing the historical name', () => {
    expect(worktreeNameFor('C:\\ws\\api', 'feature/123')).toBe('api-feature-123')
  })

  it('falls back to the default when the template is blank', () => {
    expect(worktreeNameFor('C:\\ws\\api', 'feature/123', '   ')).toBe('api-feature-123')
  })

  it.each([
    ['{id}', 'feature/42-add-login', '42'],
    ['{repo}-{id}', 'feature/42-add-login', 'api-42'],
    ['{id}-{branch}', 'fix/77-bug', '77-fix-77-bug'],
    ['{repo}/{branch}', 'feature/123', 'api-feature-123'],
    ['wt-{repo}', 'whatever', 'wt-api']
  ])('renders template %j on branch %j to %j', (template, branch, expected) => {
    expect(worktreeNameFor('C:\\ws\\api', branch, template)).toBe(expected)
  })

  it('renders {id} empty when the branch has no standalone number', () => {
    expect(worktreeNameFor('C:\\ws\\api', 'chore/cleanup', '{id}')).toBe('')
    expect(worktreeNameFor('C:\\ws\\api', 'chore/cleanup', '{repo}-{id}')).toBe('api')
  })

  it('passes unknown placeholders through literally', () => {
    expect(worktreeNameFor('C:\\ws\\api', 'x', '{repo}-{unknown}')).toBe('api-unknown')
  })

  it('is deterministic and idempotent', () => {
    const first = worktreeNameFor('C:\\ws\\api', 'fix/a b', '{id}')
    expect(worktreeNameFor('C:\\ws\\api', 'fix/a b', '{id}')).toBe(first)
  })
})

describe('worktreePathFor', () => {
  it('computes the flat-sibling path next to the repo', () => {
    expect(worktreePathFor('C:\\ws\\api', 'feature/123')).toBe('C:\\ws\\api-feature-123')
  })

  it('is deterministic and idempotent', () => {
    const first = worktreePathFor('C:\\ws\\api', 'fix/a b')
    expect(worktreePathFor('C:\\ws\\api', 'fix/a b')).toBe(first)
    expect(first).toBe('C:\\ws\\api-fix-a-b')
  })

  it('handles forward-slash repo paths', () => {
    expect(worktreePathFor('/ws/api', 'x')).toBe('/ws/api-x')
  })

  it('applies a custom template to the final segment only', () => {
    expect(worktreePathFor('C:\\ws\\api', 'feature/42-x', '{id}')).toBe('C:\\ws\\42')
    expect(worktreePathFor('/ws/api', 'feature/42-x', '{id}')).toBe('/ws/42')
  })
})

describe('parseChangedFiles', () => {
  it('maps each porcelain code to its human status label', () => {
    const out = [
      ' M edited.txt',
      'M  staged.txt',
      'A  added.txt',
      ' D removed.txt',
      '?? new.txt'
    ].join('\n')

    expect(parseChangedFiles(out)).toEqual([
      { path: 'edited.txt', status: 'modified' },
      { path: 'staged.txt', status: 'modified' },
      { path: 'added.txt', status: 'added' },
      { path: 'removed.txt', status: 'deleted' },
      { path: 'new.txt', status: 'untracked' }
    ])
  })

  it('surfaces the destination path for a rename', () => {
    expect(parseChangedFiles('R  old/name.txt -> new/name.txt')).toEqual([
      { path: 'new/name.txt', status: 'renamed' }
    ])
  })

  it('picks the most-destructive label when index and worktree disagree', () => {
    // Precedence: deleted > added > renamed > modified.
    expect(parseChangedFiles('AD gone.txt')[0].status).toBe('deleted')
    expect(parseChangedFiles('MM both.txt')[0].status).toBe('modified')
    expect(parseChangedFiles('RM moved.txt -> there.txt')[0]).toEqual({
      path: 'there.txt',
      status: 'renamed'
    })
  })

  it('unquotes git C-style quoting on special/non-ASCII paths', () => {
    // git quotePath emits octal UTF-8 byte escapes: \303\251 == "é".
    expect(parseChangedFiles('?? "caf\\303\\251.txt"')).toEqual([
      { path: 'café.txt', status: 'untracked' }
    ])
  })

  it('ignores blank lines and returns [] for empty input', () => {
    expect(parseChangedFiles('')).toEqual([])
    expect(parseChangedFiles('\n\n')).toEqual([])
  })
})

describe('createWorktree', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-create-')))
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

  it('creates a worktree on a new branch from a base branch', async () => {
    const result = await createWorktree(repo, 'feature/abc', 'main')

    expect(result).toMatchObject({ ok: true, path: join(root, 'repo-feature-abc') })
    expect(existsSync(result.path!)).toBe(true)
    const worktrees = await listWorktrees(repo)
    expect(worktrees).toContainEqual(
      expect.objectContaining({ path: result.path, branch: 'feature/abc' })
    )
  })

  it('creates a worktree from an existing branch when no base is given', async () => {
    git(repo, 'branch', 'chore-x')

    const result = await createWorktree(repo, 'chore-x')

    expect(result).toMatchObject({ ok: true, path: join(root, 'repo-chore-x') })
    const worktrees = await listWorktrees(repo)
    expect(worktrees).toContainEqual(expect.objectContaining({ branch: 'chore-x' }))
  })

  it('refuses when the target path already exists and creates nothing', async () => {
    mkdirSync(join(root, 'repo-taken'))

    const result = await createWorktree(repo, 'taken', 'main')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/exists/i)
    expect((await listWorktrees(repo)).length).toBe(1)
  })

  it('returns the git error when the branch already exists', async () => {
    const result = await createWorktree(repo, 'main', 'main')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('main')
  })

  it('returns the git error for an unknown base branch', async () => {
    const result = await createWorktree(repo, 'fix/x', 'does-not-exist')

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(existsSync(join(root, 'repo-fix-x'))).toBe(false)
  })

  it('refuses a branch that sanitizes to an empty path segment', async () => {
    const result = await createWorktree(repo, '///', 'main')

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('createWorktree — base refresh (WBR)', () => {
  // These exercises clone real repos over local paths; under full-suite parallel
  // load the default 5s test / 10s hook timeouts are too tight (clones get
  // starved). Raise both — fast tests in this file are unaffected.
  vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

  let root: string
  let origin: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-refresh-')))
    origin = join(root, 'origin')
    repo = join(root, 'repo')
    // Bare remote + a clone whose `main` tracks `origin/main`.
    git(root, 'init', '--bare', '-b', 'main', origin)
    git(root, 'clone', origin, 'repo')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    git(repo, 'push', '-u', 'origin', 'main')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** Advance `branch` on the remote by overwriting a.txt, via a throwaway clone. */
  const advanceRemote = (branch: string, content: string): void => {
    const scratch = join(root, `scratch-${branch.replace(/\W/g, '')}`)
    git(root, 'clone', origin, scratch)
    git(scratch, 'config', 'user.email', 'test@test.local')
    git(scratch, 'config', 'user.name', 'Test')
    git(scratch, 'checkout', branch)
    writeFileSync(join(scratch, 'a.txt'), content, 'utf8')
    git(scratch, 'commit', '-am', `remote ${content}`)
    git(scratch, 'push', 'origin', branch)
    rmSync(scratch, { recursive: true, force: true })
  }

  const headOf = (cwd: string, ref: string): string => git(cwd, 'rev-parse', ref).trim()

  it('fast-forwards a checked-out base and cuts the new branch from the remote tip', async () => {
    advanceRemote('main', 'two')

    const result = await createWorktree(repo, 'feature/x', 'main', undefined, true)

    expect(result.ok).toBe(true)
    // Local main moved up to the fetched remote tip…
    expect(headOf(repo, 'main')).toBe(headOf(repo, 'origin/main'))
    // …and the new worktree carries the remote commit.
    expect(readFileSync(join(result.path!, 'a.txt'), 'utf8')).toBe('two')
  })

  it('fast-forwards a base that is not checked out anywhere', async () => {
    // A second branch tracking origin/release, left unchecked (main stays HEAD).
    git(repo, 'checkout', '-b', 'release')
    git(repo, 'push', '-u', 'origin', 'release')
    git(repo, 'checkout', 'main')
    advanceRemote('release', 'rel-two')

    const result = await createWorktree(repo, 'feature/y', 'release', undefined, true)

    expect(result.ok).toBe(true)
    expect(headOf(repo, 'release')).toBe(headOf(repo, 'origin/release'))
    expect(readFileSync(join(result.path!, 'a.txt'), 'utf8')).toBe('rel-two')
  })

  it('blocks when the local base has diverged from its remote', async () => {
    // A local-only commit on main, plus a different remote commit → non-ff.
    writeFileSync(join(repo, 'a.txt'), 'local', 'utf8')
    git(repo, 'commit', '-am', 'local change')
    advanceRemote('main', 'remote')

    const result = await createWorktree(repo, 'feature/z', 'main', undefined, true)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/diverged|fast-forward/i)
    expect(existsSync(join(root, 'repo-feature-z'))).toBe(false)
  })

  it('blocks when the base branch has no remote upstream', async () => {
    git(repo, 'branch', 'local-only')

    const result = await createWorktree(repo, 'feature/w', 'local-only', undefined, true)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no remote upstream/i)
    expect(existsSync(join(root, 'repo-feature-w'))).toBe(false)
  })

  it('treats a local-ref upstream (no remote) as no remote upstream', async () => {
    // A branch tracking another *local* branch: rev-parse succeeds but yields a
    // bare name with no "<remote>/" prefix.
    git(repo, 'branch', 'localtrack')
    git(repo, 'config', 'branch.localtrack.remote', '.')
    git(repo, 'config', 'branch.localtrack.merge', 'refs/heads/main')

    const result = await createWorktree(repo, 'feature/lt', 'localtrack', undefined, true)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no remote upstream/i)
    expect(existsSync(join(root, 'repo-feature-lt'))).toBe(false)
  })

  it('blocks when the checked-out base is dirty and the ff would touch the change', async () => {
    writeFileSync(join(repo, 'a.txt'), 'uncommitted', 'utf8')
    advanceRemote('main', 'remote')

    const result = await createWorktree(repo, 'feature/d', 'main', undefined, true)

    expect(result.ok).toBe(false)
    expect(existsSync(join(root, 'repo-feature-d'))).toBe(false)
  })

  it('skips the refresh entirely when updateBase is off (stale base, no fetch)', async () => {
    const before = headOf(repo, 'main')
    advanceRemote('main', 'two')

    const result = await createWorktree(repo, 'feature/off', 'main', undefined, false)

    expect(result.ok).toBe(true)
    // Local main untouched and the new worktree still on the old content.
    expect(headOf(repo, 'main')).toBe(before)
    expect(readFileSync(join(result.path!, 'a.txt'), 'utf8')).toBe('one')
  })

  it('skips the refresh when no base branch is given (existing-branch checkout)', async () => {
    git(repo, 'branch', 'chore')
    advanceRemote('main', 'two')

    const result = await createWorktree(repo, 'chore', undefined, undefined, true)

    expect(result.ok).toBe(true)
  })
})

describe('removeWorktree', () => {
  let root: string
  let repo: string
  let sibling: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-remove-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    sibling = join(root, 'repo-feature-x')
    git(repo, 'worktree', 'add', sibling, '-b', 'feature/x')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('removes a clean non-primary worktree and deletes its folder', async () => {
    const result = await removeWorktree(repo, sibling)

    expect(result).toEqual({ ok: true })
    expect(existsSync(sibling)).toBe(false)
    expect(await listWorktrees(repo)).toHaveLength(1)
  })

  it('refuses a dirty worktree and leaves it intact', async () => {
    writeFileSync(join(sibling, 'a.txt'), 'edited', 'utf8')

    const result = await removeWorktree(repo, sibling)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('1 uncommitted change')
    expect(existsSync(sibling)).toBe(true)
    expect(await listWorktrees(repo)).toHaveLength(2)
  })

  it('counts untracked files as dirty', async () => {
    writeFileSync(join(sibling, 'untracked.txt'), 'wip', 'utf8')

    const result = await removeWorktree(repo, sibling)

    expect(result.ok).toBe(false)
    expect(existsSync(sibling)).toBe(true)
  })

  it("refuses the repo's primary checkout", async () => {
    const result = await removeWorktree(repo, repo)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/primary checkout/i)
    expect(existsSync(repo)).toBe(true)
  })

  it('refuses the primary checkout regardless of path casing/separators', async () => {
    const result = await removeWorktree(repo, repo.toUpperCase().replaceAll('\\', '/'))

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/primary checkout/i)
  })

  it('force-removes a dirty worktree', async () => {
    writeFileSync(join(sibling, 'a.txt'), 'edited', 'utf8')

    const result = await removeWorktree(repo, sibling, { force: true })

    expect(result).toEqual({ ok: true })
    expect(existsSync(sibling)).toBe(false)
  })

  it('force-removes a worktree with mixed dirt and reports each change', async () => {
    // A second committed file so we have something to delete; then modify one,
    // delete another, and leave an untracked file (one of each tracked status).
    writeFileSync(join(sibling, 'b.txt'), 'two', 'utf8')
    git(sibling, 'add', '.')
    git(sibling, 'commit', '-m', 'add b')
    writeFileSync(join(sibling, 'a.txt'), 'edited', 'utf8')
    rmSync(join(sibling, 'b.txt'))
    writeFileSync(join(sibling, 'c.txt'), 'wip', 'utf8')

    const files = await changedFilesOf(sibling)
    expect(files.map((f) => f.status).sort()).toEqual(['deleted', 'modified', 'untracked'])
    // Count parity: one ChangedFile per change, matching listWorktrees' count.
    const listed = (await listWorktrees(repo)).find((w) => w.path === sibling)
    expect(files).toHaveLength(listed?.changes ?? -1)

    const result = await removeWorktree(repo, sibling, { force: true })

    expect(result).toEqual({ ok: true })
    expect(existsSync(sibling)).toBe(false)
    expect(await listWorktrees(repo)).toHaveLength(1)
  })

  it('refuses the primary checkout even under force', async () => {
    const result = await removeWorktree(repo, repo, { force: true })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/primary checkout/i)
    expect(existsSync(repo)).toBe(true)
  })

  it('returns the git error for a path that is not a worktree of the repo', async () => {
    const stranger = join(root, 'not-a-worktree')
    mkdirSync(stranger)

    const result = await removeWorktree(repo, stranger)

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('cleans up the stale entry when the worktree folder vanished externally', async () => {
    rmSync(sibling, { recursive: true, force: true })

    const result = await removeWorktree(repo, sibling)

    expect(result).toEqual({ ok: true })
    expect(await listWorktrees(repo)).toHaveLength(1)
  })
})
