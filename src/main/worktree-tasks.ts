import type { AppConfig } from '../shared/config'
import { taskIdFromTemplate, type PinnedTask, type TasksSnapshot } from '../shared/tasks'
import type { WorkspaceNode } from '../shared/tree'
import { refKey } from './ado-gateway'
import { makeRef } from './task-board'

/**
 * The work items a tree implies (APIN-05): every worktree whose branch matches
 * its workspace's effective branch template, resolved against the ADO
 * defaults and deduped in first-seen order. Empty when either default is
 * unset, since a branch carries no org (APIN-07).
 */
export function derivedTaskRefs(
  tree: WorkspaceNode[],
  templateFor: (workspacePath: string) => string | null,
  defaults: Pick<AppConfig['ado'], 'defaultOrg' | 'defaultProject'>
): PinnedTask[] {
  const { defaultOrg, defaultProject } = defaults
  if (!defaultOrg || !defaultProject) return []
  const refs = new Map<string, PinnedTask>()
  for (const workspace of tree) {
    const template = templateFor(workspace.path)
    for (const repo of workspace.repos) {
      for (const worktree of repo.worktrees) {
        const id = taskIdFromTemplate(template, worktree.branch)
        if (id === null) continue
        const ref = makeRef(defaultOrg, defaultProject, id)
        if (!refs.has(refKey(ref))) refs.set(refKey(ref), ref)
      }
    }
  }
  return [...refs.values()]
}

export interface AutoPinDeps {
  ado: () => Pick<AppConfig['ado'], 'defaultOrg' | 'defaultProject' | 'branchTemplate'>
  /** The workspace's `.app/config.json` branch template; null = use the global one. */
  workspaceTemplate: (workspacePath: string) => string | null
  autoPin: (refs: PinnedTask[]) => Promise<{ added: number; snapshot: TasksSnapshot }>
  emit: (snapshot: TasksSnapshot) => void
  logError: (err: unknown) => void
}

/**
 * One auto-pin pass over a freshly built tree (APIN-05, APIN-06): derives the
 * refs, pins what is new, and pushes the snapshot only when something was
 * added. Never rejects — it runs detached from `tree:get`.
 */
export async function runAutoPin(tree: WorkspaceNode[], deps: AutoPinDeps): Promise<void> {
  try {
    const ado = deps.ado()
    const refs = derivedTaskRefs(
      tree,
      (path) => deps.workspaceTemplate(path) ?? ado.branchTemplate,
      ado
    )
    const { added, snapshot } = await deps.autoPin(refs)
    if (added > 0) deps.emit(snapshot)
  } catch (err) {
    deps.logError(err)
  }
}
