import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import type { SimpleAgent, ResolvedLaunch, Workspace, AgentWarning } from '../../shared/types.js';

interface GlobalShape {
  agents: SimpleAgent[];
}

export class AgentLibrary {
  private globals: SimpleAgent[] = [];
  private warnings: AgentWarning[] = [];
  private loaded = false;

  constructor(private readonly globalFile: string) {}

  private async loadGlobal(): Promise<void> {
    if (this.loaded) return;
    try {
      const buf = await fs.readFile(this.globalFile, 'utf8');
      const parsed = JSON.parse(buf) as GlobalShape;
      this.globals = Array.isArray(parsed.agents) ? parsed.agents.map(this.normalize) : [];
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
      this.globals = [];
    }
    this.loaded = true;
  }

  private normalize = (a: any): SimpleAgent => ({
    id: String(a.id),
    name: String(a.name ?? a.id),
    scope: a.scope === 'workspace' ? 'workspace' : 'global',
    command: String(a.command ?? 'claude'),
    args: Array.isArray(a.args) ? a.args.map(String) : [],
    promptTemplate: String(a.promptTemplate ?? ''),
    vars: Array.isArray(a.vars)
      ? a.vars.map((v: any) => ({
          key: String(v.key),
          label: String(v.label ?? v.key),
          required: Boolean(v.required),
          default: v.default !== undefined ? String(v.default) : undefined
        }))
      : [],
    workspaceId: a.workspaceId ? String(a.workspaceId) : undefined
  });

  private async persistGlobal(): Promise<void> {
    await fs.mkdir(path.dirname(this.globalFile), { recursive: true });
    const tmp = `${this.globalFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({ agents: this.globals }, null, 2), 'utf8');
    await fs.rename(tmp, this.globalFile);
  }

  private workspaceAgentsDir(ws: Workspace): string {
    return path.join(ws.path, '.app', 'agents');
  }

  private async loadWorkspace(ws: Workspace): Promise<SimpleAgent[]> {
    const dir = this.workspaceAgentsDir(ws);
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
      throw err;
    }
    const out: SimpleAgent[] = [];
    // Reset warnings for this workspace's directory before re-reading.
    this.warnings = this.warnings.filter(w => !w.file.startsWith(dir));
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.ya?ml$/i.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      try {
        const raw = await fs.readFile(filePath, 'utf8');
        const parsed = YAML.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          this.warnings.push({ file: filePath, message: 'YAML root is not an object' });
          continue;
        }
        const agent = this.normalize({ ...parsed, scope: 'workspace', workspaceId: ws.id });
        if (!agent.id) {
          // fall back to filename without extension
          agent.id = path.basename(entry.name).replace(/\.ya?ml$/i, '');
        }
        out.push(agent);
      } catch (err: any) {
        this.warnings.push({ file: filePath, message: err.message ?? String(err) });
      }
    }
    return out;
  }

  async listFor(ws?: Workspace): Promise<SimpleAgent[]> {
    await this.loadGlobal();
    const globals = this.globals.map(a => ({ ...a, scope: 'global' as const }));
    if (!ws) return globals;
    const wsAgents = await this.loadWorkspace(ws);
    // Workspace scope wins on id collision.
    const byId = new Map<string, SimpleAgent>();
    for (const g of globals) byId.set(g.id, g);
    for (const w of wsAgents) byId.set(w.id, w);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getWarnings(): AgentWarning[] {
    return [...this.warnings];
  }

  async save(agent: SimpleAgent, ws?: Workspace): Promise<SimpleAgent> {
    await this.loadGlobal();
    const normalized = this.normalize(agent);
    if (!normalized.id) normalized.id = crypto.randomUUID();
    if (normalized.scope === 'workspace') {
      if (!ws) throw new Error('Workspace-scoped agents require a workspace context');
      const dir = this.workspaceAgentsDir(ws);
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${normalized.id}.yaml`);
      const payload = {
        id: normalized.id,
        name: normalized.name,
        command: normalized.command,
        args: normalized.args,
        promptTemplate: normalized.promptTemplate,
        vars: normalized.vars
      };
      await fs.writeFile(file, YAML.stringify(payload), 'utf8');
      normalized.workspaceId = ws.id;
    } else {
      const idx = this.globals.findIndex(a => a.id === normalized.id);
      if (idx >= 0) this.globals[idx] = normalized;
      else this.globals.push(normalized);
      await this.persistGlobal();
    }
    return normalized;
  }

  async delete(id: string, scope: 'global' | 'workspace', ws?: Workspace): Promise<void> {
    if (scope === 'workspace') {
      if (!ws) throw new Error('Workspace context required to delete a workspace-scoped agent');
      const dir = this.workspaceAgentsDir(ws);
      for (const ext of ['yaml', 'yml']) {
        const file = path.join(dir, `${id}.${ext}`);
        try {
          await fs.unlink(file);
        } catch (err: any) {
          if (err.code !== 'ENOENT') throw err;
        }
      }
      return;
    }
    await this.loadGlobal();
    const before = this.globals.length;
    this.globals = this.globals.filter(a => a.id !== id);
    if (this.globals.length !== before) await this.persistGlobal();
  }

  substitute(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key];
      return '';
    });
  }

  async resolveLaunch(
    agentId: string,
    vars: Record<string, string>,
    cwd: string,
    ws?: Workspace
  ): Promise<ResolvedLaunch> {
    const list = await this.listFor(ws);
    const agent = list.find(a => a.id === agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);
    const missing = agent.vars
      .filter(v => v.required)
      .filter(v => !vars[v.key] && !v.default)
      .map(v => v.key);
    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(', ')}`);
    }
    const effective: Record<string, string> = {};
    for (const v of agent.vars) {
      effective[v.key] = vars[v.key] ?? v.default ?? '';
    }
    // Allow ad-hoc vars too
    for (const k of Object.keys(vars)) if (!(k in effective)) effective[k] = vars[k];

    const prompt = this.substitute(agent.promptTemplate, effective);
    const resolvedArgs = agent.args.map(a => this.substitute(a, { ...effective, PROMPT: prompt }));
    // If the template includes {{PROMPT}} in args, callers have placed it themselves;
    // otherwise append the rendered prompt as a final argument (when non-empty).
    const argsAlreadyContainPrompt = agent.args.some(a => /\{\{\s*PROMPT\s*\}\}/.test(a));
    const finalArgs = argsAlreadyContainPrompt
      ? resolvedArgs
      : prompt.trim()
        ? [...resolvedArgs, prompt]
        : resolvedArgs;
    return { command: agent.command, args: finalArgs, cwd };
  }
}
