import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import { api } from '../lib/api'
import '@xterm/xterm/css/xterm.css'
import './TerminalPane.css'

interface TerminalPaneProps {
  sessionId: string
}

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
export function TerminalPane({ sessionId }: TerminalPaneProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      theme: readTheme()
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    // PTY output → terminal.
    const offData = api.on('session:data', (payload) => {
      if (payload.id === sessionId) term.write(payload.data)
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

    term.focus()

    return () => {
      // Stop streaming this session in main; its PTY + buffer keep running so a
      // later re-attach can replay. Switching sessions detaches the old here and
      // attaches the new on the next mount (sessionId is the effect key).
      api.invoke('sessions:detach', { id: sessionId }).catch(console.error)
      observer.disconnect()
      themeObserver.disconnect()
      offData()
      offExit()
      inputSub.dispose()
      term.dispose()
    }
  }, [sessionId])

  return <div ref={containerRef} className="terminal-pane" />
}
