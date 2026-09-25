/**
 * PTY environment for agent sessions (INPUT-01). TUI CLIs like Claude Code
 * degrade their renderer on a minimal `TERM` (box-drawing falls back to
 * ASCII, palette drops to 8 colors), so `TERM`/`COLORTERM` are forced after
 * merging the parent env, overriding whatever the host process inherited.
 * `TERM_PROGRAM` is deliberately NOT claimed: Claude Code gates kitty-protocol
 * CSI-u parsing on it, and its CSI-u handling misbehaves on Windows — newline
 * input is sent as a plain line feed instead (UAT finding, 2026-08-31).
 * `FORCE_HYPERLINK` is the `supports-hyperlinks` convention, checked by Claude
 * Code before `TERM_PROGRAM`: with it every path and URL it prints is an OSC 8
 * hyperlink that xterm draws with its dashed underline; without it, plain text
 * (LINK-33, AD-042).
 */
export const PTY_ENV_FORCED = {
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
  FORCE_HYPERLINK: '1'
} as const

export function buildPtyEnv(parentEnv: NodeJS.ProcessEnv): Record<string, string> {
  return { ...parentEnv, ...PTY_ENV_FORCED } as Record<string, string>
}
