import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { WorktreeManager } from '../src/main/modules/WorktreeManager.js';
import { tmpDir, rm, initRepo, git } from './helpers.js';

describe('WorktreeManager', () => {
  let root: string;
  let repo: string;
  const mgr = new WorktreeManager();

  beforeEach(async () => {
    root = await tmpDir();
    repo = path.join(root, 'repo');
    await initRepo(repo);
  });
  afterEach(async () => { await rm(root); });

  describe('sanitizeBranch', () => {
    it('replaces path separators and special chars with -', () => {
      expect(mgr.sanitizeBranch('feature/new-thing')).toBe('feature-new-thing');
      expect(mgr.sanitizeBranch('hot fix')).toBe('hot-fix');
      expect(mgr.sanitizeBranch('user@special#stuff!')).toBe('user-special-stuff');
    });
    it('collapses runs and trims', () => {
      expect(mgr.sanitizeBranch('---a/b//c---')).toBe('a-b-c');
    });
    it('preserves allowed chars', () => {
      expect(mgr.sanitizeBranch('v1.2.3_rc-1')).toBe('v1.2.3_rc-1');
    });
  });

  describe('pathFor', () => {
    it('is deterministic and sibling-located', () => {
      const a = mgr.pathFor(repo, 'feature/x');
      const b = mgr.pathFor(repo, 'feature/x');
      expect(a).toBe(b);
      expect(a).toBe(path.join(root, 'repo-feature-x'));
    });
  });

  describe('parsePorcelain', () => {
    it('parses a typical multi-entry porcelain output', () => {
      const out = [
        'worktree /a/repo',
        'HEAD abc',
        'branch refs/heads/main',
        '',
        'worktree /a/repo-feature',
        'HEAD def',
        'branch refs/heads/feature/x',
        '',
        'worktree /a/repo-detached',
        'HEAD def',
        'detached',
        ''
      ].join('\n');
      const wts = mgr.parsePorcelain(out);
      expect(wts).toHaveLength(3);
      expect(wts[0].path).toBe(path.normalize('/a/repo'));
      expect(wts[0].branch).toBe('main');
      expect(wts[1].branch).toBe('feature/x');
      expect(wts[2].branch).toBe('(detached)');
    });
  });

  describe('list', () => {
    it('returns the main worktree of a fresh repo', async () => {
      const wts = await mgr.list(repo);
      expect(wts).toHaveLength(1);
      expect(wts[0].branch).toBe('main');
    });
  });

  describe('create', () => {
    it('creates a worktree with a new branch from HEAD', async () => {
      const wt = await mgr.create(repo, 'feature/x', { newBranch: true });
      expect(wt.path).toBe(path.join(root, 'repo-feature-x'));
      const wts = await mgr.list(repo);
      expect(wts.map(w => w.branch).sort()).toEqual(['feature/x', 'main']);
    });

    it('creates a worktree from an existing branch', async () => {
      await git(['branch', 'existing'], repo);
      const wt = await mgr.create(repo, 'existing', { newBranch: false });
      expect(wt.path).toBe(path.join(root, 'repo-existing'));
    });

    it('rejects when target path already exists with content', async () => {
      const target = mgr.pathFor(repo, 'busy');
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, 'x'), 'hi');
      await expect(mgr.create(repo, 'busy', { newBranch: true })).rejects.toThrow(/git worktree add failed/);
    });
  });

  describe('remove', () => {
    it('removes a clean worktree', async () => {
      const wt = await mgr.create(repo, 'feature/y', { newBranch: true });
      await mgr.remove(repo, wt.path);
      const wts = await mgr.list(repo);
      expect(wts.map(w => w.branch)).toEqual(['main']);
    });

    it('refuses to remove a dirty worktree', async () => {
      const wt = await mgr.create(repo, 'feature/z', { newBranch: true });
      await fs.writeFile(path.join(wt.path, 'dirty.txt'), 'x');
      await expect(mgr.remove(repo, wt.path)).rejects.toThrow(/uncommitted changes/);
      const wts = await mgr.list(repo);
      expect(wts.some(w => w.path === wt.path)).toBe(true);
    });

    it('force-removes a dirty worktree when force=true', async () => {
      const wt = await mgr.create(repo, 'feature/w', { newBranch: true });
      await fs.writeFile(path.join(wt.path, 'dirty.txt'), 'x');
      await mgr.remove(repo, wt.path, { force: true });
      const wts = await mgr.list(repo);
      expect(wts.some(w => w.path === wt.path)).toBe(false);
    });
  });
});
