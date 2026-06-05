import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Workspace } from '../../shared/types.js';

interface PersistedShape {
  workspaces: Workspace[];
}

export class WorkspaceRegistry {
  private workspaces: Workspace[] = [];
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private hashId(p: string): string {
    return crypto.createHash('sha1').update(path.resolve(p).toLowerCase()).digest('hex').slice(0, 12);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    try {
      const buf = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(buf) as PersistedShape;
      this.workspaces = Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      this.workspaces = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ workspaces: this.workspaces }, null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  async list(): Promise<Workspace[]> {
    await this.load();
    return [...this.workspaces];
  }

  async get(id: string): Promise<Workspace | undefined> {
    await this.load();
    return this.workspaces.find(w => w.id === id);
  }

  async add(p: string, displayName?: string): Promise<Workspace> {
    await this.load();
    const abs = path.resolve(p);
    const id = this.hashId(abs);
    const existing = this.workspaces.find(w => w.id === id);
    if (existing) return existing;
    const ws: Workspace = { id, path: abs, displayName: displayName ?? path.basename(abs) };
    this.workspaces.push(ws);
    await this.persist();
    return ws;
  }

  async remove(id: string): Promise<void> {
    await this.load();
    const before = this.workspaces.length;
    this.workspaces = this.workspaces.filter(w => w.id !== id);
    if (this.workspaces.length !== before) await this.persist();
  }
}
