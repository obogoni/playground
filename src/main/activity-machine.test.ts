import { describe, expect, it } from 'vitest'
import { applyHookEvent, applyKeystroke, sameView, type MachineState } from './activity-machine'

/** Payload shapes are copied from the Claude Code hooks reference examples. */
function event(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: 'abc123',
    transcript_path: '/tmp/transcript.jsonl',
    cwd: 'C:/repo',
    hook_event_name: name,
    ...extra
  }
}

/** Drive a fresh machine through a list of events, returning the final state. */
function drive(...events: Record<string, unknown>[]): MachineState | null {
  return events.reduce<MachineState | null>((state, e) => applyHookEvent(state, e), null)
}

const working = (): MachineState | null => drive(event('UserPromptSubmit'))
const workingWithTool = (): MachineState | null =>
  drive(event('UserPromptSubmit'), event('PreToolUse', { tool_name: 'Bash' }))

describe('applyHookEvent', () => {
  it('holds no state until an event sets one (ACTV-13)', () => {
    expect(applyHookEvent(null, event('SubagentStart', { agent_id: 'a1' }))).toBeNull()
  })

  it.each(['startup', 'resume', 'clear', 'fork'])(
    'starts a session waiting when it begins from %s',
    (source) => {
      expect(drive(event('SessionStart', { source }))?.view).toEqual({
        state: 'waiting',
        subagents: 0
      })
    }
  )

  it('leaves the state alone when SessionStart follows a compaction', () => {
    const before = workingWithTool()
    expect(applyHookEvent(before, event('SessionStart', { source: 'compact' }))).toBe(before)
  })

  it('clears the running tool when a session restarts', () => {
    const after = applyHookEvent(workingWithTool(), event('SessionStart', { source: 'clear' }))
    expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('drops the subagents a restarted session was running', () => {
    const withSubagent = applyHookEvent(
      workingWithTool(),
      event('SubagentStart', { agent_id: 'a1' })
    )
    expect(withSubagent?.view.subagents).toBe(1)

    const after = applyHookEvent(withSubagent, event('SessionStart', { source: 'clear' }))

    expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('drops the subagents of a session whose agent exited', () => {
    const withSubagent = applyHookEvent(
      workingWithTool(),
      event('SubagentStart', { agent_id: 'a1' })
    )

    const after = applyHookEvent(withSubagent, event('SessionEnd', { reason: 'prompt_input_exit' }))

    expect(after?.view).toEqual({ state: 'exited', subagents: 0 })
  })

  it('works on a submitted prompt', () => {
    expect(drive(event('UserPromptSubmit'))?.view).toEqual({ state: 'working', subagents: 0 })
  })

  it('names the running tool while a tool call runs', () => {
    expect(workingWithTool()?.view).toEqual({ state: 'working', tool: 'Bash', subagents: 0 })
  })

  it.each(['PostToolUse', 'PostToolUseFailure'])('clears the tool on %s', (name) => {
    expect(applyHookEvent(workingWithTool(), event(name))?.view).toEqual({
      state: 'working',
      subagents: 0
    })
  })

  it('applies a tool result even when no tool was recorded', () => {
    expect(drive(event('PostToolUse'))?.view).toEqual({ state: 'working', subagents: 0 })
  })

  it('needs approval the moment Claude asks, naming the tool', () => {
    const after = applyHookEvent(working(), event('PermissionRequest', { tool_name: 'Bash' }))
    expect(after?.view).toEqual({ state: 'needs-approval', tool: 'Bash', subagents: 0 })
  })

  it('needs approval on a permission_prompt notification', () => {
    const after = applyHookEvent(
      working(),
      event('Notification', { notification_type: 'permission_prompt' })
    )
    expect(after?.view.state).toBe('needs-approval')
  })

  it.each(['elicitation_dialog', 'elicitation_url_dialog'])(
    'needs input on a %s notification',
    (notification_type) => {
      const after = applyHookEvent(working(), event('Notification', { notification_type }))
      expect(after?.view.state).toBe('needs-input')
    }
  )

  it('needs input when an MCP server asks for it', () => {
    const after = applyHookEvent(working(), event('Elicitation', { mcp_server_name: 'acme' }))
    expect(after?.view.state).toBe('needs-input')
  })

  it('works again once the elicitation is answered', () => {
    const blocked = applyHookEvent(working(), event('Elicitation', { mcp_server_name: 'acme' }))
    expect(
      applyHookEvent(blocked, event('ElicitationResult', { action: 'accept' }))?.view.state
    ).toBe('working')
  })

  it('ignores a notification type it does not consume', () => {
    const before = working()
    expect(
      applyHookEvent(before, event('Notification', { notification_type: 'auth_success' }))
    ).toBe(before)
  })

  it('waits when the turn finishes, clearing the tool', () => {
    expect(applyHookEvent(workingWithTool(), event('Stop'))?.view).toEqual({
      state: 'waiting',
      subagents: 0
    })
  })

  it('waits on an idle_prompt notification, which is the only signal after an interrupt (ACTV-28)', () => {
    const after = applyHookEvent(
      workingWithTool(),
      event('Notification', { notification_type: 'idle_prompt' })
    )
    expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('reports the API error type when a turn fails', () => {
    const after = applyHookEvent(working(), event('StopFailure', { error: 'rate_limit' }))
    expect(after?.view).toEqual({ state: 'error', error: 'rate_limit', subagents: 0 })
  })

  it('drops the error once the next turn starts', () => {
    const failed = applyHookEvent(working(), event('StopFailure', { error: 'overloaded' }))
    expect(applyHookEvent(failed, event('UserPromptSubmit'))?.view).toEqual({
      state: 'working',
      subagents: 0
    })
  })

  it('compacts, then returns to the state it interrupted', () => {
    const waiting = drive(event('SessionStart', { source: 'startup' }))
    const compacting = applyHookEvent(waiting, event('PreCompact', { trigger: 'manual' }))
    expect(compacting?.view.state).toBe('compacting')
    expect(
      applyHookEvent(compacting, event('PostCompact', { trigger: 'manual' }))?.view.state
    ).toBe('waiting')
  })

  it('returns to working after an auto-compaction mid-turn', () => {
    const compacting = applyHookEvent(working(), event('PreCompact', { trigger: 'auto' }))
    expect(applyHookEvent(compacting, event('PostCompact', { trigger: 'auto' }))?.view.state).toBe(
      'working'
    )
  })

  it('assumes working when a compaction ends with no state to restore', () => {
    const compacting = drive(event('PreCompact', { trigger: 'auto' }))
    expect(applyHookEvent(compacting, event('PostCompact', { trigger: 'auto' }))?.view.state).toBe(
      'working'
    )
  })

  it.each(['prompt_input_exit', 'logout', 'other'])(
    'reports the agent gone when the session ends with %s',
    (reason) => {
      const after = applyHookEvent(workingWithTool(), event('SessionEnd', { reason }))
      expect(after?.view).toEqual({ state: 'exited', subagents: 0 })
    }
  )

  it.each(['clear', 'resume'])(
    'waits when the session ends with %s: the CLI stays up at a fresh prompt',
    (reason) => {
      // SessionStart never reaches an http hook (measured, 2.1.273), so nothing
      // would correct the state afterwards; the new session is at its prompt.
      const after = applyHookEvent(workingWithTool(), event('SessionEnd', { reason }))
      expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })
    }
  )

  it('drops the subagents of a cleared session', () => {
    const withSubagent = applyHookEvent(working(), event('SubagentStart', { agent_id: 'a1' }))

    const after = applyHookEvent(withSubagent, event('SessionEnd', { reason: 'clear' }))

    expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('counts each subagent by its id', () => {
    const one = applyHookEvent(working(), event('SubagentStart', { agent_id: 'a1' }))
    const two = applyHookEvent(one, event('SubagentStart', { agent_id: 'a2' }))
    expect(two?.view).toEqual({ state: 'working', subagents: 2 })
    expect(applyHookEvent(two, event('SubagentStop', { agent_id: 'a1' }))?.view.subagents).toBe(1)
  })

  it('counts a repeated SubagentStart for one id only once', () => {
    const one = applyHookEvent(working(), event('SubagentStart', { agent_id: 'a1' }))
    expect(applyHookEvent(one, event('SubagentStart', { agent_id: 'a1' }))?.view.subagents).toBe(1)
  })

  it('never counts below zero when a subagent stops without starting (ACTV-34)', () => {
    const after = applyHookEvent(working(), event('SubagentStop', { agent_id: 'ghost' }))
    expect(after?.view.subagents).toBe(0)
  })

  it('keeps the subagent count across a state change', () => {
    const one = applyHookEvent(working(), event('SubagentStart', { agent_id: 'a1' }))
    expect(applyHookEvent(one, event('Stop'))?.view).toEqual({ state: 'waiting', subagents: 1 })
  })

  it('ignores an event it does not consume', () => {
    const before = working()
    expect(applyHookEvent(before, event('PreModelSwitch'))).toBe(before)
  })

  it.each([{}, { hook_event_name: 42 }])('ignores a payload with no event name: %s', (payload) => {
    const before = working()
    expect(applyHookEvent(before, payload as Record<string, unknown>)).toBe(before)
  })

  it('ignores a PreToolUse with no tool name rather than inventing one', () => {
    expect(drive(event('PreToolUse'))?.view).toEqual({ state: 'working', subagents: 0 })
  })
})

describe('applyKeystroke', () => {
  it.each(['needs-approval', 'needs-input'])(
    'answers for the user: %s becomes working (ACTV-12)',
    (state) => {
      const blocked =
        state === 'needs-approval'
          ? applyHookEvent(working(), event('PermissionRequest', { tool_name: 'Bash' }))
          : applyHookEvent(working(), event('Elicitation', { mcp_server_name: 'acme' }))
      expect(applyKeystroke(blocked)?.view.state).toBe('working')
    }
  )

  it.each(['working', 'waiting', 'error', 'compacting', 'exited'])(
    'leaves %s alone, because only a block is waiting on a keystroke',
    (state) => {
      const by: Record<string, MachineState | null> = {
        working: working(),
        waiting: drive(event('Stop')),
        error: applyHookEvent(working(), event('StopFailure', { error: 'rate_limit' })),
        compacting: applyHookEvent(working(), event('PreCompact', { trigger: 'auto' })),
        exited: applyHookEvent(working(), event('SessionEnd', { reason: 'other' }))
      }
      const before = by[state]
      expect(applyKeystroke(before)).toBe(before)
    }
  )

  it('does nothing when the session has no activity yet', () => {
    expect(applyKeystroke(null)).toBeNull()
  })
})

describe('sameView', () => {
  it('treats two equal views as the same', () => {
    expect(sameView({ state: 'working', subagents: 0 }, { state: 'working', subagents: 0 })).toBe(
      true
    )
  })

  it.each([
    [{ state: 'waiting' as const, subagents: 0 }],
    [{ state: 'working' as const, subagents: 1 }],
    [{ state: 'working' as const, subagents: 0, tool: 'Bash' }],
    [{ state: 'working' as const, subagents: 0, error: 'rate_limit' }]
  ])('sees %s as a change from a plain working view', (other) => {
    expect(sameView({ state: 'working', subagents: 0 }, other)).toBe(false)
  })

  it('treats two absent views as the same, and an absent one as a change', () => {
    expect(sameView(null, null)).toBe(true)
    expect(sameView(null, { state: 'working', subagents: 0 })).toBe(false)
  })
})
