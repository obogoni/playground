import { git, isTimeout, READ_ONLY_FLAGS } from './git'

/** At most this many paths are asked about in one batch (FWIG-06). */
export const IGNORE_ASK_LIMIT = 2000

/** A check that runs longer is killed, and its batch passes unfiltered (FWIG-10). */
export const IGNORE_CHECK_TIMEOUT_MS = 5000

/** Worktree-relative parent folders, outermost first: 'a/b/c.ts' → ['a', 'a/b']. */
export function parentFolders(path: string): string[] {
  const parts = path.split('/')
  const folders: string[] = []
  for (let i = 1; i < parts.length; i++) folders.push(parts.slice(0, i).join('/'))
  return folders
}

/**
 * What git said about paths during one watch (FWIG-04..06). A path or folder is
 * ignored, kept, or unknown; only unknown ones are asked. An ignored answer is a
 * prefix for everything under it: git never re-includes a file inside an
 * excluded folder, and it answers "not ignored" for a folder that holds a
 * tracked file. Paths are compared as the watcher names them (forward slashes,
 * no leading `./`).
 */
export class IgnoreAnswers {
  private readonly ignored = new Set<string>()
  private readonly kept = new Set<string>()

  /** True when git said this path, or a folder above it, is ignored. */
  isIgnored(path: string): boolean {
    if (this.ignored.has(path)) return true
    return parentFolders(path).some((folder) => this.ignored.has(folder))
  }

  /**
   * What one batch must ask: every parent folder and every path with no answer,
   * skipping anything under a folder already known ignored. Folders first; only
   * folders when the total exceeds IGNORE_ASK_LIMIT; nothing when the folders
   * alone exceed it (FWIG-05/06).
   */
  questionsFor(paths: readonly string[]): string[] {
    const asked = new Set<string>()
    const folders: string[] = []
    const files: string[] = []
    const open = paths.filter((path) => !this.isIgnored(path))
    for (const path of open) {
      for (const folder of parentFolders(path)) {
        if (asked.has(folder) || this.known(folder)) continue
        asked.add(folder)
        folders.push(folder)
      }
    }
    for (const path of open) {
      if (asked.has(path) || this.known(path)) continue
      asked.add(path)
      files.push(path)
    }
    if (folders.length > IGNORE_ASK_LIMIT) return []
    if (folders.length + files.length > IGNORE_ASK_LIMIT) return folders
    return [...folders, ...files]
  }

  /** Records git's answer for exactly these questions: listed in `ignored` → ignored, else kept. */
  learn(asked: readonly string[], ignored: ReadonlySet<string>): void {
    for (const path of asked) {
      if (ignored.has(path)) this.ignored.add(path)
      else this.kept.add(path)
    }
  }

  forget(): void {
    this.ignored.clear()
    this.kept.clear()
  }

  private known(path: string): boolean {
    return this.ignored.has(path) || this.kept.has(path)
  }
}

export type IgnoreRunner = (
  cwd: string,
  args: string[],
  opts: { input: string; timeoutMs: number }
) => Promise<{ stdout: string }>

/**
 * `git [...READ_ONLY_FLAGS] check-ignore --stdin -z` over `paths` (FWIG-03, FWIG-15):
 * the set of paths git reports ignored, exactly as sent; an empty set on exit
 * code 1, which means none is ignored; null on any other failure or a timeout
 * (FWIG-10).
 */
export async function checkIgnored(
  worktreePath: string,
  paths: readonly string[],
  run: IgnoreRunner = git
): Promise<Set<string> | null> {
  try {
    const { stdout } = await run(
      worktreePath,
      [...READ_ONLY_FLAGS, 'check-ignore', '--stdin', '-z'],
      {
        input: paths.map((path) => `${path}\0`).join(''),
        timeoutMs: IGNORE_CHECK_TIMEOUT_MS
      }
    )
    return new Set(stdout.split('\0').filter((path) => path !== ''))
  } catch (err) {
    if (!isTimeout(err) && (err as { code?: unknown } | null)?.code === 1) return new Set()
    return null
  }
}
