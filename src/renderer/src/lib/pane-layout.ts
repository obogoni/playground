/** Width bounds and defaults for the resizable Tree-direction panes (PANE-01..13). */

export interface PaneBounds {
  min: number
  max: number
}

/** Collapsed rail width shared by both panes (PANE-03). */
export const RAIL_WIDTH = 36

export const SIDEBAR_BOUNDS: PaneBounds = { min: 170, max: 420 }
export const SIDEBAR_DEFAULT_WIDTH = 230
export const TASKS_BOUNDS: PaneBounds = { min: 260, max: 460 }
export const TASKS_DEFAULT_WIDTH = 322

/** Clamps a drag position to the pane's bounds (PANE-02, PANE-08). */
export function clampPaneWidth(value: number, bounds: PaneBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, value))
}

/** Persisted width with default fallback and out-of-bounds clamp (PANE-01, PANE-11, PANE-13). */
export function resolvePaneWidth(
  saved: number | undefined,
  bounds: PaneBounds,
  fallback: number
): number {
  return saved === undefined ? fallback : clampPaneWidth(saved, bounds)
}
