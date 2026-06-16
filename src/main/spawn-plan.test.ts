import { describe, expect, it } from 'vitest'
import { buildSpawnPlan, type AgentDef } from './spawn-plan'

const CLAUDE: AgentDef = { name: 'Claude', command: 'claude', args: [] }

describe('buildSpawnPlan', () => {
  it('hosts the agent in pwsh with -NoExit so the prompt stays live after it quits', () => {
    const plan = buildSpawnPlan(CLAUDE, 'C:\\code\\repo', 'pwsh')
    expect(plan.file).toBe('pwsh.exe')
    expect(plan.args).toEqual(['-NoExit', '-Command', 'claude'])
    expect(plan.autoCommand).toBe('claude')
  })

  it('hosts the agent in cmd with /K so the prompt stays live after it quits', () => {
    const plan = buildSpawnPlan(CLAUDE, 'C:\\code\\repo', 'cmd')
    expect(plan.file).toBe('cmd.exe')
    expect(plan.args).toEqual(['/K', 'claude'])
    expect(plan.autoCommand).toBe('claude')
  })

  it('joins command + args into the auto-run command line', () => {
    const agent: AgentDef = { name: 'Claude', command: 'claude', args: ['--dangerously', '-p'] }
    const plan = buildSpawnPlan(agent, 'C:\\code\\repo', 'pwsh')
    expect(plan.autoCommand).toBe('claude --dangerously -p')
    expect(plan.args).toEqual(['-NoExit', '-Command', 'claude --dangerously -p'])
  })

  it('quotes args containing whitespace so they survive as one token', () => {
    const agent: AgentDef = {
      name: 'Claude',
      command: 'claude',
      args: ['--message', 'hello world']
    }
    expect(buildSpawnPlan(agent, 'C:\\x', 'pwsh').autoCommand).toBe(
      "claude --message 'hello world'"
    )
    expect(buildSpawnPlan(agent, 'C:\\x', 'cmd').autoCommand).toBe('claude --message "hello world"')
  })

  it('escapes embedded quotes per shell', () => {
    const pwsh: AgentDef = { name: 'Claude', command: 'claude', args: ["it's here"] }
    expect(buildSpawnPlan(pwsh, 'C:\\x', 'pwsh').autoCommand).toBe("claude 'it''s here'")
    const cmd: AgentDef = { name: 'Claude', command: 'claude', args: ['say "hi"'] }
    expect(buildSpawnPlan(cmd, 'C:\\x', 'cmd').autoCommand).toBe('claude "say ""hi"""')
  })

  it('invokes a quoted command path via the call operator under pwsh', () => {
    const agent: AgentDef = { name: 'Tool', command: 'C:\\Program Files\\tool.exe', args: ['run'] }
    expect(buildSpawnPlan(agent, 'C:\\x', 'pwsh').autoCommand).toBe(
      "& 'C:\\Program Files\\tool.exe' run"
    )
    // cmd executes a quoted exe directly — no call operator needed.
    expect(buildSpawnPlan(agent, 'C:\\x', 'cmd').autoCommand).toBe(
      '"C:\\Program Files\\tool.exe" run'
    )
  })

  it('carries cwd through untouched (no filesystem normalization)', () => {
    const cwd = 'C:\\Configuração de ambiente\\my repo'
    expect(buildSpawnPlan(CLAUDE, cwd, 'pwsh').cwd).toBe(cwd)
    expect(buildSpawnPlan(CLAUDE, cwd, 'cmd').cwd).toBe(cwd)
  })

  it('handles an agent with a single extra arg under both shells', () => {
    const agent: AgentDef = { name: 'Codex', command: 'codex', args: ['chat'] }
    expect(buildSpawnPlan(agent, 'D:\\x', 'pwsh').args).toEqual([
      '-NoExit',
      '-Command',
      'codex chat'
    ])
    expect(buildSpawnPlan(agent, 'D:\\x', 'cmd').args).toEqual(['/K', 'codex chat'])
  })
})
