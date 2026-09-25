import { describe, expect, it } from 'vitest'
import {
  COPIED_FEEDBACK_MS,
  COPY_GRACE_MS,
  classifyTerminalKey,
  classifyTerminalMouse,
  DEFAULT_UNDO_BYTE,
  selectionForRightClick,
  undoByteFor,
  type CopyGrace,
  type TerminalKeyEvent
} from './terminal-keys'
import { SEEDED_AGENTS } from '../../../shared/agents'

function key(overrides: Partial<TerminalKeyEvent> = {}): TerminalKeyEvent {
  return {
    type: 'keydown',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    code: '',
    key: '',
    ...overrides
  }
}

/** No copy has happened yet — the grace window is closed. */
const cold: CopyGrace = { now: 10_000, lastCopyAt: null }

function grace(msSinceCopy: number): CopyGrace {
  return { now: 10_000, lastCopyAt: 10_000 - msSinceCopy }
}

describe('classifyTerminalKey', () => {
  it('copies on Ctrl+C with a selection and passes without one (INPUT-06, INPUT-07)', () => {
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), true, cold)).toBe(
      'copy-selection'
    )
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, cold)).toBe('pass')
  })

  it('always copies on Ctrl+Shift+C (existing behavior, no regression)', () => {
    expect(
      classifyTerminalKey(key({ ctrlKey: true, shiftKey: true, code: 'KeyC' }), false, cold)
    ).toBe('copy-selection')
  })

  it('pastes on Ctrl+V (INPUT-08)', () => {
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyV' }), false, cold)).toBe('paste')
  })

  it('reports Shift+Enter and Ctrl+Enter as newline (INPUT-04)', () => {
    expect(classifyTerminalKey(key({ shiftKey: true, key: 'Enter' }), false, cold)).toBe('newline')
    expect(classifyTerminalKey(key({ ctrlKey: true, key: 'Enter' }), false, cold)).toBe('newline')
  })

  it('passes every other chord through untouched', () => {
    expect(classifyTerminalKey(key({ code: 'KeyA', key: 'a' }), false, cold)).toBe('pass')
    expect(classifyTerminalKey(key({ key: 'Enter' }), false, cold)).toBe('pass')
    expect(classifyTerminalKey(key({ code: 'ArrowUp' }), false, cold)).toBe('pass')
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyX' }), false, cold)).toBe('pass')
    expect(
      classifyTerminalKey(key({ ctrlKey: true, shiftKey: true, code: 'KeyV' }), false, cold)
    ).toBe('pass')
  })

  it('never swallows Ctrl+X — it is opencode’s leader key (TCU-24)', () => {
    // Every opencode shortcut is prefixed by ctrl+x. The app intercepting it
    // for a "cut" that a terminal cannot do anyway would make the agent
    // unusable, and the failure would look like opencode being broken.
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyX' }), true, cold)).toBe('pass')
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyX' }), false, cold)).toBe('pass')
    expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyX' }), true, grace(100))).toBe('pass')
  })

  it('never swallows Escape — it is opencode’s interrupt (TCU-24)', () => {
    expect(classifyTerminalKey(key({ code: 'Escape', key: 'Escape' }), true, cold)).toBe('pass')
    expect(classifyTerminalKey(key({ code: 'Escape', key: 'Escape' }), false, grace(100))).toBe(
      'pass'
    )
  })

  it('ignores non-keydown events', () => {
    expect(
      classifyTerminalKey(key({ type: 'keyup', ctrlKey: true, code: 'KeyC' }), true, cold)
    ).toBe('pass')
  })

  describe('Ctrl+Z undo (TCU-01..03)', () => {
    it('reports Ctrl+Z as undo so the pane can send 0x1F instead of 0x1A', () => {
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyZ' }), false, cold)).toBe('undo')
    })

    it('undoes regardless of the selection state', () => {
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyZ' }), true, cold)).toBe('undo')
    })

    it('passes Ctrl+Shift+Z through — Claude Code has no redo (TCU-03)', () => {
      expect(
        classifyTerminalKey(key({ ctrlKey: true, shiftKey: true, code: 'KeyZ' }), false, cold)
      ).toBe('pass')
    })

    it('passes Ctrl+Alt+Z through so AltGr chords are untouched', () => {
      expect(
        classifyTerminalKey(key({ ctrlKey: true, altKey: true, code: 'KeyZ' }), false, cold)
      ).toBe('pass')
    })

    it('leaves a bare Z alone', () => {
      expect(classifyTerminalKey(key({ code: 'KeyZ', key: 'z' }), false, cold)).toBe('pass')
    })
  })

  describe('Alt+V pass-through (TSP-17)', () => {
    it('passes Alt+V through so xterm sends ESC v to the agent untouched', () => {
      // Claude Code on Windows reads the clipboard itself on Alt+V. The app's own
      // Ctrl+V paste never takes that chord away from anyone who wants it.
      expect(classifyTerminalKey(key({ altKey: true, code: 'KeyV', key: 'v' }), false, cold)).toBe(
        'pass'
      )
    })

    it('passes Ctrl+Alt+V through — AltGr on ABNT2 reports both modifiers', () => {
      expect(
        classifyTerminalKey(key({ ctrlKey: true, altKey: true, code: 'KeyV' }), false, cold)
      ).toBe('pass')
    })
  })

  describe('Ctrl+C grace window (TCU-04..08)', () => {
    it('discards a selection-less Ctrl+C inside the window instead of sending SIGINT', () => {
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, grace(0))).toBe(
        'swallow'
      )
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, grace(300))).toBe(
        'swallow'
      )
      expect(
        classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, grace(COPY_GRACE_MS - 1))
      ).toBe('swallow')
    })

    it('sends SIGINT once the window has elapsed (TCU-08)', () => {
      expect(
        classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, grace(COPY_GRACE_MS))
      ).toBe('pass')
      expect(
        classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, grace(COPY_GRACE_MS + 1))
      ).toBe('pass')
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, grace(5_000))).toBe(
        'pass'
      )
    })

    it('still copies inside the window when a selection exists', () => {
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), true, grace(100))).toBe(
        'copy-selection'
      )
    })

    it('never sends SIGINT while presses stay under the window apart (TCU-07)', () => {
      // A hammering user pressing every 300 ms: each discarded press restarts
      // the window, so no press in the burst ever reaches the PTY. With a
      // window anchored to the copy alone, the fourth press (900 ms) would.
      let lastCopyAt: number | null = 0
      const actions = [300, 600, 900, 1_200].map((now) => {
        const action = classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, {
          now,
          lastCopyAt
        })
        if (action === 'swallow' || action === 'copy-selection') lastCopyAt = now
        return action
      })
      expect(actions).toEqual(['swallow', 'swallow', 'swallow', 'swallow'])
    })

    it('leaves the window closed until the first copy', () => {
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyC' }), false, cold)).toBe('pass')
    })

    it('does not gate any chord other than a selection-less Ctrl+C (TCU-20)', () => {
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyV' }), false, grace(100))).toBe(
        'paste'
      )
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyZ' }), false, grace(100))).toBe(
        'undo'
      )
      expect(classifyTerminalKey(key({ ctrlKey: true, code: 'KeyX' }), false, grace(100))).toBe(
        'pass'
      )
    })
  })
})

describe('classifyTerminalMouse (TCU-10..14, TCU-27)', () => {
  const rightClick = { button: 2 }
  const OWNED = true
  const FREE = false

  it('copies on right-click when there is a selection', () => {
    expect(classifyTerminalMouse(rightClick, true, FREE)).toBe('copy-selection')
  })

  it('copies even while the agent owns the mouse — Shift+drag makes a real one', () => {
    expect(classifyTerminalMouse(rightClick, true, OWNED)).toBe('copy-selection')
  })

  it('pastes on right-click with no selection in a plain shell', () => {
    expect(classifyTerminalMouse(rightClick, false, FREE)).toBe('paste')
  })

  it('does NOT paste when the agent owns the mouse and there is no selection', () => {
    // The reported bug: a TUI draws its own highlight, xterm reports no
    // selection, and the right-click meant to copy injected the clipboard
    // into the agent's prompt instead. Leave the click to the agent.
    expect(classifyTerminalMouse(rightClick, false, OWNED)).toBe('none')
  })

  it('ignores every other button', () => {
    expect(classifyTerminalMouse({ button: 0 }, true, FREE)).toBe('none')
    expect(classifyTerminalMouse({ button: 1 }, false, OWNED)).toBe('none')
    expect(classifyTerminalMouse({ button: 3 }, true, FREE)).toBe('none')
  })
})

describe('undoByteFor (TCU-01, TCU-02)', () => {
  it('gives Claude US (0x1F), never SUB — the byte its undo is bound to', () => {
    const byte = undoByteFor(SEEDED_AGENTS, 'Claude')
    expect(byte).toBe('\x1f')
    expect(byte.charCodeAt(0)).toBe(0x1f)
    expect(byte).not.toBe('\x1a')
  })

  it('gives opencode the plain SUB (0x1A) — its input_undo default is ctrl+z', () => {
    const byte = undoByteFor(SEEDED_AGENTS, 'opencode')
    expect(byte).toBe('\x1a')
    expect(byte.charCodeAt(0)).toBe(0x1a)
  })

  it('gives Codex and Copilot the plain SUB — neither documents a Ctrl+Z undo', () => {
    expect(undoByteFor(SEEDED_AGENTS, 'Codex')).toBe('\x1a')
    expect(undoByteFor(SEEDED_AGENTS, 'Copilot')).toBe('\x1a')
  })

  it('falls back to the terminal default for ad-hoc and unknown agents', () => {
    expect(undoByteFor(SEEDED_AGENTS, 'Ad-hoc')).toBe(DEFAULT_UNDO_BYTE)
    expect(undoByteFor(SEEDED_AGENTS, 'nope')).toBe(DEFAULT_UNDO_BYTE)
    expect(undoByteFor([], 'Claude')).toBe(DEFAULT_UNDO_BYTE)
    expect(DEFAULT_UNDO_BYTE).toBe('\x1a')
  })

  it('honours a registry override rather than hard-coding the seed list', () => {
    const custom = [{ name: 'Mine', command: 'mine', args: [], undoByte: '\x15' }]
    expect(undoByteFor(custom, 'Mine')).toBe('\x15')
  })

  it('every seeded agent declares its byte explicitly', () => {
    expect(SEEDED_AGENTS.map((a) => a.name).sort()).toEqual([
      'Claude',
      'Codex',
      'Copilot',
      'opencode'
    ])
    for (const agent of SEEDED_AGENTS) expect(agent.undoByte).toBeDefined()
  })
})

describe('undoByteFor with a registry that predates undoByte (TCU-02)', () => {
  // Exactly what config.json holds for a user who ran an older build: the
  // persisted array replaces the seed list, so no entry has undoByte.
  const persisted = [
    { name: 'Claude', command: 'claude', args: [], color: '--accent' },
    { name: 'Copilot', command: 'gh', args: ['copilot'], color: '--blue' },
    { name: 'Codex', command: 'codex', args: ['--full-auto'], color: '--green' },
    { name: 'Opencode', command: 'opencode', args: [], color: '--accent' }
  ]

  it('still gives Claude US (0x1F), resolved from its command', () => {
    expect(undoByteFor(persisted, 'Claude')).toBe('\x1f')
  })

  it('still gives the others the plain SUB', () => {
    expect(undoByteFor(persisted, 'Opencode')).toBe('\x1a')
    expect(undoByteFor(persisted, 'Codex')).toBe('\x1a')
    expect(undoByteFor(persisted, 'Copilot')).toBe('\x1a')
  })

  it('follows the command through a rename, not the label', () => {
    expect(undoByteFor([{ name: 'meu claude', command: 'claude', args: [] }], 'meu claude')).toBe(
      '\x1f'
    )
  })

  it('accepts a full path and an .exe suffix as the same command', () => {
    const byPath = [{ name: 'C', command: String.raw`C:\Users\me\.local\bin\claude.exe`, args: [] }]
    expect(undoByteFor(byPath, 'C')).toBe('\x1f')
  })

  it('lets an explicit undoByte override the command table', () => {
    expect(
      undoByteFor([{ name: 'Claude', command: 'claude', args: [], undoByte: '\x1a' }], 'Claude')
    ).toBe('\x1a')
  })
})

describe('selectionForRightClick (TCU-25)', () => {
  it('uses the live selection when one is still held', () => {
    expect(selectionForRightClick('live text', 'older text')).toBe('live text')
  })

  it('falls back to the remembered one — mouseup wipes a Shift+drag instantly', () => {
    // Measured 2026-09-09: with mouseTracking "any", releasing the button
    // clears the selection before the right-click lands, so the live value is
    // always empty and only the remembered one can be copied.
    expect(selectionForRightClick('', 'what the user selected')).toBe('what the user selected')
  })

  it('treats a whitespace-only live selection as gone', () => {
    expect(selectionForRightClick('   \n  ', 'real text')).toBe('real text')
  })

  it('reports nothing when both are empty, so no copy is attempted', () => {
    expect(selectionForRightClick('', '')).toBe('')
    expect(selectionForRightClick('  ', '')).toBe('')
  })
})

describe('COPIED_FEEDBACK_MS (TCU-28)', () => {
  it('keeps the copy confirmation up long enough to be read, briefly', () => {
    expect(COPIED_FEEDBACK_MS).toBe(1_200)
    // Long enough to register, short enough not to sit over the agent's output.
    expect(COPIED_FEEDBACK_MS).toBeGreaterThanOrEqual(800)
    expect(COPIED_FEEDBACK_MS).toBeLessThanOrEqual(2_500)
  })
})
