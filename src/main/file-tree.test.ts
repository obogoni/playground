import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changedSince, foldChildren, listBases, listDir, parseNameStatus } from './file-tree'
import { git as runGit, type GitRunner } from './git'

/** `git diff --name-status -z` output: NUL after every field, including the last. */
const z = (...fields: string[]): string => fields.map((f) => `${f}\0`).join('')

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('foldChildren', () => {
  it('folds recursive descendants into one level of files and folders', () => {
    // FXPL-05: `--cached` reports every tracked descendant of the folder;
    // expanding `src/` must yield its direct children only.
    const entries = foldChildren(['src/a/f.ts', 'src/a/g.ts', 'src/index.ts'], 'src')

    expect(entries).toEqual([
      { name: 'a', path: 'src/a', kind: 'dir' },
      { name: 'index.ts', path: 'src/index.ts', kind: 'file' }
    ])
  })

  it('collapses a wholly untracked folder into one dir entry flagged untracked', () => {
    const entries = foldChildren(['newdir/'], '')

    expect(entries).toEqual([{ name: 'newdir', path: 'newdir', kind: 'dir', untracked: true }])
  })

  it('sorts folders before files, each alphabetically, case-insensitive', () => {
    const entries = foldChildren(['Zebra.ts', 'apple.ts', 'Beta/x.ts', 'alpha/y.ts'], '')

    expect(entries.map((e) => e.name)).toEqual(['alpha', 'Beta', 'apple.ts', 'Zebra.ts'])
  })
})

/**
 * Builds a commit of `count` files under one top-level folder, with paths long
 * enough that listing them all passes 1 MiB — in ONE git process. Spawning a
 * commit per file would take minutes; `fast-import` takes the whole tree on
 * stdin.
 */
function importDeepTree(repo: string, count: number): void {
  const lf = String.fromCharCode(10)
  // ~320 characters per path, so `count` of them comfortably passes 1 MiB.
  const deep = `deep/${Array.from({ length: 5 }, () => 'x'.repeat(60)).join('/')}`
  const lines = ['blob', 'mark :1', 'data 3', 'hi', '']
  lines.push('commit refs/heads/main')
  lines.push('committer Test <test@test.local> 1700000000 +0000')
  lines.push('data 4')
  lines.push('init')
  for (let i = 0; i < count; i += 1) lines.push(`M 100644 :1 ${deep}/f${i}.txt`)
  lines.push('')
  lines.push('done')
  execFileSync('git', ['fast-import', '--done', '--quiet'], {
    cwd: repo,
    input: `${lines.join(lf)}${lf}`,
    windowsHide: true
  })
}

describe('listDir', () => {
  let root: string
  let repo: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-ft-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n', 'utf8')
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'src', 'index.ts'), 'export {}\n', 'utf8')
    mkdirSync(join(repo, 'src', 'lib'))
    writeFileSync(join(repo, 'src', 'lib', 'deep.ts'), 'export {}\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    mkdirSync(join(repo, 'node_modules'))
    writeFileSync(join(repo, 'node_modules', 'dep.js'), 'module.exports = 1\n', 'utf8')
    writeFileSync(join(repo, 'notes.md'), '# notes\n', 'utf8')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('never lists an ignored folder', async () => {
    const listing = await listDir(repo, '')

    expect(listing.entries.map((e) => e.name)).not.toContain('node_modules')
  })

  it('lists an untracked file that .gitignore does not exclude', async () => {
    const listing = await listDir(repo, '')

    expect(listing.entries).toContainEqual({ name: 'notes.md', path: 'notes.md', kind: 'file' })
  })

  it('lists one folder’s direct children, not the whole tree', async () => {
    const listing = await listDir(repo, 'src')

    expect(listing.entries).toEqual([
      { name: 'lib', path: 'src/lib', kind: 'dir' },
      { name: 'index.ts', path: 'src/index.ts', kind: 'file' }
    ])
  })

  it('shows a file staged but not yet committed', async () => {
    // The listing follows the index, not the last commit: an agent that runs
    // `git add` must not make a file it just wrote disappear from the tree.
    writeFileSync(join(repo, 'src', 'staged.ts'), 'export {}\n', 'utf8')
    git(repo, 'add', 'src/staged.ts')

    const listing = await listDir(repo, 'src')

    expect(listing.entries.map((e) => e.name)).toContain('staged.ts')
  })

  it('does not show a file staged for deletion', async () => {
    // HEAD still holds it, so reading the commit alone would show a file that
    // is in neither the index nor the working copy.
    git(repo, 'rm', '-q', 'src/index.ts')

    const listing = await listDir(repo, 'src')

    expect(listing.entries.map((e) => e.name)).not.toContain('index.ts')
    expect(listing.entries.map((e) => e.name)).toContain('lib')
  })

  it('still shows a file removed from the index but left on disk', async () => {
    // `git rm --cached` makes it untracked, not gone: it is still a file in
    // that folder, and the tree says so.
    git(repo, 'rm', '--cached', '-q', 'src/index.ts')

    const listing = await listDir(repo, 'src')

    expect(listing.entries.map((e) => e.name)).toContain('index.ts')
  })

  it('lists untracked files before the first commit', async () => {
    // An unborn HEAD has no tree to read; the folder is still worth showing.
    const fresh = join(root, 'fresh')
    mkdirSync(fresh)
    git(fresh, 'init', '-b', 'main')
    writeFileSync(join(fresh, 'only.txt'), 'hi\n', 'utf8')

    const listing = await listDir(fresh, '')

    expect(listing.error).toBeUndefined()
    expect(listing.entries.map((e) => e.name)).toEqual(['only.txt'])
  })

  it('reads no call larger than the old 1 MiB stdout ceiling', async () => {
    // The defect this guards: `ls-files --cached` lists every tracked
    // DESCENDANT, so drawing the root of a large repository returned megabytes
    // and `execFile` answered "stdout maxBuffer length exceeded" — the mode
    // showed nothing at all. The runner below re-imposes that old ceiling, so
    // this test fails for any implementation that reads the subtree to draw
    // one level.
    const big = join(root, 'big')
    mkdirSync(big)
    git(big, 'init', '-b', 'main')
    importDeepTree(big, 3500)
    // Populate the index without checking 3500 files out onto disk: the point
    // is what git is ASKED for, not what is on the filesystem.
    git(big, 'read-tree', 'HEAD')
    const capped: GitRunner = async (cwd, args) => {
      const result = await runGit(cwd, args)
      if (Buffer.byteLength(result.stdout, 'utf8') > 1024 * 1024) {
        throw new Error('stdout maxBuffer length exceeded')
      }
      return result
    }

    const listing = await listDir(big, '', capped)

    expect(listing.error).toBeUndefined()
    expect(listing.entries.map((e) => e.name)).toEqual(['deep'])
  })

  it('returns git’s error line and no entries when git fails', async () => {
    const listing = await listDir(root, '')

    expect(listing.entries).toEqual([])
    expect(listing.error).toMatch(/^fatal: not a git repository/)
  })
})

describe('parseNameStatus', () => {
  it('maps M, A, D and T onto the ChangeStatus vocabulary', () => {
    const files = parseNameStatus(
      z('M', 'edited.ts', 'A', 'added.ts', 'D', 'gone.ts', 'T', 'link.ts')
    )

    expect(files).toEqual([
      { path: 'edited.ts', status: 'modified' },
      { path: 'added.ts', status: 'added' },
      { path: 'gone.ts', status: 'deleted' },
      { path: 'link.ts', status: 'modified' }
    ])
  })

  it('maps a scored rename onto renamed, carrying the old path', () => {
    const files = parseNameStatus(z('R100', 'old/name.ts', 'new/name.ts'))

    expect(files).toEqual([{ path: 'new/name.ts', status: 'renamed', oldPath: 'old/name.ts' }])
  })

  it('maps a scored copy onto added, carrying the source path', () => {
    const files = parseNameStatus(z('C75', 'src/origin.ts', 'src/copy.ts'))

    expect(files).toEqual([{ path: 'src/copy.ts', status: 'added', oldPath: 'src/origin.ts' }])
  })
})

describe('changedSince', () => {
  let root: string
  let repo: string
  let baseCommit: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-cs-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one\n', 'utf8')
    writeFileSync(join(repo, 'other.txt'), 'untouched\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
    baseCommit = git(repo, 'rev-parse', 'HEAD').trim()
    git(repo, 'checkout', '-b', 'feature')
    writeFileSync(join(repo, 'new.txt'), 'fresh\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'add new')
    writeFileSync(join(repo, 'a.txt'), 'two\n', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'edit a')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('lists what the branch committed since its merge-base with the base', async () => {
    const listing = await changedSince(repo, 'main')

    expect(listing.mergeBase).toBe(baseCommit)
    expect(listing.files).toEqual([
      { path: 'a.txt', status: 'modified' },
      { path: 'new.txt', status: 'added' }
    ])
  })

  it('does not list an uncommitted edit', async () => {
    writeFileSync(join(repo, 'other.txt'), 'dirty\n', 'utf8')

    const listing = await changedSince(repo, 'main')

    expect(listing.files.map((f) => f.path)).not.toContain('other.txt')
  })

  it('returns no merge base, no files and git’s error line when the base is gone', async () => {
    const listing = await changedSince(repo, 'deleted-base')

    expect(listing.mergeBase).toBeNull()
    expect(listing.files).toEqual([])
    expect(listing.error).toMatch(/deleted-base/)
  })
})

describe('listBases', () => {
  let root: string
  let origin: string
  let clone: string

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-lb-')))
    origin = join(root, 'origin')
    clone = join(root, 'clone')
    mkdirSync(origin)
    git(origin, 'init', '-b', 'main')
    git(origin, 'config', 'user.email', 'test@test.local')
    git(origin, 'config', 'user.name', 'Test')
    writeFileSync(join(origin, 'a.txt'), 'one\n', 'utf8')
    git(origin, 'add', '.')
    git(origin, 'commit', '-m', 'init')
    git(origin, 'branch', 'release')
    git(root, 'clone', origin, clone)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('defaults the base to what origin/HEAD points at', async () => {
    const bases = await listBases(clone)

    expect(bases.defaultBase).toBe('origin/main')
  })

  it('reports no default base when the repo has no origin/HEAD', async () => {
    const bases = await listBases(origin)

    expect(bases.defaultBase).toBeNull()
  })

  it('lists local and remote branches without the origin/HEAD symref', async () => {
    const bases = await listBases(clone)

    expect(bases.branches).toEqual(['main', 'origin/main', 'origin/release'])
  })
})
