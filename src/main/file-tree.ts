import type {
  BaseOptions,
  ChangedListing,
  ChangedPath,
  DirListing,
  FileEntry
} from '../shared/files'
import type { ChangeStatus } from '../shared/worktrees'
import { git, gitFailureLine, type GitRunner } from './git'

/**
 * One folder of a worktree as the Files tree shows it (FXPL-04/05): tracked
 * files plus untracked files `.gitignore` does not exclude, as the folder's
 * direct children. `dir` is worktree-relative, `''` for the root. Never
 * throws: a git failure comes back as `error` and the tree renders that line
 * instead of an empty folder.
 *
 * **Asks git for one level, not for the subtree.** `git ls-files --cached`
 * lists every tracked *descendant*, so drawing twenty rows meant reading every
 * path under them. On a repository of ~47,000 files that is 4.6 MB for the
 * root — past `execFile`'s 1 MiB stdout buffer, so the mode showed nothing at
 * all but "stdout maxBuffer length exceeded" — and 4.2 MB for a single
 * top-level folder, which no pathspec avoided. `ls-tree` answers at one level:
 * measured on that repository, the same folder is **1.9 kB and 0.11 s**
 * against **4.2 MB and 1.5 s**.
 *
 * Three reads, in parallel:
 *
 * 1. `ls-tree HEAD:<dir>` — what the commit holds at this level, typed.
 * 2. `diff --cached HEAD` — what the index changed since, so a file staged but
 *    not yet committed appears and one staged for deletion does not.
 * 3. `ls-files --others` — untracked, exactly as before.
 *
 * `allSettled`, not `all`: `all` returns on the first rejection and leaves its
 * siblings running, and an abandoned git process holding the worktree open is
 * a Windows hazard this codebase has already been bitten by.
 */
export async function listDir(
  worktreePath: string,
  dir: string,
  run: GitRunner = git
): Promise<DirListing> {
  const folder = dir.replace(/\/+$/, '')
  const prefix = folder === '' ? '' : `${folder}/`
  const pathspec = folder === '' ? [] : ['--', `${folder}/`]

  const [tree, staged, others] = await Promise.allSettled([
    run(worktreePath, ['ls-tree', '-z', `HEAD:${folder}`]),
    run(worktreePath, ['diff', '--cached', '--name-status', '-z', 'HEAD', ...pathspec]),
    run(worktreePath, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '--directory',
      '-z',
      ...pathspec
    ])
  ])

  // The untracked read is the one that works in every repository state — an
  // unborn HEAD included — so its failure is the repository's, and the only
  // one worth reporting. The other two fail routinely and harmlessly: before
  // the first commit, and on a folder that exists only on disk.
  if (others.status === 'rejected') {
    return { entries: [], error: gitFailureLine(others.reason) }
  }

  const byName = new Map<string, FileEntry>()
  if (tree.status === 'fulfilled') {
    for (const entry of parseTreeLevel(tree.value.stdout, prefix)) {
      byName.set(entry.name, entry)
    }
  }
  if (staged.status === 'fulfilled') {
    applyIndexDelta(byName, staged.value.stdout, prefix)
  }
  for (const entry of foldChildren(
    others.value.stdout.split('\0').filter((path) => path !== ''),
    folder
  )) {
    if (!byName.has(entry.name)) byName.set(entry.name, entry)
  }

  return { entries: [...byName.values()].sort(compareEntries) }
}

/**
 * Parses `git ls-tree -z`: one NUL-terminated record per direct child, each
 * `<mode> SP <type> SP <object> TAB <path>`. `-z` leaves the path raw, so a
 * name with a quote or a non-ASCII character arrives as written.
 *
 * Pure. The path is located by its tab rather than by splitting the record, so
 * a name holding a space is one name.
 */
export function parseTreeLevel(stdout: string, prefix: string): FileEntry[] {
  const entries: FileEntry[] = []
  for (const record of stdout.split('\0')) {
    if (record === '') continue
    const tab = record.indexOf('\t')
    if (tab === -1) continue
    const type = record.slice(0, tab).split(' ')[1]
    const name = record.slice(tab + 1)
    if (name === '') continue
    // A commit object is a submodule: it is a folder on disk, and the tree
    // lists nothing under it, which is exactly how it should read.
    const kind = type === 'blob' ? 'file' : 'dir'
    entries.push({ name, path: `${prefix}${name}`, kind })
  }
  return entries
}

/**
 * Applies `git diff --cached --name-status -z HEAD` to one level's children,
 * so the listing shows the index rather than the last commit: a file staged
 * but not committed appears, and one staged for deletion does not.
 *
 * A deletion only removes an entry when the deleted path IS a direct child.
 * Deeper down it says nothing about whether the folder still holds anything
 * else, and reading that would cost the subtree this function exists to avoid.
 */
export function applyIndexDelta(
  byName: Map<string, FileEntry>,
  stdout: string,
  prefix: string
): void {
  const fields = stdout.split('\0').filter((field) => field !== '')
  let i = 0
  while (i < fields.length) {
    const code = fields[i++]
    const letter = code[0]
    // A rename or a copy spells two paths: the source, then the destination.
    const from = fields[i++]
    if (from === undefined) break
    const to = letter === 'R' || letter === 'C' ? fields[i++] : undefined
    if (letter === 'R' || letter === 'C') {
      if (to === undefined) break
      if (letter === 'R') remove(byName, from, prefix)
      add(byName, to, prefix)
      continue
    }
    if (letter === 'D') remove(byName, from, prefix)
    else add(byName, from, prefix)
  }
}

/** Puts the direct child of `prefix` that `path` lies under into the listing. */
function add(byName: Map<string, FileEntry>, path: string, prefix: string): void {
  if (!path.startsWith(prefix)) return
  const rest = path.slice(prefix.length)
  if (rest === '') return
  const cut = rest.indexOf('/')
  const name = cut === -1 ? rest : rest.slice(0, cut)
  if (byName.has(name)) return
  byName.set(name, { name, path: `${prefix}${name}`, kind: cut === -1 ? 'file' : 'dir' })
}

/** Drops a direct child of `prefix`; a deeper path leaves the folder alone. */
function remove(byName: Map<string, FileEntry>, path: string, prefix: string): void {
  if (!path.startsWith(prefix)) return
  const rest = path.slice(prefix.length)
  if (rest === '' || rest.includes('/')) return
  byName.delete(rest)
}

/**
 * Folds `git ls-files` output into one level of children of `dir`. Two shapes
 * arrive: `--cached` lists every tracked *descendant* (`src/a/f.ts` under
 * `src`), while `--directory` collapses a wholly untracked folder to a single
 * `newdir/`. Both become one entry per direct child, folders first, then
 * alphabetical, case-insensitive.
 */
export function foldChildren(paths: string[], dir: string): FileEntry[] {
  const folder = dir.replace(/\/+$/, '')
  const prefix = folder === '' ? '' : `${folder}/`
  const byName = new Map<string, FileEntry>()
  for (const path of paths) {
    if (!path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    if (rest === '') continue
    const cut = rest.indexOf('/')
    if (cut === -1) {
      byName.set(rest, { name: rest, path: `${prefix}${rest}`, kind: 'file' })
      continue
    }
    const name = rest.slice(0, cut)
    // `newdir/` — the whole folder is untracked; anything deeper is a tracked
    // descendant, so the folder itself is not.
    const untracked = rest === `${name}/`
    const existing = byName.get(name)
    if (existing && !untracked) continue
    byName.set(name, {
      name,
      path: `${prefix}${name}`,
      kind: 'dir',
      ...(untracked ? { untracked: true } : {})
    })
  }
  return [...byName.values()].sort(compareEntries)
}

/**
 * What the branch committed since it left its base (FXPL-08): the merge-base
 * with `base`, then the diff from there to HEAD. Committed changes only —
 * uncommitted work is the other mode's subject. A base that no longer exists
 * comes back as `mergeBase: null` with git's error line (edge case).
 */
export async function changedSince(worktreePath: string, base: string): Promise<ChangedListing> {
  let mergeBase: string
  try {
    const { stdout } = await git(worktreePath, ['merge-base', 'HEAD', base])
    mergeBase = stdout.trim()
  } catch (err) {
    return { mergeBase: null, files: [], error: gitFailureLine(err) }
  }
  try {
    const { stdout } = await git(worktreePath, ['diff', '--name-status', '-z', mergeBase, 'HEAD'])
    return { mergeBase, files: parseNameStatus(stdout) }
  } catch (err) {
    return { mergeBase, files: [], error: gitFailureLine(err) }
  }
}

/**
 * Parses `git diff --name-status -z`: NUL-separated fields, a status letter
 * followed by one path, or a scored `R100` / `C75` followed by the old path
 * and the new one. Statuses land in the `ChangeStatus` vocabulary the
 * uncommitted mode already uses, so the tree labels both diff modes alike.
 */
export function parseNameStatus(stdout: string): ChangedPath[] {
  const fields = stdout.split('\0').filter((f) => f !== '')
  const files: ChangedPath[] = []
  let i = 0
  while (i < fields.length) {
    const code = fields[i++]
    const letter = code[0]
    if (letter === 'R' || letter === 'C') {
      const oldPath = fields[i++]
      const path = fields[i++]
      if (path === undefined) break
      // A copy is a new file that happens to have a source; only a rename is renamed.
      files.push({ path, status: letter === 'R' ? 'renamed' : 'added', oldPath })
      continue
    }
    const path = fields[i++]
    if (path === undefined) break
    files.push({ path, status: statusOf(letter) })
  }
  return files
}

/**
 * What the base picker offers (FXPL-09/10/11): `origin/HEAD`'s target as the
 * default, every local and remote branch as the choices. A repo without an
 * `origin/HEAD` gets `defaultBase: null` — the picker then asks for a base
 * rather than the app guessing one.
 */
export async function listBases(worktreePath: string): Promise<BaseOptions> {
  let defaultBase: string | null = null
  try {
    const { stdout } = await git(worktreePath, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD'
    ])
    defaultBase = stdout.trim() || null
  } catch {
    defaultBase = null
  }
  try {
    const { stdout } = await git(worktreePath, [
      'for-each-ref',
      '--format=%(refname:short)%09%(symref)',
      'refs/heads',
      'refs/remotes'
    ])
    const branches = stdout
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => line.split('\t'))
      // `%(symref)` is non-empty only for a symbolic ref: `origin/HEAD` points
      // at a branch already listed beside it, and shortens to plain `origin`.
      .filter(([, symref]) => !symref)
      .map(([name]) => name.trim())
    return { defaultBase, branches }
  } catch (err) {
    // AD-032: a failure is not an empty list. The picker shows this line instead
    // of inviting a choice it cannot offer.
    return { defaultBase, branches: [], error: gitFailureLine(err) }
  }
}

/** A type change (`T`) is a modification as far as the tree is concerned. */
function statusOf(letter: string): ChangeStatus {
  switch (letter) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    default:
      return 'modified'
  }
}

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  const lower = a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  return lower !== 0 ? lower : a.name.localeCompare(b.name)
}
