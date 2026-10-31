import { describe, expect, it } from 'vitest'
import { editedPathOf } from './edited-path'

const FILE = 'D:\\work\\acme\\.wt-app-4821-fix-login\\src\\login.ts'

/** A hook payload as Claude Code posts it (see activity-machine.test.ts). */
function event(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { hook_event_name: name, session_id: 'claude-1', ...extra }
}

describe('editedPathOf', () => {
  describe.each(['PreToolUse', 'PostToolUse'])('%s', (hook) => {
    it.each(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])(
      'reads the file_path of %s (SFWT-01)',
      (tool) => {
        expect(
          editedPathOf(event(hook, { tool_name: tool, tool_input: { file_path: FILE } }))
        ).toBe(FILE)
      }
    )
  })

  it('reads a notebook edit from notebook_path', () => {
    const notebook = 'D:\\work\\acme\\.wt-app-4821-fix-login\\notes\\login.ipynb'
    expect(
      editedPathOf(
        event('PostToolUse', { tool_name: 'NotebookEdit', tool_input: { notebook_path: notebook } })
      )
    ).toBe(notebook)
  })

  it('accepts a forward-slash absolute path', () => {
    const path = 'D:/work/acme/.wt-app-4821-fix-login/README.md'
    expect(
      editedPathOf(event('PreToolUse', { tool_name: 'Write', tool_input: { file_path: path } }))
    ).toBe(path)
  })

  it.each(['Bash', 'Read'])('ignores the %s tool even with a file_path (SFWT-02)', (tool) => {
    expect(
      editedPathOf(event('PreToolUse', { tool_name: tool, tool_input: { file_path: FILE } }))
    ).toBeNull()
  })

  it('ignores an event that is not a tool use (SFWT-02)', () => {
    expect(editedPathOf(event('Stop'))).toBeNull()
    expect(
      editedPathOf(
        event('PermissionRequest', { tool_name: 'Edit', tool_input: { file_path: FILE } })
      )
    ).toBeNull()
  })

  it('ignores an edit with no tool_input (SFWT-02)', () => {
    expect(editedPathOf(event('PreToolUse', { tool_name: 'Edit' }))).toBeNull()
  })

  it.each([
    ['a number', 42],
    ['null', null],
    ['an empty string', ''],
    ['a relative path', 'src\\login.ts']
  ])('ignores a file_path that is %s (SFWT-02)', (_label, filePath) => {
    expect(
      editedPathOf(event('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: filePath } }))
    ).toBeNull()
  })
})
