import { describe, expect, it } from 'vitest'
import { parseEnvelope } from './parse-envelope'

describe('parseEnvelope', () => {
  it('extracts sessionId, result, and the native structured_output payload (WF1-05)', () => {
    const stdout = JSON.stringify({
      result: 'done thinking',
      session_id: 'sess-abc-123',
      structured_output: { id: 7, title: 'ship it' },
      total_cost_usd: 0.01
    })
    expect(parseEnvelope(stdout)).toEqual({
      sessionId: 'sess-abc-123',
      result: 'done thinking',
      structuredOutput: { id: 7, title: 'ship it' }
    })
  })

  it('leaves structuredOutput undefined when the envelope has none (Arm M)', () => {
    const stdout = JSON.stringify({ result: 'ok', session_id: 'sess-xyz' })
    const parsed = parseEnvelope(stdout)
    expect(parsed.sessionId).toBe('sess-xyz')
    expect('structuredOutput' in parsed).toBe(false)
  })

  it('throws with the raw captured text when session_id is missing (not silently empty)', () => {
    const stdout = JSON.stringify({ result: 'ok', total_cost_usd: 0.01 })
    expect(() => parseEnvelope(stdout)).toThrow(/session_id/)
    expect(() => parseEnvelope(stdout)).toThrow(/total_cost_usd/) // raw text attached
  })

  it('throws when session_id is present but empty', () => {
    const stdout = JSON.stringify({ result: 'ok', session_id: '' })
    expect(() => parseEnvelope(stdout)).toThrow(/no non-empty session_id/)
  })

  it('throws with the raw text when stdout is not JSON', () => {
    const stdout = 'Error: command failed\n  at claude'
    expect(() => parseEnvelope(stdout)).toThrow(/was not JSON/)
    expect(() => parseEnvelope(stdout)).toThrow(/command failed/) // raw text attached
  })
})
