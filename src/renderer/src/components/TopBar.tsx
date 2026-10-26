import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { AppConfig } from '../../../shared/config'
import type { GhStatus } from '../../../shared/files'
import type { AdoAuthState } from '../../../shared/tasks'
import { api } from '../lib/api'
import { relativeTime } from '../lib/relative-time'
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
  /**
   * The `gh` CLI's state (FPRG-02..04); null until main answers. No chip on
   * null or `no-github-remote`.
   */
  gh: GhStatus | null
  onThemeToggle: () => void
  onDirectionChange: (direction: Direction) => void
  onRefresh: () => void
  onOpenSettings: () => void
}

function syncText(sync: SyncStatus, now: number): string {
  if (sync.auth === 'failed') return 'az · not signed in'
  if (sync.auth === 'ok' && sync.lastSyncAt !== null) {
    return `az · ${sync.org ?? 'ado'} · synced ${relativeTime(sync.lastSyncAt, now)}`
  }
  return 'az · not connected'
}

/** GitHub CLI's install page, opened through main's https-only opener (FPRG-03). */
const GH_INSTALL_URL = 'https://cli.github.com'

const GH_TEXT: Record<Exclude<GhStatus, 'no-github-remote'>, string> = {
  ok: 'gh · signed in',
  'not-signed-in': 'gh · not signed in',
  'not-installed': 'gh · not installed'
}

/**
 * The `gh` chip beside `az` (FPRG-02..04), shown only while a registered
 * repository has a GitHub remote. Its two failures need two fixes, so each
 * reads differently and names its own: the install page, opened by main and
 * never by the window-open handler, or `gh auth login`.
 */
function GhChip({ status }: { status: GhStatus | null }): JSX.Element | null {
  if (status === null || status === 'no-github-remote') return null
  const openInstall = (): void => {
    api
      .invoke('pr:open-link', { href: GH_INSTALL_URL })
      .then((result) => {
        if (!result.ok) console.error(result.error)
      })
      .catch(console.error)
  }
  return (
    <div className={`topbar-gh ${status}`} data-gh-status={status}>
      <span className="topbar-gh-dot" />
      {GH_TEXT[status]}
      {status === 'not-installed' && (
        <button
          type="button"
          className="topbar-gh-link"
          title={`Open ${GH_INSTALL_URL} in the browser`}
          onClick={openInstall}
        >
          Install
        </button>
      )}
      {status === 'not-signed-in' && (
        <span className="topbar-gh-hint">
          run <code>gh auth login</code>
        </span>
      )}
    </div>
  )
}

export function TopBar({
  theme,
  direction,
  sync,
  gh,
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
          aria-selected={direction === 'agents'}
          className={`topbar-segment${direction === 'agents' ? ' active' : ''}`}
          onClick={() => onDirectionChange('agents')}
        >
          <Icon name="terminal" size={14} />
          Agents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'files'}
          className={`topbar-segment${direction === 'files' ? ' active' : ''}`}
          onClick={() => onDirectionChange('files')}
        >
          <Icon name="file" size={14} />
          Files
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'workflows'}
          className={`topbar-segment${direction === 'workflows' ? ' active' : ''}`}
          onClick={() => onDirectionChange('workflows')}
        >
          <Icon name="workflow-nodes" size={14} />
          Workflows
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === 'hours'}
          className={`topbar-segment${direction === 'hours' ? ' active' : ''}`}
          onClick={() => onDirectionChange('hours')}
        >
          <Icon name="clock" size={14} />
          Hours
        </button>
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-sync">
        <span className={`topbar-sync-dot${connected ? ' connected' : ''}`} />
        {syncText(sync, now)}
      </div>
      <GhChip status={gh} />

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
