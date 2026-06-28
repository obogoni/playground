import { useEffect, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import type { AgentDef, Shell } from '../../../shared/agents'
import type { AppConfig } from '../../../shared/config'
import { DEFAULT_BRANCH_TEMPLATE } from '../../../shared/tasks'
import { DEFAULT_WORKTREE_TEMPLATE } from '../../../shared/worktrees'
import { api } from '../lib/api'
import { applyAgentEdit } from '../lib/agent-registry'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './SettingsDialog.css'

interface SettingsDialogProps {
  onClose: () => void
  onSaved: (config: AppConfig) => void
  /** Fired whenever the agent registry is mutated, so App can re-thread it live. */
  onAgentsChanged: (config: AppConfig) => void
}

/** Tile-colour tokens an agent can be tinted with (handoff agent→colour set). */
const COLOR_OPTIONS = ['--accent', '--blue', '--green', '--amber', '--red']

interface AgentForm {
  /**
   * Stable key (the agent's original name) being edited, or null when adding a
   * new agent. Keyed by name — not array index — so an edit survives concurrent
   * list mutations (e.g. deleting another agent) without retargeting.
   */
  editKey: string | null
  name: string
  command: string
  args: string
  color: string
}

const EMPTY_FORM: Omit<AgentForm, 'editKey'> = {
  name: '',
  command: '',
  args: '',
  color: '--accent'
}

/**
 * Global settings dialog: Azure DevOps defaults + branch/worktree templates
 * (PWCF-01/02), the editable coding-agent registry (AGCF-01), and the default
 * hosting shell (AGCF-02). The registry + shell persist immediately via
 * `config:patch`; ADO/template fields keep their explicit Save. Reuses the
 * dialog chassis (spec §Decisions, approved).
 */
export function SettingsDialog({
  onClose,
  onSaved,
  onAgentsChanged
}: SettingsDialogProps): JSX.Element {
  const [org, setOrg] = useState<string | null>(null)
  const [project, setProject] = useState('')
  const [template, setTemplate] = useState('')
  const [worktreeTemplate, setWorktreeTemplate] = useState('')
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [defaultShell, setDefaultShell] = useState<Shell>('pwsh')
  const [form, setForm] = useState<AgentForm | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .invoke('config:get')
      .then((config) => {
        setOrg(config.ado.defaultOrg ?? '')
        setProject(config.ado.defaultProject ?? '')
        setTemplate(config.ado.branchTemplate)
        setWorktreeTemplate(config.ado.worktreeTemplate)
        setAgents(config.agents)
        setDefaultShell(config.ui.defaultShell)
      })
      .catch(console.error)
  }, [])

  // The registry is a live editor: each mutation persists the whole array and
  // bubbles the fresh config up so the New Session dialog / rail re-thread it.
  const persistAgents = (next: AgentDef[]): void => {
    setAgents(next)
    api.invoke('config:patch', { agents: next }).then(onAgentsChanged).catch(console.error)
  }

  const persistShell = (shell: Shell): void => {
    setDefaultShell(shell)
    api.invoke('config:patch', { ui: { defaultShell: shell } }).catch(console.error)
  }

  const commitForm = (): void => {
    if (!form) return
    const def: AgentDef = {
      name: form.name.trim(),
      command: form.command.trim(),
      args: form.args.trim().split(/\s+/).filter(Boolean),
      color: form.color
    }
    persistAgents(applyAgentEdit(agents, form.editKey, def))
    setForm(null)
  }

  const deleteAgent = (index: number): void => {
    const removed = agents[index]
    persistAgents(agents.filter((_, i) => i !== index))
    // Close the form only if the agent being edited is the one removed; deleting
    // a different agent must leave the open edit targeting its original agent.
    if (form && removed && form.editKey === removed.name) setForm(null)
  }

  const save = (): void => {
    setBusy(true)
    api
      .invoke('config:patch', {
        ado: {
          defaultOrg: org?.trim() || null,
          defaultProject: project.trim() || null,
          branchTemplate: template.trim(),
          worktreeTemplate: worktreeTemplate.trim()
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
  const formValid = form !== null && form.name.trim() !== '' && form.command.trim() !== ''

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
            <span className="dialog-task-title">Azure DevOps, agents &amp; shell</span>
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
            <div>
              <div className="dialog-field-label">
                Worktree folder template{' '}
                <span className="dialog-label-note">
                  · {'{repo}'} {'{branch}'} {'{id}'} · blank uses {DEFAULT_WORKTREE_TEMPLATE}
                </span>
              </div>
              <input
                className="dialog-input"
                value={worktreeTemplate}
                spellCheck={false}
                placeholder={DEFAULT_WORKTREE_TEMPLATE}
                onChange={(event) => setWorktreeTemplate(event.target.value)}
              />
            </div>

            <div>
              <div className="dialog-field-label">Coding agents</div>
              <div className="set-agent-list">
                {agents.map((agent, index) => (
                  <div key={agent.name} className="set-agent-row">
                    <span
                      className="set-agent-tile"
                      style={tileStyle(agent.color)}
                      aria-hidden="true"
                    >
                      {agent.name.charAt(0)}
                    </span>
                    <span className="set-agent-name">{agent.name}</span>
                    <span className="set-agent-cmd">
                      {[agent.command, ...agent.args].join(' ')}
                    </span>
                    <button
                      type="button"
                      className="set-agent-icon-btn"
                      title="Edit agent"
                      onClick={() =>
                        setForm({
                          editKey: agent.name,
                          name: agent.name,
                          command: agent.command,
                          args: agent.args.join(' '),
                          color: agent.color ?? '--accent'
                        })
                      }
                    >
                      <Icon name="pencil" size={13} />
                    </button>
                    <button
                      type="button"
                      className="set-agent-icon-btn"
                      title="Delete agent"
                      onClick={() => deleteAgent(index)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
                {agents.length === 0 && (
                  <div className="set-agent-empty">
                    No agents — add one, or spawn an ad-hoc command from the New Session dialog.
                  </div>
                )}
              </div>

              {form ? (
                <div className="set-agent-form">
                  <div className="set-agent-form-grid">
                    <input
                      className="dialog-input"
                      placeholder="Name (e.g. Claude)"
                      value={form.name}
                      autoFocus
                      spellCheck={false}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                    <input
                      className="dialog-input"
                      placeholder="Command (e.g. claude)"
                      value={form.command}
                      spellCheck={false}
                      onChange={(event) => setForm({ ...form, command: event.target.value })}
                    />
                  </div>
                  <input
                    className="dialog-input"
                    placeholder="Args (space-separated, optional)"
                    value={form.args}
                    spellCheck={false}
                    onChange={(event) => setForm({ ...form, args: event.target.value })}
                  />
                  <div className="set-agent-colors">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`set-color-swatch${form.color === c ? ' selected' : ''}`}
                        style={{ background: `var(${c})` }}
                        title={c}
                        aria-label={c}
                        onClick={() => setForm({ ...form, color: c })}
                      />
                    ))}
                  </div>
                  <div className="set-agent-form-actions">
                    <button
                      type="button"
                      className="dialog-btn-ghost"
                      onClick={() => setForm(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="dialog-btn-primary"
                      disabled={!formValid}
                      onClick={commitForm}
                    >
                      {form.editKey === null ? 'Add' : 'Save'} agent
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="set-agent-add"
                  onClick={() => setForm({ editKey: null, ...EMPTY_FORM })}
                >
                  <Icon name="plus" size={14} strokeWidth={2.2} /> Add agent
                </button>
              )}
            </div>

            <div>
              <div className="dialog-field-label">
                Default shell <span className="dialog-label-note">· hosts new agent PTYs</span>
              </div>
              <div className="set-shell-segmented">
                {(['pwsh', 'cmd'] as Shell[]).map((shell) => (
                  <button
                    key={shell}
                    type="button"
                    className={`set-shell-segment${defaultShell === shell ? ' selected' : ''}`}
                    onClick={() => persistShell(shell)}
                  >
                    {shell}
                  </button>
                ))}
              </div>
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

/** Tint an agent tile from its colour token (handoff: 15% mix bg + token text). */
function tileStyle(color: string | undefined): CSSProperties | undefined {
  if (!color) return undefined
  return {
    background: `color-mix(in oklab, var(${color}) 15%, transparent)`,
    color: `var(${color})`
  }
}
