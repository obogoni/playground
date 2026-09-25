import type { AgentDef, Shell } from '../main/spawn-plan'
import { SEEDED_AGENTS } from './agents'
import type { FilesMode } from './files'
import type { PinnedTask } from './tasks'
import { DEFAULT_BRANCH_TEMPLATE } from './tasks'
import type { WorkspaceEntry } from './tree'
import { DEFAULT_WORKTREE_TEMPLATE } from './worktrees'

/** Lifecycle of an agent session's hosting shell. The amber `agent-exited`
 * sub-status (shell alive but the agent quit) is deferred to AM3. */
export type SessionStatus = 'running' | 'stopped'

/**
 * What a running agent is doing, folded in main from the agent CLI's own
 * lifecycle hooks (AD-019). Orthogonal to `SessionStatus`, which is about the
 * hosting shell: a session can be `running` with no activity at all, which is
 * every session whose agent publishes no hooks.
 */
export type ActivityState =
  | 'working'
  | 'waiting'
  | 'needs-approval'
  | 'needs-input'
  | 'error'
  | 'compacting'
  | 'exited'

export interface SessionActivity {
  state: ActivityState
  /** Tool currently running, or the one awaiting approval. */
  tool?: string
  /** Active subagents, counted by the ids the hooks report. */
  subagents: number
  /** The `StopFailure` error type (`rate_limit`, `overloaded`, …); `error` only. */
  error?: string
}

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
  /** What the agent is doing, derived in main from its lifecycle hooks. Absent
   *  for ad-hoc and non-Claude sessions, for stopped sessions, and until the
   *  first hook event arrives. Never persisted (ACTV-09). */
  activity?: SessionActivity
  /** The name Claude Code gives this session, read from `claude agents --json`
   *  and matched by the `session_id` its hooks report (AD-040). Absent until the
   *  first successful listing after the first hook event, for ad-hoc and
   *  non-Claude sessions, and for stopped sessions. Never persisted (SNAME-15). */
  name?: string
}

/** One worktree's remembered Files lens (FXPL-13). `base` is absent until the
 *  user picks one; the diff mode then falls back to `origin/HEAD` (FXPL-10). */
export interface FilesState {
  mode: FilesMode
  base?: string
}

export interface AppConfig {
  ui: {
    theme: 'dark' | 'light'
    direction: 'tree' | 'board' | 'agents' | 'workflows' | 'files' | 'hours'
    /** Hosting shell for new agent PTYs; running sessions keep their own (AGCF-02). */
    defaultShell: Shell
    /** Persisted sidebar width; absent = 230px default (PANE-01). */
    sidebarWidth?: number
    /** Persisted sidebar collapsed state; absent = expanded (PANE-03). */
    sidebarCollapsed?: boolean
    /** Persisted tasks pane width; absent = 322px default (PANE-08). */
    tasksWidth?: number
    /** Persisted tasks pane collapsed state; absent = expanded (PANE-09). */
    tasksCollapsed?: boolean
    /** Workspace ids folded in the sidebar tree; absent = every workspace expanded (WSCL-06). */
    collapsedWorkspaces?: string[]
    /** What the Files direction last showed per worktree; absent = full folder
     *  and the `origin/HEAD` default (FXPL-13, design D4). */
    files?: Record<string, FilesState>
    /** The worktree selected when the app last closed, restored on launch
     *  (FXPL-33); absent, or naming a worktree that is gone, selects nothing. */
    selectedWorktree?: string
    /** How every open diff is laid out; absent = side by side (FDIF-11/12). */
    diffLayout?: 'side-by-side' | 'inline'
    /** Hide leading and trailing whitespace changes, and the line-ending strip
     *  and markers with them; absent = whitespace shown (FDIF-15/16). */
    diffIgnoreWhitespace?: boolean
    /** Master switch for session activity notifications; absent = on (NOTF-13, NOTF-17).
     *  Never clears the per-state switches below (NOTF-19). */
    notify?: boolean
    /** Notify when a session enters `needs-approval`; absent = on (NOTF-14). */
    notifyNeedsApproval?: boolean
    /** Notify when a session enters `needs-input`; absent = on (NOTF-14). */
    notifyNeedsInput?: boolean
    /** Notify when a session enters `waiting`; absent = on (NOTF-14). */
    notifyWaiting?: boolean
    /** Notify when a session enters `error`; absent = on (NOTF-14). */
    notifyError?: boolean
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
    /** Developer alias for the `{dev}` branch-template placeholder; blank renders an empty segment. */
    devAlias: string
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
    worktreeTemplate: DEFAULT_WORKTREE_TEMPLATE,
    devAlias: ''
  },
  pinnedTasks: [],
  sessions: []
}
