import { describe, expect, it } from 'vitest'
import {
  DRAG_THRESHOLD_PX,
  linkGestureOnMouseDown,
  linkGestureOnMouseUp,
  type LinkMouseEvent
} from './terminal-link-gesture'

const ctrlClick: LinkMouseEvent = {
  button: 0,
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false
}
const hit = { kind: 'url', url: 'https://example.com/' }

describe('linkGestureOnMouseDown (LINK-14, LINK-15, LINK-16)', () => {
  it('intercepts a bare Ctrl + primary press over a link', () => {
    expect(linkGestureOnMouseDown(ctrlClick, hit)).toBe('intercept')
  })

  it('passes a Ctrl press over nothing to the agent (LINK-15)', () => {
    expect(linkGestureOnMouseDown(ctrlClick, null)).toBe('pass')
  })

  it('passes a plain click on a link (LINK-16)', () => {
    expect(linkGestureOnMouseDown({ ...ctrlClick, ctrlKey: false }, hit)).toBe('pass')
  })

  it.each([
    ['right button', { button: 2 }],
    ['middle button', { button: 1 }],
    ['Alt held', { altKey: true }],
    ['Shift held', { shiftKey: true }],
    ['Meta held', { metaKey: true }]
  ])('passes when %s', (_label, overrides) => {
    expect(linkGestureOnMouseDown({ ...ctrlClick, ...overrides }, hit)).toBe('pass')
  })
})

describe('linkGestureOnMouseUp (LINK-17, LINK-18, LINK-30)', () => {
  const pending = { clientX: 100, clientY: 100 }

  it('exports the drag threshold as 4 px', () => {
    expect(DRAG_THRESHOLD_PX).toBe(4)
  })

  it('opens when the pointer moved less than 4 px', () => {
    expect(linkGestureOnMouseUp(pending, { clientX: 100, clientY: 100 })).toBe('open')
    expect(linkGestureOnMouseUp(pending, { clientX: 103.9, clientY: 100 })).toBe('open')
  })

  it('ignores a release 4 px or further away (a drag)', () => {
    expect(linkGestureOnMouseUp(pending, { clientX: 104, clientY: 100 })).toBe('ignore')
    expect(linkGestureOnMouseUp(pending, { clientX: 103, clientY: 103 })).toBe('ignore')
  })

  it('ignores a release with no pending press (blur cleared it, or nothing was intercepted)', () => {
    expect(linkGestureOnMouseUp(null, { clientX: 100, clientY: 100 })).toBe('ignore')
  })
})
