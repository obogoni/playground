import { describe, expect, it } from 'vitest'
import { IGNORE_ASK_LIMIT, IgnoreAnswers, parentFolders } from './ignore-check'

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
