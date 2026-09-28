import { useState } from 'react'
import type { JSX } from 'react'
import type { PinnedTaskView } from '../../../shared/tasks'
import type { PeriodTaskChoice, TimeEditResult } from '../../../shared/time'
import type { RawPeriodRow } from '../lib/hours-report'
import { fromLocalInput, handMarkTitle, splitDefault, toLocalInput } from '../lib/period-edit'
import { formatHmCompact } from '../lib/time-format'
import { Icon } from './Icon'
import { TaskPicker } from './TaskPicker'
import './PeriodRow.css'

interface PeriodRowProps {
  row: RawPeriodRow
  onDelete: (id: string) => Promise<TimeEditResult>
  onAdjust: (id: string, start: string, end: string) => Promise<TimeEditResult>
  /** Splits a closed period at a UTC ISO instant inside it (HTSK-28). */
  onSplit: (id: string, at: string) => Promise<TimeEditResult>
  /** The pinned tasks, for the Change task picker. */
  tasks: PinnedTaskView[]
  /** Moves a closed period to another task, No task or its branch's (HTSK-25..27). */
  onReassign: (id: string, choice: PeriodTaskChoice) => Promise<TimeEditResult>
}

const pad = (n: number): string => String(n).padStart(2, '0')

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

type Mode = 'view' | 'edit' | 'confirm-delete' | 'split' | 'task'

/**
 * One raw period under a merged block (TIME-38): start, end, duration and agent.
 * A closed period can be edited (both bounds, local time) or deleted after a
 * confirm; an open one offers neither (TIME-47). Main validates and answers
 * with an inline error (TIME-46, TIME-49). A period whose task was set by hand
 * wears a hand mark naming its branch (HTSK-38). A closed period can also be
 * split in two at a time inside it, the field starting on its midpoint
 * (HTSK-28, HTSK-33); main's verdict shows inline (HTSK-29..32). Change task
 * opens the picker with No task, From branch, the pins and the lookup
 * (HTSK-24). A running period offers none of these (HTSK-34).
 */
export function PeriodRow({
  row,
  onDelete,
  onAdjust,
  onSplit,
  tasks,
  onReassign
}: PeriodRowProps): JSX.Element {
  const { period } = row
  const [mode, setMode] = useState<Mode>('view')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [splitAt, setSplitAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const settle = (result: Promise<TimeEditResult>): void => {
    setBusy(true)
    result
      .then((outcome) => {
        if (outcome.ok) {
          setMode('view')
          setError(null)
        } else {
          setError(outcome.error)
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  const startEdit = (): void => {
    // The raw row may be a piece clipped at midnight; editing works on the whole period.
    if (!('end' in period)) return
    setStart(toLocalInput(period.start))
    setEnd(toLocalInput(period.end))
    setError(null)
    setMode('edit')
  }

  const save = (): void => {
    const startIso = fromLocalInput(start)
    const endIso = fromLocalInput(end)
    if (!startIso || !endIso) {
      setError('Start and end must be valid dates.')
      return
    }
    settle(onAdjust(period.id, startIso, endIso))
  }

  const startSplit = (): void => {
    if (!('end' in period)) return
    setSplitAt(splitDefault(period.start, period.end))
    setError(null)
    setMode('split')
  }

  const split = (): void => {
    const at = fromLocalInput(splitAt)
    if (!at) {
      setError('Split time must be a valid date.')
      return
    }
    settle(onSplit(period.id, at))
  }

  // The picker closes at once; a rejection shows inline under the row.
  const reassign = (choice: PeriodTaskChoice): void => {
    setMode('view')
    settle(onReassign(period.id, choice))
  }

  const cancel = (): void => {
    setMode('view')
    setError(null)
  }

  return (
    <div className={`period-row${row.open ? ' open' : ''}`}>
      <div className="period-row-main">
        <span className="period-row-range">
          {clock(row.start)}–{row.open ? 'now' : clock(row.end)}
        </span>
        <span className="period-row-duration">{formatHmCompact(row.durationMs)}</span>
        <span className="period-row-agent">{period.agent}</span>
        {period.taskByHand === true && (
          <span
            className="period-row-hand"
            role="img"
            title={handMarkTitle(period.branch)}
            aria-label={handMarkTitle(period.branch)}
          >
            <Icon name="hand" size={12} />
          </span>
        )}
        <span className="period-row-spacer" />
        {row.open ? (
          <span className="period-row-live">running</span>
        ) : (
          mode === 'view' && (
            <>
              <button
                type="button"
                className="period-row-icon period-row-change-task"
                title="Change task"
                aria-label="Change task"
                onClick={() => {
                  setError(null)
                  setMode('task')
                }}
              >
                <Icon name="tag" size={12} />
              </button>
              <button
                type="button"
                className="period-row-icon period-row-split"
                title="Split at"
                aria-label="Split at"
                onClick={startSplit}
              >
                <Icon name="scissors" size={12} />
              </button>
              <button
                type="button"
                className="period-row-icon"
                title="Edit start and end"
                aria-label="Edit period"
                onClick={startEdit}
              >
                <Icon name="pencil" size={12} />
              </button>
              <button
                type="button"
                className="period-row-icon red"
                title="Delete period"
                aria-label="Delete period"
                onClick={() => {
                  setError(null)
                  setMode('confirm-delete')
                }}
              >
                <Icon name="trash" size={12} />
              </button>
            </>
          )
        )}
      </div>

      {mode === 'edit' && (
        <div className="period-row-form">
          <label className="period-row-field">
            Start
            <input
              type="datetime-local"
              step={1}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="period-row-field">
            End
            <input
              type="datetime-local"
              step={1}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <button type="button" className="period-row-btn primary" disabled={busy} onClick={save}>
            Save
          </button>
          <button type="button" className="period-row-btn" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      {mode === 'task' && (
        <div className="period-row-picker">
          <TaskPicker tasks={tasks} noTask onChoose={reassign} onClose={cancel} />
        </div>
      )}

      {mode === 'split' && (
        <div className="period-row-form period-row-split-form">
          <label className="period-row-field">
            Split at
            <input
              className="period-row-split-input"
              type="datetime-local"
              step={1}
              value={splitAt}
              onChange={(e) => setSplitAt(e.target.value)}
            />
          </label>
          <button type="button" className="period-row-btn primary" disabled={busy} onClick={split}>
            Split
          </button>
          <button type="button" className="period-row-btn" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      {mode === 'confirm-delete' && (
        <div className="period-row-form">
          <span className="period-row-confirm">
            Delete this period? Its time leaves every total.
          </span>
          <button
            type="button"
            className="period-row-btn danger"
            disabled={busy}
            onClick={() => settle(onDelete(period.id))}
          >
            Delete
          </button>
          <button type="button" className="period-row-btn" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      )}

      {error && <div className="period-row-error">{error}</div>}
    </div>
  )
}
