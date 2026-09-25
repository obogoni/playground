/**
 * Builds the toast for a failed session action, carrying the underlying reason
 * instead of dropping it (#89).
 *
 * A rejected `api.invoke` arrives wrapped twice: `api.ts` prefixes
 * `IPC '<channel>' failed:`, and Electron's `ipcMain.handle` prefixes
 * `Error invoking remote method '<channel>':` around the main-process error.
 * Left verbatim, those prefixes bury the only part a developer can act on —
 * `spawn pwsh.exe ENOENT`, `cwd does not exist`, an OS-level denial — so they
 * are peeled off here, repeatedly, since they nest.
 *
 * The toast is a single row of UI, so the reason is reduced to its first
 * non-empty line (node-pty likes to trail a stack) and clipped. When nothing
 * intelligible survives, the caller's plain message is returned unchanged —
 * a bare "Couldn't start session" beats "Couldn't start session: [object Object]".
 */

/** Wrappers added on the way from main to the renderer, outermost first. */
const WRAPPER_PREFIXES = [
  /^IPC '[^']*' failed:\s*/,
  /^Error invoking remote method '[^']*':\s*/,
  /^(?:Uncaught )?Error:\s*/
]

/** Keeps the toast to one readable row; node-pty messages can run long. */
const MAX_REASON_LENGTH = 160

function extractReason(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  let reason =
    raw
      .split(/\r?\n/)
      .find((line) => line.trim() !== '')
      ?.trim() ?? ''

  // The wrappers nest (IPC → remote method → Error), and `Error:` can repeat,
  // so peeling runs until a pass changes nothing.
  for (let peeled = true; peeled; ) {
    peeled = false
    for (const prefix of WRAPPER_PREFIXES) {
      if (!prefix.test(reason)) continue
      reason = reason.replace(prefix, '').trim()
      peeled = true
    }
  }

  if (reason.length <= MAX_REASON_LENGTH) return reason
  return `${reason.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`
}

export function failureToast(message: string, err: unknown): string {
  const reason = extractReason(err)
  return reason === '' ? message : `${message}: ${reason}`
}
