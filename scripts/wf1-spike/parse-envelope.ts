/**
 * WF1 spike — pure seam ✚ tested.
 *
 * Parses the `--output-format json` envelope the headless `claude` run prints on
 * stdout and pulls out the two things the spike needs: the `session_id` (WF1-05,
 * fed to `--resume`) and, for Arm N, the native `structured_output` payload.
 *
 * On any failure — stdout that is not JSON, or an envelope with no usable
 * `session_id` — it THROWS with the raw captured text attached, so the
 * orchestrator (run.ts) fails that arm loudly instead of proceeding with a
 * silently-empty session id. The exact envelope field names are documented
 * leads (design §Research findings) that T7 confirms against the installed CLI.
 */

export interface ParsedEnvelope {
  sessionId: string
  result: string
  /** Arm N's native structured payload; absent when `--json-schema` was not used. */
  structuredOutput?: unknown
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
  const out: ParsedEnvelope = {
    sessionId: env.session_id,
    result: typeof env.result === 'string' ? env.result : ''
  }
  if ('structured_output' in env) {
    out.structuredOutput = env.structured_output
  }
  return out
}
