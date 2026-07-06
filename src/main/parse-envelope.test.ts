import { describe, expect, it } from 'vitest'
import { parseEnvelope } from './parse-envelope'

describe('parseEnvelope (WF3-16)', () => {
  it('extracts sessionId and result from the headless JSON envelope', () => {
    const stdout = JSON.stringify({
      result: 'done thinking',
      session_id: 'sess-abc-123',
      total_cost_usd: 0.01
    })
    expect(parseEnvelope(stdout)).toEqual({
      sessionId: 'sess-abc-123',
      result: 'done thinking'
    })
  })

  it('defaults result to an empty string when the envelope omits it', () => {
    const parsed = parseEnvelope(JSON.stringify({ session_id: 'sess-xyz' }))
    expect(parsed.sessionId).toBe('sess-xyz')
    expect(parsed.result).toBe('')
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

  it('throws when stdout is valid JSON but not an object (e.g. an array)', () => {
    const stdout = JSON.stringify(['not', 'an', 'object'])
    expect(() => parseEnvelope(stdout)).toThrow(/not a JSON object/)
  })
})
