import { describe, expect, it } from 'vitest'
import type { AdoThreadStatus, PrThreadPlace, PrThreadView } from '../../../shared/files'
import {
  newIterationBanner,
  OFFERED_STATUSES,
  overviewGroups,
  statusLabel,
  zonesForFile
} from './pr-view'

// Every name here is fictitious: this repository is public.

function thread(
  id: number,
  place: PrThreadPlace,
  resolution: PrThreadView['resolution'] = 'active'
): PrThreadView {
  return {
    id,
    rootCommentId: 1,
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
    // [owner 2026-10-10] `fixed` reads "Resolved", as Azure DevOps' web view names it.
    expect(ALL.map(statusLabel)).toEqual([
      'Active',
      'Resolved',
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

describe('zonesForFile (FPRA-18)', () => {
  const place = (
    path: string,
    side: 'left' | 'right',
    startLine: number,
    endLine: number
  ): PrThreadPlace => ({ kind: 'placed', path, side, startLine, endLine })

  it('takes only the threads drawn in this file', () => {
    const mine = thread(1, place('src/app.ts', 'right', 3, 3))
    const zones = zonesForFile(
      [
        mine,
        thread(2, place('src/other.ts', 'right', 3, 3)),
        thread(3, { kind: 'outdated', path: 'src/app.ts', line: 3 }),
        thread(4, { kind: 'general' }),
        thread(5, { kind: 'system' }),
        thread(6, { kind: 'deleted' })
      ],
      'src/app.ts'
    )

    expect(zones).toEqual({ left: [], right: [{ afterLine: 3, thread: mine }] })
  })

  it("puts each thread on its own side, after the thread's end line, resolved ones included", () => {
    const original = thread(1, place('src/app.ts', 'left', 2, 2))
    const modified = thread(2, place('src/app.ts', 'right', 4, 6), 'resolved')

    expect(zonesForFile([original, modified], 'src/app.ts')).toEqual({
      left: [{ afterLine: 2, thread: original }],
      right: [{ afterLine: 6, thread: modified }]
    })
  })

  it('gives two threads on the same line a zone each, in publication order', () => {
    const first = thread(7, place('src/app.ts', 'right', 9, 9))
    const second = thread(8, place('src/app.ts', 'right', 9, 9))

    expect(zonesForFile([first, second], 'src/app.ts').right).toEqual([
      { afterLine: 9, thread: first },
      { afterLine: 9, thread: second }
    ])
  })
})

describe('newIterationBanner (FPRA-34)', () => {
  it('shows when the latest iteration is newer than the one on screen', () => {
    expect(newIterationBanner(3, 4)).toBe(true)
  })

  it('does not show for the same iteration, an older one, or before anything is on screen', () => {
    expect(newIterationBanner(4, 4)).toBe(false)
    expect(newIterationBanner(4, 3)).toBe(false)
    expect(newIterationBanner(null, 4)).toBe(false)
  })
})
