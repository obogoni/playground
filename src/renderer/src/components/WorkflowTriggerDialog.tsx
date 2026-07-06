import { useState } from 'react'
import type { JSX } from 'react'
import type { WorkflowMeta } from '../../../shared/workflows'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './WorkflowTriggerDialog.css'

interface WorkflowTriggerDialogProps {
  meta: WorkflowMeta
  onClose: () => void
  onSubmit: (input: Record<string, string>) => void
}

/**
 * WHF — the hifi run-trigger dialog (handoff §Dialog): the "RUN WORKFLOW" kicker
 * + workflow tile + name + description; one mono field per `meta.inputs` (red
 * `*` on required, placeholder = the input key); a play-triangle "Run workflow"
 * disabled until every required input is non-empty (WF5-06); a no-input workflow
 * shows the italic "just run it" note and submits `{}` directly (WF5-08). Reuses
 * the shared dialog chassis (`NewWorktreeDialog.css`).
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
      <div className="dialog-panel wf-dialog-panel" onClick={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div className="dialog-kicker">Run workflow</div>
          <div className="wf-dialog-title">
            <span className="wf-dialog-tile">
              <Icon name="workflow-nodes" size={18} strokeWidth={1.9} />
            </span>
            <span className="wf-dialog-name">{meta.name}</span>
          </div>
          {meta.description && <p className="dialog-desc wf-dialog-desc">{meta.description}</p>}
        </header>
        <div className="dialog-body">
          {meta.inputs.length === 0 && (
            <p className="dialog-desc wf-no-inputs">This workflow takes no inputs — just run it.</p>
          )}
          {meta.inputs.map((input, index) => (
            <div key={input.key}>
              <div className="dialog-field-label">
                {input.label}
                {input.required && <span className="wf-req"> *</span>}
              </div>
              <input
                className="dialog-input"
                value={values[input.key] ?? ''}
                placeholder={input.key}
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
            <Icon name="play" size={13} /> Run workflow
          </button>
        </footer>
      </div>
    </div>
  )
}
