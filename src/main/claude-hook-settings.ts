/**
 * The `--settings` payload the app appends to a Claude Code launch so that one
 * session reports its lifecycle to the app (AD-019, ACTV-01).
 *
 * `--settings` applies for a single session and writes to no settings file, and
 * hook entries merge across levels, so the user's own hooks keep running beside
 * these. The two allowlist keys are lists and merge the same way: naming our own
 * url and env var keeps the hooks working if the user or an administrator ever
 * defines `allowedHttpHookUrls` / `httpHookAllowedEnvVars`.
 *
 * Pure: the port is decided by the server, and the token is per session and
 * arrives through the environment, so this file is the same for every launch.
 */

/** Environment variable the app sets on the PTY; the hook reads it for its header. */
export const ACTIVITY_TOKEN_ENV = 'PLAYGROUND_ACTIVITY_TOKEN'

/**
 * Claude Code blocks on an http hook until it answers, so the bound must be
 * short: the app is a local process that either answers in milliseconds or is
 * wedged, and five seconds is the spec's ceiling (ACTV-11).
 */
export const HOOK_TIMEOUT_SECONDS = 5

/** Exactly the events the spec's Transition Table reads. */
export const HOOKED_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Notification',
  'Elicitation',
  'ElicitationResult',
  'Stop',
  'StopFailure',
  'PreCompact',
  'PostCompact',
  'SubagentStart',
  'SubagentStop',
  'SessionEnd'
] as const

export interface HttpHook {
  type: 'http'
  url: string
  timeout: number
  headers: Record<string, string>
  allowedEnvVars: string[]
}

export interface ClaudeHookSettings {
  hooks: Record<string, { hooks: HttpHook[] }[]>
  allowedHttpHookUrls: string[]
  httpHookAllowedEnvVars: string[]
}

export function buildClaudeHookSettings(url: string): ClaudeHookSettings {
  const handler: HttpHook = {
    type: 'http',
    url,
    timeout: HOOK_TIMEOUT_SECONDS,
    headers: { Authorization: `Bearer $${ACTIVITY_TOKEN_ENV}` },
    allowedEnvVars: [ACTIVITY_TOKEN_ENV]
  }
  // No `matcher`: every occurrence of each event is reported, because the
  // machine decides what matters from the payload, not from a filter.
  const hooks = Object.fromEntries(HOOKED_EVENTS.map((event) => [event, [{ hooks: [handler] }]]))
  return {
    hooks,
    allowedHttpHookUrls: [url],
    httpHookAllowedEnvVars: [ACTIVITY_TOKEN_ENV]
  }
}
