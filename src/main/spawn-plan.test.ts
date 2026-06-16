import { describe, expect, it } from 'vitest'
import { buildRawSpawnPlan, buildSpawnPlan, type AgentDef } from './spawn-plan'

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

describe('buildRawSpawnPlan', () => {
  it('wraps the raw command verbatim under pwsh with -NoExit', () => {
    const plan = buildRawSpawnPlan('npm run dev', 'C:\\code\\repo', 'pwsh')
    expect(plan.file).toBe('pwsh.exe')
    expect(plan.args).toEqual(['-NoExit', '-Command', 'npm run dev'])
    expect(plan.autoCommand).toBe('npm run dev')
    expect(plan.cwd).toBe('C:\\code\\repo')
  })

  it('wraps the raw command verbatim under cmd with /K', () => {
    const plan = buildRawSpawnPlan('npm run dev', 'C:\\code\\repo', 'cmd')
    expect(plan.file).toBe('cmd.exe')
    expect(plan.args).toEqual(['/K', 'npm run dev'])
    expect(plan.autoCommand).toBe('npm run dev')
  })

  it('passes a line with spaces and quotes through unaltered (no per-token re-quoting)', () => {
    const line = `git commit -m "hello world"`
    expect(buildRawSpawnPlan(line, 'C:\\x', 'pwsh').autoCommand).toBe(line)
    expect(buildRawSpawnPlan(line, 'C:\\x', 'cmd').autoCommand).toBe(line)
  })

  it('handles an empty command (shell stays live with a bare prompt)', () => {
    expect(buildRawSpawnPlan('', 'C:\\x', 'pwsh').args).toEqual(['-NoExit', '-Command', ''])
    expect(buildRawSpawnPlan('', 'C:\\x', 'cmd').args).toEqual(['/K', ''])
  })

  it('does not re-quote a metacharacter-bearing line (it is raw shell syntax)', () => {
    const line = 'echo $env:PATH | Select-String foo; ls'
    expect(buildRawSpawnPlan(line, 'C:\\x', 'pwsh').autoCommand).toBe(line)
  })
})
