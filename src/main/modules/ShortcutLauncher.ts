import { spawn } from 'node:child_process';

function launchDetached(cmd: string, args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false });
      child.once('error', err => reject(new Error(`Failed to launch ${label}: ${err.message}`)));
      child.unref();
      // Give it a tick to fail synchronously.
      setTimeout(() => resolve(), 50);
    } catch (err: any) {
      reject(new Error(`Failed to launch ${label}: ${err.message}`));
    }
  });
}

export class ShortcutLauncher {
  openExplorer(p: string): Promise<void> {
    return launchDetached('explorer.exe', [p], 'Windows Explorer');
  }

  openTerminal(p: string): Promise<void> {
    return launchDetached('wt.exe', ['-d', p], 'Windows Terminal');
  }

  openVsCode(p: string): Promise<void> {
    // `code` on Windows is a cmd shim; spawn via cmd.exe so PATH lookup works reliably.
    return launchDetached('cmd.exe', ['/c', 'code', p], 'VS Code');
  }
}
