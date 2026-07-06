import { describe, expect, it } from 'vitest'
import { buildAgentCommand, type BuildAgentCommandOpts } from './agent-command-builder'

const BASE: BuildAgentCommandOpts = {
  prompt: 'what is 2+2?',
  mcpUrl: 'http://127.0.0.1:54321/mcp',
  token: 'tok-secret',
  parentEnv: { PATH: '/usr/bin' }
}

/** Returns the argv element immediately following `flag`. */
function valueAfter(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag)
  return i === -1 ? undefined : argv[i + 1]
}

describe('buildAgentCommand — base invocation (WF3-06/07)', () => {
  it('emits --print <prompt>, --output-format json, --mcp-config, and --append-system-prompt', () => {
    const { argv } = buildAgentCommand(BASE)
    expect(argv).toContain('--print')
    expect(valueAfter(argv, '--print')).toBe('what is 2+2?')
    expect(valueAfter(argv, '--output-format')).toBe('json')
    expect(argv).toContain('--mcp-config')
    expect(argv).toContain('--append-system-prompt')
    // the injected instruction directs the agent to finish by calling emit_result (WF3-07)
    expect(valueAfter(argv, '--append-system-prompt')).toMatch(/emit_result/)
  })

  it('encodes the loopback MCP server as http + Bearer token (WF3-06)', () => {
    const cfg = JSON.parse(valueAfter(buildAgentCommand(BASE).argv, '--mcp-config')!)
    const server = cfg.mcpServers.result
    expect(server.type).toBe('http')
    expect(server.url).toBe('http://127.0.0.1:54321/mcp')
    expect(server.headers.Authorization).toBe('Bearer tok-secret')
  })

  it('is MCP-only: never emits the dropped Arm N --json-schema flag (AD-008)', () => {
    expect(buildAgentCommand(BASE).argv).not.toContain('--json-schema')
  })

  it('never emits --bare (it would bypass subscription auth)', () => {
    expect(buildAgentCommand(BASE).argv).not.toContain('--bare')
  })
})

describe('buildAgentCommand — permission presets (WF3-11..15)', () => {
  it('read (explicit) → dontAsk + emit_result,Read,Grep,Glob (non-mutating) (WF3-11)', () => {
    const { argv } = buildAgentCommand({ ...BASE, permission: 'read' })
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(valueAfter(argv, '--allowedTools')).toBe('mcp__result__emit_result,Read,Grep,Glob')
  })

  it('defaults to read when permission is omitted (WF3-15)', () => {
    const { argv } = buildAgentCommand(BASE)
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(valueAfter(argv, '--allowedTools')).toBe('mcp__result__emit_result,Read,Grep,Glob')
  })

  it('read allow-list contains no mutating tool (Edit/Write/Bash) — a read step cannot mutate (WF3-11)', () => {
    const tools = valueAfter(
      buildAgentCommand({ ...BASE, permission: 'read' }).argv,
      '--allowedTools'
    )!
    expect(tools).not.toContain('Edit')
    expect(tools).not.toContain('Write')
    expect(tools).not.toContain('Bash')
  })

  it('write → adds Edit,Write,Bash to the read allow-list, still dontAsk (WF3-12)', () => {
    const { argv } = buildAgentCommand({ ...BASE, permission: 'write' })
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(valueAfter(argv, '--allowedTools')).toBe(
      'mcp__result__emit_result,Read,Grep,Glob,Edit,Write,Bash'
    )
  })

  it('bypass → bypassPermissions mode with no --allowedTools (all tools allowed) (WF3-13)', () => {
    const { argv } = buildAgentCommand({ ...BASE, permission: 'bypass' })
    expect(valueAfter(argv, '--permission-mode')).toBe('bypassPermissions')
    expect(argv).not.toContain('--allowedTools')
  })

  it('read/write use the auto-deny dontAsk posture so an unpermitted tool does not prompt (WF3-14)', () => {
    expect(
      valueAfter(buildAgentCommand({ ...BASE, permission: 'read' }).argv, '--permission-mode')
    ).toBe('dontAsk')
    expect(
      valueAfter(buildAgentCommand({ ...BASE, permission: 'write' }).argv, '--permission-mode')
    ).toBe('dontAsk')
  })
})

describe('buildAgentCommand — resume + scrubbed env (WF3-02)', () => {
  it('resumeSessionId set → argv starts with --resume <id>, still carrying --print and --mcp-config', () => {
    const { argv } = buildAgentCommand({ ...BASE, resumeSessionId: 'sess-abc' })
    expect(argv[0]).toBe('--resume')
    expect(argv[1]).toBe('sess-abc')
    expect(valueAfter(argv, '--print')).toBe('what is 2+2?')
    expect(argv).toContain('--mcp-config')
  })

  it('env is scrubbed of ANTHROPIC_API_KEY while the argv is built (WF3-02)', () => {
    const { argv, env } = buildAgentCommand({
      ...BASE,
      parentEnv: { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-secret' }
    })
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
    // same call still produced a valid headless argv
    expect(valueAfter(argv, '--output-format')).toBe('json')
  })
})
