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
