import { taskIdFromBranch, type SessionTask } from '../shared/tasks'
import type { PeriodSnapshotFields, PeriodTaskChoice, TimePeriod } from '../shared/time'

type PinnedTitle = (id: number) => string | null

/** The task id a branch names by the branch rule; null for a null branch. */
export function branchTaskId(branch: string | null): number | null {
  return branch === null ? null : taskIdFromBranch(branch)
}

/**
 * The snapshot a linked session's period records (HTSK-09..11). No link, or a
 * link to the task the branch already names, leaves the snapshot as it is;
 * otherwise the link's id and title (or the pinned title) replace the branch's,
 * with `taskByHand: true` (HTSK-36, HTSK-37). No flag is the absent key.
 */
export function withSessionTask(
  snapshot: PeriodSnapshotFields,
  task: SessionTask | null,
  pinnedTitle: PinnedTitle
): PeriodSnapshotFields {
  if (task === null || task.id === snapshot.taskId) return snapshot
  return {
    ...snapshot,
    taskId: task.id,
    taskTitle: task.title ?? pinnedTitle(task.id),
    taskByHand: true
  }
}

/**
 * The task fields a closed period records after a drawer choice (HTSK-25..27).
 * The flag is present only when the chosen task differs from the task the
 * period's branch names; From branch never carries it (HTSK-36, HTSK-37).
 */
export function reassignFields(
  period: TimePeriod,
  choice: PeriodTaskChoice,
  pinnedTitle: PinnedTitle
): Pick<TimePeriod, 'taskId' | 'taskTitle' | 'taskByHand'> {
  const fromBranch = branchTaskId(period.branch)
  if (choice.kind === 'branch') {
    return {
      taskId: fromBranch,
      taskTitle: fromBranch === null ? null : pinnedTitle(fromBranch)
    }
  }
  const taskId = choice.kind === 'task' ? choice.id : null
  const taskTitle = choice.kind === 'task' ? (choice.title ?? pinnedTitle(choice.id)) : null
  return taskId === fromBranch ? { taskId, taskTitle } : { taskId, taskTitle, taskByHand: true }
}
