import { describe, expect, it } from 'vitest'
import type { ChangeStatus } from '../../../shared/worktrees'
import { changeStatusView } from './change-status'

describe('changeStatusView', () => {
  // FSTS-06..11: one row per status, so each status alone decides its glyph and tooltip.
  it.each([
    { status: 'added', glyph: '+', label: 'Added', struck: false },
    { status: 'modified', glyph: 'M', label: 'Modified', struck: false },
    { status: 'deleted', glyph: 'D', label: 'Deleted', struck: true },
    { status: 'renamed', glyph: 'R', label: 'Renamed', struck: false },
    { status: 'untracked', glyph: 'U', label: 'Untracked', struck: false }
  ] as const)('shows $status as $glyph, titled $label', ({ status, glyph, label, struck }) => {
    expect(changeStatusView(status)).toEqual({ glyph, label, struck })
  })

  // FSTS-13/15: a deleted name is struck, and no other status's is.
  it('strikes the deleted status and none of the other four', () => {
    const statuses: ChangeStatus[] = ['added', 'modified', 'deleted', 'renamed', 'untracked']
    expect(statuses.filter((status) => changeStatusView(status).struck)).toEqual(['deleted'])
  })
})
