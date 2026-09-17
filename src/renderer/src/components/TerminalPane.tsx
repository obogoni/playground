import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import { PASTE_GAP_MS, planPaste } from '../../../shared/paste'
import { api } from '../lib/api'
import {
  classifyTerminalKey,
  classifyTerminalMouse,
  COPIED_FEEDBACK_MS,
  selectionForRightClick
} from '../lib/terminal-keys'
import { formatModeLog, isProbeEnabled, PROBE_FLAG_KEY } from '../lib/terminal-modes'
import '@xterm/xterm/css/xterm.css'
import './TerminalPane.css'

interface TerminalPaneProps {
  sessionId: string
  /** Byte Ctrl+Z sends on this session's PTY, resolved from the agent registry
   * by `undoByteFor` — TUIs disagree on it (TCU-01). */
  undoByte: string
}

/**
 * What the chip says when a paste could not be read: the clipboard read failed,
 * the PNG could not be written, or the file-list shell timed out. Nothing reaches
 * the PTY in any of those cases, so without the chip the gesture is silent and
 * indistinguishable from a broken one (TSP-16).
 */
const PASTE_FAILED_TEXT = 'Não foi possível colar'

/** Reads a CSS custom property off <html>, falling back when unset. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * Maps the active app token set to an xterm theme (handoff §Terminal theming):
 * background/foreground/cursor + the ANSI palette to --green/--amber/--red/
 * --blue/--accent/--text-muted. Re-read on theme toggle so the terminal
 * recolors live with the rest of the app.
 */
function readTheme(): ITheme {
  const bg = token('--bg', '#1a1815')
  const text = token('--text', '#efe9e0')
  const muted = token('--text-muted', '#a59c8e')
  const green = token('--green', '#5cbd86')
  const amber = token('--amber', '#dca35e')
  const red = token('--red', '#e08068')
  const blue = token('--blue', '#71a8e6')
  const accent = token('--accent', '#a78bfa')
  return {
    background: bg,
    foreground: text,
    cursor: accent,
    cursorAccent: bg,
    selectionBackground: token('--border-strong', '#48413a'),
    black: bg,
    red,
    green,
    yellow: amber,
    blue,
    magenta: accent,
    cyan: blue,
    white: text,
    brightBlack: muted,
    brightRed: red,
    brightGreen: green,
    brightYellow: amber,
    brightBlue: blue,
    brightMagenta: accent,
    brightCyan: blue,
    brightWhite: text
  }
}

/**
 * Embedded xterm bound to one session (PRD stories 2, 18; handoff §C-b). PTY
 * bytes arrive over session:data; keystrokes go back over session:input; the
 * container drives fit() + session:resize. The terminal is themed via
 * readTheme() — the full token→ANSI palette map, re-emitted on theme toggle
 * via a MutationObserver below (handoff §Terminal theming, AGCF-07).
 */
export function TerminalPane({ sessionId, undoByte }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Timestamp of the last Ctrl+C this pane handled as a copy or discarded.
    // Declared inside the effect so it dies with the pane and never leaks a
    // grace window across a session switch (TCU-09).
    const lastCopyAt = { current: null as number | null }

    // The last non-empty selection xterm reported. With mouse reporting on, a
    // Shift+drag selection is wiped the instant the button is released, so by
    // right-click time the live value is empty and this is the only record of
    // what the user picked (TCU-25).
    let rememberedSelection = ''

    // Transient confirmation for a right-click copy, and the same element for a
    // paste that failed. Without it either action is invisible — the selection is
    // already cleared by copy time, and a refused paste sends no byte at all — so
    // success and a broken gesture look identical (TCU-28, TSP-16).
    const chip = document.createElement('div')
    chip.className = 'terminal-copied'
    chip.textContent = 'Copiado'
    container.appendChild(chip)
    let chipTimer: ReturnType<typeof setTimeout> | undefined
    const flashChip = (text: string): void => {
      chip.textContent = text
      chip.classList.add('is-visible')
      clearTimeout(chipTimer)
      chipTimer = setTimeout(() => chip.classList.remove('is-visible'), COPIED_FEEDBACK_MS)
    }

    const term = new Terminal({
      cursorBlink: true,
      // Cascadia Mono first, always (INPUT-12): Claude Code's boxed TUI uses
      // corner glyphs (U+23BE/U+23BF) that JetBrains Mono lacks — the browser
      // fallback breaks the grid at any pane width (UAT 2026-08-31: broken
      // maximized, correct narrow; the only variable was the font).
      fontFamily: "'Cascadia Mono', Consolas, 'JetBrains Mono', monospace",
      fontSize: 13,
      theme: readTheme(),
      // Unicode width/grapheme handling needs the experimental unicode API
      // (UNIC-01..13): without this, term.unicode throws on access and the
      // terminal never opens (verifier probe, 2026-09-10).
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Unicode 15 widths + grapheme clustering (UNIC-01..13). xterm 6.0.0
    // measures cells with Unicode 6 tables by default, and even the Unicode 11
    // tables measure code points in isolation — an emoji-presentation sequence
    // like U+27A1 U+FE0F reserves 1 cell while the font paints a 2-cell emoji,
    // pulling the following text left and reflowing the line on selection.
    // The addon registers the v15/v15-graphemes providers and activates
    // '15-graphemes' itself, folding VS16/ZWJ/regional sequences into one
    // grapheme with the right width.
    term.loadAddon(new UnicodeGraphemesAddon())
    term.open(container)
    fit.fit()

    // Terminal-mode probe (TSP-01..04). The dead wheel after a Ctrl+C has three
    // candidate causes pointing at opposite fixes, so the pane logs what xterm
    // parses and the owner reads which one happens. Nothing is registered unless
    // the flag is set at mount, keeping the parser's hot path untouched on a
    // normal run (TSP-04); isProbeEnabled swallows a throwing storage read.
    const probing = isProbeEnabled(() => localStorage.getItem(PROBE_FLAG_KEY))
    const trackingNow = (): string => term.modes.mouseTrackingMode
    const bufferNow = (): string => term.buffer.active.type
    const logModeChange = (final: 'h' | 'l', params: (number | number[])[]): boolean => {
      const flat = params.flat()
      // The state is read in a microtask, not here: this handler runs BEFORE
      // xterm's own DECSET/DECRST (the newest handler goes first), so reading now
      // would report the state the sequence is about to change. The microtask
      // fires once the chunk being parsed has applied, which is what TSP-01
      // asks for, and queue order keeps the lines in sequence order.
      queueMicrotask(() => {
        console.debug(
          formatModeLog({
            sessionId,
            final,
            params: flat,
            tracking: trackingNow(),
            buffer: bufferNow()
          })
        )
      })
      // Always false. Returning true would consume the sequence and stop xterm
      // applying it, so the probe would itself break the terminal it measures.
      return false
    }
    const probeHandlers = probing
      ? [
          term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, (params) =>
            logModeChange('h', params)
          ),
          term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) =>
            logModeChange('l', params)
          )
        ]
      : []

    // Rich paste (TSP-12..24). Paths go out one per `term.paste`, PASTE_GAP_MS
    // apart: opencode attaches only when the whole paste is one path, and Claude
    // Code merges chunks that arrive within 50 ms. The chunks run on one promise
    // chain, so a second Ctrl+V starts only after the running sequence sent its
    // last path instead of interleaving with it (TSP-22, TSP-23).
    let pasteDisposed = false
    let gapTimer: ReturnType<typeof setTimeout> | undefined
    let pasteQueue: Promise<void> = Promise.resolve()
    const pasteGap = (): Promise<void> =>
      new Promise((resolve) => {
        gapTimer = setTimeout(resolve, PASTE_GAP_MS)
      })
    const enqueuePaste = (chunks: string[]): void => {
      if (chunks.length === 0) return
      // The tail is always a resolved promise: a rejection left in the chain
      // would skip every sequence queued after it for the pane's whole life.
      pasteQueue = pasteQueue
        .then(async () => {
          for (const chunk of chunks) {
            // Checked before every paste, which is also after every gap: the
            // pane may have unmounted or switched session mid-sequence, and the
            // rest of the paths must not reach a terminal that is gone (TSP-24).
            if (pasteDisposed) return
            // `term.paste` and not `api.send`: it brackets the paste when the
            // TUI asked for bracketed mode, which is what keeps a path from
            // being read as keystrokes.
            term.paste(chunk)
            // Held after the last chunk too, so a sequence queued behind this
            // one cannot glue its first path onto this one's last.
            await pasteGap()
          }
        })
        .catch(console.error)
    }
    // The clipboard is read in main: the renderer's `clipboard` is deprecated
    // from Electron 40 and the Explorer file list needs a child process. Text
    // wins over files and files over an image, and an image arrives as the path
    // of a PNG main has already written (TSP-12..15). One reader for Ctrl+V and
    // the right-click paste both, so the two gestures cannot drift apart
    // (TSP-20); an empty clipboard plans no chunk, so it emits no byte (TCU-18).
    const pasteFromClipboard = (): void => {
      api
        .invoke('clipboard:read-paste')
        .then((paste) => {
          if (pasteDisposed) return
          if (paste.kind === 'error') {
            console.error('[paste] reading the clipboard failed:', paste.message)
            flashChip(PASTE_FAILED_TEXT)
            return
          }
          enqueuePaste(planPaste(paste))
        })
        .catch((err) => {
          if (pasteDisposed) return
          console.error(err)
          flashChip(PASTE_FAILED_TEXT)
        })
    }

    // Key chords (INPUT-04..08): xterm renders selection on its own layer,
    // not as a native DOM selection, so the browser's Ctrl+C copies nothing —
    // we read term.getSelection() ourselves. Ctrl+C without a selection is
    // left untouched so it still sends SIGINT to the PTY. Shift+Enter is
    // injected as the kitty-protocol CSI-u sequence the Claude CLI needs to
    // tell newline from submit (the xterm 6.0 we ship cannot emit it).
    // Ctrl+V is intercepted so paste does not depend on the browser's native
    // paste event reaching xterm's hidden textarea. Returning false stops
    // xterm from forwarding the chord to the shell.
    term.attachCustomKeyEventHandler((event) => {
      const action = classifyTerminalKey(event, term.getSelection().trim().length > 0, {
        now: Date.now(),
        lastCopyAt: lastCopyAt.current
      })
      // Which way a Ctrl+C went, next to the modes it left behind (TSP-02): a
      // `pass` that reaches the PTY is the press cause 1 and cause 2 blame, and
      // the tracking/buffer pair right at that moment is what tells them apart.
      if (probing && event.type === 'keydown' && event.ctrlKey && event.code === 'KeyC') {
        console.debug(
          `[term-modes] ${sessionId} ctrl-c ${action} tracking=${trackingNow()} buffer=${bufferNow()}`
        )
      }
      if (action === 'copy-selection') {
        // preventDefault suppresses the browser's follow-up keypress (xterm
        // 6.0 only calls preventDefault when it processes the keydown itself;
        // a bare return false lets a keypress of Ctrl+C/Enter through).
        event.preventDefault()
        const selection = term.getSelection()
        // The window opens on the attempt, not on the clipboard's success:
        // a failed write still means the user meant to copy, not to kill the
        // agent (TCU-16).
        lastCopyAt.current = Date.now()
        if (selection) navigator.clipboard.writeText(selection).catch(console.error)
        return false
      }
      if (action === 'swallow') {
        // The second tap of a reflexive Ctrl+C-Ctrl+C, after the agent's TUI
        // redrew and wiped the selection. Discard it and restart the window
        // so an entire burst stays harmless (TCU-06, TCU-07).
        event.preventDefault()
        lastCopyAt.current = Date.now()
        return false
      }
      if (action === 'undo') {
        event.preventDefault()
        // Whose byte this is depends on the agent: Claude Code wants US
        // (0x1F, what Ctrl+_ produces) because Ctrl+Z is suspend there, while
        // opencode binds input_undo to ctrl+z and wants the plain SUB
        // (TCU-01, TCU-02).
        term.input(undoByte)
        return false
      }
      if (action === 'newline') {
        event.preventDefault()
        // Line feed (Ctrl+J byte) — the one newline signal Claude Code and
        // opencode honor on every terminal. CSI-u (`ESC[13;2u`) was tried
        // first; Claude's CSI-u parsing on Windows misbehaves (UAT 2026-08-31).
        term.input('\n')
        return false
      }
      if (action === 'paste') {
        event.preventDefault()
        pasteFromClipboard()
        return false
      }
      return true
    })

    // PTY output → terminal.
    //
    // The first chunk after attach is the ring buffer's replay, and the modes it
    // leaves behind are the whole of cause 3: a replay that lost the mode prefix
    // lands on the normal buffer with no tracking (TSP-03). Logged from the write
    // callback, which fires once that chunk is parsed.
    let replayPending = probing
    const offData = api.on('session:data', (payload) => {
      if (payload.id !== sessionId) return
      if (!replayPending) {
        term.write(payload.data)
        return
      }
      replayPending = false
      term.write(payload.data, () => {
        console.debug(
          `[term-modes] ${sessionId} replay tracking=${trackingNow()} buffer=${bufferNow()} bracketed-paste=${term.modes.bracketedPasteMode}`
        )
      })
    })
    // Become the active stream target; the buffered scrollback replays as the
    // first session:data chunk (same ordered channel as live → no seam race),
    // so we attach only after session:data is subscribed above.
    api.invoke('sessions:attach', { id: sessionId }).catch(console.error)
    // Typed keystrokes → PTY.
    const inputSub = term.onData((data) => api.send('session:input', { id: sessionId, data }))
    // Shell exit → a plain line (no card/rail behavior; that is AM2).
    const offExit = api.on('session:exit', (payload) => {
      if (payload.id === sessionId) {
        term.write(`\r\n\x1b[2m[shell exited with code ${payload.exitCode}]\x1b[0m\r\n`)
      }
    })

    // Keep the PTY's dimensions matched to the container; coalesced by the
    // browser's resize delivery so rapid drags don't crash the PTY.
    const sendResize = (): void => {
      fit.fit()
      api.send('session:resize', { id: sessionId, cols: term.cols, rows: term.rows })
    }
    sendResize()
    const observer = new ResizeObserver(sendResize)
    observer.observe(container)

    // Recolor the terminal live when the app theme toggles (handoff: re-emit
    // the theme on toggle). data-theme flips on <html>.
    const themeObserver = new MutationObserver(() => {
      term.options.theme = readTheme()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    // Right-click = copy-or-paste, no menu (TCU-10..14).
    //
    // Both listeners are on the container in the CAPTURE phase, and both stop
    // propagation, because xterm registers its own `contextmenu` handler on
    // the inner element (`rightClickHandler`: it moves the hidden textarea
    // under the cursor, refills it with the selection and re-selects it, so a
    // native menu can act on it). Two handlers deciding one right-click fired
    // copy and paste off the same click (UAT 2026-09-09). Capturing on the
    // parent runs first and keeps the event from ever descending to xterm.
    //
    // The decision is taken on mousedown, the earliest point in the gesture.
    //
    // It reads the REMEMBERED selection, not only the live one: releasing the
    // left button clears a Shift+drag selection immediately, so the live value
    // is already empty when the right-click lands (measured 2026-09-09, both
    // agents: mouseTracking "any", selection 0). Remembering is what makes
    // Shift+drag copy at all (TCU-25).
    const onRightMouseDown = (event: MouseEvent): void => {
      const selection = selectionForRightClick(term.getSelection(), rememberedSelection)
      const action = classifyTerminalMouse(
        event,
        selection.trim().length > 0,
        term.modes.mouseTrackingMode !== 'none'
      )
      // 'none' covers a non-right button AND a right-click the agent owns the
      // mouse for: in both cases the event is left alone so it reaches xterm
      // and, through it, the agent (TCU-27).
      if (action === 'none') {
        // A left click is how a selection is dismissed, so it also forgets the
        // remembered one (TCU-26).
        if (event.button === 0) rememberedSelection = ''
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (action === 'copy-selection') {
        lastCopyAt.current = Date.now()
        rememberedSelection = ''
        // Clearing is what lets the next right-click reach the paste branch,
        // and it matches Windows Terminal (TCU-11).
        term.clearSelection()
        flashChip('Copiado')
        navigator.clipboard.writeText(selection).catch(console.error)
        return
      }
      // Same reader and same queue as Ctrl+V, so the right-click gesture gains
      // images and copied files with it (TSP-20). An empty clipboard plans no
      // chunk, so it still emits no byte to the PTY (TCU-18).
      pasteFromClipboard()
    }
    const onContextMenu = (event: MouseEvent): void => {
      // Suppressed for everything that reaches this listener, so a Shift+F10
      // or Menu-key press still never pops the browser menu (TCU-14).
      event.preventDefault()
      event.stopPropagation()
    }
    // Record every non-empty selection as xterm reports it; the mouseup that
    // follows a Shift+drag clears the live one immediately (TCU-25).
    const selectionSub = term.onSelectionChange(() => {
      const current = term.getSelection()
      if (current.trim()) rememberedSelection = current
    })
    container.addEventListener('mousedown', onRightMouseDown, true)
    container.addEventListener('contextmenu', onContextMenu, true)

    term.focus()

    return () => {
      // Stop streaming this session in main; its PTY + buffer keep running so a
      // later re-attach can replay. Switching sessions detaches the old here and
      // attaches the new on the next mount (sessionId is the effect key).
      api.invoke('sessions:detach', { id: sessionId }).catch(console.error)
      container.removeEventListener('mousedown', onRightMouseDown, true)
      container.removeEventListener('contextmenu', onContextMenu, true)
      clearTimeout(chipTimer)
      chip.remove()
      // Stops a paste sequence that is still walking its paths and drops the gap
      // timer it is waiting on, so no path reaches the disposed terminal and no
      // queue survives a session switch (TSP-24).
      pasteDisposed = true
      clearTimeout(gapTimer)
      selectionSub.dispose()
      for (const handler of probeHandlers) handler.dispose()
      observer.disconnect()
      themeObserver.disconnect()
      offData()
      offExit()
      inputSub.dispose()
      term.dispose()
    }
  }, [sessionId, undoByte])

  return <div ref={containerRef} className="terminal-pane" />
}
