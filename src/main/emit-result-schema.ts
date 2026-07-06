/**
 * The single home of the structured-output contract (WF3, re-homed from the WF1
 * spike). The MCP `emit_result` tool serves `buildToolInputSchema(expect)` as its
 * `inputSchema`; `createValidator(expect)` validates the emitted payload.
 *
 * The `emit_result` argument is `{ status: 'done' | 'blocked', data?, question? }`:
 *   - status 'done'    → carries `data`, which must conform to the step's `expect`
 *                        (the structured payload — the whole point of the tool call);
 *   - status 'blocked' → carries a non-empty `question` and no data (the terminal
 *                        blocker value; WF3-18).
 *
 * Validation uses **ajv** (a full JSON-Schema implementation), replacing the spike's
 * minimal structural checker (AD-008). `expect` is compiled **once** per step by
 * `createValidator`, which throws on an uncompilable `expect` so the runner can fail
 * before spawning the agent (WF3-24).
 */

import Ajv from 'ajv'

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

/**
 * Compile `expect` once with ajv and return a reusable checker doing the envelope
 * logic. Throws synchronously if `expect` is not a valid JSON Schema (WF3-24) so the
 * runner surfaces it before spawning the agent.
 */
export function createValidator(expect: JsonSchema): (payload: unknown) => ValidateResult {
  const ajv = new Ajv({ allErrors: true })
  const validateData = ajv.compile(expect) // throws on an uncompilable `expect`

  return (payload: unknown): ValidateResult => {
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
    if (!validateData(p.data)) {
      return {
        ok: false,
        error: `data does not conform to expect: ${ajv.errorsText(validateData.errors)}`
      }
    }
    return { ok: true, value: { status: 'done', data: p.data } }
  }
}

/** Convenience wrapper — compiles `expect` and validates a single payload. */
export function validate(payload: unknown, expect: JsonSchema): ValidateResult {
  return createValidator(expect)(payload)
}
