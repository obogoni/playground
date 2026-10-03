import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { git as runGit, READ_ONLY_FLAGS } from './git'
import {
  checkIgnored,
  IGNORE_ASK_LIMIT,
  IGNORE_CHECK_TIMEOUT_MS,
  IgnoreAnswers,
  parentFolders,
  type IgnoreRunner
} from './ignore-check'

const sh = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** `count` paths `d/fNNNN.ts` under one folder: one folder question plus `count` path questions. */
function underOneFolder(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `d/f${String(i).padStart(4, '0')}.ts`)
}

/** `count` paths `dNNNN/a.ts`, each in its own folder: `count` folder questions plus `count` path questions. */
function oneFolderEach(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `d${String(i).padStart(4, '0')}/a.ts`)
}

describe('IGNORE_ASK_LIMIT', () => {
  it('is 2000 (FWIG-06, L-009)', () => {
    expect(IGNORE_ASK_LIMIT).toBe(2000)
  })
})

describe('parentFolders', () => {
  it('lists the parent folders outermost first', () => {
    expect(parentFolders('a/b/c.ts')).toEqual(['a', 'a/b'])
  })

  it('gives none for a root-level path', () => {
    expect(parentFolders('c.ts')).toEqual([])
  })
})

describe('IgnoreAnswers', () => {
  describe('questionsFor (FWIG-05)', () => {
    it('asks about every parent folder and the path when nothing is known, folders first', () => {
      expect(new IgnoreAnswers().questionsFor(['bin/Debug/a.dll'])).toEqual([
        'bin',
        'bin/Debug',
        'bin/Debug/a.dll'
      ])
    })

    it('asks each question once across several paths, folders before every path', () => {
      const answers = new IgnoreAnswers()
      expect(
        answers.questionsFor(['bin/Debug/a.dll', 'bin/Debug/b.dll', 'src/a.ts', 'bin'])
      ).toEqual(['bin', 'bin/Debug', 'src', 'bin/Debug/a.dll', 'bin/Debug/b.dll', 'src/a.ts'])
    })
  })

  describe('learn and isIgnored (FWIG-04)', () => {
    it('treats an ignored folder as a prefix and asks nothing under it again', () => {
      const answers = new IgnoreAnswers()
      answers.learn(
        ['bin', 'bin/Debug', 'bin/Debug/a.dll'],
        new Set(['bin', 'bin/Debug', 'bin/Debug/a.dll'])
      )
      expect(answers.isIgnored('bin/x/y.dll')).toBe(true)
      expect(answers.isIgnored('bin')).toBe(true)
      expect(answers.questionsFor(['bin/x/y.dll', 'bin/Debug/c.dll'])).toEqual([])
    })

    it('does not count a sibling whose name only starts like the ignored folder', () => {
      const answers = new IgnoreAnswers()
      answers.learn(['bin'], new Set(['bin']))
      expect(answers.isIgnored('binary/a.ts')).toBe(false)
    })

    it('keeps a path asked and not listed, and never asks about it again', () => {
      const answers = new IgnoreAnswers()
      answers.learn(['src', 'src/a.ts'], new Set())
      expect(answers.isIgnored('src/a.ts')).toBe(false)
      expect(answers.questionsFor(['src/a.ts'])).toEqual([])
      // A kept folder says nothing about what is under it: only the new path is asked.
      expect(answers.questionsFor(['src/b.ts'])).toEqual(['src/b.ts'])
    })

    it('keeps a tracked file in a kept folder and drops what an ignored subfolder holds (FWIG-03)', () => {
      const answers = new IgnoreAnswers()
      answers.learn(['bin', 'bin/keep.txt', 'bin/Debug'], new Set(['bin/Debug']))
      expect(answers.isIgnored('bin/keep.txt')).toBe(false)
      expect(answers.isIgnored('bin/Debug/a.dll')).toBe(true)
    })

    it('reports a path with no answer as not ignored', () => {
      expect(new IgnoreAnswers().isIgnored('bin/a.dll')).toBe(false)
    })
  })

  describe('the ask limit (FWIG-06, L-042, L-050)', () => {
    it('asks every question at exactly the limit', () => {
      const paths = underOneFolder(1999)
      const asked = new IgnoreAnswers().questionsFor(paths)
      expect(asked).toHaveLength(2000)
      expect(asked).toEqual(['d', ...paths])
    })

    it('asks only the folders one question over the limit', () => {
      expect(new IgnoreAnswers().questionsFor(underOneFolder(2000))).toEqual(['d'])
    })

    it('asks the folders when they alone are exactly the limit and the paths push it over', () => {
      const paths = oneFolderEach(2000)
      const asked = new IgnoreAnswers().questionsFor(paths)
      expect(asked).toEqual(paths.map((p) => p.slice(0, p.indexOf('/'))))
      expect(asked).toHaveLength(2000)
    })

    it('asks nothing when the folders alone exceed the limit', () => {
      expect(new IgnoreAnswers().questionsFor(oneFolderEach(2001))).toEqual([])
    })

    it('remembers nothing about the paths it did not ask about', () => {
      const answers = new IgnoreAnswers()
      const paths = underOneFolder(2000)
      const asked = answers.questionsFor(paths)
      answers.learn(asked, new Set())
      expect(answers.isIgnored(paths[0])).toBe(false)
      // The folder is answered now, so the paths fit the limit and are asked.
      expect(answers.questionsFor(paths)).toEqual(paths)
    })
  })

  describe('forget (FWIG-07, FWIG-08, FWIG-09)', () => {
    it('makes every path unknown again', () => {
      const answers = new IgnoreAnswers()
      answers.learn(['bin', 'src', 'src/a.ts'], new Set(['bin']))
      answers.forget()
      expect(answers.isIgnored('bin/a.dll')).toBe(false)
      expect(answers.questionsFor(['bin/a.dll', 'src/a.ts'])).toEqual([
        'bin',
        'src',
        'bin/a.dll',
        'src/a.ts'
      ])
    })
  })
})

describe('IGNORE_CHECK_TIMEOUT_MS', () => {
  it('is 5000 (FWIG-10, L-009)', () => {
    expect(IGNORE_CHECK_TIMEOUT_MS).toBe(5000)
  })
})

describe('checkIgnored (real repository)', () => {
  let root: string
  let repo: string

  /** Creates each file, and its folders, under the repository. */
  const touch = (...paths: string[]): void => {
    for (const path of paths) {
      mkdirSync(dirname(join(repo, path)), { recursive: true })
      writeFileSync(join(repo, path), 'x\n', 'utf8')
    }
  }

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'wtm-ign-')))
    repo = join(root, 'repo')
    mkdirSync(repo)
    sh(repo, 'init', '-q', '-b', 'main')
    sh(repo, 'config', 'user.email', 'test@test.local')
    sh(repo, 'config', 'user.name', 'Test')
    // This machine's system gitconfig sets core.autocrlf=true (L-026).
    sh(repo, 'config', 'core.autocrlf', 'false')
    writeFileSync(join(repo, '.gitignore'), 'bin/\n*.log\n', 'utf8')
    touch('src/a.ts')
    writeFileSync(join(repo, 'src', '.gitignore'), 'gen/\n', 'utf8')
    writeFileSync(join(repo, '.git', 'info', 'exclude'), 'scratch/\n', 'utf8')
    sh(repo, 'add', '.')
    sh(repo, 'commit', '-q', '-m', 'init')
    touch('bin/Debug/a.dll', 'src/x.log', 'src/gen/a.ts', 'scratch/n.txt')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('answers what every exclude source ignores, at any depth, and nothing else (FWIG-03)', async () => {
    const ignored = await checkIgnored(repo, [
      'bin',
      'bin/Debug',
      'bin/Debug/a.dll',
      'src',
      'src/a.ts',
      'src/x.log',
      'src/gen',
      'src/gen/a.ts',
      'scratch',
      'scratch/n.txt'
    ])
    expect(ignored).toEqual(
      new Set([
        'bin',
        'bin/Debug',
        'bin/Debug/a.dll',
        'src/x.log',
        'src/gen',
        'src/gen/a.ts',
        'scratch',
        'scratch/n.txt'
      ])
    )
  })

  it('never answers a tracked file, nor the ignored folder that holds it, as ignored (FWIG-03)', async () => {
    touch('bin/keep.txt')
    sh(repo, 'add', '-f', 'bin/keep.txt')
    sh(repo, 'commit', '-q', '-m', 'keep')

    const ignored = await checkIgnored(repo, [
      'bin',
      'bin/keep.txt',
      'bin/Debug',
      'bin/Debug/a.dll'
    ])
    expect(ignored).toEqual(new Set(['bin/Debug', 'bin/Debug/a.dll']))
  })

  it('still answers the paths under a deleted ignored folder, but not the folder itself (FWIG-47)', async () => {
    rmSync(join(repo, 'bin'), { recursive: true, force: true })

    const ignored = await checkIgnored(repo, ['bin', 'bin/Debug', 'bin/Debug/a.dll'])
    expect(ignored).toEqual(new Set(['bin/Debug', 'bin/Debug/a.dll']))
  })

  it('answers an empty set, not null, when git ignores none of the paths (exit code 1)', async () => {
    expect(await checkIgnored(repo, ['src', 'src/a.ts'])).toEqual(new Set())
  })

  it('answers paths with unusual characters exactly as they were sent (FWIG-48)', async () => {
    const odd = ['bin/a b.dll', 'bin/#h.dll', 'bin/!x.dll', 'bin/-lead.dll', 'bin/é.dll']
    const oddRoot = ['-lead.log', '#h.log', '!x.log', 'a b.log', 'é.log']
    touch(...odd, ...oddRoot, 'src/é ! #.ts', 'src/-a.ts')

    const ignored = await checkIgnored(repo, [...odd, ...oddRoot, 'src/é ! #.ts', 'src/-a.ts'])
    expect(ignored).toEqual(new Set([...odd, ...oddRoot]))
  })

  it('answers null in a folder that is not a repository (FWIG-10)', async () => {
    const plain = join(root, 'plain')
    mkdirSync(plain)
    expect(await checkIgnored(plain, ['bin', 'bin/a.dll'])).toBeNull()
  })

  it('answers null when the run is killed at its timeout, which is 5000 ms (FWIG-10)', async () => {
    const timeouts: number[] = []
    // Stands in for a check-ignore that hangs: a real git whose `!` alias sleeps past the limit,
    // killed by the runner's timeout, so the rejection has the runner's real timeout shape. Not
    // a read waiting on stdin: CRTO-06 (#153) ends stdin on every call. It runs in the system temp
    // folder: on Windows killing git leaves the sleep running, and in the repo it would hold the
    // folder afterEach deletes (EBUSY).
    const hanging: IgnoreRunner = (_cwd, _args, opts) => {
      timeouts.push(opts.timeoutMs)
      return runGit(tmpdir(), ['-c', 'alias.wait=!sleep 5', 'wait'], { timeoutMs: 200 })
    }

    expect(await checkIgnored(repo, ['bin', 'bin/a.dll'], hanging)).toBeNull()
    expect(timeouts).toEqual([5000])
  })

  it('runs one read-only check-ignore over stdin, each path ended by NUL (FWIG-15, L-020)', async () => {
    const calls: { args: string[]; input: string }[] = []
    const recording: IgnoreRunner = (cwd, args, opts) => {
      calls.push({ args, input: opts.input })
      return runGit(cwd, args, opts)
    }

    const ignored = await checkIgnored(repo, ['bin', 'src/a.ts', 'src/x.log'], recording)

    expect(ignored).toEqual(new Set(['bin', 'src/x.log']))
    expect(calls).toEqual([
      {
        args: [
          '--no-optional-locks',
          '-c',
          'diff.autoRefreshIndex=false',
          'check-ignore',
          '--stdin',
          '-z'
        ],
        input: 'bin\0src/a.ts\0src/x.log\0'
      }
    ])
    expect(calls[0].args.slice(0, READ_ONLY_FLAGS.length)).toEqual([...READ_ONLY_FLAGS])
  })
})
