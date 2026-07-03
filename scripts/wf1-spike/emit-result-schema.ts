/**
 * WF1 spike — pure seam ✚ tested (→ WF3 `emit-result-schema`).
 *
 * The single home of the structured-output contract, shared by BOTH arms of the
 * spike: Arm N passes `expect` to `--json-schema`; Arm M serves it as the
 * `emit_result` tool's `inputSchema`. Keeping the shape here means the two arms
 * are compared against the identical contract.
 *
 * The `emit_result` argument is `{ status: 'done' | 'blocked', data?, question? }`:
 *   - status 'done'    → carries `data`, which must conform to the step's `expect`
 *                        (the structured payload — the whole point of the tool call);
 *   - status 'blocked' → carries a `question` and no data (the terminal blocker value,
 *                        design WF1-D5).
 *
 * `validate` uses a MINIMAL structural JSON-Schema check (type/properties/required/
 * items/enum) — just enough to prove a conforming payload is accepted and a
 * non-conforming one rejected. The production validator (ajv vs zod) is a WF3
 * decision (design.md §Tech Decisions), deliberately not committed here.
 */

export type JsonSchema = Record<string, unknown>

export interface EmitResultPayload {
  status: 'done' | 'blocked'
  data?: unknown
  question?: string
}

export type ValidateResult = { ok: true; value: EmitResultPayload } | { ok: false; error: string }

/** `expect` (the step's declared data schema) → the `emit_result` tool inputSchema. */
export function buildToolInputSchema(expect: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: {
      status: { enum: ['done', 'blocked'] },
      data: expect,
      question: { type: 'string' }
    },
    required: ['status']
  }
}

export function validate(payload: unknown, expect: JsonSchema): ValidateResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, error: 'payload must be an object' }
  }
  const p = payload as Record<string, unknown>
  if (!('status' in p)) return { ok: false, error: 'missing status' }
  if (p.status !== 'done' && p.status !== 'blocked') {
    return {
      ok: false,
      error: `status must be "done" or "blocked", got ${JSON.stringify(p.status)}`
    }
  }
  if (p.status === 'blocked') {
    if (typeof p.question !== 'string' || p.question.length === 0) {
      return { ok: false, error: 'blocked requires a non-empty question' }
    }
    return { ok: true, value: { status: 'blocked', question: p.question } }
  }
  // status === 'done' → the structured data must be present and conform to `expect`.
  if (!('data' in p)) return { ok: false, error: 'done requires data' }
  const err = checkSchema(p.data, expect)
  if (err) return { ok: false, error: `data does not conform to expect: ${err}` }
  return { ok: true, value: { status: 'done', data: p.data } }
}

/**
 * Minimal structural JSON-Schema check. Returns null when `value` conforms to
 * `schema`, or a short path-qualified reason when it does not. Supports only
 * type / properties / required / items / enum — the keywords the spike's `expect`
 * schemas use. NOT a full JSON-Schema implementation (that is WF3's ajv/zod).
 */
function checkSchema(value: unknown, schema: JsonSchema): string | null {
  if (Array.isArray(schema.enum)) {
    const inEnum = schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))
    if (!inEnum) return `${JSON.stringify(value)} not in enum`
  }
  const type = typeof schema.type === 'string' ? schema.type : undefined
  if (type && !matchesType(value, type)) return `expected ${type}`
  if (type === 'object') {
    const obj = value as Record<string, unknown>
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    for (const key of required) {
      if (!(key in obj)) return `missing required "${key}"`
    }
    const props = (schema.properties as Record<string, JsonSchema> | undefined) ?? {}
    for (const [key, propSchema] of Object.entries(props)) {
      if (key in obj) {
        const e = checkSchema(obj[key], propSchema)
        if (e) return `"${key}": ${e}`
      }
    }
  }
  if (type === 'array') {
    const arr = value as unknown[]
    const items = schema.items as JsonSchema | undefined
    if (items) {
      for (let i = 0; i < arr.length; i++) {
        const e = checkSchema(arr[i], items)
        if (e) return `[${i}]: ${e}`
      }
    }
  }
  return null
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'array':
      return Array.isArray(value)
    case 'null':
      return value === null
    default:
      return true
  }
}
