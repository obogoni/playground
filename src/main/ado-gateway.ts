import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ParentOfResult, WorkItemDetails } from '../shared/tasks'

const run = promisify(execFile)

/** Azure DevOps OAuth resource id — fixed, per PRD §ADO integration. */
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'
/** Re-acquire when the cached token is within this window of its expiry. */
const EXPIRY_MARGIN_MS = 2 * 60_000
/**
 * Bound each work-items REST call so a hung connection (one that neither
 * responds nor errors) can't leave the promise — and the `tasks:refresh` /
 * `tasks:pin` IPC waiting on it — pending forever.
 */
const ADO_FETCH_TIMEOUT_MS = 10_000

export interface WorkItemRef {
  id: number
  org: string
  project: string
}

/**
 * ok:false means token acquisition failed or ADO rejected the token — the
 * "run az login" path. Anything else (deleted item, unknown project, network
 * blip on one group) leaves those items absent from the map instead.
 */
export type GetWorkItemsResult =
  | { ok: true; details: Map<string, WorkItemDetails> }
  | { ok: false; reason: 'auth'; error: string }

/**
 * ok:true carries the parent's details plus its Hierarchy-Forward child refs
 * and Hierarchy-Reverse parent refs (PARENT-01);
 * ok:false/auth mirrors `getWorkItems` — the "run az login" path.
 */
export type GetWorkItemWithRelationsResult =
  | { ok: true; item: WorkItemDetails; childRefs: WorkItemRef[]; parentRefs: WorkItemRef[] }
  | { ok: false; reason: 'auth'; error: string }

/** Cache/map key for a work item ref, shared with TaskBoard. */
export function refKey(ref: WorkItemRef): string {
  return `${ref.org}/${ref.project}/#${ref.id}`
}

/**
 * Pure: map an ADO `relations[]` array to child `WorkItemRef`s. Only
 * `System.LinkTypes.Hierarchy-Forward` links are children; each child id is the
 * tail of the relation `url`, and children inherit the parent's org/project
 * (the relations payload carries no org/project of its own). Non-forward links
 * and non-numeric url tails are skipped.
 */
export function parseChildRefs(
  relations: { rel: string; url: string }[] | undefined,
  parent: WorkItemRef
): WorkItemRef[] {
  const children: WorkItemRef[] = []
  for (const relation of relations ?? []) {
    if (relation.rel !== 'System.LinkTypes.Hierarchy-Forward') continue
    const id = Number(relation.url.split('/').pop())
    if (!Number.isInteger(id)) continue
    children.push({ id, org: parent.org, project: parent.project })
  }
  return children
}

/**
 * Pure: map an ADO `relations[]` array to parent `WorkItemRef`s — the mirror
 * of `parseChildRefs` for `System.LinkTypes.Hierarchy-Reverse` links (PARENT-01).
 */
export function parseParentRefs(
  relations: { rel: string; url: string }[] | undefined,
  parent: WorkItemRef
): WorkItemRef[] {
  const parents: WorkItemRef[] = []
  for (const relation of relations ?? []) {
    if (relation.rel !== 'System.LinkTypes.Hierarchy-Reverse') continue
    const id = Number(relation.url.split('/').pop())
    if (!Number.isInteger(id)) continue
    parents.push({ id, org: parent.org, project: parent.project })
  }
  return parents
}

interface CachedToken {
  token: string
  expiresAt: number
}

/**
 * Thin wrapper over `az` token acquisition + the work items REST GET (PRD
 * AdoGateway). Hides token caching and REST details; no secrets stored — the
 * bearer token lives in memory only. Deliberately not unit-tested per PRD
 * §Testing Decisions.
 */
export class AdoGateway {
  private cached: CachedToken | null = null

  async getWorkItems(
    refs: WorkItemRef[],
    fetchFn: typeof fetch = fetch
  ): Promise<GetWorkItemsResult> {
    if (refs.length === 0) return { ok: true, details: new Map() }
    const token = await this.getToken()
    if (!token.ok) return { ok: false, reason: 'auth', error: token.error }

    const details = new Map<string, WorkItemDetails>()
    for (const group of groupByProject(refs)) {
      const base = `https://dev.azure.com/${encodeURIComponent(group.org)}/${encodeURIComponent(group.project)}`
      // errorPolicy=omit: unresolvable ids are dropped from the response
      // instead of failing the whole batch (spec PNTK-01 AC5).
      const url =
        `${base}/_apis/wit/workitems?ids=${group.ids.join(',')}` +
        `&fields=System.Title,System.WorkItemType,System.State&errorPolicy=omit&api-version=7.1`
      let res: Response
      try {
        res = await fetchWithTimeout(
          fetchFn,
          url,
          { headers: { Authorization: `Bearer ${token.token}` } },
          ADO_FETCH_TIMEOUT_MS
        )
      } catch {
        // Network failure or timeout: this group's items stay unresolved; auth
        // is fine. AbortSignal.timeout rejects here just like a network error.
        continue
      }
      if (res.status === 401 || res.status === 403) {
        this.cached = null
        return {
          ok: false,
          reason: 'auth',
          error: `Azure DevOps rejected the token (HTTP ${res.status})`
        }
      }
      if (!res.ok) continue
      let body: { value?: { id: number; fields?: Record<string, string> }[] }
      try {
        body = await res.json()
      } catch {
        continue
      }
      for (const item of body.value ?? []) {
        details.set(refKey({ id: item.id, org: group.org, project: group.project }), {
          title: item.fields?.['System.Title'] ?? '',
          type: item.fields?.['System.WorkItemType'] ?? '',
          state: item.fields?.['System.State'] ?? ''
        })
      }
    }
    return { ok: true, details }
  }

  /**
   * Fetch one work item with its relations and extract its Hierarchy-Forward
   * child refs. `$expand` and `fields` are mutually exclusive in ADO REST 7.1,
   * so this request drops `fields` and asks for `$expand=Relations`; ADO still
   * returns the default fields alongside, so `item` is populated. `fetchFn` is
   * injectable for tests; production uses the global `fetch`.
   */
  async getWorkItemWithRelations(
    ref: WorkItemRef,
    fetchFn: typeof fetch = fetch
  ): Promise<GetWorkItemWithRelationsResult> {
    const token = await this.getToken()
    if (!token.ok) return { ok: false, reason: 'auth', error: token.error }

    const base = `https://dev.azure.com/${encodeURIComponent(ref.org)}/${encodeURIComponent(ref.project)}`
    const url = `${base}/_apis/wit/workitems/${ref.id}?$expand=Relations&api-version=7.1`
    const res = await fetchWithTimeout(
      fetchFn,
      url,
      { headers: { Authorization: `Bearer ${token.token}` } },
      ADO_FETCH_TIMEOUT_MS
    )
    if (res.status === 401 || res.status === 403) {
      this.cached = null
      return {
        ok: false,
        reason: 'auth',
        error: `Azure DevOps rejected the token (HTTP ${res.status})`
      }
    }
    if (!res.ok) {
      throw new Error(`Azure DevOps request failed (HTTP ${res.status})`)
    }
    const body = (await res.json()) as {
      fields?: Record<string, string>
      relations?: { rel: string; url: string }[]
    }
    return {
      ok: true,
      item: {
        title: body.fields?.['System.Title'] ?? '',
        type: body.fields?.['System.WorkItemType'] ?? '',
        state: body.fields?.['System.State'] ?? ''
      },
      childRefs: parseChildRefs(body.relations, ref),
      parentRefs: parseParentRefs(body.relations, ref)
    }
  }

  /**
   * Resolve the first Hierarchy-Reverse parent of a work item (PARENT-02..05):
   * fetches the item's relations, then the parent refs' details, and returns
   * the first parent as `{ id, title }`. No parent or an unresolvable parent
   * batch yields `parent: null` (errorPolicy=omit can drop the item); an auth
   * failure surfaces as `{ ok: false, reason: 'auth' }` — the caller degrades.
   */
  async parentOf(ref: WorkItemRef, fetchFn: typeof fetch = fetch): Promise<ParentOfResult> {
    const withRelations = await this.getWorkItemWithRelations(ref, fetchFn)
    if (!withRelations.ok) return withRelations
    const first = withRelations.parentRefs[0]
    if (first === undefined) return { ok: true, parent: null }
    const fetched = await this.getWorkItems(withRelations.parentRefs, fetchFn)
    if (!fetched.ok) return fetched
    const detail = fetched.details.get(refKey(first))
    return { ok: true, parent: detail ? { id: first.id, title: detail.title } : null }
  }

  private async getToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
    if (this.cached && Date.now() < this.cached.expiresAt - EXPIRY_MARGIN_MS) {
      return { ok: true, token: this.cached.token }
    }
    try {
      // `az` is a .cmd shim on Windows — execFile needs a shell to spawn it.
      // Every argument is a static string; nothing user-controlled reaches the shell.
      const { stdout } = await run(
        'az',
        ['account', 'get-access-token', '--resource', ADO_RESOURCE, '--output', 'json'],
        { shell: true, windowsHide: true }
      )
      const parsed = JSON.parse(stdout) as {
        accessToken: string
        expiresOn?: string
        expires_on?: number | string
      }
      this.cached = { token: parsed.accessToken, expiresAt: expiryOf(parsed) }
      return { ok: true, token: parsed.accessToken }
    } catch (err) {
      this.cached = null
      const message = err instanceof Error ? err.message.split('\n')[0] : String(err)
      return { ok: false, error: message }
    }
  }
}

/**
 * Calls `fetchFn` with an abort timeout: if the request outlives `timeoutMs`,
 * the signal aborts and the returned promise rejects (a `TimeoutError`) rather
 * than hanging. Extracted as a pure, injectable seam so the timeout behavior is
 * unit-testable without real network or token acquisition.
 */
export function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  return fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

/** az reports `expires_on` (epoch seconds, newer CLIs) or `expiresOn` (local time string). */
function expiryOf(token: { expiresOn?: string; expires_on?: number | string }): number {
  const epoch = Number(token.expires_on)
  if (Number.isFinite(epoch) && epoch > 0) return epoch * 1000
  const parsed = token.expiresOn ? Date.parse(token.expiresOn) : NaN
  return Number.isFinite(parsed) ? parsed : Date.now() + 30 * 60_000
}

/** The batch endpoint is project-scoped — one request per org/project pair. */
function groupByProject(refs: WorkItemRef[]): { org: string; project: string; ids: number[] }[] {
  const groups = new Map<string, { org: string; project: string; ids: number[] }>()
  for (const ref of refs) {
    const key = `${ref.org} ${ref.project}`
    const group = groups.get(key) ?? { org: ref.org, project: ref.project, ids: [] }
    group.ids.push(ref.id)
    groups.set(key, group)
  }
  return [...groups.values()]
}
