import type { AppConfig } from '../shared/config'
import { taskIdFromTemplate, type PinnedTask } from '../shared/tasks'
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
