import { describe, expect, it } from 'vitest'
import type { HookShell, HookShellResult } from './post-create-hook'
import { HOOK_OUTPUT_MAX_CHARS, HOOK_TIMEOUT_MS, runPostCreateHook } from './post-create-hook'

interface ShellCall {
  cmd: string
  cwd: string
  env: NodeJS.ProcessEnv
  timeoutMs: number
}

/** Hand-rolled HookShell fake (no mocking library in this repo) that records its call. */
function fakeShell(result: Partial<HookShellResult>): { shell: HookShell; calls: ShellCall[] } {
  const calls: ShellCall[] = []
  const shell: HookShell = (cmd, opts) => {
    calls.push({ cmd, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs })
    return Promise.resolve({ code: 0, stdout: '', stderr: '', ...result })
  }
  return { shell, calls }
}

const ctx = {
  worktreePath: 'M:\\triade\\source\\Code-feature-x',
  repoPath: 'M:\\triade\\source\\Code',
  branch: 'feature/x'
}

describe('runPostCreateHook', () => {
  it('reports success when the command exits 0', async () => {
    const { shell } = fakeShell({ code: 0, stdout: 'junctions created' })

    const hook = await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(hook.ok).toBe(true)
    expect(hook.code).toBe(0)
    expect(hook.command).toBe('SetupSkills.cmd')
    expect(hook.output).toBe('junctions created')
    expect(hook.timedOut).toBeUndefined()
  })

  it('reports failure with the exit code when the command exits non-zero', async () => {
    const { shell } = fakeShell({ code: 1, stderr: 'ERRO: a pasta de origem nao existe' })

    const hook = await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(hook.ok).toBe(false)
    expect(hook.code).toBe(1)
    expect(hook.output).toBe('ERRO: a pasta de origem nao existe')
  })

  it('reports a spawn failure as code -1 carrying the error text', async () => {
    const { shell } = fakeShell({ code: -1, stderr: 'Error: spawn EACCES' })

    const hook = await runPostCreateHook('nope.cmd', ctx, shell)

    expect(hook.ok).toBe(false)
    expect(hook.code).toBe(-1)
    expect(hook.output).toContain('spawn EACCES')
  })

  it('flags a timeout kill as code -1 with timedOut set', async () => {
    const { shell } = fakeShell({ code: -1, timedOut: true, stdout: 'Repo raiz : ...' })

    const hook = await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(hook.ok).toBe(false)
    expect(hook.code).toBe(-1)
    expect(hook.timedOut).toBe(true)
    expect(hook.output).toBe('Repo raiz : ...')
  })

  it('passes the worktree context to the command as PLAYGROUND_* env vars', async () => {
    const { shell, calls } = fakeShell({ code: 0 })

    await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(calls[0].env.PLAYGROUND_WORKTREE_PATH).toBe('M:\\triade\\source\\Code-feature-x')
    expect(calls[0].env.PLAYGROUND_REPO_PATH).toBe('M:\\triade\\source\\Code')
    expect(calls[0].env.PLAYGROUND_BRANCH).toBe('feature/x')
  })

  it('layers the context vars over the inherited environment', async () => {
    const { shell, calls } = fakeShell({ code: 0 })

    await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(calls[0].env.PATH).toBe(process.env.PATH)
  })

  it('gives the command the 120s timeout budget', async () => {
    const { shell, calls } = fakeShell({ code: 0 })

    await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(calls[0].timeoutMs).toBe(120000)
    expect(HOOK_TIMEOUT_MS).toBe(120000)
  })

  it('runs in the worktree via cwd, leaving a spaced path out of the command string', async () => {
    const spaced = {
      worktreePath: 'M:\\my repos\\Code feature x',
      repoPath: 'M:\\my repos\\Code',
      branch: 'feature/x'
    }
    const { shell, calls } = fakeShell({ code: 0 })

    await runPostCreateHook('SetupSkills.cmd', spaced, shell)

    expect(calls[0].cwd).toBe('M:\\my repos\\Code feature x')
    expect(calls[0].cmd).toBe('SetupSkills.cmd')
  })

  it('keeps only the last 4000 characters of a chatty command', async () => {
    const { shell } = fakeShell({ code: 0, stdout: 'x'.repeat(4100) + 'TAIL' })

    const hook = await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(hook.output).toHaveLength(HOOK_OUTPUT_MAX_CHARS)
    expect(hook.output.endsWith('TAIL')).toBe(true)
  })

  it('represents both stdout and stderr in the captured output', async () => {
    const { shell } = fakeShell({ code: 1, stdout: 'started', stderr: 'then failed' })

    const hook = await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(hook.output).toBe('started\nthen failed')
  })

  it('reports an empty string when the command is silent', async () => {
    const { shell } = fakeShell({ code: 0, stdout: '', stderr: '' })

    const hook = await runPostCreateHook('SetupSkills.cmd', ctx, shell)

    expect(hook.output).toBe('')
  })

  it('reports success for a command that exits 0 without doing anything', async () => {
    const { shell } = fakeShell({ code: 0, stdout: '', stderr: '' })

    const hook = await runPostCreateHook('rem no-op', ctx, shell)

    expect(hook.ok).toBe(true)
  })
})
