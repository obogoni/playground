/** The switch: `PLAYGROUND_DEBUG_PERF=1` turns the log on (PDIAG-01, PDIAG-02). */
export const DIAGNOSTICS_ENV = 'PLAYGROUND_DEBUG_PERF'
/** The log's file name, directly in the user data folder. */
export const DIAGNOSTICS_LOG_FILE = 'perf-diagnostics.jsonl'
/** One line a minute (PDIAG-01). */
export const FLUSH_INTERVAL_MS = 60_000
/** The sliding span `maxPerSecond` counts starts in (PDIAG-13). */
export const PER_SECOND_SPAN_MS = 1_000

/** The probes the rest of main calls; a no-op unless the switch is on. */
export interface Diagnostics {
  readonly enabled: boolean
  /**
   * A git call was requested. Call the returned `start` when the spawn queue lets the process
   * run; call the `end` that `start` returns once the process has ended (any outcome).
   */
  gitRequested(cwd: string, args: readonly string[]): () => () => void
  /** Runs `append`, timing it, and records the chunk for `sessionId`. Disabled: just runs `append`. */
  measureAppend(sessionId: string, chunk: string, append: () => void): void
  /** Main sent this event for this worktree. */
  emitted(channel: 'worktree:status' | 'files:changed', worktreePath: string): void
  /** Main started a recount of this worktree (`recountWorktree`). */
  recountStarted(worktreePath: string): void
  /** `claude agents --json` is starting; call the returned function once it has settled. */
  nameListingStarted(): () => void
  /** Cancel the timer, disable the monitor; later probes are ignored. Idempotent. */
  stop(): void
}

const noop = (): void => {}
const noopStart = (): (() => void) => noop

/** The disabled module: no timer, no monitor, no file (PDIAG-02); appends run as they are (PDIAG-22). */
export const NOOP_DIAGNOSTICS: Diagnostics = Object.freeze({
  enabled: false,
  gitRequested: () => noopStart,
  measureAppend: (_sessionId: string, _chunk: string, append: () => void) => append(),
  emitted: noop,
  recountStarted: noop,
  nameListingStarted: () => noop,
  stop: noop
})

/** True only when the switch holds exactly `'1'` (PDIAG-02). */
export function diagnosticsEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[DIAGNOSTICS_ENV] === '1'
}

let installed: Diagnostics = NOOP_DIAGNOSTICS

/** Makes `d` the module every probe reaches; `null` restores the no-op. */
export function installDiagnostics(d: Diagnostics | null): void {
  installed = d ?? NOOP_DIAGNOSTICS
}

/** The installed module: `NOOP_DIAGNOSTICS` until `installDiagnostics` says otherwise. */
export function diagnostics(): Diagnostics {
  return installed
}
