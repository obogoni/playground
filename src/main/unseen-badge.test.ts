import { describe, expect, it } from 'vitest'
import { UnseenBadge } from './unseen-badge'

function harness(): { badge: UnseenBadge; calls: string[] } {
  const calls: string[] = []
  const badge = new UnseenBadge({
    show: () => calls.push('show'),
    clear: () => calls.push('clear')
  })
  return { badge, calls }
}

describe('UnseenBadge', () => {
  it('shows the dot when flagged (TBDT-01)', () => {
    const { badge, calls } = harness()
    badge.flag()
    expect(calls).toEqual(['show'])
  })

  it('keeps a single dot while it is shown (TBDT-04)', () => {
    const { badge, calls } = harness()
    badge.flag()
    badge.flag()
    badge.flag()
    expect(calls).toEqual(['show'])
  })

  it('clears the dot when the window is focused (TBDT-03)', () => {
    const { badge, calls } = harness()
    badge.flag()
    badge.clear()
    expect(calls).toEqual(['show', 'clear'])
  })

  it('does nothing on focus when no dot is shown (TBDT-03)', () => {
    const { badge, calls } = harness()
    badge.clear()
    badge.flag()
    badge.clear()
    badge.clear()
    expect(calls).toEqual(['show', 'clear'])
  })

  it('shows the dot again for a notification after it was cleared (TBDT-01, TBDT-03)', () => {
    const { badge, calls } = harness()
    badge.flag()
    badge.clear()
    badge.flag()
    expect(calls).toEqual(['show', 'clear', 'show'])
  })
})
