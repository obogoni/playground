import { describe, expect, it } from 'vitest'
import { HIGHER_PRECEDENCE_AUTH_VARS, scrubAuthEnv } from './scrub-auth-env'

describe('scrubAuthEnv', () => {
  it('removes every higher-precedence auth var so the run falls back to the subscription (WF1-01)', () => {
    const parent: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      ANTHROPIC_AUTH_TOKEN: 'oauth-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
      CLAUDE_CODE_USE_VERTEX: '1'
    }
    const child = scrubAuthEnv(parent)
    expect(child.ANTHROPIC_API_KEY).toBeUndefined()
    expect(child.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(child.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
    expect(child.CLAUDE_CODE_USE_VERTEX).toBeUndefined()
  })

  it('passes unrelated vars through untouched', () => {
    const parent: NodeJS.ProcessEnv = {
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      PATH: '/usr/bin',
      HOME: '/home/dev',
      ANTHROPIC_MODEL: 'claude-opus-4-8'
    }
    const child = scrubAuthEnv(parent)
    expect(child.PATH).toBe('/usr/bin')
    expect(child.HOME).toBe('/home/dev')
    // Only the precedence set is scrubbed — a non-auth ANTHROPIC_* stays.
    expect(child.ANTHROPIC_MODEL).toBe('claude-opus-4-8')
  })

  it('is a no-op passthrough when none of the auth vars are present', () => {
    const parent: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/dev' }
    expect(scrubAuthEnv(parent)).toEqual({ PATH: '/usr/bin', HOME: '/home/dev' })
  })

  it('does not mutate the input env (returns a copy)', () => {
    const parent: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'sk-ant-secret', PATH: '/usr/bin' }
    scrubAuthEnv(parent)
    expect(parent.ANTHROPIC_API_KEY).toBe('sk-ant-secret')
  })

  it('scrubs exactly the documented precedence set (guards the list against silent edits)', () => {
    expect([...HIGHER_PRECEDENCE_AUTH_VARS]).toEqual([
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX'
    ])
  })
})
