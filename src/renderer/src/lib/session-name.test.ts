import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import { applyName, rowLabel } from './session-name'

function session(overrides: Partial<SessionView> & { id: string }): SessionView {
  return {
    agent: 'Claude',
    cwd: 'C:/code/Code-24173',
    title: 'Claude · 24173-fix-login',
    status: 'running',
    pathMissing: false,
    ...overrides
  }
}

describe('applyName', () => {
  it('names the pushed session in place and leaves every other one untouched (SNAME-02)', () => {
    const a = session({ id: 'a', activity: { state: 'working', subagents: 0 } })
    const b = session({ id: 'b' })

    const next = applyName([a, b], 'a', 'alpha')

    expect(next[0]).toEqual({ ...a, name: 'alpha' })
    expect(next[1]).toBe(b)
  })

  it('clears the name when the push carries null (SNAME-04)', () => {
    const a = session({ id: 'a', name: 'alpha' })

    const [cleared] = applyName([a], 'a', null)

    expect(cleared.name).toBeUndefined()
    expect(cleared).toMatchObject({ id: 'a', title: a.title, status: 'running' })
  })

  it('drops a push for a session the list does not hold', () => {
    const a = session({ id: 'a' })

    expect(applyName([a], 'ghost', 'alpha')).toEqual([a])
  })
})

describe('rowLabel', () => {
  it('is the name Claude gives the session when there is one (SNAME-01)', () => {
    expect(rowLabel(session({ id: 'a', name: 'alpha' }))).toBe('alpha')
  })

  it('falls back to the agent display name when there is none (SNAME-03)', () => {
    expect(rowLabel(session({ id: 'a' }))).toBe('Claude')
    expect(rowLabel(session({ id: 'b', status: 'stopped' }))).toBe('Claude')
  })
})
