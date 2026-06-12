export const DEFAULT_BRANCH_TEMPLATE = '{type}/{id}-{slug}'

/** PRD §What is hard-coded: Bug → bugfix, everything else → feature. */
function branchTypeOf(type: string): string {
  return type.toLowerCase() === 'bug' ? 'bugfix' : 'feature'
}

/** Title → slug: lowercased, non-alphanumeric runs collapse to '-', ends trimmed. */
function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * PRD branch template rendering (STWK-01). Unknown placeholders pass through
 * literally; a blank template falls back to the default. An empty {slug} can
 * leave '-' dangling at a path-segment edge — trimmed per segment.
 */
export function branchNameFor(
  task: { id: number; details: WorkItemDetails },
  template: string | null
): string {
  return (template?.trim() || DEFAULT_BRANCH_TEMPLATE)
    .replaceAll('{type}', branchTypeOf(task.details.type))
    .replaceAll('{id}', String(task.id))
    .replaceAll('{slug}', slugOf(task.details.title))
    .split('/')
    .map((segment) => segment.replace(/^-+|-+$/g, ''))
    .filter((segment) => segment !== '')
    .join('/')
}

/**
 * PRD task-ID extraction (STWK-01): the first standalone multi-digit number —
 * 2+ digits not adjacent to a letter or digit, so `oauth2` and sha-like
 * `abc1234` never tag a worktree.
 */
export function taskIdFromBranch(branch: string): number | null {
  const match = /(?<![A-Za-z0-9])\d{2,}(?![A-Za-z0-9])/.exec(branch)
  return match ? Number(match[0]) : null
}

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
