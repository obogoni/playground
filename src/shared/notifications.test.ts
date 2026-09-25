import { describe, expect, it } from 'vitest'
import type { AppConfig } from './config'
import { NOTIFIABLE_STATES, NOTIFY_STATE_KEYS, readNotificationPrefs } from './notifications'

const BASE_UI: AppConfig['ui'] = { theme: 'dark', direction: 'tree', defaultShell: 'pwsh' }

const ALL_ON = {
  enabled: true,
  states: { 'needs-approval': true, 'needs-input': true, waiting: true, error: true }
}

describe('NOTIFIABLE_STATES', () => {
  it('holds exactly the four states where the next move is the user', () => {
    expect([...NOTIFIABLE_STATES]).toEqual(['needs-approval', 'needs-input', 'waiting', 'error'])
  })
})

describe('NOTIFY_STATE_KEYS', () => {
  it('maps each notifiable state to its own ui switch', () => {
    expect(NOTIFY_STATE_KEYS).toEqual({
      'needs-approval': 'notifyNeedsApproval',
      'needs-input': 'notifyNeedsInput',
      waiting: 'notifyWaiting',
      error: 'notifyError'
    })
  })
})

describe('readNotificationPrefs', () => {
  it('treats a config with no switches as everything on (NOTF-17)', () => {
    expect(readNotificationPrefs(BASE_UI)).toEqual(ALL_ON)
  })

  it('treats an explicit true exactly like an absent key', () => {
    const ui = {
      ...BASE_UI,
      notify: true,
      notifyNeedsApproval: true,
      notifyNeedsInput: true,
      notifyWaiting: true,
      notifyError: true
    }
    expect(readNotificationPrefs(ui)).toEqual(ALL_ON)
  })

  it('turns the master off without touching any state (NOTF-13, NOTF-19)', () => {
    expect(readNotificationPrefs({ ...BASE_UI, notify: false })).toEqual({
      ...ALL_ON,
      enabled: false
    })
  })

  it('keeps a state that was off while the master is also off (NOTF-19)', () => {
    expect(readNotificationPrefs({ ...BASE_UI, notify: false, notifyWaiting: false })).toEqual({
      enabled: false,
      states: { 'needs-approval': true, 'needs-input': true, waiting: false, error: true }
    })
  })

  it.each(NOTIFIABLE_STATES)('turns off only %s when its switch is false (NOTF-14)', (state) => {
    const prefs = readNotificationPrefs({ ...BASE_UI, [NOTIFY_STATE_KEYS[state]]: false })
    expect(prefs).toEqual({ enabled: true, states: { ...ALL_ON.states, [state]: false } })
  })
})
