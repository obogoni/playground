import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { commandKey } from '../shared/command-key'
import type { PersistedSession, SessionStatus, SessionView } from '../shared/config'
import type { IpcEvent, IpcEvents } from '../shared/ipc-contract'
import type { SessionTask } from '../shared/tasks'
import { applyHookEvent, applyKeystroke, sameView, type MachineState } from './activity-machine'
import type { ActivityChange } from './activity-notification'
import { ACTIVITY_TOKEN_ENV, TASK_URL_ENV } from './claude-hook-settings'
import type { ConfigStore } from './config-store'
import { isKeystroke } from './keystroke'
import type { PtyHandle, PtyPort } from './pty-port'
import { SessionRingBuffer } from './session-ring-buffer'
import { buildRawSpawnPlan, buildSpawnPlan, type AgentDef } from './spawn-plan'

/** Typed main→renderer push, bound to the live window's webContents by index.ts. */
export type EmitFn = <E extends IpcEvent>(channel: E, payload: IpcEvents[E]) => void

/** The activity hook server, as this module needs it (AD-019). */
export interface ActivityHooks {
  /** Generated `--settings` file; `null` when the server never started, which
   *  degrades every session to the pre-feature rendering (ACTV-29). */
  settingsPath: string | null
  /** The server's task link url, published with `settingsPath`; `null` until then (ATSK-01). */
  taskUrl: string | null
  register(token: string, sessionId: string): void
  revoke(token: string): void
}

/**
 * The session-name poller, as this module needs it (AD-040). The manager says
 * which app sessions hold a Claude `session_id`; the poller reads the listing
 * and hands the names back through `applyNames`.
 */
export interface SessionNames {
  watch(id: string, claudeSessionId: string): void
  unwatch(id: string): void
  /** A hook event for a watched session that still has no name. */
  nudge(id: string): void
}

/** The only agent command that publishes lifecycle hooks the app consumes. */
const HOOKED_COMMAND = 'claude'

export interface SessionManagerDeps {
  port: PtyPort
  config: ConfigStore
  emit: EmitFn
  /** Injectable for reconcile tests (fs.existsSync in production). */
  fsExists: (path: string) => boolean
  /** Absent means no session reports activity — the pre-feature behaviour. */
  hooks?: ActivityHooks
  /** Told about every activity transition that changed the view; the notifier (NOTF). */
  onActivityChange?: (change: ActivityChange) => void
  /** Absent means no session is named — the pre-feature rendering. */
  names?: SessionNames
  /** Told when a session's PTY starts and ends (the time tracker, AD-021); absent = no observer. */
  lifecycle?: SessionLifecycle
}

/** Observer of PTY runs: `started` once per spawn/duplicate/respawn, `ended` once per run. */
export interface SessionLifecycle {
  started(meta: PersistedSession): void
  ended(id: string): void
  /** The session's hand-set task changed, `null` = From branch (HTSK-12, HTSK-13). */
  taskChanged(id: string, task: SessionTask | null): void
}

/** A copy of `meta` carrying `task`, or without the `task` key for `null`. */
function withTask<T extends PersistedSession>(meta: T, task: SessionTask | null): T {
  const next = { ...meta }
  if (task) next.task = task
  else delete next.task
  return next
}

/** Stored on ad-hoc sessions in place of a registry agent name. */
const ADHOC_AGENT = 'Ad-hoc'

/**
 * How long `stop` waits for the PTY's *real* exit before giving up and letting
 * the caller proceed (WRFT-05 AC 1/2). A wedged child must not block a worktree
 * removal forever — the deleter's own retry loop and leftover report cover the
 * residue.
 */
export const SESSION_EXIT_WAIT_MS = 3000

/** A session with a live PTY. Stopped/restored sessions live only in config. */
interface RunningSession {
  meta: PersistedSession
  handle: PtyHandle
  buffer: SessionRingBuffer
  /** Resolves when the PTY's own onExit fires — what `stop` actually waits on. */
  exited: Promise<void>
  /** Hook token for this run; `null` when the session reports no activity. */
  token: string | null
  /** What the agent is doing, folded from its hooks; `null` until the first event. */
  activity: MachineState | null
  /** Claude's `session_id`, from the latest hook payload; `null` until one arrives. */
  claudeSessionId: string | null
  /** Last name the listing reported for `claudeSessionId`; `null` when none. */
  name: string | null
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
  /** Ids whose PTY the host is still creating; a respawn of one is a no-op (PTYH-28). */
  readonly #starting = new Set<string>()
  /** Bumped by `killAll`; a spawn that started before the bump is killed on arrival (PTYH-19). */
  // SPEC_DEVIATION: design.md names a `#disposed` flag set by killAll.
  // Reason: a counter kills the same in-flight spawns but does not refuse every
  // later spawn, which a sticky flag would after a killAll that is not a quit.
  #generation = 0

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

  async spawn(
    agentName: string,
    cwd: string,
    adhocCommand?: string,
    task?: SessionTask
  ): Promise<SessionView> {
    const leaf = basename(cwd) || cwd
    const meta: PersistedSession = adhocCommand
      ? {
          id: randomUUID(),
          agent: ADHOC_AGENT,
          cwd,
          title: `${ADHOC_AGENT} · ${leaf}`,
          status: 'running',
          command: adhocCommand,
          ...(task ? { task } : {})
        }
      : {
          id: randomUUID(),
          agent: this.#resolve(agentName).name,
          cwd,
          title: `${this.#resolve(agentName).name} · ${leaf}`,
          status: 'running',
          ...(task ? { task } : {})
        }
    await this.#start(meta) // rejects on a bad cwd/shell/agent before anything is persisted (PTYH-14)
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

  /**
   * Link a session to a task by hand, or back to its branch with `null`. Saved
   * whatever the session's state; the tracker decides what a running, paused or
   * stopped session does with it (HTSK-12, HTSK-13, HTSK-15, HTSK-16, HTSK-17).
   */
  setTask(id: string, task: SessionTask | null): SessionView {
    const meta = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!meta) throw new Error(`Unknown session: ${id}`)
    const next = withTask(meta, task)
    this.#persistUpsert(next)
    const live = this.#running.get(id)
    if (live) live.meta = withTask(live.meta, task)
    this.deps.lifecycle?.taskChanged(id, task)
    this.deps.emit('session:task', { id, task })
    return this.#toView(next)
  }

  /** Clone a session's agent + cwd (+ ad-hoc command, + task link) into a new running one. */
  async duplicate(id: string): Promise<SessionView> {
    const src = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!src) throw new Error(`Unknown session: ${id}`)
    const leaf = basename(src.cwd) || src.cwd
    const meta: PersistedSession = {
      id: randomUUID(),
      agent: src.agent,
      cwd: src.cwd,
      title: `${src.agent} · ${leaf}`,
      status: 'running',
      ...(src.command ? { command: src.command } : {}),
      ...(src.task ? { task: src.task } : {})
    }
    await this.#start(meta)
    this.#persistUpsert(meta)
    return this.#toView(meta)
  }

  /**
   * Kill the PTY and resolve once it has **really exited** (WRFT-05). Killing a
   * shell does not kill its children, so a caller that deletes files the moment
   * `stop` returns used to race handles that were still open — the removal then
   * failed on a lock the app itself was holding.
   *
   * The status flip stays synchronous: `#finalize` runs before the first await,
   * so every existing caller that reads `list()` right after `stop` still sees
   * `stopped`. Only the returned promise is new, and it means "really gone".
   */
  async stop(id: string): Promise<void> {
    const session = this.#running.get(id)
    if (!session) return
    // Captured before #finalize drops the Map entry.
    const exited = session.exited
    session.handle.kill()
    this.#finalize(id)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        exited,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, SESSION_EXIT_WAIT_MS)
          // Unlike lesson L-003's grace timer — whose unref let real work be
          // skipped when the process was free to exit — this timer only races a
          // promise a live caller is already awaiting, so unref cannot skip
          // anything. It just stops a PTY that never exits from pinning the
          // event loop open.
          timer.unref?.()
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  async respawn(id: string): Promise<SessionView> {
    const meta = this.deps.config.get().sessions.find((s) => s.id === id)
    if (!meta) throw new Error(`Unknown session: ${id}`)
    if (this.#running.has(id) || this.#starting.has(id)) return this.#toView(meta)
    this.#retained.delete(id) // fresh PTY → drop the stale preview buffer
    const live: PersistedSession = { ...meta, status: 'running' }
    await this.#start(live) // a failed spawn persists nothing: the session stays stopped (PTYH-14)
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
    const session = this.#running.get(id)
    if (!session) return
    session.handle.write(data)
    // The keystroke that answers a permission dialog is the only signal that
    // work resumed: no hook fires between the approval and the tool's end
    // (ACTV-12). Mouse and focus reports ride this same channel, so they must
    // not answer for the user (ACTV-33).
    if (isKeystroke(data)) this.#setActivity(session, applyKeystroke(session.activity))
  }

  /** A hook event for one session, routed here by the activity hook server. */
  handleHookEvent(sessionId: string, payload: Record<string, unknown>): void {
    const session = this.#running.get(sessionId)
    if (!session) return
    this.#setActivity(session, applyHookEvent(session.activity, payload))
    // The most recent id wins: `/clear` and `/resume` change it mid-session, and
    // the listing keys on it (SNAME-08). A first or changed id needs a listing;
    // a repeat id only matters while the session is still unnamed (SNAME-09).
    const claudeId = payload.session_id
    if (typeof claudeId !== 'string' || claudeId === '') return
    if (claudeId !== session.claudeSessionId) {
      session.claudeSessionId = claudeId
      this.deps.names?.watch(sessionId, claudeId)
    } else if (session.name === null) {
      this.deps.names?.nudge(sessionId)
    }
  }

  /**
   * One successful listing, `sessionId → name`. Every running session with an
   * id takes the entry's name or loses its own when the entry is gone — the
   * listing is the source of truth for "live"; a failed call never reaches
   * here, so a hiccup cannot drop a name (SNAME-11, SNAME-12).
   */
  applyNames(names: Map<string, string>): void {
    for (const session of this.#running.values()) {
      if (session.claudeSessionId === null) continue
      this.#setName(session, names.get(session.claudeSessionId) ?? null)
    }
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
    //
    // Deliberately fire-and-forget: stop() now waits up to SESSION_EXIT_WAIT_MS
    // for a real exit, and quit must not stall 3 s per session. Nothing is lost
    // by not awaiting — the kill is issued and #finalize has already persisted
    // every status synchronously before stop() suspends. Only the *removal*
    // path needs the exit guarantee; quit does not.
    for (const id of [...this.#running.keys()]) void this.stop(id)
    this.#activeId = null
    // Spawns still in flight resolve after this point; #start kills them on arrival.
    this.#generation++
  }

  #resolve(agentName: string): AgentDef {
    const agent = this.deps.config.get().agents.find((a) => a.name === agentName)
    if (!agent) throw new Error(`Unknown agent: ${agentName}`)
    return agent
  }

  /** Spawn the PTY for a meta and wire its streams; registers the Map entry. */
  async #start(meta: PersistedSession): Promise<void> {
    const shell = this.deps.config.get().ui.defaultShell
    // Resolved here, once, so a registry edit mid-session cannot change how a
    // running session was launched (ACTV-30).
    const agent = meta.command ? null : this.#resolve(meta.agent)
    const token = agent && this.#hookable(agent) ? randomUUID() : null
    if (token !== null) this.deps.hooks?.register(token, meta.id)
    const plan = meta.command
      ? buildRawSpawnPlan(meta.command, meta.cwd, shell)
      : buildSpawnPlan(token === null ? agent! : this.#withHookSettings(agent!), meta.cwd, shell)
    const taskUrl = this.deps.hooks?.taskUrl
    const generation = this.#generation
    this.#starting.add(meta.id)
    let handle: PtyHandle
    try {
      handle = await this.deps.port.spawn(
        plan,
        token === null
          ? undefined
          : { [ACTIVITY_TOKEN_ENV]: token, ...(taskUrl ? { [TASK_URL_ENV]: taskUrl } : {}) }
      )
    } catch (err) {
      // The run never existed, so its token must not be accepted (PTYH-16).
      if (token !== null) this.deps.hooks?.revoke(token)
      throw err
    } finally {
      this.#starting.delete(meta.id)
    }
    if (generation !== this.#generation) {
      // killAll ran while the host was creating this PTY: leave nothing running (PTYH-19).
      handle.kill()
      if (token !== null) this.deps.hooks?.revoke(token)
      throw new Error('Sessions were stopped while this one was starting')
    }
    const buffer = new SessionRingBuffer()
    handle.onData((data) => {
      buffer.append(data)
      if (this.#activeId === meta.id) this.deps.emit('session:data', { id: meta.id, data })
    })
    let markExited = (): void => {}
    const exited = new Promise<void>((resolve) => {
      markExited = resolve
    })
    handle.onExit(({ exitCode, hostExited }) => {
      markExited()
      this.#finalize(meta.id, exitCode, hostExited)
    })
    this.#running.set(meta.id, {
      meta: { ...meta, status: 'running' },
      handle,
      buffer,
      exited,
      token,
      activity: null,
      claudeSessionId: null,
      name: null
    })
    this.deps.lifecycle?.started(meta)
  }

  /**
   * Whether this agent's launch carries the app's hook settings. Only Claude
   * Code publishes the lifecycle hooks the app reads, and only when the server
   * is up (ACTV-01, ACTV-02, ACTV-29). An agent the user already launches with
   * its own `--settings` is left alone: two flags have no documented precedence.
   */
  #hookable(agent: AgentDef): boolean {
    return (
      this.deps.hooks?.settingsPath != null &&
      commandKey(agent.command) === HOOKED_COMMAND &&
      !agent.args.includes('--settings')
    )
  }

  #withHookSettings(agent: AgentDef): AgentDef {
    return { ...agent, args: [...agent.args, '--settings', this.deps.hooks!.settingsPath!] }
  }

  /**
   * Idempotent transition to stopped: drop the Map entry, persist, push status.
   * `hostExited` marks a run the PTY host took down with it (PTYH-22), so the
   * terminal can say so instead of printing an exit code (PTYH-23).
   */
  #finalize(id: string, exitCode?: number, hostExited?: true): void {
    // wasRunning is false when an explicit stop() already dropped the entry. We
    // still emit session:exit on the real onExit so listeners (TerminalPane's
    // "[shell exited with code …]") fire even after a stop() — only the
    // redundant persist/status push is skipped.
    const session = this.#running.get(id)
    if (session) {
      this.#retained.set(id, session.buffer) // keep scrollback for the preview
      // Stop wins: the token is dead, so a late hook from the dying agent is
      // rejected, and the activity goes with the PTY (ACTV-08, ACTV-31).
      if (session.token !== null) this.deps.hooks?.revoke(session.token)
      session.activity = null
      // No `session:name` push: the `session:status` refetch already renders
      // the stopped row without a name (SNAME-04).
      session.name = null
      session.claudeSessionId = null
      this.deps.names?.unwatch(id)
    }
    const wasRunning = this.#running.delete(id)
    if (wasRunning) this.#setStatus(id, 'stopped')
    if (wasRunning) this.deps.lifecycle?.ended(id)
    if (exitCode !== undefined) {
      this.deps.emit('session:exit', hostExited ? { id, exitCode, hostExited } : { id, exitCode })
    }
  }

  /** Adopt a name and push it only when it changed (SNAME-11). */
  #setName(session: RunningSession, next: string | null): void {
    if (session.name === next) return
    session.name = next
    this.deps.emit('session:name', { id: session.meta.id, name: next })
  }

  /** Adopt a folded state and push it only when the rendering would change (ACTV-06). */
  #setActivity(session: RunningSession, next: MachineState | null): void {
    const before = session.activity?.view ?? null
    const after = next?.view ?? null
    session.activity = next
    if (sameView(before, after)) return
    const { id, agent, title, cwd } = session.meta
    this.deps.emit('session:activity', { id, activity: after })
    // Only transitions reach the listener: #finalize drops the activity without
    // coming through here, so a stopping PTY never notifies (NOTF-26).
    try {
      this.deps.onActivityChange?.({
        id,
        agent,
        title,
        cwd,
        before,
        after,
        attached: this.#activeId === id,
        task: session.meta.task ?? null
      })
    } catch (err) {
      console.error('[notifications] activity listener failed', err)
    }
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
    const live = this.#running.get(meta.id)
    return {
      ...meta,
      status: live ? 'running' : 'stopped',
      pathMissing: !this.deps.fsExists(meta.cwd),
      ...(preview ? { lastOutput: preview } : {}),
      ...(live?.activity ? { activity: live.activity.view } : {}),
      ...(live?.name ? { name: live.name } : {})
    }
  }
}
