/**
 * Prompt files live flat in `~/.playground/prompts`, one `<name>.md` per
 * prompt, discovered on demand like workflows: a missing folder is an empty
 * list, and a broken file is listed with its reason without hiding the others.
 */
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PROMPT_FILE_MAX_BYTES,
  normalizePromptText,
  type PromptEntry
} from '../shared/prompt-template'

const PROMPT_FILE = /\.md$/i

/** The filesystem calls `listPrompts` makes; injectable so a failed read is testable. */
export interface PromptFs {
  readdir: typeof readdir
  stat: (path: string) => Promise<{ size: number }>
  readFile: (path: string, encoding: 'utf8') => Promise<string>
}

const NODE_FS: PromptFs = { readdir, stat, readFile }

/** Every `*.md` file directly in `root`, sorted by name case-insensitively. */
export async function listPrompts(root: string, fs: PromptFs = NODE_FS): Promise<PromptEntry[]> {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const files = entries.filter((e) => e.isFile() && PROMPT_FILE.test(e.name))
  const prompts = await Promise.all(files.map((e) => readPrompt(fs, join(root, e.name), e.name)))
  return prompts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

async function readPrompt(fs: PromptFs, path: string, fileName: string): Promise<PromptEntry> {
  const name = fileName.slice(0, -'.md'.length)
  try {
    if ((await fs.stat(path)).size > PROMPT_FILE_MAX_BYTES) {
      return { name, error: 'larger than 16 KiB' }
    }
    const template = normalizePromptText(await fs.readFile(path, 'utf8'))
    return template === '' ? { name, error: 'empty' } : { name, template }
  } catch (err) {
    return { name, error: `unreadable: ${(err as Error).message}` }
  }
}

/** Creates the prompts folder (and its parents) when it is missing. */
export async function ensurePromptsFolder(root: string): Promise<void> {
  await mkdir(root, { recursive: true })
}
