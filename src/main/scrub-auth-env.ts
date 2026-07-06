/**
 * Prod seam (WF3, re-homed verbatim from the WF1 spike).
 *
 * Returns a child process env with every auth source that OUTRANKS the logged-in
 * Claude subscription removed, forcing the headless agent to authenticate on the
 * subscription (the headline goal: personal plan, not metered API). A stray
 * `ANTHROPIC_API_KEY` — or any of the other higher-precedence vars — in the
 * parent env would silently bill the metered API, so the whole set is scrubbed.
 *
 * Pure: does not mutate the input; returns a shallow copy minus the auth keys.
 */

/** Auth env vars that take precedence over the subscription — all removed. */
export const HIGHER_PRECEDENCE_AUTH_VARS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX'
] as const

export function scrubAuthEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { ...parent }
  for (const key of HIGHER_PRECEDENCE_AUTH_VARS) {
    delete child[key]
  }
  return child
}
