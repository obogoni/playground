/**
 * The Ctrl+click link gesture, decided without the DOM (spec LINK-14..18,
 * LINK-30). `mousedown` says whether the pane intercepts the press; `mouseup`
 * says whether the release opens what was pressed. Time and pointer positions
 * come in as arguments, so the pane stays a thin adapter (TCU precedent).
 */

/** A press that travels this far or further before release is a drag, never a click (LINK-17). */
export const DRAG_THRESHOLD_PX = 4

export interface LinkMouseEvent {
  button: number
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export interface PendingLinkGesture {
  clientX: number
  clientY: number
}

/**
 * Intercept only a bare Ctrl + primary press over a link: a plain click, any
 * other chord, or a press over nothing stays the agent's (LINK-14/15/16).
 */
export function linkGestureOnMouseDown(
  event: LinkMouseEvent,
  hit: unknown | null
): 'intercept' | 'pass' {
  const bareCtrl =
    event.button === 0 && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
  return bareCtrl && hit !== null ? 'intercept' : 'pass'
}

/** Open only if the press is still pending and the pointer stayed under the drag threshold. */
export function linkGestureOnMouseUp(
  pending: PendingLinkGesture | null,
  event: { clientX: number; clientY: number }
): 'open' | 'ignore' {
  if (!pending) return 'ignore'
  const moved = Math.hypot(event.clientX - pending.clientX, event.clientY - pending.clientY)
  return moved < DRAG_THRESHOLD_PX ? 'open' : 'ignore'
}
