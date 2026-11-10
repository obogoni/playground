import { describe, expect, it } from 'vitest'
import { LOGIN_ITEM_LABEL, loginItemView } from './login-item-view'

describe('loginItemView', () => {
  it('labels the option (TRAY-20)', () => {
    expect(LOGIN_ITEM_LABEL).toBe('Start Playground when Windows starts')
  })

  it('offers an enabled control noting the hidden start when available (TRAY-20)', () => {
    expect(loginItemView({ available: true, enabled: false }, null)).toEqual({
      checked: false,
      disabled: false,
      note: 'opens hidden in the tray',
      error: null
    })
  })

  it.each([true, false])('checks the box exactly when the OS has it on (%s) (TRAY-21)', (on) => {
    expect(loginItemView({ available: true, enabled: on }, null).checked).toBe(on)
  })

  it('disables the control outside the installed app (TRAY-25)', () => {
    expect(loginItemView({ available: false, enabled: false }, null)).toEqual({
      checked: false,
      disabled: true,
      note: 'only in the installed app',
      error: null
    })
  })

  it('shows a failed change under the box (TRAY-26)', () => {
    expect(loginItemView({ available: true, enabled: false }, 'Access is denied.').error).toBe(
      "Couldn't change the startup setting: Access is denied."
    )
  })
})
