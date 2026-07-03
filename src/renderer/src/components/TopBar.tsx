import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppConfig } from '../../../shared/config'
import type { AdoAuthState } from '../../../shared/tasks'
import { api } from '../lib/api'
import { Icon } from './Icon'
import './TopBar.css'

type Theme = AppConfig['ui']['theme']
type Direction = AppConfig['ui']['direction']

export interface SyncStatus {
  auth: AdoAuthState
  /** Epoch ms of the last successful ADO fetch this session. */
  lastSyncAt: number | null
  /** Org shown in the status text, when one is known. */
  org: string | null
}

interface TopBarProps {
  theme: Theme
  direction: Direction
  sync: SyncStatus
  onThemeToggle: () => void
  onDirectionChange: (direction: Direction) => void
  onRefresh: () => void
  onOpenSettings: () => void
}

function relativeTime(epochMs: number, now: number): string {
  const minutes = Math.floor((now - epochMs) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function syncText(sync: SyncStatus, now: number): string {
  if (sync.auth === 'failed') return 'az · not signed in'
  if (sync.auth === 'ok' && sync.lastSyncAt !== null) {
    return `az · ${sync.org ?? 'ado'} · synced ${relativeTime(sync.lastSyncAt, now)}`
  }
  return 'az · not connected'
}

export function TopBar({
  theme,
  direction,
  sync,
  onThemeToggle,
  onDirectionChange,
  onRefresh,
  onOpenSettings
}: TopBarProps): JSX.Element {
  // Keeps the "synced Nm ago" text ticking without any parent re-render.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  // The running app's version, surfaced so silent auto-updates are visible (a
  // bumped tag here is how you confirm an update applied). Fetched once from
  // main's app.getVersion(); the tag renders once it resolves.
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    api
      .invoke('app:version')
      .then((v) => live && setVersion(v))
      // api.invoke already tags the error with the channel; surface it so a
      // broken preload bridge / unregistered channel is diagnosable rather than
      // just a silently missing tag.
      .catch((err) => console.error(err))
    return () => {
      live = false
    }
  }, [])

  const connected = sync.auth === 'ok' && sync.lastSyncAt !== null

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-brand-tile">
          <Icon name="git-branch" size={17} strokeWidth={2} />
        </div>
        <div className="topbar-brand-labels">
          <span className="topbar-brand-name">
            Playground
            {version && (
              <span className="topbar-brand-version" title="Installed version">
                v{version}
              </span>
            )}
          </span>
          <span className="topbar-brand-sub">tasks &amp; worktrees</span>
        </div>
      </div>

      <div className="topbar-segmented" role="tablist" aria-label="Layout direction">
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'tree'}
          className={`topbar-segment${direction === 'tree' ? ' active' : ''}`}
          onClick={() => onDirectionChange('tree')}
        >
          <Icon name="panel-tree" size={14} />
          Tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'board'}
          className={`topbar-segment${direction === 'board' ? ' active' : ''}`}
          onClick={() => onDirectionChange('board')}
        >
          <Icon name="board-grid" size={14} />
          Board
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'agents'}
          className={`topbar-segment${direction === 'agents' ? ' active' : ''}`}
          onClick={() => onDirectionChange('agents')}
        >
          <Icon name="terminal" size={14} />
          Agents
        </button>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-sync">
        <span className={`topbar-sync-dot${connected ? ' connected' : ''}`} />
        {syncText(sync, now)}
      </div>

      <button type="button" className="topbar-icon-btn" title="Refresh" onClick={onRefresh}>
        <Icon name="refresh" size={15} />
      </button>
      <button
        type="button"
        className="topbar-icon-btn"
        title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={onThemeToggle}
      >
        <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
      </button>
      <button type="button" className="topbar-icon-btn" title="Settings" onClick={onOpenSettings}>
        <Icon name="settings" size={15} />
      </button>
    </header>
  )
}
