import type { PinnedTask } from './tasks'
import type { WorkspaceEntry } from './tree'

export interface AppConfig {
  ui: {
    theme: 'dark' | 'light'
    direction: 'tree' | 'board'
  }
  workspaces: WorkspaceEntry[]
  /** Defaults for resolving bare work-item IDs; hand-edited until the M4 settings UI. */
  ado: {
    defaultOrg: string | null
    defaultProject: string | null
  }
  pinnedTasks: PinnedTask[]
}

export type ConfigPatch = {
  [K in keyof AppConfig]?: AppConfig[K] extends unknown[] ? AppConfig[K] : Partial<AppConfig[K]>
}

export const DEFAULT_CONFIG: AppConfig = {
  ui: {
    theme: 'dark',
    direction: 'tree'
  },
  workspaces: [],
  ado: {
    defaultOrg: null,
    defaultProject: null
  },
  pinnedTasks: []
}
