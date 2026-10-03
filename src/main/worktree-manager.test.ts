import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sanitizeBranch,
  worktreeNameFor,
  worktreePathFor,
  type CreateStep
} from '../shared/worktrees'
import type { DirRemovalResult } from './dir-remover'
import { git as gitRunner, gitFailureLine, type GitRunner } from './git'
import { withPostCreateHook, type HookShell } from './post-create-hook'
import {
  removeReleasedFolder,
  startWaitingRemote,
  trackWaitingRemote
} from './waiting-remote.fixture'
import {
  changedFilesOf,
  CHECKOUT_TIMEOUT_MS,
  createWorktree,
  createWorktreeWith,
  GitError,
  listWorktrees,
  parseChangedFiles,
  parsePorcelainBlocks,
  REAL_CREATE_DEPS,
  REFRESH_TIMEOUT_MS,
  removeWorktree,
  worktreeStatus
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

  it("puts git's own failure line in the GitError message (BSLG-16)", async () => {
    const plain = join(root, 'not-a-repo')
    mkdirSync(plain)

    const err = await listWorktrees(plain).then(
      () => null,
      (e: unknown) => e
    )

    const prefix = `git failed in ${plain}: fatal: not a git repository`
    expect(err).toBeInstanceOf(GitError)
    expect((err as GitError).message.slice(0, prefix.length)).toBe(prefix)
  })
})

describe('worktreeStatus (SCRF-06, SCRF-11)', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-st-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    writeFileSync(join(repo, 'b.txt'), 'two', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** The index as git left it: its bytes and its mtime, so a rewrite shows either way. */
  const indexState = (): { bytes: string; mtimeMs: number } => {
    const path = join(repo, '.git', 'index')
    return { bytes: readFileSync(path).toString('base64'), mtimeMs: statSync(path).mtimeMs }
  }

  it('counts modified, staged and untracked files', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed', 'utf8')
    writeFileSync(join(repo, 'staged.txt'), 'staged', 'utf8')
    git(repo, 'add', 'staged.txt')
    writeFileSync(join(repo, 'untracked.txt'), 'untracked', 'utf8')

    expect(await worktreeStatus(repo)).toEqual({ dirty: true, changes: 3 })
  })

  it('reports null, not a clean zero, for a path that vanished', async () => {
    expect(await worktreeStatus(join(root, 'gone'))).toBeNull()
  })

  it('leaves the index untouched while counting an edit', async () => {
    writeFileSync(join(repo, 'a.txt'), 'changed', 'utf8')
    const before = indexState()

    await worktreeStatus(repo)

    expect(indexState()).toEqual(before)
  })

  it('leaves the index untouched while listing an edit', async () => {
    writeFileSync(join(repo, 'b.txt'), 'changed', 'utf8')
    const before = indexState()

    await changedFilesOf(repo)

    expect(indexState()).toEqual(before)
  })
})

describe('parsePorcelainBlocks — locked line (WRFT-01 AC 3)', () => {
  let root: string
  let repo: string
  let locked: string
  let unlocked: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-lock-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    locked = join(root, 'repo-locked')
    unlocked = join(root, 'repo-unlocked')
    git(repo, 'worktree', 'add', locked, '-b', 'feature/locked')
    git(repo, 'worktree', 'add', unlocked, '-b', 'feature/unlocked')
  })

  afterEach(() => {
    // A git lock is bookkeeping only — it holds no OS handle, so the tree removes
    // without unlocking first.
    rmSync(root, { recursive: true, force: true })
  })

  const porcelain = (): string => git(repo, 'worktree', 'list', '--porcelain')

  it("yields git's lock reason for a worktree locked with --reason", async () => {
    git(repo, 'worktree', 'lock', '--reason', 'held for review', locked)

    const block = parsePorcelainBlocks(porcelain()).find((b) => b.path === locked)

    expect(block?.locked).toBe('held for review')
    // Additive only: the fields listWorktrees reads are untouched (Done-when 2).
    const listed = (await listWorktrees(repo)).find((w) => w.path === locked)
    expect(listed).toMatchObject({ branch: 'feature/locked', isDefault: false })
  })

  it('yields an empty reason for a bare locked line — not undefined', () => {
    git(repo, 'worktree', 'lock', locked)

    const block = parsePorcelainBlocks(porcelain()).find((b) => b.path === locked)

    expect(block?.locked).toBe('')
    expect(block?.locked).not.toBeUndefined()
  })

  it('leaves locked undefined for a worktree that is not locked', () => {
    git(repo, 'worktree', 'lock', '--reason', 'held for review', locked)

    const blocks = parsePorcelainBlocks(porcelain())

    expect(blocks.find((b) => b.path === unlocked)?.locked).toBeUndefined()
    expect(blocks.find((b) => b.path === repo)?.locked).toBeUndefined()
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

  it('surfaces the destination path for a rename and keeps its old path', () => {
    // FDSC-24: the old path travels with the new one (supersedes the
    // destination-only shape).
    expect(parseChangedFiles('R  old/a.txt -> new/a.txt')).toStrictEqual([
      { path: 'new/a.txt', status: 'renamed', oldPath: 'old/a.txt' }
    ])
  })

  it('surfaces the destination path for a copy, labels it added and keeps its source', () => {
    expect(parseChangedFiles('C  src.txt -> copy.txt')).toStrictEqual([
      { path: 'copy.txt', status: 'added', oldPath: 'src.txt' }
    ])
  })

  it('keeps the old path of a rename edited or deleted after staging', () => {
    expect(parseChangedFiles('RM old.txt -> new.txt')).toStrictEqual([
      { path: 'new.txt', status: 'renamed', oldPath: 'old.txt' }
    ])
    expect(parseChangedFiles('RD old.txt -> new.txt')).toStrictEqual([
      { path: 'new.txt', status: 'deleted', oldPath: 'old.txt' }
    ])
  })

  it('unquotes each side of a rename on its own', () => {
    // \303\251 == "é"; the new side is quoted for its space alone.
    expect(parseChangedFiles('R  "caf\\303\\251 old.txt" -> "new name.txt"')).toStrictEqual([
      { path: 'new name.txt', status: 'renamed', oldPath: 'café old.txt' }
    ])
  })

  it('keeps a literal " -> " inside a non-rename path intact', () => {
    // Only rename/copy codes carry the arrow; a modified path that happens to
    // contain " -> " must pass through unsplit, with no old path.
    expect(parseChangedFiles(' M a -> b.txt')).toStrictEqual([
      { path: 'a -> b.txt', status: 'modified' }
    ])
  })

  it('gives untracked and modified entries no oldPath key', () => {
    const [untracked, modified] = parseChangedFiles('?? new.txt\n M edited.txt')

    expect('oldPath' in untracked).toBe(false)
    expect('oldPath' in modified).toBe(false)
  })

  it('picks the most-destructive label when index and worktree disagree', () => {
    // Precedence: deleted > added > renamed > modified.
    expect(parseChangedFiles('AD gone.txt')[0].status).toBe('deleted')
    expect(parseChangedFiles('MM both.txt')[0].status).toBe('modified')
    expect(parseChangedFiles('RM moved.txt -> there.txt')[0]).toStrictEqual({
      path: 'there.txt',
      status: 'renamed',
      oldPath: 'moved.txt'
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

describe('changedFilesOf', () => {
  let repo: string

  beforeEach(() => {
    repo = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-cf-')))
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    // L-026: this machine's system gitconfig may set these differently.
    git(repo, 'config', 'core.autocrlf', 'false')
    git(repo, 'config', 'status.renames', 'true')
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('reports a staged rename with its old path', async () => {
    git(repo, 'mv', 'a.ts', 'b.ts')

    expect(await changedFilesOf(repo)).toStrictEqual([
      { path: 'b.ts', status: 'renamed', oldPath: 'a.ts' }
    ])
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

  it("returns git's fatal: line, not its progress note, when worktree add fails (BSLG-14)", async () => {
    git(repo, 'branch', 'user')

    const result = await createWorktree(repo, 'user/x', 'main')

    expect(result.ok).toBe(false)
    const prefix = "fatal: cannot lock ref 'refs/heads/user/x'"
    expect(result.error?.slice(0, prefix.length)).toBe(prefix)
    expect(result.error).not.toContain('Preparing worktree')
  })
})

describe('createWorktree — existing branch (EXB)', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-exb-')))
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

  const headOf = (ref: string): string => git(repo, 'rev-parse', ref).trim()

  /** Create `branch` ahead of main with distinct a.txt content, leaving main checked out. */
  const branchAhead = (branch: string, content: string): void => {
    git(repo, 'checkout', '-b', branch)
    writeFileSync(join(repo, 'a.txt'), content, 'utf8')
    git(repo, 'commit', '-am', `work on ${branch}`)
    git(repo, 'checkout', 'main')
  }

  it('signals a conflict and mutates nothing when the branch already exists', async () => {
    branchAhead('feature/dupe', 'branch-work')
    const tipBefore = headOf('feature/dupe')

    const result = await createWorktree(repo, 'feature/dupe', 'main')

    expect(result).toEqual({ ok: false, conflict: 'branch-exists' })
    expect(result.error).toBeUndefined()
    // No worktree created, branch tip untouched.
    expect(existsSync(join(root, 'repo-feature-dupe'))).toBe(false)
    expect(await listWorktrees(repo)).toHaveLength(1)
    expect(headOf('feature/dupe')).toBe(tipBefore)
  })

  it('reuse checks out the existing branch at its own tip, ignoring the base', async () => {
    branchAhead('feature/reuse', 'reuse-content')

    const result = await createWorktree(repo, 'feature/reuse', 'main', undefined, false, 'reuse')

    expect(result.ok).toBe(true)
    // The worktree carries the existing branch's commit — not main's 'one'.
    expect(readFileSync(join(result.path!, 'a.txt'), 'utf8')).toBe('reuse-content')
    const listed = (await listWorktrees(repo)).find((w) => w.path === result.path)
    expect(listed?.branch).toBe('feature/reuse')
  })

  it('recreate force-deletes the branch and recuts it from the base tip', async () => {
    branchAhead('feature/re', 'stale-work')
    const oldTip = headOf('feature/re')

    const result = await createWorktree(repo, 'feature/re', 'main', undefined, false, 'recreate')

    expect(result.ok).toBe(true)
    // Recut from main: main's content, and the branch now points at main's tip…
    expect(readFileSync(join(result.path!, 'a.txt'), 'utf8')).toBe('one')
    expect(headOf('feature/re')).toBe(headOf('main'))
    // …the old branch's unique commit is gone.
    expect(headOf('feature/re')).not.toBe(oldTip)
  })

  it('blocks with an error naming the host when the branch is checked out elsewhere', async () => {
    const live = join(root, 'repo-live')
    git(repo, 'worktree', 'add', live, '-b', 'feature/live')

    const result = await createWorktree(repo, 'feature/live', 'main')

    expect(result.ok).toBe(false)
    expect(result.conflict).toBeUndefined()
    expect(result.error).toContain(live)
    expect(existsSync(join(root, 'repo-feature-live'))).toBe(false)
  })

  it('blocks a reuse re-invoke against a branch checked out elsewhere', async () => {
    const live = join(root, 'repo-live')
    git(repo, 'worktree', 'add', live, '-b', 'feature/live')

    const result = await createWorktree(repo, 'feature/live', 'main', undefined, false, 'reuse')

    expect(result.ok).toBe(false)
    expect(result.conflict).toBeUndefined()
    expect(result.error).toContain(live)
  })

  it('blocks a recreate re-invoke against a branch checked out elsewhere', async () => {
    const live = join(root, 'repo-live')
    git(repo, 'worktree', 'add', live, '-b', 'feature/live')
    const tipBefore = git(repo, 'rev-parse', 'feature/live').trim()

    const result = await createWorktree(repo, 'feature/live', 'main', undefined, false, 'recreate')

    expect(result.ok).toBe(false)
    expect(result.conflict).toBeUndefined()
    expect(result.error).toContain(live)
    // The host guard runs before the force-delete — the branch is never touched.
    expect(git(repo, 'rev-parse', 'feature/live').trim()).toBe(tipBefore)
  })

  it('short-circuits on target-path collision before the branch check', async () => {
    branchAhead('feature/dupe', 'branch-work')
    mkdirSync(join(root, 'repo-feature-dupe'))

    const result = await createWorktree(repo, 'feature/dupe', 'main')

    // The path guard wins over the branch-exists signal (ordering).
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/exists/i)
    expect(result.conflict).toBeUndefined()
  })
})

describe('createWorktree — path check (BSLG-25..39)', () => {
  const refMessage = (n: number): string =>
    `The branch's ref path is ${n} characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository.`
  const reflogMessage = (n: number): string =>
    `The branch's reflog folder path is ${n} characters, over Windows' limit of 247 for a folder. Shorten the name, or enable core.longpaths in the repository.`
  const folderMessage = (n: number): string =>
    `The worktree folder path is ${n} characters, over the 215 git accepts. Shorten the name, or use a shorter worktree template such as {repo}-{id}.`
  /** The owner's template: the folder never grows with the branch. */
  const IDS = '{repo}-{id}'
  const win32 = { platform: 'win32' as const, git: gitRunner }

  let root: string
  let repo: string
  /** The common git dir as Windows counts it, from the OS's canonical path. */
  let commonDir: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-paths-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'core.autocrlf', 'false')
    git(repo, 'config', 'core.longpaths', 'false')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    commonDir = `${repo}\\.git`
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** `user/dev/<id>-bbb…`, whose ref path is exactly `length` characters. */
  function branchWithRefPath(id: number, length: number): string {
    const head = `user/dev/${id}-`
    const overhead = `${commonDir}\\refs\\heads\\`.length + '.lock'.length
    return head + 'b'.repeat(length - overhead - head.length)
  }
  const refPathOf = (branch: string): number =>
    `${commonDir}\\refs\\heads\\${branch.replaceAll('/', '\\')}.lock`.length
  const resolves = (branch: string, ...config: string[]): boolean => {
    try {
      git(repo, ...config, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`)
      return true
    } catch {
      return false
    }
  }
  /** BSLG-26: the repository's own core.longpaths is still what the test set. */
  const expectLongPaths = (value: string): void => {
    expect(git(repo, 'config', '--local', '--get', 'core.longpaths').trim()).toBe(value)
  }
  const worktreeCount = (): number =>
    git(repo, 'worktree', 'list', '--porcelain')
      .split(/\r?\n/)
      .filter((line) => line.startsWith('worktree ')).length

  it('refuses a ref path of 260 and leaves no folder, branch or worktree (BSLG-25, BSLG-35)', async () => {
    const branch = branchWithRefPath(11, 260)
    expect(refPathOf(branch)).toBe(260)

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      IDS,
      false,
      undefined
    )

    expect(result).toEqual({ ok: false, error: refMessage(260) })
    expect(existsSync(worktreePathFor(repo, branch, IDS))).toBe(false)
    expect(git(repo, 'branch', '--list', branch).trim()).toBe('')
    expect(worktreeCount()).toBe(1)
    expectLongPaths('false')
  })

  it('refuses before refreshing the base: no fetch error from a missing remote (BSLG-25)', async () => {
    git(repo, 'branch', 'base')
    git(repo, 'remote', 'add', 'gone', join(root, 'missing-remote'))
    git(repo, 'update-ref', 'refs/remotes/gone/base', 'HEAD')
    git(repo, 'config', 'branch.base.remote', 'gone')
    git(repo, 'config', 'branch.base.merge', 'refs/heads/base')
    // The refresh fails when it runs: a short name reaches it and gets git's fetch error.
    const short = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      'user/dev/12-x',
      'base',
      IDS,
      true,
      undefined
    )
    expect(short.ok).toBe(false)
    expect(short.error).not.toMatch(/ref path/)

    const branch = branchWithRefPath(13, 260)
    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'base',
      IDS,
      true,
      undefined
    )

    expect(result).toEqual({ ok: false, error: refMessage(260) })
    expectLongPaths('false')
  })

  it('creates a ref path of 259, the last length git accepts (BSLG-35)', async () => {
    const branch = branchWithRefPath(14, 259)
    expect(refPathOf(branch)).toBe(259)

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      IDS,
      false,
      undefined
    )

    expect(result).toEqual({ ok: true, path: worktreePathFor(repo, branch, IDS) })
    expect(resolves(branch)).toBe(true)
    expectLongPaths('false')
  })

  it('creates a ref path of 270 when the repository enables core.longpaths (BSLG-21)', async () => {
    git(repo, 'config', 'core.longpaths', 'true')
    const branch = branchWithRefPath(15, 270)
    expect(refPathOf(branch)).toBe(270)

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      IDS,
      false,
      undefined
    )

    expect(result).toEqual({ ok: true, path: worktreePathFor(repo, branch, IDS) })
    expect(resolves(branch)).toBe(true)
    expectLongPaths('true')
  })

  it('refuses Recreate of a 270 ref path before deleting the branch (BSLG-38)', async () => {
    const branch = branchWithRefPath(16, 270)
    git(repo, '-c', 'core.longpaths=true', 'branch', branch, 'main')
    git(repo, '-c', 'core.longpaths=true', 'pack-refs', '--all')
    const tip = git(repo, '-c', 'core.longpaths=true', 'rev-parse', `refs/heads/${branch}`).trim()

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      IDS,
      false,
      'recreate'
    )

    expect(result).toEqual({ ok: false, error: refMessage(270) })
    expect(resolves(branch, '-c', 'core.longpaths=true')).toBe(true)
    expect(git(repo, '-c', 'core.longpaths=true', 'rev-parse', `refs/heads/${branch}`).trim()).toBe(
      tip
    )
    expectLongPaths('false')
  })

  it('checks out an existing M2-shaped branch on Reuse, as git accepts it (BSLG-37)', async () => {
    // Reflog folder 248 (past 247) and ref path 251; git resolves it with core.longpaths off,
    // and `worktree add <folder> <branch>` succeeds (design.md, Measurements).
    const dirs = 'user/' + 'd'.repeat(248 - `${commonDir}\\logs\\refs\\heads\\`.length - 5)
    const branch = `${dirs}/ab`
    expect(`${commonDir}\\logs\\refs\\heads\\${dirs.replaceAll('/', '\\')}`).toHaveLength(248)
    expect(refPathOf(branch)).toBe(251)
    git(repo, '-c', 'core.longpaths=true', 'branch', branch, 'main')
    expect(resolves(branch)).toBe(true)

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      'reuse-wt',
      false,
      'reuse'
    )

    expect(result).toEqual({ ok: true, path: join(root, 'reuse-wt') })
    expect(git(result.path!, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe(branch)
    expectLongPaths('false')
  })

  it('refuses Recreate of an M2-shaped branch git can see before deleting it (BSLG-25, BSLG-38)', async () => {
    // Reflog folder 248 and ref path 251: git resolves the branch with core.longpaths off, so the
    // create reaches the Recreate fork, and only the check placed before it keeps `branch -D` away.
    const dirs = 'user/' + 'r'.repeat(248 - `${commonDir}\\logs\\refs\\heads\\`.length - 5)
    const branch = `${dirs}/ab`
    expect(`${commonDir}\\logs\\refs\\heads\\${dirs.replaceAll('/', '\\')}`).toHaveLength(248)
    expect(refPathOf(branch)).toBe(251)
    git(repo, '-c', 'core.longpaths=true', 'branch', branch, 'main')
    expect(resolves(branch)).toBe(true)
    const tip = git(repo, 'rev-parse', `refs/heads/${branch}`).trim()

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      'recreate-wt',
      false,
      'recreate'
    )

    expect(result).toEqual({ ok: false, error: reflogMessage(248) })
    expect(existsSync(join(root, 'recreate-wt'))).toBe(false)
    expect(git(repo, 'rev-parse', `refs/heads/${branch}`).trim()).toBe(tip)
    expect(worktreeCount()).toBe(1)
    expectLongPaths('false')
  })

  it('refuses a worktree folder of 216 under the default template and creates nothing (BSLG-30)', async () => {
    const prefix = `${root}\\repo-`
    const branch = 'f/' + 'x'.repeat(216 - prefix.length - 2)
    const target = worktreePathFor(repo, branch)
    expect(target).toHaveLength(216)

    const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
      repo,
      branch,
      'main',
      undefined,
      false,
      undefined
    )

    expect(result).toEqual({ ok: false, error: folderMessage(216) })
    expect(existsSync(target)).toBe(false)
    expect(git(repo, 'branch', '--list', branch).trim()).toBe('')
    expect(worktreeCount()).toBe(1)
    expectLongPaths('false')
  })

  it("returns git's fatal line when core.longpaths is not a boolean (BSLG-39)", async () => {
    git(repo, 'config', 'core.longpaths', 'maybe')
    try {
      const result = await createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(
        repo,
        'user/dev/17-x',
        'main',
        IDS,
        false,
        undefined
      )

      expect(result.ok).toBe(false)
      const prefix = 'fatal: bad boolean config value'
      expect(result.error?.slice(0, prefix.length)).toBe(prefix)
      expect(existsSync(worktreePathFor(repo, 'user/dev/17-x', IDS))).toBe(false)
    } finally {
      // git refuses to run inside the repository now; reset the value from outside it.
      git(root, 'config', '--file', join(repo, '.git', 'config'), 'core.longpaths', 'false')
    }
    expectLongPaths('false')
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

  it('recreate refreshes the base first, then recuts the branch from the remote tip', async () => {
    // An existing branch with its own commit; the remote advances past local main.
    git(repo, 'checkout', '-b', 'feature/re')
    writeFileSync(join(repo, 'a.txt'), 'stale', 'utf8')
    git(repo, 'commit', '-am', 'stale work')
    git(repo, 'checkout', 'main')
    advanceRemote('main', 'two')

    const result = await createWorktree(repo, 'feature/re', 'main', undefined, true, 'recreate')

    expect(result.ok).toBe(true)
    // Base refreshed to the remote tip…
    expect(headOf(repo, 'main')).toBe(headOf(repo, 'origin/main'))
    // …and the recut branch carries the refreshed content, not the stale branch work.
    expect(readFileSync(join(result.path!, 'a.txt'), 'utf8')).toBe('two')
  })

  it('recreate preserves the branch when the pre-delete base refresh fails', async () => {
    // Local main diverges from its remote so the refresh can't fast-forward.
    writeFileSync(join(repo, 'a.txt'), 'local', 'utf8')
    git(repo, 'commit', '-am', 'local change')
    advanceRemote('main', 'remote')
    git(repo, 'branch', 'feature/re')
    const tipBefore = headOf(repo, 'feature/re')

    const result = await createWorktree(repo, 'feature/re', 'main', undefined, true, 'recreate')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/diverged|fast-forward/i)
    // EXB-D8: a preliminary-step failure must not destroy the branch.
    expect(headOf(repo, 'feature/re')).toBe(tipBefore)
    expect(existsSync(join(root, 'repo-feature-re'))).toBe(false)
  })
})

describe('createWorktree — bounded calls (CRTO-01, CRTO-09)', () => {
  let root: string
  let origin: string
  let repo: string
  let calls: { args: string[]; opts?: { timeoutMs?: number } }[]

  /** Delegates to the real git and logs every call with its options. */
  const recording: GitRunner = (cwd, args, opts) => {
    calls.push({ args, opts })
    return gitRunner(cwd, args, opts)
  }
  const create = (): ReturnType<typeof createWorktreeWith> =>
    createWorktreeWith({ ...REAL_CREATE_DEPS, run: recording })

  /** The options of the one recorded call whose arguments start with `prefix`. */
  const optsOf = (...prefix: string[]): { timeoutMs?: number } | undefined => {
    const matched = calls.filter((c) => prefix.every((arg, i) => c.args[i] === arg))
    expect(matched).toHaveLength(1)
    return matched[0].opts
  }
  /** Every recorded local read (`rev-parse`, `worktree list`, `branch -D`) runs unbounded. */
  const expectLocalReadsUnbounded = (): void => {
    const reads = calls.filter(
      (c) =>
        c.args[0] === 'rev-parse' ||
        (c.args[0] === 'worktree' && c.args[1] === 'list') ||
        (c.args[0] === 'branch' && c.args[1] === '-D')
    )
    expect(reads.length).toBeGreaterThan(0)
    for (const read of reads) expect(read.opts?.timeoutMs).toBeUndefined()
  }

  beforeEach(() => {
    calls = []
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-bounded-')))
    origin = join(root, 'origin')
    repo = join(root, 'repo')
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

  it('pins the limits: 60 s for each refresh call, 10 min for the checkout (L-009)', () => {
    expect(REFRESH_TIMEOUT_MS).toBe(60000)
    expect(CHECKOUT_TIMEOUT_MS).toBe(600000)
    expect(REAL_CREATE_DEPS).toStrictEqual({
      run: gitRunner,
      refreshTimeoutMs: 60000,
      checkoutTimeoutMs: 600000
    })
  })

  it('bounds the fetch and the merge --ff-only of a checked-out base, and the add (CRTO-01)', async () => {
    const result = await create()(repo, 'feature/a', 'main', undefined, true)

    expect(result.ok).toBe(true)
    expect(optsOf('fetch', 'origin', 'main')).toEqual({ timeoutMs: 60000 })
    expect(optsOf('merge', '--ff-only', 'origin/main')).toEqual({ timeoutMs: 60000 })
    expect(optsOf('worktree', 'add')).toEqual({ timeoutMs: 600000 })
    expectLocalReadsUnbounded()
  })

  it('bounds the fetch into a base that is not checked out (CRTO-01)', async () => {
    git(repo, 'checkout', '-b', 'release')
    git(repo, 'push', '-u', 'origin', 'release')
    git(repo, 'checkout', 'main')

    const result = await create()(repo, 'feature/r', 'release', undefined, true)

    expect(result.ok).toBe(true)
    expect(optsOf('fetch', 'origin', 'release:release')).toEqual({ timeoutMs: 60000 })
    expect(optsOf('worktree', 'add')).toEqual({ timeoutMs: 600000 })
    expectLocalReadsUnbounded()
  })

  it('bounds the add of an existing branch with an empty base (CRTO-09)', async () => {
    git(repo, 'branch', 'chore')

    const result = await create()(repo, 'chore')

    expect(result.ok).toBe(true)
    expect(optsOf('worktree', 'add')).toEqual({ timeoutMs: 600000 })
  })

  it('bounds the add of a reused branch (CRTO-09)', async () => {
    git(repo, 'branch', 'feature/reuse')

    const result = await create()(repo, 'feature/reuse', 'main', undefined, false, 'reuse')

    expect(result.ok).toBe(true)
    expect(optsOf('worktree', 'add')).toEqual({ timeoutMs: 600000 })
    expectLocalReadsUnbounded()
  })

  it('bounds the refresh and the add of a recreate, not its branch -D (CRTO-01, CRTO-09)', async () => {
    git(repo, 'branch', 'feature/re')

    const result = await create()(repo, 'feature/re', 'main', undefined, true, 'recreate')

    expect(result.ok).toBe(true)
    expect(optsOf('fetch', 'origin', 'main')).toEqual({ timeoutMs: 60000 })
    expect(optsOf('merge', '--ff-only', 'origin/main')).toEqual({ timeoutMs: 60000 })
    expect(optsOf('branch', '-D', 'feature/re')?.timeoutMs).toBeUndefined()
    expect(optsOf('worktree', 'add')).toEqual({ timeoutMs: 600000 })
    expectLocalReadsUnbounded()
  })
})

/** Rejects the way `git()` does when its timeout kills git: `killed: true`. */
const killed = (): Error => Object.assign(new Error('Command failed: killed'), { killed: true })

/** True when `args` is exactly `match`. */
const sameArgs = (args: string[], match: string[]): boolean =>
  args.length === match.length && match.every((arg, i) => args[i] === arg)

/**
 * A runner whose `match` call never settles on its own: it rejects with
 * `killed: true` only when its `timeoutMs` elapses, like `execFile`'s kill.
 * Every other call goes to the real git without a limit, since the tests' limits
 * of a few milliseconds are meant for the hung call alone.
 */
const hangingWhere =
  (matches: (args: string[]) => boolean): GitRunner =>
  (cwd, args, opts) => {
    if (!matches(args)) return gitRunner(cwd, args)
    return new Promise((_resolve, reject) => {
      if (opts?.timeoutMs !== undefined) setTimeout(() => reject(killed()), opts.timeoutMs)
    })
  }
const hangingOn = (...match: string[]): GitRunner => hangingWhere((args) => sameArgs(args, match))
/** True for any `git worktree add`, whatever its target and branch. */
const isAdd = (args: string[]): boolean => args[0] === 'worktree' && args[1] === 'add'

/** A runner whose `match` call is killed at once, whatever its limit. */
const killedAtOnce =
  (...match: string[]): GitRunner =>
  (cwd, args, opts) =>
    sameArgs(args, match) ? Promise.reject(killed()) : gitRunner(cwd, args, opts)

describe('createWorktree — refresh timeout (CRTO-02..04)', () => {
  const FETCH_TEXT =
    'Fetching origin/main timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.'
  const FF_TEXT =
    'Fast-forwarding "main" to origin/main timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.'
  /** Limits of 20 ms for the never-settling runner; the texts then read `0.02 s`. */
  const FAKE_LIMITS = { refreshTimeoutMs: 20, checkoutTimeoutMs: 20 }

  let root: string
  let origin: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-refresh-timeout-')))
    origin = join(root, 'origin')
    repo = join(root, 'repo')
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

  const branchResolves = (branch: string): boolean => {
    try {
      git(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`)
      return true
    } catch {
      return false
    }
  }

  it('ends the create on a hung fetch with the fetch text and makes nothing (CRTO-02)', async () => {
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      ...FAKE_LIMITS,
      run: hangingOn('fetch', 'origin', 'main')
    })

    const result = await create(repo, 'feature/hung', 'main', undefined, true)

    expect(result).toEqual({
      ok: false,
      error:
        'Fetching origin/main timed out after 0.02 s. Retry, or uncheck "Update base branch from remote" to skip.'
    })
    expect(existsSync(join(root, 'repo-feature-hung'))).toBe(false)
    expect(branchResolves('feature/hung')).toBe(false)
  })

  it('ends the create on a hung merge --ff-only with the fast-forward text (CRTO-03)', async () => {
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      ...FAKE_LIMITS,
      run: hangingOn('merge', '--ff-only', 'origin/main')
    })

    const result = await create(repo, 'feature/hung', 'main', undefined, true)

    expect(result).toEqual({
      ok: false,
      error:
        'Fast-forwarding "main" to origin/main timed out after 0.02 s. Retry, or uncheck "Update base branch from remote" to skip.'
    })
    expect(existsSync(join(root, 'repo-feature-hung'))).toBe(false)
    expect(branchResolves('feature/hung')).toBe(false)
  })

  it('ends the create on a hung fetch into an unchecked base with the fast-forward text (CRTO-03)', async () => {
    git(repo, 'checkout', '-b', 'release')
    git(repo, 'push', '-u', 'origin', 'release')
    git(repo, 'checkout', 'main')
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      ...FAKE_LIMITS,
      run: hangingOn('fetch', 'origin', 'release:release')
    })

    const result = await create(repo, 'feature/hung', 'release', undefined, true)

    expect(result).toEqual({
      ok: false,
      error:
        'Fast-forwarding "release" to origin/release timed out after 0.02 s. Retry, or uncheck "Update base branch from remote" to skip.'
    })
    expect(existsSync(join(root, 'repo-feature-hung'))).toBe(false)
    expect(branchResolves('feature/hung')).toBe(false)
  })

  it('keeps the existing branch at its tip when a recreate fetch hangs (CRTO-04)', async () => {
    git(repo, 'checkout', '-b', 'feature/re')
    writeFileSync(join(repo, 'a.txt'), 'branch-work', 'utf8')
    git(repo, 'commit', '-am', 'branch work')
    git(repo, 'checkout', 'main')
    const tipBefore = git(repo, 'rev-parse', 'feature/re').trim()
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      ...FAKE_LIMITS,
      run: hangingOn('fetch', 'origin', 'main')
    })

    const result = await create(repo, 'feature/re', 'main', undefined, true, 'recreate')

    expect(result).toEqual({
      ok: false,
      error:
        'Fetching origin/main timed out after 0.02 s. Retry, or uncheck "Update base branch from remote" to skip.'
    })
    expect(git(repo, 'rev-parse', 'feature/re').trim()).toBe(tipBefore)
    expect(existsSync(join(root, 'repo-feature-re'))).toBe(false)
  })

  it('reads 60 s in the fetch text with the real limit (CRTO-02)', async () => {
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      run: killedAtOnce('fetch', 'origin', 'main')
    })

    const result = await create(repo, 'feature/t', 'main', undefined, true)

    expect(result).toEqual({ ok: false, error: FETCH_TEXT })
  })

  it('reads 60 s in the fast-forward text with the real limit (CRTO-03)', async () => {
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      run: killedAtOnce('merge', '--ff-only', 'origin/main')
    })

    const result = await create(repo, 'feature/t', 'main', undefined, true)

    expect(result).toEqual({ ok: false, error: FF_TEXT })
  })

  it("keeps git's own line for a fetch that fails without a kill (WBR-02)", async () => {
    git(repo, 'remote', 'set-url', 'origin', join(root, 'missing-remote'))
    const direct = await gitRunner(repo, ['fetch', 'origin', 'main']).then(
      () => new Error('the fetch succeeded'),
      (e: unknown) => e
    )

    const result = await createWorktree(repo, 'feature/gone', 'main', undefined, true)

    expect(result).toEqual({ ok: false, error: gitFailureLine(direct) })
    expect(result.error).toMatch(/^fatal: /)
  })
})

describe('createWorktree — checkout timeout (CRTO-10)', () => {
  /** The checkout text for a limit written as `limit` and a target folder. */
  const checkoutText = (limit: string, target: string): string =>
    `Creating the worktree timed out after ${limit} and git was stopped. Part of it may remain at ${target}; remove it before retrying.`
  const hungAdd = createWorktreeWith({
    ...REAL_CREATE_DEPS,
    refreshTimeoutMs: 20,
    checkoutTimeoutMs: 20,
    run: hangingWhere(isAdd)
  })

  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-checkout-timeout-')))
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

  it('ends a new-branch create when the add hangs', async () => {
    const result = await hungAdd(repo, 'feature/new', 'main')

    expect(result).toEqual({
      ok: false,
      error: checkoutText('0.02 s', join(root, 'repo-feature-new'))
    })
  })

  it('ends an existing-branch create (empty base) when the add hangs', async () => {
    git(repo, 'branch', 'chore')

    const result = await hungAdd(repo, 'chore')

    expect(result).toEqual({ ok: false, error: checkoutText('0.02 s', join(root, 'repo-chore')) })
  })

  it('ends a reuse when the add hangs', async () => {
    git(repo, 'branch', 'feature/reuse')

    const result = await hungAdd(repo, 'feature/reuse', 'main', undefined, false, 'reuse')

    expect(result).toEqual({
      ok: false,
      error: checkoutText('0.02 s', join(root, 'repo-feature-reuse'))
    })
  })

  it('ends a recreate when the add hangs', async () => {
    git(repo, 'branch', 'feature/re')

    const result = await hungAdd(repo, 'feature/re', 'main', undefined, false, 'recreate')

    expect(result).toEqual({
      ok: false,
      error: checkoutText('0.02 s', join(root, 'repo-feature-re'))
    })
  })

  it('reads 10 min and names the target with the real limit', async () => {
    const create = createWorktreeWith({
      ...REAL_CREATE_DEPS,
      run: (cwd, args, opts) =>
        isAdd(args) ? Promise.reject(killed()) : gitRunner(cwd, args, opts)
    })

    const result = await create(repo, 'feature/t', 'main')

    expect(result).toEqual({
      ok: false,
      error: `Creating the worktree timed out after 10 min and git was stopped. Part of it may remain at ${join(root, 'repo-feature-t')}; remove it before retrying.`
    })
  })

  it('does not run the post-create command after a checkout timeout (WPC-08)', async () => {
    const shellCalls: string[] = []
    const shell: HookShell = async (cmd) => {
      shellCalls.push(cmd)
      return { code: 0, stdout: '', stderr: '' }
    }
    const create = withPostCreateHook(hungAdd, { readCommand: () => 'echo init', shell })

    const result = await create(repo, 'feature/hooked', 'main')

    expect(result).toEqual({
      ok: false,
      error: checkoutText('0.02 s', join(root, 'repo-feature-hooked'))
    })
    expect(shellCalls).toEqual([])
  })
})

describe('createWorktree — a real fetch that waits for credentials (CRTO-02)', () => {
  let root: string
  let repo: string
  let remote: Awaited<ReturnType<typeof startWaitingRemote>>

  beforeEach(async () => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-waiting-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    remote = await startWaitingRemote()
    trackWaitingRemote(repo, remote.url)
  })

  afterEach(async () => {
    await remote.close()
    await removeReleasedFolder(root)
  })

  it('ends the create at the refresh limit with the fetch text and no worktree', async () => {
    const create = createWorktreeWith({ ...REAL_CREATE_DEPS, refreshTimeoutMs: 2000 })

    const result = await create(repo, 'feature/waiting', 'main', undefined, true)

    expect(result).toEqual({
      ok: false,
      error:
        'Fetching origin/main timed out after 2 s. Retry, or uncheck "Update base branch from remote" to skip.'
    })
    expect(existsSync(join(root, 'repo-feature-waiting'))).toBe(false)
    expect(git(repo, 'worktree', 'list', '--porcelain')).not.toContain('feature/waiting')
  })
})

describe('createWorktree — steps (CRTO-11, CRTO-12, CRTO-14, CRTO-15)', () => {
  vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 })

  let root: string
  let origin: string
  let repo: string
  let steps: CreateStep[]
  const onStep = (step: CreateStep): void => {
    steps.push(step)
  }

  beforeEach(() => {
    steps = []
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-steps-')))
    origin = join(root, 'origin')
    repo = join(root, 'repo')
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

  it('reports the refresh, then the checkout, when the refresh is on', async () => {
    const result = await createWorktree(
      repo,
      'feature/a',
      'main',
      undefined,
      true,
      undefined,
      onStep
    )

    expect(result.ok).toBe(true)
    expect(steps).toEqual(['refreshing-base', 'creating-worktree'])
  })

  it('reports only the checkout when the refresh is off (CRTO-12)', async () => {
    const result = await createWorktree(
      repo,
      'feature/b',
      'main',
      undefined,
      false,
      undefined,
      onStep
    )

    expect(result.ok).toBe(true)
    expect(steps).toEqual(['creating-worktree'])
  })

  it('reports only the checkout for an existing branch with an empty base (CRTO-12)', async () => {
    git(repo, 'branch', 'chore')

    const result = await createWorktree(
      repo,
      'chore',
      undefined,
      undefined,
      true,
      undefined,
      onStep
    )

    expect(result.ok).toBe(true)
    expect(steps).toEqual(['creating-worktree'])
  })

  it('reports only the checkout for a reuse, even with the refresh on (CRTO-12)', async () => {
    git(repo, 'branch', 'feature/reuse')

    const result = await createWorktree(
      repo,
      'feature/reuse',
      'main',
      undefined,
      true,
      'reuse',
      onStep
    )

    expect(result.ok).toBe(true)
    expect(steps).toEqual(['creating-worktree'])
  })

  it('reports the refresh, then the checkout, for a recreate with the refresh on', async () => {
    git(repo, 'branch', 'feature/re')

    const result = await createWorktree(
      repo,
      'feature/re',
      'main',
      undefined,
      true,
      'recreate',
      onStep
    )

    expect(result.ok).toBe(true)
    expect(steps).toEqual(['refreshing-base', 'creating-worktree'])
  })

  it('reports nothing after a refresh that failed (CRTO-14)', async () => {
    git(repo, 'branch', 'local-only')

    const result = await createWorktree(
      repo,
      'feature/c',
      'local-only',
      undefined,
      true,
      undefined,
      onStep
    )

    expect(result.ok).toBe(false)
    expect(steps).toEqual(['refreshing-base'])
  })

  it('reports nothing for a branch-exists conflict (CRTO-14)', async () => {
    git(repo, 'branch', 'feature/taken')

    const result = await createWorktree(
      repo,
      'feature/taken',
      'main',
      undefined,
      true,
      undefined,
      onStep
    )

    expect(result).toEqual({ ok: false, conflict: 'branch-exists' })
    expect(steps).toEqual([])
  })

  it('reports nothing when the target folder exists (CRTO-14)', async () => {
    mkdirSync(join(root, 'repo-feature-d'))

    const result = await createWorktree(
      repo,
      'feature/d',
      'main',
      undefined,
      true,
      undefined,
      onStep
    )

    expect(result.ok).toBe(false)
    expect(steps).toEqual([])
  })

  it('reports nothing when the template renders an empty folder name (CRTO-14)', async () => {
    const result = await createWorktree(
      repo,
      'chore/cleanup',
      'main',
      '{id}',
      true,
      undefined,
      onStep
    )

    expect(result.ok).toBe(false)
    expect(steps).toEqual([])
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
    // WRFT-04 AC 3: a guard refusal carries no leftover — nothing was deleted,
    // and WorktreeDetail branches on the field to offer a retry that this
    // refusal can never satisfy.
    expect(result.leftover).toBeUndefined()
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
    // WRFT-04 AC 3: a guard refusal carries no leftover (see the dirty case).
    expect(result.leftover).toBeUndefined()
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

  // --- WRFT: delete-first ordering, pre-deletion guards, leftover reporting ---

  /** A deleter that records every call and never touches the disk. */
  const spyDeleter = (
    result: DirRemovalResult = { ok: true }
  ): { removeDirTree: (p: string) => Promise<DirRemovalResult>; calls: string[] } => {
    const calls: string[] = []
    return {
      calls,
      removeDirTree: async (p: string) => {
        calls.push(p)
        return result
      }
    }
  }

  const porcelainOf = (): string => git(repo, 'worktree', 'list', '--porcelain')

  it('deletes the directory itself before git drops the bookkeeping', async () => {
    // The deleter observes the world at deletion time: git must not have run yet.
    const seen: { registered?: boolean; present?: boolean } = {}
    const deleter = {
      removeDirTree: async (p: string): Promise<DirRemovalResult> => {
        seen.registered = porcelainOf().includes(sibling.replaceAll('\\', '/'))
        seen.present = existsSync(p)
        rmSync(p, { recursive: true, force: true })
        return { ok: true }
      }
    }

    const result = await removeWorktree(repo, sibling, {}, deleter)

    expect(seen).toEqual({ registered: true, present: true })
    expect(result).toEqual({ ok: true })
    expect(existsSync(sibling)).toBe(false)
    expect(await listWorktrees(repo)).toHaveLength(1)
  })

  it('never invokes git and keeps the worktree registered when deletion gives up', async () => {
    const blocked = join(sibling, 'a.txt')
    const stuck = spyDeleter({
      ok: false,
      code: 'EBUSY',
      leftover: { blockedPath: blocked, remaining: 3 }
    })

    const failed = await removeWorktree(repo, sibling, {}, stuck)

    expect(failed.ok).toBe(false)
    // WRFT-04 AC 3: the structured payload must come back out of removeWorktree,
    // not merely go into the deleter — it is what WorktreeDetail branches on.
    expect(failed.leftover).toEqual({ blockedPath: blocked, remaining: 3 })
    expect(existsSync(sibling)).toBe(true)
    expect(porcelainOf()).toContain(sibling.replaceAll('\\', '/'))
    expect(await listWorktrees(repo)).toHaveLength(2)

    // …and the still-registered worktree is itself the retry handle (WRFT-02 AC 2).
    const retried = await removeWorktree(repo, sibling)

    expect(retried).toEqual({ ok: true })
    expect(existsSync(sibling)).toBe(false)
    expect(await listWorktrees(repo)).toHaveLength(1)
  })

  it('names the blocked path, the remaining count and the retry in the failure message', async () => {
    const blocked = join(sibling, 'sub', 'deep.txt')
    const stuck = spyDeleter({
      ok: false,
      code: 'EBUSY',
      leftover: { blockedPath: blocked, remaining: 3 }
    })

    const result = await removeWorktree(repo, sibling, {}, stuck)

    expect(result.error).toContain(blocked)
    expect(result.error).toContain('3 items still on disk')
    expect(result.error).toMatch(/still registered/i)
    expect(result.error).toMatch(/retry/i)
    // WRFT-04 AC 3: message *and* payload — the renderer needs both fields by value.
    expect(result.leftover).toEqual({ blockedPath: blocked, remaining: 3 })
    expect(result.leftover?.blockedPath).toBe(blocked)
    expect(result.leftover?.remaining).toBe(3)
  })

  it('pluralizes a single leftover entry as "1 item"', async () => {
    const stuck = spyDeleter({
      ok: false,
      code: 'EPERM',
      leftover: { blockedPath: sibling, remaining: 1 }
    })

    const result = await removeWorktree(repo, sibling, {}, stuck)

    expect(result.error).toContain('1 item still on disk')
    expect(result.error).not.toContain('1 items')
  })

  it('refuses a path that is not a registered worktree of this repo and deletes nothing', async () => {
    const stranger = join(root, 'not-a-worktree')
    mkdirSync(stranger)
    writeFileSync(join(stranger, 'precious.txt'), 'keep me', 'utf8')
    const deleter = spyDeleter()

    const result = await removeWorktree(repo, stranger, { force: true }, deleter)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not a registered worktree of this repo/i)
    // WRFT-04 AC 3: a guard refusal carries no leftover (see the dirty case).
    expect(result.leftover).toBeUndefined()
    expect(deleter.calls).toEqual([])
    expect(readFileSync(join(stranger, 'precious.txt'), 'utf8')).toBe('keep me')
  })

  it('fails closed when git worktree list itself fails', async () => {
    const notARepo = join(root, 'plain-folder')
    mkdirSync(notARepo)
    const deleter = spyDeleter()

    const result = await removeWorktree(notARepo, sibling, { force: true }, deleter)

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(deleter.calls).toEqual([])
    expect(existsSync(sibling)).toBe(true)
  })

  it("refuses a locked worktree with git's lock reason and deletes nothing", async () => {
    git(repo, 'worktree', 'lock', '--reason', 'held for review', sibling)
    const deleter = spyDeleter()

    const result = await removeWorktree(repo, sibling, {}, deleter)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(result.error).toContain('held for review')
    // A guard refusal never carries a leftover: nothing was deleted, so there is
    // nothing left over, and the renderer must fall back to the flat error line.
    expect(result.leftover).toBeUndefined()
    expect(deleter.calls).toEqual([])
    expect(existsSync(sibling)).toBe(true)
    expect(await listWorktrees(repo)).toHaveLength(2)
  })

  it('refuses a locked worktree under force too', async () => {
    git(repo, 'worktree', 'lock', '--reason', 'held for review', sibling)
    const deleter = spyDeleter()

    const result = await removeWorktree(repo, sibling, { force: true }, deleter)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(deleter.calls).toEqual([])
    expect(existsSync(sibling)).toBe(true)
  })

  it('refuses a bare-locked worktree, whose reason parses to an empty string', async () => {
    git(repo, 'worktree', 'lock', sibling)
    const deleter = spyDeleter()

    const result = await removeWorktree(repo, sibling, {}, deleter)

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/locked/i)
    expect(deleter.calls).toEqual([])
    expect(existsSync(sibling)).toBe(true)
  })

  it("returns git's first line when the bookkeeping step fails, and a retry heals it", async () => {
    // A deleter that reports success without deleting is the deterministic stand-in
    // for git's own bookkeeping failure: git then still sees a populated, dirty
    // worktree and refuses. The branch under test is "deletion ok, git failed".
    writeFileSync(join(sibling, 'untracked.txt'), 'wip', 'utf8')
    const liar = spyDeleter({ ok: true })

    const failed = await removeWorktree(repo, sibling, { force: true }, liar)

    expect(failed.ok).toBe(false)
    expect(failed.error).toMatch(/^fatal: /)
    expect(await listWorktrees(repo)).toHaveLength(2)

    const retried = await removeWorktree(repo, sibling, { force: true })

    expect(retried).toEqual({ ok: true })
    expect(existsSync(sibling)).toBe(false)
    expect(await listWorktrees(repo)).toHaveLength(1)
  })
})
