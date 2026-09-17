import { describe, expect, it } from 'vitest'
import type { SessionActivity } from '../shared/config'
import type { IpcEvent, IpcEvents } from '../shared/ipc-contract'
import type { NotificationPrefs } from '../shared/notifications'
import type { ActivityChange } from './activity-notification'
import { SessionNotifier } from './session-notifier'

const ALL_ON: NotificationPrefs = {
  enabled: true,
  states: { 'needs-approval': true, 'needs-input': true, waiting: true, error: true }
}

interface ShownOs {
  title: string
  body: string
  onClick: () => void
}

interface Harness {
  notifier: SessionNotifier
  shown: ShownOs[]
  emitted: { channel: IpcEvent; payload: unknown }[]
  calls: string[]
  state: { focused: boolean; prefs: NotificationPrefs }
}

function harness(opts: { focused: boolean; prefs?: NotificationPrefs }): Harness {
  const calls: string[] = []
  const shown: ShownOs[] = []
  const emitted: { channel: IpcEvent; payload: unknown }[] = []
  const state = { focused: opts.focused, prefs: opts.prefs ?? ALL_ON }
  const notifier = new SessionNotifier({
    prefs: () => state.prefs,
    windowFocused: () => state.focused,
    showOs: (title, body, onClick) => {
      shown.push({ title, body, onClick })
    },
    reveal: () => {
      calls.push('reveal')
    },
    emit: <E extends IpcEvent>(channel: E, payload: IpcEvents[E]) => {
      calls.push(`emit:${channel}`)
      emitted.push({ channel, payload })
    }
  })
  return { notifier, shown, emitted, calls, state }
}

function activity(
  state: SessionActivity['state'],
  extra: Partial<SessionActivity> = {}
): SessionActivity {
  return { state, subagents: 0, ...extra }
}

function change(overrides: Partial<ActivityChange> = {}): ActivityChange {
  return {
    id: 's1',
    agent: 'Claude',
    title: 'Claude · feature-login',
    cwd: 'C:\\work\\repo-feature-login',
    before: activity('working'),
    after: activity('needs-approval', { tool: 'Bash' }),
    attached: false,
    ...overrides
  }
}

describe('SessionNotifier', () => {
  it('shows one OS notification, and nothing in-app, while the window is not focused (NOTF-01)', () => {
    const { notifier, shown, emitted } = harness({ focused: false })
    notifier.handle(change())
    expect(shown.map(({ title, body }) => ({ title, body }))).toEqual([
      { title: 'Claude · feature-login', body: 'Needs approval to run Bash' }
    ])
    expect(emitted).toEqual([])
  })

  it('reveals the window and then asks the renderer to open the session on click (NOTF-05)', () => {
    const { notifier, shown, emitted, calls } = harness({ focused: false })
    notifier.handle(change())
    shown[0].onClick()
    expect(calls).toEqual(['reveal', 'emit:session:focus'])
    expect(emitted).toEqual([{ channel: 'session:focus', payload: { id: 's1' } }])
  })

  it('pushes one in-app notice, and no OS notification, while focused on another session (NOTF-02)', () => {
    const { notifier, shown, emitted } = harness({ focused: true })
    notifier.handle(change())
    expect(shown).toEqual([])
    expect(emitted).toEqual([
      {
        channel: 'session:notice',
        payload: { id: 's1', title: 'Claude · feature-login', body: 'Needs approval to run Bash' }
      }
    ])
  })

  it('does nothing when the transition is not notifiable', () => {
    const { notifier, shown, emitted } = harness({ focused: true })
    notifier.handle(change({ attached: true }))
    notifier.handle(change({ after: activity('working') }))
    expect(shown).toEqual([])
    expect(emitted).toEqual([])
  })

  it('reads focus and switches on every change, so a toggle applies to the next one', () => {
    const { notifier, shown, emitted, state } = harness({ focused: false })
    state.prefs = { ...ALL_ON, enabled: false }
    notifier.handle(change())
    expect(shown).toEqual([])
    state.prefs = ALL_ON
    state.focused = true
    notifier.handle(change())
    expect(shown).toEqual([])
    expect(emitted.map((e) => e.channel)).toEqual(['session:notice'])
  })

  it('raises one notification per session when several stop at once (NOTF-22)', () => {
    const { notifier, shown } = harness({ focused: false })
    notifier.handle(change({ id: 's1' }))
    notifier.handle(
      change({ id: 's2', title: 'Claude · feature-cart', after: activity('waiting') })
    )
    expect(shown.map((s) => ({ title: s.title, body: s.body }))).toEqual([
      { title: 'Claude · feature-login', body: 'Needs approval to run Bash' },
      { title: 'Claude · feature-cart', body: 'Finished its turn' }
    ])
  })

  it('opens the session each notification was raised for (NOTF-22)', () => {
    const { notifier, shown, emitted } = harness({ focused: false })
    notifier.handle(change({ id: 's1' }))
    notifier.handle(change({ id: 's2', after: activity('waiting') }))
    shown[1].onClick()
    shown[0].onClick()
    expect(emitted.map((e) => e.payload)).toEqual([{ id: 's2' }, { id: 's1' }])
  })
})
