import type { JSX } from 'react'
import type { AppConfig } from '../../../shared/config'
import { Icon } from './Icon'
import './TopBar.css'

type Theme = AppConfig['ui']['theme']
type Direction = AppConfig['ui']['direction']

interface TopBarProps {
  theme: Theme
  direction: Direction
  onThemeToggle: () => void
  onDirectionChange: (direction: Direction) => void
  onRefresh: () => void
}

export function TopBar({
  theme,
  direction,
  onThemeToggle,
  onDirectionChange,
  onRefresh
}: TopBarProps): JSX.Element {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <div className="topbar-brand-tile">
          <Icon name="git-branch" size={17} strokeWidth={2} />
        </div>
        <div className="topbar-brand-labels">
          <span className="topbar-brand-name">Playground</span>
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
      </div>

      <div className="topbar-spacer" />

      <div className="topbar-sync">
        <span className="topbar-sync-dot" />
        az · not connected
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
    </header>
  )
}
