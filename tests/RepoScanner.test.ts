import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { RepoScanner } from '../src/main/modules/RepoScanner.js';
import { tmpDir, rm, initRepo } from './helpers.js';

describe('RepoScanner', () => {
  let root: string;
  beforeEach(async () => { root = await tmpDir(); });
  afterEach(async () => { await rm(root); });

  it('returns empty list for a missing directory', async () => {
    const scanner = new RepoScanner();
    expect(await scanner.scan('ws1', path.join(root, 'does-not-exist'))).toEqual([]);
  });

  it('returns empty list for a workspace containing no repos', async () => {
    const scanner = new RepoScanner();
    await fs.mkdir(path.join(root, 'foo'));
    await fs.mkdir(path.join(root, 'bar'));
    expect(await scanner.scan('ws1', root)).toEqual([]);
  });

  it('discovers single-level git repos and ignores nested ones', async () => {
    const scanner = new RepoScanner();
    await initRepo(path.join(root, 'alpha'));
    await initRepo(path.join(root, 'beta'));
    // nested repo (should NOT show up — single-level)
    await initRepo(path.join(root, 'alpha', 'inner'));
    // node_modules with a fake repo inside (should be ignored)
    await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await fs.writeFile(path.join(root, 'node_modules', 'pkg', '.git'), 'gitdir: x');
    const repos = await scanner.scan('ws1', root);
    expect(repos.map(r => r.name)).toEqual(['alpha', 'beta']);
    expect(repos[0].workspaceId).toBe('ws1');
  });

  it('orders results alphabetically', async () => {
    const scanner = new RepoScanner();
    await initRepo(path.join(root, 'zeta'));
    await initRepo(path.join(root, 'alpha'));
    await initRepo(path.join(root, 'mu'));
    const names = (await scanner.scan('ws1', root)).map(r => r.name);
    expect(names).toEqual(['alpha', 'mu', 'zeta']);
  });
});
