/**
 * Agent presets live in one hand-editable file, `~/.playground/presets.json`:
 * a JSON array whose order is the menu order. A broken entry is listed with its
 * reason without hiding the others; an invalid file is reported, never moved
 * aside or overwritten (AD-063).
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  presetNameProblem,
  sameName,
  type AgentPreset,
  type AgentPresetChangeResult,
  type AgentPresetEntry,
  type AgentPresetListing,
  type PresetOp
} from '../shared/agent-presets'

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

/** Why an op was refused: a name clash, or any other reason as text. */
export type PresetOpError = { kind: 'exists'; name: string } | { kind: 'failed'; message: string }

/**
 * Applies `op` to a copy of `raw`. The target is found by name among the valid
 * entries, never by index, since the file may have changed by hand since the
 * renderer listed it (PRST-09). Rewritten entries keep every unmanaged field
 * (PRST-07).
 */
export function applyPresetOp(
  raw: unknown[],
  op: PresetOp
): { raw: unknown[] } | { error: PresetOpError } {
  const entries = classifyEntries(raw)
  /** The valid entry named `name`: its index and its name as stored. */
  const find = (name: string): { index: number; stored: string } | null => {
    const index = entries.findIndex((e) => e.kind === 'ok' && sameName(e.preset.name, name))
    const entry = entries[index]
    return entry?.kind === 'ok' ? { index, stored: entry.preset.name } : null
  }
  const notFound = (name: string): { error: PresetOpError } => ({
    error: { kind: 'failed', message: `preset "${name}" not found` }
  })
  const next = [...raw]

  switch (op.kind) {
    case 'save': {
      const problem = presetNameProblem(op.preset.name)
      if (problem) return { error: { kind: 'failed', message: problem } }
      const { agent, cwd, prompt } = op.preset
      const name = op.preset.name.trim()
      const existing = find(name)
      if (!existing) {
        next.push(prompt === undefined ? { name, agent, cwd } : { name, agent, cwd, prompt })
        return { raw: next }
      }
      if (!op.replace) return { error: { kind: 'exists', name: existing.stored } }
      // Spread the old entry so unmanaged fields survive (PRST-16, PRST-07).
      const old = raw[existing.index] as object
      const replaced: Record<string, unknown> = { ...old, name, agent, cwd }
      if (prompt === undefined) delete replaced.prompt
      else replaced.prompt = prompt
      next[existing.index] = replaced
      return { raw: next }
    }
    case 'rename': {
      const target = find(op.from)
      if (!target) return notFound(op.from)
      const problem = presetNameProblem(op.to)
      if (problem) return { error: { kind: 'failed', message: problem } }
      const name = op.to.trim()
      const other = find(name)
      if (other && other.index !== target.index) {
        return { error: { kind: 'exists', name: other.stored } } // PRST-39
      }
      next[target.index] = { ...(raw[target.index] as object), name } // PRST-38, PRST-07
      return { raw: next }
    }
    case 'move': {
      const index = find(op.name)?.index
      if (index === undefined) return notFound(op.name)
      const target = op.direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= raw.length) {
        const end = op.direction === 'up' ? 'first' : 'last'
        return { error: { kind: 'failed', message: `preset "${op.name}" is already ${end}` } }
      }
      // Swap with the raw neighbour, broken or not, so file order is menu order (PRST-40).
      ;[next[index], next[target]] = [next[target], next[index]]
      return { raw: next }
    }
    case 'delete': {
      const target = find(op.name)
      if (!target) return notFound(op.name)
      next.splice(target.index, 1) // PRST-41
      return { raw: next }
    }
  }
}

/** The whole array as UTF-8 JSON, 2-space indented, `\n` line ends (PRST-06). */
export function serializePresets(raw: unknown[]): string {
  return JSON.stringify(raw, null, 2) + '\n'
}

/** The filesystem calls the store makes; injectable so a failed write is testable. */
export interface PresetFs {
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>
  stat: (path: string) => Promise<{ isDirectory(): boolean }>
}

export const NODE_PRESET_FS: PresetFs = { readFile, writeFile, rename, mkdir, stat }

/** Opens a file with the OS default app; `''` on success, else the error (`shell.openPath`). */
export type PresetOpener = (path: string) => Promise<string>

export interface PresetStore {
  list(): Promise<AgentPresetListing>
  change(op: PresetOp): Promise<AgentPresetChangeResult>
  openFile(): Promise<string | null>
}

/** PRST-08: the app never writes over a file the developer got wrong. */
const INVALID_FILE = 'presets.json is invalid; fix it by hand first'

function isMissing(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT'
}

/** The presets file at `file`; every change re-reads it first and is applied one at a time. */
export function createPresetStore(file: string, fs: PresetFs, opener: PresetOpener): PresetStore {
  let chain: Promise<unknown> = Promise.resolve()
  /** Runs `task` after every earlier one, whether or not they failed. */
  const queue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task)
    chain = run.catch(() => undefined)
    return run
  }

  /** The file as parsed now; a missing file is an empty array (PRST-02). */
  async function read(): Promise<ParsedPresets> {
    let text: string
    try {
      text = await fs.readFile(file, 'utf8')
    } catch (err) {
      if (isMissing(err)) return { ok: true, raw: [] }
      return { ok: false, reason: `unreadable: ${(err as Error).message}` }
    }
    return parsePresetsText(text)
  }

  async function isFolder(path: string): Promise<boolean> {
    try {
      return (await fs.stat(path)).isDirectory()
    } catch {
      return false
    }
  }

  async function toListing(parsed: ParsedPresets): Promise<AgentPresetListing> {
    if (!parsed.ok) return parsed
    const entries = await Promise.all(
      classifyEntries(parsed.raw).map(
        async (entry): Promise<AgentPresetEntry> =>
          entry.kind === 'ok'
            ? { kind: 'ok', preset: entry.preset, cwdExists: await isFolder(entry.preset.cwd) }
            : entry
      )
    )
    return { ok: true, entries }
  }

  /** Temp file + rename, so a failed write leaves the old file whole (PRST-06). */
  async function write(raw: unknown[]): Promise<void> {
    await fs.mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, serializePresets(raw), 'utf8')
    await fs.rename(tmp, file)
  }

  return {
    list: async () => toListing(await read()),

    change: (op) =>
      queue(async (): Promise<AgentPresetChangeResult> => {
        try {
          // Re-read so a hand edit made since the last listing survives (PRST-09).
          const parsed = await read()
          if (!parsed.ok) return { ok: false, error: { kind: 'failed', message: INVALID_FILE } }
          const result = applyPresetOp(parsed.raw, op)
          if ('error' in result) return { ok: false, error: result.error }
          await write(result.raw)
          return { ok: true, listing: await toListing({ ok: true, raw: result.raw }) }
        } catch (err) {
          return { ok: false, error: { kind: 'failed', message: (err as Error).message } }
        }
      }),

    openFile: () =>
      queue(async () => {
        try {
          await fs.readFile(file, 'utf8').catch(async (err) => {
            if (!isMissing(err)) throw err
            await write([]) // PRST-42: `[]\n`
          })
        } catch (err) {
          return (err as Error).message
        }
        const error = await opener(file)
        return error === '' ? null : error
      })
  }
}
