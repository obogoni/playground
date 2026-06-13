import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppConfig } from '../../../shared/config'
import { DEFAULT_BRANCH_TEMPLATE } from '../../../shared/tasks'
import { api } from '../lib/api'
import './NewWorktreeDialog.css'

interface SettingsDialogProps {
  onClose: () => void
  onSaved: (config: AppConfig) => void
}

/**
 * Global settings dialog (PWCF-01/02): default org/project for bare-ID pins
 * and the global branch template. Edits global config only — the per-workspace
 * `.app/config.json` override stays hand-authored. No handoff section exists
 * for this surface; it reuses the dialog chassis (spec §Decisions, approved).
 */
export function SettingsDialog({ onClose, onSaved }: SettingsDialogProps): JSX.Element {
  const [org, setOrg] = useState<string | null>(null)
  const [project, setProject] = useState('')
  const [template, setTemplate] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .invoke('config:get')
      .then((config) => {
        setOrg(config.ado.defaultOrg ?? '')
        setProject(config.ado.defaultProject ?? '')
        setTemplate(config.ado.branchTemplate)
      })
      .catch(console.error)
  }, [])

  const save = (): void => {
    setBusy(true)
    api
      .invoke('config:patch', {
        ado: {
          defaultOrg: org?.trim() || null,
          defaultProject: project.trim() || null,
          branchTemplate: template.trim()
        }
      })
      .then(onSaved)
      .catch((err) => {
        console.error(err)
        setBusy(false)
      })
  }

  // org doubles as the loading flag: fields render once config:get resolves.
  const loaded = org !== null

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <header className="dialog-header">
          <div className="dialog-kicker">Settings</div>
          <div className="dialog-title-row">
            <span className="dialog-task-title">Azure DevOps &amp; branch template</span>
          </div>
        </header>
        {loaded && (
          <div className="dialog-body">
            <div className="dialog-branch-row">
              <div>
                <div className="dialog-field-label">
                  Default organization <span className="dialog-label-note">· for bare-ID pins</span>
                </div>
                <input
                  className="dialog-input"
                  value={org}
                  autoFocus
                  spellCheck={false}
                  onChange={(event) => setOrg(event.target.value)}
                />
              </div>
              <div>
                <div className="dialog-field-label">Default project</div>
                <input
                  className="dialog-input"
                  value={project}
                  spellCheck={false}
                  onChange={(event) => setProject(event.target.value)}
                />
              </div>
            </div>
            <div>
              <div className="dialog-field-label">
                Branch template{' '}
                <span className="dialog-label-note">
                  · {'{type}'} {'{id}'} {'{slug}'} · blank uses {DEFAULT_BRANCH_TEMPLATE}
                </span>
              </div>
              <input
                className="dialog-input"
                value={template}
                spellCheck={false}
                placeholder={DEFAULT_BRANCH_TEMPLATE}
                onChange={(event) => setTemplate(event.target.value)}
              />
            </div>
          </div>
        )}
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn-primary"
            disabled={!loaded || busy}
            onClick={save}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
