import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { unlinkSync } from 'node:fs'
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
 * The on-disk path of esbuild's native binary inside a packaged app (WF fix).
 * esbuild would resolve its binary relative to its own package, which
 * electron-builder places inside `app.asar`; a `.exe` there is not a real file,
 * so spawning it gets ENOENT. electron-builder DOES smart-unpack `@esbuild/*` to
 * `app.asar.unpacked`, so `loadWorkflow` spawns that real copy — the caller
 * (main, which knows `process.resourcesPath`) builds this path. Pure so it can be
 * unit-tested without Electron. NOTE: we pass this path straight to the spawn, we
 * do NOT set `ESBUILD_BINARY_PATH` — that global env would leak into every child
 * the app spawns (agents/CLIs), forcing their own, differently-versioned esbuild
 * onto this binary and breaking them with a host/binary version mismatch.
 */
export function esbuildBinaryPath(
  resourcesPath: string,
  platform: NodeJS.Platform,
  arch: string
): string {
  return join(
    resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '@esbuild',
    `${platform}-${arch}`,
    esbuildBinarySubpath(platform)
  )
}

/** The binary's name within its `@esbuild/<platform>-<arch>` package. */
export function esbuildBinarySubpath(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'esbuild.exe' : join('bin', 'esbuild')
}

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
 * relative helper/prompt imports resolve into one module) into a uniquely-named
 * temp `.mjs` (unique name ⇒ the ESM cache never returns a stale module across
 * reloads), `import()` it, and validate its exports (WF2-02/03). A transpile/
 * bundle failure or an invalid export set yields `{error}` — never throws — so a
 * broken workflow lists without blocking the others. The temp file is unlinked
 * once imported (the module is already in memory) so repeated loads/reloads
 * don't leak files in the OS temp directory.
 *
 * Bundles by spawning the esbuild binary (`esbuildBin`, its CLI) directly, NOT
 * esbuild's Node API. The async `build()` keeps a long-lived service child
 * spawned with `stdio[2]: 'inherit'`, which in a packaged Windows Electron app
 * (GUI subsystem, no valid parent stderr) dies right after launch — the next
 * write to its stdin fails with `write EPIPE` ("The service is no longer
 * running"), listing every workflow as broken; `buildSync` sidesteps that but
 * spins a worker thread that is fragile in a host already running esbuild. A
 * plain one-shot `execFileSync` of the binary with piped (not inherited) stdio
 * has none of those failure modes and behaves identically in dev and packaged;
 * esbuild's stderr diagnostics are captured and surfaced in `{error}` instead of
 * the opaque EPIPE.
 */
export async function loadWorkflow(folder: string, esbuildBin: string): Promise<LoadedWorkflow> {
  const tmpFile = join(tmpdir(), `workflow-${randomUUID()}.mjs`)
  try {
    execFileSync(
      esbuildBin,
      [
        join(folder, 'workflow.ts'),
        '--bundle',
        '--platform=node',
        '--format=esm',
        ...EXTERNAL.map((m) => `--external:${m}`),
        `--outfile=${tmpFile}`
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }
    )
  } catch (err) {
    // esbuild writes bundle diagnostics to stderr, which execFileSync attaches to
    // the thrown error; prefer that over the generic "Command failed" message.
    const stderr = (err as { stderr?: Buffer }).stderr
    const message = stderr?.length
      ? stderr.toString('utf8').trim()
      : err instanceof Error
        ? err.message
        : String(err)
    return { error: message }
  }

  try {
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
