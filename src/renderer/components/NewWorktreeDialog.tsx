import React, { useState } from 'react';
import type { Repo } from '../../shared/types.js';

interface Props {
  repo: Repo;
  onCancel: () => void;
  onSubmit: (
    branch: string,
    opts: { newBranch: boolean; baseBranch?: string }
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export const NewWorktreeDialog: React.FC<Props> = ({ repo, onCancel, onSubmit }) => {
  const [branch, setBranch] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [newBranch, setNewBranch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!branch.trim()) {
      setError('Branch name is required.');
      return;
    }
    setBusy(true);
    const res = await onSubmit(branch.trim(), {
      newBranch,
      baseBranch: baseBranch.trim() || undefined
    });
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <h2>New worktree in {repo.name}</h2>
        <label>Branch name</label>
        <input
          type="text"
          autoFocus
          value={branch}
          onChange={e => setBranch(e.target.value)}
          placeholder="feature/new-thing"
        />
        <label style={{ marginTop: 14 }}>
          <input type="checkbox" checked={newBranch} onChange={e => setNewBranch(e.target.checked)} />
          {' '}Create new branch (uncheck to checkout an existing branch)
        </label>
        {newBranch && (
          <>
            <label>Base branch (defaults to HEAD)</label>
            <input
              type="text"
              value={baseBranch}
              onChange={e => setBaseBranch(e.target.value)}
              placeholder="main"
            />
          </>
        )}
        {error && <div className="error">{error}</div>}
        <div className="actions">
          <button className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
};
