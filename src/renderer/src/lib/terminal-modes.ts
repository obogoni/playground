/**
 * DEC private mode vocabulary for the terminal-mode probe (TSP-01..05).
 *
 * The dead wheel after a Ctrl+C has three candidate causes and they point at
 * opposite fixes, so the pane first logs every mode change it parses and the
 * owner reads which one happens. Terminal-mode bugs have come up three times
 * now (INPUT, TCU, this one), so the probe stays in the product behind a
 * localStorage flag instead of being re-instrumented each time.
 *
 * The names and the flag live here, not in the pane: the repo does not unit-test
 * renderer components, so a literal inside `TerminalPane.tsx` could not assert
 * that 1003 reads `any` or that `'true'` does not switch the probe on.
 *
 * Pure (string ops only) and therefore fully unit-tested.
 */

/** The localStorage key that switches the probe on; only `'1'` counts (TSP-04). */
export const PROBE_FLAG_KEY = 'playground.debug.terminalModes'

/**
 * Stable names for the modes a TUI depends on. All three alternate-screen params
 * share one name because the distinction never matters to the reader: 47, 1047
 * and 1049 all mean the screen was swapped.
 */
const MODE_NAMES: Record<number, string> = {
  9: 'x10',
  25: 'cursor',
  47: 'alt-screen',
  1000: 'vt200',
  1002: 'drag',
  1003: 'any',
  1004: 'focus',
  1005: 'utf8-mouse',
  1006: 'sgr-mouse',
  1015: 'urxvt-mouse',
  1016: 'sgr-pixels',
  1047: 'alt-screen',
  1049: 'alt-screen',
  2004: 'bracketed-paste'
}

/** The mode's name, or `?<n>` for a param the probe does not model (TSP-05). */
export function modeName(param: number): string {
  return MODE_NAMES[param] ?? `?${param}`
}

/** One parsed `CSI ? Pm h|l`, plus the terminal state it left behind. */
export interface ModeLogEvent {
  sessionId: string
  /** `h` for a set, `l` for a reset. */
  final: 'h' | 'l'
  /** The params as xterm parsed them, undecoded. */
  params: number[]
  /** `term.modes.mouseTrackingMode` after the sequence applied. */
  tracking: string
  /** `term.buffer.active.type` after the sequence applied. */
  buffer: string
}

/**
 * One log line per mode change. The raw params stay in it next to their decoded
 * names: the decoder is what a reader would otherwise have to trust, and a
 * `?<n>` fallback is only diagnosable with the number beside it (TSP-01).
 */
export function formatModeLog(event: ModeLogEvent): string {
  const params = event.params.join(';')
  const names = event.params.map(modeName).join(',')
  return `[term-modes] ${event.sessionId} CSI ?${params}${event.final} ${names} tracking=${event.tracking} buffer=${event.buffer}`
}

/**
 * Whether the probe logs at all. The reader is injected so the pane's
 * `localStorage` access stays out of the seam, and a throw (storage blocked or
 * unavailable) reads as off: a debug aid must never break the terminal (TSP-04).
 */
export function isProbeEnabled(read: () => string | null): boolean {
  try {
    return read() === '1'
  } catch {
    return false
  }
}
