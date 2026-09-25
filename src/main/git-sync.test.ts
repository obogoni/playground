import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { git as runGit } from './git'
import {
  MISSING_FOLDER,
  OP_TIMEOUT_MS,
  parseAheadBehind,
  parseCommitLines,
  readCommits,
  readSyncState,
  runGitOp
} from './git-sync'

// The real git(), wrapped in a spy so a test can read the options runGitOp passes it (STBR-24).
vi.mock('./git', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./git')>()
  return { ...actual, git: vi.fn(actual.git) }
})

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Dev', '-c', 'user.email=dev@example.com', ...args], {
    cwd,
    encoding: 'utf8'
  })

const commit = (cwd: string, message: string): void => {
  git(cwd, 'commit', '--allow-empty', '-q', '-m', message)
}

/** A primary checkout on `main` tracking `origin/main` in a local bare remote; never fetched. */
function seedRepo(): { root: string; remote: string; repo: string } {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-sync-')))
  const remote = join(root, 'remote.git')
  const repo = join(root, 'repo')
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  commit(repo, 'first')
  git(repo, 'remote', 'add', 'origin', remote)
  git(repo, 'push', '-q', '-u', 'origin', 'main')
  return { root, remote, repo }
}

/** Lands `count` commits on the remote's main from a second clone under `root`. */
function pushFromElsewhere(root: string, remote: string, count: number): void {
  const other = join(root, 'other')
  git(root, 'clone', '-q', remote, other)
  for (let i = 0; i < count; i++) commit(other, `remote ${i}`)
  git(other, 'push', '-q', 'origin', 'main')
}

describe('parseAheadBehind', () => {
  it("reads git's behind<TAB>ahead order for @{upstream}...HEAD", () => {
    expect(parseAheadBehind('2\t1\n')).toEqual({ behind: 2, ahead: 1 })
  })
})

describe('readSyncState', () => {
  let root: string
  let remote: string
  let repo: string

  beforeEach(() => {
    ;({ root, remote, repo } = seedRepo())
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('counts commits to pull and to push against the upstream from local refs', async () => {
    pushFromElsewhere(root, remote, 2)
    git(repo, 'fetch', '-q', 'origin')
    commit(repo, 'local')

    const state = await readSyncState(repo)

    expect(state).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      behind: 2,
      ahead: 1,
      remotes: ['origin']
    })
    expect(state.error).toBeUndefined()
  })

  it('treats a branch without an upstream as no-upstream, not as an error', async () => {
    git(repo, 'switch', '-q', '-c', 'user/dev/4821-fix-login')

    const state = await readSyncState(repo)

    expect(state).toMatchObject({
      branch: 'user/dev/4821-fix-login',
      upstream: null,
      behind: 0,
      ahead: 0,
      remotes: ['origin']
    })
    expect(state.error).toBeUndefined()
  })

  it('reports no remotes for a repo that has none', async () => {
    git(repo, 'remote', 'remove', 'origin')

    const state = await readSyncState(repo)

    expect(state).toMatchObject({ branch: 'main', upstream: null, remotes: [] })
    expect(state.error).toBeUndefined()
  })

  it("stats FETCH_HEAD under the primary checkout's relative .git common dir", async () => {
    git(repo, 'fetch', '-q', 'origin')

    const state = await readSyncState(repo)

    expect(state.lastFetchAt).toBe(statSync(join(repo, '.git', 'FETCH_HEAD')).mtimeMs)
  })

  it("reads a linked worktree's fetch age from the repo's FETCH_HEAD", async () => {
    git(repo, 'fetch', '-q', 'origin')
    const linked = join(root, 'repo-linked')
    git(repo, 'worktree', 'add', '-q', '-b', 'user/dev/4821-fix-login', linked)

    const state = await readSyncState(linked)

    expect(state.lastFetchAt).toBe(statSync(join(repo, '.git', 'FETCH_HEAD')).mtimeMs)
  })

  it("reads a fetch run inside a linked worktree, whose FETCH_HEAD is the worktree's own", async () => {
    const linked = join(root, 'repo-linked')
    git(repo, 'worktree', 'add', '-q', '-b', 'user/dev/4821-fix-login', linked)
    git(linked, 'fetch', '-q', 'origin')
    const own = statSync(join(repo, '.git', 'worktrees', 'repo-linked', 'FETCH_HEAD')).mtimeMs

    expect((await readSyncState(linked)).lastFetchAt).toBe(own)
    expect((await readSyncState(repo)).lastFetchAt).toBe(own)
  })

  it('reads the newest FETCH_HEAD in the repo when several worktrees fetched', async () => {
    const linked = join(root, 'repo-linked')
    git(repo, 'worktree', 'add', '-q', '-b', 'user/dev/4821-fix-login', linked)
    git(repo, 'fetch', '-q', 'origin')
    git(linked, 'fetch', '-q', 'origin')
    const primaryHead = join(repo, '.git', 'FETCH_HEAD')
    const newer = new Date(Date.now() + 60_000)
    utimesSync(primaryHead, newer, newer)

    const state = await readSyncState(linked)

    expect(state.lastFetchAt).toBe(statSync(primaryHead).mtimeMs)
  })

  it('reads lastFetchAt as null when the repo never fetched', async () => {
    const state = await readSyncState(repo)

    expect(state.lastFetchAt).toBeNull()
  })

  it('names a detached HEAD by its short sha, with no branch and no upstream', async () => {
    git(repo, 'checkout', '-q', '--detach')
    const sha = git(repo, 'rev-parse', '--short', 'HEAD').trim()

    const state = await readSyncState(repo)

    expect(state).toMatchObject({ branch: null, detachedSha: sha, upstream: null })
    expect(state.error).toBeUndefined()
  })

  it("resolves any other git failure to git's first line instead of throwing or stale counts", async () => {
    // An upstream whose ref is missing locally (a deleted remote branch, spec edge case).
    git(repo, 'config', 'branch.main.merge', 'refs/heads/gone')

    const state = await readSyncState(repo)

    expect(state.error).toMatch(/^fatal: /)
    expect(state).toMatchObject({ branch: 'main', upstream: null, behind: 0, ahead: 0 })
  })

  it('reports a deleted worktree folder as missing, in words rather than spawn git ENOENT', async () => {
    const state = await readSyncState(join(root, 'deleted-worktree'))

    expect(state).toMatchObject({ missing: true, error: MISSING_FOLDER })
    expect(MISSING_FOLDER).toBe('The worktree folder no longer exists')
  })
})

describe('parseCommitLines', () => {
  it('returns no commits for an empty stdout', () => {
    expect(parseCommitLines('')).toEqual([])
  })

  it("keeps a subject containing the separator's neighbours intact", () => {
    const subject = 'fix:\x1e split\ton  spaces '
    expect(parseCommitLines(`abc1234\x1f${subject}\x1f1700000000\n`)).toEqual([
      { sha: 'abc1234', subject, at: 1700000000000 }
    ])
  })

  it('reads a CRLF-terminated stream without carrying the CR into any field', () => {
    expect(
      parseCommitLines('abc1234\x1fone\x1f1700000000\r\ndef5678\x1ftwo\x1f1700000060\r\n')
    ).toEqual([
      { sha: 'abc1234', subject: 'one', at: 1700000000000 },
      { sha: 'def5678', subject: 'two', at: 1700000060000 }
    ])
  })
})

describe('readCommits', () => {
  let root: string
  let remote: string
  let repo: string

  beforeEach(() => {
    ;({ root, remote, repo } = seedRepo())
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** Every commit in `range`, newest first, as git itself reports it. */
  const expected = (range: string): { sha: string; subject: string; at: number }[] =>
    parseCommitLines(git(repo, 'log', '--format=%h%x1f%s%x1f%ct', range))

  it('lists incoming as HEAD..@{upstream} and outgoing as @{upstream}..HEAD', async () => {
    pushFromElsewhere(root, remote, 2)
    git(repo, 'fetch', '-q', 'origin')
    commit(repo, 'local work')

    const lists = await readCommits(repo)

    expect(lists.incoming.map((c) => c.subject)).toEqual(['remote 1', 'remote 0'])
    expect(lists.outgoing.map((c) => c.subject)).toEqual(['local work'])
    expect(lists.incoming).toEqual(expected('HEAD..origin/main'))
    expect(lists.outgoing).toEqual(expected('origin/main..HEAD'))
    expect(lists).toMatchObject({ moreIncoming: 0, moreOutgoing: 0 })
  })

  it('caps each list at 20 and counts the rest exactly', async () => {
    pushFromElsewhere(root, remote, 21)
    git(repo, 'fetch', '-q', 'origin')
    for (let i = 0; i < 22; i++) commit(repo, `local ${i}`)

    const lists = await readCommits(repo)

    expect(lists.incoming).toHaveLength(20)
    expect(lists.outgoing).toHaveLength(20)
    expect(lists).toMatchObject({ moreIncoming: 1, moreOutgoing: 2 })
  })

  it('returns two empty lists and zero counts for a branch without an upstream', async () => {
    git(repo, 'switch', '-q', '-c', 'user/dev/4821-fix-login')
    commit(repo, 'unpublished')

    expect(await readCommits(repo)).toEqual({
      incoming: [],
      outgoing: [],
      moreIncoming: 0,
      moreOutgoing: 0
    })
  })
})

describe('runGitOp', () => {
  let root: string
  let remote: string
  let repo: string

  beforeEach(() => {
    ;({ root, remote, repo } = seedRepo())
  })

  afterEach(() => {
    // A killed git (the timeout case) can leave a child briefly holding the dir on Windows.
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  })

  const sha = (cwd: string, rev: string): string => git(cwd, 'rev-parse', rev).trim()

  it("fails a diverged pull with git's error line and leaves the worktree unchanged", async () => {
    pushFromElsewhere(root, remote, 1)
    commit(repo, 'local work')
    const before = sha(repo, 'HEAD')

    const result = await runGitOp(repo, 'pull')

    expect(result).toEqual({ ok: false, error: 'fatal: Not possible to fast-forward, aborting.' })
    expect(sha(repo, 'HEAD')).toBe(before)
  })

  it('fails a diverged sync without pushing and leaves the worktree unchanged', async () => {
    pushFromElsewhere(root, remote, 1)
    commit(repo, 'local work')
    const before = sha(repo, 'HEAD')
    const remoteBefore = sha(remote, 'main')

    const result = await runGitOp(repo, 'sync')

    expect(result).toEqual({ ok: false, error: 'fatal: Not possible to fast-forward, aborting.' })
    expect(sha(repo, 'HEAD')).toBe(before)
    expect(sha(remote, 'main')).toBe(remoteBefore)
  })

  /**
   * The spec's dirty-pull edge case: the incoming commit changes a file the
   * worktree has modified and not committed.
   */
  function dirtyAgainstIncoming(): { file: string; local: string } {
    const file = join(repo, 'notes.txt')
    writeFileSync(file, 'base\n')
    git(repo, 'add', 'notes.txt')
    commit(repo, 'add notes')
    git(repo, 'push', '-q')
    const other = join(root, 'other')
    git(root, 'clone', '-q', remote, other)
    writeFileSync(join(other, 'notes.txt'), 'from elsewhere\n')
    git(other, 'commit', '-q', '-am', 'edit notes elsewhere')
    git(other, 'push', '-q', 'origin', 'main')
    const local = 'local edit, not committed\n'
    writeFileSync(file, local)
    // Git for Windows ships `pull.rebase=true` system-wide; pin it so the pull
    // must stay a fast-forward on every machine, not only on one without it.
    git(repo, 'config', 'pull.rebase', 'true')
    return { file, local }
  }

  it("fails a pull that would overwrite a local change with git's error: line and changes nothing", async () => {
    const { file, local } = dirtyAgainstIncoming()
    const before = sha(repo, 'HEAD')

    const result = await runGitOp(repo, 'pull')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      'error: Your local changes to the following files would be overwritten by merge:'
    )
    expect(sha(repo, 'HEAD')).toBe(before)
    expect(readFileSync(file, 'utf8')).toBe(local)
  })

  it('fails a sync that would overwrite a local change the same way, and pushes nothing', async () => {
    const { file, local } = dirtyAgainstIncoming()
    const before = sha(repo, 'HEAD')
    const remoteBefore = sha(remote, 'main')

    const result = await runGitOp(repo, 'sync')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(
      'error: Your local changes to the following files would be overwritten by merge:'
    )
    expect(sha(repo, 'HEAD')).toBe(before)
    expect(readFileSync(file, 'utf8')).toBe(local)
    expect(sha(remote, 'main')).toBe(remoteBefore)
  })

  it('does not push when the pull half of a sync failed', async () => {
    // Fetching from origin fails while its push URL still works, so only the abort stops a push.
    commit(repo, 'local work')
    const remoteBefore = sha(remote, 'main')
    git(repo, 'remote', 'set-url', 'origin', join(root, 'missing.git'))
    git(repo, 'remote', 'set-url', '--push', 'origin', remote)

    const result = await runGitOp(repo, 'sync')

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^fatal: /)
    expect(sha(remote, 'main')).toBe(remoteBefore)
  })

  it('syncs by fast-forwarding from the upstream, then pushing local commits to it', async () => {
    pushFromElsewhere(root, remote, 1)
    expect(await runGitOp(repo, 'sync')).toEqual({ ok: true })
    expect(sha(repo, 'HEAD')).toBe(sha(remote, 'main'))

    commit(repo, 'local work')
    expect(await runGitOp(repo, 'sync')).toEqual({ ok: true })
    expect(sha(remote, 'main')).toBe(sha(repo, 'HEAD'))
  })

  it('publishes to the only remote with push -u, leaving the branch with an upstream', async () => {
    git(repo, 'switch', '-q', '-c', 'user/dev/4821-fix-login')

    expect(await runGitOp(repo, 'publish')).toEqual({ ok: true })

    expect(git(repo, 'rev-parse', '--abbrev-ref', '@{upstream}').trim()).toBe(
      'origin/user/dev/4821-fix-login'
    )
    expect(sha(remote, 'user/dev/4821-fix-login')).toBe(sha(repo, 'HEAD'))
  })

  it('refuses to publish without a chosen remote when there are several', async () => {
    const fork = join(root, 'fork.git')
    git(root, 'init', '-q', '--bare', '-b', 'main', fork)
    git(repo, 'remote', 'add', 'fork', fork)
    git(repo, 'switch', '-q', '-c', 'user/dev/4821-fix-login')

    const refused = await runGitOp(repo, 'publish')

    expect(refused.ok).toBe(false)
    expect(refused.error).toBeTruthy()
    expect(git(repo, 'for-each-ref', '--format=%(upstream)', 'refs/heads/user').trim()).toBe('')

    expect(await runGitOp(repo, 'publish', 'fork')).toEqual({ ok: true })
    expect(git(repo, 'rev-parse', '--abbrev-ref', '@{upstream}').trim()).toBe(
      'fork/user/dev/4821-fix-login'
    )
  })

  it("fetches only the current branch's upstream remote and branch", async () => {
    pushFromElsewhere(root, remote, 1)
    git(join(root, 'other'), 'push', '-q', 'origin', 'HEAD:release')
    const fork = join(root, 'fork.git')
    git(root, 'init', '-q', '--bare', '-b', 'main', fork)
    git(join(root, 'other'), 'push', '-q', fork, 'main')
    git(repo, 'remote', 'add', 'fork', fork)

    expect(await runGitOp(repo, 'fetch')).toEqual({ ok: true })

    expect(git(repo, 'for-each-ref', '--format=%(refname)', 'refs/remotes').trim()).toBe(
      'refs/remotes/origin/main'
    )
    expect(sha(repo, 'origin/main')).toBe(sha(remote, 'main'))
  })

  it('resolves busy without running git while the same worktree has an operation in flight', async () => {
    commit(repo, 'local work')
    const remoteBefore = sha(remote, 'main')

    const first = runGitOp(repo, 'fetch')
    const second = await runGitOp(repo, 'push')

    expect(second).toEqual({ ok: false, busy: true })
    expect(await first).toEqual({ ok: true })
    expect(sha(remote, 'main')).toBe(remoteBefore)
    expect(await runGitOp(repo, 'push')).toEqual({ ok: true })
  })

  it('kills an operation after 120 s by default', async () => {
    expect(OP_TIMEOUT_MS).toBe(120_000)
    vi.mocked(runGit).mockClear()

    expect(await runGitOp(repo, 'push')).toEqual({ ok: true })

    expect(vi.mocked(runGit)).toHaveBeenCalledWith(repo, ['push'], { timeoutMs: 120_000 })
  })

  it('reports an operation that outlives its ceiling as timed out', async () => {
    const result = await runGitOp(repo, 'push', undefined, 1)

    expect(result).toMatchObject({ ok: false, timedOut: true })
  })
})
