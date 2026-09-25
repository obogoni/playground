import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { OpenPeriod, TimePeriod } from '../shared/time'

/** Line format version; a line with any other `v` is skipped like an invalid one. */
const VERSION = 1

type Log = (...args: unknown[]) => void

const isStringOrNull = (value: unknown): boolean => value === null || typeof value === 'string'

/** A parsed log line is a period when every field has its declared type. */
function isPeriodLine(value: unknown): value is TimePeriod & { v: number } {
  if (value === null || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    p.v === VERSION &&
    ['id', 'sessionId', 'agent', 'cwd', 'start', 'end'].every((k) => typeof p[k] === 'string') &&
    ['workspacePath', 'repoName', 'branch', 'taskTitle'].every((k) => isStringOrNull(p[k])) &&
    (p.taskId === null || typeof p.taskId === 'number')
  )
}

/**
 * The only file I/O for time data (<dir>/time-log.jsonl + <dir>/time-open.json).
 * The log holds closed periods, one versioned JSON line each; the sidecar holds
 * the open periods and is rewritten on every heartbeat. Whole-file writes are
 * atomic (tmp + rename), mirroring `ConfigStore`. Failures are logged, never
 * thrown: the tracker's in-memory state stays authoritative (TIME-14).
 *
 * The directory is injected (`app.getPath('userData')` in production, a temp dir
 * in tests), so the module has no Electron dependency.
 */
export class TimeLogStore {
  private readonly logPath: string
  private readonly openPath: string
  /** Appends that failed, retried before the next write. */
  private pending: TimePeriod[] = []
  /** The full list of a rewrite that failed; until it lands, every append rewrites instead. */
  private unwritten: TimePeriod[] | null = null

  constructor(
    private readonly dir: string,
    private readonly log: Log = console.error
  ) {
    this.logPath = join(dir, 'time-log.jsonl')
    this.openPath = join(dir, 'time-open.json')
  }

  /** Every valid closed period; invalid lines are skipped, counted and logged once (TIME-13). */
  readPeriods(): { periods: TimePeriod[]; skipped: number } {
    if (!existsSync(this.logPath)) return { periods: [], skipped: 0 }
    const periods: TimePeriod[] = []
    let skipped = 0
    for (const line of readFileSync(this.logPath, 'utf8').split(/\r?\n/)) {
      if (line.trim() === '') continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        parsed = undefined
      }
      if (isPeriodLine(parsed)) {
        const { v: _v, ...period } = parsed
        void _v
        periods.push(period)
      } else {
        skipped++
      }
    }
    if (skipped > 0) this.log(`Time log: skipped ${skipped} invalid line(s) in ${this.logPath}`)
    return { periods, skipped }
  }

  /** Appends one period; on failure it is queued and retried with the next write (TIME-14). */
  append(period: TimePeriod): void {
    // After a failed rewrite the file on disk is stale: appending to it would
    // bring a deleted or edited period back on the next start (TIME-14).
    if (this.unwritten !== null) {
      this.rewrite([...this.unwritten, period])
      return
    }
    const batch = [...this.pending, period]
    try {
      mkdirSync(this.dir, { recursive: true })
      appendFileSync(this.logPath, batch.map((p) => this.#line(p)).join(''), 'utf8')
      this.pending = []
    } catch (err) {
      this.pending = batch
      this.log('Failed to append to the time log:', err)
    }
  }

  /** Replaces the whole log atomically (TIME-48). `periods` is the full list, queued appends
   * included; on failure it is kept and written by the next append or rewrite (TIME-14). */
  rewrite(periods: TimePeriod[]): void {
    try {
      this.#atomicWrite(this.logPath, periods.map((p) => this.#line(p)).join(''))
      this.pending = []
      this.unwritten = null
    } catch (err) {
      this.pending = []
      this.unwritten = periods
      this.log('Failed to rewrite the time log:', err)
    }
  }

  /** Open periods left by the last run; a corrupt sidecar is backed up and read as empty. */
  readOpen(): OpenPeriod[] {
    if (!existsSync(this.openPath)) return []
    try {
      const parsed = JSON.parse(readFileSync(this.openPath, 'utf8'))
      if (!Array.isArray(parsed)) throw new Error('time-open.json is not an array')
      return parsed as OpenPeriod[]
    } catch (err) {
      const backupPath = `${this.openPath}.bak-${Date.now()}`
      this.log(`Open periods file unreadable, backing up to ${backupPath}:`, err)
      try {
        renameSync(this.openPath, backupPath)
      } catch (renameErr) {
        this.log('Failed to back up the corrupt open periods file:', renameErr)
      }
      return []
    }
  }

  /** Rewrites the sidecar atomically; `[]` writes an empty array (TIME-04). */
  writeOpen(open: OpenPeriod[]): void {
    try {
      this.#atomicWrite(this.openPath, JSON.stringify(open) + '\n')
    } catch (err) {
      this.log('Failed to write the open periods file:', err)
    }
  }

  #line(period: TimePeriod): string {
    return JSON.stringify({ v: VERSION, ...period }) + '\n'
  }

  #atomicWrite(path: string, content: string): void {
    mkdirSync(this.dir, { recursive: true })
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, content, 'utf8')
    renameSync(tmpPath, path)
  }
}
