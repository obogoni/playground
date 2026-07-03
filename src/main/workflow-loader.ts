import { build } from 'esbuild'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { unlinkSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { WorkflowInput, WorkflowMeta } from '../shared/workflows'

/** The author's `run(ctx)` entry point. `ctx` is the main-only facade (T7). */
export type RunFn = (ctx: unknown) => Promise<void>

/** A loaded workflow: its validated `{meta,run}`, or an `{error}` explaining why. */
export type LoadedWorkflow = { meta: WorkflowMeta; run: RunFn } | { error: string }

/** Node builtins + electron are left external — a bundled workflow never inlines them. */
const EXTERNAL = [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'electron']

/**
 * List the workflow folder names directly under `root` (workflow id = folder
 * name, WF2-01). Returns `[]` — never throws — when `root` is missing or empty.
 */
export async function discoverWorkflows(root: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

/**
 * Pure validation of an imported workflow module (WF2-03/04): a well-formed
 * `meta` — an object with a string `name`, an optional string `description`, and
 * an `inputs` array whose every item is `{ key: string, label: string,
 * required?: boolean }` — plus an async `run` function must both be exported,
 * else an `{error}` describing the first problem. Validating each input item
 * (not just that `inputs` is an array) stops a malformed workflow from being
 * treated as valid and later crashing consumers that assume the declared shape.
 */
export function validateMeta(mod: unknown): LoadedWorkflow {
  const m = mod as { meta?: unknown; run?: unknown }
  if (typeof m?.run !== 'function') {
    return { error: 'workflow.ts must export an async `run` function' }
  }
  const meta = m.meta
  if (!meta || typeof meta !== 'object') {
    return { error: 'workflow.ts must export a `meta` object' }
  }
  const shape = meta as Partial<WorkflowMeta>
  if (typeof shape.name !== 'string') {
    return { error: 'workflow meta.name must be a string' }
  }
  if (shape.description !== undefined && typeof shape.description !== 'string') {
    return { error: 'workflow meta.description must be a string when present' }
  }
  if (!Array.isArray(shape.inputs)) {
    return { error: 'workflow meta.inputs must be an array' }
  }
  for (let i = 0; i < shape.inputs.length; i++) {
    const input = shape.inputs[i] as Partial<WorkflowInput> | null | undefined
    if (!input || typeof input !== 'object') {
      return { error: `workflow meta.inputs[${i}] must be an object` }
    }
    if (typeof input.key !== 'string') {
      return { error: `workflow meta.inputs[${i}].key must be a string` }
    }
    if (typeof input.label !== 'string') {
      return { error: `workflow meta.inputs[${i}].label must be a string` }
    }
    if (input.required !== undefined && typeof input.required !== 'boolean') {
      return { error: `workflow meta.inputs[${i}].required must be a boolean when present` }
    }
  }
  return { meta: meta as WorkflowMeta, run: m.run as RunFn }
}

/**
 * Load one workflow: bundle `<folder>/workflow.ts` with esbuild (bundle mode, so
 * relative helper/prompt imports resolve into one module), write the output to a
 * uniquely-named temp `.mjs` (unique name ⇒ the ESM cache never returns a stale
 * module across reloads), `import()` it, and validate its exports (WF2-02/03). A
 * transpile/bundle failure or an invalid export set yields `{error}` — never
 * throws — so a broken workflow lists without blocking the others. The temp file
 * is unlinked once imported (the module is already in memory) so repeated
 * loads/reloads don't leak files in the OS temp directory.
 */
export async function loadWorkflow(folder: string): Promise<LoadedWorkflow> {
  let outputText: string
  try {
    const result = await build({
      entryPoints: [join(folder, 'workflow.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      external: EXTERNAL
    })
    outputText = result.outputFiles[0].text
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const tmpFile = join(tmpdir(), `workflow-${randomUUID()}.mjs`)
  try {
    writeFileSync(tmpFile, outputText, 'utf8')
    const href = pathToFileURL(tmpFile).href
    const mod = await import(/* @vite-ignore */ href)
    return validateMeta(mod)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      // best-effort: the module is already imported into memory; a missing or
      // locked temp file must not turn a successful load into an error.
    }
  }
}
