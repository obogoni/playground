import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { WorkspaceRegistry } from '../src/main/modules/WorkspaceRegistry.js';
import { tmpDir, rm } from './helpers.js';

describe('WorkspaceRegistry', () => {
  let root: string;
  beforeEach(async () => { root = await tmpDir(); });
  afterEach(async () => { await rm(root); });

  it('starts empty when no file exists', async () => {
    const reg = new WorkspaceRegistry(path.join(root, 'ws.json'));
    expect(await reg.list()).toEqual([]);
  });

  it('add → list round-trips', async () => {
    const file = path.join(root, 'ws.json');
    const reg = new WorkspaceRegistry(file);
    const target = path.join(root, 'projects');
    await fs.mkdir(target);
    const ws = await reg.add(target);
    expect(ws.path).toBe(path.resolve(target));
    expect(ws.displayName).toBe('projects');
    const list = await reg.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(ws.id);
  });

  it('persists across instances', async () => {
    const file = path.join(root, 'ws.json');
    const reg1 = new WorkspaceRegistry(file);
    await reg1.add(root);
    const reg2 = new WorkspaceRegistry(file);
    expect((await reg2.list())[0].path).toBe(path.resolve(root));
  });

  it('add is idempotent for the same path', async () => {
    const reg = new WorkspaceRegistry(path.join(root, 'ws.json'));
    const a = await reg.add(root);
    const b = await reg.add(root);
    expect(a.id).toBe(b.id);
    expect(await reg.list()).toHaveLength(1);
  });

  it('remove drops the entry and persists', async () => {
    const file = path.join(root, 'ws.json');
    const reg = new WorkspaceRegistry(file);
    const ws = await reg.add(root);
    await reg.remove(ws.id);
    expect(await reg.list()).toEqual([]);
    const fresh = new WorkspaceRegistry(file);
    expect(await fresh.list()).toEqual([]);
  });
});
