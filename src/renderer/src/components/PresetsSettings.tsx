import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import {
  presetNameProblem,
  type AgentPresetChangeResult,
  type AgentPresetListing
} from '../../../shared/agent-presets'
import type { AgentDef } from '../../../shared/agents'
import type { PromptEntry } from '../../../shared/prompt-template'
import { api } from '../lib/api'
import { presetProblem } from '../lib/preset-launch'
import { Icon } from './Icon'

interface PresetsSettingsProps {
  /** The registry, so a preset naming a missing agent shows its reason (PRST-31). */
  agents: AgentDef[]
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Settings › Presets (PRST-36): every preset in file order with its agent, cwd
 * and prompt, broken ones with their reason, and rename / move / delete rows
 * that change the file at once (PRST-44). Each action re-renders from the
 * listing its channel returns. An invalid file shows only its reason and
 * **Open presets file** (PRST-43).
 */
export function PresetsSettings({ agents }: PresetsSettingsProps): JSX.Element {
  const [listing, setListing] = useState<AgentPresetListing | null>(null)
  const [prompts, setPrompts] = useState<PromptEntry[]>([])
  /** The preset being renamed and the typed name; null = no rename open. */
  const [rename, setRename] = useState<{ from: string; to: string } | null>(null)
  /** The preset whose delete awaits confirmation. */
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = (): Promise<void> =>
    api
      .invoke('agentPresets:list')
      .then(setListing)
      .catch((err) => setListing({ ok: false, reason: messageOf(err) }))

  useEffect(() => {
    void refresh()
    // A failed prompt listing reads as an empty folder, as in the preset menu.
    api
      .invoke('prompts:list')
      .then(setPrompts)
      .catch((err) => console.error(err))
  }, [])

  const apply = (change: Promise<AgentPresetChangeResult>): void => {
    setBusy(true)
    setError(null)
    change
      .then((result) => {
        if (result.ok) {
          setListing(result.listing)
          setRename(null)
          setDeleting(null)
          return
        }
        if (result.error.kind === 'exists') {
          setError(`A preset named "${result.error.name}" already exists`) // PRST-39
          return
        }
        // The file may have changed by hand since it was listed: show why and re-read.
        setError(result.error.message)
        setDeleting(null)
        return refresh()
      })
      .catch((err) => setError(messageOf(err)))
      .finally(() => setBusy(false))
  }

  const openFile = (): void => {
    setOpenError(null)
    api
      .invoke('agentPresets:openFile')
      .then(({ error: reason }) => {
        setOpenError(reason)
        return refresh()
      })
      .catch((err) => setOpenError(messageOf(err)))
  }

  const submitRename = (): void => {
    if (!rename || busy || presetNameProblem(rename.to) !== null) return
    apply(api.invoke('agentPresets:rename', { from: rename.from, to: rename.to }))
  }

  const rows = (): JSX.Element => {
    if (!listing) return <div className="set-agent-empty">Loading…</div>
    if (!listing.ok) {
      return (
        <div className="dialog-error set-preset-file-error">presets.json: {listing.reason}</div>
      )
    }
    if (listing.entries.length === 0) {
      return (
        <div className="set-agent-empty">No presets yet — use Save as preset in New session.</div>
      )
    }
    const last = listing.entries.length - 1
    return (
      <div className="set-agent-list">
        {listing.entries.map((entry, index) => {
          if (entry.kind === 'invalid') {
            return (
              <div key={`invalid-${index}`} className="set-agent-row set-preset-row">
                <span className="set-preset-text">
                  <span className="set-agent-name">{entry.name ?? 'Unnamed preset'}</span>
                  <span className="set-preset-sub set-preset-broken">⚠ {entry.reason}</span>
                </span>
              </div>
            )
          }
          const { preset } = entry
          const problem = presetProblem(preset, entry.cwdExists, agents, prompts)
          const renaming = rename !== null && rename.from === preset.name
          const nameProblem = renaming ? presetNameProblem(rename.to) : null
          return (
            <div key={`ok-${index}`} className="set-agent-row set-preset-row">
              {renaming ? (
                <form
                  className="set-preset-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitRename()
                  }}
                >
                  <input
                    className="dialog-input"
                    aria-label="Preset name"
                    value={rename.to}
                    autoFocus
                    spellCheck={false}
                    onChange={(event) => {
                      setError(null)
                      setRename({ from: rename.from, to: event.target.value })
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return
                      // Cancel the rename, not the whole dialog.
                      event.stopPropagation()
                      setRename(null)
                      setError(null)
                    }}
                  />
                  {nameProblem && <span className="set-preset-hint">{nameProblem}</span>}
                  <button
                    type="button"
                    className="dialog-btn-ghost"
                    onClick={() => {
                      setRename(null)
                      setError(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="dialog-btn-primary"
                    disabled={busy || nameProblem !== null}
                  >
                    Rename
                  </button>
                </form>
              ) : deleting === preset.name ? (
                <>
                  <span className="set-preset-text set-preset-confirm">
                    {`Delete preset "${preset.name}"?`}
                  </span>
                  <button
                    type="button"
                    className="dialog-btn-ghost"
                    onClick={() => setDeleting(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="dialog-btn-primary set-preset-delete"
                    disabled={busy}
                    onClick={() => apply(api.invoke('agentPresets:delete', { name: preset.name }))}
                  >
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <span className="set-preset-text">
                    <span className="set-agent-name">{preset.name}</span>
                    <span className="set-preset-sub">
                      {problem ? (
                        <span className="set-preset-broken">⚠ {problem}</span>
                      ) : (
                        `${preset.agent} · ${preset.cwd} · ${preset.prompt ?? 'No prompt'}`
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="set-agent-icon-btn"
                    title="Rename preset"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      setDeleting(null)
                      setRename({ from: preset.name, to: preset.name })
                    }}
                  >
                    <Icon name="pencil" size={13} />
                  </button>
                  <button
                    type="button"
                    className="set-agent-icon-btn set-preset-up"
                    title="Move up"
                    disabled={busy || index === 0}
                    onClick={() =>
                      apply(api.invoke('agentPresets:move', { name: preset.name, direction: 'up' }))
                    }
                  >
                    <Icon name="chevron-down" size={13} />
                  </button>
                  <button
                    type="button"
                    className="set-agent-icon-btn"
                    title="Move down"
                    disabled={busy || index === last}
                    onClick={() =>
                      apply(
                        api.invoke('agentPresets:move', { name: preset.name, direction: 'down' })
                      )
                    }
                  >
                    <Icon name="chevron-down" size={13} />
                  </button>
                  <button
                    type="button"
                    className="set-agent-icon-btn"
                    title="Delete preset"
                    disabled={busy}
                    onClick={() => {
                      setError(null)
                      setRename(null)
                      setDeleting(preset.name)
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <div className="set-preset-head">
        <div className="dialog-field-label">Presets</div>
        <button type="button" className="dialog-btn-ghost set-preset-open" onClick={openFile}>
          <Icon name="external-link" size={13} /> Open presets file
        </button>
      </div>
      {openError && <div className="dialog-error">{openError}</div>}
      {rows()}
      {error && <div className="dialog-error">{error}</div>}
    </div>
  )
}
