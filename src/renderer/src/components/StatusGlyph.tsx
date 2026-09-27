import type { JSX } from 'react'
import type { ChangeStatus } from '../../../shared/worktrees'
import { changeStatusView } from '../lib/change-status'
import './StatusGlyph.css'

/** A change status's glyph, toned by the status and titled with its name (FSTS-11/12). */
export function StatusGlyph({ status }: { status: ChangeStatus }): JSX.Element {
  const { glyph, label } = changeStatusView(status)
  return (
    <span className={`status-glyph ${status}`} title={label}>
      {glyph}
    </span>
  )
}
