import type { ChangeStatus } from '../../../shared/worktrees'

/** How a change status reads in the tree rows and the section headers (FSTS-06..15). */
export interface ChangeStatusView {
  /** `+`, `M`, `D`, `R` or `U`. */
  glyph: string
  /** The tooltip naming the status. */
  label: string
  /** True when the file's name is drawn struck through: deleted only. */
  struck: boolean
}

// One record, so a new status fails the typecheck until it has a glyph (FSTS-12).
const VIEWS: Record<ChangeStatus, ChangeStatusView> = {
  added: { glyph: '+', label: 'Added', struck: false },
  modified: { glyph: 'M', label: 'Modified', struck: false },
  deleted: { glyph: 'D', label: 'Deleted', struck: true },
  renamed: { glyph: 'R', label: 'Renamed', struck: false },
  untracked: { glyph: 'U', label: 'Untracked', struck: false }
}

export function changeStatusView(status: ChangeStatus): ChangeStatusView {
  return VIEWS[status]
}
