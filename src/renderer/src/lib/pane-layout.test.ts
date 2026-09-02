import { describe, expect, it } from 'vitest'
import {
  RAIL_WIDTH,
  SIDEBAR_BOUNDS,
  SIDEBAR_DEFAULT_WIDTH,
  TASKS_BOUNDS,
  TASKS_DEFAULT_WIDTH,
  clampPaneWidth,
  resolvePaneWidth
} from './pane-layout'

describe('clampPaneWidth', () => {
  it('clamps a value below the minimum to the minimum (PANE-11)', () => {
    expect(clampPaneWidth(100, SIDEBAR_BOUNDS)).toBe(SIDEBAR_BOUNDS.min)
    expect(clampPaneWidth(200, TASKS_BOUNDS)).toBe(TASKS_BOUNDS.min)
  })

  it('clamps a value above the maximum to the maximum (PANE-11)', () => {
    expect(clampPaneWidth(900, SIDEBAR_BOUNDS)).toBe(SIDEBAR_BOUNDS.max)
    expect(clampPaneWidth(900, TASKS_BOUNDS)).toBe(TASKS_BOUNDS.max)
  })

  it('passes exact bound values through (PANE-02)', () => {
    expect(clampPaneWidth(SIDEBAR_BOUNDS.min, SIDEBAR_BOUNDS)).toBe(SIDEBAR_BOUNDS.min)
    expect(clampPaneWidth(SIDEBAR_BOUNDS.max, SIDEBAR_BOUNDS)).toBe(SIDEBAR_BOUNDS.max)
    expect(clampPaneWidth(TASKS_BOUNDS.min, TASKS_BOUNDS)).toBe(TASKS_BOUNDS.min)
    expect(clampPaneWidth(TASKS_BOUNDS.max, TASKS_BOUNDS)).toBe(TASKS_BOUNDS.max)
  })

  it('passes mid-range values through (PANE-02)', () => {
    expect(clampPaneWidth(230, SIDEBAR_BOUNDS)).toBe(230)
    expect(clampPaneWidth(322, TASKS_BOUNDS)).toBe(322)
  })
})

describe('resolvePaneWidth', () => {
  it('returns the pane default when nothing is persisted (PANE-01, PANE-13)', () => {
    expect(resolvePaneWidth(undefined, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(
      SIDEBAR_DEFAULT_WIDTH
    )
    expect(resolvePaneWidth(undefined, TASKS_BOUNDS, TASKS_DEFAULT_WIDTH)).toBe(TASKS_DEFAULT_WIDTH)
  })

  it('returns the persisted width when it is inside the bounds', () => {
    expect(resolvePaneWidth(200, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(200)
    expect(resolvePaneWidth(400, TASKS_BOUNDS, TASKS_DEFAULT_WIDTH)).toBe(400)
  })

  it('clamps a persisted width below the minimum on load (PANE-11)', () => {
    expect(resolvePaneWidth(50, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_BOUNDS.min)
  })

  it('clamps a persisted width above the maximum on load (PANE-11)', () => {
    expect(resolvePaneWidth(800, SIDEBAR_BOUNDS, SIDEBAR_DEFAULT_WIDTH)).toBe(SIDEBAR_BOUNDS.max)
    expect(resolvePaneWidth(800, TASKS_BOUNDS, TASKS_DEFAULT_WIDTH)).toBe(TASKS_BOUNDS.max)
  })
})

describe('pane layout constants', () => {
  it('exposes the collapsed rail width (PANE-03)', () => {
    expect(RAIL_WIDTH).toBe(36)
  })

  it('exposes the sidebar default width (PANE-01)', () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBe(230)
  })

  it('exposes the tasks pane default width (PANE-08)', () => {
    expect(TASKS_DEFAULT_WIDTH).toBe(322)
  })

  it('exposes the sidebar drag bounds (PANE-02)', () => {
    expect(SIDEBAR_BOUNDS).toEqual({ min: 170, max: 420 })
  })

  it('exposes the tasks pane drag bounds (PANE-08)', () => {
    expect(TASKS_BOUNDS).toEqual({ min: 260, max: 460 })
  })
})
