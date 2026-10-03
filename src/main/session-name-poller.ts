import type { AgentChild, AgentSpawn } from './agent-step-runner'
import { parseAgentsListing } from './agents-listing'
import { diagnostics } from './diagnostics'

/** Hook events from sessions starting together share one call (SNAME-09). */
export const NAME_DEBOUNCE_MS = 1000
/** How often the listing is re-read while a named session runs (SNAME-10). */
export const NAME_INTERVAL_MS = 30000
/** 10× the measured ~2 s of a call: bounds a hung binary without turning a
 *  slow machine into a failure streak (SNAME-12). */
export const NAME_TIMEOUT_MS = 20000
/** A session the listing did not name waits this long after that listing, doubling per
 *  miss up to the ceiling, before a nudge or a tick may list again for it (#151). */
export const NAME_BACKOFF_BASE_MS = 5000
export const NAME_BACKOFF_FACTOR = 2
export const NAME_BACKOFF_MAX_MS = 300000

interface Watched {
  claudeId: string
  /** The last successful listing had an entry for `claudeId`. */
  named: boolean
  /** Listings since the last reset that did not name it; a failed one counts while not named. */
  misses: number
  /** Epoch ms from which it may be listed again; meaningful only while `misses > 0`. */
  dueAt: number
}

export interface SessionNamePollerDeps {
  spawn: AgentSpawn
  /** Resolve the `claude` binary path; throws if unresolved. */
  resolveBin: () => string
  cwd: string
  env: NodeJS.ProcessEnv
  log: (msg: string) => void
  debounceMs?: number
  intervalMs?: number
  timeoutMs?: number
}

/**
 * Decides *when* `claude agents --json` is called and reports each successful
 * listing as `sessionId → name` (AD-040). It never touches a session: the
 * `SessionManager` tells it which app sessions hold a Claude `session_id`
 * (`watch`/`unwatch`), pokes it when one is still unnamed (`nudge`), and does
 * the matching itself in `applyNames`.
 *
 * One call at a time — a tick or a nudge that lands mid-call is coalesced into
 * a single rerun once the child closes, so a `/rename` during a slow call is
 * not lost for a whole interval. A failed call keeps every current name and
 * logs once per failure streak (SNAME-12).
 *
 * A session the listing does not name backs off: each miss pushes its next
 * listing further out (`NAME_BACKOFF_*`), and a watch, nudge or tick starts a
 * call only when a session that asked for it — any watched one, for a tick —
 * is eligible: 0 misses, or due. A new Claude id or a name resets it.
 */
export class SessionNamePoller {
  readonly #watched = new Map<string, Watched>()
  /** Sessions whose watch or nudge waits for a call. */
  readonly #asked = new Set<string>()
  /** A tick waits for a call. */
  #tickAsked = false
  readonly #listeners: Array<(names: Map<string, string>) => void> = []
  #debounce: ReturnType<typeof setTimeout> | null = null
  #interval: ReturnType<typeof setInterval> | null = null
  #inFlight: AgentChild | null = null
  /** The resolved binary, kept until a spawn fails so a moved binary heals. */
  #bin: string | null = null
  #failing = false
  #disposed = false

  constructor(private readonly deps: SessionNamePollerDeps) {}

  watch(id: string, claudeSessionId: string): void {
    if (this.#disposed) return
    if (this.#watched.get(id)?.claudeId !== claudeSessionId) {
      this.#watched.set(id, { claudeId: claudeSessionId, named: false, misses: 0, dueAt: 0 })
    }
    if (this.#interval === null) {
      this.#interval = setInterval(() => {
        this.#tickAsked = true
        this.#run()
      }, this.deps.intervalMs ?? NAME_INTERVAL_MS)
    }
    this.#asked.add(id)
    this.#schedule()
  }

  nudge(id: string): void {
    if (!this.#watched.has(id)) return
    this.#asked.add(id)
    this.#schedule()
  }

  unwatch(id: string): void {
    this.#watched.delete(id)
    this.#asked.delete(id)
    if (this.#watched.size === 0) this.#stopTimers()
  }

  onListing(listener: (names: Map<string, string>) => void): void {
    this.#listeners.push(listener)
  }

  /** App quit: kill the call in flight and guarantee no listener fires after (SNAME-14). */
  dispose(): void {
    this.#disposed = true
    this.#watched.clear()
    this.#stopTimers()
    this.#inFlight?.kill()
    this.#inFlight = null
  }

  #stopTimers(): void {
    if (this.#interval !== null) clearInterval(this.#interval)
    this.#interval = null
    if (this.#debounce !== null) clearTimeout(this.#debounce)
    this.#debounce = null
    this.#asked.clear()
    this.#tickAsked = false
  }

  #schedule(): void {
    if (this.#debounce !== null) return
    this.#debounce = setTimeout(() => {
      this.#debounce = null
      this.#run()
    }, this.deps.debounceMs ?? NAME_DEBOUNCE_MS)
  }

  /** Starts a call when an ask is for an eligible session; a call in flight keeps the asks for its end. */
  #run(): void {
    if (this.#disposed || this.#inFlight !== null) return
    const now = Date.now()
    const eligible = (s: Watched | undefined): boolean =>
      s !== undefined && (s.misses === 0 || now >= s.dueAt)
    const wanted =
      [...this.#asked].some((id) => eligible(this.#watched.get(id))) ||
      (this.#tickAsked && [...this.#watched.values()].some(eligible))
    this.#asked.clear()
    this.#tickAsked = false
    if (wanted) this.#call()
  }

  #call(): void {
    let bin: string
    try {
      bin = this.#bin ?? this.deps.resolveBin()
    } catch (err) {
      this.#fail(`resolve: ${message(err)}`)
      return
    }
    this.#bin = bin

    let child: AgentChild
    try {
      child = this.deps.spawn(bin, ['agents', '--json'], { cwd: this.deps.cwd, env: this.deps.env })
    } catch (err) {
      this.#bin = null
      this.#fail(`spawn: ${message(err)}`)
      return
    }
    this.#inFlight = child
    const listed = diagnostics().nameListingStarted()

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, this.deps.timeoutMs ?? NAME_TIMEOUT_MS)
    // Node emits `error` and then `close` for a spawn failure; the first of the
    // two settles the call and the other is ignored.
    const settle = (outcome: () => void): void => {
      if (settled) return
      settled = true
      listed()
      clearTimeout(timer)
      this.#inFlight = null
      if (this.#disposed) return
      outcome()
      if ((this.#asked.size > 0 || this.#tickAsked) && this.#watched.size > 0) this.#schedule()
    }

    child.onStdout((chunk) => (stdout += chunk))
    child.onStderr((chunk) => (stderr += chunk))
    child.onError?.((err) =>
      settle(() => {
        this.#bin = null
        this.#fail(`spawn: ${err.message}`)
      })
    )
    child.onClose((code) =>
      settle(() => {
        if (timedOut) return this.#fail('timeout')
        if (code !== 0) return this.#fail(`exit ${code}`, stderr)
        const names = parseAgentsListing(stdout)
        if (names === null) return this.#fail('not a JSON array', stderr)
        this.#succeed(names)
      })
    )
  }

  #fail(reason: string, stderr = ''): void {
    const now = Date.now()
    for (const s of this.#watched.values()) if (!s.named) this.#miss(s, now)
    if (this.#failing) return
    this.#failing = true
    const detail = stderr.trim() === '' ? '' : ` — ${stderr.slice(0, 200)}`
    this.deps.log(`[session-name] listing failed: ${reason}${detail}`)
  }

  #succeed(names: Map<string, string>): void {
    const now = Date.now()
    for (const s of this.#watched.values()) {
      s.named = names.has(s.claudeId)
      if (s.named) s.misses = 0
      else this.#miss(s, now)
    }
    if (this.#failing) {
      this.#failing = false
      this.deps.log('[session-name] listing recovered')
    }
    for (const listener of this.#listeners) listener(names)
  }

  #miss(s: Watched, now: number): void {
    s.misses += 1
    s.dueAt =
      now +
      Math.min(NAME_BACKOFF_BASE_MS * NAME_BACKOFF_FACTOR ** (s.misses - 1), NAME_BACKOFF_MAX_MS)
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
