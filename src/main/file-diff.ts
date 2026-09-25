import type {
  DiffRef,
  DiffRequest,
  DiffSide,
  DiffSides,
  Eol,
  FileStat,
  FilesMode
} from '../shared/files'
import { BINARY_SNIFF_BYTES, MAX_VIEW_BYTES, isBinary, readForView } from './file-reader'
import { git, gitFailureLine, type GitRunner } from './git'

/**
 * How this module runs git, re-exported from `git.ts` so the two places that
 * stand in for git share one definition. Injectable so a test can record which
 * commands a path actually took — the only way to prove an oversized blob was
 * never read (FDIF-06) without measuring how long it took not to read it.
 */
export type { GitRunner }

/** What `lineEndingChanges` found: which modified lines flipped, and each side's dominant ending. */
export interface EolChanges {
  /** Modified-side line numbers, 1-based, whose terminator differs from the matching original line. */
  lines: number[]
  /** The original side's dominant terminator; absent when that side has none at all. */
  from?: Eol
  /** The modified side's dominant terminator; absent when that side has none at all. */
  to?: Eol
}

/** One line as the raw bytes carry it: its text, and the terminator that ended it. */
interface RawLine {
  text: string
  /** `'\r\n'`, `'\n'`, `'\r'`, or `''` for a last line that ends with the file. */
  eol: string
}

/**
 * Which lines changed line ending between the two sides of a diff (FDIF-15).
 *
 * This exists because Monaco cannot answer it. Its models keep their own
 * terminators, but its *diff* normalizes: a CRLF side against a byte-identical
 * LF side reports zero changes (F2 spike, finding 1). So a whole-file flip
 * would read as "nothing changed" unless main compares the raw text itself.
 *
 * Pure. `originalRaw` and `modifiedRaw` are the sides as they were read —
 * `git show`'s or the disk's own bytes, decoded but never normalized.
 *
 * Lines are matched by the run of identical text at the top and at the bottom
 * of the two sides. Whatever the text change itself added or removed sits
 * between those runs and is never reported: a line that is not on both sides
 * has no terminator to have changed.
 */
export function lineEndingChanges(originalRaw: string, modifiedRaw: string): EolChanges {
  const original = splitLines(originalRaw)
  const modified = splitLines(modifiedRaw)
  const lines: number[] = []

  let prefix = 0
  while (
    prefix < original.length &&
    prefix < modified.length &&
    original[prefix].text === modified[prefix].text
  ) {
    if (original[prefix].eol !== modified[prefix].eol) lines.push(prefix + 1)
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < original.length - prefix &&
    suffix < modified.length - prefix &&
    original[original.length - 1 - suffix].text === modified[modified.length - 1 - suffix].text
  ) {
    suffix += 1
  }
  // Counting down keeps the reported numbers ascending, and every one of them
  // is past `prefix`, so no line is reported twice.
  for (let back = suffix; back >= 1; back -= 1) {
    if (original[original.length - back].eol !== modified[modified.length - back].eol) {
      lines.push(modified.length - back + 1)
    }
  }

  return { lines, from: dominantEol(original), to: dominantEol(modified) }
}

/**
 * Both sides of one diff, plus the lines whose terminator changed
 * (FDIF-01..06, 15). Each side is read from wherever its `DiffRef` points: a
 * revision, the working copy, or nowhere at all for a file that does not exist
 * on that side (FDIF-03/04). Because the path lives on the side rather than on
 * the request, a rename reads its original from `oldPath` with nothing special
 * here (FDIF-05).
 *
 * Never throws: a side that could not be read is a `kind` the tab renders.
 */
export async function readDiffSides(
  worktreePath: string,
  request: DiffRequest,
  run: GitRunner = git
): Promise<DiffSides> {
  // When the other side is the disk, read this one as the checkout WOULD have
  // written it, not as the blob stores it (AD-035). Git for Windows ships
  // `core.autocrlf=true` in its system config, so in any worktree without a
  // `.gitattributes` the disk is CRLF and the blob is LF — and comparing the
  // two raw would report an ending change on every line of every file, for a
  // difference git itself undoes on commit.
  const original = await readSide(worktreePath, request.original, run, isDisk(request.modified))
  const modified = await readSide(worktreePath, request.modified, run, isDisk(request.original))
  if (original.kind !== 'text' || modified.kind !== 'text') {
    return { original, modified, eolChanged: [] }
  }
  const eol = lineEndingChanges(original.text, modified.text)
  return { original, modified, eolChanged: eol.lines, eolFrom: eol.from, eolTo: eol.to }
}

/** Is this side the working tree rather than a revision? */
function isDisk(ref: DiffRef | null): boolean {
  return ref !== null && 'disk' in ref
}

/**
 * One side, from its reference. A revision is sized with `git cat-file -s`
 * before anything reads it, so a blob over the cap is reported by its size and
 * nothing reads it (FDIF-06). The cap doubles as the guarantee that what the
 * read does return fits `execFile`'s 1 MiB stdout buffer.
 *
 * `asCheckedOut` picks which bytes a revision yields: `git show` gives the
 * blob's own, `git cat-file --filters` gives what a checkout would write to
 * disk. They differ wherever a filter applies — on Windows, that is every text
 * file under `core.autocrlf` (AD-035).
 */
async function readSide(
  worktreePath: string,
  ref: DiffRef | null,
  run: GitRunner,
  /** Read the blob through the checkout filters, so it matches what is on disk. */
  asCheckedOut = false
): Promise<DiffSide> {
  if (ref === null) return { kind: 'absent' }
  if ('disk' in ref) return readForView(worktreePath, ref.path)
  let size: number
  try {
    const { stdout } = await run(worktreePath, ['cat-file', '-s', `${ref.rev}:${ref.path}`])
    size = Number(stdout.trim())
  } catch (err) {
    return { kind: 'error', message: gitFailureLine(err) }
  }
  if (size > MAX_VIEW_BYTES) return { kind: 'too-large', size }
  try {
    const { stdout } = await run(
      worktreePath,
      asCheckedOut
        ? ['cat-file', '--filters', `${ref.rev}:${ref.path}`]
        : ['show', `${ref.rev}:${ref.path}`]
    )
    // The blob arrives decoded, so the sniff runs over the head re-encoded
    // rather than over git's bytes. A NUL survives the round trip, which is
    // the only byte F1's heuristic looks for.
    if (isBinary(Buffer.from(stdout.slice(0, BINARY_SNIFF_BYTES), 'utf8'))) {
      return { kind: 'binary', size }
    }
    return { kind: 'text', text: stdout, size }
  } catch (err) {
    return { kind: 'error', message: gitFailureLine(err) }
  }
}

/**
 * Added and removed line counts for every file the mode's list holds
 * (FDIF-19/20/24): `merge-base(HEAD, base)` → `HEAD` for diff-to-origin, `HEAD`
 * → the working tree for uncommitted. Full-folder mode has no reference to
 * diff against and gets an empty list, which is also what the All changes tab
 * shows when nothing changed (FDIF-24).
 *
 * Untracked files are counted here because `git diff --numstat` does not report
 * them at all. The uncommitted totals therefore exceed `git diff --shortstat
 * HEAD`, deliberately: the mode's list includes those files, so its header must
 * too. Never throws — a git failure is an empty list, and the base prompt F1
 * already shows is what explains it.
 */
export async function diffStats(
  worktreePath: string,
  mode: FilesMode,
  base?: string
): Promise<FileStat[]> {
  if (mode === 'since-base') {
    if (base === undefined) return []
    try {
      const { stdout: mergeBase } = await git(worktreePath, ['merge-base', 'HEAD', base])
      const { stdout } = await git(worktreePath, [
        'diff',
        '--numstat',
        '-z',
        mergeBase.trim(),
        'HEAD'
      ])
      return parseNumstat(stdout)
    } catch {
      return []
    }
  }
  if (mode === 'uncommitted') {
    let tracked: FileStat[]
    try {
      const { stdout } = await git(worktreePath, ['diff', '--numstat', '-z', 'HEAD'])
      tracked = parseNumstat(stdout)
    } catch {
      return []
    }
    return [...tracked, ...(await untrackedStats(worktreePath))]
  }
  return []
}

/**
 * Parses `git diff --numstat -z`. A record is `added TAB removed TAB path NUL`;
 * a rename replaces the path with nothing and follows with the old path and the
 * new one, each NUL-terminated. `-` for both counts means git found no lines to
 * count, which is what `binary` says.
 *
 * Pure. The two counts are located by their tabs rather than by splitting the
 * record, so a path holding a tab still reads as one path.
 */
export function parseNumstat(stdout: string): FileStat[] {
  const records = stdout.split('\0')
  const stats: FileStat[] = []
  let i = 0
  while (i < records.length) {
    const record = records[i++]
    if (record === '') continue
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (firstTab === -1 || secondTab === -1) continue
    const addedRaw = record.slice(0, firstTab)
    const removedRaw = record.slice(firstTab + 1, secondTab)
    let path = record.slice(secondTab + 1)
    if (path === '') {
      // A rename: the old path, then the new one. The new path is the file the
      // stack shows, matching what `parseNameStatus` puts in the mode's list.
      i += 1
      const renamed = records[i++]
      if (renamed === undefined) break
      path = renamed
    }
    const binary = addedRaw === '-' && removedRaw === '-'
    stats.push({
      path,
      added: binary ? 0 : Number(addedRaw),
      removed: binary ? 0 : Number(removedRaw),
      ...(binary ? { uncountable: 'binary' as const } : {})
    })
  }
  return stats
}

/**
 * Every untracked, not-ignored file counted as wholly added, which is how git
 * would count it once staged. Read through F1's reader, so the 1 MB cap and the
 * NUL sniff apply here too, and each reports which of the two it hit.
 */
async function untrackedStats(worktreePath: string): Promise<FileStat[]> {
  let paths: string[]
  try {
    const { stdout } = await git(worktreePath, ['ls-files', '--others', '--exclude-standard', '-z'])
    paths = stdout.split('\0').filter((p) => p !== '')
  } catch {
    return []
  }
  const stats: FileStat[] = []
  for (const path of paths) {
    const content = await readForView(worktreePath, path)
    if (content.kind === 'text') {
      stats.push({ path, added: splitLines(content.text).length, removed: 0 })
    } else if (content.kind === 'binary' || content.kind === 'too-large') {
      // The reason travels with the file. Collapsing both into one flag made a
      // 2 MB text file read "Binary file" in the stack while its own tab said
      // "Too large to display" — the same file under two names.
      stats.push({ path, added: 0, removed: 0, uncountable: content.kind })
    }
  }
  return stats
}

/**
 * Splits raw text into lines, keeping each line's own terminator. A trailing
 * terminator ends the last line rather than starting an empty one, so `'a\n'`
 * is one line and `'a\nb'` is two.
 */
function splitLines(raw: string): RawLine[] {
  const lines: RawLine[] = []
  let start = 0
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\n') {
      lines.push({ text: raw.slice(start, i), eol: '\n' })
      i += 1
    } else if (ch === '\r') {
      const crlf = raw[i + 1] === '\n'
      lines.push({ text: raw.slice(start, i), eol: crlf ? '\r\n' : '\r' })
      i += crlf ? 2 : 1
    } else {
      i += 1
      continue
    }
    start = i
  }
  if (start < raw.length) lines.push({ text: raw.slice(start), eol: '' })
  return lines
}

/** The terminator most of a side's lines use — what the strip names (FDIF-15). */
function dominantEol(lines: RawLine[]): Eol | undefined {
  let crlf = 0
  let lf = 0
  let cr = 0
  for (const line of lines) {
    if (line.eol === '\r\n') crlf += 1
    else if (line.eol === '\n') lf += 1
    else if (line.eol === '\r') cr += 1
  }
  if (crlf === 0 && lf === 0 && cr === 0) return undefined
  if (crlf >= lf && crlf >= cr) return 'CRLF'
  if (lf >= cr) return 'LF'
  return 'CR'
}
