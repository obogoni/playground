import { describe, expect, it } from 'vitest'
import { acceptsStep, BUSY_CANCEL_TITLE, progressLabel } from './create-progress'

describe('progressLabel (CRTO-16)', () => {
  it('reads Preparing… before the first step arrives', () => {
    expect(progressLabel(null)).toBe('Preparing…')
  })

  it('names the base refresh', () => {
    expect(progressLabel('refreshing-base')).toBe('Updating base branch from remote…')
  })

  it('names the checkout', () => {
    expect(progressLabel('creating-worktree')).toBe('Creating worktree…')
  })

  it('names the post-create command', () => {
    expect(progressLabel('running-hook')).toBe('Running post-create command…')
  })
})

describe('BUSY_CANCEL_TITLE (CRTO-20)', () => {
  it('tells the user to wait for the create', () => {
    expect(BUSY_CANCEL_TITLE).toBe('Wait for the create to finish')
  })
})

describe('acceptsStep (CRTO-16, CRTO-17)', () => {
  it('accepts a step for the request in flight', () => {
    expect(acceptsStep('a', { requestId: 'a' })).toBe(true)
  })

  it('ignores a step for another request', () => {
    expect(acceptsStep('a', { requestId: 'b' })).toBe(false)
  })

  it('ignores every step when no request is in flight', () => {
    expect(acceptsStep(null, { requestId: 'a' })).toBe(false)
  })
})
