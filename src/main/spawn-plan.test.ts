import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PROMPT_ENV,
  buildPromptSpawnPlan,
  buildRawSpawnPlan,
  buildSpawnPlan,
  type AgentDef
} from './spawn-plan'

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

describe('buildPromptSpawnPlan', () => {
  const MOVE_PROMPT = '$p = $env:PLAYGROUND_PROMPT; Remove-Item Env:PLAYGROUND_PROMPT; '

  it('names the prompt env var PLAYGROUND_PROMPT', () => {
    expect(PROMPT_ENV).toBe('PLAYGROUND_PROMPT')
  })

  it('hosts the agent in pwsh with -NoExit and the given cwd (APR-32/36)', () => {
    const cwd = 'C:\\Configuração de ambiente\\my repo'
    const plan = buildPromptSpawnPlan(CLAUDE, cwd)
    expect(plan.file).toBe('pwsh.exe')
    expect(plan.args).toEqual(['-NoExit', '-Command', MOVE_PROMPT + '& claude -- $p'])
    expect(plan.autoCommand).toBe(MOVE_PROMPT + '& claude -- $p')
    expect(plan.cwd).toBe(cwd)
  })

  it('moves the env prompt into a local, removes it, then calls command args -- $p (APR-30)', () => {
    const agent: AgentDef = { name: 'Claude', command: 'claude', args: ['--model', 'opus'] }
    expect(buildPromptSpawnPlan(agent, 'C:\\x').autoCommand).toBe(
      MOVE_PROMPT + '& claude --model opus -- $p'
    )
  })

  it('quotes command and args with pwsh rules', () => {
    const agent: AgentDef = {
      name: 'Tool',
      command: 'C:\\Program Files\\tool.exe',
      args: ["it's", 'a b', '']
    }
    expect(buildPromptSpawnPlan(agent, 'C:\\x').autoCommand).toBe(
      MOVE_PROMPT + "& 'C:\\Program Files\\tool.exe' 'it''s' 'a b' '' -- $p"
    )
  })

  it(
    'hands a real agent the prompt as one byte-identical argument after -- (APR-24)',
    { timeout: 30000 },
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'psp-'))
      try {
        const echo = join(dir, 'echo.js')
        const out = join(dir, 'out.json')
        await writeFile(
          echo,
          'require("fs").writeFileSync(process.env.PROBE_OUT, JSON.stringify({' +
            ' argv: process.argv.slice(2), envPrompt: process.env.PLAYGROUND_PROMPT ?? null }))'
        )
        const prompt = [
          ` it's $HOME & 100% "done" ` + '`tick`' + ` ^ | < > ( ) ; # @ { } ação `,
          `%PATH% !bang!`
        ].join('\n')
        const plan = buildPromptSpawnPlan({ name: 'Echo', command: 'node', args: [echo] }, dir)
        const child = spawn(plan.file, plan.args, {
          cwd: plan.cwd,
          env: { ...process.env, PLAYGROUND_PROMPT: prompt, PROBE_OUT: out },
          stdio: ['pipe', 'ignore', 'ignore']
        })
        const exited = new Promise((resolve) => child.once('exit', resolve))
        // -NoExit keeps pwsh reading stdin; EOF lets it exit, the kill is the fallback.
        child.stdin.end()
        try {
          expect(await waitForJson(out)).toEqual({ argv: ['--', prompt], envPrompt: null })
        } finally {
          // pwsh holds the temp dir as its cwd until it is gone.
          child.kill()
          await exited
        }
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  )
})

/** Polls until the echo agent has written its report. */
async function waitForJson(path: string): Promise<unknown> {
  for (;;) {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
