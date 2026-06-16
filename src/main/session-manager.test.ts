import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SEEDED_AGENTS } from '../shared/agents'
import type { PersistedSession } from '../shared/config'
import { ConfigStore } from './config-store'
import type { PtyHandle, PtyPort } from './pty-port'
import type { SpawnPlan } from './spawn-plan'
import { SessionManager, type EmitFn } from './session-manager'

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

function fakePort(): PtyPort & { handles: FakeHandle[] } {
  const handles: FakeHandle[] = []
  return {
    handles,
    spawn(plan: SpawnPlan): PtyHandle {
      const h = makeFakeHandle(plan)
      handles.push(h)
      return h
    }
  }
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

function makeManager(opts: { fsExists?: (p: string) => boolean; seed?: PersistedSession[] } = {}): {
  manager: SessionManager
  config: ConfigStore
  port: PtyPort & { handles: FakeHandle[] }
  emit: EmitFnRecorder
} {
  const dir = mkdtempSync(join(tmpdir(), 'sm-'))
  dirs.push(dir)
  const config = new ConfigStore(dir)
  if (opts.seed) config.patch({ sessions: opts.seed })
  const port = fakePort()
  const emit = recordingEmit()
  const manager = new SessionManager({
    port,
    config,
    // the recorder is intentionally loosely typed; cast to the manager's EmitFn
    emit: emit as unknown as EmitFn,
    fsExists: opts.fsExists ?? (() => true),
    seededAgents: SEEDED_AGENTS
  })
  return { manager, config, port, emit }
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
})
