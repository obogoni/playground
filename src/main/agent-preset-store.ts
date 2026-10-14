/**
 * Agent presets live in one hand-editable file, `~/.playground/presets.json`:
 * a JSON array whose order is the menu order. A broken entry is listed with its
 * reason without hiding the others; an invalid file is reported, never moved
 * aside or overwritten (AD-063).
 */
import { sameName, type AgentPreset } from '../shared/agent-presets'

/** The file's top level as read (PRST-03). */
export type ParsedPresets = { ok: true; raw: unknown[] } | { ok: false; reason: string }

/** One array element: a usable preset, or why it is not one (PRST-04, PRST-05). */
export type ClassifiedEntry =
  | { kind: 'ok'; preset: AgentPreset }
  | { kind: 'invalid'; name: string | null; reason: string }

/** Parses the file text; `raw` is the array exactly as read (PRST-03). */
export function parsePresetsText(text: string): ParsedPresets {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { ok: false, reason: `invalid JSON: ${(err as Error).message}` }
  }
  return Array.isArray(parsed) ? { ok: true, raw: parsed } : { ok: false, reason: 'not an array' }
}

const REQUIRED = ['name', 'agent', 'cwd'] as const

function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Each element in array order (PRST-01): `invalid entry: <field>` for the first
 * bad field of `name`, `agent`, `cwd`, `prompt` (PRST-04; a non-object fails on
 * `name`), and `duplicate name` for a later entry whose name a valid earlier
 * one already holds (PRST-05).
 */
export function classifyEntries(raw: unknown[]): ClassifiedEntry[] {
  const taken: string[] = []
  return raw.map((item): ClassifiedEntry => {
    const isObject = item !== null && typeof item === 'object' && !Array.isArray(item)
    const fields = (isObject ? item : {}) as Record<string, unknown>
    const { name, agent, cwd, prompt } = fields
    if (!isFilled(name) || !isFilled(agent) || !isFilled(cwd)) {
      const field = REQUIRED.find((key) => !isFilled(fields[key]))
      return {
        kind: 'invalid',
        name: isFilled(name) ? name : null,
        reason: `invalid entry: ${field}`
      }
    }
    if (prompt !== undefined && typeof prompt !== 'string') {
      return { kind: 'invalid', name, reason: 'invalid entry: prompt' }
    }
    if (taken.some((other) => sameName(other, name))) {
      return { kind: 'invalid', name, reason: 'duplicate name' }
    }
    taken.push(name)
    const preset: AgentPreset = { name, agent, cwd }
    if (typeof prompt === 'string') preset.prompt = prompt
    return { kind: 'ok', preset }
  })
}
