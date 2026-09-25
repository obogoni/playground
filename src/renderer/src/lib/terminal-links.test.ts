import { describe, expect, it } from 'vitest'
import { MAX_CANDIDATES_PER_LINE, detectLinkCandidates } from './terminal-links'

describe('url candidates (LINK-01, LINK-22, LINK-23)', () => {
  it('detects an https url with its exact span', () => {
    const line = 'see https://dev.azure.com/x/y/_workitems/edit/123 now'
    expect(detectLinkCandidates(line)).toEqual([
      {
        kind: 'url',
        text: 'https://dev.azure.com/x/y/_workitems/edit/123',
        start: 4,
        end: 4 + 'https://dev.azure.com/x/y/_workitems/edit/123'.length
      }
    ])
  })

  it('detects an http url', () => {
    const [candidate] = detectLinkCandidates('http://localhost:3000/app')
    expect(candidate).toMatchObject({ kind: 'url', text: 'http://localhost:3000/app' })
  })

  it.each([
    ['https://x.y/a?b=1.', 'https://x.y/a?b=1'],
    ['https://x.y/a,', 'https://x.y/a'],
    ['https://x.y/a;', 'https://x.y/a'],
    ['https://x.y/a:', 'https://x.y/a'],
    ['(https://x.y/a)', 'https://x.y/a'],
    ['[https://x.y/a]', 'https://x.y/a']
  ])('excludes trailing punctuation: %s → %s', (line, expected) => {
    const candidates = detectLinkCandidates(line)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ kind: 'url', text: expected })
  })

  it.each(['mailto:a@b.c', 'vscode://file/E:/x/y.ts', 'file:///E:/x/y.cs', 'ms-teams:launch'])(
    'never yields a candidate for %s',
    (line) => {
      expect(detectLinkCandidates(line)).toEqual([])
    }
  )

  it('never also reports a url span as a path candidate', () => {
    const candidates = detectLinkCandidates('open https://h/p/q.ts:12 please')
    expect(candidates).toHaveLength(1)
    expect(candidates[0].kind).toBe('url')
  })
})

describe('path candidates (LINK-06)', () => {
  it.each([
    ['src/lib/foo.ts:12:3', 'src/lib/foo.ts', 12, 3],
    ['E:\\Repos\\X\\Foo.cs:40', 'E:\\Repos\\X\\Foo.cs', 40, null],
    ['.\\a\\b.sql', '.\\a\\b.sql', null, null],
    ['..\\c.md', '..\\c.md', null, null],
    ['~/x/y', '~/x/y', null, null],
    ['/abs/p', '/abs/p', null, null]
  ])('detects %s as a path', (text, pathText, line, col) => {
    const candidates = detectLinkCandidates(`edited ${text} just now`)
    expect(candidates).toEqual([
      {
        kind: 'path',
        text,
        pathText,
        line,
        col,
        start: 'edited '.length,
        end: 'edited '.length + text.length
      }
    ])
  })

  it('keeps a path that ends the line', () => {
    const [candidate] = detectLinkCandidates('Updated src/main/index.ts')
    expect(candidate).toMatchObject({ kind: 'path', pathText: 'src/main/index.ts', end: 25 })
  })

  it.each(['Foo.cs', 'package.json', 'Foo.cs(40,12): error CS0246'])(
    'does not treat %s as a path (no separator / MSBuild form are out of scope)',
    (line) => {
      expect(detectLinkCandidates(line).filter((c) => c.kind === 'path')).toEqual([])
    }
  )

  it('strips a trailing closing bracket or punctuation from a path', () => {
    const [candidate] = detectLinkCandidates('(see src/a.ts).')
    expect(candidate).toMatchObject({ kind: 'path', pathText: 'src/a.ts', text: 'src/a.ts' })
  })

  it('returns candidates ordered by their start index', () => {
    const starts = detectLinkCandidates('a/b.ts then https://h/x then c/d.md').map((c) => c.start)
    expect(starts).toEqual([...starts].sort((x, y) => x - y))
  })
})

describe('spaced path candidates (LINK-08)', () => {
  it('offers extension-terminated prefixes, longest first, for a path with spaces', () => {
    const line = 'salvo em E:\\Meus Docs\\a.txt agora'
    const [candidate] = detectLinkCandidates(line)
    expect(candidate).toMatchObject({
      kind: 'path',
      start: 'salvo em '.length,
      pathText: 'E:\\Meus Docs\\a.txt',
      text: 'E:\\Meus Docs\\a.txt'
    })
    expect(candidate.kind === 'path' && candidate.alternatives).toEqual([
      { pathText: 'E:\\Meus Docs\\a.txt', end: 'salvo em E:\\Meus Docs\\a.txt'.length }
    ])
  })

  it('does not offer a prefix without an extension as an alternative', () => {
    const [candidate] = detectLinkCandidates('E:\\Meus Docs\\a.txt')
    const alternatives = candidate.kind === 'path' ? candidate.alternatives : undefined
    expect(alternatives?.map((a) => a.pathText)).not.toContain('E:\\Meus')
  })

  it('offers every extension-terminated prefix when the spaced path has several', () => {
    const [candidate] = detectLinkCandidates('E:\\Meus Docs\\a.txt b.md')
    const alternatives = candidate.kind === 'path' ? candidate.alternatives : undefined
    expect(alternatives?.map((a) => a.pathText)).toEqual([
      'E:\\Meus Docs\\a.txt b.md',
      'E:\\Meus Docs\\a.txt'
    ])
  })

  it('keeps two absolute paths on one line apart instead of merging them', () => {
    const texts = detectLinkCandidates('/a/b.txt /c/d.txt').map((c) => c.text)
    expect(texts).toEqual(['/a/b.txt', '/c/d.txt'])
  })

  it('does not build a spaced candidate for a path without spaces', () => {
    const [candidate] = detectLinkCandidates('E:\\Docs\\a.txt')
    expect(candidate.kind === 'path' && candidate.alternatives).toBeUndefined()
  })
})

describe('bounds', () => {
  it('caps a line at the candidate limit, keeping the first ones in order', () => {
    const line = Array.from({ length: MAX_CANDIDATES_PER_LINE + 5 }, (_, i) => `d/f${i}.ts`).join(
      ' '
    )
    const candidates = detectLinkCandidates(line)
    expect(MAX_CANDIDATES_PER_LINE).toBe(32)
    expect(candidates).toHaveLength(32)
    expect(candidates[0]).toMatchObject({ pathText: 'd/f0.ts' })
    expect(candidates[31]).toMatchObject({ pathText: 'd/f31.ts' })
  })

  it('returns nothing for an empty or link-free line', () => {
    expect(detectLinkCandidates('')).toEqual([])
    expect(detectLinkCandidates('plain prose without links')).toEqual([])
  })
})
