import type { FromHost, ToHost } from '../shared/pty-host-protocol'
import type { PtyHandle } from './pty-port'
import type { SpawnPlan } from './spawn-plan'
import { buildPtyEnv } from './terminal-env'

/** Narrow seam over Electron's `UtilityProcess`, so the client runs against a fake. */
export interface HostTransport {
  post(m: ToHost): void
  onMessage(cb: (m: FromHost) => void): void
  onExit(cb: (code: number) => void): void
  kill(): void
}

export interface PtyHostClientDeps {
  fork: () => HostTransport
  log: (line: string, err?: unknown) => void
}

type ExitEvent = Parameters<Parameters<PtyHandle['onExit']>[0]>[0]
type Queued = { kind: 'data'; data: string } | { kind: 'exit'; e: ExitEvent }

interface HandleState {
  queue: Queued[]
  dataCb?: (data: string) => void
  exitCb?: (e: ExitEvent) => void
  exited: boolean
}

interface PendingSpawn {
  plan: SpawnPlan
  resolve: (h: PtyHandle) => void
  reject: (err: Error) => void
}

/**
 * Main-side proxy for the PTY host utility process (PTYH-01): serves
 * `PtyHandle`s whose PTYs live in the host. Events that arrive before a
 * handle's listeners are attached are queued and delivered in order on
 * registration, so ordering (PTYH-06/07) does not depend on when the caller
 * wires `onData`/`onExit` after the spawn resolves.
 */
export class PtyHostClient {
  readonly #deps: PtyHostClientDeps
  #transport: HostTransport | null = null
  #nextPtyId = 1
  readonly #pending = new Map<number, PendingSpawn>()
  readonly #handles = new Map<number, HandleState>()
  #shutdown: { done: Promise<void>; finish: () => void } | null = null

  constructor(deps: PtyHostClientDeps) {
    this.#deps = deps
  }

  /** True while a host process is forked and has not exited. */
  get alive(): boolean {
    return this.#transport !== null
  }

  /** Fork the host eagerly (app ready), so the first spawn does not pay its start-up. */
  start(): void {
    try {
      this.#ensureTransport()
    } catch (err) {
      // The next spawn retries the fork and surfaces the error in its toast.
      this.#deps.log('[pty-host] failed to start', err)
    }
  }

  spawn(plan: SpawnPlan, env?: NodeJS.ProcessEnv): Promise<PtyHandle> {
    return new Promise<PtyHandle>((resolve, reject) => {
      const transport = this.#ensureTransport()
      const ptyId = this.#nextPtyId++
      this.#pending.set(ptyId, { plan, resolve, reject })
      transport.post({
        type: 'spawn',
        ptyId,
        file: plan.file,
        args: plan.args,
        cwd: plan.cwd,
        // Computed in main so the env is byte-identical to the in-process spawn (PTYH-09).
        env: buildPtyEnv({ ...process.env, ...env })
      })
    })
  }

  /**
   * Quit: let the host kill every PTY itself (node-pty's own kill path) and exit,
   * or kill the host at the deadline (PTYH-17, PTYH-18). The host's exit here is
   * not a crash: no `hostExited` finalize, no crash log.
   */
  shutdown(timeoutMs: number): Promise<void> {
    if (this.#shutdown) return this.#shutdown.done
    const transport = this.#transport
    if (!transport) return Promise.resolve()
    let resolve!: () => void
    const done = new Promise<void>((r) => {
      resolve = r
    })
    const timer = setTimeout(() => {
      transport.kill()
      finish()
    }, timeoutMs)
    const finish = (): void => {
      clearTimeout(timer)
      this.#shutdown = null
      this.#transport = null
      const pending = [...this.#pending.values()]
      this.#pending.clear()
      for (const p of pending) p.reject(new Error('PTY host shut down'))
      for (const state of this.#handles.values()) state.exited = true
      this.#handles.clear()
      resolve()
    }
    this.#shutdown = { done, finish }
    // FIFO: the host handles killAll after every message posted before it (PTYH-19).
    transport.post({ type: 'killAll' })
    return done
  }

  #ensureTransport(): HostTransport {
    if (this.#transport) return this.#transport
    const transport = this.#deps.fork()
    this.#transport = transport
    transport.onMessage((m) => {
      if (transport === this.#transport) this.#onMessage(transport, m)
    })
    transport.onExit((code) => {
      if (transport !== this.#transport) return
      if (this.#shutdown) this.#shutdown.finish()
      else this.#onHostExit(code)
    })
    return transport
  }

  /**
   * The host died outside a shutdown: every session it served is gone (PTYH-22),
   * pending spawns fail (PTYH-26), and the next spawn forks a new host
   * (PTYH-24). Nothing is respawned here (PTYH-25).
   */
  #onHostExit(code: number): void {
    this.#transport = null
    this.#deps.log(`[pty-host] exited unexpectedly (code ${code})`)
    const pending = [...this.#pending.values()]
    this.#pending.clear()
    for (const p of pending) p.reject(new Error('PTY host exited unexpectedly'))
    const handles = [...this.#handles.values()]
    this.#handles.clear()
    for (const state of handles) {
      state.exited = true
      state.queue.push({ kind: 'exit', e: { exitCode: -1, hostExited: true } })
      flush(state)
    }
  }

  #onMessage(transport: HostTransport, m: FromHost): void {
    switch (m.type) {
      case 'spawned': {
        const pending = this.#pending.get(m.ptyId)
        if (!pending) return
        this.#pending.delete(m.ptyId)
        const state: HandleState = { queue: [], exited: false }
        this.#handles.set(m.ptyId, state)
        pending.resolve(this.#makeHandle(transport, m.ptyId, state))
        return
      }
      case 'spawn-failed': {
        const pending = this.#pending.get(m.ptyId)
        if (!pending) return
        this.#pending.delete(m.ptyId)
        const err = new Error(m.message)
        // The toast fades and a packaged build has no DevTools: the plan in the
        // log is what attributes an intermittent failure after the fact (#89).
        const { plan } = pending
        this.#deps.log(
          `Failed to spawn PTY: file=${plan.file} args=${JSON.stringify(plan.args)} cwd=${plan.cwd}`,
          err
        )
        pending.reject(err)
        return
      }
      case 'data': {
        const state = this.#handles.get(m.ptyId)
        if (!state) return
        state.queue.push({ kind: 'data', data: m.data })
        flush(state)
        return
      }
      case 'exit': {
        const state = this.#handles.get(m.ptyId)
        if (!state) return
        this.#handles.delete(m.ptyId)
        state.exited = true
        state.queue.push({ kind: 'exit', e: { exitCode: m.exitCode } })
        flush(state)
        return
      }
    }
  }

  #makeHandle(transport: HostTransport, ptyId: number, state: HandleState): PtyHandle {
    const post = (m: ToHost): void => {
      if (!state.exited) transport.post(m)
    }
    return {
      onData: (cb) => {
        state.dataCb = cb
        flush(state)
      },
      onExit: (cb) => {
        state.exitCb = cb
        flush(state)
      },
      write: (data) => post({ type: 'write', ptyId, data }),
      resize: (cols, rows) => post({ type: 'resize', ptyId, cols, rows }),
      kill: () => post({ type: 'kill', ptyId })
    }
  }
}

/** Deliver queued events in arrival order, stopping at the first one with no listener yet. */
function flush(state: HandleState): void {
  while (state.queue.length > 0) {
    const head = state.queue[0]
    if (head.kind === 'data') {
      if (!state.dataCb) return
      state.queue.shift()
      state.dataCb(head.data)
    } else {
      if (!state.exitCb) return
      state.queue.shift()
      state.exitCb(head.e)
    }
  }
}
