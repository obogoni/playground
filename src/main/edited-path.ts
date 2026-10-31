import { win32 } from 'node:path'

/** Claude Code's file-editing tools (SFWT-01). */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** The hook events that carry a tool call's input. */
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse'])

/**
 * The file a hook payload says the agent is editing, or null (SFWT-01, SFWT-02).
 * Only a `PreToolUse` / `PostToolUse` of an editing tool counts; the path is
 * `tool_input.file_path`, else `tool_input.notebook_path`, and must be a
 * non-empty absolute path. Shell commands are never read (spec Out of Scope).
 */
export function editedPathOf(payload: Record<string, unknown>): string | null {
  if (typeof payload.hook_event_name !== 'string' || !TOOL_EVENTS.has(payload.hook_event_name)) {
    return null
  }
  if (typeof payload.tool_name !== 'string' || !EDIT_TOOLS.has(payload.tool_name)) return null
  const input = payload.tool_input
  if (typeof input !== 'object' || input === null) return null
  const { file_path: filePath, notebook_path: notebookPath } = input as Record<string, unknown>
  const path = typeof filePath === 'string' ? filePath : notebookPath
  if (typeof path !== 'string' || path === '' || !win32.isAbsolute(path)) return null
  return path
}
