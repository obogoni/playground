/**
 * Pure builder → the headless `claude` `{ argv, env }` for one agent step (WF3,
 * re-homed from the WF1 spike `build-agent-argv`, narrowed to the MCP arm only —
 * Arm N `--json-schema` dropped, AD-008 — and extended with permission presets).
 *
 * Structured output is enforced by the agent's tool machinery: a loopback HTTP MCP
 * server hosts a forced `emit_result` tool, reached via `--mcp-config` (inline JSON
 * with a per-step Bearer token) and always allowed. `--append-system-prompt` injects
 * the "finish by calling emit_result" instruction so the author supplies only the
 * prompt + expected schema (WF3-07).
 *
 * Permission presets (WF3-11..15) map to `--permission-mode` + `--allowedTools`:
 *   - read (default): dontAsk + emit_result,Read,Grep,Glob — guaranteed non-mutating.
 *   - write:          dontAsk + the read set plus Edit,Write,Bash.
 *   - bypass:         bypassPermissions, no allow-list (all tools).
 * dontAsk auto-denies any tool outside the allow-list without an interactive prompt
 * (WF3-14). `--bare` is never emitted — it would bypass subscription auth.
 *
 * `env = scrubAuthEnv(parentEnv)` is co-located with argv (WF3-02) so one test
 * asserts both the flags and the stripped auth env.
 *
 * `cwd` is intentionally not part of `opts`: the headless CLI has no working-directory
 * flag — cwd is a spawn() concern set by the runner, so it never appears in argv.
 *
 * NOTE: the step's `expect` JSON Schema is not an argv flag in the MCP arm — it is
 * registered as the `emit_result` tool inputSchema on the server — so this builder
 * has no code dependency on `emit-result-schema`; the T5→T2 phase edge is ordering only.
 */

import { scrubAuthEnv } from './scrub-auth-env'

export type Permission = 'read' | 'write' | 'bypass'

export interface BuildAgentCommandOpts {
  prompt: string
  /** The loopback MCP server URL. */
  mcpUrl: string
  /** The per-step bearer token that routes + authorizes the emit_result call. */
  token: string
  /** Permission posture; defaults to `read` (WF3-15). */
  permission?: Permission
  /** Parent process env; scrubbed of higher-precedence auth vars (WF3-02). */
  parentEnv: NodeJS.ProcessEnv
  /** When set, continue the captured conversation instead of starting fresh. */
  resumeSessionId?: string
}

/** MCP server name in the inline config; the emit tool is `mcp__<server>__<tool>`. */
const MCP_SERVER_NAME = 'result'
const EMIT_TOOL = `mcp__${MCP_SERVER_NAME}__emit_result`
const READ_TOOLS = [EMIT_TOOL, 'Read', 'Grep', 'Glob']
const WRITE_TOOLS = [...READ_TOOLS, 'Edit', 'Write', 'Bash']
const APPEND_PROMPT =
  'When you have the answer, finish by calling the emit_result tool with status "done" ' +
  'and the data. Do not end your turn until you have called it.'

export function buildAgentCommand(opts: BuildAgentCommandOpts): {
  argv: string[]
  env: NodeJS.ProcessEnv
} {
  const permission: Permission = opts.permission ?? 'read'
  const argv: string[] = []

  if (opts.resumeSessionId) {
    argv.push('--resume', opts.resumeSessionId)
  }
  argv.push('--print', opts.prompt)
  argv.push('--output-format', 'json')

  const mcpConfig = {
    mcpServers: {
      [MCP_SERVER_NAME]: {
        type: 'http',
        url: opts.mcpUrl,
        headers: { Authorization: `Bearer ${opts.token}` }
      }
    }
  }
  argv.push('--mcp-config', JSON.stringify(mcpConfig))
  argv.push('--append-system-prompt', APPEND_PROMPT)

  if (permission === 'bypass') {
    argv.push('--permission-mode', 'bypassPermissions')
  } else {
    argv.push('--permission-mode', 'dontAsk')
    const tools = permission === 'write' ? WRITE_TOOLS : READ_TOOLS
    argv.push('--allowedTools', tools.join(','))
  }

  return { argv, env: scrubAuthEnv(opts.parentEnv) }
}
