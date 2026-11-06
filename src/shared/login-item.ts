/** The Windows login item that starts the app hidden in the tray (TRAY-20..26). */
export interface LoginItemState {
  /** False outside the installed (packaged) app; the checkbox is disabled. */
  available: boolean
  /** The OS will start the app at login (Task Manager's Startup apps respected). */
  enabled: boolean
}

export type LoginItemResult =
  | { ok: true; state: LoginItemState }
  | { ok: false; error: string; state: LoginItemState }
