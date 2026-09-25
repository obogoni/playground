/**
 * Buffer geometry for terminal links (spec LINK-03, LINK-28): join soft-wrapped
 * rows into one string, map string indexes back to cells, and find the cell
 * under the pointer. Windowing and index mapping are ported from
 * @xterm/addon-web-links 0.12.0 (MIT, © The xterm.js authors). Everything here
 * is typed against the subset of xterm it reads, so tests pass fakes.
 */
import type { IBufferRange } from '@xterm/xterm'

export interface CellLike {
  getChars(): string
  getWidth(): number
}

export interface BufferLineLike {
  readonly isWrapped: boolean
  readonly length: number
  translateToString(trimRight?: boolean): string
  getCell(x: number, cell?: CellLike): CellLike | undefined
}

export interface BufferLike {
  getLine(y0: number): BufferLineLike | undefined
  getNullCell(): CellLike
}

export interface BufferHost {
  buffer: { readonly active: BufferLike }
}

/**
 * A `BufferLike` that follows the terminal's active buffer on every call.
 * `term.buffer.active` is a getter: captured once at pane creation it stays
 * the normal buffer, and a TUI in the alternate screen (Claude Code) leaves
 * hover and Ctrl+click reading rows the user is not looking at (LINK-32).
 */
export function activeBufferOf(terminal: BufferHost): BufferLike {
  return {
    getLine: (y0) => terminal.buffer.active.getLine(y0),
    getNullCell: () => terminal.buffer.active.getNullCell()
  }
}

export interface WindowedLine {
  text: string
  /** 0-based index of the first joined row. */
  topRow: number
  /** The joined rows' text — differs when any of them was repainted (LINK-25). */
  fingerprint: string
}

const MAX_WINDOW_CHARS = 2048

/**
 * The row at `y0` plus the wrapped rows around it. Expansion stops at a row
 * containing a space or past 2048 chars, as the addon does — a link never
 * spans whitespace, so the window stays bounded on space-padded TUI rows.
 */
export function windowedLine(buffer: BufferLike, y0: number): WindowedLine | null {
  const line = buffer.getLine(y0)
  if (!line) return null
  const current = line.translateToString(true)
  const above: string[] = []
  let topRow = y0
  if (line.isWrapped && current[0] !== ' ') {
    let length = 0
    let row: BufferLineLike | undefined
    while ((row = buffer.getLine(topRow - 1)) && length < MAX_WINDOW_CHARS) {
      topRow -= 1
      const content = row.translateToString(true)
      length += content.length
      above.push(content)
      if (!row.isWrapped || content.includes(' ')) break
    }
    above.reverse()
  }
  const below: string[] = []
  let bottomRow = y0
  let length = 0
  let row: BufferLineLike | undefined
  while ((row = buffer.getLine(++bottomRow)) && row.isWrapped && length < MAX_WINDOW_CHARS) {
    const content = row.translateToString(true)
    length += content.length
    below.push(content)
    if (content.includes(' ')) break
  }
  const text = [...above, current, ...below].join('')
  return { text, topRow, fingerprint: text }
}

/**
 * Maps a string index of a windowed line back to a 0-based [row, column],
 * or [-1, -1] past the buffer. Wide chars take two cells but one string index;
 * a wide char pushed early to the next row leaves an empty last cell that must
 * not consume an index.
 */
function mapStringIndex(
  buffer: BufferLike,
  rowIndex: number,
  startColumn: number,
  stringIndex: number
): [number, number] {
  const cell = buffer.getNullCell()
  let start = startColumn
  let row = rowIndex
  let remaining = stringIndex
  while (remaining) {
    const line = buffer.getLine(row)
    if (!line) return [-1, -1]
    for (let i = start; i < line.length; ++i) {
      line.getCell(i, cell)
      const chars = cell.getChars()
      const width = cell.getWidth()
      if (width) {
        remaining -= chars.length || 1
        if (i === line.length - 1 && chars === '') {
          const next = buffer.getLine(row + 1)
          if (next && next.isWrapped) {
            next.getCell(0, cell)
            if (cell.getWidth() === 2) remaining += 1
          }
        }
      }
      if (remaining < 0) return [row, i]
    }
    row++
    start = 0
  }
  return [row, start]
}

/** 1-based, end-inclusive range for `[start, end)` of a windowed line's text; null past the buffer. */
export function rangeForStringSpan(
  buffer: BufferLike,
  topRow: number,
  start: number,
  end: number
): IBufferRange | null {
  const [startY, startX] = mapStringIndex(buffer, topRow, 0, start)
  if (startY === -1) return null
  const [endY, endX] = mapStringIndex(buffer, startY, startX, end - start)
  if (endY === -1) return null
  return { start: { x: startX + 1, y: startY + 1 }, end: { x: endX, y: endY + 1 } }
}

/** Whether the 1-based cell (x, y) lies inside the 1-based, end-inclusive range. */
export function rangeContains(range: IBufferRange, x: number, y: number, cols: number): boolean {
  const lower = range.start.y * cols + range.start.x
  const upper = range.end.y * cols + range.end.x
  const current = y * cols + x
  return lower <= current && current <= upper
}

export interface TerminalGeometry {
  element:
    | { querySelector(selector: string): { getBoundingClientRect(): DOMRect } | null }
    | undefined
  cols: number
  rows: number
  buffer: { active: { viewportY: number } }
}

/**
 * The 1-based buffer cell under a mouse event, from the screen element's box
 * and the terminal's grid — public API only. Null outside the screen.
 */
export function bufferPositionForMouseEvent(
  terminal: TerminalGeometry,
  event: { clientX: number; clientY: number }
): { x: number; y: number } | null {
  const screen = terminal.element?.querySelector('.xterm-screen')
  if (!screen || terminal.cols <= 0 || terminal.rows <= 0) return null
  const rect = screen.getBoundingClientRect()
  const relativeX = event.clientX - rect.left
  const relativeY = event.clientY - rect.top
  if (relativeX < 0 || relativeY < 0 || relativeX >= rect.width || relativeY >= rect.height) {
    return null
  }
  return {
    x: Math.floor(relativeX / (rect.width / terminal.cols)) + 1,
    y: Math.floor(relativeY / (rect.height / terminal.rows)) + terminal.buffer.active.viewportY + 1
  }
}
