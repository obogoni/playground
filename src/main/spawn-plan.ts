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

/**
 * `pwsh -NoExit -Command <cmd>` and `cmd /K <cmd>` both run the agent and then
 * keep the shell live, so when the agent quits the developer drops back to a
 * usable prompt instead of the PTY closing (spec: agent-exit → live prompt).
 */
export function buildSpawnPlan(agent: AgentDef, cwd: string, shell: Shell): SpawnPlan {
  const autoCommand = [agent.command, ...agent.args].join(' ').trim()
  if (shell === 'cmd') {
    return { file: 'cmd.exe', args: ['/K', autoCommand], cwd, autoCommand }
  }
  return { file: 'pwsh.exe', args: ['-NoExit', '-Command', autoCommand], cwd, autoCommand }
}
