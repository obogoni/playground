/** Key-chord classification for the embedded terminal (INPUT-04..08, TCU-01..09). */

import type { AgentDef } from '../../../shared/agents'

export type TerminalKeyAction = 'copy-selection' | 'newline' | 'paste' | 'undo' | 'swallow' | 'pass'

export interface TerminalKeyEvent {
  type: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  code: string
  key: string
}

/**
 * How long after a copy a selection-less Ctrl+C is discarded instead of
 * interrupting the PTY (TCU-06). Long enough for a double/triple tap at human
 * hammer speed (~150-300 ms apart), short enough that a deliberate "stop this
 * agent" is one pause away.
 */
export const COPY_GRACE_MS = 800

/**
 * How long the copy confirmation stays on screen (TCU-28). Declared here so
 * the value an AC constrains lives in the unit-tested seam rather than as a
 * literal inside the component the repo convention leaves untested.
 */
export const COPIED_FEEDBACK_MS = 1_200

/**
 * The byte Ctrl+Z puts on the PTY when the agent has no opinion: SUB (0x1A),
 * exactly what an untouched terminal sends. The app only deviates where an
 * agent is known to need something else (TCU-01).
 */
export const DEFAULT_UNDO_BYTE = '\x1a'

/**
 * The byte an `undo` action must put on this session's PTY. TUIs disagree —
 * Claude Code binds undo to Ctrl+_ (US, 0x1F) and treats Ctrl+Z as suspend,
 * while opencode's `input_undo` default is literally ctrl+z (UAT 2026-09-09:
 * translating for everyone fixed Claude and broke opencode). The per-agent
 * byte is declared in the registry; this resolves it.
 *
 * Resolution lives here, not in the pane, so the choice sits in the
 * unit-tested seam: a literal inside an untested component cannot assert that
 * Claude gets 0x1F and not 0x1A, which is the whole point (TCU-02).
 */
export function undoByteFor(agents: AgentDef[], agentName: string): string {
  const def = agents.find((a) => a.name === agentName)
  if (def?.undoByte) return def.undoByte
  // The registry is PERSISTED in config.json and the whole array replaces the
  // seed list on load, so a user who ran an older build has agent entries with
  // no undoByte at all — seeding the field alone fixed nobody (UAT 2026-09-09).
  // Fall back to the agent's command, which is its stable identity: it survives
  // a rename, and a persisted entry always has one.
  return (def && UNDO_BYTE_BY_COMMAND[commandKey(def.command)]) || DEFAULT_UNDO_BYTE
}

/**
 * Undo bytes keyed by the agent's command, for registry entries that predate
 * `undoByte`. Only commands with a documented, non-default undo appear here:
 * Claude Code binds undo to Ctrl+_ . opencode wants the plain SUB (its
 * `input_undo` default is ctrl+z), Codex undoes with Esc Esc and Copilot
 * documents no Ctrl+Z undo, so all three take DEFAULT_UNDO_BYTE and are
 * deliberately absent.
 */
const UNDO_BYTE_BY_COMMAND: Record<string, string> = { claude: '\x1f' }

/** Bare command name, lowercased and stripped of any path and `.exe`, so
 * `C:\...\claude.exe` and `claude` are the same agent. */
function commandKey(command: string): string {
  const leaf = command.split(/[\\/]/).pop() ?? command
  return leaf.toLowerCase().replace(/\.(exe|cmd|bat)$/, '')
}

/**
 * Grace-window state, passed in so the classifier stays pure and testable
 * without fake timers (TCU assumption). `lastCopyAt` is the timestamp of the
 * last Ctrl+C the pane handled as a copy *or* discarded — every handled press
 * restarts the window (TCU-07), otherwise hammering at 300 ms intervals walks
 * past a fixed window and still fires SIGINT.
 */
export interface CopyGrace {
  now: number
  lastCopyAt: number | null
}

/**
 * Decides what the terminal pane must do with a raw keydown. `hasSelection`
 * comes from `term.getSelection()` — the app knows the selection, the
 * classifier just needs it to separate copy from SIGINT (INPUT-06, INPUT-07).
 * Shift+Enter (Claude Code) and Ctrl+Enter (opencode) both mean "insert a
 * newline"; the legacy encoding collapses them into `\r`, so the pane sends
 * a line feed instead (INPUT-04).
 */
export function classifyTerminalKey(
  event: TerminalKeyEvent,
  hasSelection: boolean,
  grace: CopyGrace
): TerminalKeyAction {
  if (event.type !== 'keydown') return 'pass'
  const ctrl = event.ctrlKey
  const shift = event.shiftKey
  if (ctrl && event.code === 'KeyC') {
    // Ctrl+Shift+C always copies (existing behavior); Ctrl+C copies only
    // when there is a selection. Without one it is SIGINT — unless a copy
    // just happened, in which case it is the second tap of a reflexive
    // Ctrl+C-Ctrl+C and killing the agent is never what was meant (TCU-06).
    if (shift || hasSelection) return 'copy-selection'
    if (grace.lastCopyAt !== null && grace.now - grace.lastCopyAt < COPY_GRACE_MS) return 'swallow'
    return 'pass'
  }
  // The chord always means "undo"; which byte carries it is the agent's call
  // (see undoByteFor) — Claude Code wants US, opencode wants the plain SUB
  // (TCU-01). Alt is excluded so AltGr chords on ABNT2 keep passing through.
  if (ctrl && !shift && !event.altKey && event.code === 'KeyZ') return 'undo'
  // Alt is excluded for the same reason as Ctrl+Z: AltGr on an ABNT2 keyboard
  // reports ctrl+alt, and Alt+V is how Claude Code on Windows asks to read the
  // clipboard itself, so neither chord may be swallowed by the app's paste
  // (TSP-17).
  if (ctrl && !shift && !event.altKey && event.code === 'KeyV') return 'paste'
  if (event.key === 'Enter' && (shift || ctrl)) return 'newline'
  return 'pass'
}

export type TerminalMouseAction = 'copy-selection' | 'paste' | 'none'

export interface TerminalMouseEvent {
  button: number
}

/**
 * Which text a right-click should act on: the live `term.getSelection()`, or
 * the last non-empty one xterm reported if the live value is already gone.
 *
 * With mouse reporting on, a Shift+drag does produce a real xterm selection —
 * and it is wiped the moment the button is released (UAT 2026-09-09: "logo ao
 * soltar o esquerdo a seleção já é desfeita"). By the time the right-click
 * arrives there is nothing live left to copy, so remembering is what makes
 * Shift+drag usable at all.
 *
 * Not applied to Ctrl+C: right-click is an unambiguous copy gesture, while
 * Ctrl+C also means interrupt and must never copy stale text instead of
 * stopping an agent (TCU-25).
 */
export function selectionForRightClick(live: string, remembered: string): string {
  return live.trim() ? live : remembered
}

/**
 * Decides what a right-click on the terminal means (TCU-10..14). One click,
 * no menu: with a selection it copies, without one it pastes - the Windows
 * Terminal behavior. The pane clears the selection after the copy, which is
 * what lets the same button reach the paste branch on the next click.
 *
 * `agentOwnsMouse` is `term.modes.mouseTrackingMode !== 'none'`: a full-screen
 * TUI has enabled mouse reporting, so xterm forwards drags to it and the
 * highlight on screen belongs to the agent, not to xterm - unreadable from
 * here at all. A right-click there is an attempted copy far more often than a
 * paste, and pasting on it injected text into the agent's prompt every time
 * the user tried to copy (UAT 2026-09-09). Return 'none' so the click reaches
 * the agent, whose mouse reporting asked for it. Ctrl+V still pastes, and
 * Shift+drag still produces a real xterm selection to copy (TCU-27).
 */
export function classifyTerminalMouse(
  event: TerminalMouseEvent,
  hasSelection: boolean,
  agentOwnsMouse: boolean
): TerminalMouseAction {
  if (event.button !== 2) return 'none'
  if (hasSelection) return 'copy-selection'
  return agentOwnsMouse ? 'none' : 'paste'
}
