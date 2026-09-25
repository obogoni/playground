import { describe, expect, it } from 'vitest'
import type { SessionView } from '../../../shared/config'
import { applyActivity, detailPillClass, detailPillText } from './session-activity'

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

describe('applyActivity', () => {
  it('patches the named session and leaves every other one untouched (ACTV-07)', () => {
    const a = session({ id: 'a' })
    const b = session({ id: 'b' })

    const next = applyActivity([a, b], 'a', { state: 'working', subagents: 0 })

    expect(next[0].activity).toEqual({ state: 'working', subagents: 0 })
    expect(next[1]).toBe(b)
  })

  it('keeps every other field of the patched session', () => {
    const a = session({ id: 'a', title: 'renamed', lastOutput: 'tail' })

    const [patched] = applyActivity([a], 'a', { state: 'waiting', subagents: 0 })

    expect(patched).toMatchObject({
      id: 'a',
      title: 'renamed',
      lastOutput: 'tail',
      status: 'running'
    })
  })

  it('clears the activity when the push carries none', () => {
    const a = session({ id: 'a', activity: { state: 'working', subagents: 0 } })

    const [patched] = applyActivity([a], 'a', null)

    expect(patched.activity).toBeUndefined()
  })

  it('drops a push for a session the list does not hold', () => {
    const a = session({ id: 'a' })

    const next = applyActivity([a], 'ghost', { state: 'working', subagents: 0 })

    expect(next[0]).toBe(a)
  })

  it('replaces the activity a session already held', () => {
    const a = session({ id: 'a', activity: { state: 'working', tool: 'Bash', subagents: 1 } })

    const [patched] = applyActivity([a], 'a', { state: 'waiting', subagents: 0 })

    expect(patched.activity).toEqual({ state: 'waiting', subagents: 0 })
  })
})

describe('detailPillText', () => {
  it('reads stopped for a session with no PTY', () => {
    expect(detailPillText(session({ id: 'a', status: 'stopped' }))).toBe('stopped')
  })

  it('reads running when the agent reports nothing (ACTV-19)', () => {
    expect(detailPillText(session({ id: 'a' }))).toBe('running')
  })

  it.each([
    ['working', 'working'],
    ['compacting', 'compacting'],
    ['waiting', 'waiting for you'],
    ['needs-approval', 'needs approval'],
    ['needs-input', 'needs input'],
    ['error', 'turn failed'],
    ['exited', 'agent exited · shell']
  ])('words %s as "%s" (ACTV-27)', (state, text) => {
    expect(
      detailPillText(session({ id: 'a', activity: { state: state as never, subagents: 0 } }))
    ).toBe(text)
  })

  it('names the running tool (ACTV-24)', () => {
    expect(
      detailPillText(
        session({ id: 'a', activity: { state: 'working', tool: 'Bash', subagents: 0 } })
      )
    ).toBe('working · Bash')
  })

  it.each([
    [1, 'working · 1 subagent'],
    [2, 'working · 2 subagents']
  ])('counts %i subagents (ACTV-25)', (subagents, text) => {
    expect(detailPillText(session({ id: 'a', activity: { state: 'working', subagents } }))).toBe(
      text
    )
  })

  it('names the API error type (ACTV-26)', () => {
    expect(
      detailPillText(
        session({ id: 'a', activity: { state: 'error', subagents: 0, error: 'rate_limit' } })
      )
    ).toBe('turn failed · rate_limit')
  })

  it('reads the tool, the subagents and the error in that order', () => {
    expect(
      detailPillText(
        session({
          id: 'a',
          activity: { state: 'working', tool: 'Bash', subagents: 2, error: 'overloaded' }
        })
      )
    ).toBe('working · Bash · 2 subagents · overloaded')
  })
})

describe('detailPillClass', () => {
  it.each([
    ['working', 'green'],
    ['compacting', 'green'],
    ['waiting', 'blue'],
    ['needs-approval', 'pink'],
    ['needs-input', 'pink'],
    ['error', 'red'],
    ['exited', 'amber']
  ])('tints %s as %s (ACTV-27)', (state, tint) => {
    expect(
      detailPillClass(session({ id: 'a', activity: { state: state as never, subagents: 0 } }))
    ).toBe(tint)
  })

  it('keeps today’s tints for a session with no activity', () => {
    expect(detailPillClass(session({ id: 'a' }))).toBe('green')
    expect(detailPillClass(session({ id: 'a', status: 'stopped' }))).toBe('faint')
  })
})
