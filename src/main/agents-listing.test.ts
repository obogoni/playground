import { describe, expect, it } from 'vitest'
import { parseAgentsListing } from './agents-listing'

// The two entry shapes `claude agents --json` printed on 2.1.277 (2026-09-18):
// an interactive foreground session and a background one. Only `sessionId`
// and `name` are read; everything else is noise the parser must ignore.
const INTERACTIVE = {
  pid: 3724,
  cwd: 'E:\\Triade\\Repos',
  kind: 'interactive',
  startedAt: 1789826338857,
  sessionId: 'a1b2c3d4-0000-4000-8000-000000000001',
  name: 'repos-a2',
  status: 'busy'
}
const BACKGROUND = {
  id: 'db8e8b20',
  cwd: 'E:\\Triade\\Repos',
  kind: 'background',
  startedAt: 1786391122294,
  sessionId: 'db8e8b20-e1e6-4f47-89f2-82446c784a53',
  name: 'Revisar correções',
  state: 'blocked'
}

const listing = (entries: unknown[]): string => JSON.stringify(entries)

describe('parseAgentsListing', () => {
  it('maps every well-formed entry by sessionId, ignoring the other fields (SNAME-13)', () => {
    const names = parseAgentsListing(listing([INTERACTIVE, BACKGROUND]))

    expect(names).toEqual(
      new Map([
        [INTERACTIVE.sessionId, 'repos-a2'],
        [BACKGROUND.sessionId, 'Revisar correções']
      ])
    )
  })

  it('returns an empty map for an empty array', () => {
    expect(parseAgentsListing('[]')).toEqual(new Map())
  })

  it.each([
    ['not JSON at all', 'Usage: claude agents [options]'],
    ['a JSON object', '{"sessionId":"x","name":"y"}'],
    ['a JSON string', '"[]"'],
    ['empty output', '']
  ])('returns null when stdout is %s — not a JSON array (SNAME-12)', (_, stdout) => {
    expect(parseAgentsListing(stdout)).toBeNull()
  })

  it.each([
    ['a string', 'x'],
    ['null', null],
    ['a number', 7]
  ])('skips an element that is %s rather than an object (SNAME-13)', (_, element) => {
    expect(parseAgentsListing(listing([element, INTERACTIVE]))).toEqual(
      new Map([[INTERACTIVE.sessionId, 'repos-a2']])
    )
  })

  it.each([
    ['sessionId is missing', { name: 'alpha' }],
    ['sessionId is not a string', { sessionId: 42, name: 'alpha' }],
    ['sessionId is empty', { sessionId: '', name: 'alpha' }],
    ['name is missing', { sessionId: 'sid-1' }],
    ['name is not a string', { sessionId: 'sid-1', name: ['alpha'] }],
    ['name is whitespace only', { sessionId: 'sid-1', name: ' \t\n' }]
  ])('skips an entry whose %s (SNAME-13, whitespace edge case)', (_, entry) => {
    expect(parseAgentsListing(listing([entry]))).toEqual(new Map())
  })

  it('trims the name', () => {
    expect(parseAgentsListing(listing([{ sessionId: 'sid-1', name: '  alpha  ' }]))).toEqual(
      new Map([['sid-1', 'alpha']])
    )
  })

  it('lets the first entry with a non-empty name win a duplicated sessionId (edge case)', () => {
    const names = parseAgentsListing(
      listing([
        { sessionId: 'sid-1', name: '   ' },
        { sessionId: 'sid-1', name: 'first' },
        { sessionId: 'sid-1', name: 'second' }
      ])
    )

    expect(names).toEqual(new Map([['sid-1', 'first']]))
  })
})
