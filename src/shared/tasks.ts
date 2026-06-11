/** Persisted pin (PRD §Data model): identity is org/project/id; details stay live. */
export interface PinnedTask {
  id: number
  org: string
  project: string
  /** Canonical work item URL — `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`. */
  url: string
}

/** Live work item details — main-process memory cache only, never persisted. */
export interface WorkItemDetails {
  title: string
  type: string
  state: string
}

/** A pin as the renderer sees it; details are null until a fetch resolves them. */
export interface PinnedTaskView extends PinnedTask {
  details: WorkItemDetails | null
}

/** 'unknown' until the first fetch attempt of the session. */
export type AdoAuthState = 'ok' | 'failed' | 'unknown'

/** Pinned set + session fetch status, as served over the tasks:* channels. */
export interface TasksSnapshot {
  tasks: PinnedTaskView[]
  auth: AdoAuthState
  /** Epoch ms of the last successful details fetch this session. */
  lastSyncAt: number | null
}

/** Result of tasks:pin — failures (parse, duplicate, auth, not-found) are returned, never thrown. */
export interface PinTaskResult {
  ok: boolean
  /** Updated snapshot, present when ok is true. */
  snapshot?: TasksSnapshot
  /** Human-readable failure message, present when ok is false. */
  error?: string
}
