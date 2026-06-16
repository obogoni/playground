/**
 * Turns an agent definition + working directory + shell preference into the
 * concrete PTY launch. The agent is *never* spawned as the PTY's own process:
 * it is auto-run as a command inside a hosting shell so `.cmd`/`.ps1` PATH
 * shims and PATH resolution behave exactly as they do in a real terminal
 * (the `code`-is-a-`.cmd`-shim lesson from ShortcutLauncher — spawning the
 * shim directly is the spawn-ENOENT class of bug, PRD story 15).
 *
 * Pure: no filesystem, no spawn. The one unit-tested seam of the agent spike.
 */

export type Shell = 'pwsh' | 'cmd'

export interface AgentDef {
  name: string
  /** The agent executable as you'd type it in a shell (e.g. `claude`). */
  command: string
  /** Extra arguments appended after the command. */
  args: string[]
  icon?: string
  /** Tile tint token (handoff agent→colour, e.g. `--accent`); default token when unset. */
  color?: string
}

export interface SpawnPlan {
  /** Shell binary node-pty spawns (`pwsh.exe` / `cmd.exe`). */
  file: string
  /** Shell arguments that make it auto-run `autoCommand` and stay live after. */
  args: string[]
  /** PTY working directory, carried through untouched. */
  cwd: string
  /** The agent command line auto-run inside the shell. */
  autoCommand: string
}

// Tokens with whitespace or shell metacharacters must be quoted, or the host
// shell re-splits them and the original argv is lost (e.g. `--message`,
// `hello world` would arrive as three tokens). Quoting is per-shell because
// pwsh and cmd disagree on quote/escape rules.
const PWSH_NEEDS_QUOTE = /[\s'"`$;&|<>(){}@#]/
const CMD_NEEDS_QUOTE = /[\s"^&|<>()]/

/** PowerShell single-quote: literal (no expansion); embedded `'` is doubled. */
function quotePwsh(token: string): string {
  if (token === '') return "''"
  if (!PWSH_NEEDS_QUOTE.test(token)) return token
  return `'${token.replace(/'/g, "''")}'`
}

/** cmd.exe double-quote: wraps the token; embedded `"` is doubled. */
function quoteCmd(token: string): string {
  if (token === '') return '""'
  if (!CMD_NEEDS_QUOTE.test(token)) return token
  return `"${token.replace(/"/g, '""')}"`
}

/**
 * `pwsh -NoExit -Command <cmd>` and `cmd /K <cmd>` both run the agent and then
 * keep the shell live, so when the agent quits the developer drops back to a
 * usable prompt instead of the PTY closing (spec: agent-exit → live prompt).
 */
export function buildSpawnPlan(agent: AgentDef, cwd: string, shell: Shell): SpawnPlan {
  if (shell === 'cmd') {
    const autoCommand = [agent.command, ...agent.args].map(quoteCmd).join(' ').trim()
    return { file: 'cmd.exe', args: ['/K', autoCommand], cwd, autoCommand }
  }
  // In PowerShell a quoted command is a string *expression* (it echoes, it
  // doesn't run), so when the command token needs quoting we invoke it through
  // the call operator (`&`) to preserve execution semantics.
  const command = quotePwsh(agent.command)
  const head = command === agent.command ? command : `& ${command}`
  const autoCommand = [head, ...agent.args.map(quotePwsh)].join(' ').trim()
  return { file: 'pwsh.exe', args: ['-NoExit', '-Command', autoCommand], cwd, autoCommand }
}

/**
 * Ad-hoc sibling of `buildSpawnPlan`: the user typed a whole shell line, so it
 * is hosted **verbatim** (no per-token re-quoting — `buildSpawnPlan`'s argv
 * quoting would corrupt syntax the user wrote on purpose). Same `-NoExit`/`/K`
 * keep-shell-live convention so the prompt survives after the command ends.
 */
export function buildRawSpawnPlan(command: string, cwd: string, shell: Shell): SpawnPlan {
  if (shell === 'cmd') {
    return { file: 'cmd.exe', args: ['/K', command], cwd, autoCommand: command }
  }
  return { file: 'pwsh.exe', args: ['-NoExit', '-Command', command], cwd, autoCommand: command }
}
