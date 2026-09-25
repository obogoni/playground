import { describe, expect, it } from 'vitest'
import { PASTE_GAP_MS, planPaste, quotePath } from './paste'

describe('quotePath', () => {
  it('wraps a path in double quotes (TSP-21)', () => {
    expect(quotePath('C:\\src\\notes.txt')).toBe('"C:\\src\\notes.txt"')
  })

  it('leaves spaces and non-ASCII inside the quotes untouched (TSP-37)', () => {
    const path = 'C:\\Acme Corp\\relatório.png'
    expect(quotePath(path)).toBe('"C:\\Acme Corp\\relatório.png"')
    expect(quotePath(path).slice(1, -1)).toBe(path)
  })
})

describe('planPaste', () => {
  it('sends clipboard text as one verbatim chunk (TSP-12)', () => {
    expect(planPaste({ kind: 'text', text: 'npm test' })).toEqual(['npm test'])
  })

  it('keeps multi-line text in a single chunk, newlines intact (TSP-12)', () => {
    const text = 'first\nsecond\r\nthird'
    expect(planPaste({ kind: 'text', text })).toEqual([text])
  })

  it('sends nothing for an empty clipboard (TSP-15)', () => {
    expect(planPaste({ kind: 'empty' })).toEqual([])
  })

  it('sends nothing when the clipboard read failed (TSP-16)', () => {
    expect(planPaste({ kind: 'error', message: 'GetFileDropList timed out' })).toEqual([])
  })

  it('quotes one chunk per path, in clipboard order (TSP-21)', () => {
    expect(
      planPaste({ kind: 'paths', paths: ['C:\\a\\one.png', 'C:\\b\\two.md', 'D:\\three'] })
    ).toEqual(['"C:\\a\\one.png"', '"C:\\b\\two.md"', '"D:\\three"'])
  })

  it('keeps spaces and non-ASCII in pasted paths byte for byte (TSP-37)', () => {
    expect(
      planPaste({ kind: 'paths', paths: ['C:\\Acme Corp\\relatório.png', 'C:\\tmp\\ação.txt'] })
    ).toEqual(['"C:\\Acme Corp\\relatório.png"', '"C:\\tmp\\ação.txt"'])
  })

  it('skips paths that resolved to nothing, keeping the rest (TSP-27)', () => {
    expect(planPaste({ kind: 'paths', paths: ['', 'C:\\a\\one.png', ''] })).toEqual([
      '"C:\\a\\one.png"'
    ])
  })

  it('sends nothing when no dropped item resolved to a path (TSP-27)', () => {
    expect(planPaste({ kind: 'paths', paths: ['', ''] })).toEqual([])
    expect(planPaste({ kind: 'paths', paths: [] })).toEqual([])
  })
})

describe('PASTE_GAP_MS', () => {
  it('is the 100 ms gap between consecutive pastes (TSP-22)', () => {
    expect(PASTE_GAP_MS).toBe(100)
  })
})
