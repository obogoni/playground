import { describe, expect, it } from 'vitest'
import type { ActivityState, SessionActivity } from '../shared/config'
import { applyHookEvent, applyKeystroke, sameView, type MachineState } from './activity-machine'
import {
  approvalWhileAnotherWorks,
  backgroundShell,
  fanOutWithWakeUps,
  idlePromptWhileSubagentRuns,
  type CapturedEvent
} from './activity-sequences.fixture'

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
    expect(applyHookEvent(one, event('PermissionRequest', { tool_name: 'Bash' }))?.view).toEqual({
      state: 'needs-approval',
      tool: 'Bash',
      subagents: 1
    })
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

describe('applyHookEvent with background work (activity-subagent-attribution)', () => {
  const start = (id: string): Record<string, unknown> =>
    event('SubagentStart', { agent_id: id, agent_type: 'general-purpose' })
  const stopListing = (...tasks: [string, 'subagent' | 'shell'][]): Record<string, unknown> =>
    event('Stop', {
      background_tasks: tasks.map(([id, type]) => ({ id, type, status: 'running' }))
    })
  const idle = event('Notification', { notification_type: 'idle_prompt' })

  it('keeps working when the main agent stops while a subagent runs (ASUB-01)', () => {
    const after = drive(
      event('UserPromptSubmit'),
      start('sub-1'),
      stopListing(['sub-1', 'subagent'])
    )
    expect(after?.view).toEqual({ state: 'working', subagents: 1 })
  })

  it('keeps working when the main agent stops while only a shell runs (ASUB-01)', () => {
    const after = drive(event('UserPromptSubmit'), stopListing(['shell-1', 'shell']))
    expect(after?.view).toEqual({ state: 'working', subagents: 0 })
  })

  it('does not wait when the last subagent stops after the main agent did (ASUB-02)', () => {
    const stopped = drive(
      event('UserPromptSubmit'),
      start('sub-1'),
      stopListing(['sub-1', 'subagent'])
    )
    const after = applyHookEvent(
      stopped,
      event('SubagentStop', { agent_id: 'sub-1', agent_type: 'general-purpose' })
    )
    expect(after?.view).toEqual({ state: 'working', subagents: 0 })
  })

  it('waits when the main agent stops with nothing listed, whatever the count said (ASUB-03)', () => {
    const after = drive(event('UserPromptSubmit'), start('sub-1'), stopListing())
    expect(after?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('ignores idle_prompt while the last Stop listed work (ASUB-05)', () => {
    const stopped = drive(
      event('UserPromptSubmit'),
      start('sub-1'),
      stopListing(['sub-1', 'subagent'])
    )
    expect(applyHookEvent(stopped, idle)).toBe(stopped)
  })

  it('waits on idle_prompt when the last Stop listed nothing, emptying the subagents (ASUB-05)', () => {
    const restarted = drive(event('UserPromptSubmit'), stopListing(), start('sub-9'))
    expect(restarted?.view).toEqual({ state: 'waiting', subagents: 1 })
    expect(applyHookEvent(restarted, idle)?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('decides by the live subagents when a Stop carries no list (ASUB-16)', () => {
    const stopped = drive(event('UserPromptSubmit'), start('sub-1'), event('Stop'))
    expect(stopped?.view).toEqual({ state: 'working', subagents: 1 })
    expect(applyHookEvent(stopped, idle)).toBe(stopped)
  })

  it('waits on idle_prompt with no list and no live subagent (ASUB-16)', () => {
    const stopped = drive(event('UserPromptSubmit'), event('PreToolUse', { tool_name: 'Bash' }))
    expect(applyHookEvent(stopped, idle)?.view).toEqual({ state: 'waiting', subagents: 0 })
  })

  it('takes the subagents from the list at every Stop, healing a lost SubagentStop (ASUB-17)', () => {
    const stopped = drive(
      event('UserPromptSubmit'),
      start('sub-1'),
      start('sub-2'),
      stopListing(['sub-2', 'subagent'], ['shell-1', 'shell'])
    )
    expect(stopped?.view).toEqual({ state: 'working', subagents: 1 })
    const afterSub2 = applyHookEvent(stopped, event('SubagentStop', { agent_id: 'sub-2' }))
    expect(afterSub2?.view.subagents).toBe(0)
  })

  it('counts a subagent again when it starts after stopping', () => {
    const after = drive(
      event('UserPromptSubmit'),
      start('sub-1'),
      event('SubagentStop', { agent_id: 'sub-1' }),
      start('sub-1')
    )
    expect(after?.view.subagents).toBe(1)
  })

  it('keeps the subagents across a new prompt', () => {
    const stopped = drive(
      event('UserPromptSubmit'),
      start('sub-1'),
      stopListing(['sub-1', 'subagent'])
    )
    expect(applyHookEvent(stopped, event('UserPromptSubmit'))?.view).toEqual({
      state: 'working',
      subagents: 1
    })
  })

  describe('results owed by stopped subagents', () => {
    /** A background subagent stops; Claude Code still lists it in its own SubagentStop. */
    const stopOwing = (id: string): Record<string, unknown> =>
      event('SubagentStop', {
        agent_id: id,
        agent_type: 'general-purpose',
        background_tasks: [{ id, type: 'subagent', status: 'running' }]
      })
    const result = (id: string): Record<string, unknown> =>
      event('UserPromptSubmit', {
        prompt: `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>\n</task-notification>`
      })
    const owing = (): MachineState | null =>
      drive(event('UserPromptSubmit'), start('sub-1'), stopOwing('sub-1'))

    it('keeps working at a Stop that lists nothing while a result is owed (ASUB-14)', () => {
      expect(applyHookEvent(owing(), stopListing())?.view).toEqual({
        state: 'working',
        subagents: 0
      })
    })

    it('owes nothing for a subagent its own SubagentStop does not list (ASUB-14)', () => {
      const after = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        event('SubagentStop', { agent_id: 'sub-1', background_tasks: [] }),
        stopListing()
      )
      expect(after?.view.state).toBe('waiting')
    })

    it('waits at the next empty Stop once the owed result is delivered (ASUB-15)', () => {
      const after = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        stopOwing('sub-1'),
        result('sub-1'),
        stopListing()
      )
      expect(after?.view.state).toBe('waiting')
    })

    it('keeps a result owed when the prompt delivers another one (ASUB-15)', () => {
      const after = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        start('sub-2'),
        stopOwing('sub-1'),
        stopOwing('sub-2'),
        result('sub-2'),
        stopListing()
      )
      expect(after?.view.state).toBe('working')
    })

    it('does not take a hand-back message for the delivered result (ASUB-15)', () => {
      const after = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        stopOwing('sub-1'),
        event('UserPromptSubmit', {
          prompt: '<agent-message from="sub-1">Fictitious hand-back.</agent-message>'
        }),
        stopListing()
      )
      expect(after?.view.state).toBe('working')
    })

    /** A plain turn after `state`: a prompt that delivers nothing, then an empty Stop. */
    const nextTurn = (state: MachineState | null): MachineState | null =>
      applyHookEvent(applyHookEvent(state, event('UserPromptSubmit')), stopListing())

    it('drops owed results on an idle_prompt that counts (ASUB-05)', () => {
      const idled = applyHookEvent(applyHookEvent(owing(), stopListing()), idle)
      expect(idled?.view.state).toBe('waiting')
      expect(nextTurn(idled)?.view.state).toBe('waiting')
    })

    it('drops owed results when the session ends', () => {
      const ended = applyHookEvent(owing(), event('SessionEnd', { reason: 'clear' }))
      expect(nextTurn(ended)?.view.state).toBe('waiting')
    })
  })

  describe('events count only for the agent that sent them', () => {
    const tool = (
      name: string,
      agentId: string | undefined,
      toolName = 'Bash'
    ): Record<string, unknown> =>
      event(name, {
        tool_name: toolName,
        ...(agentId ? { agent_id: agentId, agent_type: 'general-purpose' } : {})
      })
    const ask = (agentId: string, toolName = 'Write'): Record<string, unknown> =>
      event('PermissionRequest', {
        agent_id: agentId,
        agent_type: 'general-purpose',
        tool_name: toolName
      })
    const subagentStop = (agentId: string): Record<string, unknown> =>
      event('SubagentStop', { agent_id: agentId, agent_type: 'general-purpose' })
    /** Two background subagents; sub-2 asks to run Write while the main agent's turn is over. */
    const asked = (): MachineState | null =>
      drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        start('sub-2'),
        stopListing(['sub-1', 'subagent'], ['sub-2', 'subagent']),
        ask('sub-2')
      )
    const question = { state: 'needs-approval', tool: 'Write', subagents: 2 }

    it.each(['PreToolUse', 'PostToolUse', 'PostToolUseFailure'])(
      "ignores a side agent's %s (ASUB-18)",
      (name) => {
        const waiting = drive(event('UserPromptSubmit'), stopListing())
        expect(applyHookEvent(waiting, tool(name, 'side-1'))).toBe(waiting)
      }
    )

    it("applies a live subagent's tool event", () => {
      const stopped = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        stopListing(['sub-1', 'subagent'])
      )
      expect(applyHookEvent(stopped, tool('PreToolUse', 'sub-1'))?.view).toEqual({
        state: 'working',
        tool: 'Bash',
        subagents: 1
      })
    })

    it("needs approval for a subagent's PermissionRequest, naming the tool (ASUB-06)", () => {
      expect(asked()?.view).toEqual(question)
    })

    it("needs input for a subagent's Elicitation (ASUB-06)", () => {
      const after = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        event('Elicitation', { agent_id: 'sub-1', agent_type: 'general-purpose' })
      )
      expect(after?.view).toEqual({ state: 'needs-input', subagents: 1 })
    })

    it.each([
      ["another subagent's tool event", tool('PreToolUse', 'sub-1')],
      ["another subagent's tool result", tool('PostToolUse', 'sub-1')],
      ["the main agent's tool event", tool('PreToolUse', undefined)],
      ["the main agent's Stop", stopListing(['sub-1', 'subagent'], ['sub-2', 'subagent'])],
      ["the main agent's wake-up", event('UserPromptSubmit', { prompt: 'Fictitious prompt.' })],
      [
        'the permission_prompt notification',
        event('Notification', { notification_type: 'permission_prompt' })
      ],
      ['an idle_prompt', event('Notification', { notification_type: 'idle_prompt' })],
      ["another subagent's SubagentStop", subagentStop('sub-1')]
    ])('keeps the question on screen across %s (ASUB-07)', (_, other) => {
      const after = applyHookEvent(asked(), other)
      expect(after?.view.state).toBe('needs-approval')
      expect(after?.view.tool).toBe('Write')
    })

    it('still lets the asker clear the question after a notification without agent_id (ASUB-07)', () => {
      const notified = applyHookEvent(
        asked(),
        event('Notification', { notification_type: 'permission_prompt' })
      )
      expect(applyHookEvent(notified, tool('PostToolUse', 'sub-1'))?.view.state).toBe(
        'needs-approval'
      )
      expect(applyHookEvent(notified, tool('PostToolUse', 'sub-2', 'Write'))?.view).toEqual({
        state: 'working',
        subagents: 2
      })
    })

    it("keeps the main agent's own question, and its tool, across its permission_prompt (ASUB-07)", () => {
      const asking = drive(
        event('UserPromptSubmit'),
        event('PermissionRequest', { tool_name: 'Bash' })
      )
      const after = applyHookEvent(
        asking,
        event('Notification', { notification_type: 'permission_prompt' })
      )
      expect(after?.view).toEqual({ state: 'needs-approval', tool: 'Bash', subagents: 0 })
      expect(applyHookEvent(after, tool('PostToolUse', 'sub-1'))?.view.state).toBe('needs-approval')
    })

    it("clears the question on the asker's ElicitationResult (ASUB-08)", () => {
      const asking = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        start('sub-2'),
        event('Elicitation', { agent_id: 'sub-2', agent_type: 'general-purpose' })
      )
      expect(
        applyHookEvent(asking, event('ElicitationResult', { agent_id: 'sub-1' }))?.view.state
      ).toBe('needs-input')
      expect(
        applyHookEvent(asking, event('ElicitationResult', { agent_id: 'sub-2' }))?.view.state
      ).toBe('working')
    })

    it("clears to working on the asker's SubagentStop while the last Stop listed work (ASUB-08)", () => {
      expect(applyHookEvent(asked(), subagentStop('sub-2'))?.view).toEqual({
        state: 'working',
        subagents: 1
      })
    })

    it("clears to working on the asker's SubagentStop while the main agent's turn runs (ASUB-08)", () => {
      const asking = drive(event('UserPromptSubmit'), start('sub-1'), ask('sub-1'))
      expect(applyHookEvent(asking, subagentStop('sub-1'))?.view.state).toBe('working')
    })

    it("clears to waiting on the asker's SubagentStop when nothing else runs (ASUB-08)", () => {
      // A Stop without a list (older Claude Code) and a subagent's own tool event,
      // which does not reopen the main agent's turn.
      const asking = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        event('Stop'),
        tool('PreToolUse', 'sub-1'),
        ask('sub-1')
      )
      expect(applyHookEvent(asking, subagentStop('sub-1'))?.view).toEqual({
        state: 'waiting',
        subagents: 0
      })
    })

    it('counts a main-agent tool event as its turn running again (ASUB-08)', () => {
      const asking = drive(
        event('UserPromptSubmit'),
        start('sub-1'),
        event('Stop'),
        tool('PreToolUse', undefined),
        ask('sub-1')
      )
      expect(applyHookEvent(asking, subagentStop('sub-1'))?.view.state).toBe('working')
    })

    it('holds the question until every agent that asked has moved', () => {
      const both = applyHookEvent(asked(), ask('sub-1', 'Edit'))
      const oneMoved = applyHookEvent(both, tool('PostToolUse', 'sub-2', 'Write'))
      expect(oneMoved?.view.state).toBe('needs-approval')
      expect(applyHookEvent(oneMoved, tool('PostToolUse', 'sub-1', 'Edit'))?.view.state).toBe(
        'working'
      )
    })

    it('answers every pending question on a keystroke (ASUB-11)', () => {
      const answered = applyKeystroke(asked())
      expect(answered?.view).toEqual({ state: 'working', subagents: 2 })
      // sub-2's answered question must not hold a new one from sub-1.
      const again = applyHookEvent(answered, ask('sub-1', 'Edit'))
      expect(applyHookEvent(again, tool('PostToolUse', 'sub-1', 'Edit'))?.view.state).toBe(
        'working'
      )
    })
  })

  describe('replaying captured sequences (ASUB-12)', () => {
    /** The view after each event, replayed from no activity. */
    const replayViews = (events: readonly CapturedEvent[]): (SessionActivity | undefined)[] => {
      const views: (SessionActivity | undefined)[] = []
      events.reduce<MachineState | null>((state, e) => {
        const next = applyHookEvent(state, e)
        views.push(next?.view)
        return next
      }, null)
      return views
    }
    /** The state after each event, replayed from no activity. */
    const replay = (events: readonly CapturedEvent[]): (ActivityState | undefined)[] =>
      replayViews(events).map((view) => view?.state)
    const positions = (
      events: readonly CapturedEvent[],
      match: (e: CapturedEvent) => boolean
    ): number[] => events.flatMap((e, index) => (match(e) ? [index] : []))

    it('S4: a background shell keeps the session working until its result is handled', () => {
      expect(replay(backgroundShell)).toEqual([
        'working', // UserPromptSubmit
        'working', // PreToolUse Bash (run in the background)
        'working', // PostToolUse Bash
        'working', // Stop listing the shell
        'working', // a side agent's SubagentStop
        'working', // UserPromptSubmit with the shell's result
        'waiting', // Stop listing nothing: the job's end
        'waiting' // a side agent's SubagentStop
      ])
    })

    it('S3a: idle_prompt mid-job changes nothing; the job ends waiting', () => {
      const states = replay(idlePromptWhileSubagentRuns)
      const stops = positions(idlePromptWhileSubagentRuns, (e) => e.hook_event_name === 'Stop')
      const idles = positions(
        idlePromptWhileSubagentRuns,
        (e) => e.notification_type === 'idle_prompt'
      )
      expect(states[stops[0]]).toBe('working')
      expect(states[idles[0]]).toBe('working')
      expect(states[stops[stops.length - 1]]).toBe('waiting')
      expect(states[idles[idles.length - 1]]).toBe('waiting')
    })

    /** Working from the first Stop up to the last one, and waiting from there on. */
    const expectOneEnd = (events: readonly CapturedEvent[]): void => {
      const states = replay(events)
      const stops = positions(events, (e) => e.hook_event_name === 'Stop')
      const first = stops[0]
      const last = stops[stops.length - 1]
      expect(states.slice(first, last)).toEqual(Array(last - first).fill('working'))
      expect(states.slice(last)).toEqual(Array(states.length - last).fill('waiting'))
    }

    it('S1: works from the first Stop to the last, through restarts and the end race (ASUB-14)', () => {
      expectOneEnd(fanOutWithWakeUps)
    })

    it('S3a: works from the first Stop to the last, through the end race (ASUB-14)', () => {
      expectOneEnd(idlePromptWhileSubagentRuns)
    })

    it("S1: a side agent's tool event leaves the view as it was (ASUB-18)", () => {
      const views = replayViews(fanOutWithWakeUps)
      const [side] = positions(fanOutWithWakeUps, (e) => e.tool_name === 'SendFeedback')
      expect(side).toBeDefined()
      expect(views[side]).toEqual(views[side - 1])
    })

    it("S2: the question holds across the other subagent's work until the asker moves (ASUB-07, ASUB-08)", () => {
      const events = approvalWhileAnotherWorks
      const states = replay(events)
      const [asked] = positions(events, (e) => e.hook_event_name === 'PermissionRequest')
      const [answered] = positions(
        events,
        (e) => e.hook_event_name === 'PostToolUse' && e.agent_id === events[asked].agent_id
      )
      const stops = positions(events, (e) => e.hook_event_name === 'Stop')
      const last = stops[stops.length - 1]
      expect(answered - asked).toBeGreaterThan(10)
      expect(states.slice(asked, answered)).toEqual(Array(answered - asked).fill('needs-approval'))
      expect(states.slice(answered, last)).toEqual(Array(last - answered).fill('working'))
      expect(states.slice(last)).toEqual(Array(states.length - last).fill('waiting'))
    })
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
