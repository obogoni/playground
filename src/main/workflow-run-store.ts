import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { WorkflowRun } from '../shared/workflows'

/**
 * Ephemeral per-run persistence (WF2-16): one JSON file per run, rewritten
 * atomically (tmp file + rename) on every `save`, mirroring `ConfigStore`'s
 * atomic-write discipline. The directory is injected
 * (`app.getPath('userData')/workflow-runs` in production, a temp dir in tests)
 * so the module has no Electron dependency.
 *
 * No TTL/cleanup in v1 — files accumulate; run state is not required to survive
 * an app restart.
 */
export class WorkflowRunStore {
  constructor(private readonly dir: string) {}

  private pathFor(runId: string): string {
    return join(this.dir, `${runId}.json`)
  }

  /** Atomically (over)write the run's JSON file. Best-effort: logs and continues. */
  save(run: WorkflowRun): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      const filePath = this.pathFor(run.runId)
      const tmpPath = `${filePath}.tmp`
      writeFileSync(tmpPath, JSON.stringify(run, null, 2) + '\n', 'utf8')
      renameSync(tmpPath, filePath)
    } catch (err) {
      // Persistence is best-effort: the in-memory run stays authoritative even
      // when the disk write fails (à la ConfigStore.persist).
      console.error(`Failed to persist workflow run ${run.runId}:`, err)
    }
  }

  /** The persisted run, or `null` when no file exists / it is unreadable. */
  load(runId: string): WorkflowRun | null {
    const filePath = this.pathFor(runId)
    if (!existsSync(filePath)) return null
    try {
      return JSON.parse(readFileSync(filePath, 'utf8')) as WorkflowRun
    } catch (err) {
      console.error(`Failed to read workflow run ${runId}:`, err)
      return null
    }
  }

  /** Every persisted run under the directory (unordered); `[]` if none. */
  list(): WorkflowRun[] {
    if (!existsSync(this.dir)) return []
    const runs: WorkflowRun[] = []
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue
      const run = this.load(name.slice(0, -'.json'.length))
      if (run) runs.push(run)
    }
    return runs
  }
}
