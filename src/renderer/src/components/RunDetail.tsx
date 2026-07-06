import { useState } from 'react'
import type { JSX } from 'react'
import type { BlockerQuestion, RespondDecision } from '../../../shared/workflows'
import type { RunView } from '../lib/workflow-run-view'
import './RunDetail.css'

interface RunDetailProps {
  run: RunView
  onCancel: (runId: string) => void
  onRespond: (runId: string, decision: RespondDecision) => void
}

/**
 * WF5 — one run's live detail: status badge, cancel, the blocked respond panel,
 * and the step/log timeline. The timeline is rendered in arrival order with
 * grouped rows indented (WF5-10/11/12). A `failed` run shows only the badge — no
 * reason is broadcast in v1 (WF5-13, AD-011). Cancel appears only while the run
 * is running or blocked (WF5-18).
 */
export function RunDetail({ run, onCancel, onRespond }: RunDetailProps): JSX.Element {
  const canCancel = run.status === 'running' || run.status === 'blocked'

  return (
    <div className="run-detail">
      <header className="run-detail-bar">
        <div className="run-detail-titles">
          <span className="run-detail-title">{run.workflowId ?? 'workflow'}</span>
          <span className="run-detail-id">{run.runId}</span>
        </div>
        <span className={`run-badge run-badge-${run.status}`}>{run.status}</span>
        {canCancel && (
          <button type="button" className="run-cancel-btn" onClick={() => onCancel(run.runId)}>
            Cancel
          </button>
        )}
      </header>

      {run.blocked && (
        <RespondPanel
          question={run.blocked}
          onAbort={() => onRespond(run.runId, { action: 'abort' })}
          onGuidance={(guidance) => onRespond(run.runId, { action: 'guidance', guidance })}
        />
      )}

      <div className="run-timeline">
        {run.timeline.length === 0 ? (
          <p className="run-timeline-empty">No steps yet.</p>
        ) : (
          run.timeline.map((entry, index) => (
            <div
              key={index}
              className={`run-row run-row-${entry.kind}${entry.group ? ' grouped' : ''}`}
            >
              {entry.kind === 'step' ? (
                <span className="run-step-label">{entry.label}</span>
              ) : (
                <span className="run-log-msg">{entry.message}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

interface RespondPanelProps {
  question: BlockerQuestion
  onAbort: () => void
  onGuidance: (guidance: string) => void
}

/**
 * The human-in-the-loop surface for a blocked run (WF5-14/15/16): the question,
 * an Abort button, and a guidance box whose Send is disabled while empty.
 */
function RespondPanel({ question, onAbort, onGuidance }: RespondPanelProps): JSX.Element {
  const [text, setText] = useState('')

  return (
    <div className="respond-panel">
      <div className="respond-title">{question.title}</div>
      <div className="respond-body">{question.body}</div>
      <textarea
        className="respond-input"
        value={text}
        placeholder="Guidance to resume the agent…"
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <div className="respond-actions">
        <button type="button" className="respond-abort" onClick={onAbort}>
          Abort
        </button>
        <button
          type="button"
          className="respond-send"
          disabled={text.trim() === ''}
          onClick={() => onGuidance(text)}
        >
          Send guidance
        </button>
      </div>
    </div>
  )
}
