import { describe, expect, it } from 'vitest'
import { buildAgentArgv, type BuildAgentArgvOpts } from './build-agent-argv'
import type { JsonSchema } from './emit-result-schema'

const EXPECT: JsonSchema = { type: 'object', properties: { id: { type: 'number' } } }

const NATIVE: BuildAgentArgvOpts = { arm: 'native', prompt: 'what is 2+2?', expect: EXPECT }
const MCP: BuildAgentArgvOpts = {
  arm: 'mcp',
  prompt: 'what is 2+2?',
  expect: EXPECT,
  mcpUrl: 'http://127.0.0.1:54321/mcp',
  token: 'tok-secret'
}

/** Returns the argv element immediately following `flag`. */
function valueAfter(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i === -1 ? undefined : argv[i + 1]
}

describe('buildAgentArgv — native arm (Arm N, WF1-08)', () => {
  it('emits print, json, --json-schema <expect>, and dontAsk; never --mcp-config', () => {
    const argv = buildAgentArgv(NATIVE)
    expect(argv).toContain('--print')
    expect(valueAfter(argv, '--output-format')).toBe('json')
    expect(valueAfter(argv, '--json-schema')).toBe(JSON.stringify(EXPECT))
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(argv).not.toContain('--mcp-config')
  })

  it('places the prompt as the argument after --print', () => {
    expect(valueAfter(buildAgentArgv(NATIVE), '--print')).toBe('what is 2+2?')
  })
})

describe('buildAgentArgv — mcp arm (Arm M, WF1-08)', () => {
  it('emits --mcp-config (http + Bearer token), --append-system-prompt, dontAsk; never --json-schema', () => {
    const argv = buildAgentArgv(MCP)
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(argv).toContain('--append-system-prompt')
    expect(argv).not.toContain('--json-schema')

    const cfg = JSON.parse(valueAfter(argv, '--mcp-config')!)
    const server = cfg.mcpServers.result
    expect(server.type).toBe('http')
    expect(server.url).toBe('http://127.0.0.1:54321/mcp')
    expect(server.headers.Authorization).toBe('Bearer tok-secret')
  })

  it('allows the emit_result MCP tool so the forced call is not blocked (WF1-07)', () => {
    expect(valueAfter(buildAgentArgv(MCP), '--allowedTools')).toBe('mcp__result__emit_result')
  })
})

describe('buildAgentArgv — resume + safety', () => {
  it('emits --resume <id> while preserving the arm mechanism flag and prompt (WF1-06)', () => {
    const argv = buildAgentArgv({ ...NATIVE, resumeSessionId: 'sess-abc' })
    expect(valueAfter(argv, '--resume')).toBe('sess-abc')
    // resume still carries the native mechanism so the second turn re-emits structured output
    expect(valueAfter(argv, '--json-schema')).toBe(JSON.stringify(EXPECT))
    expect(valueAfter(argv, '--print')).toBe('what is 2+2?')
  })

  it('never emits --bare (it would bypass subscription auth)', () => {
    expect(buildAgentArgv(NATIVE)).not.toContain('--bare')
    expect(buildAgentArgv(MCP)).not.toContain('--bare')
  })
})
