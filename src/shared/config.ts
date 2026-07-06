import type { AgentDef, Shell } from '../main/spawn-plan'
import { SEEDED_AGENTS } from './agents'
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
  /** A registry agent's name (see `AppConfig.agents`), or the `'Ad-hoc'` label. */
  agent: string
  cwd: string
  /** Auto-derived `<agent> · <branch-leaf>`; editable via rename (AGCF-04). */
  title: string
  status: SessionStatus
  /** Raw ad-hoc command (absent for registry agents); drives respawn (AGCF-03). */
  command?: string
}

/** Returned to the renderer: persisted fields plus the one fact only main can
 * know — whether the session's cwd still exists. Reconciled, never stored. */
export interface SessionView extends PersistedSession {
  pathMissing: boolean
  /** Up to 2 tail lines from a retained buffer; absent after restart (AGCF-08). */
  lastOutput?: string
}

export interface AppConfig {
  ui: {
    theme: 'dark' | 'light'
    direction: 'tree' | 'board' | 'agents' | 'workflows'
    /** Hosting shell for new agent PTYs; running sessions keep their own (AGCF-02). */
    defaultShell: Shell
  }
  workspaces: WorkspaceEntry[]
  /** Editable coding-agent registry; seeded from `SEEDED_AGENTS` (AGCF-01). */
  agents: AgentDef[]
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
    direction: 'tree',
    defaultShell: 'pwsh'
  },
  workspaces: [],
  agents: SEEDED_AGENTS,
  ado: {
    defaultOrg: null,
    defaultProject: null,
    branchTemplate: DEFAULT_BRANCH_TEMPLATE,
    worktreeTemplate: DEFAULT_WORKTREE_TEMPLATE
  },
  pinnedTasks: [],
  sessions: []
}
