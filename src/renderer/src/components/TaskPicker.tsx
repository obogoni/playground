import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PinnedTaskView } from '../../../shared/tasks'
import type { PeriodTaskChoice } from '../../../shared/time'
import { api } from '../lib/api'
import { lookupEntry, pickerEntries, type LookupEntry } from '../lib/task-picker'
import { typeClass } from '../lib/task-pills'
import './TaskPicker.css'

interface TaskPickerProps {
  /** The pinned tasks, as the Tasks pane holds them. */
  tasks: PinnedTaskView[]
  /** Offer `No task`: the drawer's picker only (HTSK-24); a session's has none. */
  noTask?: boolean
  /** Viewport point to open at (a context menu); absent = below the host,
   *  which must be positioned. */
  at?: { x: number; y: number }
  /** The user chose an entry; the host applies it and closes the picker. */
  onChoose: (choice: PeriodTaskChoice) => void
  onClose: () => void
}

/**
 * One task picker for every surface (the new-session dialog, the rail, the
 * detail strip and the drawer): `No task` when asked, `From branch`, the pinned
 * tasks (HTSK-01), and a field that looks up any work item by number or URL.
 * The lookup reaches Azure DevOps only on Enter or `Look up`, never while the
 * user types (HTSK-03); its result is one row to choose (HTSK-02), a failure
 * shows main's error and chooses nothing (HTSK-05), and choosing it pins
 * nothing (HTSK-04). Escape or a press outside closes it.
 */
export function TaskPicker({
  tasks,
  noTask = false,
  at,
  onChoose,
  onClose
}: TaskPickerProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const lookupSeq = useRef(0)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [found, setFound] = useState<LookupEntry | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Press, not click: the click that opened the picker must not close it.
  // Escape is taken in the capture phase and marked handled, so a drawer or
  // dialog behind the picker stays open (HoursView checks defaultPrevented).
  useEffect(() => {
    const onPress = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('mousedown', onPress)
    document.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onPress)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const lookUp = (): void => {
    const seq = ++lookupSeq.current
    setBusy(true)
    setFound(null)
    setError(null)
    api
      .invoke('tasks:lookup', { input })
      .then((result) => {
        if (seq !== lookupSeq.current) return
        if (result.ok) setFound(lookupEntry(result.item))
        else setError(result.error)
      })
      .catch((err) => {
        if (seq === lookupSeq.current) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (seq === lookupSeq.current) setBusy(false)
      })
  }

  const entries = pickerEntries(tasks, { fromBranch: true, noTask })

  return (
    <div
      className={at ? 'task-picker task-picker-at' : 'task-picker'}
      style={at ? { left: at.x, top: at.y } : undefined}
      ref={ref}
      role="dialog"
      aria-label="Choose a task"
    >
      <div className="task-picker-list">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={
              entry.choice.kind === 'task'
                ? 'task-picker-entry'
                : 'task-picker-entry task-picker-special'
            }
            onClick={() => onChoose(entry.choice)}
          >
            <span className="task-picker-label">{entry.label}</span>
            {entry.badgeType && (
              <span className={`task-pill ${typeClass(entry.badgeType)}`}>
                <span className="task-pill-dot" />
                {entry.badgeType}
              </span>
            )}
            {entry.title && <span className="task-picker-title">{entry.title}</span>}
          </button>
        ))}
      </div>
      {/* Not a <form>: the picker can sit inside the new-session dialog's form. */}
      <div className="task-picker-lookup">
        <input
          className="task-picker-input"
          type="text"
          value={input}
          placeholder="Type a work item number or paste its URL"
          aria-label="Type a work item number or paste its URL"
          spellCheck={false}
          autoFocus
          onChange={(e) => {
            setInput(e.target.value)
            setFound(null)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            if (!busy) lookUp()
          }}
        />
        <button type="button" className="task-picker-go" disabled={busy} onClick={lookUp}>
          {busy ? 'Looking up…' : 'Look up'}
        </button>
      </div>
      {found && (
        <button
          type="button"
          className="task-picker-entry task-picker-found"
          onClick={() => onChoose(found.choice)}
        >
          {found.text}
        </button>
      )}
      {error && (
        <div className="task-picker-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
