import { describe, expect, it } from 'vitest'
import type { BlockerQuestion, RespondDecision } from '../shared/workflows'
import {
  AgentStepError,
  AgentStepRunner,
  type AgentChild,
  type AgentSpawn,
  type AgentStepRunnerDeps,
  type BlockedResolver
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
  lastError?: string
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

  lastError(token: string): string | undefined {
    return this.regs.find((r) => r.token === token)?.lastError
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

  /** Test helper: simulate the server recording a field-level ajv error for the latest token. */
  setLastError(message: string): void {
    this.regs[this.regs.length - 1].lastError = message
  }
}

/** A recording fake `onBlocked` resolver returning scripted decisions in order. */
function makeOnBlocked(decisions: RespondDecision[]): {
  fn: BlockedResolver
  questions: BlockerQuestion[]
  sessions: string[]
} {
  const questions: BlockerQuestion[] = []
  const sessions: string[] = []
  let i = 0
  const fn: BlockedResolver = async (question, sessionId) => {
    questions.push(question)
    sessions.push(sessionId)
    return decisions[i++]
  }
  return { fn, questions, sessions }
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

describe('AgentStepRunner — block-loop resumes on guidance (WF4-02/03)', () => {
  it('resumes the same session with the guidance prompt and resolves the resumed done', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      // turn 1: the agent blocks.
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'which env?' })
        ctl.stdout(envelope('sess-A'))
        ctl.close(0)
      },
      // turn 2 (--resume): the guided agent completes.
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 9 } })
        ctl.stdout(envelope('sess-A2'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)
    const onBlocked = makeOnBlocked([{ action: 'guidance', guidance: 'use staging' }])

    const res = await runner.run(
      { prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' },
      undefined,
      onBlocked.fn
    )

    // WF4-03: resolves done with the RESUMED session id.
    expect(res).toEqual({ status: 'done', data: { answer: 9 }, sessionId: 'sess-A2' })
    // The resolver saw the blocker question and the pre-resume session.
    expect(onBlocked.questions).toEqual([{ title: 'Agent needs input', body: 'which env?' }])
    expect(onBlocked.sessions).toEqual(['sess-A'])
    // WF4-02: the resume attempt carries --resume <sess-A> AND the guidance prompt.
    expect(calls).toHaveLength(2)
    expect(calls[1].argv.slice(0, 2)).toEqual(['--resume', 'sess-A'])
    expect(calls[1].argv).toContain('use staging')
  })
})

describe('AgentStepRunner — block↔guidance rounds repeat unbounded (WF4-04)', () => {
  it('blocks twice, calling onBlocked each round, then resolves the final done', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'q1' })
        ctl.stdout(envelope('s1'))
        ctl.close(0)
      },
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'q2' })
        ctl.stdout(envelope('s2'))
        ctl.close(0)
      },
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 1 } })
        ctl.stdout(envelope('s3'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)
    const onBlocked = makeOnBlocked([
      { action: 'guidance', guidance: 'g1' },
      { action: 'guidance', guidance: 'g2' }
    ])

    const res = await runner.run(
      { prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' },
      undefined,
      onBlocked.fn
    )

    expect(res).toEqual({ status: 'done', data: { answer: 1 }, sessionId: 's3' })
    expect(onBlocked.questions.map((q) => q.body)).toEqual(['q1', 'q2'])
    expect(calls).toHaveLength(3)
    expect(calls[1].argv.slice(0, 2)).toEqual(['--resume', 's1'])
    expect(calls[2].argv.slice(0, 2)).toEqual(['--resume', 's2'])
  })
})

describe('AgentStepRunner — abort response ends the run (WF4-05/10)', () => {
  it('throws CancellationError and spawns no further child', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'q?' })
        ctl.stdout(envelope('sA'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)
    const onBlocked = makeOnBlocked([{ action: 'abort' }])

    await expect(
      runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' }, undefined, onBlocked.fn)
    ).rejects.toBeInstanceOf(CancellationError)

    expect(calls).toHaveLength(1) // no resume spawn after abort
    expect(server.revoked).toContain('tok-1') // token revoked in finally
  })

  it('aborts mid-loop after a guidance round, spawning nothing past the abort', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'q1' })
        ctl.stdout(envelope('s1'))
        ctl.close(0)
      },
      (ctl) => {
        server.emitLatest({ status: 'blocked', question: 'q2' })
        ctl.stdout(envelope('s2'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)
    const onBlocked = makeOnBlocked([{ action: 'guidance', guidance: 'g1' }, { action: 'abort' }])

    await expect(
      runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' }, undefined, onBlocked.fn)
    ).rejects.toBeInstanceOf(CancellationError)

    expect(calls).toHaveLength(2) // turn1 (block) + turn2 (resume→block), then abort
  })
})

describe('AgentStepRunner — corrective retry carries the field-level error (WF4-18)', () => {
  it("interpolates the server's ajv error into the corrective retry prompt", async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      // First attempt: the server recorded a field-level error, no valid emit.
      (ctl) => {
        server.setLastError('data/answer must be number')
        ctl.stdout(envelope('sess-x'))
        ctl.close(0)
      },
      // Corrective retry (--resume): a conforming emit.
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 5 } })
        ctl.stdout(envelope('sess-x2'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    const res = await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })

    expect(res).toEqual({ status: 'done', data: { answer: 5 }, sessionId: 'sess-x2' })
    expect(calls).toHaveLength(2)
    // The retry prompt (an argv element) names the offending field, not a generic string.
    const carried = calls[1].argv.some((a) => a.includes('data/answer must be number'))
    expect(carried).toBe(true)
  })

  it('falls back to the generic reason when the server recorded no field error', async () => {
    const server = new FakeServer()
    const { spawn, calls } = makeFakeSpawn([
      (ctl) => {
        ctl.stdout(envelope('sess-y'))
        ctl.close(0)
      },
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 3 } })
        ctl.stdout(envelope('sess-y2'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    await runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })

    const carried = calls[1].argv.some((a) => a.includes('no valid emit_result call was made'))
    expect(carried).toBe(true)
  })
})

describe('AgentStepRunner — shared server started once (WF4-19)', () => {
  it('calls server.start() exactly once across two run() calls', async () => {
    const server = new FakeServer()
    const { spawn } = makeFakeSpawn([
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 1 } })
        ctl.stdout(envelope('s-a'))
        ctl.close(0)
      },
      (ctl) => {
        server.emitLatest({ status: 'done', data: { answer: 2 } })
        ctl.stdout(envelope('s-b'))
        ctl.close(0)
      }
    ])
    const runner = makeRunner(server, spawn)

    await runner.run({ prompt: 'p1', expect: NUM_EXPECT, cwd: '/repo' })
    await runner.run({ prompt: 'p2', expect: NUM_EXPECT, cwd: '/repo' })

    expect(server.startCalls).toBe(1)
  })
})

describe('AgentStepRunner — server bind failure fails before spawn (WF4-20)', () => {
  it('rejects and never spawns when the shared server fails to start', async () => {
    const server = new FakeServer()
    server.start = async (): Promise<{ url: string; port: number }> => {
      throw new Error('EADDRINUSE')
    }
    const { spawn, calls } = makeFakeSpawn([])
    const runner = makeRunner(server, spawn)

    await expect(runner.run({ prompt: 'p', expect: NUM_EXPECT, cwd: '/repo' })).rejects.toThrow(
      /EADDRINUSE/
    )
    expect(calls).toHaveLength(0)
  })
})
