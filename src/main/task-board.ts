import type { AppConfig } from '../shared/config'
import type {
  AdoAuthState,
  PinnedTask,
  PinTaskResult,
  TasksSnapshot,
  WorkItemDetails
} from '../shared/tasks'
import type { GetWorkItemsResult, WorkItemRef } from './ado-gateway'
import { refKey } from './ado-gateway'
import type { ConfigStore } from './config-store'

/** The slice of AdoGateway TaskBoard depends on — tests inject a stub. */
export interface WorkItemSource {
  getWorkItems(refs: WorkItemRef[]): Promise<GetWorkItemsResult>
}

type ParseResult = { ok: true; ref: PinnedTask } | { ok: false; error: string }

/**
 * Parses the add-row input: a bare numeric ID (resolved against the config
 * defaults) or a full `dev.azure.com/<org>/<project>/_workitems/edit/<id>`
 * URL, tolerating title slugs, query strings, and percent-encoded names.
 */
export function parseTaskInput(
  input: string,
  defaults: Pick<AppConfig['ado'], 'defaultOrg' | 'defaultProject'>
): ParseResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, error: 'Paste a work item ID or ADO URL.' }

  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed)
    if (id === 0) return { ok: false, error: 'Not a valid work item ID.' }
    const { defaultOrg, defaultProject } = defaults
    if (!defaultOrg || !defaultProject) {
      return {
        ok: false,
        error:
          'No default org/project configured — paste the full ADO URL, or set ado.defaultOrg and ado.defaultProject in config.json.'
      }
    }
    return { ok: true, ref: makeRef(defaultOrg, defaultProject, id) }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, error: 'Not a work item ID or ADO URL.' }
  }
  if (url.hostname !== 'dev.azure.com') {
    return { ok: false, error: 'Only dev.azure.com work item URLs are supported.' }
  }
  // /<org>/<project>/_workitems/edit/<id>[/<title-slug>]
  const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (segments[2] !== '_workitems' || segments[3] !== 'edit' || !/^\d+$/.test(segments[4] ?? '')) {
    return { ok: false, error: 'Unrecognized ADO URL — expected …/_workitems/edit/<id>.' }
  }
  return { ok: true, ref: makeRef(segments[0], segments[1], Number(segments[4])) }
}

function makeRef(org: string, project: string, id: number): PinnedTask {
  const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${id}`
  return { id, org, project, url }
}

function sameRef(a: WorkItemRef, b: WorkItemRef): boolean {
  return a.id === b.id && a.org === b.org && a.project === b.project
}

/**
 * Owns the pinned task list (PRD TaskBoard, pin/unpin half — template
 * rendering and branch-ID extraction arrive with start-work). Pins persist via
 * ConfigStore; live details stay in this session's memory cache and are
 * replaced wholesale on refresh so deleted items degrade to id-only.
 */
export class TaskBoard {
  private details = new Map<string, WorkItemDetails>()
  private auth: AdoAuthState = 'unknown'
  private lastSyncAt: number | null = null

  constructor(
    private readonly config: ConfigStore,
    private readonly source: WorkItemSource
  ) {}

  /** Pins merged with whatever details the session has — no network. */
  list(): TasksSnapshot {
    return {
      tasks: this.config.get().pinnedTasks.map((task) => ({
        ...task,
        details: this.details.get(refKey(task)) ?? null
      })),
      auth: this.auth,
      lastSyncAt: this.lastSyncAt
    }
  }

  /** Parses, validates against ADO (no dead cards — spec §Decisions), then persists. */
  async pin(input: string): Promise<PinTaskResult> {
    const { ado, pinnedTasks } = this.config.get()
    const parsed = parseTaskInput(input, ado)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    const ref = parsed.ref
    if (pinnedTasks.some((task) => sameRef(task, ref))) {
      return { ok: false, error: `#${ref.id} is already pinned.` }
    }

    const fetched = await this.source.getWorkItems([ref])
    if (!fetched.ok) {
      this.auth = 'failed'
      return { ok: false, error: 'Could not reach Azure DevOps — run az login and try again.' }
    }
    this.auth = 'ok'
    const detail = fetched.details.get(refKey(ref))
    if (!detail) {
      return { ok: false, error: `Work item #${ref.id} not found in ${ref.org}/${ref.project}.` }
    }

    this.details.set(refKey(ref), detail)
    this.lastSyncAt = Date.now()
    this.config.patch({ pinnedTasks: [...pinnedTasks, ref] })
    return { ok: true, snapshot: this.list() }
  }

  unpin(ref: WorkItemRef): TasksSnapshot {
    const remaining = this.config.get().pinnedTasks.filter((task) => !sameRef(task, ref))
    this.config.patch({ pinnedTasks: remaining })
    this.details.delete(refKey(ref))
    return this.list()
  }

  /** Re-fetches every pin (app focus + manual refresh, PNTK-05). */
  async refresh(): Promise<TasksSnapshot> {
    const { pinnedTasks } = this.config.get()
    if (pinnedTasks.length === 0) return this.list()
    const fetched = await this.source.getWorkItems(pinnedTasks)
    if (!fetched.ok) {
      this.auth = 'failed'
      return this.list()
    }
    this.auth = 'ok'
    this.lastSyncAt = Date.now()
    this.details = fetched.details
    return this.list()
  }
}
