import crypto from 'node:crypto';
import type { PtyStartOptions } from '../../shared/types.js';

type PtyInstance = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(cb: (data: string) => void): { dispose(): void };
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
};

type SpawnFn = (file: string, args: string[] | string, opts: any) => PtyInstance;

let cachedPty: { spawn: SpawnFn } | null = null;

function loadPty(): { spawn: SpawnFn } {
  if (cachedPty) return cachedPty;
  // node-pty is loaded lazily so unit tests (which never hit this module path)
  // don't require the native binary.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  cachedPty = require('node-pty');
  return cachedPty!;
}

interface ActiveSession {
  id: string;
  pty: PtyInstance;
  dataDispose: { dispose(): void };
  exitDispose: { dispose(): void };
}

export class TabSessionRegistry {
  private sessions = new Map<string, ActiveSession>();

  start(
    opts: PtyStartOptions,
    onData: (id: string, data: string) => void,
    onExit: (id: string, code: number) => void
  ): string {
    const pty = loadPty();
    const id = crypto.randomUUID();
    const instance = pty.spawn(opts.cmd, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols ?? 100,
      rows: opts.rows ?? 30,
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) } as any,
      useConpty: process.platform === 'win32'
    });
    const dataDispose = instance.onData(data => onData(id, data));
    const exitDispose = instance.onExit(({ exitCode }) => {
      onExit(id, exitCode);
      this.dispose(id);
    });
    this.sessions.set(id, { id, pty: instance, dataDispose, exitDispose });
    return id;
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s) return;
    try {
      s.pty.resize(Math.max(1, cols), Math.max(1, rows));
    } catch {
      // size errors are non-fatal
    }
  }

  dispose(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    try { s.dataDispose.dispose(); } catch {}
    try { s.exitDispose.dispose(); } catch {}
    try { s.pty.kill(); } catch {}
  }

  disposeAll(): void {
    for (const id of [...this.sessions.keys()]) this.dispose(id);
  }
}
