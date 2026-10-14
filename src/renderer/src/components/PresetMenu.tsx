import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { AgentPresetEntry, AgentPresetListing } from '../../../shared/agent-presets'
import type { AgentDef } from '../../../shared/agents'
import type { PromptEntry } from '../../../shared/prompt-template'
import { api } from '../lib/api'
import { presetProblem } from '../lib/preset-launch'
import { Icon } from './Icon'
import './PresetMenu.css'

/** A preset the menu lets the developer pick: one whose entry is valid (PRST-34). */
export type PickablePreset = Extract<AgentPresetEntry, { kind: 'ok' }>

interface PresetMenuProps {
  agents: AgentDef[]
  /** The picked preset and the prompt listing the menu judged it against. */
  onPick: (entry: PickablePreset, prompts: PromptEntry[]) => void
  onManage: () => void
  onClose: () => void
}

interface Loaded {
  listing: AgentPresetListing
  prompts: PromptEntry[]
}

/** Both files are read each time the menu opens, so a hand edit shows at once (PRST-01). */
function load(): Promise<Loaded> {
  const listing = api.invoke('agentPresets:list').catch(
    (err): AgentPresetListing => ({
      ok: false,
      reason: err instanceof Error ? err.message : String(err)
    })
  )
  // A failed prompt listing reads as an empty folder, as in New Session.
  const prompts = api.invoke('prompts:list').catch((err) => {
    console.error(err)
    return [] as PromptEntry[]
  })
  return Promise.all([listing, prompts]).then(([l, p]) => ({ listing: l, prompts: p }))
}

/**
 * The preset menu under the rail's split button (PRST-18): every preset in
 * file order, a broken one with its warning and reason (PRST-31, PRST-32), an
 * entry-invalid one listed but not pickable (PRST-34), the empty text
 * (PRST-20) or the invalid-file row (PRST-35), then **Manage presets…**
 * (PRST-19). Closes on a click outside or Escape (the SyncPopover pattern);
 * Escape is taken in the capture phase so it never reaches the rail.
 */
export function PresetMenu({ agents, onPick, onManage, onClose }: PresetMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let live = true
    load().then((next) => {
      if (live) setLoaded(next)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const note = (text: string): JSX.Element => (
    <div className="rail-ctx-item preset-menu-note" role="menuitem" aria-disabled="true">
      {text}
    </div>
  )

  const problemMark = (reason: string): JSX.Element => (
    <span className="preset-menu-problem">
      <Icon name="alert" size={12} />
      {reason}
    </span>
  )

  const rows = (): JSX.Element | JSX.Element[] => {
    if (!loaded) return note('Loading…')
    const { listing, prompts } = loaded
    if (!listing.ok) return note(`presets.json: ${listing.reason}`)
    if (listing.entries.length === 0) {
      return note('No presets yet — use Save as preset in New session')
    }
    return listing.entries.map((entry, index) => {
      if (entry.kind === 'invalid') {
        return (
          <button
            key={`invalid-${index}`}
            type="button"
            role="menuitem"
            className="rail-ctx-item preset-menu-item"
            disabled
          >
            <span className="preset-menu-name">{entry.name ?? 'Unnamed preset'}</span>
            {problemMark(entry.reason)}
          </button>
        )
      }
      const problem = presetProblem(entry.preset, entry.cwdExists, agents, prompts)
      return (
        <button
          key={`ok-${index}`}
          type="button"
          role="menuitem"
          className="rail-ctx-item preset-menu-item"
          onClick={() => {
            onClose()
            onPick(entry, prompts)
          }}
        >
          <span className="preset-menu-name">{entry.preset.name}</span>
          {problem && problemMark(problem)}
        </button>
      )
    })
  }

  return (
    <div className="rail-ctx-menu preset-menu" role="menu" aria-label="Agent presets" ref={ref}>
      {rows()}
      <div className="preset-menu-sep" role="separator" />
      <button
        type="button"
        role="menuitem"
        className="rail-ctx-item preset-menu-item"
        onClick={() => {
          onClose()
          onManage()
        }}
      >
        <Icon name="settings" size={13} /> Manage presets…
      </button>
    </div>
  )
}
