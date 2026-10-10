import { describe, expect, it } from 'vitest'
import type { AdoThreadStatus, PrThreadPlace, PrThreadView } from '../../../shared/files'
import { OFFERED_STATUSES, overviewGroups, statusLabel } from './pr-view'

// Every name here is fictitious: this repository is public.

function thread(
  id: number,
  place: PrThreadPlace,
  resolution: PrThreadView['resolution'] = 'active'
): PrThreadView {
  return {
    id,
    resolution,
    providerStatus: resolution === 'active' ? 'active' : 'fixed',
    comments: [{ id: 1, author: 'Robin Widget', content: `Thread ${id}`, at: 0 }],
    place
  }
}

const onLine = (line: number): PrThreadPlace => ({
  kind: 'placed',
  path: 'src/app.ts',
  side: 'right',
  startLine: line,
  endLine: line
})

describe('overviewGroups (FPRA-11, 13, 19, 20)', () => {
  it('splits threads placed in the diff into active and resolved, in publication order', () => {
    const groups = overviewGroups([
      thread(1, onLine(3)),
      thread(2, onLine(9), 'resolved'),
      thread(3, { kind: 'placed', path: 'src/old.ts', side: 'left', startLine: 2, endLine: 2 }),
      thread(4, onLine(1), 'resolved')
    ])

    expect(groups.active.map((t) => t.id)).toEqual([1, 3])
    expect(groups.resolved.map((t) => t.id)).toEqual([2, 4])
    expect(groups.outdated).toEqual([])
    expect(groups.general).toEqual([])
    expect(groups.activity).toEqual([])
  })

  it('lists outdated, general and system threads each in their own group only', () => {
    const outdated = thread(5, { kind: 'outdated', path: 'src/app.ts', line: 2 })
    const general = thread(6, { kind: 'general' })
    const system = thread(7, { kind: 'system' })

    expect(overviewGroups([outdated, general, system])).toEqual({
      active: [],
      resolved: [],
      outdated: [outdated],
      general: [general],
      activity: [system]
    })
  })

  it('shows deleted threads in no group', () => {
    const groups = overviewGroups([thread(8, { kind: 'deleted' }), thread(9, onLine(4))])

    expect(
      Object.values(groups)
        .flat()
        .map((t) => t.id)
    ).toEqual([9])
  })
})

describe('statusLabel and OFFERED_STATUSES (FPRA-26)', () => {
  const ALL: AdoThreadStatus[] = [
    'active',
    'fixed',
    'wontFix',
    'closed',
    'byDesign',
    'pending',
    'unknown'
  ]

  it('labels every Azure DevOps thread status', () => {
    expect(ALL.map(statusLabel)).toEqual([
      'Active',
      'Fixed',
      "Won't fix",
      'Closed',
      'By design',
      'Pending',
      'Unknown'
    ])
  })

  it('offers every status a thread can be set to, and never unknown', () => {
    expect([...OFFERED_STATUSES].sort()).toEqual(ALL.filter((s) => s !== 'unknown').sort())
  })
})
