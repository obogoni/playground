import type { PinnedTask } from './tasks'
import { DEFAULT_BRANCH_TEMPLATE } from './tasks'
import type { WorkspaceEntry } from './tree'
import { DEFAULT_WORKTREE_TEMPLATE } from './worktrees'

/** Lifecycle of an agent session's hosting shell. The amber `agent-exited`
 * sub-status (shell alive but the agent quit) is deferred to AM3. */
export type SessionStatus = 'running' | 'stopped'

/** Persisted across restarts; the PTY itself never survives, so on load every
 * status is normalized to `stopped` (one-click Respawn re-runs in the same cwd). */
export interface PersistedSession {
  id: string
  /** The seeded agent's name (see `SEEDED_AGENTS`). */
  agent: string
  cwd: string
  /** Auto-derived `<agent> · <branch-leaf>`; rename is AM3. */
  title: string
  status: SessionStatus
}

/** Returned to the renderer: persisted fields plus the one fact only main can
 * know — whether the session's cwd still exists. Reconciled, never stored. */
export interface SessionView extends PersistedSession {
  pathMissing: boolean
}

export interface AppConfig {
  ui: {
    theme: 'dark' | 'light'
    direction: 'tree' | 'board' | 'agents'
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
  /** Agent sessions; restored as `stopped` on load. */
  sessions: PersistedSession[]
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
  pinnedTasks: [],
  sessions: []
}
