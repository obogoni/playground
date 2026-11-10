/**
 * What Settings' "start with Windows" checkbox shows for a login item state and
 * the last failed change (TRAY-20, 21, 25, 26).
 */
import type { LoginItemState } from '../../../shared/login-item'

export const LOGIN_ITEM_LABEL = 'Start Playground when Windows starts'

export interface LoginItemView {
  checked: boolean
  disabled: boolean
  note: string
  /** The line under the box after a failed change; null when there is none. */
  error: string | null
}

export function loginItemView(state: LoginItemState, failure: string | null): LoginItemView {
  return {
    checked: state.enabled,
    disabled: !state.available,
    note: state.available ? 'opens hidden in the tray' : 'only in the installed app',
    error: failure === null ? null : `Couldn't change the startup setting: ${failure}`
  }
}
