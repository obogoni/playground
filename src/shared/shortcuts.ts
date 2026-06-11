export type ShortcutTool = 'explorer' | 'terminal' | 'vscode'

export interface LaunchResult {
  ok: boolean
  /** Human-readable failure message, present when ok is false. */
  error?: string
}
