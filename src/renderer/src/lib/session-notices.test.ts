import { describe, expect, it } from 'vitest'
import { dropNotice, upsertNotice, type Notice } from './session-notices'

function notice(id: string, key: number, body = 'Finished its turn'): Notice {
  return { id, title: `Claude · ${id}`, body, key }
}

describe('upsertNotice', () => {
  it('adds the first notice', () => {
    expect(upsertNotice([], notice('a', 1))).toEqual([notice('a', 1)])
  })

  it('stacks notices from different sessions in arrival order (NOTF-22)', () => {
    const list = upsertNotice(upsertNotice([], notice('a', 1)), notice('b', 2))
    expect(list.map((n) => n.id)).toEqual(['a', 'b'])
  })

  it('replaces a session’s older notice in place, keeping one per session (NOTF-22)', () => {
    const list = [notice('a', 1), notice('b', 2)]
    const next = upsertNotice(list, notice('a', 3, 'Needs approval to run Bash'))
    expect(next).toEqual([notice('a', 3, 'Needs approval to run Bash'), notice('b', 2)])
  })

  it('never mutates the list it was given', () => {
    const list = [notice('a', 1)]
    upsertNotice(list, notice('a', 2))
    upsertNotice(list, notice('b', 3))
    expect(list).toEqual([notice('a', 1)])
  })
})

describe('dropNotice', () => {
  it('removes only the named session’s notice (NOTF-05)', () => {
    expect(dropNotice([notice('a', 1), notice('b', 2)], 'a')).toEqual([notice('b', 2)])
  })

  it('leaves the list as it was for a session with no notice', () => {
    const list = [notice('a', 1)]
    expect(dropNotice(list, 'z')).toEqual([notice('a', 1)])
    expect(list).toEqual([notice('a', 1)])
  })
})
