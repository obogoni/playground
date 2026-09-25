import { describe, expect, it } from 'vitest'
import { TerminalModeTracker } from './terminal-mode-tracker'

/** Feeds one string into a fresh tracker and returns its prefix. */
function prefixOf(...chunks: string[]): string {
  const tracker = new TerminalModeTracker()
  for (const chunk of chunks) tracker.feed(chunk)
  return tracker.prefix()
}

describe('TerminalModeTracker', () => {
  it('emits no prefix for a fresh tracker (TSP-07)', () => {
    expect(new TerminalModeTracker().prefix()).toBe('')
  })

  it('emits no prefix for content without DEC private modes (TSP-07)', () => {
    expect(prefixOf('plain output\r\nmore output\n')).toBe('')
  })

  it('folds every alternate-screen set into 1049 (TSP-08)', () => {
    expect(prefixOf('\x1b[?1049h')).toBe('\x1b[?1049h')
    expect(prefixOf('\x1b[?47h')).toBe('\x1b[?1049h')
    expect(prefixOf('\x1b[?1047h')).toBe('\x1b[?1049h')
  })

  it('drops the alternate screen again on any of its resets (TSP-08)', () => {
    expect(prefixOf('\x1b[?1049h\x1b[?1049l')).toBe('')
    expect(prefixOf('\x1b[?1049h\x1b[?47l')).toBe('')
    expect(prefixOf('\x1b[?47h\x1b[?1047l')).toBe('')
  })

  it('keeps only the last mouse-tracking protocol set (TSP-08)', () => {
    expect(prefixOf('\x1b[?1000h\x1b[?1003h')).toBe('\x1b[?1003h')
    expect(prefixOf('\x1b[?1003h\x1b[?1000h')).toBe('\x1b[?1000h')
    expect(prefixOf('\x1b[?9h')).toBe('\x1b[?9h')
    expect(prefixOf('\x1b[?1002h')).toBe('\x1b[?1002h')
  })

  it('clears mouse tracking on a reset of any tracking mode (TSP-08)', () => {
    expect(prefixOf('\x1b[?1003h\x1b[?1002l')).toBe('')
    expect(prefixOf('\x1b[?1000h\x1b[?9l')).toBe('')
  })

  it('keeps only the last mouse-encoding set (TSP-08)', () => {
    expect(prefixOf('\x1b[?1006h\x1b[?1016h')).toBe('\x1b[?1016h')
    expect(prefixOf('\x1b[?1016h\x1b[?1006h')).toBe('\x1b[?1006h')
    expect(prefixOf('\x1b[?1005h')).toBe('\x1b[?1005h')
    expect(prefixOf('\x1b[?1015h')).toBe('\x1b[?1015h')
  })

  it('clears mouse encoding on a reset of any encoding mode (TSP-08)', () => {
    expect(prefixOf('\x1b[?1006h\x1b[?1005l')).toBe('')
    expect(prefixOf('\x1b[?1016h\x1b[?1015l')).toBe('')
  })

  it('tracks focus events and bracketed paste (TSP-08)', () => {
    expect(prefixOf('\x1b[?1004h')).toBe('\x1b[?1004h')
    expect(prefixOf('\x1b[?2004h')).toBe('\x1b[?2004h')
    expect(prefixOf('\x1b[?1004h\x1b[?1004l')).toBe('')
    expect(prefixOf('\x1b[?2004h\x1b[?2004l')).toBe('')
  })

  it('treats the cursor as visible by default and emits 25l when hidden (TSP-08)', () => {
    expect(prefixOf('\x1b[?25l')).toBe('\x1b[?25l')
    expect(prefixOf('\x1b[?25h')).toBe('')
    expect(prefixOf('\x1b[?25l\x1b[?25h')).toBe('')
  })

  it('applies every param of a multi-param sequence (TSP-06)', () => {
    expect(prefixOf('\x1b[?1049;1003;1006h')).toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h')
    expect(prefixOf('\x1b[?1049;1003;1006h\x1b[?1003;1006l')).toBe('\x1b[?1049h')
  })

  it('emits the prefix in alt, tracking, encoding, focus, paste, cursor order (TSP-07)', () => {
    const all = '\x1b[?25l\x1b[?2004h\x1b[?1004h\x1b[?1006h\x1b[?1003h\x1b[?1049h'
    expect(prefixOf(all)).toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?1004h\x1b[?2004h\x1b[?25l')
  })

  it('applies a sequence split across two feeds at any byte offset, once (TSP-09)', () => {
    const seq = '\x1b[?1049;1003h'
    for (let cut = 0; cut <= seq.length; cut++) {
      expect(prefixOf(seq.slice(0, cut), seq.slice(cut))).toBe('\x1b[?1049h\x1b[?1003h')
    }
  })

  it('carries a split sequence across feeds with surrounding output (TSP-09)', () => {
    expect(prefixOf('line one\n\x1b[?10', '03h\nline two')).toBe('\x1b[?1003h')
    expect(prefixOf('\x1b[?1049h\x1b', '[?2004h')).toBe('\x1b[?1049h\x1b[?2004h')
  })

  it('ignores CSI sequences that are not DEC private mode changes', () => {
    expect(prefixOf('\x1b[1049h')).toBe('')
    expect(prefixOf('\x1b[31m\x1b[2J\x1b[0K')).toBe('')
    expect(prefixOf('\x1b[?1003$p')).toBe('')
  })

  it('ignores DEC private params it does not track', () => {
    expect(prefixOf('\x1b[?7h\x1b[?12h\x1b[?1h')).toBe('')
    expect(prefixOf('\x1b[?1;1003h')).toBe('\x1b[?1003h')
  })
})
