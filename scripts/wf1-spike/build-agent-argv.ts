/**
 * WF1 spike wiring — pure argv builder.
 *
 * Assembles the headless `claude` argv for each structured-output arm plus the
 * `--resume` continuation. Kept SEPARATE from `buildSpawnPlan` (design: the
 * headless argv is unrelated to the interactive hosting-shell auto-run).
 *
 * ⚠️ Every flag here is a DOCUMENTED LEAD (design.md §Research findings), NOT a
 * confirmed fact — T7's empirical run against the installed CLI confirms or
 * refutes each one (WF1-D1). Leads encoded:
 *   --print <prompt>            headless print mode, prompt as positional
 *   --output-format json        JSON envelope (carries session_id)
 *   --json-schema <expect>      Arm N native structured output → envelope.structured_output
 *   --mcp-config <inline JSON>  Arm M loopback HTTP MCP server (type:http + Bearer)
 *   --allowedTools mcp__result__emit_result   emit_result always allowed (WF1-07)
 *   --append-system-prompt      Arm M nudge to always finish by calling emit_result
 *   --permission-mode dontAsk   unattended posture, auto-denies un-approved prompts
 *   --resume <session_id>       continue the same conversation (WF1-06)
 * `--bare` is intentionally NEVER emitted — it bypasses the OAuth/subscription
 * token and would defeat the headline goal (design Tech Decisions).
 */

import type { JsonSchema } from './emit-result-schema'

export type Arm = 'native' | 'mcp'

export interface BuildAgentArgvOpts {
  arm: Arm
  prompt: string
  /** The step's declared data schema (Arm N: --json-schema; Arm M: tool inputSchema). */
  expect: JsonSchema
  /** Arm M only: the loopback MCP server URL. */
  mcpUrl?: string
  /** Arm M only: the per-step bearer token that routes + authorizes the call. */
  token?: string
  /** When set, continue the captured conversation instead of starting fresh. */
  resumeSessionId?: string
}

// SPEC_DEVIATION: design listed `cwd` in the opts, but the headless CLI has no
// working-directory flag — cwd is a spawn() concern set by the orchestrator, so
// it never appears in argv. Reason: carrying an unused param would be dead code.

/** MCP server name in the inline config; the emit tool is `mcp__<server>__<tool>`. */
const MCP_SERVER_NAME = 'result'
const EMIT_TOOL = `mcp__${MCP_SERVER_NAME}__emit_result`
const APPEND_PROMPT =
  'When you have the answer, finish by calling the emit_result tool with status "done" ' +
  'and the data. Do not end your turn until you have called it.'

export function buildAgentArgv(opts: BuildAgentArgvOpts): string[] {
  const argv: string[] = []
  if (opts.resumeSessionId) {
    argv.push('--resume', opts.resumeSessionId)
  }
  argv.push('--print', opts.prompt)
  argv.push('--output-format', 'json')
  argv.push('--permission-mode', 'dontAsk')

  if (opts.arm === 'native') {
    argv.push('--json-schema', JSON.stringify(opts.expect))
  } else {
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
    argv.push('--allowedTools', EMIT_TOOL)
    argv.push('--append-system-prompt', APPEND_PROMPT)
  }
  return argv
}
