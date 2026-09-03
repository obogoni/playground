import { describe, expect, it } from 'vitest'
import { PTY_ENV_FORCED, buildPtyEnv } from './terminal-env'

describe('buildPtyEnv', () => {
  it('forces TERM and COLORTERM (INPUT-01)', () => {
    const env = buildPtyEnv({})
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
  })

  it('does not claim a TERM_PROGRAM (UAT finding: CSI-u misbehaves on Windows)', () => {
    const env = buildPtyEnv({})
    expect(env.TERM_PROGRAM).toBeUndefined()
  })

  it('preserves the rest of the parent environment', () => {
    const env = buildPtyEnv({ PATH: 'C:\\bin', HOME: 'C:\\Users\\dev' })
    expect(env.PATH).toBe('C:\\bin')
    expect(env.HOME).toBe('C:\\Users\\dev')
  })

  it('overrides the forced vars even when the parent sets them', () => {
    const env = buildPtyEnv({ TERM: 'xterm', COLORTERM: '' })
    expect(env.TERM).toBe(PTY_ENV_FORCED.TERM)
    expect(env.COLORTERM).toBe(PTY_ENV_FORCED.COLORTERM)
  })
})
