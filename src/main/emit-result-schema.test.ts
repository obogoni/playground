import { describe, expect, it } from 'vitest'
import { buildToolInputSchema, createValidator, validate, type JsonSchema } from './emit-result-schema'

// A representative step `expect`: the structured data the agent must emit.
const EXPECT: JsonSchema = {
  type: 'object',
  properties: { id: { type: 'number' }, title: { type: 'string' } },
  required: ['id', 'title']
}

describe('buildToolInputSchema', () => {
  it('wraps `expect` as the data property of the status/data/question envelope (WF3-06)', () => {
    expect(buildToolInputSchema(EXPECT)).toEqual({
      type: 'object',
      properties: {
        status: { enum: ['done', 'blocked'] },
        data: EXPECT,
        question: { type: 'string' }
      },
      required: ['status']
    })
  })
})

describe('createValidator — envelope + ajv data validation (WF3-03/18)', () => {
  it('accepts a done payload whose data conforms to expect', () => {
    const check = createValidator(EXPECT)
    const r = check({ status: 'done', data: { id: 7, title: 'ship it' } })
    expect(r).toEqual({ ok: true, value: { status: 'done', data: { id: 7, title: 'ship it' } } })
  })

  it('accepts a blocked payload carrying a non-empty question (WF3-18)', () => {
    const r = createValidator(EXPECT)({ status: 'blocked', question: 'which branch?' })
    expect(r).toEqual({ ok: true, value: { status: 'blocked', question: 'which branch?' } })
  })

  it('rejects a payload with no status', () => {
    const r = createValidator(EXPECT)({ data: { id: 1, title: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('status')
  })

  it('rejects a status outside the done/blocked enum', () => {
    const r = createValidator(EXPECT)({ status: 'pending', data: { id: 1, title: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('done')
  })

  it('rejects done data that violates expect (wrong field type) — via ajv', () => {
    const r = createValidator(EXPECT)({ status: 'done', data: { id: 'not-a-number', title: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('id')
  })

  it('rejects done data missing a required field — via ajv', () => {
    const r = createValidator(EXPECT)({ status: 'done', data: { title: 'x' } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('id')
  })

  it('rejects a blocked payload with no question (WF3-18)', () => {
    const r = createValidator(EXPECT)({ status: 'blocked' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('question')
  })

  it('rejects a blocked payload with an empty-string question (WF3-18)', () => {
    const r = createValidator(EXPECT)({ status: 'blocked', question: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('question')
  })

  it('rejects a done payload that omits data (done carries the structured payload)', () => {
    const r = createValidator(EXPECT)({ status: 'done' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('data')
  })

  it('enforces an ajv-only keyword the minimal checker ignored (minItems), proving richer validation', () => {
    const arrayExpect: JsonSchema = { type: 'array', items: { type: 'number' }, minItems: 1 }
    const check = createValidator(arrayExpect)
    expect(check({ status: 'done', data: [] }).ok).toBe(false)
    expect(check({ status: 'done', data: [42] })).toEqual({
      ok: true,
      value: { status: 'done', data: [42] }
    })
  })

  it('enforces an ajv-only string keyword (pattern)', () => {
    const patternExpect: JsonSchema = { type: 'string', pattern: '^[a-f0-9]+$' }
    const check = createValidator(patternExpect)
    expect(check({ status: 'done', data: 'XYZ' }).ok).toBe(false)
    expect(check({ status: 'done', data: 'deadbeef' }).ok).toBe(true)
  })

  it('throws when `expect` is not a compilable JSON Schema (WF3-24)', () => {
    const badExpect = { type: 'not-a-real-type' } as JsonSchema
    expect(() => createValidator(badExpect)).toThrow()
  })

  it('returns a reusable checker (compiled once) usable across multiple payloads', () => {
    const check = createValidator(EXPECT)
    expect(check({ status: 'done', data: { id: 1, title: 'a' } }).ok).toBe(true)
    expect(check({ status: 'done', data: { id: 2, title: 'b' } }).ok).toBe(true)
    expect(check({ status: 'done', data: { id: 'x', title: 'b' } }).ok).toBe(false)
  })
})

describe('validate — convenience wrapper', () => {
  it('delegates to createValidator(expect)(payload)', () => {
    expect(validate({ status: 'done', data: { id: 7, title: 'ship it' } }, EXPECT)).toEqual({
      ok: true,
      value: { status: 'done', data: { id: 7, title: 'ship it' } }
    })
  })
})
