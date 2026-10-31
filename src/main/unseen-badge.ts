/** Where the dot is drawn: the window's taskbar overlay in production, a fake in tests. */
export interface UnseenBadgePort {
  show(): void
  clear(): void
}

/**
 * The red dot over the taskbar icon. An OS notification raised while the user
 * was away flags it; focusing the window clears it (TBDT-01, TBDT-03). It is one
 * dot, not a count: flagging a shown dot changes nothing (TBDT-04).
 */
export class UnseenBadge {
  #shown = false

  constructor(private readonly port: UnseenBadgePort) {}

  flag(): void {
    if (this.#shown) return
    this.#shown = true
    this.port.show()
  }

  clear(): void {
    if (!this.#shown) return
    this.#shown = false
    this.port.clear()
  }
}
