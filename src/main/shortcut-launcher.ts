import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import type { LaunchResult, ShortcutTool } from '../shared/shortcuts'

/** The `ShortcutTool` members that open a Visual Studio version. */
export type VsTool = Extract<ShortcutTool, 'vs2022' | 'vs2026'>

/** A Visual Studio version the launcher can open, pinned to its vswhere range. */
export interface VsEdition {
  /** Used verbatim in every user-facing failure message. */
  label: string
  /** vswhere `-version` argument — a half-open MSBuild-style range. */
  versionRange: string
}

/**
 * The Visual Studio versions the launcher offers, each pinned to its *own*
 * version range (VS26-03). The ranges are disjoint by construction, so no
 * install can satisfy both and neither card can shadow the other — a launcher
 * never resolves "the latest VS", only the latest *within its own range*.
 *
 * Note 2026 installs under a version-numbered root (`\Microsoft Visual
 * Studio\18\`), not a year-named one like 2022's `\2022\`, so nothing here may
 * key off the folder name; vswhere's `productPath` is the only supported source
 * of the executable location.
 */
export const VS_EDITIONS: Record<VsTool, VsEdition> = {
  vs2022: { label: 'Visual Studio 2022', versionRange: '[17.0,18.0)' },
  vs2026: { label: 'Visual Studio 2026', versionRange: '[18.0,19.0)' }
}

/**
 * Thin wrapper that opens external tools rooted at a worktree path (PRD
 * §Module decomposition). Windows targets: File Explorer, Windows Terminal,
 * VS Code, and Visual Studio 2022 / 2026 (both elevated). Fire-and-forget — a
 * tool exiting immediately is not a failure; only spawn failures and missing
 * paths are reported.
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
      case 'vs2026':
        return this.openVisualStudio(path, VS_EDITIONS[tool])
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
   * Opens the given Visual Studio edition elevated (UAC) in Open Folder mode on
   * the worktree (VSAD-02/04, VS26-02/05). devenv.exe is discovered via vswhere
   * within that edition's range, then launched through PowerShell's
   * `Start-Process -Verb RunAs`. Distinct failure messages cover the
   * not-installed, declined-UAC, and vanished-path cases, each naming the
   * edition so "not installed" is never ambiguous between the two versions.
   */
  async openVisualStudio(path: string, edition: VsEdition): Promise<LaunchResult> {
    const messages = vsFailureMessages(edition)
    if (!existsSync(path)) {
      return { ok: false, error: messages.missingPath }
    }
    const devenv = await resolveDevenv(edition.versionRange)
    if (!devenv) {
      return { ok: false, error: messages.notInstalled }
    }
    const { command, args } = buildElevatedOpen(devenv, path)
    // A non-zero exit here is overwhelmingly the user declining the UAC prompt,
    // since the install was just resolved; surface it as a cancellation.
    return (await spawnChecked(command, args))
      ? { ok: true }
      : { ok: false, error: messages.cancelled }
  }
}

/**
 * The user-facing failure messages for one edition. Templating them off the
 * label is what keeps the 2022 wording character-for-character identical to
 * what VSAD-04 shipped while giving 2026 its own unambiguous variants.
 */
export function vsFailureMessages(edition: VsEdition): {
  notInstalled: string
  cancelled: string
  missingPath: string
} {
  return {
    notInstalled: `${edition.label} isn't installed (or wasn't found)`,
    cancelled: `${edition.label} launch was cancelled`,
    missingPath: `Couldn't launch ${edition.label} — the worktree path no longer exists`
  }
}

/**
 * The vswhere argument vector for one edition's range. Deliberately omits
 * `-prerelease` (C4): on a machine with both a stable and an Insiders install,
 * `-latest -prerelease` can resolve Insiders and silently launch the wrong VS.
 * An Insiders-only machine therefore reports "not installed", which is the
 * accepted trade-off.
 */
export function buildVswhereArgs(versionRange: string): string[] {
  return ['-latest', '-version', versionRange, '-property', 'productPath']
}

/** `%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe` (D2). */
function vswherePath(): string {
  const base = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  return `${base}\\Microsoft Visual Studio\\Installer\\vswhere.exe`
}

/**
 * Resolves the newest `devenv.exe` within `versionRange` via vswhere, or null
 * when vswhere is absent / errors / reports no install — or when the reported
 * path no longer exists on disk (stale vswhere output / partial uninstall). All
 * treated as "not found", never thrown. The range is a parameter rather than
 * module state so two editions can resolve independently and concurrently.
 */
function resolveDevenv(versionRange: string): Promise<string | null> {
  const vswhere = vswherePath()
  if (!existsSync(vswhere)) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(vswhere, buildVswhereArgs(versionRange), { windowsHide: true }, (error, stdout) => {
      const devenv = error ? null : parseVswhereProductPath(stdout)
      resolve(devenv && existsSync(devenv) ? devenv : null)
    })
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
 * Version-agnostic: both editions share it verbatim.
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
