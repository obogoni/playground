import { basename, resolve } from 'node:path'
import type { WorkspaceEntry } from '../shared/tree'
import type { ConfigStore } from './config-store'

/**
 * Owns the persisted workspace list (PRD §Module decomposition). Entries live
 * in AppConfig.workspaces via the injected ConfigStore, so atomic writes and
 * corrupt-file recovery come for free and the module stays Electron-free.
 *
 * Identity is the normalized absolute path (lowercased — Windows paths are
 * case-insensitive), so re-adding the same folder under a different spelling
 * is a no-op.
 */
export class WorkspaceRegistry {
  constructor(private readonly store: ConfigStore) {}

  add(path: string): WorkspaceEntry | null {
    const normalized = resolve(path)
    const id = normalized.toLowerCase()
    if (this.list().some((ws) => ws.id === id)) {
      return null
    }
    const entry: WorkspaceEntry = { id, path: normalized, displayName: basename(normalized) }
    this.store.patch({ workspaces: [...this.list(), entry] })
    return entry
  }

  remove(id: string): void {
    this.store.patch({ workspaces: this.list().filter((ws) => ws.id !== id) })
  }

  list(): WorkspaceEntry[] {
    return this.store.get().workspaces
  }
}
