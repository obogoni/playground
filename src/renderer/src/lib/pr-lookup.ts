import type {
  PrDetail,
  PrDetailResult,
  PrProvider,
  PrRef,
  PrSearch,
  PrSummary
} from '../../../shared/files'
import { prKey } from './pr-view'

/**
 * Pure rules of the pull request lookup that the status bar and the Pull
 * request mode share (F6): which providers a reload asks, which pull requests
 * it reads, and how each answer lands in a worktree's entry.
 */

/**
 * Why a pull request could not be read, and on which provider: its sign-in
 * ("run `az login`", FPRA-07), its rate limit (FPRG-26), or an error.
 */
export type PrFailure = { provider: PrProvider } & (
  | { kind: 'auth' }
  | { kind: 'rate-limited'; resetAt: number }
  | { kind: 'error'; message: string }
)

/** What each provider's search found, by provider; a provider not searched yet is absent. */
export type PrSearches = Partial<Record<PrProvider, PrSearch>>

/** One pull request's reads: the last good detail, and the failure of the latest read, if any. */
export interface PrRead {
  detail: PrDetail | null
  failure: PrFailure | null
  /** The failed read followed a successful write, which the mode's notice says. */
  afterWrite?: boolean
}

/** Everything known about one worktree's pull requests, in memory while the app runs. */
export interface PrLookupEntry {
  /** Each provider's own search, kept apart so one failing hides none of the other's (FPRG-07). */
  searches: PrSearches
  /** Reads by `prKey`. */
  reads: Record<string, PrRead>
  /** The pull request picked among several (FPRA-04). */
  chosen: PrRef | null
  /**
   * The pull request the searches last pointed at — the only one, or the one
   * picked — read again even when they stop listing it, so one completed or
   * abandoned elsewhere says so in the Pull request mode (edge case).
   */
  shown: PrRef | null
  /**
   * Providers that answered "rate limited" since the last reload the user
   * asked for; no reload that happens on its own asks them again (FPRG-26).
   */
  limited: PrProvider[]
  loading: boolean
}

export const EMPTY_LOOKUP: PrLookupEntry = {
  searches: {},
  reads: {},
  chosen: null,
  shown: null,
  limited: [],
  loading: false
}

/** The providers searched, in the order their pull requests are listed (FPRG-07). */
export const PROVIDERS: readonly PrProvider[] = ['azure-devops', 'github']

const PROVIDER_NAMES: Record<PrProvider, string> = {
  'azure-devops': 'Azure DevOps',
  github: 'GitHub'
}

/** How a provider is named in the mode's messages (FPRG-04, 06). */
export function providerName(provider: PrProvider): string {
  return PROVIDER_NAMES[provider]
}

/** The reset time of a rate limit, as the mode says it (FPRG-26). */
export function resetTime(resetAt: number): string {
  return new Date(resetAt).toLocaleTimeString()
}

/** A failure in words, naming its provider and the fix for a sign-in (FPRA-07, FPRG-04, 26). */
export function failureText(failure: PrFailure): string {
  switch (failure.kind) {
    case 'auth':
      return failure.provider === 'github'
        ? 'GitHub sign-in failed — run gh auth login'
        : 'Azure DevOps sign-in failed — run az login'
    case 'rate-limited':
      return `${providerName(failure.provider)} refuses requests until ${resetTime(failure.resetAt)}`
    case 'error':
      return failure.message
  }
}

export function refOf(pr: PrRef): PrRef {
  return { target: pr.target, id: pr.id }
}

/** One pull request, by `prKey`: its provider, repository — without case — and number. */
export function sameRef(a: PrRef, b: PrRef): boolean {
  return prKey(a) === prKey(b)
}

/** Every pull request the providers' searches found, in the providers' order (FPRG-07). */
export function foundPrs(searches: PrSearches): PrSummary[] {
  return PROVIDERS.flatMap((provider) => {
    const search = searches[provider]
    return search?.kind === 'found' ? search.prs : []
  })
}

/** The pull request the searches point at: the only one found, or the one picked among several. */
export function currentSummary(prs: PrSummary[], chosen: PrRef | null): PrSummary | null {
  if (prs.length === 1) return prs[0]
  return chosen ? (prs.find((pr) => sameRef(pr, chosen)) ?? null) : null
}

/**
 * The providers one reload asks, and the rate-limit memory it starts from. A
 * reload the user asked for — a selection, entering the mode, a pick, Refresh
 * — forgets the memory and asks every provider; one that happens on its own —
 * a focus, a write — skips a provider that answered "rate limited" (FPRG-26).
 */
export function providersToAsk(
  entry: PrLookupEntry,
  userDriven: boolean
): { ask: PrProvider[]; limited: PrProvider[] } {
  const limited = userDriven ? [] : entry.limited
  return { ask: PROVIDERS.filter((provider) => !limited.includes(provider)), limited }
}

/**
 * The searches' answers in the entry: each asked provider's answer replaces
 * its last one, a provider not asked keeps its own, and a provider that
 * answered "rate limited" joins the memory (FPRG-26). The pull request they
 * point at becomes the one shown; when they point at none, the last one stays.
 */
export function landSearches(
  entry: PrLookupEntry,
  answers: PrSearches,
  limited: PrProvider[]
): PrLookupEntry {
  const next = new Set(limited)
  for (const provider of PROVIDERS) {
    if (answers[provider]?.kind === 'rate-limited') next.add(provider)
  }
  const searches = { ...entry.searches, ...answers }
  const shown = currentSummary(foundPrs(searches), entry.chosen)
  return {
    ...entry,
    searches,
    limited: [...next],
    shown: shown ? refOf(shown) : entry.shown
  }
}

/**
 * The pull requests one reload reads in full: every one the searches found,
 * then each of `extra` they do not list — the one on screen, so a pull request
 * completed or abandoned elsewhere says so (edge case). A provider in the
 * rate-limit memory is not asked (FPRG-26).
 */
export function prsToRead(entry: PrLookupEntry, extra: PrRef[]): PrRef[] {
  const seen = new Set<string>()
  const prs: PrRef[] = []
  for (const pr of [...foundPrs(entry.searches), ...extra]) {
    const key = prKey(pr)
    if (seen.has(key) || entry.limited.includes(pr.target.provider)) continue
    seen.add(key)
    prs.push(refOf(pr))
  }
  return prs
}

/**
 * One read's answer in the entry. A detail replaces the last one and clears
 * the failure; a failure keeps the last good detail beside it, so what is on
 * screen stays (edge case), and a rate limit joins the memory (FPRG-26).
 */
export function landRead(
  entry: PrLookupEntry,
  pr: PrRef,
  result: PrDetailResult,
  afterWrite = false
): PrLookupEntry {
  const key = prKey(pr)
  if (result.kind === 'ok') {
    return { ...entry, reads: { ...entry.reads, [key]: { detail: result.detail, failure: null } } }
  }
  const provider = pr.target.provider
  const read: PrRead = {
    detail: entry.reads[key]?.detail ?? null,
    failure: { ...result, provider },
    ...(afterWrite ? { afterWrite: true } : {})
  }
  const limited =
    result.kind === 'rate-limited' && !entry.limited.includes(provider)
      ? [...entry.limited, provider]
      : entry.limited
  return { ...entry, reads: { ...entry.reads, [key]: read }, limited }
}

/**
 * Whether a lookup joins the one already running for its worktree instead of
 * asking again: both search every provider, and the running one forgets the
 * rate-limit memory whenever the new one would (FPRG-26). This is how the
 * bar's lookup for a selection and the Pull request mode's lookup for the same
 * worktree make one call per provider (edge case: one lookup serves both).
 */
export function joinsRunning(
  running: { userDriven: boolean } | undefined,
  how: { search: boolean; userDriven: boolean; only?: unknown[] }
): boolean {
  if (!how.search || how.only || running === undefined) return false
  return running.userDriven || !how.userDriven
}
