import { useEffect, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import type { AgentDef, Shell } from '../../../shared/agents'
import type { AppConfig } from '../../../shared/config'
import {
  NOTIFIABLE_STATES,
  NOTIFY_STATE_KEYS,
  readNotificationPrefs,
  type NotifiableState,
  type NotificationPrefs
} from '../../../shared/notifications'
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

type SettingsTab = 'general' | 'notifications'

/** One switch per notifiable state, worded like the notifications they gate (NOTF-18). */
const STATE_SWITCHES: Record<NotifiableState, { label: string; note: string }> = {
  'needs-approval': {
    label: 'Needs approval',
    note: 'the agent is waiting on a permission prompt'
  },
  'needs-input': { label: 'Needs input', note: 'the agent asked you a question' },
  waiting: { label: 'Finished its turn', note: 'the agent is done and waiting for you' },
  error: { label: 'Turn failed', note: 'the turn ended on an API error' }
}

const TABS: { id: SettingsTab; label: string; title: string }[] = [
  { id: 'general', label: 'General', title: 'Azure DevOps, agents & shell' },
  { id: 'notifications', label: 'Notifications', title: 'Agent notifications' }
]

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
  const [devAlias, setDevAlias] = useState('')
  const [agents, setAgents] = useState<AgentDef[]>([])
  const [defaultShell, setDefaultShell] = useState<Shell>('pwsh')
  const [form, setForm] = useState<AgentForm | null>(null)
  const [busy, setBusy] = useState(false)
  // Not persisted: the dialog always opens on General (NOTF-28). Every field's
  // state lives here, above the tabs, so switching tabs loses no edit (NOTF-29).
  const [tab, setTab] = useState<SettingsTab>('general')
  const [notify, setNotify] = useState<NotificationPrefs | null>(null)

  useEffect(() => {
    api
      .invoke('config:get')
      .then((config) => {
        setOrg(config.ado.defaultOrg ?? '')
        setProject(config.ado.defaultProject ?? '')
        setTemplate(config.ado.branchTemplate)
        setWorktreeTemplate(config.ado.worktreeTemplate)
        setDevAlias(config.ado.devAlias ?? '')
        setAgents(config.agents)
        setDefaultShell(config.ui.defaultShell)
        setNotify(readNotificationPrefs(config.ui))
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

  // Each switch persists on its own key, so the master never rewrites a state
  // choice (NOTF-16, NOTF-19).
  const persistNotify = (enabled: boolean): void => {
    setNotify((prev) => (prev ? { ...prev, enabled } : prev))
    api.invoke('config:patch', { ui: { notify: enabled } }).catch(console.error)
  }

  const persistNotifyState = (state: NotifiableState, on: boolean): void => {
    setNotify((prev) => (prev ? { ...prev, states: { ...prev.states, [state]: on } } : prev))
    api.invoke('config:patch', { ui: { [NOTIFY_STATE_KEYS[state]]: on } }).catch(console.error)
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
          worktreeTemplate: worktreeTemplate.trim(),
          devAlias: devAlias.trim()
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
  // The alias only matters when an effective template uses {dev}; a blank
  // template falls back to a default that does not (DEVA-09/10).
  const devAliasRelevant =
    (template.trim() || DEFAULT_BRANCH_TEMPLATE).includes('{dev}') ||
    (worktreeTemplate.trim() || DEFAULT_WORKTREE_TEMPLATE).includes('{dev}')

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
            <span className="dialog-task-title">{TABS.find((t) => t.id === tab)?.title}</span>
          </div>
          <div className="set-tabs" role="tablist" aria-label="Settings sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`set-tab${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>
        {loaded && tab === 'notifications' && notify && (
          <div className="dialog-body" role="tabpanel" aria-label="Notifications">
            <label className="dialog-check">
              <input
                type="checkbox"
                checked={notify.enabled}
                onChange={(event) => persistNotify(event.target.checked)}
              />
              <span className="dialog-check-text">
                Notify me about agent sessions
                <span className="dialog-check-note">
                  an OS notification when the app is in the background, an in-app notice when
                  another session is on screen
                </span>
              </span>
            </label>
            <div className="set-notify-states">
              <div className="dialog-field-label">Notify when an agent…</div>
              {NOTIFIABLE_STATES.map((state) => (
                <label key={state} className={`dialog-check${notify.enabled ? '' : ' disabled'}`}>
                  <input
                    type="checkbox"
                    checked={notify.states[state]}
                    disabled={!notify.enabled}
                    onChange={(event) => persistNotifyState(state, event.target.checked)}
                  />
                  <span className="dialog-check-text">
                    {STATE_SWITCHES[state].label}
                    <span className="dialog-check-note">{STATE_SWITCHES[state].note}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        {loaded && tab === 'general' && (
          <div className="dialog-body" role="tabpanel" aria-label="General">
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
            {devAliasRelevant && (
              <div>
                <div className="dialog-field-label">
                  Dev alias{' '}
                  <span className="dialog-label-note">
                    · fills the {'{dev}'} placeholder of the branch template
                  </span>
                </div>
                <input
                  className="dialog-input"
                  value={devAlias}
                  spellCheck={false}
                  onChange={(event) => setDevAlias(event.target.value)}
                />
              </div>
            )}

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
