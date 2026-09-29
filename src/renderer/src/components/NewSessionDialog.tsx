import { useState } from 'react'
import type { JSX } from 'react'
import type { AgentDef } from '../../../shared/agents'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import type { PeriodTaskChoice } from '../../../shared/time'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from '../lib/api'
import type { IsolationLevel } from '../lib/isolation-level'
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
  /** `task` is the chosen link; absent = From branch (HTSK-09, HTSK-10). */
  onSpawn: (agentName: string, cwd: string, adhocCommand?: string, task?: SessionTask) => void
  onClose: () => void
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
    else if (agent) onSpawn(agent.name, cwd, undefined, link)
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-panel" onClick={(event) => event.stopPropagation()}>
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

          {willRun && (
            <div className="dialog-path-preview">
              <div className="dialog-path-label">Will run</div>
              <div className="dialog-path-value">
                {willRun}
                {cwd !== null ? `  ·  ${cwd}` : ''}
              </div>
            </div>
          )}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="dialog-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="dialog-btn-primary" disabled={!canSpawn} onClick={spawn}>
            <Icon name="terminal" size={15} strokeWidth={2.2} />
            Spawn
          </button>
        </footer>
      </div>
    </div>
  )
}
