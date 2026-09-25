/**
 * Hook sequences captured from a real Claude Code 2.1.283 session driving
 * background subagents (activity-subagent-attribution, T1), in the order the
 * app received them. Reduced to the fields the activity machine reads.
 *
 * Every id and text is fictitious (ASUB-13): subagents are `sub-n`, Claude
 * Code's own side agents (prompt suggestion, session recap: an `agent_id`, no
 * `agent_type`, no `SubagentStart`) are `side-n`, background shells `shell-n`.
 * A prompt keeps only its `<task-notification>` or `<agent-message>` marker.
 */

/** A hook payload, reduced to the fields the machine reads. */
export type CapturedEvent = {
  hook_event_name: string
  agent_id?: string
  agent_type?: string
  tool_name?: string
  notification_type?: string
  reason?: string
  prompt?: string
  background_tasks?: { id: string; type: 'subagent' | 'shell' }[]
}

/**
 * S1: two background subagents. Each ran its sleep as a background shell, handed
 * back early, stopped, and started again when its shell ended. The job ends at the
 * last `Stop`; the one before it has an empty list while two results are still owed.
 */
export const fanOutWithWakeUps: readonly CapturedEvent[] = [
  { hook_event_name: 'UserPromptSubmit', prompt: 'Fictitious prompt.' },
  { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
  { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'general-purpose' },
  { hook_event_name: 'PostToolUse', tool_name: 'Agent' },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-2', agent_type: 'general-purpose' },
  { hook_event_name: 'PostToolUse', tool_name: 'Agent' },
  {
    hook_event_name: 'Stop',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-1',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'SubagentHandback'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'ToolSearch'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'ToolSearch'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'SubagentHandback'
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<agent-message from="sub-1">Fictitious hand-back.</agent-message>'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' },
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'Stop',
    background_tasks: [
      { id: 'sub-2', type: 'subagent' },
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-1</task-id>\n</task-notification>'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    background_tasks: [
      { id: 'sub-2', type: 'subagent' },
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'Stop',
    background_tasks: [
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-2</task-id>\n</task-notification>'
  },
  { hook_event_name: 'PreToolUse', agent_id: 'side-2', tool_name: 'SendFeedback' },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-3',
    background_tasks: [
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'Stop',
    background_tasks: [
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-2',
    background_tasks: [
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-4',
    background_tasks: [
      { id: 'shell-1', type: 'shell' },
      { id: 'shell-2', type: 'shell' }
    ]
  },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'general-purpose' },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-2', agent_type: 'general-purpose' },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'SubagentHandback'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'SubagentHandback'
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<agent-message from="sub-2">Fictitious hand-back.</agent-message>'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  { hook_event_name: 'Stop', background_tasks: [] },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-2</task-id>\n</task-notification>'
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-1</task-id>\n</task-notification>'
  },
  { hook_event_name: 'SubagentStop', agent_id: 'side-5', background_tasks: [] },
  { hook_event_name: 'Stop', background_tasks: [] },
  { hook_event_name: 'SubagentStop', agent_id: 'side-6', background_tasks: [] }
]

/**
 * S2: `sub-2` asks to run `Write` while `sub-1` keeps running tools; the owner
 * answers about 30 s later. The `permission_prompt` notification carries no `agent_id`.
 */
export const approvalWhileAnotherWorks: readonly CapturedEvent[] = [
  { hook_event_name: 'UserPromptSubmit', prompt: 'Fictitious prompt.' },
  { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'general-purpose' },
  { hook_event_name: 'PostToolUse', tool_name: 'Agent' },
  { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-2', agent_type: 'general-purpose' },
  { hook_event_name: 'PostToolUse', tool_name: 'Agent' },
  {
    hook_event_name: 'Stop',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'Write'
  },
  {
    hook_event_name: 'PermissionRequest',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'Write'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-1',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  { hook_event_name: 'Notification', notification_type: 'permission_prompt' },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-2',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-3',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    tool_name: 'Write'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-2',
    agent_type: 'general-purpose',
    background_tasks: [
      { id: 'sub-1', type: 'subagent' },
      { id: 'sub-2', type: 'subagent' }
    ]
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-2</task-id>\n</task-notification>'
  },
  { hook_event_name: 'Stop', background_tasks: [{ id: 'sub-1', type: 'subagent' }] },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-1</task-id>\n</task-notification>'
  },
  { hook_event_name: 'PreToolUse', agent_id: 'side-4', tool_name: 'Bash' },
  { hook_event_name: 'Stop', background_tasks: [] },
  { hook_event_name: 'SubagentStop', agent_id: 'side-4', background_tasks: [] },
  { hook_event_name: 'SubagentStop', agent_id: 'side-5', background_tasks: [] }
]

/**
 * S3a: one background subagent runs tools for about 2.5 min. `idle_prompt` fires
 * 60 s after the main agent's `Stop` while it still runs, and again 60 s after the
 * job's real end.
 */
export const idlePromptWhileSubagentRuns: readonly CapturedEvent[] = [
  { hook_event_name: 'UserPromptSubmit', prompt: 'Fictitious prompt.' },
  { hook_event_name: 'PreToolUse', tool_name: 'Agent' },
  { hook_event_name: 'SubagentStart', agent_id: 'sub-1', agent_type: 'general-purpose' },
  { hook_event_name: 'PostToolUse', tool_name: 'Agent' },
  { hook_event_name: 'Stop', background_tasks: [{ id: 'sub-1', type: 'subagent' }] },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-1',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-2',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  { hook_event_name: 'Notification', notification_type: 'idle_prompt' },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-3',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-4',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-5',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'Bash'
  },
  {
    hook_event_name: 'PreToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'SubagentHandback'
  },
  {
    hook_event_name: 'PostToolUse',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    tool_name: 'SubagentHandback'
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<agent-message from="sub-1">Fictitious hand-back.</agent-message>'
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-6',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'sub-1',
    agent_type: 'general-purpose',
    background_tasks: [{ id: 'sub-1', type: 'subagent' }]
  },
  { hook_event_name: 'Stop', background_tasks: [] },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>sub-1</task-id>\n</task-notification>'
  },
  { hook_event_name: 'SubagentStop', agent_id: 'side-7', background_tasks: [] },
  { hook_event_name: 'Stop', background_tasks: [] },
  { hook_event_name: 'SubagentStop', agent_id: 'side-8', background_tasks: [] },
  { hook_event_name: 'Notification', notification_type: 'idle_prompt' }
]

/**
 * S4: the main agent starts a background shell and ends its turn; the shell's
 * result wakes it for one more turn.
 */
export const backgroundShell: readonly CapturedEvent[] = [
  { hook_event_name: 'UserPromptSubmit', prompt: 'Fictitious prompt.' },
  { hook_event_name: 'PreToolUse', tool_name: 'Bash' },
  { hook_event_name: 'PostToolUse', tool_name: 'Bash' },
  { hook_event_name: 'Stop', background_tasks: [{ id: 'shell-1', type: 'shell' }] },
  {
    hook_event_name: 'SubagentStop',
    agent_id: 'side-1',
    background_tasks: [{ id: 'shell-1', type: 'shell' }]
  },
  {
    hook_event_name: 'UserPromptSubmit',
    prompt: '<task-notification>\n<task-id>shell-1</task-id>\n</task-notification>'
  },
  { hook_event_name: 'Stop', background_tasks: [] },
  { hook_event_name: 'SubagentStop', agent_id: 'side-2', background_tasks: [] }
]

/** Every captured sequence, by name. */
export const CAPTURED_SEQUENCES = {
  fanOutWithWakeUps,
  approvalWhileAnotherWorks,
  idlePromptWhileSubagentRuns,
  backgroundShell
}
