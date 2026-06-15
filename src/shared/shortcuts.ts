export type ShortcutTool = 'explorer' | 'terminal' | 'vscode' | 'vs2022'

export interface LaunchResult {
  ok: boolean
  /** Human-readable failure message, present when ok is false. */
  error?: string
}
