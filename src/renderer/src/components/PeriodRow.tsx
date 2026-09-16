import { useState } from 'react'
import type { JSX } from 'react'
import type { TimeEditResult } from '../../../shared/time'
import type { RawPeriodRow } from '../lib/hours-report'
import { formatHmCompact } from '../lib/time-format'
import { Icon } from './Icon'
import './PeriodRow.css'

interface PeriodRowProps {
  row: RawPeriodRow
  onDelete: (id: string) => Promise<TimeEditResult>
  onAdjust: (id: string, start: string, end: string) => Promise<TimeEditResult>
}

const pad = (n: number): string => String(n).padStart(2, '0')

const clock = (ms: number): string => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** An ISO instant as a `datetime-local` value in local time, to the second. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `${day}T${clock(d.getTime())}`
}

/** A `datetime-local` value (local time) as a UTC ISO instant; null when empty or invalid. */
function fromLocalInput(value: string): string | null {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

type Mode = 'view' | 'edit' | 'confirm-delete'

/**
 * One raw period under a merged block (TIME-38): start, end, duration and agent.
 * A closed period can be edited (both bounds, local time) or deleted after a
 * confirm; an open one offers neither (TIME-47). Main validates and answers
 * with an inline error (TIME-46, TIME-49).
 */
export function PeriodRow({ row, onDelete, onAdjust }: PeriodRowProps): JSX.Element {
  const { period } = row
  const [mode, setMode] = useState<Mode>('view')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
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
        <span className="period-row-spacer" />
        {row.open ? (
          <span className="period-row-live">running</span>
        ) : (
          mode === 'view' && (
            <>
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
