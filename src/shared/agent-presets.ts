/**
 * Agent presets (`~/.playground/presets.json`) name an agent, a folder and an
 * optional prompt so the rail can launch them in one pick. Main owns the file;
 * the dialog, Settings and main share these types and the name rule.
 *
 * Pure (string ops only) and therefore fully unit-tested.
 */

/** One preset as the app writes it; `prompt` absent means None. */
export interface AgentPreset {
  name: string
  /** Registry agent name (`AppConfig.agents[].name`). */
  agent: string
  /** Absolute folder the session starts in. */
  cwd: string
  /** Prompt file name without `.md`. */
  prompt?: string
}

/** A listed entry: a usable preset, or a broken entry with its reason (PRST-04, PRST-05). */
export type AgentPresetEntry =
  | { kind: 'ok'; preset: AgentPreset; cwdExists: boolean }
  | { kind: 'invalid'; name: string | null; reason: string }

/** The file's entries in array order (PRST-01), or why the file is invalid (PRST-03). */
export type AgentPresetListing =
  | { ok: true; entries: AgentPresetEntry[] }
  | { ok: false; reason: string }

export type AgentPresetChangeResult =
  | { ok: true; listing: AgentPresetListing }
  | { ok: false; error: { kind: 'exists'; name: string } | { kind: 'failed'; message: string } }

/** A change main applies to the file; every op targets its entry by name. */
export type PresetOp =
  | { kind: 'save'; preset: AgentPreset; replace: boolean }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'move'; name: string; direction: 'up' | 'down' }
  | { kind: 'delete'; name: string }

/** Longest preset name, counted after trimming (PRST-15). */
export const PRESET_NAME_MAX = 40

/** Why `name` cannot name a preset, or `null` (PRST-15). */
export function presetNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed.length > PRESET_NAME_MAX || /[\r\n]/.test(trimmed)) {
    return '1–40 characters, one line'
  }
  return null
}

/** Preset names match trimmed and case-insensitively (PRST-05, PRST-16, PRST-39). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
