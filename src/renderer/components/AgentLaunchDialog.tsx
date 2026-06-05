import React, { useState } from 'react';
import type { SimpleAgent } from '../../shared/types.js';

interface Props {
  agent: SimpleAgent;
  onCancel: () => void;
  onLaunch: (vars: Record<string, string>) => void;
}

export const AgentLaunchDialog: React.FC<Props> = ({ agent, onCancel, onLaunch }) => {
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of agent.vars) init[v.key] = v.default ?? '';
    return init;
  });
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const missing = agent.vars
      .filter(v => v.required && !vars[v.key]?.trim())
      .map(v => v.label || v.key);
    if (missing.length > 0) {
      setError(`Missing: ${missing.join(', ')}`);
      return;
    }
    onLaunch(vars);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <h2>Launch {agent.name}</h2>
        {agent.vars.map(v => (
          <div key={v.key}>
            <label>
              {v.label || v.key} {v.required && <span style={{ color: '#f48771' }}>*</span>}
            </label>
            <input
              type="text"
              value={vars[v.key] ?? ''}
              onChange={e => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
            />
          </div>
        ))}
        {error && <div className="error">{error}</div>}
        <div className="actions">
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button onClick={submit}>Launch</button>
        </div>
      </div>
    </div>
  );
};
