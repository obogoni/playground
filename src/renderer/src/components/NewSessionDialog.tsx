import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AgentDef } from '../../../shared/agents'
import {
  PROMPT_MAX_CHARS,
  parsePlaceholders,
  type PromptEntry
} from '../../../shared/prompt-template'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import type { PeriodTaskChoice } from '../../../shared/time'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from '../lib/api'
import type { IsolationLevel } from '../lib/isolation-level'
import { carryValues, formBlockers, promptContext, resolveForm } from '../lib/prompt-form'
import {
  adoptBrowsed,
  cwdAfterLevelChange,
  initialLevel,
  levelOptions,
  type LevelOption
} from '../lib/session-levels'
import { Icon } from './Icon'
import { TaskPicker } from './TaskPicker'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'
import './NewSessionDialog.css'

/** Sentinel agent name for the ad-hoc command chip (not a registry entry). */
const ADHOC = 'Ad-hoc'

/** Pre-fill carried in from whichever entry point opened the dialog. */
export interface NewSessionSource {
  /** Workspace, repo, worktree (or browsed) cwd to pre-select; its level opens the selector. */
  cwd?: string
  /** Task the spawn is for — drives the header line + highlight. */
  taskId?: number
  /** Worktree paths to highlight (a task's worktrees, many-resolution). */
  highlightWorktrees?: string[]
}

interface NewSessionDialogProps {
  tree: WorkspaceNode[]
  /** Registry agents from config (AGCF-01); no longer the hard-coded constant. */
  agents: AgentDef[]
  source: NewSessionSource
  /** The pinned tasks, for the Task field's picker. */
  tasks: PinnedTaskView[]
  /**
   * `task` is the chosen link; absent = From branch (HTSK-09, HTSK-10).
   * `prompt` is the resolved prompt shown in Will run (APR-35).
   */
  onSpawn: (
    agentName: string,
    cwd: string,
    adhocCommand?: string,
    task?: SessionTask,
    prompt?: string
  ) => void
  onClose: () => void
}

/** The prompt files; a failed listing reads as an empty folder. */
function loadPrompts(): Promise<PromptEntry[]> {
  return api.invoke('prompts:list').catch((err) => {
    console.error(err)
    return []
  })
}

/** The level selector, in handoff order (ISO-05). */
const LEVELS: { level: IsolationLevel; label: string; empty: string }[] = [
  { level: 'workspace', label: 'Workspace', empty: 'No workspaces yet.' },
  { level: 'repo', label: 'Repo', empty: 'No repos yet.' },
  { level: 'worktree', label: 'Worktree', empty: 'No worktrees yet.' }
]

/** A chip's two lines: workspace = name + path; repo = name + branch · ws;
 *  worktree = branch + repo · ws (· #task), as before. */
function chipLines(o: LevelOption): [string, string] {
  if (o.level === 'workspace') return [o.workspaceName, o.path]
  if (o.level === 'repo') return [o.repoName, `${o.branch} · ${o.workspaceName}`]
  return [
    o.branch,
    `${o.repoName} · ${o.workspaceName}${o.taskId !== null ? ` · #${o.taskId}` : ''}`
  ]
}

/**
 * New Session modal (handoff §New Session dialog): pick a registry agent (or the
 * Ad-hoc command escape hatch) + a cwd, then spawn. Same chassis as
 * StartWorkDialog. cwd comes from the worktree grid (optionally task-highlighted)
 * or a browsed folder (AGSN-09). Agents come from config, not a constant (AGCF-01);
 * Ad-hoc runs a one-shot raw command, never saved to the registry (AGCF-03).
 * The Task field starts on `From branch`, or on the task card that opened the
 * dialog (HTSK-07, HTSK-08), and the spawn carries the chosen link (HTSK-09).
 * A registry agent can start on a prompt file; one with placeholders adds a
 * second step that fills them, and the spawn sends the text Will run shows
 * (APR-09, APR-17, APR-35). With None picked the dialog is unchanged (APR-11).
 */
export function NewSessionDialog({
  tree,
  agents,
  source,
  tasks,
  onSpawn,
  onClose
}: NewSessionDialogProps): JSX.Element {
  const [agentName, setAgentName] = useState(agents[0]?.name ?? ADHOC)
  const [level, setLevel] = useState<IsolationLevel>(() => initialLevel(tree, source.cwd))
  const [cwd, setCwd] = useState<string | null>(source.cwd ?? null)
  const options = levelOptions(tree, level)
  const emptyText = LEVELS.find((l) => l.level === level)?.empty
  const [adhocCommand, setAdhocCommand] = useState('')
  // A task card opens the dialog on its task, with the pin's title when cached.
  const [task, setTask] = useState<SessionTask | null>(() =>
    source.taskId === undefined
      ? null
      : {
          id: source.taskId,
          title: tasks.find((t) => t.id === source.taskId)?.details?.title ?? null
        }
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [prompts, setPrompts] = useState<PromptEntry[]>([])
  const [promptName, setPromptName] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  // Only what the developer typed; untouched context fields follow the current
  // selection (APR-19..22), typed ones survive Back (APR-27).
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [reloadOnFocus, setReloadOnFocus] = useState(false)

  // Read the folder each time the dialog opens, like workflows (APR-01).
  useEffect(() => {
    loadPrompts().then(setPrompts)
  }, [])

  // After Open prompts folder, pick up the developer's edits on return.
  useEffect(() => {
    if (!reloadOnFocus) return
    const onFocus = (): void => {
      setReloadOnFocus(false)
      loadPrompts().then(setPrompts)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reloadOnFocus])

  const isAdhoc = agentName === ADHOC
  const agent = agents.find((a) => a.name === agentName)
  const highlight = new Set(source.highlightWorktrees ?? [])
  // A browsed (detached) cwd isn't in the level's grid; surface it separately.
  const detachedCwd = cwd !== null && !options.some((o) => o.path === cwd) ? cwd : null
  const willRun = isAdhoc
    ? adhocCommand.trim()
    : agent
      ? [agent.command, ...agent.args].join(' ').trim()
      : ''
  const commandReady = isAdhoc ? adhocCommand.trim() !== '' : agent !== undefined
  const canSpawn = cwd !== null && commandReady

  // Ad-hoc never carries a prompt (APR-10); one that vanished or broke on a
  // reload reads as None.
  const chosen = isAdhoc
    ? undefined
    : prompts.find(
        (p): p is { name: string; template: string } => p.name === promptName && 'template' in p
      )
  const names = chosen ? parsePlaceholders(chosen.template) : []
  const needsStep2 = names.length > 0
  const ctx = promptContext(task, options.find((o) => o.path === cwd) ?? null, cwd ?? '', tasks)
  const values = carryValues(typed, names, ctx)
  const resolved = chosen ? resolveForm(chosen.template, values) : ''
  const blockers = formBlockers(values, names, resolved)
  const promptReady = blockers.emptyFields.length === 0 && blockers.tooLong === null
  const showStep2 = step === 2 && needsStep2

  // A new prompt keeps the typed values of the names it shares (APR-28).
  const choosePrompt = (name: string | null): void => {
    setPromptName(name)
    const next = prompts.find((p) => p.name === name)
    const kept = next && 'template' in next ? parsePlaceholders(next.template) : []
    setTyped((prev) =>
      Object.fromEntries(kept.filter((n) => Object.hasOwn(prev, n)).map((n) => [n, prev[n]]))
    )
  }

  const openPromptsFolder = (): void => {
    api
      .invoke('prompts:openFolder')
      .then(() => setReloadOnFocus(true))
      .catch(console.error)
  }

  const browse = (): void => {
    api
      .invoke('dialog:pickFolder')
      .then(({ path }) => {
        if (!path) return
        // A folder the tree knows selects its level and chip (ISO-06).
        const adopted = adoptBrowsed(tree, path)
        if (adopted.level !== null) setLevel(adopted.level)
        setCwd(adopted.cwd)
      })
      .catch(console.error)
  }

  // A cwd the new level doesn't list is cleared, so Spawn waits for a pick (ISO-06).
  const switchLevel = (next: IsolationLevel): void => {
    setLevel(next)
    setCwd((current) => cwdAfterLevelChange(tree, next, current))
  }

  // A session picker never offers No task; From branch means no link.
  const chooseTask = (choice: PeriodTaskChoice): void => {
    setPickerOpen(false)
    if (choice.kind === 'task') setTask({ id: choice.id, title: choice.title })
    else setTask(null)
  }

  const spawn = (): void => {
    if (cwd === null || !commandReady) return
    const link = task ?? undefined
    if (isAdhoc) onSpawn(ADHOC, cwd, adhocCommand.trim(), link)
    // The previewed text itself, so a file edited meanwhile changes nothing (APR-35).
    else if (agent && chosen) {
      if (promptReady) onSpawn(agent.name, cwd, undefined, link, resolved)
    } else if (agent) onSpawn(agent.name, cwd, undefined, link)
  }

  const header = (
    <header className="dialog-header">
      <div className="dialog-kicker">New session</div>
      {source.taskId !== undefined ? (
        <div className="dialog-title-row">
          <span className="dialog-task-id">#{source.taskId}</span>
          <span className="dialog-task-title">Start an agent</span>
        </div>
      ) : (
        <div className="dialog-title-row">
          <span className="dialog-repo-title">Start an agent</span>
        </div>
      )}
    </header>
  )

  // `command args --`, then the prompt the agent gets, live (APR-25, APR-29).
  const willRunCard = willRun && (
    <div className="dialog-path-preview">
      <div className="dialog-path-label">Will run</div>
      <div className="dialog-path-value">
        {willRun}
        {chosen ? ' --' : ''}
        {cwd !== null ? `  ·  ${cwd}` : ''}
      </div>
      {chosen && (showStep2 || !needsStep2) && <pre className="ns-prompt-preview">{resolved}</pre>}
    </div>
  )

  const tooLongNotice = blockers.tooLong !== null && (
    <div className="dialog-error">
      Prompt too long ({blockers.tooLong} / {PROMPT_MAX_CHARS} characters)
    </div>
  )

  if (showStep2 && chosen) {
    const firstEmpty = blockers.emptyFields[0]
    return (
      <div className="dialog-backdrop" onClick={onClose}>
        <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
          {header}
          <div className="dialog-body">
            <div className="ns-prompt-step">Prompt · {chosen.name}</div>
            {names.map((name) => (
              <div key={name}>
                <div className="dialog-field-label ns-var-label">{`{{${name}}}`}</div>
                <input
                  className="dialog-input"
                  value={values[name]}
                  autoFocus={name === firstEmpty}
                  spellCheck={false}
                  onChange={(event) => {
                    const value = event.target.value
                    setTyped((prev) => ({ ...prev, [name]: value }))
                  }}
                />
              </div>
            ))}
            {willRunCard}
            {tooLongNotice}
          </div>
          <footer className="dialog-footer">
            <button type="button" className="dialog-btn-ghost ns-back" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="dialog-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="dialog-btn-primary"
              disabled={!canSpawn || !promptReady}
              onClick={spawn}
            >
              <Icon name="terminal" size={15} strokeWidth={2.2} />
              Spawn
            </button>
          </footer>
        </div>
      </div>
    )
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
        {header}
        <div className="dialog-body">
          <div>
            <div className="dialog-field-label">Agent</div>
            <div className="ns-agent-grid">
              {agents.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  className={`ns-agent-chip${a.name === agentName ? ' selected' : ''}`}
                  onClick={() => setAgentName(a.name)}
                >
                  <span className="ns-agent-name">{a.name}</span>
                  <span className="ns-agent-cmd">{[a.command, ...a.args].join(' ')}</span>
                </button>
              ))}
              <button
                type="button"
                className={`ns-agent-chip adhoc${isAdhoc ? ' selected' : ''}`}
                onClick={() => setAgentName(ADHOC)}
              >
                <span className="ns-agent-name">Ad-hoc command</span>
                <span className="ns-agent-cmd">{'>_ run any shell line'}</span>
              </button>
            </div>
            {isAdhoc && (
              <input
                className="dialog-input ns-adhoc-input"
                placeholder="Command to run, e.g. npm run dev"
                value={adhocCommand}
                autoFocus
                spellCheck={false}
                onChange={(event) => setAdhocCommand(event.target.value)}
              />
            )}
          </div>

          <div>
            <div className="dialog-field-label">Working directory</div>
            <div className="ns-level-segmented" role="group" aria-label="Isolation level">
              {LEVELS.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  className={`ns-level-segment${l.level === level ? ' selected' : ''}`}
                  aria-pressed={l.level === level}
                  onClick={() => switchLevel(l.level)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {options.length === 0 ? (
              <div className="dialog-no-repos">{emptyText}</div>
            ) : (
              <div className="ns-cwd-grid">
                {options.map((o) => {
                  // A primary checkout on the task's branch is tagged too, so a task
                  // card that points at it still highlights its Repo chip.
                  const tagged =
                    o.level !== 'workspace' &&
                    source.taskId !== undefined &&
                    o.taskId === source.taskId
                  const [line1, line2] = chipLines(o)
                  return (
                    <button
                      key={o.path}
                      type="button"
                      className={`ns-cwd-chip${o.path === cwd ? ' selected' : ''}${
                        highlight.has(o.path) || tagged ? ' highlight' : ''
                      }`}
                      onClick={() => setCwd(o.path)}
                    >
                      <span className="ns-cwd-branch">{line1}</span>
                      <span className="ns-cwd-sub">{line2}</span>
                    </button>
                  )
                })}
              </div>
            )}
            <button type="button" className="ns-browse" onClick={browse}>
              <Icon name="folder" size={14} /> Browse for a folder…
            </button>
            {detachedCwd && (
              <div className="ns-detached">
                <span className="ns-detached-label">detached</span>
                <span className="ns-detached-path">{detachedCwd}</span>
              </div>
            )}
          </div>

          <div>
            <div className="dialog-field-label">Task</div>
            <div className="ns-task">
              <span className="ns-task-value">
                {task === null
                  ? 'From branch'
                  : task.title
                    ? `#${task.id} ${task.title}`
                    : `#${task.id}`}
              </span>
              <button type="button" className="ns-task-change" onClick={() => setPickerOpen(true)}>
                Change
              </button>
              {pickerOpen && (
                <TaskPicker
                  tasks={tasks}
                  onChoose={chooseTask}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          </div>

          {!isAdhoc && (
            <div>
              <div className="ns-label-row">
                <div className="dialog-field-label">Prompt</div>
                <button type="button" className="ns-open-folder" onClick={openPromptsFolder}>
                  Open prompts folder
                </button>
              </div>
              <div className="ns-prompt-grid">
                <button
                  type="button"
                  className={`ns-prompt-chip${chosen === undefined ? ' selected' : ''}`}
                  onClick={() => choosePrompt(null)}
                >
                  None
                </button>
                {prompts.map((p) =>
                  'error' in p ? (
                    <button key={p.name} type="button" className="ns-prompt-chip" disabled>
                      {p.name} <span className="ns-prompt-error">({p.error})</span>
                    </button>
                  ) : (
                    <button
                      key={p.name}
                      type="button"
                      className={`ns-prompt-chip${p.name === chosen?.name ? ' selected' : ''}`}
                      onClick={() => choosePrompt(p.name)}
                    >
                      {p.name}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {willRunCard}
          {!needsStep2 && tooLongNotice}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {needsStep2 ? (
            <button
              type="button"
              className="dialog-btn-primary"
              disabled={!canSpawn}
              onClick={() => setStep(2)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="dialog-btn-primary"
              disabled={!canSpawn || (chosen !== undefined && !promptReady)}
              onClick={spawn}
            >
              <Icon name="terminal" size={15} strokeWidth={2.2} />
              Spawn
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
