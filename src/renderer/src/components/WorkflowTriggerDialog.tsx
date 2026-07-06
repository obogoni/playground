import { useState } from 'react'
import type { JSX } from 'react'
import type { WorkflowMeta } from '../../../shared/workflows'
import './NewWorktreeDialog.css'

interface WorkflowTriggerDialogProps {
  meta: WorkflowMeta
  onClose: () => void
  onSubmit: (input: Record<string, string>) => void
}

/**
 * WF5 — the run-trigger dialog. Renders one field per `meta.inputs` entry
 * (WF5-05); a required-but-empty field disables the primary button (WF5-06); a
 * workflow with no inputs submits `{}` directly (WF5-08). Reuses the shared
 * dialog chassis (backdrop / panel / header / body / footer).
 */
export function WorkflowTriggerDialog({
  meta,
  onClose,
  onSubmit
}: WorkflowTriggerDialogProps): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(meta.inputs.map((i) => [i.key, '']))
  )

  const missingRequired = meta.inputs.some((i) => i.required && (values[i.key] ?? '').trim() === '')

  const setField = (key: string, value: string): void =>
    setValues((prev) => ({ ...prev, [key]: value }))

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div className="dialog-kicker">Run workflow</div>
          <div className="dialog-title-row">
            <span className="dialog-repo-title">{meta.name}</span>
          </div>
        </header>
        <div className="dialog-body">
          {meta.description && <p className="dialog-desc">{meta.description}</p>}
          {meta.inputs.length === 0 && (
            <p className="dialog-desc">This workflow takes no inputs.</p>
          )}
          {meta.inputs.map((input, index) => (
            <div key={input.key}>
              <div className="dialog-field-label">
                {input.label}
                {input.required ? ' *' : ''}
              </div>
              <input
                className="dialog-input"
                value={values[input.key] ?? ''}
                autoFocus={index === 0}
                onChange={(event) => setField(input.key, event.target.value)}
              />
            </div>
          ))}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-primary"
            disabled={missingRequired}
            onClick={() => onSubmit(values)}
          >
            Run
          </button>
        </footer>
      </div>
    </div>
  )
}
