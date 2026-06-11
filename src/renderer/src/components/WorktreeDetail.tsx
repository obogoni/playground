import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { ShortcutTool } from '../../../shared/shortcuts'
import type { WorktreeNode } from '../../../shared/tree'
import { api } from '../lib/api'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import './WorktreeDetail.css'

interface WorktreeDetailProps {
  workspaceName: string
  repoName: string
  worktree: WorktreeNode
  onToast: (message: string) => void
}

/** §1b launcher cards: tile color + label + mono command per tool. */
const LAUNCHERS: {
  tool: ShortcutTool
  label: string
  command: string
  icon: IconName
  tile: string
}[] = [
  {
    tool: 'explorer',
    label: 'File Explorer',
    command: 'explorer.exe',
    icon: 'folder',
    tile: 'blue'
  },
  {
    tool: 'terminal',
    label: 'Windows Terminal',
    command: 'wt.exe',
    icon: 'terminal',
    tile: 'green'
  },
  { tool: 'vscode', label: 'VS Code', command: 'code', icon: 'code', tile: 'accent' }
]

export function WorktreeDetail({
  workspaceName,
  repoName,
  worktree,
  onToast
}: WorktreeDetailProps): JSX.Element {
  // App keys this component by worktree id, so selection change remounts it:
  // copy feedback resets and the §1b fadeIn entrance replays for free.
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  const copyPath = (): void => {
    navigator.clipboard
      .writeText(worktree.path)
      .then(() => setCopied(true))
      .catch(console.error)
  }

  const launch = (tool: ShortcutTool): void => {
    api
      .invoke('shortcuts:launch', { tool, path: worktree.path })
      .then((result) => {
        if (!result.ok) onToast(result.error ?? 'Launch failed')
      })
      .catch((err) => onToast(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="detail">
      <div className="detail-inner">
        <nav className="detail-breadcrumb">
          {workspaceName} / <span className="detail-breadcrumb-repo">{repoName}</span>
        </nav>
        <h1 className="detail-title">{worktree.branch}</h1>
        <div className="detail-status-row">
          {worktree.dirty ? (
            <span className="detail-pill amber">
              <span className="detail-pill-dot" />
              {worktree.changes} uncommitted change{worktree.changes === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="detail-pill green">
              <span className="detail-pill-dot" />
              Working tree clean
            </span>
          )}
          {worktree.isDefault && <span className="detail-pill neutral">primary</span>}
        </div>

        <section className="detail-section">
          <h2 className="detail-section-label">Location</h2>
          <div className="detail-location">
            <span className="detail-location-path">{worktree.path}</span>
            <button type="button" className="detail-copy-btn" title="Copy path" onClick={copyPath}>
              <Icon name={copied ? 'check' : 'copy'} size={14} />
            </button>
          </div>
        </section>

        <section className="detail-section">
          <h2 className="detail-section-label">Open with</h2>
          <div className="detail-openwith">
            {LAUNCHERS.map((launcher) => (
              <button
                key={launcher.tool}
                type="button"
                className="detail-launcher"
                onClick={() => launch(launcher.tool)}
              >
                <span className={`detail-launcher-tile ${launcher.tile}`}>
                  <Icon name={launcher.icon} size={17} />
                </span>
                <span className="detail-launcher-label">{launcher.label}</span>
                <span className="detail-launcher-command">{launcher.command}</span>
              </button>
            ))}
          </div>
        </section>
        {/* M2 adds the danger section here; M3 the linked-task card above
            Location — §1b section order preserved. */}
      </div>
    </div>
  )
}

export function WorktreeDetailEmpty(): JSX.Element {
  return (
    <div className="detail">
      <div className="detail-empty">Select a worktree in the sidebar to inspect it.</div>
    </div>
  )
}
