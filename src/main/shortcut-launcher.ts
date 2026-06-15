import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import type { LaunchResult, ShortcutTool } from '../shared/shortcuts'

/**
 * Thin wrapper that opens external tools rooted at a worktree path (PRD
 * §Module decomposition). Windows targets: File Explorer, Windows Terminal,
 * VS Code, and Visual Studio 2022 (elevated). Fire-and-forget — a tool exiting
 * immediately is not a failure; only spawn failures and missing paths are
 * reported.
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
      case 'vs2022':
        return this.openVisualStudio(path)
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

  /**
   * Opens Visual Studio 2022 elevated (UAC) in Open Folder mode on the worktree
   * (VSAD-02/04). devenv.exe is discovered via vswhere across editions, then
   * launched through PowerShell's `Start-Process -Verb RunAs`. Distinct failure
   * messages cover the not-installed, declined-UAC, and vanished-path cases.
   */
  async openVisualStudio(path: string): Promise<LaunchResult> {
    if (!existsSync(path)) {
      return {
        ok: false,
        error: "Couldn't launch Visual Studio 2022 — the worktree path no longer exists"
      }
    }
    const devenv = await resolveDevenv()
    if (!devenv) {
      return { ok: false, error: "Visual Studio 2022 isn't installed (or wasn't found)" }
    }
    const { command, args } = buildElevatedOpen(devenv, path)
    // A non-zero exit here is overwhelmingly the user declining the UAC prompt,
    // since the install was just resolved; surface it as a cancellation.
    return (await spawnChecked(command, args))
      ? { ok: true }
      : { ok: false, error: 'Visual Studio 2022 launch was cancelled' }
  }
}

/** `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe` (D2). */
function vswherePath(): string {
  const base = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  return `${base}\\Microsoft Visual Studio\\Installer\\vswhere.exe`
}

/**
 * Resolves the newest VS 2022 `devenv.exe` via vswhere, or null when vswhere is
 * absent / errors / reports no install — or when the reported path no longer
 * exists on disk (stale vswhere output / partial uninstall). All treated as
 * "not found", never thrown.
 */
function resolveDevenv(): Promise<string | null> {
  const vswhere = vswherePath()
  if (!existsSync(vswhere)) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(
      vswhere,
      ['-latest', '-version', '[17.0,18.0)', '-property', 'productPath'],
      { windowsHide: true },
      (error, stdout) => {
        const devenv = error ? null : parseVswhereProductPath(stdout)
        resolve(devenv && existsSync(devenv) ? devenv : null)
      }
    )
  })
}

/** First non-empty line of vswhere's productPath output, or null. */
export function parseVswhereProductPath(stdout: string): string | null {
  const path = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  return path ?? null
}

/**
 * Builds the `Start-Process -Verb RunAs` invocation that opens `devenvPath`
 * elevated with `worktreePath` as the Open-Folder root. The folder is wrapped in
 * double quotes so spaces / non-ASCII survive (Windows paths can't contain `"`),
 * and single quotes are doubled to stay literal inside PowerShell's quoting.
 */
export function buildElevatedOpen(
  devenvPath: string,
  worktreePath: string
): { command: string; args: string[] } {
  const psQuote = (value: string): string => `'${value.replace(/'/g, "''")}'`
  return {
    command: 'powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process -FilePath ${psQuote(devenvPath)} -ArgumentList ${psQuote(`"${worktreePath}"`)} -Verb RunAs`
    ]
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

function spawnChecked(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}

function spawnShellChecked(commandLine: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(commandLine, { shell: true, stdio: 'ignore', windowsHide: true })
    child.once('error', () => resolve(false))
    child.once('exit', (code) => resolve(code === 0))
  })
}
