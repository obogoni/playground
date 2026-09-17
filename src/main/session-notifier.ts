import type { NotificationPrefs } from '../shared/notifications'
import {
  decideNotification,
  describeNotification,
  type ActivityChange
} from './activity-notification'
import type { EmitFn } from './session-manager'

export interface SessionNotifierDeps {
  /** The switches as configured right now. */
  prefs(): NotificationPrefs
  /** False when the window is missing, unfocused or minimized (NOTF-24). */
  windowFocused(): boolean
  /** Show a native notification; `onClick` runs when the user clicks it. */
  showOs(title: string, body: string, onClick: () => void): void
  /** Bring the window forward. */
  reveal(): void
  emit: EmitFn
}

/**
 * Turns one session activity transition into an OS notification, an in-app
 * notice, or nothing. Electron is injected, so the routing is tested with fakes;
 * the decision itself lives in `activity-notification.ts`.
 */
export class SessionNotifier {
  constructor(private readonly deps: SessionNotifierDeps) {}

  handle(change: ActivityChange): void {
    const surface = decideNotification({
      before: change.before,
      after: change.after,
      attached: change.attached,
      windowFocused: this.deps.windowFocused(),
      prefs: this.deps.prefs()
    })
    if (surface === null || change.after === null) return
    const { title, body } = describeNotification(change, change.after)
    const { id } = change
    if (surface === 'in-app') {
      this.deps.emit('session:notice', { id, title, body })
      return
    }
    this.deps.showOs(title, body, () => {
      this.deps.reveal()
      this.deps.emit('session:focus', { id })
    })
  }
}
