import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  diffStats,
  lineEndingChanges,
  parseNumstat,
  readDiffSides,
  type GitRunner
} from './file-diff'
import { git as runGit } from './git'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** `git diff --numstat -z` output: every record NUL-terminated, including the last. */
const z = (...records: string[]): string => records.map((r) => `${r}\0`).join('')

/** `git diff --shortstat` as three numbers, so a test can compare against git itself. */
const shortstat = (raw: string): { files: number; added: number; removed: number } => ({
  files: Number(/(\d+) files? changed/.exec(raw)?.[1] ?? 0),
  added: Number(/(\d+) insertions?\(\+\)/.exec(raw)?.[1] ?? 0),
  removed: Number(/(\d+) deletions?\(-\)/.exec(raw)?.[1] ?? 0)
})

/** Built from char codes so no editing layer can collapse what these tests are about. */
const CARRIAGE = String.fromCharCode(13)
const LINE_FEED = String.fromCharCode(10)

describe('lineEndingChanges', () => {
  it('reports every line of a whole-file CRLF to LF flip', () => {
    // FDIF-15 / spike finding 1: Monaco's diff calls this "no changes", so main
    // must name every line, or the flip is invisible to the user.
    const original = 'alpha\r\nbeta\r\ngamma\r\n'
    const modified = 'alpha\nbeta\ngamma\n'

    expect(lineEndingChanges(original, modified)).toEqual({
      lines: [1, 2, 3],
      from: 'CRLF',
      to: 'LF'
    })
  })

  it('reports only the 4 CRLF lines of a mixed file flipped to pure LF', () => {
    const texts = Array.from({ length: 719 }, (_, i) => `line ${i + 1}`)
    const crlfLines = new Set([100, 200, 300, 400])
    const original = texts.map((t, i) => t + (crlfLines.has(i + 1) ? '\r\n' : '\n')).join('')
    const modified = texts.map((t) => `${t}\n`).join('')

    expect(lineEndingChanges(original, modified).lines).toEqual([100, 200, 300, 400])
  })

  it('reports nothing when the endings match, even where the text changed', () => {
    const original = 'alpha\nbeta\ngamma\n'
    const modified = 'alpha\nBETA rewritten\ngamma\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([])
  })

  it('names a CR-only side as CR', () => {
    const original = 'alpha\rbeta\rgamma\r'
    const modified = 'alpha\nbeta\ngamma\n'

    const changes = lineEndingChanges(original, modified)

    expect(changes.from).toBe('CR')
    expect(changes.lines).toEqual([1, 2, 3])
  })

  it('counts a last line that gained a terminator as changed', () => {
    const original = 'alpha\nbeta'
    const modified = 'alpha\nbeta\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([2])
  })

  it('leaves out a line the text change added, and keeps the surviving ones', () => {
    // The inserted line exists on one side only, so it has no terminator to
    // have changed; the three lines that survive the edit all flipped.
    const original = 'alpha\r\nbeta\r\ngamma\r\n'
    const modified = 'alpha\ninserted\nbeta\ngamma\n'

    expect(lineEndingChanges(original, modified).lines).toEqual([1, 3, 4])
  })
})

describe('parseNumstat', () => {
  it('reads one record per changed file', () => {
    const stats = parseNumstat(z('3\t1\tsrc/a.ts', '12\t0\tsrc/b.ts'))

    expect(stats).toEqual([
      { path: 'src/a.ts', added: 3, removed: 1 },
      { path: 'src/b.ts', added: 12, removed: 0 }
    ])
  })

  it('reads a rename record as one file at its new path', () => {
    // A rename leaves the record's path empty and follows with the old path
    // and the new one; the stack shows the file where it is now.
    const stats = parseNumstat(z('2\t5\t', 'src/old.ts', 'src/new.ts', '1\t0\tsrc/c.ts'))

    expect(stats).toEqual([
      { path: 'src/new.ts', added: 2, removed: 5 },
      { path: 'src/c.ts', added: 1, removed: 0 }
    ])
  })

  it('maps a dash for both counts to a binary file with no lines', () => {
    const stats = parseNumstat(z('-\t-\tassets/logo.png'))

    expect(stats).toEqual([
      { path: 'assets/logo.png', added: 0, removed: 0, uncountable: 'binary' }
    ])
  })
})

describe('diffStats', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-ds-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\nfour\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('totals what git itself reports for the branch since its base', async () => {
    git(repo, 'checkout', '-b', 'feature')
    writeFileSync(join(repo, 'a.txt'), 'one\nTWO\nthree\n', 'utf8')
    writeFileSync(join(repo, 'b.txt'), 'alpha\nbeta\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'work')
    const mergeBase = git(repo, 'merge-base', 'HEAD', 'main').trim()
    const expected = shortstat(git(repo, 'diff', '--shortstat', mergeBase, 'HEAD'))

    const stats = await diffStats(repo, 'since-base', 'main')

    // Guards the comparison: a fixture that changed nothing would let an empty
    // result match git's zeros.
    expect(expected.added).toBeGreaterThan(0)
    expect({
      files: stats.length,
      added: stats.reduce((sum, s) => sum + s.added, 0),
      removed: stats.reduce((sum, s) => sum + s.removed, 0)
    }).toEqual(expected)
  })

  it('counts an untracked file that numstat leaves out', async () => {
    writeFileSync(join(repo, 'notes.md'), 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n', 'utf8')

    const stats = await diffStats(repo, 'uncommitted')

    expect(stats).toEqual([{ path: 'notes.md', added: 7, removed: 0 }])
  })

  it('returns an empty list when the mode has nothing to diff', async () => {
    // A clean worktree has nothing uncommitted (FDIF-24)…
    expect(await diffStats(repo, 'uncommitted')).toEqual([])

    // …and full-folder mode has no reference to compare against (FDIF-18),
    // which stays true once the worktree is dirty.
    writeFileSync(join(repo, 'a.txt'), 'one\nedited\n', 'utf8')
    expect(await diffStats(repo, 'full')).toEqual([])
  })
})

describe('readDiffSides', () => {
  let root: string
  let repo: string
  let mergeBase: string
  let calls: string[][]
  /** Runs git for real and records what was asked of it. */
  const recording: GitRunner = (cwd, args) => {
    calls.push(args)
    return runGit(cwd, args)
  }

  beforeEach(() => {
    calls = []
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-rd-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    // This machine's system gitconfig sets core.autocrlf=true, which would
    // rewrite every fixture's terminators on commit and on checkout.
    git(repo, 'config', 'core.autocrlf', 'false')
    writeFileSync(join(repo, 'a.txt'), 'base one\nbase two\n', 'utf8')
    writeFileSync(join(repo, 'gone.txt'), 'doomed\n', 'utf8')
    writeFileSync(join(repo, 'old.txt'), 'the original content\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    mergeBase = git(repo, 'rev-parse', 'HEAD').trim()
    git(repo, 'checkout', '-b', 'feature')
    writeFileSync(join(repo, 'a.txt'), 'head one\nhead two\n', 'utf8')
    git(repo, 'mv', 'old.txt', 'new.txt')
    writeFileSync(join(repo, 'new.txt'), 'renamed and edited\n', 'utf8')
    git(repo, 'rm', '-q', 'gone.txt')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'work')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads the merge base against HEAD for a diff-to-origin file', async () => {
    const sides = await readDiffSides(repo, {
      original: { rev: mergeBase, path: 'a.txt' },
      modified: { rev: 'HEAD', path: 'a.txt' }
    })

    expect(sides.original).toMatchObject({ kind: 'text', text: 'base one\nbase two\n' })
    expect(sides.modified).toMatchObject({ kind: 'text', text: 'head one\nhead two\n' })
  })

  it('reads HEAD against the working copy for an uncommitted file', async () => {
    writeFileSync(join(repo, 'a.txt'), 'edited on disk\n', 'utf8')

    const sides = await readDiffSides(repo, {
      original: { rev: 'HEAD', path: 'a.txt' },
      modified: { disk: true, path: 'a.txt' }
    })

    expect(sides.original).toMatchObject({ kind: 'text', text: 'head one\nhead two\n' })
    expect(sides.modified).toMatchObject({ kind: 'text', text: 'edited on disk\n' })
  })

  it('gives an added file no original side', async () => {
    writeFileSync(join(repo, 'brand-new.txt'), 'fresh\n', 'utf8')

    const sides = await readDiffSides(repo, {
      original: null,
      modified: { disk: true, path: 'brand-new.txt' }
    })

    expect(sides.original).toEqual({ kind: 'absent' })
    expect(sides.modified).toMatchObject({ kind: 'text', text: 'fresh\n' })
  })

  it('gives a deleted file no modified side', async () => {
    const sides = await readDiffSides(repo, {
      original: { rev: mergeBase, path: 'gone.txt' },
      modified: null
    })

    expect(sides.modified).toEqual({ kind: 'absent' })
    expect(sides.original).toMatchObject({ kind: 'text', text: 'doomed\n' })
  })

  it('reads a renamed file’s original from its previous path', async () => {
    const sides = await readDiffSides(repo, {
      original: { rev: mergeBase, path: 'old.txt' },
      modified: { rev: 'HEAD', path: 'new.txt' }
    })

    expect(sides.original).toMatchObject({ kind: 'text', text: 'the original content\n' })
    expect(sides.modified).toMatchObject({ kind: 'text', text: 'renamed and edited\n' })
  })

  it('reports a blob over the cap by its size without ever reading it', async () => {
    const big = `${'x'.repeat(80)}\n`.repeat(14000)
    expect(big.length).toBeGreaterThan(1024 * 1024)
    writeFileSync(join(repo, 'big.txt'), big, 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'big')

    const sides = await readDiffSides(
      repo,
      { original: { rev: 'HEAD', path: 'big.txt' }, modified: null },
      recording
    )

    expect(sides.original).toEqual({ kind: 'too-large', size: big.length })
    expect(calls.map((args) => args[0])).toEqual(['cat-file'])
  })

  it('reports a blob holding a NUL as binary', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d])
    writeFileSync(join(repo, 'logo.png'), bytes)
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'binary')

    const sides = await readDiffSides(repo, {
      original: { rev: 'HEAD', path: 'logo.png' },
      modified: null
    })

    expect(sides.original).toEqual({ kind: 'binary', size: bytes.length })
  })

  it('reports a revision that does not exist as an error, without throwing', async () => {
    const sides = await readDiffSides(repo, {
      original: { rev: 'no-such-rev', path: 'a.txt' },
      modified: { rev: 'HEAD', path: 'a.txt' }
    })

    expect(sides.original).toMatchObject({ kind: 'error' })
    // Git's own first line, not execFile's "Command failed: …" wrapper.
    expect((sides.original as { message: string }).message).toMatch(/^fatal:/)
  })

  it('reports the lines of a CRLF-committed file rewritten as LF on disk', async () => {
    writeFileSync(join(repo, 'crlf.txt'), 'one\r\ntwo\r\nthree\r\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'crlf')
    writeFileSync(join(repo, 'crlf.txt'), 'one\ntwo\nthree\n', 'utf8')

    const sides = await readDiffSides(repo, {
      original: { rev: 'HEAD', path: 'crlf.txt' },
      modified: { disk: true, path: 'crlf.txt' }
    })

    // The committed side must reach us with its terminators intact, or there
    // is nothing to compare (spike finding 1).
    expect(sides.original).toMatchObject({ kind: 'text', text: 'one\r\ntwo\r\nthree\r\n' })
    expect(sides.eolChanged).toEqual([1, 2, 3])
    expect(sides.eolFrom).toBe('CRLF')
    expect(sides.eolTo).toBe('LF')
  })
})

describe('readDiffSides against the working tree, under core.autocrlf', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-eol-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    // The condition this describes: Git for Windows sets this in its SYSTEM
    // config, and a repository without a .gitattributes inherits it. Set here
    // explicitly so the case exists on any machine, not only that one.
    git(repo, 'config', 'core.autocrlf', 'true')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reports no ending change when only the checkout filter differs (AD-035)', async () => {
    // Committed with LF, so the blob holds LF; checked out under autocrlf, so
    // the disk holds CRLF. Git will undo that difference on commit, and the
    // viewer must not report an ending change on every line because of it.
    const lf = ['alpha', 'beta', 'gamma'].join(LINE_FEED) + LINE_FEED
    writeFileSync(join(repo, 'a.txt'), lf, 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    // What the checkout would have written, byte for byte.
    const crlf = ['alpha', 'beta', 'gamma'].join(CARRIAGE + LINE_FEED) + CARRIAGE + LINE_FEED
    writeFileSync(join(repo, 'a.txt'), crlf, 'utf8')

    const sides = await readDiffSides(repo, {
      original: { rev: 'HEAD', path: 'a.txt' },
      modified: { disk: true, path: 'a.txt' }
    })

    expect(sides.eolChanged).toEqual([])
  })

  it('still reports a real ending change the filter does not explain (AD-035)', async () => {
    // The same repository, but the disk now holds LF where the checkout would
    // have written CRLF. That is a difference someone made, and it must show.
    const lf = ['alpha', 'beta', 'gamma'].join(LINE_FEED) + LINE_FEED
    writeFileSync(join(repo, 'a.txt'), lf, 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    writeFileSync(join(repo, 'a.txt'), lf, 'utf8')

    const sides = await readDiffSides(repo, {
      original: { rev: 'HEAD', path: 'a.txt' },
      modified: { disk: true, path: 'a.txt' }
    })

    expect(sides.eolChanged).toEqual([1, 2, 3])
    expect(sides.eolFrom).toBe('CRLF')
    expect(sides.eolTo).toBe('LF')
  })
})
