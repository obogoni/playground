import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SEEDED_AGENTS } from '../shared/agents'
import type { PersistedSession } from '../shared/config'
import { ConfigStore } from './config-store'
import type { PtyHandle, PtyPort } from './pty-port'
import type { SpawnPlan } from './spawn-plan'
import { ACTIVITY_TOKEN_ENV } from './claude-hook-settings'
import {
  SessionManager,
  SESSION_EXIT_WAIT_MS,
  type ActivityHooks,
  type EmitFn,
  type SessionNames
} from './session-manager'

interface FakeHandle extends PtyHandle {
  plan: SpawnPlan
  killed: boolean
  writes: string[]
  resizes: Array<[number, number]>
  emitData(data: string): void
  emitExit(exitCode: number): void
}

function makeFakeHandle(plan: SpawnPlan): FakeHandle {
  let dataCb: ((d: string) => void) | undefined
  let exitCb: ((e: { exitCode: number }) => void) | undefined
  const h: FakeHandle = {
    plan,
    killed: false,
    writes: [],
    resizes: [],
    onData: (cb) => {
      dataCb = cb
    },
    onExit: (cb) => {
      exitCb = cb
    },
    write: (d) => {
      h.writes.push(d)
    },
    resize: (c, r) => {
      h.resizes.push([c, r])
    },
    kill: () => {
      h.killed = true
    },
    emitData: (d) => dataCb?.(d),
    emitExit: (code) => exitCb?.({ exitCode: code })
  }
  return h
}

function fakePort(): PtyPort & { handles: FakeHandle[]; envs: (NodeJS.ProcessEnv | undefined)[] } {
  const handles: FakeHandle[] = []
  const envs: (NodeJS.ProcessEnv | undefined)[] = []
  return {
    handles,
    envs,
    spawn(plan: SpawnPlan, env?: NodeJS.ProcessEnv): PtyHandle {
      const h = makeFakeHandle(plan)
      handles.push(h)
      envs.push(env)
      return h
    }
  }
}

interface FakeHooks extends ActivityHooks {
  registered: { token: string; sessionId: string }[]
  revoked: string[]
}

function fakeHooks(settingsPath: string | null = 'C:\\app\\hooks.json'): FakeHooks {
  const hooks: FakeHooks = {
    settingsPath,
    registered: [],
    revoked: [],
    register: (token, sessionId) => {
      hooks.registered.push({ token, sessionId })
    },
    revoke: (token) => {
      hooks.revoked.push(token)
    }
  }
  return hooks
}

interface FakeNames extends SessionNames {
  watched: { id: string; claudeSessionId: string }[]
  nudged: string[]
  unwatched: string[]
}

function fakeNames(): FakeNames {
  const names: FakeNames = {
    watched: [],
    nudged: [],
    unwatched: [],
    watch: (id, claudeSessionId) => {
      names.watched.push({ id, claudeSessionId })
    },
    nudge: (id) => {
      names.nudged.push(id)
    },
    unwatch: (id) => {
      names.unwatched.push(id)
    }
  }
  return names
}

interface EmittedEvent {
  channel: string
  payload: unknown
}

function recordingEmit(): EmitFnRecorder {
  const events: EmittedEvent[] = []
  const fn = ((channel: string, payload: unknown) => {
    events.push({ channel, payload })
  }) as EmitFnRecorder
  fn.events = events
  return fn
}
type EmitFnRecorder = ((channel: string, payload: unknown) => void) & { events: EmittedEvent[] }

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs.length = 0
})

// Only the stop-wait tests below install fake timers; restoring here keeps every
// other test on the real clock.
afterEach(() => {
  vi.useRealTimers()
})

function makeManager(
  opts: {
    fsExists?: (p: string) => boolean
    seed?: PersistedSession[]
    hooks?: FakeHooks
    /** `null` builds a manager without the names dep (pre-feature wiring). */
    names?: FakeNames | null
  } = {}
): {
  manager: SessionManager
  config: ConfigStore
  port: PtyPort & { handles: FakeHandle[]; envs: (NodeJS.ProcessEnv | undefined)[] }
  emit: EmitFnRecorder
  hooks: FakeHooks
  names: FakeNames
} {
  const dir = mkdtempSync(join(tmpdir(), 'sm-'))
  dirs.push(dir)
  const config = new ConfigStore(dir)
  if (opts.seed) config.patch({ sessions: opts.seed })
  const port = fakePort()
  const emit = recordingEmit()
  const hooks = opts.hooks ?? fakeHooks()
  const names = opts.names ?? fakeNames()
  const manager = new SessionManager({
    port,
    config,
    // the recorder is intentionally loosely typed; cast to the manager's EmitFn
    emit: emit as unknown as EmitFn,
    fsExists: opts.fsExists ?? (() => true),
    hooks,
    ...(opts.names === null ? {} : { names })
  })
  return { manager, config, port, emit, hooks, names }
}

const CWD = 'C:\\work\\repo-feature'

describe('SessionManager', () => {
  it('spawn resolves the agent, persists, and returns a running view', () => {
    const { manager, config } = makeManager()
    const view = manager.spawn('Claude', CWD)
    expect(view.agent).toBe('Claude')
    expect(view.cwd).toBe(CWD)
    expect(view.status).toBe('running')
    expect(view.title).toContain('Claude')
    expect(config.get().sessions).toHaveLength(1)
    expect(config.get().sessions[0].id).toBe(view.id)
  })

  it('rejects an unknown agent', () => {
    const { manager } = makeManager()
    expect(() => manager.spawn('Nope', CWD)).toThrow(/Unknown agent/)
  })

  it('spawns two independent sessions with distinct ids', () => {
    const { manager, port } = makeManager()
    const a = manager.spawn('Claude', CWD)
    const b = manager.spawn('Codex', 'C:\\work\\other')
    expect(a.id).not.toBe(b.id)
    expect(port.handles).toHaveLength(2)
    expect(
      manager
        .list()
        .map((s) => s.id)
        .sort()
    ).toEqual([a.id, b.id].sort())
  })

  it('stop kills the PTY, drops it to stopped, and persists', () => {
    const { manager, config, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.stop(view.id)
    expect(port.handles[0].killed).toBe(true)
    expect(manager.list()[0].status).toBe('stopped')
    expect(config.get().sessions[0].status).toBe('stopped')
  })

  it('emits session:exit on the real onExit even after an explicit stop()', () => {
    const { manager, port, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.stop(view.id) // drops the Map entry synchronously; exit code unknown yet
    expect(emit.events.some((e) => e.channel === 'session:exit')).toBe(false)
    port.handles[0].emitExit(0) // node-pty fires onExit asynchronously after kill()
    const exits = emit.events.filter((e) => e.channel === 'session:exit')
    expect(exits.at(-1)).toEqual({ channel: 'session:exit', payload: { id: view.id, exitCode: 0 } })
  })

  it('killAll persists every session as stopped (status survives restart)', () => {
    const { manager, config } = makeManager()
    manager.spawn('Claude', CWD)
    manager.spawn('Codex', 'C:\\work\\other')
    manager.killAll()
    expect(config.get().sessions.every((s) => s.status === 'stopped')).toBe(true)
  })

  it('onExit transitions to stopped and emits session:status + session:exit', () => {
    const { manager, port, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    port.handles[0].emitExit(0)
    expect(manager.list()[0].status).toBe('stopped')
    const statuses = emit.events.filter((e) => e.channel === 'session:status')
    expect(statuses.at(-1)).toEqual({
      channel: 'session:status',
      payload: { id: view.id, status: 'stopped', pathMissing: false }
    })
    expect(emit.events.some((e) => e.channel === 'session:exit')).toBe(true)
  })

  it('respawn reuses the same id, agent, and cwd', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.stop(view.id)
    const again = manager.respawn(view.id)
    expect(again.id).toBe(view.id)
    expect(again.agent).toBe('Claude')
    expect(again.cwd).toBe(CWD)
    expect(again.status).toBe('running')
    expect(port.handles).toHaveLength(2) // a fresh PTY
  })

  it('remove is rejected while running and allowed once stopped', () => {
    const { manager, config } = makeManager()
    const view = manager.spawn('Claude', CWD)
    expect(() => manager.remove(view.id)).toThrow(/running/)
    manager.stop(view.id)
    manager.remove(view.id)
    expect(config.get().sessions).toHaveLength(0)
  })

  it('restore normalizes a persisted running status to stopped', () => {
    const seed: PersistedSession[] = [
      { id: 's1', agent: 'Claude', cwd: CWD, title: 'Claude · repo', status: 'running' }
    ]
    const { manager, config } = makeManager({ seed })
    expect(manager.list()[0].status).toBe('stopped')
    expect(config.get().sessions[0].status).toBe('stopped')
  })

  it('list flags pathMissing when the cwd no longer exists', () => {
    const { manager } = makeManager({ fsExists: () => false })
    manager.spawn('Claude', CWD)
    expect(manager.list()[0].pathMissing).toBe(true)
  })

  it('attach replays the buffered snapshot then streams live deltas', () => {
    const { manager, port, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    port.handles[0].emitData('past output\n') // buffered while detached (no active id)
    expect(emit.events.some((e) => e.channel === 'session:data')).toBe(false)
    manager.attach(view.id)
    const first = emit.events.find((e) => e.channel === 'session:data')
    expect(first?.payload).toEqual({ id: view.id, data: 'past output\n' })
    port.handles[0].emitData('live') // now active → streams live
    const live = emit.events.filter((e) => e.channel === 'session:data')
    expect(live.at(-1)?.payload).toEqual({ id: view.id, data: 'live' })
  })

  it('detach stops live streaming but the PTY keeps buffering', () => {
    const { manager, port, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.attach(view.id)
    manager.detach(view.id)
    const before = emit.events.filter((e) => e.channel === 'session:data').length
    port.handles[0].emitData('while detached')
    const after = emit.events.filter((e) => e.channel === 'session:data').length
    expect(after).toBe(before) // no new data emitted
  })

  it('routes input and resize to the addressed session only', () => {
    const { manager, port } = makeManager()
    const a = manager.spawn('Claude', CWD)
    const b = manager.spawn('Codex', 'C:\\work\\other')
    manager.input(a.id, 'ls\r')
    manager.resize(b.id, 120, 40)
    expect(port.handles[0].writes).toEqual(['ls\r'])
    expect(port.handles[1].resizes).toEqual([[120, 40]])
    expect(port.handles[0].resizes).toEqual([])
  })

  it('killAll kills every running PTY and empties the running set', () => {
    const { manager, port } = makeManager()
    manager.spawn('Claude', CWD)
    manager.spawn('Codex', 'C:\\work\\other')
    manager.killAll()
    expect(port.handles.every((h) => h.killed)).toBe(true)
    // every session is now stopped (no live PTY)
    expect(manager.list().every((s) => s.status === 'stopped')).toBe(true)
  })

  // --- AM3: registry from config, default shell, ad-hoc, rename, duplicate, preview ---

  it('resolves agents from config.agents, not an injected constant', () => {
    const { manager, config } = makeManager()
    config.patch({ agents: [...SEEDED_AGENTS, { name: 'Custom', command: 'mytool', args: [] }] })
    const view = manager.spawn('Custom', CWD)
    expect(view.agent).toBe('Custom')
  })

  it('throws once an agent is removed from config.agents', () => {
    const { manager, config } = makeManager()
    config.patch({ agents: SEEDED_AGENTS.filter((a) => a.name !== 'Codex') })
    expect(() => manager.spawn('Codex', CWD)).toThrow(/Unknown agent/)
  })

  it('builds the spawn plan with config.ui.defaultShell', () => {
    const { manager, config, port } = makeManager()
    config.patch({ ui: { defaultShell: 'cmd' } })
    manager.spawn('Claude', CWD)
    expect(port.handles[0].plan.file).toBe('cmd.exe')
  })

  it('ad-hoc spawn persists the command and runs it verbatim', () => {
    const { manager, config, port } = makeManager()
    const view = manager.spawn('Ad-hoc', CWD, 'npm run dev')
    expect(view.agent).toBe('Ad-hoc')
    expect(view.command).toBe('npm run dev')
    expect(config.get().sessions[0].command).toBe('npm run dev')
    expect(port.handles[0].plan.autoCommand).toBe('npm run dev')
  })

  it('ad-hoc respawn re-runs the stored command', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Ad-hoc', CWD, 'npm run dev')
    manager.stop(view.id)
    manager.respawn(view.id)
    expect(port.handles[1].plan.autoCommand).toBe('npm run dev')
  })

  it('rename trims the new title and persists it', () => {
    const { manager, config } = makeManager()
    const view = manager.spawn('Claude', CWD)
    const renamed = manager.rename(view.id, '  My session  ')
    expect(renamed.title).toBe('My session')
    expect(config.get().sessions[0].title).toBe('My session')
  })

  it('rename with empty/whitespace input is a no-op (keeps prior title)', () => {
    const { manager } = makeManager()
    const view = manager.spawn('Claude', CWD)
    const before = view.title
    const renamed = manager.rename(view.id, '   ')
    expect(renamed.title).toBe(before)
  })

  it('duplicate clones agent + cwd into a new independent running session', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    const clone = manager.duplicate(view.id)
    expect(clone.id).not.toBe(view.id)
    expect(clone.agent).toBe('Claude')
    expect(clone.cwd).toBe(CWD)
    expect(clone.status).toBe('running')
    expect(port.handles).toHaveLength(2)
    expect(manager.list()).toHaveLength(2)
  })

  it('exposes lastOutput (tail) once a session is stopped', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    port.handles[0].emitData('alpha\nbravo')
    manager.stop(view.id)
    expect(manager.list()[0].lastOutput).toBe('alpha\nbravo')
  })

  it('clears lastOutput on respawn and has none after restore', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    port.handles[0].emitData('alpha\nbravo')
    manager.stop(view.id)
    manager.respawn(view.id)
    expect(manager.list()[0].lastOutput).toBeUndefined()

    // A session restored from disk (new manager, no retained buffer) has no preview.
    const seed: PersistedSession[] = [
      { id: 's9', agent: 'Claude', cwd: CWD, title: 'Claude · repo', status: 'stopped' }
    ]
    const restored = makeManager({ seed })
    expect(restored.manager.list()[0].lastOutput).toBeUndefined()
  })

  // --- WRFT-05: stop resolves on the PTY's real exit ---

  it('stop finalizes at once but resolves only after the PTY has really exited', async () => {
    vi.useFakeTimers()
    const { manager, config, port } = makeManager()
    const view = manager.spawn('Claude', CWD)

    let settled = false
    const stopped = manager.stop(view.id).then(() => {
      settled = true
    })

    // The status flip stays synchronous — every existing caller keeps working.
    expect(port.handles[0].killed).toBe(true)
    expect(manager.list()[0].status).toBe('stopped')
    expect(config.get().sessions[0].status).toBe('stopped')

    await vi.advanceTimersByTimeAsync(2999)
    expect(settled).toBe(false) // the kill alone is not "really gone"

    port.handles[0].emitExit(0)
    await stopped
    expect(settled).toBe(true)
  })

  it('stop resolves anyway once the 3000 ms wait elapses for a PTY that never exits', async () => {
    vi.useFakeTimers()
    expect(SESSION_EXIT_WAIT_MS).toBe(3000) // pin the literal, not the constant
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)

    let settled = false
    const stopped = manager.stop(view.id).then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(2999)
    expect(settled).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await stopped
    expect(settled).toBe(true)
    expect(port.handles[0].killed).toBe(true) // proceeded without an exit event
  })

  it('killAll stays synchronous so quit never stalls on a PTY that never exits', async () => {
    vi.useFakeTimers()
    const { manager, config, port } = makeManager()
    manager.spawn('Claude', CWD)
    manager.spawn('Codex', 'C:\\work\\other')

    // void, not a promise: awaiting it would add up to 3 s per session to quit.
    expect(manager.killAll()).toBeUndefined()

    expect(port.handles.every((h) => h.killed)).toBe(true)
    expect(manager.list().every((s) => s.status === 'stopped')).toBe(true)
    expect(config.get().sessions.every((s) => s.status === 'stopped')).toBe(true)

    // Drain the two pending waits so nothing outlives the test.
    await vi.advanceTimersByTimeAsync(SESSION_EXIT_WAIT_MS)
  })
})

describe('SessionManager lifecycle observer', () => {
  function withObserver<P extends PtyPort>(
    port: P
  ): {
    manager: SessionManager
    calls: string[]
    port: P
  } {
    const dir = mkdtempSync(join(tmpdir(), 'sm-life-'))
    dirs.push(dir)
    const calls: string[] = []
    const manager = new SessionManager({
      port,
      config: new ConfigStore(dir),
      emit: recordingEmit() as unknown as EmitFn,
      fsExists: () => true,
      lifecycle: {
        started: (meta) => calls.push(`started:${meta.id}:${meta.agent}:${meta.cwd}`),
        ended: (id) => calls.push(`ended:${id}`)
      }
    })
    return { manager, calls, port }
  }

  it('calls started once on spawn with the session meta (TIME-01)', () => {
    const { manager, calls } = withObserver(fakePort())
    const view = manager.spawn('Claude', CWD)
    expect(calls).toEqual([`started:${view.id}:Claude:${CWD}`])
  })

  it('calls started once on duplicate, for the new session (TIME-01)', () => {
    const { manager, calls } = withObserver(fakePort())
    const src = manager.spawn('Claude', CWD)
    calls.length = 0
    const copy = manager.duplicate(src.id)
    expect(calls).toEqual([`started:${copy.id}:Claude:${CWD}`])
  })

  it('calls started once on respawn (TIME-01)', async () => {
    const { manager, calls, port } = withObserver(fakePort())
    const view = manager.spawn('Claude', CWD)
    const stopping = manager.stop(view.id)
    port.handles[0].emitExit(0)
    await stopping
    calls.length = 0
    manager.respawn(view.id)
    expect(calls).toEqual([`started:${view.id}:Claude:${CWD}`])
  })

  it('calls ended once on stop, and not again when the PTY really exits (TIME-02)', async () => {
    const { manager, calls, port } = withObserver(fakePort())
    const view = manager.spawn('Claude', CWD)
    const stopping = manager.stop(view.id)
    port.handles[0].emitExit(0)
    await stopping
    expect(calls.slice(1)).toEqual([`ended:${view.id}`])
  })

  it('calls ended once when the PTY exits on its own (TIME-02)', () => {
    const { manager, calls, port } = withObserver(fakePort())
    const view = manager.spawn('Claude', CWD)
    port.handles[0].emitExit(1)
    expect(calls.slice(1)).toEqual([`ended:${view.id}`])
  })

  it('calls nothing when the spawn throws', () => {
    const failing: PtyPort = {
      spawn: () => {
        throw new Error('shell not found')
      }
    }
    const { manager, calls } = withObserver(failing)
    expect(() => manager.spawn('Claude', CWD)).toThrow(/shell not found/)
    expect(calls).toEqual([])
  })
})

/** Payload shapes from the Claude Code hooks reference. */
function hookEvent(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { session_id: 'claude-side-id', hook_event_name: name, ...extra }
}

const activityEvents = (emit: EmitFnRecorder): unknown[] =>
  emit.events.filter((e) => e.channel === 'session:activity').map((e) => e.payload)

const nameEvents = (emit: EmitFnRecorder): unknown[] =>
  emit.events.filter((e) => e.channel === 'session:name').map((e) => e.payload)

describe('SessionManager activity hooks', () => {
  it('launches Claude with the hook settings and the session token (ACTV-01)', () => {
    const { manager, port, hooks } = makeManager()

    const view = manager.spawn('Claude', CWD)

    expect(port.handles[0].plan.autoCommand).toBe('claude --settings C:\\app\\hooks.json')
    const token = port.envs[0]?.[ACTIVITY_TOKEN_ENV]
    expect(token).toBeTruthy()
    expect(hooks.registered).toEqual([{ token, sessionId: view.id }])
  })

  it('leaves an ad-hoc session untouched (ACTV-02)', () => {
    const { manager, port, hooks } = makeManager()

    manager.spawn('Ad-hoc', CWD, 'claude --resume')

    expect(port.handles[0].plan.autoCommand).toBe('claude --resume')
    expect(port.envs[0]).toBeUndefined()
    expect(hooks.registered).toEqual([])
  })

  it('leaves an agent that is not Claude Code untouched (ACTV-02)', () => {
    const { manager, port, hooks } = makeManager()

    manager.spawn('Codex', CWD)

    expect(port.handles[0].plan.autoCommand).not.toContain('--settings')
    expect(port.envs[0]).toBeUndefined()
    expect(hooks.registered).toEqual([])
  })

  it('still resolves Claude behind a full path and a .exe suffix (ACTV-01)', () => {
    const { manager, config, port } = makeManager()
    config.patch({
      agents: [{ name: 'Claude', command: 'C:\\Users\\dev\\bin\\CLAUDE.EXE', args: [] }]
    })

    manager.spawn('Claude', CWD)

    expect(port.handles[0].plan.autoCommand).toContain('--settings')
  })

  it('injects nothing when the hook server never started (ACTV-29)', () => {
    const { manager, port, hooks } = makeManager({ hooks: fakeHooks(null) })

    manager.spawn('Claude', CWD)

    expect(port.handles[0].plan.autoCommand).not.toContain('--settings')
    expect(port.envs[0]).toBeUndefined()
    expect(hooks.registered).toEqual([])
  })

  it('injects nothing when the agent already carries its own --settings', () => {
    const { manager, config, port, hooks } = makeManager()
    config.patch({
      agents: [{ name: 'Claude', command: 'claude', args: ['--settings', 'C:\\mine.json'] }]
    })

    manager.spawn('Claude', CWD)

    expect(port.handles[0].plan.autoCommand).toBe('claude --settings C:\\mine.json')
    expect(hooks.registered).toEqual([])
  })

  it('folds an event into the session view and pushes it once (ACTV-03, ACTV-05)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)

    manager.handleHookEvent(view.id, hookEvent('SessionStart', { source: 'startup' }))

    expect(manager.list()[0].activity).toEqual({ state: 'waiting', subagents: 0 })
    expect(activityEvents(emit)).toEqual([
      { id: view.id, activity: { state: 'waiting', subagents: 0 } }
    ])
  })

  it('pushes nothing when an event repeats the state the session holds (ACTV-06)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)

    manager.handleHookEvent(view.id, hookEvent('Stop'))
    manager.handleHookEvent(view.id, hookEvent('Stop'))
    manager.handleHookEvent(
      view.id,
      hookEvent('Notification', { notification_type: 'idle_prompt' })
    )

    expect(activityEvents(emit)).toHaveLength(1)
  })

  it('ignores an event for a session that is not running (ACTV-31, ACTV-32)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    void manager.stop(view.id)
    emit.events.length = 0

    manager.handleHookEvent(view.id, hookEvent('Stop'))
    manager.handleHookEvent('no-such-session', hookEvent('Stop'))

    expect(activityEvents(emit)).toEqual([])
    expect(manager.list()[0].activity).toBeUndefined()
  })

  it('revokes the token and drops the activity when the session stops (ACTV-08)', async () => {
    const { manager, port, hooks } = makeManager()
    const view = manager.spawn('Claude', CWD)
    const token = port.envs[0]?.[ACTIVITY_TOKEN_ENV]
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))

    await manager.stop(view.id)

    expect(hooks.revoked).toEqual([token])
    expect(manager.list()[0]).toMatchObject({ status: 'stopped' })
    expect(manager.list()[0].activity).toBeUndefined()
  })

  it('issues a fresh token on respawn and starts with no activity (ACTV-13)', async () => {
    const { manager, port, hooks } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('Stop'))
    await manager.stop(view.id)

    manager.respawn(view.id)

    const tokens = hooks.registered.map((r) => r.token)
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).not.toBe(tokens[1])
    expect(port.envs[1]?.[ACTIVITY_TOKEN_ENV]).toBe(tokens[1])
    expect(manager.list()[0].activity).toBeUndefined()
  })

  it('keeps a running session on the launch it started with when the registry changes (ACTV-30)', () => {
    const { manager, config, port } = makeManager()
    const view = manager.spawn('Claude', CWD)

    config.patch({ agents: [{ name: 'Claude', command: 'other-cli', args: [] }] })
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))

    expect(port.handles[0].plan.autoCommand).toContain('--settings')
    expect(manager.list()[0].activity).toEqual({ state: 'working', subagents: 0 })
  })

  it('treats the keystroke that answers a permission dialog as work resuming (ACTV-12)', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('PermissionRequest', { tool_name: 'Bash' }))

    manager.input(view.id, '1')

    expect(manager.list()[0].activity).toEqual({ state: 'working', subagents: 0 })
    expect(port.handles[0].writes).toEqual(['1'])
  })

  it('does not let a mouse report answer for the user (ACTV-33)', () => {
    const { manager, port } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('PermissionRequest', { tool_name: 'Bash' }))

    manager.input(view.id, '\x1b[<0;10;20M')

    expect(manager.list()[0].activity).toMatchObject({ state: 'needs-approval' })
    expect(port.handles[0].writes).toEqual(['\x1b[<0;10;20M'])
  })

  it('never writes activity to the config (ACTV-09)', () => {
    const { manager, config } = makeManager()
    const view = manager.spawn('Claude', CWD)

    manager.handleHookEvent(view.id, hookEvent('PreToolUse', { tool_name: 'Bash' }))
    manager.handleHookEvent(view.id, hookEvent('SubagentStart', { agent_id: 'a1' }))

    expect(manager.list()[0].activity).toEqual({ state: 'working', tool: 'Bash', subagents: 1 })
    for (const session of config.get().sessions) {
      expect(session).not.toHaveProperty('activity')
    }
  })
})

describe('SessionManager — session names (AD-040)', () => {
  const CLAUDE_ID = 'claude-side-id'

  it('records the session_id of the first hook event and watches it (SNAME-08, SNAME-09)', () => {
    const { manager, names } = makeManager()
    const view = manager.spawn('Claude', CWD)

    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))

    expect(names.watched).toEqual([{ id: view.id, claudeSessionId: CLAUDE_ID }])
    expect(names.nudged).toEqual([])
  })

  it('nudges, without re-watching, while a known session is still unnamed (SNAME-09)', () => {
    const { manager, names } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))

    manager.handleHookEvent(view.id, hookEvent('PreToolUse', { tool_name: 'Bash' }))

    expect(names.watched).toHaveLength(1)
    expect(names.nudged).toEqual([view.id])
  })

  it('re-watches with the new session_id after /clear or /resume (edge case)', () => {
    const { manager, names } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))

    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit', { session_id: 'claude-new' }))

    expect(names.watched).toEqual([
      { id: view.id, claudeSessionId: CLAUDE_ID },
      { id: view.id, claudeSessionId: 'claude-new' }
    ])
    expect(names.nudged).toEqual([])
  })

  it('neither watches nor nudges once the session has its name', () => {
    const { manager, names } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    manager.handleHookEvent(view.id, hookEvent('Stop'))

    expect(names.watched).toHaveLength(1)
    expect(names.nudged).toEqual([])
  })

  it.each([
    ['missing', { session_id: undefined }],
    ['not a string', { session_id: 42 }],
    ['empty', { session_id: '' }]
  ])('ignores a payload whose session_id is %s (SNAME-08)', (_, extra) => {
    const { manager, names } = makeManager()
    const view = manager.spawn('Claude', CWD)

    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit', extra))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(names.watched).toEqual([])
    expect(names.nudged).toEqual([])
    expect(manager.list()[0].name).toBeUndefined()
  })

  it('sets the name from the listing, pushes it once, and lists it (SNAME-01, SNAME-11)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))

    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(manager.list()[0].name).toBe('alpha')
    expect(nameEvents(emit)).toEqual([{ id: view.id, name: 'alpha' }])
  })

  it('pushes nothing when a listing repeats the name the session holds (SNAME-11)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(nameEvents(emit)).toHaveLength(1)
  })

  it('updates the name in place when a later listing renames the session (SNAME-02)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'repos-a2']]))

    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(manager.list()[0].name).toBe('alpha')
    expect(nameEvents(emit)).toEqual([
      { id: view.id, name: 'repos-a2' },
      { id: view.id, name: 'alpha' }
    ])
  })

  it('clears the name when a successful listing no longer carries the id (SNAME-11)', () => {
    const { manager, emit } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    manager.applyNames(new Map([['someone-else', 'beta']]))

    expect(manager.list()[0].name).toBeUndefined()
    expect(nameEvents(emit)).toEqual([
      { id: view.id, name: 'alpha' },
      { id: view.id, name: null }
    ])
  })

  it('names both app sessions that share one session_id (edge case)', () => {
    const { manager } = makeManager()
    const first = manager.spawn('Claude', CWD)
    const second = manager.spawn('Claude', CWD)
    manager.handleHookEvent(first.id, hookEvent('UserPromptSubmit'))
    manager.handleHookEvent(second.id, hookEvent('UserPromptSubmit'))

    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(manager.list().map((s) => s.name)).toEqual(['alpha', 'alpha'])
  })

  it('skips a running session that has reported no session_id yet (SNAME-03, SNAME-11)', () => {
    const { manager, emit } = makeManager()
    manager.spawn('Claude', CWD)

    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(manager.list()[0].name).toBeUndefined()
    expect(nameEvents(emit)).toEqual([])
  })

  it('drops the name and unwatches when the session stops (SNAME-04)', async () => {
    const { manager, emit, names } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))
    emit.events.length = 0

    await manager.stop(view.id)

    expect(names.unwatched).toEqual([view.id])
    expect(manager.list()[0]).toMatchObject({ status: 'stopped' })
    expect(manager.list()[0].name).toBeUndefined()
    expect(nameEvents(emit)).toEqual([])
  })

  it('drops the name and unwatches when the PTY exits on its own (SNAME-04)', () => {
    const { manager, port, names } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    port.handles[0].emitExit(0)

    expect(names.unwatched).toEqual([view.id])
    expect(manager.list()[0].name).toBeUndefined()
  })

  it('starts a respawned session unnamed until its own hooks report an id (SNAME-03)', async () => {
    const { manager, names } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))
    await manager.stop(view.id)

    manager.respawn(view.id)
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(manager.list()[0].name).toBeUndefined()
    expect(names.watched).toHaveLength(1)
  })

  it('never writes the name to the config, and a restored session has none (SNAME-15)', () => {
    const { manager, config } = makeManager()
    const view = manager.spawn('Claude', CWD)
    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    for (const session of config.get().sessions) {
      expect(session).not.toHaveProperty('name')
    }
    const restored = makeManager({ seed: config.get().sessions })
    expect(restored.manager.list()[0].name).toBeUndefined()
  })

  it('works without a names collaborator, as before the feature', () => {
    const { manager, emit } = makeManager({ names: null })
    const view = manager.spawn('Claude', CWD)

    manager.handleHookEvent(view.id, hookEvent('UserPromptSubmit'))
    manager.handleHookEvent(view.id, hookEvent('Stop'))
    manager.applyNames(new Map([[CLAUDE_ID, 'alpha']]))

    expect(manager.list()[0].name).toBe('alpha')
    expect(nameEvents(emit)).toEqual([{ id: view.id, name: 'alpha' }])
  })
})
