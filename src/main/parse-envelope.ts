/**
 * Prod seam (WF3, re-homed from the WF1 spike minus the Arm N `structuredOutput`
 * field — Arm N was dropped, AD-008).
 *
 * Parses the `--output-format json` envelope the headless `claude` run prints on
 * stdout and pulls out the `session_id` (WF3-16, recorded on the run so WF4 can
 * `--resume` it) plus the free-text `result`.
 *
 * On any failure — stdout that is not JSON, an envelope that is not an object, or
 * one with no usable `session_id` — it THROWS with the raw captured text attached,
 * so the runner fails the step loudly instead of proceeding with a silently-empty
 * session id.
 */

export interface ParsedEnvelope {
  sessionId: string
  result: string
}

export function parseEnvelope(stdout: string): ParsedEnvelope {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error(`headless output was not JSON:\n${stdout}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`headless output was not a JSON object:\n${stdout}`)
  }
  const env = parsed as Record<string, unknown>
  if (typeof env.session_id !== 'string' || env.session_id.length === 0) {
    throw new Error(`envelope has no non-empty session_id:\n${stdout}`)
  }
  return {
    sessionId: env.session_id,
    result: typeof env.result === 'string' ? env.result : ''
  }
}
