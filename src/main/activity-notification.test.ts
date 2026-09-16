import { describe, expect, it } from 'vitest'
import type { ActivityState, SessionActivity } from '../shared/config'
import { NOTIFIABLE_STATES, type NotificationPrefs } from '../shared/notifications'
import { decideNotification, describeNotification } from './activity-notification'

function activity(state: ActivityState, extra: Partial<SessionActivity> = {}): SessionActivity {
  return { state, subagents: 0, ...extra }
}

const ALL_ON: NotificationPrefs = {
  enabled: true,
  states: { 'needs-approval': true, 'needs-input': true, waiting: true, error: true }
}

const UNFOCUSED = { attached: false, windowFocused: false, prefs: ALL_ON }
const FOCUSED_ELSEWHERE = { attached: false, windowFocused: true, prefs: ALL_ON }
const FOCUSED_ATTACHED = { attached: true, windowFocused: true, prefs: ALL_ON }

const WORKING = activity('working')

describe('decideNotification', () => {
  describe.each(NOTIFIABLE_STATES)('entering %s from working', (state) => {
    const change = { before: WORKING, after: activity(state) }

    it('uses the OS notification while the window is not focused (NOTF-01, NOTF-07, NOTF-08)', () => {
      expect(decideNotification({ ...change, ...UNFOCUSED })).toBe('os')
    })

    it('uses the in-app notice while focused on another session (NOTF-02, NOTF-09)', () => {
      expect(decideNotification({ ...change, ...FOCUSED_ELSEWHERE })).toBe('in-app')
    })

    it('stays silent while focused on that very session (NOTF-03)', () => {
      expect(decideNotification({ ...change, ...FOCUSED_ATTACHED })).toBeNull()
    })

    it('uses the OS notification for the attached session when the window is not focused', () => {
      // A minimized window reports unfocused, so this is also NOTF-24.
      expect(decideNotification({ ...change, ...UNFOCUSED, attached: true })).toBe('os')
    })

    it('stays silent on both surfaces when the master switch is off (NOTF-13)', () => {
      const prefs = { ...ALL_ON, enabled: false }
      expect(decideNotification({ ...change, ...UNFOCUSED, prefs })).toBeNull()
      expect(decideNotification({ ...change, ...FOCUSED_ELSEWHERE, prefs })).toBeNull()
    })

    it('stays silent when its own switch is off, and the others still notify (NOTF-14)', () => {
      const prefs = { ...ALL_ON, states: { ...ALL_ON.states, [state]: false } }
      expect(decideNotification({ ...change, ...UNFOCUSED, prefs })).toBeNull()
      expect(decideNotification({ ...change, ...FOCUSED_ELSEWHERE, prefs })).toBeNull()
      for (const other of NOTIFIABLE_STATES.filter((s) => s !== state)) {
        const next = { before: WORKING, after: activity(other) }
        expect(decideNotification({ ...next, ...UNFOCUSED, prefs })).toBe('os')
      }
    })

    it("stays silent on a session's first activity event (NOTF-27)", () => {
      expect(decideNotification({ before: null, after: activity(state), ...UNFOCUSED })).toBeNull()
    })
  })

  it.each<ActivityState>(['working', 'compacting', 'exited'])(
    'never notifies on entering %s (NOTF-10)',
    (state) => {
      const before = activity('waiting')
      expect(decideNotification({ before, after: activity(state), ...UNFOCUSED })).toBeNull()
      expect(
        decideNotification({ before, after: activity(state), ...FOCUSED_ELSEWHERE })
      ).toBeNull()
    }
  )

  it('never notifies when the session has no activity state (NOTF-11)', () => {
    expect(decideNotification({ before: WORKING, after: null, ...UNFOCUSED })).toBeNull()
  })

  it('stays silent when an answered approval moves the session to working (NOTF-25)', () => {
    const before = activity('needs-approval', { tool: 'Bash' })
    expect(
      decideNotification({ before, after: activity('working', { tool: 'Bash' }), ...UNFOCUSED })
    ).toBeNull()
  })

  it('stays silent when only the detail of the same state changes', () => {
    const before = activity('needs-approval', { tool: 'Bash' })
    const otherTool = activity('needs-approval', { tool: 'Edit' })
    const moreSubagents = activity('needs-approval', { tool: 'Bash', subagents: 2 })
    expect(decideNotification({ before, after: otherTool, ...UNFOCUSED })).toBeNull()
    expect(decideNotification({ before, after: moreSubagents, ...UNFOCUSED })).toBeNull()
  })

  it('notifies when a blocked session moves straight to another notifiable state', () => {
    const before = activity('needs-approval', { tool: 'Bash' })
    expect(
      decideNotification({
        before,
        after: activity('error', { error: 'rate_limit' }),
        ...UNFOCUSED
      })
    ).toBe('os')
  })
})

describe('describeNotification', () => {
  const session = { agent: 'Claude', title: 'Claude · feature-login' }

  it('names the tool an approval is blocked on (NOTF-04)', () => {
    expect(describeNotification(session, activity('needs-approval', { tool: 'Bash' }))).toEqual({
      title: 'Claude · feature-login',
      body: 'Needs approval to run Bash'
    })
  })

  it('still asks for approval when no tool is known', () => {
    expect(describeNotification(session, activity('needs-approval')).body).toBe(
      'Needs your approval'
    )
  })

  it('asks for input', () => {
    expect(describeNotification(session, activity('needs-input')).body).toBe('Needs your input')
  })

  it('says the turn finished', () => {
    expect(describeNotification(session, activity('waiting')).body).toBe('Finished its turn')
  })

  it('names the error type of a failed turn (NOTF-08)', () => {
    expect(describeNotification(session, activity('error', { error: 'rate_limit' })).body).toBe(
      'Turn failed: rate_limit'
    )
  })

  it('reports a failed turn with no error type', () => {
    expect(describeNotification(session, activity('error')).body).toBe('Turn failed')
  })

  it('names the agent and the title without doubling the agent prefix (NOTF-12)', () => {
    expect(describeNotification(session, activity('waiting')).title).toBe('Claude · feature-login')
  })

  it('adds the agent to a renamed title (NOTF-12)', () => {
    const renamed = { agent: 'Claude', title: 'Fix login redirect' }
    expect(describeNotification(renamed, activity('waiting')).title).toBe(
      'Claude · Fix login redirect'
    )
  })
})
