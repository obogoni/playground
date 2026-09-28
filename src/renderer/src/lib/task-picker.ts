import type { PinnedTaskView } from '../../../shared/tasks'
import type { PeriodTaskChoice } from '../../../shared/time'
import { badgeTypeOf } from './task-pills'

/** One row of the task picker. */
export interface PickerEntry {
  /** React key: `none`, `branch` or `task:{id}`. */
  key: string
  /** `#{id}` for a pinned task; the special's name otherwise. */
  label: string
  /** Type pill after the id; null for a special or a pin without cached details. */
  badgeType: string | null
  /** Title after the pill; null for a special or a pin without cached details. */
  title: string | null
  choice: PeriodTaskChoice
}

/** The looked-up work item's row (HTSK-02). */
export interface LookupEntry {
  key: string
  /** `{type} #{id} {title}`. */
  text: string
  choice: PeriodTaskChoice
}

/**
 * The picker's fixed choices: `No task` (the drawer only, HTSK-24), `From
 * branch`, then the pinned tasks, the first pin of an id only, like the rail
 * (HTSK-01). A pin keeps its title in the choice, null without cached details
 * (HTSK-06).
 */
export function pickerEntries(
  tasks: PinnedTaskView[],
  specials: { fromBranch: boolean; noTask: boolean }
): PickerEntry[] {
  const entries: PickerEntry[] = []
  if (specials.noTask) {
    entries.push({
      key: 'none',
      label: 'No task',
      badgeType: null,
      title: null,
      choice: { kind: 'none' }
    })
  }
  if (specials.fromBranch) {
    entries.push({
      key: 'branch',
      label: 'From branch',
      badgeType: null,
      title: null,
      choice: { kind: 'branch' }
    })
  }
  const seen = new Set<number>()
  for (const task of tasks) {
    if (seen.has(task.id)) continue
    seen.add(task.id)
    const title = task.details?.title ?? null
    entries.push({
      key: `task:${task.id}`,
      label: `#${task.id}`,
      badgeType: task.details ? badgeTypeOf(task.details) : null,
      title,
      choice: { kind: 'task', id: task.id, title }
    })
  }
  return entries
}

/** The row a successful lookup shows; choosing it keeps the id and the title. */
export function lookupEntry(item: { id: number; type: string; title: string }): LookupEntry {
  return {
    key: `lookup:${item.id}`,
    text: `${item.type} #${item.id} ${item.title}`,
    choice: { kind: 'task', id: item.id, title: item.title }
  }
}
