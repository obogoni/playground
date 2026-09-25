import type { NotificationPrefs } from '../shared/notifications'
import {
  decideNotification,
  describeNotification,
  type ActivityChange,
  type LinkedTask
} from './activity-notification'
import type { EmitFn } from './session-manager'

export interface SessionNotifierDeps {
  /** The switches as configured right now. */
  prefs(): NotificationPrefs
  /** False when the window is missing, unfocused or minimized (NOTF-24). */
  windowFocused(): boolean
  /** The task the session's branch names; looked up only for a notifying transition. */
  linkedTask(cwd: string): Promise<LinkedTask | null>
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

  async handle(change: ActivityChange): Promise<void> {
    const surface = decideNotification({
      before: change.before,
      after: change.after,
      attached: change.attached,
      windowFocused: this.deps.windowFocused(),
      prefs: this.deps.prefs()
    })
    if (surface === null || change.after === null) return
    // A failed lookup costs the task, never the notification (NOTF-34).
    const task = await this.deps.linkedTask(change.cwd).catch(() => null)
    const { title, body } = describeNotification(change, change.after, task)
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
