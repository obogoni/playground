/** How long a found binary is trusted before `get()` looks it up again (PERF-20). */
export const RELOOKUP_MS = 30_000

export interface BinaryResolverDeps {
  /** The PATH search; `null` when nothing is found. Never awaited by `get()`. */
  lookup: () => Promise<string | null>
  /** The `agent.claudePath` override, read on every miss. */
  configured: () => string | null
  now: () => number
}

/**
 * A binary path answered from a cache (PERF-20). `get()` is synchronous, like
 * the callers that need it (the name poller, the workflow step runner), and
 * never runs the lookup on their stack: it only starts one in the background
 * when the last one began `RELOOKUP_MS` ago or more, and never two at a time.
 *
 * A failed or empty lookup keeps the last path found, so a PATH hiccup does
 * not turn into an `agent binary not found` for a binary that is still there.
 */
export class BinaryResolver {
  #found: string | null = null
  #startedAt = 0
  #inFlight = false

  constructor(private readonly deps: BinaryResolverDeps) {
    this.#start()
  }

  /** The found path, else the configured one; throws when neither exists (PERF-19 AC 2). */
  get(): string {
    if (!this.#inFlight && this.deps.now() - this.#startedAt >= RELOOKUP_MS) this.#start()
    const path = this.#found ?? this.deps.configured()
    if (!path) throw new Error('agent binary not found')
    return path
  }

  #start(): void {
    this.#inFlight = true
    this.#startedAt = this.deps.now()
    this.deps
      .lookup()
      .then((path) => {
        if (path) this.#found = path
      })
      .catch(() => {})
      .finally(() => {
        this.#inFlight = false
      })
  }
}
