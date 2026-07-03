import { describe, expect, it } from 'vitest'
import { buildToolInputSchema, validate, type JsonSchema } from './emit-result-schema'

// A representative step `expect`: the structured data the agent must emit.
const EXPECT: JsonSchema = {
  type: 'object',
  properties: { id: { type: 'number' }, title: { type: 'string' } },
  required: ['id', 'title']
}

describe('buildToolInputSchema', () => {
  it('wraps `expect` as the data property of the status/data/question envelope (WF1-04)', () => {
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

describe('validate', () => {
  it('accepts a done payload whose data conforms to expect', () => {
    const r = validate({ status: 'done', data: { id: 7, title: 'ship it' } }, EXPECT)
    expect(r).toEqual({ ok: true, value: { status: 'done', data: { id: 7, title: 'ship it' } } })
  })

  it('accepts a blocked payload carrying a question', () => {
    const r = validate({ status: 'blocked', question: 'which branch?' }, EXPECT)
    expect(r).toEqual({ ok: true, value: { status: 'blocked', question: 'which branch?' } })
  })

  it('rejects a payload with no status', () => {
    const r = validate({ data: { id: 1, title: 'x' } }, EXPECT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('missing status')
  })

  it('rejects a status outside the done/blocked enum', () => {
    const r = validate({ status: 'pending', data: { id: 1, title: 'x' } }, EXPECT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('done')
  })

  it('rejects done data that violates expect (wrong field type)', () => {
    const r = validate({ status: 'done', data: { id: 'not-a-number', title: 'x' } }, EXPECT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('id')
  })

  it('rejects done data missing a required field', () => {
    const r = validate({ status: 'done', data: { title: 'x' } }, EXPECT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('id')
  })

  it('rejects a blocked payload with no question', () => {
    const r = validate({ status: 'blocked' }, EXPECT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('question')
  })

  it('rejects a done payload that omits data (done carries the structured payload)', () => {
    const r = validate({ status: 'done' }, EXPECT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('data')
  })
})
