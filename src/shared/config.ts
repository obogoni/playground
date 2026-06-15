import type { PinnedTask } from './tasks'
import { DEFAULT_BRANCH_TEMPLATE } from './tasks'
import type { WorkspaceEntry } from './tree'
import { DEFAULT_WORKTREE_TEMPLATE } from './worktrees'

export interface AppConfig {
  ui: {
    theme: 'dark' | 'light'
    direction: 'tree' | 'board'
  }
  workspaces: WorkspaceEntry[]
  /** Defaults for resolving bare work-item IDs; editable in the settings dialog. */
  ado: {
    defaultOrg: string | null
    defaultProject: string | null
    /** Start-work branch template; blank falls back to the default at render time. */
    branchTemplate: string
    /** Worktree folder-name template; blank falls back to {repo}-{branch} at render time. */
    worktreeTemplate: string
  }
  pinnedTasks: PinnedTask[]
}

export type ConfigPatch = {
  [K in keyof AppConfig]?: AppConfig[K] extends unknown[] ? AppConfig[K] : Partial<AppConfig[K]>
}

/** Per-workspace template overrides from `.app/config.json`; null = use the global template. */
export interface WorkspaceTemplates {
  branchTemplate: string | null
  worktreeTemplate: string | null
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
    branchTemplate: DEFAULT_BRANCH_TEMPLATE,
    worktreeTemplate: DEFAULT_WORKTREE_TEMPLATE
  },
  pinnedTasks: []
}
