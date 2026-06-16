import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
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
 * Embedded xterm bound to one session (PRD stories 2, 18; handoff §C-b). PTY
 * bytes arrive over session:data; keystrokes go back over session:input; the
 * container drives fit() + session:resize. Basic readable theme here — the
 * full token→ANSI map and re-emit-on-toggle is the P2 polish (T12).
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
      theme: {
        background: token('--bg', '#1a1815'),
        foreground: token('--text', '#efe9e0'),
        cursor: token('--accent', '#a78bfa')
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    fit.fit()

    // PTY output → terminal.
    const offData = api.on('session:data', (payload) => {
      if (payload.id === sessionId) term.write(payload.data)
    })
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

    term.focus()

    return () => {
      observer.disconnect()
      offData()
      offExit()
      inputSub.dispose()
      term.dispose()
    }
  }, [sessionId])

  return <div ref={containerRef} className="terminal-pane" />
}
