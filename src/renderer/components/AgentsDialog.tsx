import React, { useCallback, useEffect, useState } from 'react';
import type { SimpleAgent, VarDef, AgentWarning } from '../../shared/types.js';

interface Props {
  workspaceId: string | null;
  workspaceName: string | null;
  onClose: () => void;
  onError: (msg: string) => void;
}

const blankAgent = (workspaceId: string | null): SimpleAgent => ({
  id: '',
  name: 'New Agent',
  scope: 'global',
  command: 'claude',
  args: [],
  promptTemplate: '',
  vars: [],
  workspaceId: workspaceId ?? undefined
});

export const AgentsDialog: React.FC<Props> = ({ workspaceId, workspaceName, onClose, onError }) => {
  const [agents, setAgents] = useState<SimpleAgent[]>([]);
  const [editing, setEditing] = useState<SimpleAgent | null>(null);
  const [warnings, setWarnings] = useState<AgentWarning[]>([]);

  const refresh = useCallback(async () => {
    setAgents(await window.api.agents.listFor(workspaceId));
    setWarnings(await window.api.agents.warnings());
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onSave = async () => {
    if (!editing) return;
    if (editing.scope === 'workspace' && !workspaceId) {
      onError('Select a worktree in a workspace before saving a workspace-scoped agent.');
      return;
    }
    try {
      await window.api.agents.save({ ...editing, workspaceId: editing.scope === 'workspace' ? workspaceId! : undefined });
      setEditing(null);
      await refresh();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const onDelete = async (a: SimpleAgent) => {
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    try {
      await window.api.agents.delete(a.id, a.scope, a.workspaceId);
      await refresh();
    } catch (err: any) {
      onError(err.message);
    }
  };

  const updateVar = (idx: number, patch: Partial<VarDef>) => {
    if (!editing) return;
    const vars = [...editing.vars];
    vars[idx] = { ...vars[idx], ...patch };
    setEditing({ ...editing, vars });
  };

  const addVar = () => {
    if (!editing) return;
    setEditing({ ...editing, vars: [...editing.vars, { key: '', label: '', required: false }] });
  };

  const removeVar = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, vars: editing.vars.filter((_, i) => i !== idx) });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" style={{ minWidth: 640 }} onMouseDown={e => e.stopPropagation()}>
        <h2>Agents{workspaceName ? ` · ${workspaceName}` : ''}</h2>
        {!editing && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#aaa', fontSize: 12 }}>
                {agents.length} agent{agents.length === 1 ? '' : 's'} visible
                {workspaceName ? ' (global + this workspace)' : ' (global only — select a worktree to see workspace-scoped agents)'}
              </span>
              <button
                style={{ background: '#0e639c', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 2 }}
                onClick={() => setEditing(blankAgent(workspaceId))}
              >
                + New agent
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#aaa', fontSize: 11 }}>
                  <th style={{ padding: 4 }}>Name</th>
                  <th style={{ padding: 4 }}>Scope</th>
                  <th style={{ padding: 4 }}>Command</th>
                  <th style={{ padding: 4 }} />
                </tr>
              </thead>
              <tbody>
                {agents.map(a => (
                  <tr key={`${a.scope}:${a.id}`} style={{ borderTop: '1px solid #333' }}>
                    <td style={{ padding: 4 }}>{a.name}</td>
                    <td style={{ padding: 4, color: '#aaa' }}>{a.scope}</td>
                    <td style={{ padding: 4, color: '#aaa', fontFamily: 'monospace' }}>{a.command}</td>
                    <td style={{ padding: 4, textAlign: 'right' }}>
                      <button onClick={() => setEditing(a)} style={btnStyle}>Edit</button>
                      <button onClick={() => onDelete(a)} style={{ ...btnStyle, marginLeft: 6 }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {warnings.length > 0 && (
              <div className="warn" style={{ marginTop: 12 }}>
                <strong>Warnings:</strong>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i}><code>{w.file}</code>: {w.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="actions">
              <button className="secondary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
        {editing && (
          <>
            <label>Name</label>
            <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            <div className="row">
              <div>
                <label>Scope</label>
                <select
                  value={editing.scope}
                  onChange={e => setEditing({ ...editing, scope: e.target.value as 'global' | 'workspace' })}
                >
                  <option value="global">global</option>
                  <option value="workspace" disabled={!workspaceId}>
                    workspace {workspaceName ? `(${workspaceName})` : '(select a worktree first)'}
                  </option>
                </select>
              </div>
              <div>
                <label>Command</label>
                <input
                  type="text"
                  value={editing.command}
                  onChange={e => setEditing({ ...editing, command: e.target.value })}
                />
              </div>
            </div>
            <label>Args (one per line)</label>
            <textarea
              value={editing.args.join('\n')}
              onChange={e =>
                setEditing({
                  ...editing,
                  args: e.target.value.split('\n').map(s => s).filter(s => s.length > 0)
                })
              }
              placeholder="--print&#10;{{PROMPT}}"
            />
            <label>Prompt template</label>
            <textarea
              value={editing.promptTemplate}
              onChange={e => setEditing({ ...editing, promptTemplate: e.target.value })}
              placeholder="Implement the task described in {{TASK_ID}}…"
            />
            <label style={{ marginTop: 16 }}>Variables</label>
            {editing.vars.map((v, idx) => (
              <div key={idx} className="row" style={{ alignItems: 'flex-end', marginTop: 6 }}>
                <div>
                  <label>Key</label>
                  <input type="text" value={v.key} onChange={e => updateVar(idx, { key: e.target.value })} />
                </div>
                <div>
                  <label>Label</label>
                  <input type="text" value={v.label} onChange={e => updateVar(idx, { label: e.target.value })} />
                </div>
                <div>
                  <label>Default</label>
                  <input type="text" value={v.default ?? ''} onChange={e => updateVar(idx, { default: e.target.value })} />
                </div>
                <div style={{ maxWidth: 90 }}>
                  <label>Required</label>
                  <input
                    type="checkbox"
                    checked={v.required}
                    onChange={e => updateVar(idx, { required: e.target.checked })}
                  />
                </div>
                <button style={btnStyle} onClick={() => removeVar(idx)}>Remove</button>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button style={btnStyle} onClick={addVar}>+ Add variable</button>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button onClick={onSave}>Save</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: '#3a3d41',
  border: 'none',
  color: '#ccc',
  padding: '3px 8px',
  borderRadius: 2,
  cursor: 'pointer',
  fontSize: 12
};
