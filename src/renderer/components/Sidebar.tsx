import React, { useCallback, useState } from 'react';
import type { Workspace, Repo, Worktree } from '../../shared/types.js';

interface Props {
  workspaces: Workspace[];
  reposByWs: Record<string, Repo[]>;
  worktreesByRepo: Record<string, Worktree[]>;
  selectedWorktreePath: string | null;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (ws: Workspace) => void;
  onExpandWorkspace: (ws: Workspace) => Promise<Repo[]>;
  onExpandRepo: (repo: Repo) => Promise<Worktree[]>;
  onSelectWorktree: (ws: Workspace, repo: Repo, wt: Worktree) => void;
  onNewWorktree: (ws: Workspace, repo: Repo) => void;
  onDeleteWorktree: (ws: Workspace, repo: Repo, wt: Worktree) => void;
  onOpenAgents: () => void;
}

export const Sidebar: React.FC<Props> = ({
  workspaces,
  reposByWs,
  worktreesByRepo,
  selectedWorktreePath,
  onAddWorkspace,
  onRemoveWorkspace,
  onExpandWorkspace,
  onExpandRepo,
  onSelectWorktree,
  onNewWorktree,
  onDeleteWorktree,
  onOpenAgents
}) => {
  const [expandedWs, setExpandedWs] = useState<Set<string>>(new Set());
  const [expandedRepo, setExpandedRepo] = useState<Set<string>>(new Set());

  const toggleWs = useCallback(
    async (ws: Workspace) => {
      const next = new Set(expandedWs);
      if (next.has(ws.id)) {
        next.delete(ws.id);
      } else {
        next.add(ws.id);
        if (!reposByWs[ws.id]) await onExpandWorkspace(ws);
      }
      setExpandedWs(next);
    },
    [expandedWs, reposByWs, onExpandWorkspace]
  );

  const toggleRepo = useCallback(
    async (repo: Repo) => {
      const next = new Set(expandedRepo);
      if (next.has(repo.path)) {
        next.delete(repo.path);
      } else {
        next.add(repo.path);
        if (!worktreesByRepo[repo.path]) await onExpandRepo(repo);
      }
      setExpandedRepo(next);
    },
    [expandedRepo, worktreesByRepo, onExpandRepo]
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span>Workspaces</span>
        <span style={{ display: 'flex', gap: 4 }}>
          <button onClick={onOpenAgents} title="Manage agents">Agents</button>
          <button onClick={onAddWorkspace} title="Add a workspace folder">+ Add</button>
        </span>
      </div>
      <div className="sidebar-tree">
        {workspaces.length === 0 && (
          <div style={{ padding: '12px 14px', color: '#888', fontSize: 12 }}>
            No workspaces yet. Click <strong>+ Add</strong> to register a folder.
          </div>
        )}
        {workspaces.map(ws => {
          const expanded = expandedWs.has(ws.id);
          const repos = reposByWs[ws.id] ?? [];
          return (
            <div key={ws.id}>
              <div className="tree-row" onClick={() => toggleWs(ws)}>
                <span className="twisty">{expanded ? '▾' : '▸'}</span>
                <span className="icon">📁</span>
                <span className="label" title={ws.path}>{ws.displayName}</span>
                <span className="actions" onClick={e => e.stopPropagation()}>
                  <button title="Remove from sidebar" onClick={() => onRemoveWorkspace(ws)}>×</button>
                </span>
              </div>
              {expanded && repos.length === 0 && (
                <div className="indent-1" style={{ color: '#888', fontSize: 11, padding: '2px 6px' }}>
                  No git repos found.
                </div>
              )}
              {expanded &&
                repos.map(repo => {
                  const repoExp = expandedRepo.has(repo.path);
                  const wts = worktreesByRepo[repo.path] ?? [];
                  return (
                    <div key={repo.path}>
                      <div className="tree-row indent-1" onClick={() => toggleRepo(repo)}>
                        <span className="twisty">{repoExp ? '▾' : '▸'}</span>
                        <span className="icon">📦</span>
                        <span className="label" title={repo.path}>{repo.name}</span>
                        <span className="actions" onClick={e => e.stopPropagation()}>
                          <button title="New worktree" onClick={() => onNewWorktree(ws, repo)}>+</button>
                        </span>
                      </div>
                      {repoExp &&
                        wts.map(wt => {
                          const selected = selectedWorktreePath === wt.path;
                          return (
                            <div
                              key={wt.path}
                              className={`tree-row indent-2${selected ? ' selected' : ''}`}
                              onClick={() => onSelectWorktree(ws, repo, wt)}
                            >
                              <span className="twisty" />
                              <span className="icon">🌿</span>
                              <span className="label" title={wt.path}>{wt.branch}</span>
                              <span className="actions" onClick={e => e.stopPropagation()}>
                                <button title="Delete worktree" onClick={() => onDeleteWorktree(ws, repo, wt)}>
                                  ×
                                </button>
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
