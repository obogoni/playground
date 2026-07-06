import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type {
  RespondDecision,
  ScaffoldResult,
  WorkflowDef,
  WorkflowMeta
} from '../../../shared/workflows'
import { relativeTime } from '../lib/relative-time'
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

/** The values of a run's trigger input, for the RECENT RUNS meta line. */
function inputSummary(input: Record<string, string>): string {
  const values = Object.values(input).filter((v) => v.trim() !== '')
  return values.length === 0 ? 'no inputs' : values.join(' ')
}

/**
 * WHF — the Workflows direction (fourth alongside tree/board/agents), rebuilt to
 * the handoff's hifi rail (§D-a): a header ("WORKFLOWS" + non-broken count +
 * Reload + "+ New"), DEFINITIONS cards (pipeline-glyph tile, name, description,
 * "N input(s)", play-triangle Run; broken = red tile + "broken" pill + error),
 * and RECENT RUNS (status dot + name + status pill + mono meta with relative
 * time, selected row = left accent bar). Run is disabled while a run is active
 * (serial, WF5-19); the serial-conflict error is surfaced (WF5-20).
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

  // Ticks the RECENT RUNS relative time without any parent re-render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const selectedRun = runs.find((r) => r.runId === selectedRunId) ?? null
  const runActive = activeRunId !== null
  const definedCount = defs.filter((d) => 'meta' in d).length

  return (
    <div className="workflows-view">
      <aside className="wf-rail">
        <div className="wf-rail-head">
          <div className="wf-rail-head-titles">
            <span className="wf-rail-title">Workflows</span>
            <span className="wf-rail-count">{definedCount} defined</span>
          </div>
          <div className="wf-rail-actions">
            <button
              type="button"
              className="wf-rail-btn"
              title="Rescan the workflows folder"
              onClick={onReload}
            >
              <Icon name="refresh" size={14} />
            </button>
            <button
              type="button"
              className="wf-new-btn"
              title="New workflow"
              onClick={() => setNewOpen(true)}
            >
              <Icon name="plus" size={13} strokeWidth={2.4} /> New
            </button>
          </div>
        </div>

        <div className="wf-rail-body">
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
                  <div className="wf-def-row">
                    <span className="wf-def-tile">
                      <Icon name="workflow-nodes" size={16} strokeWidth={1.9} />
                    </span>
                    <div className="wf-def-info">
                      <span className="wf-def-name">{def.meta.name}</span>
                      {def.meta.description && (
                        <span className="wf-def-desc">{def.meta.description}</span>
                      )}
                    </div>
                  </div>
                  <div className="wf-def-foot">
                    <span className="wf-def-inputs">
                      {def.meta.inputs.length === 0
                        ? 'no inputs'
                        : `${def.meta.inputs.length} input${def.meta.inputs.length === 1 ? '' : 's'}`}
                    </span>
                    <span className="wf-def-spacer" />
                    <button
                      type="button"
                      className="wf-run-btn"
                      disabled={runActive}
                      title={runActive ? 'A run is already active' : 'Run this workflow'}
                      onClick={() => setTriggerFor(def)}
                    >
                      <Icon name="play" size={12} /> Run
                    </button>
                  </div>
                </div>
              ) : (
                <div key={def.id} className="wf-def broken">
                  <div className="wf-def-row">
                    <span className="wf-def-tile broken">
                      <Icon name="alert" size={16} />
                    </span>
                    <div className="wf-def-info">
                      <span className="wf-def-broken-head">
                        <span className="wf-def-id">{def.id}</span>
                        <span className="wf-broken-pill">broken</span>
                      </span>
                      <span className="wf-def-error">{def.error}</span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {runs.length > 0 && (
            <>
              <div className="wf-section-label wf-runs-label">Recent runs</div>
              <div className="wf-runs">
                {runs.map((run) => (
                  <button
                    key={run.runId}
                    type="button"
                    className={`wf-run-item${run.runId === selectedRunId ? ' selected' : ''}`}
                    onClick={() => onSelectRun(run.runId)}
                  >
                    <span className="wf-run-line1">
                      <span className={`wf-run-dot ${run.status}`} />
                      <span className="wf-run-item-name">{run.workflowId ?? 'workflow'}</span>
                      <span className={`run-pill mini status-${run.status}`}>
                        <span className="run-pill-dot" />
                        {run.status}
                      </span>
                    </span>
                    <span className="wf-run-meta">
                      {inputSummary(run.input)}
                      {run.startedAt && ` · ${relativeTime(Date.parse(run.startedAt), now)}`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>

      {selectedRun ? (
        <RunDetail run={selectedRun} onCancel={onCancel} onRespond={onRespond} />
      ) : (
        <div className="wf-detail-empty">
          <Icon name="workflow-nodes" size={30} strokeWidth={1.7} />
          <p>Select a run, or trigger a workflow from the list.</p>
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
