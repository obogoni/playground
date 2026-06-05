import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Repo } from '../../shared/types.js';

const IGNORE = new Set(['node_modules', '.git', '.app', '.vscode', '.idea', 'out', 'dist', 'build', '.next', '.cache']);

export class RepoScanner {
  /**
   * Discover git repos directly inside the workspace (single-level scan).
   * A directory is a repo if it contains a `.git` entry (file or dir — supports worktrees).
   * Returns stable, alphabetically-sorted results.
   */
  async scan(workspaceId: string, workspacePath: string): Promise<Repo[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(workspacePath, { withFileTypes: true });
    } catch (err: any) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
      throw err;
    }

    const repos: Repo[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORE.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;
      const childPath = path.join(workspacePath, entry.name);
      const gitPath = path.join(childPath, '.git');
      try {
        await fs.stat(gitPath); // file or dir both fine
        repos.push({ workspaceId, name: entry.name, path: childPath });
      } catch {
        // not a repo
      }
    }
    repos.sort((a, b) => a.name.localeCompare(b.name));
    return repos;
  }
}
