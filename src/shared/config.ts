import type { PinnedTask } from './tasks'
import { DEFAULT_BRANCH_TEMPLATE } from './tasks'
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
    /** Start-work branch template; blank falls back to the default at render time. */
    branchTemplate: string
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
    defaultProject: null,
    branchTemplate: DEFAULT_BRANCH_TEMPLATE
  },
  pinnedTasks: []
}
