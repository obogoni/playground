import { useState } from 'react'
import type { JSX } from 'react'
import type {
  RespondDecision,
  ScaffoldResult,
  WorkflowDef,
  WorkflowMeta
} from '../../../shared/workflows'
import type { RunView } from '../lib/workflow-run-view'
import { Icon } from './Icon'
import { NewWorkflowDialog } from './NewWorkflowDialog'
import { RunDetail } from './RunDetail'
import { WorkflowTriggerDialog } from './WorkflowTriggerDialog'
import './WorkflowsView.css'

interface WorkflowsViewProps {
  defs: WorkflowDef[]
  runs: RunView[]
  selectedRunId: string | null
  activeRunId: string | null
  error: string | null
  onRun: (id: string, input: Record<string, string>) => void
  onCancel: (runId: string) => void
  onRespond: (runId: string, decision: RespondDecision) => void
  onReload: () => void
  onScaffold: (name: string) => Promise<ScaffoldResult>
  onSelectRun: (runId: string) => void
}

/**
 * WF5 — the Workflows direction (fourth alongside tree/board/agents): a left rail
 * listing definitions (valid + broken, WF5-02/03) and this session's runs, a
 * right detail panel showing the selected run's live timeline. Run is disabled
 * while a run is active (serial, WF5-19); the serial-conflict error is surfaced
 * (WF5-20). Owns the trigger + new-workflow dialogs' open state; Reload re-lists
 * (WF5-21) and New workflow scaffolds (WF5-22).
 */
export function WorkflowsView({
  defs,
  runs,
  selectedRunId,
  activeRunId,
  error,
  onRun,
  onCancel,
  onRespond,
  onReload,
  onScaffold,
  onSelectRun
}: WorkflowsViewProps): JSX.Element {
  const [triggerFor, setTriggerFor] = useState<{ id: string; meta: WorkflowMeta } | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  const selectedRun = runs.find((r) => r.runId === selectedRunId) ?? null
  const runActive = activeRunId !== null

  return (
    <div className="workflows-view">
      <aside className="wf-rail">
        <div className="wf-rail-head">
          <span className="wf-rail-title">Workflows</span>
          <div className="wf-rail-actions">
            <button
              type="button"
              className="wf-rail-btn"
              title="Rescan the workflows folder"
              onClick={onReload}
            >
              <Icon name="refresh" size={13} />
            </button>
            <button
              type="button"
              className="wf-rail-btn"
              title="New workflow"
              onClick={() => setNewOpen(true)}
            >
              <Icon name="plus" size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {error && (
          <div className="wf-error">
            <Icon name="alert" size={13} /> {error}
          </div>
        )}

        <div className="wf-section-label">Definitions</div>
        <div className="wf-defs">
          {defs.length === 0 && (
            <p className="wf-empty">No workflows in ~/.playground/workflows/.</p>
          )}
          {defs.map((def) =>
            'meta' in def ? (
              <div key={def.id} className="wf-def">
                <div className="wf-def-info">
                  <span className="wf-def-name">{def.meta.name}</span>
                  {def.meta.description && (
                    <span className="wf-def-desc">{def.meta.description}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="wf-run-btn"
                  disabled={runActive}
                  title={runActive ? 'A run is already active' : 'Run this workflow'}
                  onClick={() => setTriggerFor(def)}
                >
                  Run
                </button>
              </div>
            ) : (
              <div key={def.id} className="wf-def broken">
                <div className="wf-def-info">
                  <span className="wf-def-name">{def.id}</span>
                  <span className="wf-def-error">
                    <Icon name="alert" size={12} /> {def.error}
                  </span>
                </div>
              </div>
            )
          )}
        </div>

        {runs.length > 0 && (
          <>
            <div className="wf-section-label">Runs</div>
            <div className="wf-runs">
              {runs.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  className={`wf-run-item${run.runId === selectedRunId ? ' selected' : ''}`}
                  onClick={() => onSelectRun(run.runId)}
                >
                  <span className="wf-run-item-name">{run.workflowId ?? 'workflow'}</span>
                  <span className={`wf-run-item-status wf-status-${run.status}`}>{run.status}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {selectedRun ? (
        <RunDetail run={selectedRun} onCancel={onCancel} onRespond={onRespond} />
      ) : (
        <div className="wf-detail-empty">
          <Icon name="git-fork" size={26} />
          <p>Select a workflow and run it to see its timeline.</p>
        </div>
      )}

      {triggerFor && (
        <WorkflowTriggerDialog
          meta={triggerFor.meta}
          onClose={() => setTriggerFor(null)}
          onSubmit={(input) => {
            onRun(triggerFor.id, input)
            setTriggerFor(null)
          }}
        />
      )}
      {newOpen && <NewWorkflowDialog onClose={() => setNewOpen(false)} onCreate={onScaffold} />}
    </div>
  )
}
