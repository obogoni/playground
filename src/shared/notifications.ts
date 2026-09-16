import type { ActivityState, AppConfig } from './config'

/** The activity states where the agent has stopped and the next move is the user's. */
export type NotifiableState = Extract<
  ActivityState,
  'needs-approval' | 'needs-input' | 'waiting' | 'error'
>

export const NOTIFIABLE_STATES: readonly NotifiableState[] = [
  'needs-approval',
  'needs-input',
  'waiting',
  'error'
]

type NotifyStateKey = 'notifyNeedsApproval' | 'notifyNeedsInput' | 'notifyWaiting' | 'notifyError'

/** Which `ui` switch gates each state. Flat keys, because `config:patch` merges
 *  `ui` one level deep: a nested object would be replaced whole (NOTF-19). */
export const NOTIFY_STATE_KEYS: Record<NotifiableState, NotifyStateKey> = {
  'needs-approval': 'notifyNeedsApproval',
  'needs-input': 'notifyNeedsInput',
  waiting: 'notifyWaiting',
  error: 'notifyError'
}

export interface NotificationPrefs {
  /** The master switch. */
  enabled: boolean
  /** Each state's own switch, kept as configured whatever the master says. */
  states: Record<NotifiableState, boolean>
}

/** Read the switches, where an absent key means on (NOTF-17). */
export function readNotificationPrefs(ui: AppConfig['ui']): NotificationPrefs {
  const on = (value: boolean | undefined): boolean => value !== false
  return {
    enabled: on(ui.notify),
    states: {
      'needs-approval': on(ui[NOTIFY_STATE_KEYS['needs-approval']]),
      'needs-input': on(ui[NOTIFY_STATE_KEYS['needs-input']]),
      waiting: on(ui[NOTIFY_STATE_KEYS.waiting]),
      error: on(ui[NOTIFY_STATE_KEYS.error])
    }
  }
}
