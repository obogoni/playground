import { useState } from 'react'
import type { JSX } from 'react'
import type { ScaffoldResult } from '../../../shared/workflows'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'

interface NewWorkflowDialogProps {
  onClose: () => void
  onCreate: (name: string) => Promise<ScaffoldResult>
}

/**
 * WF5 — the "New workflow" dialog: one name field that scaffolds a template
 * folder (WF5-22). A rejection (invalid name, or an id that already exists,
 * WF5-24) renders inline and keeps the dialog open; a success closes it (the
 * folder is revealed by the main handler). Reuses the shared dialog chassis.
 */
export function NewWorkflowDialog({ onClose, onCreate }: NewWorkflowDialogProps): JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = (): void => {
    setError(null)
    setBusy(true)
    onCreate(name)
      .then((result) => {
        if (result.ok) {
          onClose()
          return
        }
        setError(result.error)
        setBusy(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
      })
  }

  const canCreate = name.trim() !== '' && !busy

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div className="dialog-kicker">New workflow</div>
          <div className="dialog-title-row">
            <span className="dialog-repo-title">{name.trim() || 'untitled'}</span>
          </div>
        </header>
        <div className="dialog-body">
          <p className="dialog-desc">
            Scaffolds <code>~/.playground/workflows/&lt;name&gt;/workflow.ts</code> from a template
            and opens the folder.
          </p>
          <div>
            <div className="dialog-field-label">Workflow name</div>
            <input
              className="dialog-input"
              value={name}
              autoFocus
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canCreate) create()
              }}
            />
          </div>
          {error && (
            <div className="dialog-error">
              <Icon name="alert" size={13} /> {error}
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-primary"
            disabled={!canCreate}
            onClick={create}
          >
            <Icon name="plus" size={15} strokeWidth={2.2} />
            Create
          </button>
        </footer>
      </div>
    </div>
  )
}
