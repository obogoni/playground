import { describe, expect, it } from 'vitest'
import {
  AgentStepError,
  AgentStepRunner,
  type AgentChild,
  type AgentSpawn,
  type AgentStepRunnerDeps
} from './agent-step-runner'
import type { EmitResultPayload, JsonSchema } from './emit-result-schema'
import type { McpResultServer } from './mcp-result-server'
import { CancellationError } from './workflow-ctx'

// A representative step `expect`: the structured data the agent must emit.
const NUM_EXPECT: JsonSchema = {
  type: 'object',
  properties: { answer: { type: 'number' } },
  required: ['answer']
}

/** The `--output-format json` stdout envelope the headless run prints. */
const envelope = (sessionId: string, result = 'ok'): string =>
  JSON.stringify({ session_id: sessionId, result })

// --- fake MCP result server (hand-rolled, mirrors session-manager.test.ts fakes) ---

interface FakeReg {
  token: string
  expect: JsonSchema
  resolve: (p: EmitResultPayload) => void
  reject: (e: Error) => void
  settled: boolean
}

class FakeServer implements McpResultServer {
  readonly regs: FakeReg[] = []
  readonly revoked: string[] = []
  startCalls = 0

  async start(): Promise<{ url: string; port: number }> {
    this.startCalls++
    return { url: 'http://127.0.0.1:9100/mcp', port: 9100 }
  }

  register(token: string, expect: JsonSchema): Promise<EmitResultPayload> {
    let resolve!: (p: EmitResultPayload) => void
    let reject!: (e: Error) => void
    const p = new Promise<EmitResultPayload>((res, rej) => {
      resolve = res
      reject = rej
    })
    this.regs.push({ token, expect, resolve, reject, settled: false })
    return p
  }

  revoke(token: string): void {
    this.revoked.push(token)
    const reg = this.regs.find((r) => r.token === token)
    if (reg && !reg.settled) {
      reg.settled = true
      reg.reject(new Error(`token revoked: ${token}`))
    }
  }

  async stop(): Promise<void> {
    // no-op: the fake holds no real listener to close
  }

  /** Test helper: simulate a valid emit_result on the most recent registration. */
  emitLatest(payload: EmitResultPayload): void {
    const reg = this.regs[this.regs.length - 1]
    reg.settled = true
    reg.resolve(payload)
  }
}

// --- fake spawn seam: a scripted program drives each spawned child ---

interface SpawnCall {
  bin: string
  argv: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

interface ChildController {
  stdout(chunk: string): void
  stderr(chunk: string): void
  close(code: number | null): void
}

type Program = (ctl: ChildController) => void

function makeFakeSpawn(programs: Program[]): {
  spawn: AgentSpawn
  calls: SpawnCall[]
  kills: number[]
} {
  const calls: SpawnCall[] = []
  const kills: number[] = []
  const spawn: AgentSpawn = (bin, argv, opts) => {
    const idx = calls.length
    calls.push({ bin, argv, cwd: opts.cwd, env: opts.env })
    let outCb: (c: string) => void = () => {}
    let errCb: (c: string) => void = () => {}
    let closeCb: (code: number | null) => void = () => {}
    const child: AgentChild = {
      onStdout: (cb) => (outCb = cb),
      onStderr: (cb) => (errCb = cb),
      onClose: (cb) => (closeCb = cb),
      kill: () => kills.push(idx)
    }
    const ctl: ChildController = {
      stdout: (c) => outCb(c),
      stderr: (c) => errCb(c),
      close: (code) => closeCb(code)
    }
    // Run the program AFTER the runner has synchronously wired its handlers.
    const program = programs[idx]
    if (program) queueMicrotask(() => program(ctl))
    return child
  }
  return { spawn, calls, kills }
}

/** Fresh sequential tokens: tok-1, tok-2, … */
function tokenGen(): () => string {
  let n = 0
  return () => `tok-${++n}`
}

function makeRunner(
  server: FakeServer,
  spawn: AgentSpawn,
  overrides?: Partial<AgentStepRunnerDeps>
): AgentStepRunner {
  return new AgentStepRunner({
    server,
    spawn,
    resolveClaude: () => 'claude',
    genToken: tokenGen(),
    ...overrides
  })
}

describe('AgentStepRunner — happy path (WF3-01, WF3-16)', () => {
  it('resolves { status:"done", data, sessionId } and spawns the built command', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 42 } })
        ctl.stdout(envelope('sess-1'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    const res = await runner.run({ prompt: 'What is 6*7?', expect: NUM_EXPECT, cwd: '/repo' })

    expect(res).toEqual({ status: 'done', data: { answer: 42 }, sessionId: 'sess-1' })
    expect(calls).toHaveLength(1)
    expect(calls[0].bin).toBe('claude')
    expect(calls[0].cwd).toBe('/repo')
    expect(calls[0].argv).toContain('--print')
    expect(calls[0].argv).toContain('What is 6*7?')
    // The step's token is revoked once resolved (WF3-09 cleanup).
    expect(server.revoked).toContain('tok-1')
  })

  it('spawns with an auth-scrubbed env (no ANTHROPIC_API_KEY) (WF3-02)', async () => {
    const prev = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-should-be-scrubbed'
    try {
      const server = new FakeServer()
      const { spawn, calls } = makeFakeSpawn([
        (ctl) => {
          server.emitLatest({ status: 'done', data: { answer: 1 } })
          ctl.stdout(envelope('sess-env'))
          ctl.close(0)
        }
      ])
      const runner = makeRunner(server, spawn)

      await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })

      expect(calls[0].env.ANTHROPIC_API_KEY).toBeUndefined()
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prev
    }
  })

  it('passes the permission preset through to the built argv (WF3-01)', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 1 } })
        ctl.stdout(envelope('sess-bypass'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo', permission: 'bypass' })

    expect(calls[0].argv).toContain('bypassPermissions')
  })
})

describe('AgentStepRunner — blocked is a first-class returned value (WF3-17)', () => {
  it('resolves { status:"blocked", question, sessionId } as-is, without throwing', async () => {
    const server = new FakeServer()
    const { spawn } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'Which environment?' })
        ctl.stdout(envelope('sess-blk'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    const res = await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })

    expect(res).toEqual({
      status: 'blocked',
      question: 'Which environment?',
      sessionId: 'sess-blk'
    })
  })
})

describe('AgentStepRunner — one corrective retry (WF3-04)', () => {
  it('resumes the session once when the first pass emits nothing, then resolves', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      // First pass: prints an envelope but never calls emit_result.
      (ctl) => {
        ctl.stdout(envelope('sess-3'))
        ctl.close(0)
      },
      // Retry (--resume): emits a conforming payload.
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 7 } })
        ctl.stdout(envelope('sess-3b'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    const res = await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })

    expect(res).toEqual({ status: 'done', data: { answer: 7 }, sessionId: 'sess-3b' })
    expect(calls).toHaveLength(2)
    // The retry resumes the FIRST pass's session.
    expect(calls[1].argv.slice(0, 2)).toEqual(['--resume', 'sess-3'])
  })
})

describe('AgentStepRunner — fails when no valid emit after the retry (WF3-05)', () => {
  it('throws AgentStepError carrying { stdout, stderr, code } from the last attempt', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        ctl.stdout(envelope('sess-4'))
        ctl.stderr('warn')
        ctl.close(0)
      },
      (ctl) => {
        ctl.stdout(envelope('sess-4b'))
        ctl.stderr('boom')
        ctl.close(3)
      }
    ])
    const runner = makeRunner(server, spawn)

    let caught: unknown
    try {
      await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(AgentStepError)
    expect((caught as AgentStepError).detail).toEqual({
      stdout: envelope('sess-4b'),
      stderr: 'boom',
      code: 3
    })
    expect(calls).toHaveLength(2) // exactly one corrective retry, no more
  })
})

describe('AgentStepRunner — invalid `expect` fails before spawn (WF3-24)', () => {
  it('throws on an uncompilable schema without spawning or registering', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([])
    const runner = makeRunner(server, spawn)

    await expect(
      runner.run({ prompt: 'p', expect: { type: 'not-a-real-type' }, cwd: '/repo' })
    ).rejects.toThrow()
    expect(calls).toHaveLength(0)
    expect(server.regs).toHaveLength(0)
  })
})

describe('AgentStepRunner — unresolved binary fails before spawn (WF3-23)', () => {
  it('throws "agent binary not found" and never spawns', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([])
    const runner = makeRunner(server, spawn, {
      resolveClaude: () => {
        throw new Error('where claude: not found')
      }
    })

    await expect(runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })).rejects.toThrow(
      /agent binary not found/
    )
    expect(calls).toHaveLength(0)
    // The token registered before the binary check is revoked in finally.
    expect(server.revoked).toContain('tok-1')
  })
})

describe('AgentStepRunner — cancel kills the running child (WF3-20)', () => {
  it('kills the child and rejects with CancellationError, revoking tokens', async () => {
    const server = new FakeServer()
    const controller = new AbortController()
    const { spawn, kills } = makeFakeSpawn([
      // Child stays alive (never closes); the run is aborted mid-flight.
      () => controller.abort()
    ])
    const runner = makeRunner(server, spawn)

    await expect(
      runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' }, controller.signal)
    ).rejects.toBeInstanceOf(CancellationError)

    expect(kills).toContain(0) // the fake child (index 0) was killed
    expect(server.revoked).toContain('tok-1') // tokens revoked in finally
  })
})
