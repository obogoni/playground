import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PAGE_SIZE, commitFiles, listCommits, openCommit, parseLog } from './commit-log'
import type { GitRunner } from './file-diff'
import { git as runGit } from './git'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** The separators the format uses, built from char codes so no editor can eat them. */
const FS = String.fromCharCode(31)
const RS = String.fromCharCode(30)

/** One `git log --format` record, in the field order `commit-log.ts` asks for. */
const record = (fields: {
  sha?: string
  shortSha?: string
  author?: string
  at?: string
  parents?: string
  subject?: string
  message?: string
}): string =>
  [
    fields.sha ?? 'a'.repeat(40),
    fields.shortSha ?? 'aaaaaaa',
    fields.author ?? 'Dev',
    fields.at ?? '1700000000',
    fields.parents ?? 'b'.repeat(40),
    fields.subject ?? 'a subject',
    fields.message ?? 'a subject\n'
  ].join(FS) + RS

/**
 * Adds `n` empty commits to `branch` in ONE git process.
 *
 * A `git commit` per commit is `n` process spawns: at 150 that was ~35 seconds
 * and made this the heaviest file in the suite, which is the load the repo's
 * own vitest config warns about ("real-git suites routinely take 5-15s per test
 * under parallel load"). `fast-import` takes the whole chain on stdin.
 *
 * The commits carry no tree change, so the working copy still matches after the
 * ref moves; the reset is there to leave the index in no doubt.
 */
function addEmptyCommits(repo: string, branch: string, n: number): void {
  // fast-import rejects a stream whose last command is not terminated.
  const chr10 = String.fromCharCode(10)
  const lines: string[] = []
  for (let i = 1; i <= n; i += 1) {
    const subject = `c${i}`
    lines.push(`commit refs/heads/${branch}`)
    lines.push(`mark :${i}`)
    lines.push('committer Test <test@test.local> 1700000000 +0000')
    // The newline `join` puts after the subject is part of the counted data.
    lines.push(`data ${Buffer.byteLength(subject) + 1}`)
    lines.push(subject)
    lines.push(i === 1 ? `from refs/heads/${branch}^0` : `from :${i - 1}`)
    lines.push('')
  }
  lines.push('done')
  execFileSync('git', ['fast-import', '--done', '--quiet'], {
    cwd: repo,
    input: `${lines.join(chr10)}${chr10}`,
    windowsHide: true
  })
  git(repo, 'reset', '--hard', branch)
}

/**
 * Removes a temp repository, retrying on Windows.
 *
 * The race this guards against was real and is now fixed at its source: a git
 * child process still holding the directory as its working directory when the
 * teardown ran (see `commitFiles` and its `allSettled`). The retry stays
 * because a spawn that outlives its caller is a Windows hazard this repository
 * has hit before, and 500ms of patience costs a passing run nothing.
 */
function removeTemp(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

/** A repository with one commit on `main`, and the identity git needs to commit. */
function initRepo(root: string, name = 'repo'): string {
  const repo = join(root, name)
  mkdirSync(repo)
  git(repo, 'init', '-b', 'main')
  git(repo, 'config', 'user.email', 'test@test.local')
  git(repo, 'config', 'user.name', 'Test')
  writeFileSync(join(repo, 'a.txt'), 'one\n', 'utf8')
  git(repo, 'add', '.')
  git(repo, 'commit', '-m', 'init')
  return repo
}

describe('parseLog', () => {
  it('keeps a message with blank lines and tabs intact', () => {
    // FCMT-04: the row's tooltip shows the message as written, so the parser
    // may not be the thing that reformats it.
    const message = ['Subject line', '', 'Body with a\ttab', '', 'And a closing line'].join('\n')

    const rows = parseLog(record({ subject: 'Subject line', message: `${message}\n` }))

    expect(rows).toHaveLength(1)
    expect(rows[0].message).toBe(message)
  })

  it('marks a two-parent commit as a merge', () => {
    const rows = parseLog(record({ parents: `${'b'.repeat(40)} ${'c'.repeat(40)}` }))

    expect(rows[0].isMerge).toBe(true)
  })

  it('does not mark a single-parent commit as a merge', () => {
    expect(parseLog(record({ parents: 'b'.repeat(40) }))[0].isMerge).toBe(false)
  })

  it('reads a commit with no subject as (no subject)', () => {
    const rows = parseLog(record({ subject: '', message: '\n' }))

    expect(rows[0].subject).toBe('(no subject)')
  })

  it('reads the date as epoch milliseconds', () => {
    expect(parseLog(record({ at: '1700000000' }))[0].at).toBe(1700000000000)
  })
})

describe('listCommits', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-cl-')))
    repo = initRepo(root)
  })

  afterEach(() => {
    removeTemp(root)
  })

  it('lists the branch own commits and the merge, not what the merge brought in', async () => {
    // FCMT-02 / F3-Q3: five commits arrive on a merge; the branch still owns
    // three commits and one merge, so the list is four rows.
    git(repo, 'checkout', '-b', 'other')
    for (let i = 1; i <= 5; i += 1) git(repo, 'commit', '--allow-empty', '-m', `other ${i}`)
    git(repo, 'checkout', '-b', 'feature', 'main')
    for (let i = 1; i <= 3; i += 1) git(repo, 'commit', '--allow-empty', '-m', `mine ${i}`)
    git(repo, 'merge', '--no-ff', '-m', 'merge other', 'other')

    const page = await listCommits(repo, 'main')

    expect(page.commits.map((c) => c.subject)).toEqual([
      'merge other',
      'mine 3',
      'mine 2',
      'mine 1'
    ])
    expect(page.commits[0].isMerge).toBe(true)
    expect(page.hasMore).toBe(false)
  })

  it('says the branch has no commits of its own when it has none', async () => {
    // FCMT-10: an empty list, not an error — the list has nothing to show
    // because the branch has added nothing, which is a state, not a failure.
    git(repo, 'checkout', '-b', 'feature')

    const page = await listCommits(repo, 'main')

    expect(page.commits).toEqual([])
    expect(page.error).toBeUndefined()
  })

  it('reports git error line when the base does not resolve', async () => {
    const page = await listCommits(repo, 'no-such-base')

    expect(page.error).toBeTruthy()
    expect(page.commits).toEqual([])
  })

  it('marks exactly the commits the upstream has not seen', async () => {
    // FCMT-12: a bare remote stands in for the provider. Two commits are
    // pushed, two are not; nothing leaves the machine.
    const bare = join(root, 'remote.git')
    git(root, 'clone', '--bare', repo, 'remote.git')
    git(repo, 'remote', 'add', 'origin', bare)
    git(repo, 'checkout', '-b', 'feature')
    for (let i = 1; i <= 2; i += 1) git(repo, 'commit', '--allow-empty', '-m', `pushed ${i}`)
    git(repo, 'push', '-u', 'origin', 'feature')
    for (let i = 1; i <= 2; i += 1) git(repo, 'commit', '--allow-empty', '-m', `local ${i}`)

    const page = await listCommits(repo, 'main')

    expect(page.commits.map((c) => [c.subject, c.pushed])).toEqual([
      ['local 2', false],
      ['local 1', false],
      ['pushed 2', true],
      ['pushed 1', true]
    ])
    expect(page.upstream).toBe('origin/feature')
  })

  it('marks every commit not pushed when the branch has no upstream', async () => {
    // FCMT-13: with nowhere to have pushed to, nothing can be pushed.
    git(repo, 'checkout', '-b', 'feature')
    for (let i = 1; i <= 3; i += 1) git(repo, 'commit', '--allow-empty', '-m', `mine ${i}`)

    const page = await listCommits(repo, 'main')

    expect(page.commits.map((c) => c.pushed)).toEqual([false, false, false])
    expect(page.upstream).toBeNull()
  })

  it('reports github as the provider of a github upstream', async () => {
    // FCMT-23. The remote is cloned locally and then renamed to a fictitious
    // GitHub address, so the tracking refs exist and no network is touched.
    const bare = join(root, 'remote.git')
    git(root, 'clone', '--bare', repo, 'remote.git')
    git(repo, 'remote', 'add', 'origin', bare)
    git(repo, 'checkout', '-b', 'feature')
    git(repo, 'commit', '--allow-empty', '-m', 'mine')
    git(repo, 'push', '-u', 'origin', 'feature')
    git(repo, 'remote', 'set-url', 'origin', 'https://github.com/acme/widget.git')

    expect((await listCommits(repo, 'main')).browse).toBe('github')
  })

  it('reports no provider for a remote that is a local path', async () => {
    // FCMT-26: unrecognized means no button, never a guessed address.
    const bare = join(root, 'remote.git')
    git(root, 'clone', '--bare', repo, 'remote.git')
    git(repo, 'remote', 'add', 'origin', bare)
    git(repo, 'checkout', '-b', 'feature')
    git(repo, 'commit', '--allow-empty', '-m', 'mine')
    git(repo, 'push', '-u', 'origin', 'feature')

    expect((await listCommits(repo, 'main')).browse).toBeNull()
  })
})

describe('listCommits paging', () => {
  let root: string
  let repo: string

  beforeAll(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-cp-')))
    repo = initRepo(root)
    git(repo, 'checkout', '-b', 'feature')
    addEmptyCommits(repo, 'feature', 150)
  }, 300_000)

  afterAll(() => {
    removeTemp(root)
  })

  it('shows the newest 100 and says there is more', async () => {
    const page = await listCommits(repo, 'main')

    expect(page.commits).toHaveLength(PAGE_SIZE)
    expect(page.commits[0].subject).toBe('c150')
    expect(page.commits[99].subject).toBe('c51')
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toBe(page.commits[99].sha)
  })

  it('says there is no more at exactly a full page (FCMT-08)', async () => {
    // FCMT-08 says MORE THAN 100, so 100 exactly is the one count that tells
    // `>` from `>=`. Seeded from the same history: `HEAD~100` as the base puts
    // precisely PAGE_SIZE commits in range. Without this the suite passed with
    // the comparison inverted (sensor mutant M5).
    const page = await listCommits(repo, `HEAD~${PAGE_SIZE}`)

    expect(page.commits).toHaveLength(PAGE_SIZE)
    expect(page.hasMore).toBe(false)
    expect(page.cursor).toBeNull()
  })

  it('appends the remaining 50 from the cursor and stops', async () => {
    const first = await listCommits(repo, 'main')

    const second = await listCommits(repo, 'main', first.cursor ?? undefined)

    expect(second.commits).toHaveLength(50)
    expect(second.commits[0].subject).toBe('c50')
    expect(second.commits[49].subject).toBe('c1')
    expect(second.hasMore).toBe(false)
    expect(second.cursor).toBeNull()
  })

  it('does not duplicate a row when a commit lands between the two pages', async () => {
    // The reason paging is by cursor and not by offset: `--skip 100` would
    // show c51 twice once the history grew by one above it.
    const first = await listCommits(repo, 'main')
    git(repo, 'commit', '--allow-empty', '-m', 'landed between pages')

    const second = await listCommits(repo, 'main', first.cursor ?? undefined)

    const shas = [...first.commits, ...second.commits].map((c) => c.sha)
    expect(new Set(shas).size).toBe(shas.length)
    expect(second.commits.map((c) => c.subject)).not.toContain('landed between pages')

    git(repo, 'reset', '--hard', 'HEAD~1')
  })
})

describe('commitFiles', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-cf-')))
    repo = initRepo(root)
  })

  afterEach(() => {
    removeTemp(root)
  })

  it('reports a merge commit changes against its first parent', async () => {
    // FCMT-17. `git diff-tree -r <merge>` with one argument prints nothing, so
    // without the explicit parent this tab would open empty for every merge.
    git(repo, 'checkout', '-b', 'other')
    writeFileSync(join(repo, 'brought-in.txt'), 'from the other branch\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'other adds a file')
    git(repo, 'checkout', 'main')
    writeFileSync(join(repo, 'mine.txt'), 'mine\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'mine')
    git(repo, 'merge', '--no-ff', '-m', 'merge other', 'other')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()

    const detail = await commitFiles(repo, sha)

    expect(detail.error).toBeUndefined()
    expect(detail.parent).not.toBeNull()
    expect(detail.files).toEqual([{ path: 'brought-in.txt', status: 'added' }])
    expect(detail.stats).toEqual([{ path: 'brought-in.txt', added: 1, removed: 0 }])
  })

  it('reports a root commit as parentless with every file added', async () => {
    // FCMT-18: no parent means no original side to read, so the tab shows the
    // whole file as added.
    const sha = git(repo, 'rev-list', '--max-parents=0', 'HEAD').trim()

    const detail = await commitFiles(repo, sha)

    expect(detail.parent).toBeNull()
    expect(detail.files).toEqual([{ path: 'a.txt', status: 'added' }])
    expect(detail.error).toBeUndefined()
  })

  it('carries the old path of a rename', async () => {
    git(repo, 'mv', 'a.txt', 'b.txt')
    git(repo, 'commit', '-m', 'rename a to b')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()

    const detail = await commitFiles(repo, sha)

    expect(detail.files).toEqual([{ path: 'b.txt', status: 'renamed', oldPath: 'a.txt' }])
  })

  it('returns git error line for a commit the repository does not hold', async () => {
    // The edge case an aggressive `gc` produces: the tab shows git's line
    // rather than a stale stack.
    const detail = await commitFiles(repo, 'f'.repeat(40))

    // Git's own line, not a canned string: the tab shows what git said.
    expect(detail.error).toContain('fatal')
    expect(detail.files).toEqual([])
    expect(detail.stats).toEqual([])
  })

  it('reports git line when only one of the two reads fails', async () => {
    // The two reads are separate processes. `commitFiles` is documented as
    // never throwing, and that must not depend on them failing together:
    // with the guard weakened to `&&`, a one-sided failure reads the value of
    // a rejected result and throws.
    const sha = git(repo, 'rev-parse', 'HEAD').trim()
    const half: GitRunner = async (cwd, args) => {
      if (args.includes('--numstat')) {
        throw Object.assign(new Error('failed'), { stderr: 'fatal: broken numstat' })
      }
      return runGit(cwd, args)
    }

    const detail = await commitFiles(repo, sha, half)

    expect(detail.error).toContain('fatal: broken numstat')
    expect(detail.files).toEqual([])
    expect(detail.stats).toEqual([])
  })

  it('counts both sides of an edited file', async () => {
    writeFileSync(join(repo, 'a.txt'), 'one changed\ntwo added\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'edit a')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()

    const detail = await commitFiles(repo, sha)

    expect(detail.files).toEqual([{ path: 'a.txt', status: 'modified' }])
    expect(detail.stats).toEqual([{ path: 'a.txt', added: 2, removed: 1 }])
  })
})

describe('openCommit', () => {
  let root: string
  let repo: string
  let opened: string[]
  const open = async (url: string): Promise<void> => {
    opened.push(url)
  }

  /** A repo whose branch tracks a local bare clone wearing `url` as its address. */
  const withUpstream = (url?: string): string => {
    git(root, 'clone', '--bare', repo, 'remote.git')
    git(repo, 'remote', 'add', 'origin', join(root, 'remote.git'))
    git(repo, 'checkout', '-b', 'feature')
    git(repo, 'commit', '--allow-empty', '-m', 'pushed')
    git(repo, 'push', '-u', 'origin', 'feature')
    if (url !== undefined) git(repo, 'remote', 'set-url', 'origin', url)
    return git(repo, 'rev-parse', 'HEAD').trim()
  }

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-co-')))
    repo = initRepo(root)
    opened = []
  })

  afterEach(() => {
    removeTemp(root)
  })

  it('opens a pushed commit page once', async () => {
    const sha = withUpstream('https://github.com/acme/widget.git')

    const result = await openCommit(repo, sha, open)

    expect(result).toEqual({ ok: true })
    expect(opened).toEqual([`https://github.com/acme/widget/commit/${sha}`])
  })

  it('refuses a commit the upstream has not seen and opens nothing', async () => {
    // FCMT-25. The button is disabled for this row, so reaching here is a
    // race; the refusal has to hold anyway.
    withUpstream('https://github.com/acme/widget.git')
    git(repo, 'commit', '--allow-empty', '-m', 'local only')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()

    const result = await openCommit(repo, sha, open)

    expect(result.ok).toBe(false)
    expect(opened).toEqual([])
  })

  it('refuses when the branch has no upstream and opens nothing', async () => {
    git(repo, 'checkout', '-b', 'feature')
    git(repo, 'commit', '--allow-empty', '-m', 'mine')
    const sha = git(repo, 'rev-parse', 'HEAD').trim()

    const result = await openCommit(repo, sha, open)

    expect(result.ok).toBe(false)
    expect(opened).toEqual([])
  })

  it('refuses an upstream on a host it does not recognize and opens nothing', async () => {
    // FCMT-26: a local-path remote is not a provider, so there is no page.
    const sha = withUpstream()

    const result = await openCommit(repo, sha, open)

    expect(result.ok).toBe(false)
    expect(opened).toEqual([])
  })

  it('opens an address carrying no credential from the remote', async () => {
    // Edge case: a remote holding a token must not put it in the browser's
    // address bar, or in history.
    const sha = withUpstream('https://someone:s3cr3t@github.com/acme/widget.git')

    const result = await openCommit(repo, sha, open)

    expect(result).toEqual({ ok: true })
    expect(opened).toEqual([`https://github.com/acme/widget/commit/${sha}`])
    expect(opened[0]).not.toContain('s3cr3t')
    expect(opened[0]).not.toContain('someone')
  })
})
