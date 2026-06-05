export interface Workspace {
  id: string;
  path: string;
  displayName: string;
}

export interface Repo {
  workspaceId: string;
  name: string;
  path: string;
}

export interface Worktree {
  repoPath: string;
  branch: string;
  path: string;
}

export type AgentScope = 'global' | 'workspace';

export interface VarDef {
  key: string;
  label: string;
  required: boolean;
  default?: string;
}

export interface SimpleAgent {
  id: string;
  name: string;
  scope: AgentScope;
  command: string;
  args: string[];
  promptTemplate: string;
  vars: VarDef[];
  workspaceId?: string;
}

export interface ResolvedLaunch {
  command: string;
  args: string[];
  cwd: string;
}

export interface PtyStartOptions {
  cwd: string;
  cmd: string;
  args: string[];
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export interface AgentWarning {
  file: string;
  message: string;
}
