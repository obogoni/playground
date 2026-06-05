import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AgentLibrary } from '../src/main/modules/AgentLibrary.js';
import type { Workspace, SimpleAgent } from '../src/shared/types.js';
import { tmpDir, rm } from './helpers.js';

const mkAgent = (overrides: Partial<SimpleAgent> = {}): SimpleAgent => ({
  id: '',
  name: 'A',
  scope: 'global',
  command: 'claude',
  args: [],
  promptTemplate: '',
  vars: [],
  ...overrides
});

describe('AgentLibrary', () => {
  let root: string;
  let globalFile: string;
  let lib: AgentLibrary;
  let ws: Workspace;

  beforeEach(async () => {
    root = await tmpDir();
    globalFile = path.join(root, 'agents.json');
    lib = new AgentLibrary(globalFile);
    const wsPath = path.join(root, 'ws');
    await fs.mkdir(wsPath);
    ws = { id: 'ws1', path: wsPath, displayName: 'ws' };
  });
  afterEach(async () => { await rm(root); });

  describe('save / list (global)', () => {
    it('round-trips a saved agent through disk', async () => {
      const saved = await lib.save(mkAgent({ name: 'echo', promptTemplate: 'hello {{NAME}}' }));
      expect(saved.id).toBeTruthy();
      const fresh = new AgentLibrary(globalFile);
      const list = await fresh.listFor();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('echo');
    });

    it('updates in place when id matches', async () => {
      const a = await lib.save(mkAgent({ name: 'first' }));
      await lib.save({ ...a, name: 'renamed' });
      const list = await lib.listFor();
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe('renamed');
    });

    it('delete removes a global agent', async () => {
      const a = await lib.save(mkAgent({ name: 'gone' }));
      await lib.delete(a.id, 'global');
      expect(await lib.listFor()).toEqual([]);
    });
  });

  describe('workspace scope', () => {
    it('save with scope=workspace writes .app/agents/<id>.yaml', async () => {
      const a = await lib.save(mkAgent({ scope: 'workspace', name: 'wsa' }), ws);
      const file = path.join(ws.path, '.app', 'agents', `${a.id}.yaml`);
      const raw = await fs.readFile(file, 'utf8');
      expect(raw).toContain('name: wsa');
    });

    it('listFor merges global + workspace, workspace wins on id collision', async () => {
      await lib.save(mkAgent({ id: 'shared', name: 'global-name' }));
      await lib.save(mkAgent({ id: 'shared', scope: 'workspace', name: 'workspace-name' }), ws);
      const list = await lib.listFor(ws);
      const merged = list.find(a => a.id === 'shared');
      expect(merged?.name).toBe('workspace-name');
      expect(merged?.scope).toBe('workspace');
    });

    it('workspace-scoped agents do not appear without workspace context', async () => {
      await lib.save(mkAgent({ scope: 'workspace', name: 'wsa' }), ws);
      const list = await lib.listFor();
      expect(list.find(a => a.name === 'wsa')).toBeUndefined();
    });

    it('malformed YAML in one file surfaces as warning without breaking others', async () => {
      const dir = path.join(ws.path, '.app', 'agents');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'broken.yaml'), ': this is : not : valid');
      await fs.writeFile(
        path.join(dir, 'good.yaml'),
        'id: good\nname: good\ncommand: claude\nargs: []\npromptTemplate: ""\nvars: []\n'
      );
      const list = await lib.listFor(ws);
      expect(list.some(a => a.name === 'good')).toBe(true);
      const warns = lib.getWarnings();
      expect(warns.some(w => w.file.endsWith('broken.yaml'))).toBe(true);
    });

    it('delete removes the workspace agent file', async () => {
      const a = await lib.save(mkAgent({ scope: 'workspace', name: 'rm' }), ws);
      await lib.delete(a.id, 'workspace', ws);
      const file = path.join(ws.path, '.app', 'agents', `${a.id}.yaml`);
      await expect(fs.access(file)).rejects.toThrow();
    });
  });

  describe('resolveLaunch', () => {
    it('substitutes {{vars}} in the prompt and appends as final arg by default', async () => {
      const a = await lib.save(
        mkAgent({
          name: 'a',
          command: 'claude',
          args: ['--print'],
          promptTemplate: 'Hello {{NAME}}',
          vars: [{ key: 'NAME', label: 'Name', required: true }]
        })
      );
      const res = await lib.resolveLaunch(a.id, { NAME: 'world' }, '/tmp');
      expect(res.command).toBe('claude');
      expect(res.args).toEqual(['--print', 'Hello world']);
      expect(res.cwd).toBe('/tmp');
    });

    it('throws when a required variable is missing', async () => {
      const a = await lib.save(
        mkAgent({
          promptTemplate: '{{NAME}}',
          vars: [{ key: 'NAME', label: 'Name', required: true }]
        })
      );
      await expect(lib.resolveLaunch(a.id, {}, '/tmp')).rejects.toThrow(/Missing required/);
    });

    it('uses defaults when var omitted', async () => {
      const a = await lib.save(
        mkAgent({
          promptTemplate: 'X={{X}}',
          vars: [{ key: 'X', label: 'X', required: true, default: 'd' }]
        })
      );
      const res = await lib.resolveLaunch(a.id, {}, '/tmp');
      expect(res.args).toEqual(['X=d']);
    });

    it('respects {{PROMPT}} placement in args', async () => {
      const a = await lib.save(
        mkAgent({
          args: ['--prompt', '{{PROMPT}}', '--end'],
          promptTemplate: 'P'
        })
      );
      const res = await lib.resolveLaunch(a.id, {}, '/tmp');
      expect(res.args).toEqual(['--prompt', 'P', '--end']);
    });
  });
});
