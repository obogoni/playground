import type { JSX } from 'react'
import { Icon } from './Icon'
import './BranchExistsChoice.css'

interface BranchExistsChoiceProps {
  branch: string
  busy: boolean
  onReuse: () => void
  onRecreate: () => void
  onCancel: () => void
}

/**
 * Inline resolver for a create-time branch-name collision (EXB-06), shown in the
 * dialog's footer region when `worktrees:create` returns
 * `conflict: 'branch-exists'`. Reuse is the primary, focused action so Enter
 * never destroys; Delete & recreate is the dangerous path, carrying a generic
 * destructive warning (no commit-count computation — EXB-D7).
 */
export function BranchExistsChoice({
  branch,
  busy,
  onReuse,
  onRecreate,
  onCancel
}: BranchExistsChoiceProps): JSX.Element {
  return (
    <div className="branch-exists">
      <div className="branch-exists-msg">
        <Icon name="alert" size={14} />
        <span>
          Branch <code>{branch}</code> already exists. Reuse it, or delete and recreate it from the
          base branch?
        </span>
      </div>
      <div className="branch-exists-note">
        Delete &amp; recreate discards this branch&rsquo;s local history.
      </div>
      <div className="branch-exists-actions">
        <button type="button" className="dialog-btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="dialog-btn-danger" onClick={onRecreate} disabled={busy}>
          Delete &amp; recreate
        </button>
        <button
          type="button"
          className="dialog-btn-primary"
          onClick={onReuse}
          disabled={busy}
          autoFocus
        >
          Reuse existing branch
        </button>
      </div>
    </div>
  )
}
