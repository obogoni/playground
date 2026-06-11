import { spawn } from 'child_process'
import { existsSync } from 'fs'
import type { LaunchResult, ShortcutTool } from '../shared/shortcuts'

/**
 * Thin wrapper that opens external tools rooted at a worktree path (PRD
 * §Module decomposition). Hard-coded to the v1 Windows targets: File Explorer,
 * Windows Terminal, VS Code. Fire-and-forget — a tool exiting immediately is
 * not a failure; only spawn failures and missing paths are reported.
 */
export class ShortcutLauncher {
  launch(tool: ShortcutTool, path: string): Promise<LaunchResult> {
    switch (tool) {
      case 'explorer':
        return this.openExplorer(path)
      case 'terminal':
        return this.openTerminal(path)
      case 'vscode':
        return this.openVsCode(path)
    }
  }

  openExplorer(path: string): Promise<LaunchResult> {
    return launchAt('File Explorer (explorer.exe)', path, () =>
      spawnDetached('explorer.exe', [path])
    )
  }

  openTerminal(path: string): Promise<LaunchResult> {
    return launchAt('Windows Terminal (wt.exe)', path, () => spawnDetached('wt.exe', ['-d', path]))
  }

  openVsCode(path: string): Promise<LaunchResult> {
    // `code` is a .cmd shim, which Node refuses to spawn directly; going
    // through a shell masks ENOENT, so failure is read from the exit code.
    return launchAt('VS Code (code)', path, () => spawnShellChecked(`code "${path}"`))
  }
}

async function launchAt(
  label: string,
  path: string,
  run: () => Promise<boolean>
): Promise<LaunchResult> {
  if (!existsSync(path)) {
    return { ok: false, error: `Couldn't launch ${label} — the worktree path no longer exists` }
  }
  return (await run()) ? { ok: true } : { ok: false, error: `Couldn't launch ${label}` }
}

function spawnDetached(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

function spawnShellChecked(commandLine: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(commandLine, { shell: true, stdio: 'ignore', windowsHide: true })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}
