import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type {
  BlockerQuestion,
  PermissionPreset,
  RespondDecision,
  StepDetail,
  StepKind
} from '../../../shared/workflows'
import type { ChangeStatus } from '../../../shared/worktrees'
import { relativeTime } from '../lib/relative-time'
import {
  groupRollup,
  stepStatus,
  type RunView,
  type StepNode,
  type StepStatus
} from '../lib/workflow-run-view'
import { Icon } from './Icon'
import './RunDetail.css'

interface RunDetailProps {
  run: RunView
  onCancel: (runId: string) => void
  onRespond: (runId: string, decision: RespondDecision) => void
}

/** Step-kind → mono tag label + color class (handoff §"Step kind → color"). */
const KIND_TAG: Record<Exclude<StepKind, 'group'>, { label: string; cls: string }> = {
  sh: { label: 'sh', cls: 'muted' },
  git: { label: 'git', cls: 'blue' },
  worktree: { label: 'worktree', cls: 'accent' },
  ado: { label: 'ado', cls: 'green' },
  notify: { label: 'notify', cls: 'amber' },
  ask: { label: 'ask', cls: 'amber' },
  agent: { label: 'agent', cls: 'accent' }
}

/** Permission preset → pill label + color class (handoff §"Permission preset → color"). */
const PERMISSION: Record<PermissionPreset, { label: string; cls: string }> = {
  read: { label: 'read-only', cls: 'blue' },
  write: { label: 'write', cls: 'accent' },
  bypass: { label: 'bypass', cls: 'red' }
}

/** `1.4s` / `52s` / `1m 12s` — sub-10s keeps one decimal, then whole seconds/minutes. */
function formatDuration(ms: number): string {
  const s = ms / 1000
  if (s < 60) return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s - m * 60)}s`
}

/** Color a mono detail line by its leading glyph (handoff §"Step detail box"). */
function lineClass(line: string): string {
  const c = line.trimStart()[0] ?? ''
  if (c === '+') return 'g-green'
  if (c === '~') return 'g-amber'
  if (c === '-' || c === '✖' || c === '✕') return 'g-red'
  if (c === '⎿' || c === '└') return 'g-faint'
  if (c === '⏺' || c === '●' || c === '$' || c === '#') return 'g-text'
  return 'g-muted'
}

/** A changed-file status → its leading glyph (`+` added, `-` deleted, `~` modified/renamed). */
function fileGlyph(status: ChangeStatus): string {
  if (status === 'added' || status === 'untracked') return '+'
  if (status === 'deleted') return '-'
  return '~'
}

/** The mono lines a `StepDetail` renders in its detail box. */
function detailLines(detail: StepDetail): string[] {
  if (detail.kind === 'files') {
    return detail.files.length === 0
      ? ['⎿ no changed files']
      : detail.files.map((f) => `${fileGlyph(f.status)} ${f.path}`)
  }
  const lines = [`⏺ ${detail.task.type} · ${detail.task.title}`]
  for (const c of detail.children) lines.push(`└ ${c.type} · ${c.title}`)
  return lines
}

/** The validated `emit_result.data` as `key value` pairs, stringifying non-strings. */
function dataEntries(data: unknown): [string, string][] {
  if (!data || typeof data !== 'object') return []
  return Object.entries(data as Record<string, unknown>).map(([k, v]) => [
    k,
    typeof v === 'string' ? v : JSON.stringify(v)
  ])
}

/**
 * WHF — one run's hifi detail (handoff §D-b): header (workflow tile + name +
 * `RUN-ID · started <relative>` + status pill + Cancel), the INPUTS strip, the
 * node timeline (glyph-by-status nodes + connectors, kind tags, durations, group
 * rows with a rollup pill, step/agent detail boxes), the blocked respond panel,
 * and the failed footer. Per-step status + group rollup are derived by the pure
 * fold (`stepStatus`/`groupRollup`); this component only paints them.
 */
export function RunDetail({ run, onCancel, onRespond }: RunDetailProps): JSX.Element {
  // Ticks the "started Nm ago" label without any parent re-render (spec Edge:
  // relative time updates within ~a minute).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const canCancel = run.status === 'running' || run.status === 'blocked'
  const inputEntries = Object.entries(run.input)

  // Group nesting is keyed by the parent group LABEL (additive). A top-level row
  // is either a group header or an ungrouped step; a group's children are the
  // steps tagged with its label, rendered indented right after it.
  const groupLabels = new Set(run.steps.filter((s) => s.kind === 'group').map((s) => s.label))
  const childrenOf = (label: string): StepNode[] => run.steps.filter((s) => s.group === label)
  const topLevel = run.steps.filter((s) => s.group === undefined || !groupLabels.has(s.group))

  // Flattened visual order (group header then its children) so the connector caps
  // cleanly on the first/last rendered node.
  const visual: { node: StepNode; status: StepStatus; grouped: boolean }[] = []
  for (const node of topLevel) {
    if (node.kind === 'group') {
      const kids = childrenOf(node.label)
      const rollup = groupRollup(kids.map((k) => stepStatus(k, run)))
      visual.push({ node, status: rollup, grouped: false })
      for (const kid of kids)
        visual.push({ node: kid, status: stepStatus(kid, run), grouped: true })
    } else {
      visual.push({ node, status: stepStatus(node, run), grouped: false })
    }
  }

  return (
    <div className="run-detail">
      <header className="run-detail-bar">
        <div className="run-tile">
          <Icon name="workflow-nodes" size={18} strokeWidth={1.9} />
        </div>
        <div className="run-detail-titles">
          <span className="run-detail-title">{run.workflowId ?? 'workflow'}</span>
          <span className="run-detail-id">
            {run.runId}
            {run.startedAt && ` · started ${relativeTime(Date.parse(run.startedAt), now)}`}
          </span>
        </div>
        <span className={`run-pill status-${run.status}`}>
          <span className="run-pill-dot" />
          {run.status}
        </span>
        {canCancel && (
          <button type="button" className="run-cancel-btn" onClick={() => onCancel(run.runId)}>
            <Icon name="stop-square" size={11} /> Cancel
          </button>
        )}
      </header>

      <div className="run-inputs">
        <span className="run-inputs-cap">Inputs</span>
        {inputEntries.length === 0 ? (
          <span className="run-inputs-none">no inputs</span>
        ) : (
          inputEntries.map(([k, v]) => (
            <span key={k} className="run-input-chip">
              <span className="k">{k}</span>
              <span className="eq">=</span>
              <span className="v">{v}</span>
            </span>
          ))
        )}
      </div>

      <div className="run-timeline">
        {visual.length === 0 ? (
          <p className="run-timeline-empty">No steps yet.</p>
        ) : (
          visual.map((row, i) => (
            <StepRow
              key={row.node.stepId}
              node={row.node}
              status={row.status}
              grouped={row.grouped}
              first={i === 0}
              last={i === visual.length - 1}
            />
          ))
        )}

        {run.status === 'blocked' && run.blocked && (
          <RespondPanel
            question={run.blocked}
            sessionId={run.blockedSessionId}
            onAbort={() => onRespond(run.runId, { action: 'abort' })}
            onGuidance={(guidance) => onRespond(run.runId, { action: 'guidance', guidance })}
          />
        )}

        {run.status === 'failed' && <FailedFooter run={run} />}
      </div>
    </div>
  )
}

interface StepRowProps {
  node: StepNode
  status: StepStatus
  grouped: boolean
  first: boolean
  last: boolean
}

/** One timeline row: gutter node + connector, then the step/group content. */
function StepRow({ node, status, grouped, first, last }: StepRowProps): JSX.Element {
  const isGroup = node.kind === 'group'
  return (
    <div
      className={`run-row${grouped ? ' grouped' : ''}${first ? ' first' : ''}${last ? ' last' : ''}`}
    >
      <div className="run-gutter">
        <span className={`run-node node-${status}`}>
          <NodeGlyph status={status} />
        </span>
      </div>
      <div className="run-content">
        <div className="run-step-line">
          {isGroup ? (
            <>
              <span className="run-group-label">{node.label}</span>
              <span className={`run-pill mini status-${status}`}>
                <span className="run-pill-dot" />
                {status}
              </span>
            </>
          ) : (
            <>
              <span className={`run-kind-tag tag-${KIND_TAG[node.kind].cls}`}>
                {KIND_TAG[node.kind].label}
              </span>
              <span className="run-step-label">{node.label}</span>
              {node.finished && node.durationMs !== undefined && (
                <span className="run-step-dur">{formatDuration(node.durationMs)}</span>
              )}
            </>
          )}
        </div>
        {node.kind === 'agent' && node.agent ? (
          <AgentBox node={node} status={status} />
        ) : (
          node.detail && <DetailBox lines={detailLines(node.detail)} />
        )}
      </div>
    </div>
  )
}

/** The node glyph by status (handoff §"Node"). Running is a filled pulsing dot. */
function NodeGlyph({ status }: { status: StepStatus }): JSX.Element | null {
  switch (status) {
    case 'done':
      return <Icon name="check" size={13} strokeWidth={2.6} />
    case 'failed':
    case 'cancelled':
      return <Icon name="x" size={12} strokeWidth={2.4} />
    case 'blocked':
      return <span className="run-node-bang">!</span>
    case 'running':
      return <span className="run-node-dot" />
    default:
      return null // pending — a hollow ring
  }
}

/** The mono detail box for an `ado`/`files` step (lines colored by leading glyph). */
function DetailBox({ lines }: { lines: string[] }): JSX.Element {
  return (
    <div className="run-detail-box">
      {lines.map((line, i) => (
        <div key={i} className={`run-detail-line ${lineClass(line)}`}>
          {line}
        </div>
      ))}
    </div>
  )
}

/** The agent step's detail box: tile + name + permission pill + emit badge + prompt + data. */
function AgentBox({ node, status }: { node: StepNode; status: StepStatus }): JSX.Element {
  const agent = node.agent!
  const perm = PERMISSION[agent.permission]
  const done = node.finished && node.agentResult?.status === 'done'
  const badge = done
    ? { label: 'emit_result · done', cls: 'green' }
    : status === 'blocked'
      ? { label: 'emit_result · blocked', cls: 'amber' }
      : { label: 'running…', cls: 'blue' }
  const entries = done ? dataEntries(node.agentResult?.data) : []

  return (
    <div className="run-agent-box">
      <div className="run-agent-head">
        <span className="run-agent-tile">
          <Icon name="terminal" size={14} />
        </span>
        <span className="run-agent-name">{node.label}</span>
        <span className={`run-pill mini status-perm-${perm.cls}`}>{perm.label}</span>
        <span className="run-agent-spacer" />
        <span className={`run-agent-badge badge-${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="run-agent-prompt">{agent.prompt}</div>
      {status === 'blocked' && (
        <div className="run-agent-blocked">↳ reported a blocker — your input is needed below</div>
      )}
      {entries.length > 0 && (
        <div className="run-agent-data">
          {entries.map(([k, v]) => (
            <div key={k} className="run-agent-datum">
              <span className="bullet">•</span>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface RespondPanelProps {
  question: BlockerQuestion
  sessionId?: string
  onAbort: () => void
  onGuidance: (guidance: string) => void
}

/**
 * The hifi human-in-the-loop surface for a blocked run (WHF-19): the `?`-tile
 * header, the agent's question, the "resumes the same agent conversation
 * (session `<id>`) via `--resume`" note, a guidance textarea, and the
 * Abort / Resume actions (Resume disabled while empty).
 */
function RespondPanel({
  question,
  sessionId,
  onAbort,
  onGuidance
}: RespondPanelProps): JSX.Element {
  const [text, setText] = useState('')

  return (
    <div className="respond-panel">
      <div className="respond-head">
        <span className="respond-tile">
          <Icon name="help-circle" size={18} />
        </span>
        <span className="respond-title">Blocked — the agent needs your input</span>
      </div>
      {question.title && <div className="respond-q-title">{question.title}</div>}
      <div className="respond-body">{question.body}</div>
      <div className="respond-note">
        Guidance resumes the <strong>same</strong> agent conversation
        {sessionId && (
          <>
            {' '}
            (session <code>{sessionId}</code>)
          </>
        )}{' '}
        via <code>--resume</code>, keeping all of its context.
      </div>
      <textarea
        className="respond-input"
        value={text}
        placeholder="Guidance to resume the agent…"
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <div className="respond-actions">
        <button type="button" className="respond-abort" onClick={onAbort}>
          Abort run
        </button>
        <button
          type="button"
          className="respond-send"
          disabled={text.trim() === ''}
          onClick={() => onGuidance(text)}
        >
          Resume with guidance <Icon name="external-link" size={13} />
        </button>
      </div>
    </div>
  )
}

/** The failed-run footer (WHF-20): the failing call + evidence + the no-rollback note. */
function FailedFooter({ run }: { run: RunView }): JSX.Element {
  return (
    <div className="failed-footer">
      <div className="failed-head">
        <Icon name="x-circle" size={16} />
        <span>Run failed</span>
      </div>
      {run.error && <div className="failed-call">{run.error}</div>}
      {run.stdout && <pre className="failed-stdout">{run.stdout}</pre>}
      {run.code !== undefined && <div className="failed-code">exit code {run.code}</div>}
      <div className="failed-note">
        No engine rollback — worktrees and branches are left in place so you can inspect the
        half-finished state. Add a <code>try/finally</code> in the workflow to tear down on failure.
      </div>
    </div>
  )
}
