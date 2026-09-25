import { win32 as path } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PathKind, ProbeResult } from '../shared/links'
import type { LaunchResult } from '../shared/shortcuts'

/** Every OS touch the opener makes, injected so the unit tests run on fakes (no spawn, no fs). */
export interface LinkOpenerDeps {
  homedir(): string
  stat(path: string): Promise<{ isDirectory(): boolean }>
  /** `shell.openPath`: resolves with '' on success, an error message otherwise. */
  openPath(path: string): Promise<string>
  openExternal(url: string): Promise<void>
  spawnDetached(command: string, args: string[]): Promise<boolean>
  /** Whether Windows associates an app with the extension (leading dot included). */
  hasAssociation(ext: string): Promise<boolean>
}

/** Candidates past this many in one probe are reported missing without a stat (design §Risks). */
export const PROBE_BATCH_LIMIT = 32

/**
 * Resolves, stats and opens what the terminal links point at — the only place
 * that validates URL schemes and touches the OS on a link's behalf (design
 * §LinkOpener). Renderer sends text; main decides.
 */
export class LinkOpener {
  constructor(private readonly deps: LinkOpenerDeps) {}

  /** `~/` → home, relative → against cwd; null unless the result is absolute (LINK-12, LINK-29). */
  resolveCandidate(cwd: string, pathText: string): string | null {
    const expanded = /^~[\\/]/.test(pathText)
      ? path.join(this.deps.homedir(), pathText.slice(2))
      : pathText
    const resolved = path.isAbsolute(expanded) ? path.normalize(expanded) : path.join(cwd, expanded)
    return path.isAbsolute(resolved) ? resolved : null
  }

  async probe(cwd: string, paths: string[]): Promise<ProbeResult[]> {
    return Promise.all(
      paths.map(async (pathText, index): Promise<ProbeResult> => {
        const absolutePath = index < PROBE_BATCH_LIMIT ? this.resolveCandidate(cwd, pathText) : null
        const kind = absolutePath ? await this.kindOf(absolutePath) : 'missing'
        return { pathText, absolutePath, kind }
      })
    )
  }

  /** Only http and https reach the browser; every other scheme is refused here, not in the renderer (LINK-04). */
  async openUrl(url: string): Promise<LaunchResult> {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false, error: `Only http and https links open here — ${url}` }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `Only http and https links open here — ${url}` }
    }
    try {
      await this.deps.openExternal(parsed.toString())
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: `Couldn’t open ${url}: ${err instanceof Error ? err.message : String(err)}`
      }
    }
  }

  /**
   * Directory → Explorer; file → the Windows default app, or the native "Open
   * with" chooser when there is no association (LINK-09..11, LINK-13). The
   * chooser is launched explicitly: on Windows 11 `shell.openPath` no-ops on an
   * unassociated file (electron#36605). Executables take the same route (AD-041).
   */
  async openPath(cwd: string, pathText: string): Promise<LaunchResult> {
    const absolutePath = this.resolveCandidate(cwd, pathText)
    return absolutePath
      ? this.openAbsolute(absolutePath)
      : { ok: false, error: `${pathText} no longer exists` }
  }

  /**
   * An OSC 8 `file://` target (what Claude Code emits for every path once
   * `FORCE_HYPERLINK` is set) opens through the same rules as a printed path
   * (LINK-21). Only a local URL is accepted — a UNC host is refused, like any
   * other scheme; a `#L10C5` fragment or `:line:col` suffix is dropped (LINK-09).
   */
  async openFileUrl(url: string): Promise<LaunchResult> {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false, error: `Only local file links open here — ${url}` }
    }
    if (parsed.protocol !== 'file:' || (parsed.hostname && parsed.hostname !== 'localhost')) {
      return { ok: false, error: `Only local file links open here — ${url}` }
    }
    parsed.hash = ''
    parsed.search = ''
    let absolutePath: string
    try {
      absolutePath = fileURLToPath(parsed, { windows: true }).replace(/(?::\d+){1,2}$/, '')
    } catch {
      return { ok: false, error: `Only local file links open here — ${url}` }
    }
    return this.openAbsolute(path.normalize(absolutePath))
  }

  /** Directory → Explorer; file → default app or the chooser (LINK-09..11, LINK-13). */
  private async openAbsolute(absolutePath: string): Promise<LaunchResult> {
    const kind = await this.kindOf(absolutePath)
    if (kind === 'missing') {
      return { ok: false, error: `${absolutePath} no longer exists` }
    }
    if (kind === 'dir') {
      return this.launch('explorer.exe', [absolutePath], absolutePath)
    }
    const ext = path.extname(absolutePath)
    if (ext && (await this.deps.hasAssociation(ext))) {
      const failure = await this.deps.openPath(absolutePath)
      if (failure === '') return { ok: true }
    }
    return this.launch('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', absolutePath], absolutePath)
  }

  private async launch(command: string, args: string[], target: string): Promise<LaunchResult> {
    return (await this.deps.spawnDetached(command, args))
      ? { ok: true }
      : { ok: false, error: `Couldn’t open ${target}` }
  }

  private async kindOf(absolutePath: string): Promise<PathKind> {
    try {
      return (await this.deps.stat(absolutePath)).isDirectory() ? 'dir' : 'file'
    } catch {
      return 'missing'
    }
  }
}
