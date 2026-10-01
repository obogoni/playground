import { useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'
import type { AgentDef } from '../../../shared/agents'
import { undoByteFor } from '../lib/terminal-keys'
import type { SessionView } from '../../../shared/config'
import type { PinnedTaskView, SessionTask } from '../../../shared/tasks'
import type { PeriodTaskChoice, TimeSnapshot } from '../../../shared/time'
import type { WorkspaceNode } from '../../../shared/tree'
import { agentTileStyle } from '../lib/agent-color'
import { openWorktreeTarget } from '../lib/isolation-level'
import { deriveAttribution, linkedPinFor } from '../lib/session-attribution'
import { detailPillClass, detailPillText, detailPillTitle } from '../lib/session-activity'
import { badgeTypeOf, stateClass, typeClass } from '../lib/task-pills'
import { Icon } from './Icon'
import { PerfProfiler } from './PerfProfiler'
import { SessionRail } from './SessionRail'
import { TaskPicker } from './TaskPicker'
import { SessionClock } from './TimeCounter'
import { TerminalPane } from './TerminalPane'
import './AgentsView.css'

interface AgentsViewProps {
  sessions: SessionView[]
  tree: WorkspaceNode[]
  agents: AgentDef[]
  tasks: PinnedTaskView[]
  time: TimeSnapshot
  selectedId: string | null
  onSelect: (id: string) => void
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
  onDuplicate: (id: string) => void
  onOpenWorktree: (worktreeId: string) => void
  onNew: () => void
  onPauseTime: (id: string) => void
  onResumeTime: (id: string) => void
  onToast: (message: string) => void
  /** Links a session to a task, or back to its branch with null (HTSK-12, HTSK-13). */
  onSetTask: (id: string, task: SessionTask | null) => void
}

/**
 * Agents direction (handoff §Screen Direction C): the 344px session rail on the
 * left and the terminal detail panel on the right. The active session is the
 * selected one, falling back to the first; only it streams (TerminalPane
 * attaches on mount).
 */
export function AgentsView({
  sessions,
  tree,
  agents,
  tasks,
  time,
  selectedId,
  onSelect,
  onStop,
  onRespawn,
  onRemove,
  onRename,
  onDuplicate,
  onOpenWorktree,
  onNew,
  onPauseTime,
  onResumeTime,
  onToast,
  onSetTask
}: AgentsViewProps): JSX.Element {
  const active = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null

  return (
    <div className="agents-view">
      <SessionRail
        sessions={sessions}
        tree={tree}
        agents={agents}
        tasks={tasks}
        time={time}
        selectedId={active?.id ?? null}
        onSelect={onSelect}
        onStop={onStop}
        onRespawn={onRespawn}
        onRemove={onRemove}
        onNew={onNew}
        onSetTask={onSetTask}
      />
      {active ? (
        <PerfProfiler name="SessionDetail" id={active.id}>
          <SessionDetail
            session={active}
            tree={tree}
            agents={agents}
            tasks={tasks}
            time={time}
            onStop={onStop}
            onRespawn={onRespawn}
            onRemove={onRemove}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onOpenWorktree={onOpenWorktree}
            onPauseTime={onPauseTime}
            onResumeTime={onResumeTime}
            onToast={onToast}
            onSetTask={onSetTask}
          />
        </PerfProfiler>
      ) : (
        <div className="agents-detail-empty">
          <Icon name="terminal" size={26} />
          <p>No agent sessions yet.</p>
          <button type="button" className="agents-empty-new" onClick={onNew}>
            <Icon name="plus" size={14} strokeWidth={2.2} /> New session
          </button>
        </div>
      )}
    </div>
  )
}

interface SessionDetailProps {
  session: SessionView
  tree: WorkspaceNode[]
  agents: AgentDef[]
  tasks: PinnedTaskView[]
  time: TimeSnapshot
  onStop: (id: string) => void
  onRespawn: (id: string) => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
  onDuplicate: (id: string) => void
  onOpenWorktree: (worktreeId: string) => void
  onPauseTime: (id: string) => void
  onResumeTime: (id: string) => void
  onToast: (message: string) => void
  onSetTask: (id: string, task: SessionTask | null) => void
}

function SessionDetail({
  session,
  tree,
  agents,
  tasks,
  time,
  onStop,
  onRespawn,
  onRemove,
  onRename,
  onDuplicate,
  onOpenWorktree,
  onPauseTime,
  onResumeTime,
  onToast,
  onSetTask
}: SessionDetailProps): JSX.Element {
  const { branch, taskId, detached, linked, linkTitle } = deriveAttribution(
    tree,
    session.cwd,
    session.task
  )
  const pin = linkedPinFor(tasks, taskId)
  // The tree node the cwd opens: the worktree, or a repo session's primary
  // checkout; a workspace or detached session has none (ACTX-04, ISO-10).
  const worktreeTarget = openWorktreeTarget(tree, session)
  const running = session.status === 'running'
  // Pausing stops only the count; the PTY keeps running and taking input (TIME-20).
  const timePaused = time.paused.includes(session.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.title)
  const [pickerOpen, setPickerOpen] = useState(false)
  const taskTitle = pin?.details?.title ?? linkTitle

  // From branch removes the link (HTSK-13); a session picker has no No task.
  const chooseTask = (choice: PeriodTaskChoice): void => {
    setPickerOpen(false)
    onSetTask(session.id, choice.kind === 'task' ? { id: choice.id, title: choice.title } : null)
  }

  const startRename = (): void => {
    setDraft(session.title)
    setEditing(true)
  }
  const commitRename = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== '' && trimmed !== session.title) onRename(session.id, trimmed)
  }
  const onTitleKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commitRename()
    else if (event.key === 'Escape') setEditing(false)
  }

  return (
    <div className="agents-detail">
      <header className="agents-detail-bar">
        <div className="agents-detail-tile" style={agentTileStyle(agents, session.agent)}>
          {session.agent.charAt(0)}
        </div>
        <div className="agents-detail-titles">
          {editing ? (
            <input
              className="agents-detail-rename"
              value={draft}
              autoFocus
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={onTitleKey}
            />
          ) : (
            <span className="agents-detail-title-row">
              <span className="agents-detail-title">{session.title}</span>
              <button
                type="button"
                className="agents-detail-rename-btn"
                title="Rename session"
                onClick={startRename}
              >
                <Icon name="pencil" size={13} />
              </button>
            </span>
          )}
          <span className="agents-detail-cwd">{session.cwd}</span>
        </div>
        {/* The pill stays on one line and truncates, so its title carries the
            full text (PERF-10).
            SPEC_DEVIATION: design.md puts the full text in the title in every case;
            while the activity names a tool, the title stays the raw tool name.
            Reason: STRP-05 requires the raw tool name as the pill's title, and the
            design does not amend it. */}
        <span
          className={`agents-detail-pill ${detailPillClass(session)}`}
          title={detailPillTitle(session) || detailPillText(session)}
        >
          {detailPillText(session)}
        </span>
        {/* The clock pauses and resumes itself only while the session runs; a
            stopped session has no open period to close (STRP-07, STRP-13). */}
        <SessionClock
          className={`agents-detail-time${timePaused ? ' paused' : ''}`}
          snapshot={time}
          sessionId={session.id}
          withRunTooltip
          toggle={
            running
              ? {
                  paused: timePaused,
                  onToggle: () => (timePaused ? onResumeTime(session.id) : onPauseTime(session.id))
                }
              : undefined
          }
        />
        <div className="agents-detail-actions">
          {worktreeTarget !== null && (
            <button
              type="button"
              className="agents-detail-btn"
              title="Open this session's worktree in the Tree view (launch Explorer / Terminal / VS / VS Code)"
              onClick={() => onOpenWorktree(worktreeTarget)}
            >
              <Icon name="external-link" size={13} /> Open worktree
            </button>
          )}
          <button
            type="button"
            className="agents-detail-btn"
            title="Duplicate session"
            onClick={() => onDuplicate(session.id)}
          >
            <Icon name="copy" size={13} /> Duplicate
          </button>
          {running ? (
            <button type="button" className="agents-detail-btn" onClick={() => onStop(session.id)}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="agents-detail-btn"
              disabled={session.pathMissing}
              onClick={() => onRespawn(session.id)}
            >
              <Icon name="refresh" size={13} /> Respawn
            </button>
          )}
          {!running && (
            <button
              type="button"
              className="agents-detail-btn red"
              onClick={() => onRemove(session.id)}
            >
              <Icon name="trash" size={13} /> Remove
            </button>
          )}
        </div>
      </header>

      <div className="agents-detail-strip">
        {detached ? (
          <span className="agents-strip-tag">detached</span>
        ) : (
          branch && <span className="agents-strip-branch">{branch}</span>
        )}
        {/* The effective task, also for a detached session, opens the picker (HTSK-18). */}
        <span className="agents-strip-task-host">
          <button
            type="button"
            className="agents-strip-task-btn"
            title={
              linked
                ? 'Task set by hand · click to change'
                : 'Task from the branch · click to change'
            }
            onClick={() => setPickerOpen(true)}
          >
            {taskId === null ? (
              <span className="agents-strip-no-task">No task</span>
            ) : (
              <>
                <span className="agents-strip-task">#{taskId}</span>
                {pin?.details && (
                  <>
                    <span className={`task-pill ${typeClass(badgeTypeOf(pin.details))}`}>
                      <span className="task-pill-dot" />
                      {badgeTypeOf(pin.details)}
                    </span>
                    <span className={`task-pill ${stateClass(pin.details.state)}`}>
                      {pin.details.state}
                    </span>
                  </>
                )}
                {taskTitle && <span className="agents-strip-task-title">{taskTitle}</span>}
              </>
            )}
          </button>
          {pickerOpen && (
            <TaskPicker tasks={tasks} onChoose={chooseTask} onClose={() => setPickerOpen(false)} />
          )}
        </span>
        {session.pathMissing && <span className="agents-strip-tag red">path missing</span>}
      </div>

      {running ? (
        <TerminalPane
          key={session.id}
          sessionId={session.id}
          undoByte={undoByteFor(agents, session.agent)}
          cwd={session.cwd}
          onToast={onToast}
        />
      ) : (
        <div className="agents-detail-stopped">
          <p>This session is stopped.</p>
          {!session.pathMissing && (
            <button
              type="button"
              className="agents-empty-new"
              onClick={() => onRespawn(session.id)}
            >
              <Icon name="refresh" size={14} /> Respawn in {session.cwd}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
