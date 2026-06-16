import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { PersistedSession, SessionStatus, SessionView } from '../shared/config'
import type { IpcEvent, IpcEvents } from '../shared/ipc-contract'
import type { ConfigStore } from './config-store'
import type { PtyHandle, PtyPort } from './pty-port'
import { SessionRingBuffer } from './session-ring-buffer'
import { buildRawSpawnPlan, buildSpawnPlan, type AgentDef } from './spawn-plan'

/** Typed main→renderer push, bound to the live window's webContents by index.ts. */
export type EmitFn = <E extends IpcEvent>(channel: E, payload: IpcEvents[E]) => void

export interface SessionManagerDeps {
  port: PtyPort
  config: ConfigStore
  emit: EmitFn
  /** Injectable for reconcile tests (fs.existsSync in production). */
  fsExists: (path: string) => boolean
}

/** Stored on ad-hoc sessions in place of a registry agent name. */
const ADHOC_AGENT = 'Ad-hoc'

/** A session with a live PTY. Stopped/restored sessions live only in config. */
interface RunningSession {
  meta: PersistedSession
  handle: PtyHandle
  buffer: SessionRingBuffer
}

/**
 * Owns every agent session's lifecycle, persistence, and stream routing — the
 * single caller of `PtyPort`/`buildSpawnPlan`/`ConfigStore` for sessions
 * (PRD §Modules). DI'd like `TaskBoard` so the orchestration logic — the risky
 * part — is unit-tested without Electron or a real PTY.
 *
 * Config (`AppConfig.sessions`) is the source of truth for *which* sessions
 * exist; the `running` Map is the subset with a live PTY. Status is derived
 * from Map membership so it can never drift. Only the **attached** session
 * streams `session:data`; the rest keep buffering in main (AD-004).
 */
export class SessionManager {
  readonly #running = new Map<string, RunningSession>()
  /** A stopped session's last scrollback, kept so its card can show a 2-line
   * preview. Cleared on respawn/remove; absent for sessions restored from disk
   * (the PTY — and its buffer — never survive a restart). */
  readonly #retained = new Map<string, SessionRingBuffer>()
  #activeId: string | null = null

  constructor(private readonly deps: SessionManagerDeps) {
    // PTYs never survive a restart (no daemon — PRD Out of Scope); normalize any
    // session persisted as running back to stopped so cards reappear respawnable.
    const sessions = deps.config.get().sessions
    if (sessions.some((s) => s.status !== 'stopped')) {
      deps.config.patch({ sessions: sessions.map((s) => ({ ...s, status: 'stopped' as const })) })
    }
  }

  /** Persisted ∪ running, reconciled: status from Map membership, pathMissing from fs. */
  list(): SessionView[] {
    return this.deps.config.get().sessions.map((s) => this.#toView(s))
  }

  spawn(agentName: string, cwd: string, adhocCommand?: string): SessionView {
    const leaf = basename(cwd) || cwd
    const meta: PersistedSession = adhocCommand
      ? {
          id: randomUUID(),
          agent: ADHOC_AGENT,
          cwd,
          title: `${ADHOC_AGENT} · ${leaf}`,
          status: 'running',
          command: adhocCommand
        }
      : {
          id: randomUUID(),
          agent: this.#resolve(agentName).name,
          cwd,
          title: `${this.#resolve(agentName).name} · ${leaf}`,
          status: 'running'
        }
    this.#start(meta) // throws on a bad cwd/shell/agent before anything is persisted
    this.#persistUpsert(meta)
    return this.#toView(meta)
  }

  /** Rename a session's title; trimmed empty input keeps the prior title. */
  rename(id: string, title: string): SessionView {
    const meta = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!meta) throw new Error(`Unknown session: ${id}`)
    const trimmed = title.trim()
    if (trimmed === '' || trimmed === meta.title) return this.#toView(meta)
    const renamed: PersistedSession = { ...meta, title: trimmed }
    this.#persistUpsert(renamed)
    const live = this.#running.get(id)
    if (live) live.meta = { ...live.meta, title: trimmed }
    return this.#toView(renamed)
  }

  /** Clone a session's agent + cwd (+ ad-hoc command) into a new running one. */
  duplicate(id: string): SessionView {
    const src = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!src) throw new Error(`Unknown session: ${id}`)
    const leaf = basename(src.cwd) || src.cwd
    const meta: PersistedSession = {
      id: randomUUID(),
      agent: src.agent,
      cwd: src.cwd,
      title: `${src.agent} · ${leaf}`,
      status: 'running',
      ...(src.command ? { command: src.command } : {})
    }
    this.#start(meta)
    this.#persistUpsert(meta)
    return this.#toView(meta)
  }

  stop(id: string): void {
    const session = this.#running.get(id)
    if (!session) return
    session.handle.kill()
    this.#finalize(id)
  }

  respawn(id: string): SessionView {
    const meta = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!meta) throw new Error(`Unknown session: ${id}`)
    if (this.#running.has(id)) return this.#toView(meta)
    this.#retained.delete(id) // fresh PTY → drop the stale preview buffer
    const live: PersistedSession = { ...meta, status: 'running' }
    this.#start(live)
    this.#persistUpsert(live)
    this.deps.emit('session:status', {
      id,
      status: 'running',
      pathMissing: !this.deps.fsExists(live.cwd)
    })
    return this.#toView(live)
  }

  remove(id: string): void {
    if (this.#running.has(id)) throw new Error(`Cannot remove a running session: ${id}`)
    this.#retained.delete(id)
    const sessions = this.deps.config.get().sessions.filter((s) => s.id !== id)
    this.deps.config.patch({ sessions })
  }

  attach(id: string): void {
    this.#activeId = id
    const session = this.#running.get(id)
    // Replay rides the same ordered data channel as live deltas → no seam race.
    if (session) this.deps.emit('session:data', { id, data: session.buffer.snapshot() })
  }

  detach(id: string): void {
    if (this.#activeId === id) this.#activeId = null
  }

  input(id: string, data: string): void {
    this.#running.get(id)?.handle.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    // node-pty throws on zero/negative dims (a fit() before layout).
    if (cols > 0 && rows > 0) this.#running.get(id)?.handle.resize(cols, rows)
  }

  /** window-all-closed: leave no orphaned shell/agent process. */
  killAll(): void {
    // stop() each session (not Map.clear()) so every status is finalized,
    // persisted, and emitted — otherwise config stays stale until the next
    // restart, observable on macOS where closing the last window doesn't quit.
    for (const id of [...this.#running.keys()]) this.stop(id)
    this.#activeId = null
  }

  #resolve(agentName: string): AgentDef {
    const agent = this.deps.config.get().agents.find((a) => a.name === agentName)
    if (!agent) throw new Error(`Unknown agent: ${agentName}`)
    return agent
  }

  /** Spawn the PTY for a meta and wire its streams; registers the Map entry. */
  #start(meta: PersistedSession): void {
    const shell = this.deps.config.get().ui.defaultShell
    const plan = meta.command
      ? buildRawSpawnPlan(meta.command, meta.cwd, shell)
      : buildSpawnPlan(this.#resolve(meta.agent), meta.cwd, shell)
    const handle = this.deps.port.spawn(plan)
    const buffer = new SessionRingBuffer()
    handle.onData((data) => {
      buffer.append(data)
      if (this.#activeId === meta.id) this.deps.emit('session:data', { id: meta.id, data })
    })
    handle.onExit(({ exitCode }) => this.#finalize(meta.id, exitCode))
    this.#running.set(meta.id, { meta: { ...meta, status: 'running' }, handle, buffer })
  }

  /** Idempotent transition to stopped: drop the Map entry, persist, push status. */
  #finalize(id: string, exitCode?: number): void {
    // wasRunning is false when an explicit stop() already dropped the entry. We
    // still emit session:exit on the real onExit so listeners (TerminalPane's
    // "[shell exited with code …]") fire even after a stop() — only the
    // redundant persist/status push is skipped.
    const session = this.#running.get(id)
    if (session) this.#retained.set(id, session.buffer) // keep scrollback for the preview
    const wasRunning = this.#running.delete(id)
    if (wasRunning) this.#setStatus(id, 'stopped')
    if (exitCode !== undefined) this.deps.emit('session:exit', { id, exitCode })
  }

  #setStatus(id: string, status: SessionStatus): void {
    const sessions = this.deps.config
      .get()
      .sessions.map((s) => (s.id === id ? { ...s, status } : s))
    this.deps.config.patch({ sessions })
    const session = sessions.find((s) => s.id === id)
    if (session) {
      this.deps.emit('session:status', {
        id,
        status,
        pathMissing: !this.deps.fsExists(session.cwd)
      })
    }
  }

  #persistUpsert(meta: PersistedSession): void {
    const sessions = this.deps.config.get().sessions
    const exists = sessions.some((s) => s.id === meta.id)
    const next = exists ? sessions.map((s) => (s.id === meta.id ? meta : s)) : [...sessions, meta]
    this.deps.config.patch({ sessions: next })
  }

  #toView(meta: PersistedSession): SessionView {
    const preview = this.#retained.get(meta.id)?.tail(2)
    return {
      ...meta,
      status: this.#running.has(meta.id) ? 'running' : 'stopped',
      pathMissing: !this.deps.fsExists(meta.cwd),
      ...(preview ? { lastOutput: preview } : {})
    }
  }
}
