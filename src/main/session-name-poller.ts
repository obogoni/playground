import type { AgentChild, AgentSpawn } from './agent-step-runner'
import { parseAgentsListing } from './agents-listing'

/** Hook events from sessions starting together share one call (SNAME-09). */
export const NAME_DEBOUNCE_MS = 1000
/** How often the listing is re-read while a named session runs (SNAME-10). */
export const NAME_INTERVAL_MS = 30000
/** 10× the measured ~2 s of a call: bounds a hung binary without turning a
 *  slow machine into a failure streak (SNAME-12). */
export const NAME_TIMEOUT_MS = 20000

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
 */
export class SessionNamePoller {
  readonly #watched = new Map<string, string>()
  readonly #listeners: Array<(names: Map<string, string>) => void> = []
  #debounce: ReturnType<typeof setTimeout> | null = null
  #interval: ReturnType<typeof setInterval> | null = null
  #inFlight: AgentChild | null = null
  #pendingRerun = false
  /** The resolved binary, kept until a spawn fails so a moved binary heals. */
  #bin: string | null = null
  #failing = false
  #disposed = false

  constructor(private readonly deps: SessionNamePollerDeps) {}

  watch(id: string, claudeSessionId: string): void {
    if (this.#disposed) return
    this.#watched.set(id, claudeSessionId)
    if (this.#interval === null) {
      this.#interval = setInterval(() => this.#run(), this.deps.intervalMs ?? NAME_INTERVAL_MS)
    }
    this.#schedule()
  }

  nudge(id: string): void {
    if (this.#watched.has(id)) this.#schedule()
  }

  unwatch(id: string): void {
    this.#watched.delete(id)
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
    this.#pendingRerun = false
  }

  #schedule(): void {
    if (this.#debounce !== null) return
    this.#debounce = setTimeout(() => {
      this.#debounce = null
      this.#run()
    }, this.deps.debounceMs ?? NAME_DEBOUNCE_MS)
  }

  #run(): void {
    if (this.#disposed) return
    if (this.#inFlight !== null) {
      this.#pendingRerun = true
      return
    }
    this.#call()
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
      clearTimeout(timer)
      this.#inFlight = null
      if (this.#disposed) return
      outcome()
      if (this.#pendingRerun && this.#watched.size > 0) this.#schedule()
      this.#pendingRerun = false
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
    if (this.#failing) return
    this.#failing = true
    const detail = stderr.trim() === '' ? '' : ` — ${stderr.slice(0, 200)}`
    this.deps.log(`[session-name] listing failed: ${reason}${detail}`)
  }

  #succeed(names: Map<string, string>): void {
    if (this.#failing) {
      this.#failing = false
      this.deps.log('[session-name] listing recovered')
    }
    for (const listener of this.#listeners) listener(names)
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))
