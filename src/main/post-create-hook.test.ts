import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CreateWorktreeResult } from '../shared/worktrees'
import { runHookShell } from './hook-shell'
import type { CreateWorktreeFn, HookShell, HookShellResult } from './post-create-hook'
import {
  HOOK_OUTPUT_MAX_CHARS,
  HOOK_TIMEOUT_MS,
  runPostCreateHook,
  withPostCreateHook
} from './post-create-hook'
import { repoPostCreateCommand } from './repo-config'
import { createWorktree } from './worktree-manager'

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

    // Pinned to the spec's literal bound, not to the constant — asserting
    // toHaveLength(HOOK_OUTPUT_MAX_CHARS) alone is self-referential and would
    // still pass if the bound were changed.
    expect(HOOK_OUTPUT_MAX_CHARS).toBe(4000)
    expect(hook.output).toHaveLength(4000)
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

/** Records every create invocation so argument pass-through can be asserted. */
function fakeCreate(result: CreateWorktreeResult): { create: CreateWorktreeFn; args: unknown[][] } {
  const args: unknown[][] = []
  const create: CreateWorktreeFn = (...called) => {
    args.push(called)
    return Promise.resolve(result)
  }
  return { create, args }
}

describe('withPostCreateHook', () => {
  it('runs the command in the created worktree and attaches the outcome', async () => {
    const { create } = fakeCreate({ ok: true, path: 'M:\\src\\Code-feature-x' })
    const { shell, calls } = fakeShell({ code: 0, stdout: 'junctions created' })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/x', 'main')

    expect(calls[0].cwd).toBe('M:\\src\\Code-feature-x')
    expect(result.ok).toBe(true)
    expect(result.path).toBe('M:\\src\\Code-feature-x')
    expect(result.hook).toEqual({
      ok: true,
      command: 'SetupSkills.cmd',
      code: 0,
      output: 'junctions created'
    })
  })

  it('keeps the worktree when the command fails', async () => {
    const { create } = fakeCreate({ ok: true, path: 'M:\\src\\Code-feature-x' })
    const { shell } = fakeShell({ code: 1, stderr: 'ERRO' })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/x', 'main')

    expect(result.ok).toBe(true)
    expect(result.path).toBe('M:\\src\\Code-feature-x')
    expect(result.error).toBeUndefined()
    expect(result.hook?.ok).toBe(false)
    expect(result.hook?.code).toBe(1)
  })

  it('does not run the command when the branch already exists', async () => {
    const { create } = fakeCreate({ ok: false, conflict: 'branch-exists' })
    const { shell, calls } = fakeShell({ code: 0 })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/x', 'main')

    expect(calls).toHaveLength(0)
    expect('hook' in result).toBe(false)
    expect(result.conflict).toBe('branch-exists')
  })

  it('does not run the command when the create failed', async () => {
    const { create } = fakeCreate({ ok: false, error: 'Target path already exists: …' })
    const { shell, calls } = fakeShell({ code: 0 })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/x', 'main')

    expect(calls).toHaveLength(0)
    expect('hook' in result).toBe(false)
  })

  it('does not run the command when the create reported no path', async () => {
    const { create } = fakeCreate({ ok: true })
    const { shell, calls } = fakeShell({ code: 0 })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/x', 'main')

    expect(calls).toHaveLength(0)
    expect('hook' in result).toBe(false)
  })

  it('runs the command on the reuse path', async () => {
    const { create } = fakeCreate({ ok: true, path: 'M:\\src\\Code-feature-reuse' })
    const { shell, calls } = fakeShell({ code: 0 })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/reuse', 'main', undefined, false, 'reuse')

    expect(calls[0].cwd).toBe('M:\\src\\Code-feature-reuse')
    expect(result.hook?.ok).toBe(true)
  })

  it('runs the command on the recreate path', async () => {
    const { create } = fakeCreate({ ok: true, path: 'M:\\src\\Code-feature-re' })
    const { shell, calls } = fakeShell({ code: 0 })

    const result = await withPostCreateHook(create, {
      readCommand: () => 'SetupSkills.cmd',
      shell
    })('M:\\src\\Code', 'feature/re', 'main', undefined, false, 'recreate')

    expect(calls[0].cwd).toBe('M:\\src\\Code-feature-re')
    expect(result.hook?.ok).toBe(true)
  })

  it('leaves the result untouched when the repo declares no command', async () => {
    const { create } = fakeCreate({ ok: true, path: 'M:\\src\\Code-feature-x' })
    const { shell, calls } = fakeShell({ code: 0 })

    const result = await withPostCreateHook(create, { readCommand: () => null, shell })(
      'M:\\src\\Code',
      'feature/x',
      'main'
    )

    expect(calls).toHaveLength(0)
    expect('hook' in result).toBe(false)
    expect(result).toEqual({ ok: true, path: 'M:\\src\\Code-feature-x' })
  })

  it('forwards every create argument verbatim', async () => {
    const { create, args } = fakeCreate({ ok: true, path: 'M:\\src\\Code-feature-x' })
    const { shell } = fakeShell({ code: 0 })

    await withPostCreateHook(create, { readCommand: () => null, shell })(
      'M:\\src\\Code',
      'feature/x',
      'main',
      '{repo}-{id}',
      true,
      'reuse'
    )

    expect(args[0]).toEqual(['M:\\src\\Code', 'feature/x', 'main', '{repo}-{id}', true, 'reuse'])
  })

  it('keeps concurrent creates isolated from each other', async () => {
    // Each shell call reports its own cwd back, delayed so the two interleave.
    const shell: HookShell = (_cmd, opts) =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ code: 0, stdout: `ran in ${opts.cwd}`, stderr: '' }),
          opts.cwd.endsWith('slow') ? 20 : 1
        )
      )
    const wrapSlow = withPostCreateHook(
      fakeCreate({ ok: true, path: 'M:\\src\\Code-slow' }).create,
      { readCommand: () => 'Slow.cmd', shell }
    )
    const wrapFast = withPostCreateHook(
      fakeCreate({ ok: true, path: 'M:\\src\\Code-fast' }).create,
      { readCommand: () => 'Fast.cmd', shell }
    )

    const [slow, fast] = await Promise.all([
      wrapSlow('M:\\src\\Code', 'slow'),
      wrapFast('M:\\src\\Code', 'fast')
    ])

    expect(slow.hook?.command).toBe('Slow.cmd')
    expect(slow.hook?.output).toBe('ran in M:\\src\\Code-slow')
    expect(fast.hook?.command).toBe('Fast.cmd')
    expect(fast.hook?.output).toBe('ran in M:\\src\\Code-fast')
  })
})

/**
 * The spec's own Independent Test for WPC-01/WPC-03, wired end to end over real
 * git, a real repo config and a real shell — the only way to assert the part that
 * matters most: a failed init command must not cost you the worktree ON DISK.
 */
describe('withPostCreateHook over real git', () => {
  let root: string
  let repo: string

  const git = (cwd: string, ...args: string[]): void => {
    execFileSync('git', args, { cwd, windowsHide: true })
  }

  const declareCommand = (command: string): void => {
    mkdirSync(join(repo, '.app'), { recursive: true })
    writeFileSync(join(repo, '.app', 'config.json'), JSON.stringify({ postCreateCommand: command }))
  }

  const create = withPostCreateHook(createWorktree, {
    readCommand: repoPostCreateCommand,
    shell: runHookShell
  })

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wtm-hookint-'))
    repo = join(root, 'repo')
    mkdirSync(repo)
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@test.local')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(join(repo, 'a.txt'), 'one', 'utf8')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'init')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('runs the declared command inside the new worktree', async () => {
    declareCommand('echo initialized > hook-ran.txt')

    const result = await create(repo, 'feature/ok', 'main')

    expect(result.ok).toBe(true)
    expect(result.hook?.ok).toBe(true)
    expect(existsSync(join(result.path as string, 'hook-ran.txt'))).toBe(true)
  })

  it('keeps the worktree on disk when the command fails', async () => {
    declareCommand('exit 1')

    const result = await create(repo, 'feature/bad', 'main')

    expect(result.ok).toBe(true)
    expect(result.hook?.ok).toBe(false)
    expect(result.hook?.code).toBe(1)
    expect(existsSync(result.path as string)).toBe(true)
    expect(existsSync(join(result.path as string, 'a.txt'))).toBe(true)
  })

  it('leaves no hook on the result when the repo declares nothing', async () => {
    const result = await create(repo, 'feature/plain', 'main')

    expect(result.ok).toBe(true)
    expect('hook' in result).toBe(false)
    expect(existsSync(result.path as string)).toBe(true)
  })
})
