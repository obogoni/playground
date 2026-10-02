/**
 * Prompt files (`~/.playground/prompts/*.md`) are templates whose `{{name}}`
 * placeholders the New Session dialog asks for before spawning. Main uses this
 * module to normalise and bound-check file text; the renderer uses it to list
 * the fields and build the resolved prompt it previews and sends.
 *
 * Pure (string ops only) and therefore fully unit-tested.
 */

/**
 * A discovered prompt file (`prompts:list`). A broken one carries its reason:
 * `'empty'`, `'larger than 16 KiB'` or `` `unreadable: ${message}` ``.
 */
export type PromptEntry = { name: string; template: string } | { name: string; error: string }

/** `{{name}}` with a name the form can label; any other `{{…}}` is literal text. */
export const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g

/** The placeholders the dialog can pre-fill from what it knows at spawn. */
export const CONTEXT_PLACEHOLDERS = ['taskId', 'taskTitle', 'branch', 'worktree'] as const

/** A resolved prompt longer than this blocks Spawn (keeps pwsh's call under 32,767 chars). */
export const PROMPT_MAX_CHARS = 8000

/** A prompt file larger than this is listed as broken. */
export const PROMPT_FILE_MAX_BYTES = 16 * 1024

/** Distinct placeholder names, in order of first appearance. */
export function parsePlaceholders(template: string): string[] {
  const names = new Set<string>()
  for (const match of template.matchAll(PLACEHOLDER)) names.add(match[1])
  return [...names]
}

/**
 * One pass with a replacer function: inserted values are never rescanned, and
 * `$&`-style patterns in a value are inserted as typed.
 */
export function resolvePrompt(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(values, name) ? values[name] : whole
  )
}

/** The text the developer wrote: no leading BOM, `\n` line breaks, trimmed. */
export function normalizePromptText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim()
}
