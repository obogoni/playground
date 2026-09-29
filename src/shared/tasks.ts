export const DEFAULT_BRANCH_TEMPLATE = '{type}/{id}-{slug}'

/** PRD §What is hard-coded: Bug → bugfix, everything else → feature. */
function branchTypeOf(type: string): string {
  return type.toLowerCase() === 'bug' ? 'bugfix' : 'feature'
}

/** Title → slug: accented chars transliterated (NFD, diacritics stripped),
 * lowercased, non-alphanumeric runs collapse to '-', ends trimmed. */
function slugOf(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * PRD branch template rendering (STWK-01, TEMPLATE-01..06). Unknown
 * placeholders pass through literally; a blank template falls back to the
 * default. `{dev}`/`{usId}`/`{usSlug}` come from the optional context — the
 * developer alias and the parent US of the task — and render empty when absent,
 * so empty path segments are dropped per segment. An empty {slug} can leave '-'
 * dangling at a path-segment edge — trimmed per segment.
 */
export function branchNameFor(
  task: { id: number; details: WorkItemDetails },
  template: string | null,
  ctx?: { devAlias?: string; parent?: { id: number; title: string } | null }
): string {
  return (template?.trim() || DEFAULT_BRANCH_TEMPLATE)
    .replaceAll('{type}', branchTypeOf(task.details.type))
    .replaceAll('{id}', String(task.id))
    .replaceAll('{slug}', slugOf(task.details.title))
    .replaceAll('{dev}', (ctx?.devAlias ?? '').trim())
    .replaceAll('{usId}', ctx?.parent ? String(ctx.parent.id) : '')
    .replaceAll('{usSlug}', ctx?.parent ? slugOf(ctx.parent.title) : '')
    .split('/')
    .map((segment) => segment.replace(/^-+|-+$/g, ''))
    .filter((segment) => segment !== '')
    .join('/')
}

/**
 * PRD task-ID extraction (STWK-01, BRANCH-01..06): the first standalone
 * multi-digit number (2+ digits not adjacent to a letter or digit, so
 * `oauth2` and sha-like `abc1234` never tag a worktree) in the **last
 * non-empty path segment** — the nested format `user/<dev>/<us-id>-<kw>/<task-id>-<kw>`
 * carries the leaf (Task) id last, and the legacy `{type}/{id}-{slug}` carries
 * its single id in the same place.
 */
export function taskIdFromBranch(branch: string): number | null {
  const segments = branch.split('/').filter((segment) => segment !== '')
  const last = segments[segments.length - 1]
  if (last === undefined) return null
  const match = /(?<![A-Za-z0-9])\d{2,}(?![A-Za-z0-9])/.exec(last)
  return match ? Number(match[0]) : null
}

/** Placeholders `branchNameFor` may render empty — their segment can vanish, and an adjacent '-' is trimmed. */
const EMPTYABLE_PLACEHOLDERS = new Set(['dev', 'usId', 'usSlug', 'slug'])

const PLACEHOLDER_PATTERNS: Record<string, string> = {
  usId: '\\d+',
  type: '(?:feature|bugfix)',
  slug: '[^/]*?',
  usSlug: '[^/]*?',
  dev: '[^/]*?'
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Compiles a branch template into an anchored, case-insensitive matcher whose
 * first group captures `{id}` (APIN-01..03) — the inverse of `branchNameFor`.
 * A segment made only of empty-able placeholders and '-' is optional, and a
 * '-' next to an empty-able placeholder is optional, mirroring the per-segment
 * drop and edge trim rendering applies. Null when the template has no `{id}`.
 */
function compileBranchTemplate(template: string | null): RegExp | null {
  const source = template?.trim() || DEFAULT_BRANCH_TEMPLATE
  if (!source.includes('{id}')) return null
  let captured = false
  const segments = source
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => {
      const tokens = segment.split(/(\{[A-Za-z]+\})/).filter((token) => token !== '')
      const name = (token: string | undefined): string | null =>
        token && /^\{[A-Za-z]+\}$/.test(token) ? token.slice(1, -1) : null
      const emptyable = (token: string | undefined): boolean =>
        EMPTYABLE_PLACEHOLDERS.has(name(token) ?? '')
      const pattern = tokens
        .map((token, i) => {
          const placeholder = name(token)
          if (placeholder === 'id') {
            if (captured) return '\\d+'
            captured = true
            return '(\\d+)'
          }
          if (placeholder !== null && placeholder in PLACEHOLDER_PATTERNS) {
            return PLACEHOLDER_PATTERNS[placeholder]
          }
          const literal = escapeRegExp(token)
          const dashOnly = /^-+$/.test(token)
          return dashOnly && (emptyable(tokens[i - 1]) || emptyable(tokens[i + 1]))
            ? `(?:${literal})?`
            : literal
        })
        .join('')
      const optional = tokens.every((token) => emptyable(token) || /^-+$/.test(token))
      return { pattern, optional }
    })
  // An optional segment carries its '/' on the side facing the `{id}` segment
  // (always mandatory), so dropping it leaves no stray separator at either end.
  const lastMandatory = segments.findLastIndex(({ optional }) => !optional)
  const body = segments
    .map(({ pattern, optional }, i) => {
      if (i > lastMandatory) return `(?:/${pattern})?`
      if (optional) return `(?:${pattern}/)?`
      return i < lastMandatory ? `${pattern}/` : pattern
    })
    .join('')
  return new RegExp(`^${body}$`, 'i')
}

/**
 * The work item ID a branch carries when it matches the branch template, else
 * null (APIN-01..04). Stricter than `taskIdFromBranch`: only this path may
 * trigger an ADO fetch for an unpinned ID (AD-049).
 */
export function taskIdFromTemplate(template: string | null, branch: string): number | null {
  const match = compileBranchTemplate(template)?.exec(branch)
  if (!match) return null
  const id = Number(match[1])
  return id === 0 ? null : id
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
  /**
   * Type shown on the badge instead of `type` when the pinned item is a Task:
   * the first non-Task ancestor's type (walking the Hierarchy-Reverse chain),
   * or null when no such ancestor exists / resolution failed. Absent for
   * non-Task pins, whose badge keeps the item's own `type`.
   */
  parentType?: string | null
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

/** The first Hierarchy-Reverse parent of a work item, as the template needs it (PARENT-02..05). */
export interface ParentWorkItem {
  id: number
  title: string
}

/**
 * Result of `tasks:parent` / `AdoGateway.parentOf`: the parent US of a pinned
 * task, or `null` when there is none or its details are unresolvable;
 * `ok:false/auth` mirrors the ADO auth-degrade path (the caller renders empty
 * placeholders).
 */
export type ParentOfResult =
  | { ok: true; parent: ParentWorkItem | null }
  | { ok: false; reason: 'auth'; error: string }

/** A task chosen by hand: its id and, when known, its title (HTSK-06). */
export interface SessionTask {
  id: number
  title: string | null
}

/** Result of tasks:lookup — failures are returned, never thrown (HTSK-05). */
export type LookupTaskResult =
  | { ok: true; item: { id: number; type: string; title: string } }
  | { ok: false; error: string }
