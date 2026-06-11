import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppConfig, ConfigPatch } from '../shared/config'
import { DEFAULT_CONFIG } from '../shared/config'

/**
 * Owns the global config file (<dir>/config.json). All file I/O is hidden
 * behind get/patch; writes are atomic (tmp file + rename); a corrupt file is
 * preserved aside as config.json.bak-<timestamp> and replaced by defaults.
 *
 * The directory is injected (app.getPath('userData') in production, a temp
 * dir in tests) so the module has no Electron dependency.
 */
export class ConfigStore {
  private readonly filePath: string
  private config: AppConfig

  constructor(private readonly dir: string) {
    this.filePath = join(dir, 'config.json')
    this.config = this.load()
  }

  get(): AppConfig {
    return this.config
  }

  patch(patch: ConfigPatch): AppConfig {
    this.config = this.merge(this.config, patch)
    this.persist()
    return this.config
  }

  private load(): AppConfig {
    if (!existsSync(this.filePath)) {
      return structuredClone(DEFAULT_CONFIG)
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'))
      return this.merge(structuredClone(DEFAULT_CONFIG), parsed)
    } catch (err) {
      const backupPath = `${this.filePath}.bak-${Date.now()}`
      console.error(`Config file unreadable, backing up to ${backupPath}:`, err)
      try {
        renameSync(this.filePath, backupPath)
      } catch (renameErr) {
        console.error('Failed to back up corrupt config file:', renameErr)
      }
      return structuredClone(DEFAULT_CONFIG)
    }
  }

  /** Shallow merge per top-level section; unknown keys at both levels survive. */
  private merge(base: AppConfig, patch: Record<string, unknown>): AppConfig {
    const next: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      const current = next[key]
      next[key] =
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? { ...(current as object), ...value }
          : value
    }
    return next as unknown as AppConfig
  }

  private persist(): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      const tmpPath = `${this.filePath}.tmp`
      writeFileSync(tmpPath, JSON.stringify(this.config, null, 2) + '\n', 'utf8')
      renameSync(tmpPath, this.filePath)
    } catch (err) {
      // Persistence is best-effort: the in-memory config stays authoritative
      // for this session even when the disk write fails.
      console.error('Failed to persist config:', err)
    }
  }
}
