import type {
  AdoThreadStatus,
  DiffSide,
  DiffSides,
  PrDetailResult,
  PrFile,
  PrRef,
  PrSearch,
  PrSelection,
  PrStatus,
  PrSummary,
  PrTarget,
  PrThreadView,
  WriteResult
} from '../shared/files'
import type { LaunchResult } from '../shared/shortcuts'
import {
  anchorFromSelection,
  classifyThread,
  iterationContextFor,
  pickRemoteRepos,
  rootCommentId,
  sourceRemote,
  toChangedPaths,
  visibleComments,
  voteLabel,
  type AdoChange,
  type AdoRemote,
  type AdoThread
} from './ado-pr-model'
import { fetchWithTimeout } from './ado-gateway'
import { lineEndingChanges } from './file-diff'
import { MAX_VIEW_BYTES } from './file-reader'
import { git, type GitRunner } from './git'
import { createPrUrl, prUrl } from './remote-url'
import { isHttpsUrl } from './url-policy'

/**
 * The app's Azure DevOps pull-request client (F4). Every request to Azure
 * DevOps for pull requests goes through here, built from intent the renderer
 * sends — a `PrRef`, a path — never from a URL it holds (FPRA-32).
 *
 * Reads send nothing but a GET. The four writes — reply, status, a new thread,
 * a general comment — each send exactly one request, only when called, which
 * the IPC layer does only on a user's click (FPRA-32, AD-027). Every method
 * returns a result and never throws; a missing token is the "run `az login`"
 * result (FPRA-07), anything else an error the view can show.
 */

/** Bound each request, as the work-items gateway does, so a hung connection cannot hold a view. */
const ADO_PR_FETCH_TIMEOUT_MS = 10_000

const API_VERSION = 'api-version=7.1'

/** What the client needs from the outside, injected so every request is unit-testable. */
export interface AdoPrDeps {
  /** The gateway's cached `az` token — one cache for work items and pull requests. */
  getToken: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  fetchFn?: typeof fetch
  /** The paced `git()`; a test stands in for it. */
  run?: GitRunner
}

/** One read's outcome: the value, the "run `az login`" state, or an error to show. */
export type AdoRead<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'auth' }
  | { kind: 'error'; message: string }

/** The latest iteration of a pull request and the two commits its diff compares (T1, S2). */
export interface LatestIteration {
  id: number
  /** The head of the source branch at this iteration — the modified side. */
  sourceCommit: string
  /** The merge base with the target branch — the original side. */
  commonCommit: string
}

interface AdoIdentity {
  displayName: string
}

interface AdoPullRequest {
  pullRequestId: number
  title: string
  description?: string
  status: string
  isDraft?: boolean
  createdBy: AdoIdentity
  creationDate: string
  sourceRefName: string
  targetRefName: string
  reviewers?: (AdoIdentity & { vote: number; isContainer?: boolean; isRequired?: boolean })[]
}

/** Azure DevOps' `CommentThreadStatus` values for the statuses a user can set (FPRA-26). */
const STATUS_CODES: Record<Exclude<AdoThreadStatus, 'unknown'>, number> = {
  active: 1,
  fixed: 2,
  wontFix: 3,
  closed: 4,
  byDesign: 5,
  pending: 6
}

/** `CommentType.text`: a comment a person wrote. */
const TEXT_COMMENT = 1

/** What the web UI sets on the threads it creates; the app's writes match it (T1, S5). */
const SUPPORTS_MARKDOWN = {
  'Microsoft.TeamFoundation.Discussion.SupportsMarkdown': { type: 'System.Int32', value: 1 }
}

const THREAD_STATUSES: readonly AdoThreadStatus[] = [
  'active',
  'fixed',
  'wontFix',
  'closed',
  'byDesign',
  'pending',
  'unknown'
]

export class AdoPrClient {
  private readonly getToken: AdoPrDeps['getToken']
  private readonly fetchFn: typeof fetch
  private readonly run: GitRunner

  constructor(deps: AdoPrDeps) {
    this.getToken = deps.getToken
    this.fetchFn = deps.fetchFn ?? fetch
    this.run = deps.run ?? git
  }

  /**
   * The active pull requests whose source is the worktree's branch (FPRA-02..08).
   *
   * The source repository is the one the branch is pushed to — its
   * `branch.<name>.remote` — so a branch pushed to a fork is found in the
   * upstream repository too. Every Azure DevOps remote is searched as a target,
   * each for PRs from that source branch in that source repository.
   */
  async findPrs(worktreePath: string): Promise<PrSearch> {
    const located = await this.locate(worktreePath)
    if (located.kind !== 'ok') return located

    const { branch, repos, source } = located
    // A branch pushed nowhere on Azure DevOps has no pull request there, and
    // nothing to create one from either.
    if (source === null) return { kind: 'none', createUrlAvailable: false }

    const repository = await this.getJson<{ id: string }>(
      `${apiBase(source.target)}?${API_VERSION}`
    )
    if (repository.kind !== 'ok') return repository

    const prs: PrSummary[] = []
    for (const target of uniqueTargets(repos)) {
      const query = new URLSearchParams({
        'searchCriteria.sourceRefName': `refs/heads/${branch}`,
        'searchCriteria.sourceRepositoryId': repository.value.id,
        'searchCriteria.status': 'active'
      })
      const found = await this.getJson<{ value?: AdoPullRequest[] }>(
        `${apiBase(target)}/pullrequests?${query.toString()}&${API_VERSION}`
      )
      if (found.kind !== 'ok') return found
      for (const pr of found.value.value ?? []) prs.push(summaryOf(target, pr))
    }
    return prs.length > 0 ? { kind: 'found', prs } : { kind: 'none', createUrlAvailable: true }
  }

  /**
   * One pull request in full: what the Overview and the PR file tree draw
   * (FPRA-09..15, 18, 19). Read from the single-PR call, not the list, because
   * the list truncates the description to 400 characters (FPRA-10).
   */
  async getPr(pr: PrRef): Promise<PrDetailResult> {
    const read = await this.getJson<AdoPullRequest>(
      `${apiBase(pr.target)}/pullrequests/${pr.id}?${API_VERSION}`
    )
    if (read.kind !== 'ok') return read
    const iteration = await this.latestIteration(pr)
    if (iteration.kind !== 'ok') return iteration
    const files = await this.changedFiles(pr, iteration.value.id)
    if (files.kind !== 'ok') return files
    const threads = await this.threads(pr, iteration.value.id)
    if (threads.kind !== 'ok') return threads

    const body = read.value
    return {
      kind: 'ok',
      detail: {
        ...summaryOf(pr.target, body),
        status: prStatusOf(body.status),
        author: body.createdBy.displayName,
        description: body.description ?? '',
        createdAt: Date.parse(body.creationDate),
        sourceBranch: branchOf(body.sourceRefName),
        reviewers: (body.reviewers ?? []).map((reviewer) => ({
          name: reviewer.displayName,
          state: voteLabel(reviewer.vote),
          isGroup: reviewer.isContainer === true,
          isRequired: reviewer.isRequired === true
        })),
        iteration: iteration.value.id,
        files: files.value,
        threads: threads.value
      }
    }
  }

  /** The latest iteration, with the commits both diff sides are read at (FPRA-16, 34; T1, S2). */
  async latestIteration(pr: PrRef): Promise<AdoRead<LatestIteration>> {
    const read = await this.getJson<{
      value?: {
        id: number
        sourceRefCommit: { commitId: string }
        commonRefCommit: { commitId: string }
      }[]
    }>(`${apiBase(pr.target)}/pullRequests/${pr.id}/iterations?${API_VERSION}`)
    if (read.kind !== 'ok') return read
    const iterations = read.value.value ?? []
    const latest = iterations.reduce<(typeof iterations)[number] | null>(
      (best, next) => (best === null || next.id > best.id ? next : best),
      null
    )
    if (latest === null) return { kind: 'error', message: 'The pull request has no iteration.' }
    return {
      kind: 'ok',
      value: {
        id: latest.id,
        sourceCommit: latest.sourceRefCommit.commitId,
        commonCommit: latest.commonRefCommit.commitId
      }
    }
  }

  /**
   * Every file the PR changes, against its merge base (FPRA-15). The endpoint
   * pages by 100 by default; the next page is asked for while `nextSkip` /
   * `nextTop` name one, and a last page carries neither (T1, S7).
   */
  async changedFiles(pr: PrRef, iteration: number): Promise<AdoRead<PrFile[]>> {
    const base = `${apiBase(pr.target)}/pullRequests/${pr.id}/iterations/${iteration}/changes`
    const entries: AdoChange[] = []
    let skip = 0
    let top = 2000
    for (;;) {
      const skipParam = skip > 0 ? `&$skip=${skip}` : ''
      const page = await this.getJson<{
        changeEntries?: AdoChange[]
        nextSkip?: number
        nextTop?: number
      }>(`${base}?$compareTo=0&$top=${top}${skipParam}&${API_VERSION}`)
      if (page.kind !== 'ok') return page
      entries.push(...(page.value.changeEntries ?? []))
      const nextSkip = page.value.nextSkip ?? 0
      const nextTop = page.value.nextTop ?? 0
      // A page that does not move forward would ask for itself again forever.
      if (nextSkip === 0 && nextTop === 0) break
      if (nextSkip <= skip) break
      skip = nextSkip
      top = nextTop > 0 ? nextTop : top
    }
    return { kind: 'ok', value: toChangedPaths(entries) }
  }

  /**
   * Every thread, positioned for the latest iteration against the merge base
   * (FPRA-11, 13, 18, 19): the plain list returns creation positions only
   * (T1, S3). Deleted threads come back classified as such for the view to drop.
   */
  async threads(pr: PrRef, iteration: number): Promise<AdoRead<PrThreadView[]>> {
    const read = await this.getJson<{ value?: AdoThread[] }>(
      `${apiBase(pr.target)}/pullRequests/${pr.id}/threads` +
        `?$iteration=${iteration}&$baseIteration=0&${API_VERSION}`
    )
    if (read.kind !== 'ok') return read
    return { kind: 'ok', value: (read.value.value ?? []).map(threadView) }
  }

  /**
   * Both sides of one PR file at the latest iteration, read from Azure DevOps
   * and never from the local repository (FPRA-16/17): the original at the
   * merge base, the modified at the source commit. A rename reads its original
   * from `oldPath`.
   */
  async fileSides(pr: PrRef, path: string, oldPath?: string): Promise<DiffSides> {
    const iteration = await this.latestIteration(pr)
    if (iteration.kind !== 'ok') {
      const side: DiffSide = { kind: 'error', message: readFailure(iteration) }
      return { original: side, modified: side, eolChanged: [] }
    }
    const original = await this.fileSide(pr, oldPath ?? path, iteration.value.commonCommit)
    const modified = await this.fileSide(pr, path, iteration.value.sourceCommit)
    if (original.kind !== 'text' || modified.kind !== 'text') {
      return { original, modified, eolChanged: [] }
    }
    const eol = lineEndingChanges(original.text, modified.text)
    return { original, modified, eolChanged: eol.lines, eolFrom: eol.from, eolTo: eol.to }
  }

  /**
   * One side of a PR file at a commit (T1, S6). The item's metadata names its
   * blob and whether it is binary; the blob's metadata gives its size; the
   * content is asked for only when it is text and within F1's 1 MB cap. A file
   * that is not at that commit — the original side of an added file, the
   * modified side of a deleted one — is a 404, and an absent side.
   */
  async fileSide(pr: PrRef, path: string, commit: string): Promise<DiffSide> {
    const base = apiBase(pr.target)
    const query = new URLSearchParams({
      path: `/${path}`,
      'versionDescriptor.version': commit,
      'versionDescriptor.versionType': 'commit',
      includeContentMetadata: 'true',
      // Without it Azure DevOps answers with the file's text, not its metadata.
      $format: 'json'
    })
    const item = await this.getJson<{
      objectId: string
      contentMetadata?: { isBinary?: boolean }
    }>(`${base}/items?${query.toString()}&${API_VERSION}`, { notFound: true })
    if (item.kind === 'not-found') return { kind: 'absent' }
    if (item.kind !== 'ok') return { kind: 'error', message: readFailure(item) }

    const blob = await this.getJson<{ size: number }>(
      `${base}/blobs/${item.value.objectId}?$format=json&${API_VERSION}`
    )
    if (blob.kind !== 'ok') return { kind: 'error', message: readFailure(blob) }
    const size = blob.value.size
    if (size > MAX_VIEW_BYTES) return { kind: 'too-large', size }
    if (item.value.contentMetadata?.isBinary === true) return { kind: 'binary', size }

    const content = await this.get(
      `${base}/blobs/${item.value.objectId}?$format=text&${API_VERSION}`
    )
    if (content.kind !== 'ok') return { kind: 'error', message: readFailure(content) }
    try {
      return { kind: 'text', text: await content.value.text(), size }
    } catch (err) {
      return { kind: 'error', message: messageOf(err) }
    }
  }

  /**
   * Opens the pull request's page, or Azure DevOps' creation page for the
   * branch, in the browser (FPRA-05/14). The renderer names the PR or asks
   * for the create page; the address is built here — the create page from
   * the repository the branch is pushed to — and opened only if it is https,
   * as `openCommit` does (FCMT-28, AD-044).
   */
  async openPage(
    worktreePath: string,
    req: { pr: PrRef } | { create: true },
    open: (url: string) => Promise<unknown>
  ): Promise<LaunchResult> {
    let url: string
    if ('pr' in req) {
      url = prUrl(req.pr.target, req.pr.id)
    } else {
      const located = await this.locate(worktreePath)
      if (located.kind !== 'ok' || located.source === null) {
        return { ok: false, error: 'This branch is not pushed to an Azure DevOps repository.' }
      }
      url = createPrUrl(located.source.target, located.branch)
    }
    return openHttps(url, open)
  }

  /** A reply, appended to the thread under its root comment (FPRA-25). */
  reply(pr: PrRef, threadId: number, rootCommentId: number, content: string): Promise<WriteResult> {
    return this.send(
      'POST',
      `${apiBase(pr.target)}/pullRequests/${pr.id}/threads/${threadId}/comments?${API_VERSION}`,
      { content, parentCommentId: rootCommentId, commentType: TEXT_COMMENT }
    )
  }

  /** A thread's new status; Active reopens a resolved thread (FPRA-26). */
  setStatus(
    pr: PrRef,
    threadId: number,
    status: Exclude<AdoThreadStatus, 'unknown'>
  ): Promise<WriteResult> {
    return this.send(
      'PATCH',
      `${apiBase(pr.target)}/pullRequests/${pr.id}/threads/${threadId}?${API_VERSION}`,
      { status: STATUS_CODES[status] }
    )
  }

  /**
   * A new thread on a modified-side selection, anchored as Azure DevOps'
   * own web view anchors one on the whole-PR view (FPRA-27; T1, S1/S2): the
   * file with a leading `/`, the selection's lines and character offsets as
   * they are, the file's change tracking id and the iteration on screen.
   */
  createThread(req: {
    pr: PrRef
    iteration: number
    changeTrackingId: number
    selection: PrSelection
    content: string
  }): Promise<WriteResult> {
    const anchor = anchorFromSelection(req.selection)
    return this.send(
      'POST',
      `${apiBase(req.pr.target)}/pullRequests/${req.pr.id}/threads?${API_VERSION}`,
      {
        comments: [{ parentCommentId: 0, content: req.content, commentType: TEXT_COMMENT }],
        status: STATUS_CODES.active,
        threadContext: {
          filePath: `/${anchor.path}`,
          rightFileStart: { line: anchor.startLine, offset: anchor.startOffset },
          rightFileEnd: { line: anchor.endLine, offset: anchor.endOffset }
        },
        pullRequestThreadContext: {
          changeTrackingId: req.changeTrackingId,
          iterationContext: iterationContextFor(req.iteration)
        },
        properties: SUPPORTS_MARKDOWN
      }
    )
  }

  /** A comment on the pull request as a whole: a thread with no file context (FPRA-29). */
  generalComment(pr: PrRef, content: string): Promise<WriteResult> {
    return this.send('POST', `${apiBase(pr.target)}/pullRequests/${pr.id}/threads?${API_VERSION}`, {
      comments: [{ parentCommentId: 0, content, commentType: TEXT_COMMENT }],
      status: STATUS_CODES.active,
      properties: SUPPORTS_MARKDOWN
    })
  }

  /**
   * The one request a write makes. A failure carries Azure DevOps' own message
   * where it gave one, for the composer to show with the text kept (FPRA-31).
   */
  private async send(method: 'POST' | 'PATCH', url: string, body: unknown): Promise<WriteResult> {
    const token = await this.getToken()
    if (!token.ok) return { ok: false, message: readFailure({ kind: 'auth' }) }
    let res: Response
    try {
      res = await fetchWithTimeout(
        this.fetchFn,
        url,
        {
          method,
          headers: {
            Authorization: `Bearer ${token.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        },
        ADO_PR_FETCH_TIMEOUT_MS
      )
    } catch (err) {
      return { ok: false, message: messageOf(err) }
    }
    if (!res.ok) return { ok: false, message: await failureMessage(res) }
    return { ok: true }
  }

  /**
   * The worktree's branch, its Azure DevOps remotes and the one it is pushed
   * to — every git read through the paced runner. A detached HEAD and a
   * repository with no Azure DevOps remote are answers, not failures.
   */
  private async locate(
    worktreePath: string
  ): Promise<
    | { kind: 'ok'; branch: string; repos: AdoRemote[]; source: AdoRemote | null }
    | { kind: 'detached' }
    | { kind: 'no-ado-remote' }
    | { kind: 'error'; message: string }
  > {
    let branch: string
    let remotes: { name: string; url: string }[]
    try {
      const { stdout: head } = await this.run(worktreePath, ['rev-parse', '--abbrev-ref', 'HEAD'])
      branch = head.trim()
      if (branch === '' || branch === 'HEAD') return { kind: 'detached' }
      remotes = parseRemoteUrls((await this.run(worktreePath, ['remote', '-v'])).stdout)
    } catch (err) {
      return { kind: 'error', message: messageOf(err) }
    }
    const repos = pickRemoteRepos(remotes)
    if (repos.length === 0) return { kind: 'no-ado-remote' }
    let upstream: string | null
    try {
      const { stdout } = await this.run(worktreePath, [
        'config',
        '--get',
        `branch.${branch}.remote`
      ])
      upstream = stdout.trim() === '' ? null : stdout.trim()
    } catch {
      // `git config --get` exits 1 when the key is unset: the branch tracks nothing.
      upstream = null
    }
    return { kind: 'ok', branch, repos, source: sourceRemote(upstream, repos) }
  }

  /** One GET returning JSON. A 404 is its own result only for the caller that asks. */
  private async getJson<T>(url: string): Promise<AdoRead<T>>
  private async getJson<T>(
    url: string,
    opts: { notFound: true }
  ): Promise<AdoRead<T> | { kind: 'not-found' }>
  private async getJson<T>(
    url: string,
    opts: { notFound?: boolean } = {}
  ): Promise<AdoRead<T> | { kind: 'not-found' }> {
    const res = await this.get(url, opts)
    if (res.kind !== 'ok') return res
    try {
      return { kind: 'ok', value: (await res.value.json()) as T }
    } catch (err) {
      return { kind: 'error', message: messageOf(err) }
    }
  }

  /** One GET with the token; never any other method on the read path (FPRA-32). */
  private async get(url: string): Promise<AdoRead<Response>>
  private async get(
    url: string,
    opts: { notFound?: boolean }
  ): Promise<AdoRead<Response> | { kind: 'not-found' }>
  private async get(
    url: string,
    opts: { notFound?: boolean } = {}
  ): Promise<AdoRead<Response> | { kind: 'not-found' }> {
    const token = await this.getToken()
    if (!token.ok) return { kind: 'auth' }
    let res: Response
    try {
      res = await fetchWithTimeout(
        this.fetchFn,
        url,
        { method: 'GET', headers: { Authorization: `Bearer ${token.token}` } },
        ADO_PR_FETCH_TIMEOUT_MS
      )
    } catch (err) {
      return { kind: 'error', message: messageOf(err) }
    }
    if (res.status === 401 || res.status === 403) return { kind: 'auth' }
    if (res.status === 404 && opts.notFound) return { kind: 'not-found' }
    if (!res.ok) return { kind: 'error', message: await failureMessage(res) }
    return { kind: 'ok', value: res }
  }
}

/**
 * Opens a link from rendered third-party markdown (FPRA-23): only an `https:`
 * address reaches the browser, whatever the renderer already checked. Anything
 * else is refused and nothing is opened.
 */
export function openPrLink(
  href: string,
  open: (url: string) => Promise<unknown>
): Promise<LaunchResult> {
  return openHttps(href, open)
}

async function openHttps(
  url: string,
  open: (url: string) => Promise<unknown>
): Promise<LaunchResult> {
  if (!isHttpsUrl(url)) return { ok: false, error: 'Refused to open an address that is not https.' }
  try {
    await open(url)
  } catch (err) {
    return { ok: false, error: messageOf(err) }
  }
  return { ok: true }
}

/** The REST root of one repository, every segment encoded. */
function apiBase(target: PrTarget): string {
  const part = (value: string): string => encodeURIComponent(value)
  return (
    `https://dev.azure.com/${part(target.org)}/${part(target.project)}` +
    `/_apis/git/repositories/${part(target.repo)}`
  )
}

/** `git remote -v` as name and fetch URL pairs, once per remote. */
function parseRemoteUrls(stdout: string): { name: string; url: string }[] {
  const remotes = new Map<string, string>()
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
    if (match && !remotes.has(match[1])) remotes.set(match[1], match[2])
  }
  return [...remotes].map(([name, url]) => ({ name, url }))
}

/** Two remotes naming the same repository are searched once. */
function uniqueTargets(repos: AdoRemote[]): PrTarget[] {
  const seen = new Map<string, PrTarget>()
  for (const { target } of repos) {
    const key = [target.org, target.project, target.repo].map((s) => s.toLowerCase()).join('/')
    if (!seen.has(key)) seen.set(key, target)
  }
  return [...seen.values()]
}

function summaryOf(target: PrTarget, pr: AdoPullRequest): PrSummary {
  return {
    provider: 'azure-devops',
    target,
    id: pr.pullRequestId,
    title: pr.title,
    targetBranch: branchOf(pr.targetRefName),
    isDraft: pr.isDraft === true
  }
}

function threadView(thread: AdoThread): PrThreadView {
  const status = THREAD_STATUSES.find((s) => s === thread.status) ?? 'unknown'
  return {
    id: thread.id,
    // From every comment, before the deleted ones are dropped ([owner 2026-10-10]).
    rootCommentId: rootCommentId(thread),
    // Fixed, Won't fix, Closed and By design are Azure DevOps' resolved states;
    // Active, Pending and a thread with no status read as open (FPRA-20).
    resolution:
      status === 'active' || status === 'pending' || status === 'unknown' ? 'active' : 'resolved',
    providerStatus: status,
    comments: visibleComments(thread),
    place: classifyThread(thread)
  }
}

function prStatusOf(status: string): PrStatus {
  return status === 'completed' || status === 'abandoned' ? status : 'active'
}

function branchOf(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
}

function readFailure(read: { kind: 'auth' } | { kind: 'error'; message: string }): string {
  return read.kind === 'auth' ? 'Azure DevOps sign-in failed — run `az login`.' : read.message
}

/** Azure DevOps' own message from an error body, or the HTTP status when it has none. */
async function failureMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown }
    if (typeof body.message === 'string' && body.message !== '') return body.message
  } catch {
    // Not JSON: the status is all there is to say.
  }
  return `Azure DevOps request failed (HTTP ${res.status})`
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] : String(err)
}
