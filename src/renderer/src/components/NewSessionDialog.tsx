import { useState } from 'react'
import type { JSX } from 'react'
import type { AgentDef } from '../../../shared/agents'
import { taskIdFromBranch } from '../../../shared/tasks'
import type { WorkspaceNode } from '../../../shared/tree'
import { api } from '../lib/api'
import { Icon } from './Icon'
import './NewWorktreeDialog.css'
import './StartWorkDialog.css'
import './NewSessionDialog.css'

/** Sentinel agent name for the ad-hoc command chip (not a registry entry). */
const ADHOC = 'Ad-hoc'

/** Pre-fill carried in from whichever entry point opened the dialog. */
export interface NewSessionSource {
  /** Worktree (or browsed) cwd to pre-select. */
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
  onSpawn: (agentName: string, cwd: string, adhocCommand?: string) => void
  onClose: () => void
}

interface CwdOption {
  path: string
  branch: string
  repoName: string
  workspaceName: string
  taskId: number | null
}

function worktreeOptions(tree: WorkspaceNode[]): CwdOption[] {
  return tree.flatMap((ws) =>
    ws.repos.flatMap((repo) =>
      repo.worktrees.map((wt) => ({
        path: wt.path,
        branch: wt.branch,
        repoName: repo.name,
        workspaceName: ws.displayName,
        taskId: taskIdFromBranch(wt.branch)
      }))
    )
  )
}

/**
 * New Session modal (handoff §New Session dialog): pick a registry agent (or the
 * Ad-hoc command escape hatch) + a cwd, then spawn. Same chassis as
 * StartWorkDialog. cwd comes from the worktree grid (optionally task-highlighted)
 * or a browsed folder (AGSN-09). Agents come from config, not a constant (AGCF-01);
 * Ad-hoc runs a one-shot raw command, never saved to the registry (AGCF-03).
 */
export function NewSessionDialog({
  tree,
  agents,
  source,
  onSpawn,
  onClose
}: NewSessionDialogProps): JSX.Element {
  const options = worktreeOptions(tree)
  const [agentName, setAgentName] = useState(agents[0]?.name ?? ADHOC)
  const [cwd, setCwd] = useState<string | null>(source.cwd ?? null)
  const [adhocCommand, setAdhocCommand] = useState('')

  const isAdhoc = agentName === ADHOC
  const agent = agents.find((a) => a.name === agentName)
  const highlight = new Set(source.highlightWorktrees ?? [])
  // A browsed (detached) cwd isn't in the worktree grid; surface it separately.
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
        if (path) setCwd(path)
      })
      .catch(console.error)
  }

  const spawn = (): void => {
    if (cwd === null || !commandReady) return
    if (isAdhoc) onSpawn(ADHOC, cwd, adhocCommand.trim())
    else if (agent) onSpawn(agent.name, cwd)
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
            {options.length === 0 ? (
              <div className="dialog-no-repos">
                No worktrees — register a workspace, or browse for a folder below.
              </div>
            ) : (
              <div className="ns-cwd-grid">
                {options.map((o) => {
                  const tagged = source.taskId !== undefined && o.taskId === source.taskId
                  return (
                    <button
                      key={o.path}
                      type="button"
                      className={`ns-cwd-chip${o.path === cwd ? ' selected' : ''}${
                        highlight.has(o.path) || tagged ? ' highlight' : ''
                      }`}
                      onClick={() => setCwd(o.path)}
                    >
                      <span className="ns-cwd-branch">{o.branch}</span>
                      <span className="ns-cwd-sub">
                        {o.repoName} · {o.workspaceName}
                        {o.taskId !== null ? ` · #${o.taskId}` : ''}
                      </span>
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
