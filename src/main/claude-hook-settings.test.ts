import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_TOKEN_ENV,
  buildClaudeHookSettings,
  HOOKED_EVENTS,
  HOOK_TIMEOUT_SECONDS
} from './claude-hook-settings'

const URL = 'http://127.0.0.1:51234/hooks'

/** Every event the spec's Transition Table reads, and nothing else. */
const TABLE_EVENTS = [
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
]

describe('HOOKED_EVENTS', () => {
  it('subscribes to exactly the events the transition table reads', () => {
    expect([...HOOKED_EVENTS].sort()).toEqual([...TABLE_EVENTS].sort())
  })
})

describe('buildClaudeHookSettings', () => {
  const settings = buildClaudeHookSettings(URL)

  it('registers one handler for every hooked event', () => {
    expect(Object.keys(settings.hooks).sort()).toEqual([...TABLE_EVENTS].sort())
  })

  it('sends every event to the app over http', () => {
    for (const event of TABLE_EVENTS) {
      const [handler] = settings.hooks[event][0].hooks
      expect(handler.type).toBe('http')
      expect(handler.url).toBe(URL)
    }
  })

  it('bounds each hook so an unresponsive app cannot stall the agent (ACTV-11)', () => {
    expect(HOOK_TIMEOUT_SECONDS).toBeLessThanOrEqual(5)
    for (const event of TABLE_EVENTS) {
      expect(settings.hooks[event][0].hooks[0].timeout).toBe(HOOK_TIMEOUT_SECONDS)
    }
  })

  it('carries the session token as a bearer header from the environment', () => {
    const [handler] = settings.hooks.Stop[0].hooks
    expect(handler.headers.Authorization).toBe(`Bearer $${ACTIVITY_TOKEN_ENV}`)
    expect(handler.allowedEnvVars).toEqual([ACTIVITY_TOKEN_ENV])
  })

  it('leaves every entry unfiltered, so no occurrence of an event is missed', () => {
    for (const event of TABLE_EVENTS) {
      expect(settings.hooks[event][0]).not.toHaveProperty('matcher')
    }
  })

  it('allowlists its own url and env var, so a user or org allowlist merges instead of blocking', () => {
    expect(settings.allowedHttpHookUrls).toEqual([URL])
    expect(settings.httpHookAllowedEnvVars).toEqual([ACTIVITY_TOKEN_ENV])
  })

  it('survives the round trip through the settings file', () => {
    expect(JSON.parse(JSON.stringify(settings))).toEqual(settings)
  })
})
