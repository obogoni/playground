import { useState } from 'react'
import type { FormEvent, JSX } from 'react'
import type { AgentDef } from '../../../shared/agents'
import { PROMPT_MAX_CHARS } from '../../../shared/prompt-template'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import { presetTaskLink, type PresetLaunchPlan } from '../lib/preset-launch'
import { formBlockers, resolveForm } from '../lib/prompt-form'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './NewSessionDialog.css'

/** The plan a pick yields when the preset still has values to ask (PRST-22). */
export type PresetFormPlan = Extract<PresetLaunchPlan, { kind: 'form' }>

interface RunPresetDialogProps {
  /** The preset's name, the dialog's title. */
  name: string
  plan: PresetFormPlan
  /** Registry agents, for the Will run line's command. */
  agents: AgentDef[]
  /** The pinned tasks, for a `{{taskId}}` link's title (PRST-29). */
  tasks: PinnedTaskView[]
  /** `prompt` is the text Will run shows; `task` the `{{taskId}}` link, if any. */
  onSpawn: (prompt: string, task?: SessionTask) => void
  onMoreOptions: () => void
  onClose: () => void
}

/**
 * Run preset dialog (PRST-22, PRST-24..26): the New Session variables step for
 * a preset. One field per placeholder in parse order, pre-filled as New
 * Session would, the first empty one focused; a live Will run card, the
 * 8000-character limit and trimmed values (APR-23, APR-25, APR-26, APR-37).
 * The fields sit in a form, so Enter spawns, and only while Spawn is enabled.
 */
export function RunPresetDialog({
  name,
  plan,
  agents,
  tasks,
  onSpawn,
  onMoreOptions,
  onClose
}: RunPresetDialogProps): JSX.Element {
  const [values, setValues] = useState(plan.values)
  // Focus is decided once, on the starting values; typing never moves it.
  const [focusName] = useState(
    () => plan.names.find((n) => (plan.values[n] ?? '').trim() === '') ?? plan.names[0]
  )
  const resolved = resolveForm(plan.template, values)
  const blockers = formBlockers(values, plan.names, resolved)
  const ready = blockers.emptyFields.length === 0 && blockers.tooLong === null
  const agent = agents.find((a) => a.name === plan.agentName)
  const willRun = agent ? [agent.command, ...agent.args].join(' ').trim() : plan.agentName

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (!ready) return
    // The previewed text itself, so a file edited meanwhile changes nothing (APR-35).
    onSpawn(resolved, presetTaskLink(plan.names, values, tasks))
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
        <form onSubmit={submit}>
          <header className="dialog-header">
            <div className="dialog-kicker">Preset</div>
            <div className="dialog-title-row">
              <span className="dialog-repo-title">{name}</span>
            </div>
          </header>
          <div className="dialog-body">
            <div className="ns-prompt-step">Prompt · {plan.promptName}</div>
            {plan.names.map((n) => (
              <div key={n}>
                <div className="dialog-field-label ns-var-label">{`{{${n}}}`}</div>
                <input
                  className="dialog-input"
                  value={values[n]}
                  autoFocus={n === focusName}
                  spellCheck={false}
                  onChange={(event) => {
                    const value = event.target.value
                    setValues((prev) => ({ ...prev, [n]: value }))
                  }}
                />
              </div>
            ))}
            <div className="dialog-path-preview">
              <div className="dialog-path-label">Will run</div>
              <div className="dialog-path-value">
                {willRun} --{`  ·  ${plan.cwd}`}
              </div>
              <pre className="ns-prompt-preview">{resolved}</pre>
            </div>
            {blockers.tooLong !== null && (
              <div className="dialog-error">
                Prompt too long ({blockers.tooLong} / {PROMPT_MAX_CHARS} characters)
              </div>
            )}
          </div>
          <footer className="dialog-footer">
            <button type="button" className="dialog-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="dialog-btn-ghost" onClick={onMoreOptions}>
              More options
            </button>
            <button type="submit" className="dialog-btn-primary" disabled={!ready}>
              <Icon name="terminal" size={15} strokeWidth={2.2} />
              Spawn
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
