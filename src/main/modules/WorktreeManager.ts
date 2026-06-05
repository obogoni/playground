import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { Worktree } from '../../shared/types.js';

const pexec = promisify(execFile);

export interface CreateOptions {
  newBranch?: boolean;
  baseBranch?: string;
}

export interface RemoveOptions {
  force?: boolean;
}

export class WorktreeManager {
  async list(repoPath: string): Promise<Worktree[]> {
    const { stdout } = await pexec('git', ['-C', repoPath, 'worktree', 'list', '--porcelain'], {
      maxBuffer: 8 * 1024 * 1024
    });
    return this.parsePorcelain(stdout);
  }

  parsePorcelain(out: string): Worktree[] {
    const results: Worktree[] = [];
    let cur: Partial<Worktree> = {};
    const flush = () => {
      if (cur.path) {
        results.push({
          repoPath: '',
          path: path.normalize(cur.path),
          branch: cur.branch ?? '(detached)'
        });
      }
      cur = {};
    };
    for (const rawLine of out.split(/\r?\n/)) {
      const line = rawLine.trimEnd();
      if (line === '') {
        flush();
        continue;
      }
      if (line.startsWith('worktree ')) {
        cur.path = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length);
        cur.branch = ref.replace(/^refs\/heads\//, '');
      } else if (line === 'detached') {
        cur.branch = '(detached)';
      }
    }
    flush();
    return results;
  }

  /**
   * Sanitize a branch name into a filesystem-safe folder suffix.
   * Replace `/`, `\`, and any char outside [A-Za-z0-9._-] with `-`, collapse runs, trim.
   */
  sanitizeBranch(branch: string): string {
    return branch
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Deterministic sibling path: `<parent-of-repo>/<repo-name>-<sanitized-branch>`.
   */
  pathFor(repoPath: string, branch: string): string {
    const repoName = path.basename(repoPath);
    const parent = path.dirname(repoPath);
    const suffix = this.sanitizeBranch(branch);
    return path.join(parent, `${repoName}-${suffix}`);
  }

  async create(repoPath: string, branch: string, opts: CreateOptions = {}): Promise<Worktree> {
    const targetPath = this.pathFor(repoPath, branch);
    const args = ['-C', repoPath, 'worktree', 'add'];
    if (opts.newBranch) {
      args.push('-b', branch, targetPath, opts.baseBranch ?? 'HEAD');
    } else {
      args.push(targetPath, branch);
    }
    try {
      await pexec('git', args);
    } catch (err: any) {
      const msg = (err.stderr ?? err.message ?? '').toString().trim();
      throw new Error(`git worktree add failed: ${msg || err.message}`);
    }
    return { repoPath, branch, path: targetPath };
  }

  async isDirty(worktreePath: string): Promise<boolean> {
    const { stdout } = await pexec('git', ['-C', worktreePath, 'status', '--porcelain']);
    return stdout.trim().length > 0;
  }

  async remove(repoPath: string, worktreePath: string, opts: RemoveOptions = {}): Promise<void> {
    if (!opts.force) {
      let dirty = false;
      try {
        dirty = await this.isDirty(worktreePath);
      } catch {
        // if we can't check, assume clean and let git decide
      }
      if (dirty) {
        throw new Error(
          `Worktree at ${worktreePath} has uncommitted changes. Commit or discard them before deleting.`
        );
      }
    }
    const args = ['-C', repoPath, 'worktree', 'remove'];
    if (opts.force) args.push('--force');
    args.push(worktreePath);
    try {
      await pexec('git', args);
    } catch (err: any) {
      const msg = (err.stderr ?? err.message ?? '').toString().trim();
      throw new Error(`git worktree remove failed: ${msg || err.message}`);
    }
  }
}
