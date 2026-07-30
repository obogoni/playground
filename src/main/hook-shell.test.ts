import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runHookShell } from './hook-shell'

/**
 * Real-process tests for the one I/O seam (the repo's real-temp-dir pattern, no
 * mocks). They exist because the seam's contract is a settle *condition*, which is
 * exactly what a fake shell cannot prove.
 */
describe('runHookShell', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wtm-hookshell-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const env = { ...process.env }

  it('runs the command through a shell in the given cwd and captures stdout', async () => {
    const result = await runHookShell('echo hello-from-hook', { cwd: dir, env, timeoutMs: 30000 })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('hello-from-hook')
    expect(result.timedOut).toBeUndefined()
  })

  it('reports the exit code of a failing command', async () => {
    const result = await runHookShell('exit 3', { cwd: dir, env, timeoutMs: 30000 })

    expect(result.code).toBe(3)
    expect(result.timedOut).toBeUndefined()
  })

  it('captures stderr from a failing command', async () => {
    // The real seam's stderr wiring is asserted nowhere else — the runner's stderr
    // tests all drive a fake shell, so only this pins the actual capture.
    const result = await runHookShell('echo bad-news 1>&2 & exit 1', {
      cwd: dir,
      env,
      timeoutMs: 30000
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('bad-news')
  })

  it('captures a large burst of output in full', async () => {
    // Guards the settle race in the direction the timeout tests cannot: settling on
    // `exit` must never truncate a command that is still flushing. 2000 lines is far
    // more than a pipe buffer holds.
    const result = await runHookShell('for /L %i in (1,1,2000) do @echo line-%i', {
      cwd: dir,
      env,
      timeoutMs: 30000
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('line-1\r\n')
    expect(result.stdout).toContain('line-2000')
    expect(result.stdout.split('line-').length - 1).toBe(2000)
  })

  it('passes the environment through to the command', async () => {
    const result = await runHookShell('echo %PLAYGROUND_BRANCH%', {
      cwd: dir,
      env: { ...env, PLAYGROUND_BRANCH: 'feature/from-env' },
      timeoutMs: 30000
    })

    expect(result.stdout).toContain('feature/from-env')
  })

  it('executes in the worktree directory', async () => {
    const result = await runHookShell('cd', { cwd: dir, env, timeoutMs: 30000 })

    // `cd` with no argument prints the current directory on Windows shells.
    expect(result.stdout.trim().toLowerCase()).toContain(dir.toLowerCase())
  })

  it('lets a shell command write into the worktree', async () => {
    await runHookShell('echo marker > initialized.txt', { cwd: dir, env, timeoutMs: 30000 })

    expect(readFileSync(join(dir, 'initialized.txt'), 'utf8')).toContain('marker')
  })

  // The two timeout tests deliberately run in tmpdir() rather than the per-test
  // directory: killing the shell does not kill its children, and a surviving
  // grandchild holds its cwd open, which would make the afterEach cleanup fail
  // with EPERM on Windows. The cwd is irrelevant to what they assert.
  it('kills a long-running command and flags it as timed out', async () => {
    const result = await runHookShell('ping -n 5 127.0.0.1', {
      cwd: tmpdir(),
      env,
      // 1500ms, not 500ms: under full-suite load ping had not emitted its first
      // line before the kill, so the output-tail assertion below saw ''. `ping
      // -n 5` still runs ~4s, so the command is still killed mid-flight — this
      // widens the fixture's margin without weakening what is asserted.
      timeoutMs: 1500
    })

    expect(result.timedOut).toBe(true)
    expect(result.code).toBe(-1)
    // WPC-05 keeps the output captured *so far* — the flush grace period is what
    // makes that true on the kill path, where `close` never arrives in time.
    // (Asserted on the address, not on ping's localized prose.)
    expect(result.stdout).toContain('127.0.0.1')
  })

  it('returns promptly when a surviving grandchild holds the pipes open', async () => {
    // Regression guard: settling on `close` alone waits for every inherited pipe
    // to reach EOF. Killing the shell does not kill its children, so a grandchild
    // keeps those pipes open and `close` lags the kill by many seconds — or never
    // arrives. This must still return, and must still say it timed out.
    const started = Date.now()
    const result = await runHookShell('start /b ping -n 5 127.0.0.1 & ping -n 5 127.0.0.1', {
      cwd: tmpdir(),
      env,
      timeoutMs: 500
    })
    const elapsed = Date.now() - started

    expect(result.timedOut).toBe(true)
    expect(result.code).toBe(-1)
    // Settling on `exit` lands ~750ms; waiting for `close` would take ~4s while the
    // grandchild holds the pipes. The bound has to sit between the two to discriminate.
    expect(elapsed).toBeLessThan(2000)
  }, 20000)
})
