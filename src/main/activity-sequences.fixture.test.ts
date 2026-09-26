import { describe, expect, it } from 'vitest'
import { CAPTURED_SEQUENCES, type CapturedEvent } from './activity-sequences.fixture'

/** The fields a fixture may keep: the ones the activity machine reads. */
const ALLOWED_KEYS = [
  'hook_event_name',
  'agent_id',
  'agent_type',
  'tool_name',
  'notification_type',
  'reason',
  'prompt',
  'background_tasks'
]

const FICTITIOUS_ID = /^(sub|side|shell)-\d+$/

/** The only prompt texts a fixture may carry: a marker, or a fixed sentence. */
const ALLOWED_PROMPTS = [
  /^<task-notification>\n<task-id>(sub|shell)-\d+<\/task-id>\n<\/task-notification>$/,
  /^<agent-message from="sub-\d+">Fictitious hand-back\.<\/agent-message>$/,
  /^Fictitious prompt\.$/
]

/** Shapes that give away a real machine, whatever field they hide in. */
const REAL_LOOKING = [
  { name: 'a Windows user folder', pattern: /\\Users\\|\/Users\//i },
  { name: 'a drive-letter path', pattern: /\b[A-Za-z]:[\\/]/ },
  { name: 'a UUID', pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  { name: 'a Claude Code agent id', pattern: /\b[0-9a-f]{17}\b/ }
]

/** Every reason a sequence could not be published as it stands (ASUB-13). */
function findLeaks(events: readonly CapturedEvent[]): string[] {
  const leaks: string[] = []
  events.forEach((event, index) => {
    const at = `event ${index} (${event.hook_event_name})`
    for (const key of Object.keys(event)) {
      if (!ALLOWED_KEYS.includes(key)) leaks.push(`${at}: field ${key} is not read by the machine`)
    }
    const ids = [event.agent_id, ...(event.background_tasks ?? []).map((task) => task.id)]
    for (const id of ids) {
      if (id !== undefined && !FICTITIOUS_ID.test(id))
        leaks.push(`${at}: id ${id} is not fictitious`)
    }
    if (
      event.prompt !== undefined &&
      !ALLOWED_PROMPTS.some((allowed) => allowed.test(event.prompt ?? ''))
    ) {
      leaks.push(`${at}: prompt is free text`)
    }
    const text = JSON.stringify(event)
    for (const { name, pattern } of REAL_LOOKING) {
      if (pattern.test(text)) leaks.push(`${at}: contains ${name}`)
    }
  })
  return leaks
}

describe('captured hook sequences', () => {
  it.each(Object.entries(CAPTURED_SEQUENCES))(
    '%s holds nothing from a real machine (ASUB-13)',
    (_, events) => {
      expect(findLeaks(events)).toEqual([])
    }
  )

  it.each(Object.entries(CAPTURED_SEQUENCES))('%s is not empty', (_, events) => {
    expect(events.length).toBeGreaterThan(0)
  })
})

describe('findLeaks', () => {
  const clean: CapturedEvent = { hook_event_name: 'Stop', background_tasks: [] }

  it('passes a clean event', () => {
    expect(findLeaks([clean])).toEqual([])
  })

  it.each([
    ['a Windows user folder', { ...clean, reason: 'C:\\Users\\someone\\project' }],
    ['a drive-letter path', { ...clean, reason: 'D:/work/repo' }],
    ['a UUID', { ...clean, reason: '00000000-1111-4222-8333-444444444444' }],
    ['a Claude Code agent id', { ...clean, reason: '0123456789abcdef0' }]
  ])('rejects %s in any field', (name, event) => {
    expect(findLeaks([event])).toContain(`event 0 (Stop): contains ${name}`)
  })

  it('rejects an id that is not fictitious', () => {
    const event: CapturedEvent = { hook_event_name: 'SubagentStart', agent_id: 'reviewer' }
    expect(findLeaks([event])).toEqual(['event 0 (SubagentStart): id reviewer is not fictitious'])
  })

  it('rejects a real-shaped task id hidden in a background list', () => {
    const event: CapturedEvent = {
      hook_event_name: 'Stop',
      background_tasks: [{ id: 'bgjob0042', type: 'shell' }]
    }
    expect(findLeaks([event])).toEqual(['event 0 (Stop): id bgjob0042 is not fictitious'])
  })

  it('rejects free prompt text', () => {
    const event: CapturedEvent = {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Fix the login page'
    }
    expect(findLeaks([event])).toEqual(['event 0 (UserPromptSubmit): prompt is free text'])
  })

  it('rejects a field the machine does not read', () => {
    const event = { ...clean, last_assistant_message: 'done' } as CapturedEvent
    expect(findLeaks([event])).toEqual([
      'event 0 (Stop): field last_assistant_message is not read by the machine'
    ])
  })
})
