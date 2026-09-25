import { describe, expect, it } from 'vitest'
import {
  activeBufferOf,
  bufferPositionForMouseEvent,
  rangeContains,
  rangeForStringSpan,
  windowedLine,
  type BufferLike,
  type BufferLineLike,
  type CellLike,
  type TerminalGeometry
} from './terminal-buffer-lines'

/** A row spec: its text, whether it continues the row above, and which 0-based columns hold a 2-cell char. */
type RowSpec = { text: string; wrapped?: boolean; wide?: number[] }

/** Builds a fake buffer whose rows are `cols` cells wide; a wide char occupies its column plus an empty one. */
function makeBuffer(cols: number, rows: RowSpec[]): BufferLike {
  const lines: BufferLineLike[] = rows.map(({ text, wrapped = false, wide = [] }) => {
    // Lay the text into cells: a wide char takes two cells (the second empty, width 0).
    const cells: { chars: string; width: number }[] = []
    for (let i = 0; i < text.length; i++) {
      if (wide.includes(i)) {
        cells.push({ chars: text[i], width: 2 }, { chars: '', width: 0 })
      } else {
        cells.push({ chars: text[i], width: 1 })
      }
    }
    while (cells.length < cols) cells.push({ chars: '', width: 1 })
    return {
      isWrapped: wrapped,
      length: cols,
      translateToString: (trimRight) => {
        const full = cells.map((c) => c.chars || (c.width === 0 ? '' : ' ')).join('')
        return trimRight ? full.replace(/\s+$/, '') : full
      },
      getCell: (x, cell) => {
        const source = cells[x]
        if (!source) return undefined
        const target = (cell ?? makeCell()) as MutableCell
        target.chars = source.chars
        target.width = source.width
        return target
      }
    }
  })
  return { getLine: (y) => lines[y], getNullCell: makeCell }
}

type MutableCell = CellLike & { chars: string; width: number }

function makeCell(): MutableCell {
  const cell: MutableCell = {
    chars: '',
    width: 0,
    getChars: () => cell.chars,
    getWidth: () => cell.width
  }
  return cell
}

describe('windowedLine (LINK-03)', () => {
  it('joins the wrapped rows around the row, in both directions', () => {
    const buffer = makeBuffer(10, [
      { text: 'plain row' },
      { text: 'https://ex' },
      { text: 'ample.com/', wrapped: true },
      { text: 'a/b.ts', wrapped: true },
      { text: 'next' }
    ])
    expect(windowedLine(buffer, 2)).toEqual({
      text: 'https://example.com/a/b.ts',
      topRow: 1,
      fingerprint: 'https://example.com/a/b.ts'
    })
  })

  it('stops the window at a row that contains a space', () => {
    const buffer = makeBuffer(10, [
      { text: 'see http:/' },
      { text: '/h/p.ts ok', wrapped: true },
      { text: 'more text', wrapped: true }
    ])
    expect(windowedLine(buffer, 0)).toMatchObject({ text: 'see http://h/p.ts ok', topRow: 0 })
  })

  it('returns the row itself with topRow unchanged when nothing is wrapped', () => {
    const buffer = makeBuffer(10, [{ text: 'a' }, { text: 'src/x.ts' }, { text: 'c' }])
    expect(windowedLine(buffer, 1)).toEqual({
      text: 'src/x.ts',
      topRow: 1,
      fingerprint: 'src/x.ts'
    })
  })

  it('does not walk above the first buffer row', () => {
    const buffer = makeBuffer(10, [
      { text: 'abc', wrapped: true },
      { text: 'def', wrapped: true }
    ])
    expect(windowedLine(buffer, 1)).toMatchObject({ text: 'abcdef', topRow: 0 })
  })

  it('bounds the window at 2048 characters', () => {
    const rows: RowSpec[] = [{ text: 'x'.repeat(100) }]
    for (let i = 0; i < 30; i++) rows.push({ text: 'y'.repeat(100), wrapped: true })
    const text = windowedLine(makeBuffer(100, rows), 0)?.text ?? ''
    expect(text.length).toBeLessThanOrEqual(100 + 2048 + 100)
    expect(text.length).toBeGreaterThan(2048)
  })

  it('changes the fingerprint when a joined row is repainted', () => {
    const before = windowedLine(
      makeBuffer(10, [{ text: 'abc' }, { text: 'def', wrapped: true }]),
      0
    )
    const after = windowedLine(makeBuffer(10, [{ text: 'abc' }, { text: 'dXf', wrapped: true }]), 0)
    expect(before?.fingerprint).not.toBe(after?.fingerprint)
  })

  it('returns null for a row outside the buffer', () => {
    expect(windowedLine(makeBuffer(10, [{ text: 'a' }]), 5)).toBeNull()
  })
})

describe('rangeForStringSpan (LINK-03)', () => {
  it('maps a span inside one row to 1-based, end-inclusive cells', () => {
    const buffer = makeBuffer(20, [{ text: 'see src/a.ts now' }])
    expect(rangeForStringSpan(buffer, 0, 4, 12)).toEqual({
      start: { x: 5, y: 1 },
      end: { x: 12, y: 1 }
    })
  })

  it('maps a span that crosses a wrap boundary onto two rows', () => {
    const buffer = makeBuffer(10, [{ text: 'https://ex' }, { text: 'ample.com/', wrapped: true }])
    const range = rangeForStringSpan(buffer, 0, 0, 20)
    // A span ending on a row's last cell is expressed the addon's way — column
    // 0 of the next row — which xterm's containment reads as that last cell.
    expect(range).toEqual({ start: { x: 1, y: 1 }, end: { x: 0, y: 3 } })
    expect(range!.start.y).toBeLessThan(range!.end.y)
    expect(rangeContains(range!, 10, 2, 10)).toBe(true)
    expect(rangeContains(range!, 1, 3, 10)).toBe(false)
  })

  it('keeps the mapping aligned across a wide character', () => {
    // 'a' + wide '漢' (2 cells) + 'b/c.ts' → string index 2 ('b') is cell 3 (0-based)
    const buffer = makeBuffer(20, [{ text: 'a漢b/c.ts', wide: [1] }])
    expect(rangeForStringSpan(buffer, 0, 2, 8)).toEqual({
      start: { x: 4, y: 1 },
      end: { x: 9, y: 1 }
    })
  })

  it('corrects for a wide character pushed to the next row (the addon early-wrap case)', () => {
    // Row 0 has 9 chars then an empty last cell because '漢' did not fit; row 1 starts with it.
    const buffer = makeBuffer(10, [
      { text: 'abcdefghi' },
      { text: '漢/x.ts', wrapped: true, wide: [0] }
    ])
    // Windowed text is 'abcdefghi漢/x.ts'; the span of '漢/x.ts' is [9, 15).
    expect(rangeForStringSpan(buffer, 0, 9, 15)).toEqual({
      start: { x: 1, y: 2 },
      end: { x: 7, y: 2 }
    })
  })

  it('returns null when the span runs past the buffer', () => {
    const buffer = makeBuffer(5, [{ text: 'abcde' }])
    expect(rangeForStringSpan(buffer, 0, 0, 12)).toBeNull()
  })
})

describe('rangeContains', () => {
  const range = { start: { x: 5, y: 3 }, end: { x: 2, y: 4 } }

  it('is true on both ends inclusive', () => {
    expect(rangeContains(range, 5, 3, 80)).toBe(true)
    expect(rangeContains(range, 2, 4, 80)).toBe(true)
    expect(rangeContains(range, 80, 3, 80)).toBe(true)
  })

  it('is false one cell outside either end', () => {
    expect(rangeContains(range, 4, 3, 80)).toBe(false)
    expect(rangeContains(range, 3, 4, 80)).toBe(false)
  })
})

describe('bufferPositionForMouseEvent (LINK-28)', () => {
  function terminal(
    viewportY: number,
    rect = { left: 0, top: 0, width: 800, height: 400 }
  ): TerminalGeometry {
    return {
      element: {
        querySelector: (selector: string) =>
          selector === '.xterm-screen'
            ? {
                getBoundingClientRect: () =>
                  ({ ...rect, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
              }
            : null
      },
      cols: 80,
      rows: 20,
      buffer: { active: { viewportY } }
    }
  }

  it('maps a click to the 1-based cell, offset by the viewport scroll', () => {
    expect(bufferPositionForMouseEvent(terminal(100), { clientX: 405, clientY: 210 })).toEqual({
      x: 41,
      y: 111
    })
  })

  it('maps the top-left pixel to cell (1, viewportY + 1)', () => {
    expect(bufferPositionForMouseEvent(terminal(0), { clientX: 0, clientY: 0 })).toEqual({
      x: 1,
      y: 1
    })
  })

  it('returns null outside the screen box', () => {
    expect(bufferPositionForMouseEvent(terminal(0), { clientX: 800, clientY: 10 })).toBeNull()
    expect(bufferPositionForMouseEvent(terminal(0), { clientX: -1, clientY: 10 })).toBeNull()
  })

  it('returns null when the screen element is missing', () => {
    const noScreen = { ...terminal(0), element: { querySelector: () => null } }
    expect(bufferPositionForMouseEvent(noScreen, { clientX: 1, clientY: 1 })).toBeNull()
  })
})

describe('activeBufferOf (LINK-32)', () => {
  it('reads whichever buffer is active at the time of each call, not at creation', () => {
    const normal = makeBuffer(10, [{ text: 'normal' }])
    const alternate = makeBuffer(10, [{ text: 'alt' }])
    const terminal = { buffer: { active: normal } }
    const buffer = activeBufferOf(terminal)

    expect(buffer.getLine(0)?.translateToString(true)).toBe('normal')

    terminal.buffer.active = alternate
    expect(buffer.getLine(0)?.translateToString(true)).toBe('alt')

    terminal.buffer.active = normal
    expect(buffer.getLine(0)?.translateToString(true)).toBe('normal')
  })

  it('takes the null cell from the active buffer too', () => {
    const marker = makeCell()
    marker.chars = 'from-alternate'
    const terminal = {
      buffer: { active: { getLine: () => undefined, getNullCell: makeCell } as BufferLike }
    }
    const buffer = activeBufferOf(terminal)
    terminal.buffer.active = { getLine: () => undefined, getNullCell: () => marker }

    expect(buffer.getNullCell()).toBe(marker)
  })
})
