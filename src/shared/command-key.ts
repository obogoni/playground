/**
 * Bare command name, lowercased and stripped of any path and `.exe`, so
 * `C:\...\claude.exe` and `claude` are the same agent.
 *
 * Lives in `shared` because both sides resolve an agent by its command: the
 * renderer for its undo byte (`terminal-keys.ts`), and main to decide whether a
 * session gets Claude Code's activity hooks (ACTV-01). Main must not import
 * renderer code, so the identity rule cannot live there.
 */
export function commandKey(command: string): string {
  const leaf = command.split(/[\\/]/).pop() ?? command
  return leaf.toLowerCase().replace(/\.(exe|cmd|bat)$/, '')
}
