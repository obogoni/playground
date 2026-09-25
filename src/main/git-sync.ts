import { readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { CommitLine, CommitLists, GitOp, GitOpResult, SyncState } from '../shared/git'
import { git, gitFailureLine, isTimeout } from './git'

/** The ceiling on one network operation before it is killed and reported as a timeout (STBR-24). */
export const OP_TIMEOUT_MS = 120_000

/** The sync section's line for a worktree whose folder was deleted (spec edge case). */
export const MISSING_FOLDER = 'The worktree folder no longer exists'

/** Worktree paths with an operation in flight — at most one per worktree (STBR-28). */
const running = new Set<string>()

/**
 * Run one sync-popover operation (STBR-17–21). `sync` is `pull --ff-only`
 * then `push`, and the push never runs when the pull failed. Never throws: a
 * failure carries git's error line, a timeout sets `timedOut` (STBR-24), and a
 * second call for a worktree already running resolves `busy` without spawning
 * git (STBR-28). `timeoutMs` exists so tests need not wait 120 s.
 */
export async function runGitOp(
  worktreePath: string,
  op: GitOp,
  remote?: string,
  timeoutMs = OP_TIMEOUT_MS
): Promise<GitOpResult> {
  if (running.has(worktreePath)) return { ok: false, busy: true }
  running.add(worktreePath)
  const run = (args: string[]): Promise<{ stdout: string }> =>
    git(worktreePath, args, { timeoutMs })
  // `--no-rebase` keeps a `pull.rebase=true` (Git for Windows sets it system-wide
  // by default) from turning the pull into a rebase, which refuses a dirty tree
  // with its own message before `--ff-only` is ever consulted.
  const pull = ['pull', '--ff-only', '--no-rebase']
  try {
    switch (op) {
      case 'sync':
        await run(pull)
        await run(['push'])
        break
      case 'pull':
        await run(pull)
        break
      case 'push':
        await run(['push'])
        break
      case 'fetch': {
        // Only the current branch's upstream remote and branch (STBR-21).
        const branch = await currentBranch(worktreePath)
        const upstreamRemote = await configValue(worktreePath, `branch.${branch}.remote`)
        const merge = await configValue(worktreePath, `branch.${branch}.merge`)
        await run(['fetch', upstreamRemote, merge.replace(/^refs\/heads\//, '')])
        break
      }
      case 'publish': {
        const target = remote ?? (await soleRemote(worktreePath))
        if (target === null) {
          // STBR-20: with several remotes a default could push to someone else's upstream.
          return { ok: false, error: 'Choose the remote to publish to.' }
        }
        await run(['push', '-u', target, await currentBranch(worktreePath)])
        break
      }
    }
    return { ok: true }
  } catch (err) {
    return isTimeout(err)
      ? { ok: false, timedOut: true, error: `Timed out after ${timeoutMs / 1000} s.` }
      : { ok: false, error: errorLine(err) }
  } finally {
    running.delete(worktreePath)
  }
}

/**
 * Git's first `fatal:`/`error:` stderr line, else `gitFailureLine`.
 * SPEC_DEVIATION: the design names `gitFailureLine` for every failure.
 * Reason: `pull` and `push` write progress (`From …`, `To …`) and `hint:`
 * lines to stderr before the error, so the first line is not git's error
 * line that STBR-18 requires (measured with git 2.55 on a diverged pull).
 */
function errorLine(err: unknown): string {
  const stderr = (err as { stderr?: string }).stderr ?? ''
  const line = stderr.split(/\r?\n/).find((l) => /^(fatal|error):/.test(l.trim()))
  return line?.trim() ?? gitFailureLine(err)
}

async function currentBranch(worktreePath: string): Promise<string> {
  return (await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
}

async function configValue(worktreePath: string, key: string): Promise<string> {
  return (await git(worktreePath, ['config', '--get', key])).stdout.trim()
}

/** The only remote when there is exactly one — publishing needs no choice then (STBR-19). */
async function soleRemote(worktreePath: string): Promise<string | null> {
  const remotes = (await git(worktreePath, ['remote'])).stdout.split(/\r?\n/).filter(Boolean)
  return remotes.length === 1 ? remotes[0] : null
}

/** Unit separator between `%h`, `%s` and `%ct` — a byte no commit subject carries. */
const FIELD = '\x1f'
const LOG_FORMAT = '--format=%h%x1f%s%x1f%ct'

/**
 * One `CommitLine` per `%h%x1f%s%x1f%ct` line (STBR-16). The subject is
 * everything between the first and the last separator, so it survives any
 * character it contains; `%ct` is epoch seconds.
 */
export function parseCommitLines(stdout: string): CommitLine[] {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line !== '')
    .map((line) => {
      const first = line.indexOf(FIELD)
      const last = line.lastIndexOf(FIELD)
      return {
        sha: line.slice(0, first),
        subject: line.slice(first + 1, last),
        at: Number(line.slice(last + 1)) * 1000
      }
    })
}

/**
 * The commits a pull would bring in (`HEAD..@{upstream}`) and a push would
 * send (`@{upstream}..HEAD`), `limit` each, with exact counts of the rest from
 * `rev-list --count` (STBR-15/16). A branch without an upstream — or any git
 * failure, which `readSyncState` already reports — yields two empty lists.
 */
export async function readCommits(worktreePath: string, limit = 20): Promise<CommitLists> {
  const side = async (range: string): Promise<{ lines: CommitLine[]; more: number }> => {
    const log = await git(worktreePath, ['log', LOG_FORMAT, '-n', String(limit), range])
    const count = await git(worktreePath, ['rev-list', '--count', range])
    const lines = parseCommitLines(log.stdout)
    return { lines, more: Number(count.stdout.trim()) - lines.length }
  }
  try {
    const incoming = await side('HEAD..@{upstream}')
    const outgoing = await side('@{upstream}..HEAD')
    return {
      incoming: incoming.lines,
      outgoing: outgoing.lines,
      moreIncoming: incoming.more,
      moreOutgoing: outgoing.more
    }
  } catch {
    return { incoming: [], outgoing: [], moreIncoming: 0, moreOutgoing: 0 }
  }
}

/**
 * `rev-list --count --left-right @{upstream}...HEAD` prints `behind<TAB>ahead`:
 * the left side counts commits only the upstream has, the right side commits
 * only HEAD has (STBR-09).
 */
export function parseAheadBehind(stdout: string): { behind: number; ahead: number } {
  const [behind, ahead] = stdout.trim().split(/\s+/).map(Number)
  return { behind, ahead }
}

/**
 * Where a worktree stands against its upstream, from local refs only — this
 * never touches the network (STBR-09/10). Never throws: a git failure lands in
 * `error` alongside whatever was already read (STBR-14).
 */
export async function readSyncState(worktreePath: string): Promise<SyncState> {
  const state: SyncState = {
    branch: null,
    upstream: null,
    behind: 0,
    ahead: 0,
    remotes: [],
    lastFetchAt: null
  }
  // Without the folder, git cannot even start in it and Node reports
  // `spawn git ENOENT`, which reads as if git were missing.
  if (
    !(await stat(worktreePath).then(
      (s) => s.isDirectory(),
      () => false
    ))
  ) {
    return { ...state, missing: true, error: MISSING_FOLDER }
  }
  try {
    const head = (await git(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim()
    if (head === 'HEAD') {
      state.detachedSha = (await git(worktreePath, ['rev-parse', '--short', 'HEAD'])).stdout.trim()
    } else {
      state.branch = head
    }
    state.remotes = (await git(worktreePath, ['remote'])).stdout.split(/\r?\n/).filter(Boolean)
    state.lastFetchAt = await lastFetchAt(worktreePath)
    if (state.branch !== null) await readUpstream(worktreePath, state)
  } catch (err) {
    state.error = gitFailureLine(err)
  }
  return state
}

/**
 * A branch without an upstream makes `rev-list` fail with `no upstream
 * configured` — that failure, not a zero count, is the no-upstream signal
 * (STBR-12). Any other failure (e.g. an upstream ref deleted locally) throws.
 */
async function readUpstream(worktreePath: string, state: SyncState): Promise<void> {
  let counts: string
  try {
    counts = (
      await git(worktreePath, ['rev-list', '--count', '--left-right', '@{upstream}...HEAD'])
    ).stdout
  } catch (err) {
    if (/no upstream configured/.test(gitFailureLine(err))) return
    throw err
  }
  Object.assign(state, parseAheadBehind(counts))
  state.upstream = (
    await git(worktreePath, ['rev-parse', '--abbrev-ref', '@{upstream}'])
  ).stdout.trim()
}

/**
 * The repo's most recent fetch (STBR-22). Git writes `FETCH_HEAD` into the git
 * dir of the worktree that fetched — the common dir for the primary checkout,
 * `<common>/worktrees/<name>` for a linked one — while the remote refs a fetch
 * updates are shared by every worktree, so the age is the newest of them all.
 * Git prints the common dir relative (`.git`) in a primary checkout, so it is
 * resolved against the worktree before the stat.
 */
async function lastFetchAt(worktreePath: string): Promise<number | null> {
  const commonDir = resolve(
    worktreePath,
    (await git(worktreePath, ['rev-parse', '--git-common-dir'])).stdout.trim()
  )
  const linked = await readdir(join(commonDir, 'worktrees')).catch(() => [] as string[])
  const candidates = [commonDir, ...linked.map((name) => join(commonDir, 'worktrees', name))]
  const times = await Promise.all(
    candidates.map((dir) =>
      stat(join(dir, 'FETCH_HEAD')).then(
        (s) => s.mtimeMs,
        () => null
      )
    )
  )
  const known = times.filter((t): t is number => t !== null)
  return known.length > 0 ? Math.max(...known) : null
}
