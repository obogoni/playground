import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChangedPath } from '../shared/files'
import { discardChanges, type DiscardDeps } from './file-discard'
import { git as runGit, type GitRunner } from './git'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** A git call a test expects to fail (a conflicting merge), its output ignored. */
const gitFails = (cwd: string, ...args: string[]): void => {
  try {
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return
  }
  throw new Error(`git ${args.join(' ')} was expected to fail`)
}

/** Tracked-only tests never reach the Recycle Bin; a call would show as a kept entry. */
const refuseAll: DiscardDeps['trash'] = async (p) => {
  throw new Error(`the Recycle Bin was not expected to see ${p}`)
}

/** The real runner, recording every argument list it was handed. */
function recording(): { run: GitRunner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    run: (cwd, args) => {
      calls.push(args)
      return runGit(cwd, args)
    }
  }
}

describe('discardChanges', () => {
  let root: string
  let repo: string

  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true })
    writeFileSync(join(repo, rel), text, 'utf8')
  }
  const read = (rel: string): string => readFileSync(join(repo, rel), 'utf8')
  const porcelain = (...paths: string[]): string =>
    git(repo, 'status', '--porcelain', '--', ...paths)
  const commitAll = (message: string): void => {
    git(repo, 'add', '-A')
    git(repo, 'commit', '-q', '-m', message)
  }

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-dc-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    // L-026: Git for Windows' system config sets core.autocrlf=true; renames
    // are pinned so a staged move reads as one entry whatever the user set.
    git(repo, 'config', 'core.autocrlf', 'false')
    git(repo, 'config', 'status.renames', 'true')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('tracked files', () => {
    it('brings an unstaged edit back to the last commit', async () => {
      write('a.txt', 'committed\n')
      commitAll('init')
      write('a.txt', 'edited\n')

      const result = await discardChanges(repo, [{ path: 'a.txt', status: 'modified' }], {
        trash: refuseAll
      })

      expect(result).toEqual({ files: [{ path: 'a.txt' }] })
      expect(porcelain()).toBe('')
      expect(read('a.txt')).toBe('committed\n')
    })

    it('drops staged and unstaged edits of one file together (FDSC-04)', async () => {
      write('a.txt', 'committed\n')
      commitAll('init')
      write('a.txt', 'staged\n')
      git(repo, 'add', 'a.txt')
      write('a.txt', 'staged then edited\n')
      expect(porcelain('a.txt')).toBe('MM a.txt\n') // precondition

      await discardChanges(repo, [{ path: 'a.txt', status: 'modified' }], { trash: refuseAll })

      expect(git(repo, 'diff', '--cached', '--name-only')).toBe('')
      expect(git(repo, 'diff', '--name-only')).toBe('')
      expect(read('a.txt')).toBe('committed\n')
    })

    it('puts an unstaged and a staged deletion back on disk and in the index (FDSC-05)', async () => {
      write('gone.txt', 'gone\n')
      write('removed.txt', 'removed\n')
      commitAll('init')
      rmSync(join(repo, 'gone.txt'))
      git(repo, 'rm', '-q', 'removed.txt')
      expect(porcelain()).toBe(' D gone.txt\nD  removed.txt\n') // precondition

      const result = await discardChanges(
        repo,
        [
          { path: 'gone.txt', status: 'deleted' },
          { path: 'removed.txt', status: 'deleted' }
        ],
        { trash: refuseAll }
      )

      expect(result).toEqual({ files: [{ path: 'gone.txt' }, { path: 'removed.txt' }] })
      expect(read('gone.txt')).toBe('gone\n')
      expect(read('removed.txt')).toBe('removed\n')
      expect(git(repo, 'ls-files').split('\n')).toEqual(['gone.txt', 'removed.txt', ''])
      expect(porcelain()).toBe('')
    })

    it('matches a path holding glob characters literally (FDSC-09)', async () => {
      write('a[b].txt', 'bracket\n')
      write('ab.txt', 'plain\n')
      commitAll('init')
      write('a[b].txt', 'bracket edited\n')
      write('ab.txt', 'plain edited\n')

      await discardChanges(repo, [{ path: 'a[b].txt', status: 'modified' }], {
        trash: refuseAll
      })

      // As a glob, `a[b].txt` also names `ab.txt`.
      expect(porcelain()).toBe(' M ab.txt\n')
      expect(read('a[b].txt')).toBe('bracket\n')
      expect(read('ab.txt')).toBe('plain edited\n')
    })

    it('discards the other files when git refuses one of them (FDSC-08)', async () => {
      write('a.txt', 'committed\n')
      commitAll('init')
      write('a.txt', 'edited\n')

      const result = await discardChanges(
        repo,
        [
          { path: 'a.txt', status: 'modified' },
          { path: 'ghost.txt', status: 'modified' }
        ],
        { trash: refuseAll }
      )

      expect(porcelain()).toBe('')
      expect(result.files[0]).toEqual({ path: 'a.txt' })
      expect(result.files[1].path).toBe('ghost.txt')
      expect(result.files[1].kept?.cause).toBe('git')
      expect(result.files[1].kept?.detail).toContain('ghost.txt')
    })

    it('restores a conflicted file to the last commit (FDSC-50)', async () => {
      write('c.txt', 'base\n')
      commitAll('init')
      git(repo, 'checkout', '-q', '-b', 'other')
      write('c.txt', 'theirs\n')
      commitAll('theirs')
      git(repo, 'checkout', '-q', 'main')
      write('c.txt', 'ours\n')
      commitAll('ours')
      gitFails(repo, 'merge', 'other')
      expect(porcelain('c.txt')).toBe('UU c.txt\n') // precondition

      const result = await discardChanges(repo, [{ path: 'c.txt', status: 'modified' }], {
        trash: refuseAll
      })

      expect(result).toEqual({ files: [{ path: 'c.txt' }] })
      expect(porcelain('c.txt')).toBe('')
      expect(read('c.txt')).toBe('ours\n')
    })

    it("keeps the files with git's error while another git holds index.lock (FDSC-51)", async () => {
      write('a.txt', 'committed\n')
      commitAll('init')
      write('a.txt', 'edited\n')
      writeFileSync(join(repo, '.git', 'index.lock'), '')

      const result = await discardChanges(repo, [{ path: 'a.txt', status: 'modified' }], {
        trash: refuseAll
      })

      expect(result.files[0].kept?.cause).toBe('git')
      expect(result.files[0].kept?.detail).toContain('index.lock')
      expect(read('a.txt')).toBe('edited\n')
    })

    it('does nothing to a path outside the worktree (FDSC-23)', async () => {
      write('a.txt', 'committed\n')
      commitAll('init')
      write('a.txt', 'edited\n')
      writeFileSync(join(root, 'outside.txt'), 'outside\n', 'utf8')
      const absolute = join(root, 'outside.txt')
      const { run, calls } = recording()

      const result = await discardChanges(
        repo,
        [
          { path: '../outside.txt', status: 'modified' },
          { path: absolute, status: 'modified' },
          { path: 'a.txt', status: 'modified' }
        ],
        { trash: refuseAll, run }
      )

      expect(result.files).toEqual([
        { path: '../outside.txt', kept: { cause: 'outside' } },
        { path: absolute, kept: { cause: 'outside' } },
        { path: 'a.txt' }
      ])
      const args = calls.flat()
      expect(args).not.toContain('../outside.txt')
      expect(args).not.toContain(absolute)
      expect(readFileSync(join(root, 'outside.txt'), 'utf8')).toBe('outside\n')
      expect(porcelain()).toBe('')
    })

    it('discards more files than one command line can carry (FDSC-49)', async () => {
      // 300 paths of 120 characters: 36,300 characters joined, past Windows'
      // 32,767-character command line.
      const paths = Array.from({ length: 300 }, (_, i) => {
        const head = `long/${String(i).padStart(3, '0')}-`
        return head + 'x'.repeat(120 - head.length - '.txt'.length) + '.txt'
      })
      expect(paths.every((p) => p.length === 120)).toBe(true) // precondition
      for (const p of paths) write(p, 'committed\n')
      commitAll('init')
      for (const p of paths) write(p, 'edited\n')
      const { run, calls } = recording()

      const result = await discardChanges(
        repo,
        paths.map((path): ChangedPath => ({ path, status: 'modified' })),
        { trash: refuseAll, run }
      )

      expect(result.files.filter((f) => f.kept)).toEqual([])
      expect(result.files).toHaveLength(300)
      expect(porcelain()).toBe('')
      // Every call fit on one command line, so none failed for its length and
      // leaned on the per-entry retry to get through.
      const longest = Math.max(...calls.map((args) => args.join(' ').length))
      expect(longest).toBeLessThan(32767)
    })

    it('runs git with literal pathspecs, restoring HEAD, on the entry paths alone (FDSC-42)', async () => {
      write('a.txt', 'a\n')
      write('b.txt', 'b\n')
      commitAll('init')
      write('a.txt', 'edited\n')
      rmSync(join(repo, 'b.txt'))
      const { run, calls } = recording()

      await discardChanges(
        repo,
        [
          { path: 'a.txt', status: 'modified' },
          { path: 'b.txt', status: 'deleted' }
        ],
        { trash: refuseAll, run }
      )

      expect(calls.length).toBeGreaterThan(0)
      for (const args of calls) {
        const dashes = args.indexOf('--')
        expect(args.slice(0, dashes)).toEqual([
          '--literal-pathspecs',
          'restore',
          '--source=HEAD',
          '--staged',
          '--worktree'
        ])
        for (const path of args.slice(dashes + 1)) expect(['a.txt', 'b.txt']).toContain(path)
      }
      expect(porcelain()).toBe('')
    })
  })
})
