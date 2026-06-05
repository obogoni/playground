import React, { useEffect, useState } from 'react';
import type { Workspace, Repo, Worktree, SimpleAgent } from '../../shared/types.js';
import type { PaneState } from '../App.js';
import { Terminal } from './Terminal.js';
import { AgentLaunchDialog } from './AgentLaunchDialog.js';

interface Props {
  ws: Workspace;
  repo: Repo;
  worktree: Worktree;
  pane: PaneState;
  agents: SimpleAgent[];
  onLaunchPwsh: () => void;
  onLaunchAgent: (agent: SimpleAgent, vars: Record<string, string>) => void;
  onCloseTab: (tabId: string) => void;
  onActivateTab: (tabId: string) => void;
  onShortcut: (kind: 'explorer' | 'terminal' | 'vscode') => void;
}

export const WorktreePane: React.FC<Props> = ({
  ws,
  repo,
  worktree,
  pane,
  agents,
  onLaunchPwsh,
  onLaunchAgent,
  onCloseTab,
  onActivateTab,
  onShortcut
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAgent, setPendingAgent] = useState<SimpleAgent | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (_e: MouseEvent) => setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div className="pane-area">
      <div className="pane-header">
        <div className="title" title={worktree.path}>
          {repo.name} <span style={{ color: '#888' }}>·</span> {worktree.branch}
        </div>
        <button onClick={() => onShortcut('explorer')}>Explorer</button>
        <button onClick={() => onShortcut('terminal')}>Terminal</button>
        <button onClick={() => onShortcut('vscode')}>VS Code</button>
      </div>
      <div className="tab-strip">
        {pane.tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab${pane.activeTabId === tab.id ? ' active' : ''}`}
            onClick={() => onActivateTab(tab.id)}
          >
            <span>{tab.label}{tab.ptyId ? '' : '…'}</span>
            <button
              className="close"
              onClick={e => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ position: 'relative' }}>
          <button
            className="tab-new"
            title="New tab"
            onClick={e => {
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
          >
            +
          </button>
          {menuOpen && (
            <div className="tab-menu" style={{ top: 30, left: 0 }} onMouseDown={e => e.stopPropagation()}>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLaunchPwsh();
                }}
              >
                pwsh
              </button>
              {agents.length === 0 && (
                <div style={{ padding: '6px 12px', color: '#888', fontSize: 11 }}>No agents saved</div>
              )}
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setMenuOpen(false);
                    if (agent.vars.length > 0) setPendingAgent(agent);
                    else onLaunchAgent(agent, {});
                  }}
                >
                  {agent.name}
                  <span style={{ color: '#888', marginLeft: 6, fontSize: 11 }}>
                    {agent.scope === 'workspace' ? '· workspace' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {pane.tabs.length === 0 && (
          <div className="pane-empty">No tabs. Click + to open pwsh or an agent.</div>
        )}
        {pane.tabs.map(tab => (
          <Terminal key={tab.key} ptyId={tab.ptyId} visible={pane.activeTabId === tab.id} />
        ))}
      </div>
      {pendingAgent && (
        <AgentLaunchDialog
          agent={pendingAgent}
          onCancel={() => setPendingAgent(null)}
          onLaunch={vars => {
            onLaunchAgent(pendingAgent, vars);
            setPendingAgent(null);
          }}
        />
      )}
    </div>
  );
};
