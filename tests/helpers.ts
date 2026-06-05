import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const pexec = promisify(execFile);

export async function tmpDir(prefix = 'wtl-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function rm(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

export async function initRepo(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await pexec('git', ['init', '-b', 'main', dir]);
  await pexec('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  await pexec('git', ['-C', dir, 'config', 'user.name', 'Test']);
  await pexec('git', ['-C', dir, 'config', 'commit.gpgsign', 'false']);
  await fs.writeFile(path.join(dir, 'README.md'), '# test\n');
  await pexec('git', ['-C', dir, 'add', '.']);
  await pexec('git', ['-C', dir, 'commit', '-m', 'init']);
}

export const git = (args: string[], cwd?: string) =>
  pexec('git', cwd ? ['-C', cwd, ...args] : args);
