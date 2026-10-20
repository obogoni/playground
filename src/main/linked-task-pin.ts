import type { SessionTask, TasksSnapshot } from '../shared/tasks'

export interface LinkedPinDeps {
  pinLinked: (id: number) => Promise<{ added: number; snapshot: TasksSnapshot }>
  emit: (snapshot: TasksSnapshot) => void
  logError: (err: unknown) => void
}

/**
 * Pins the task a session was just linked to (PRST-45, AD-064) and pushes the
 * snapshot only when a pin was added (PRST-47). A link back to the branch
 * (`null`) or no link pins nothing. Never rejects: callers start it detached,
 * after the spawn or the link has already been saved (PRST-46).
 */
export async function runLinkedPin(
  task: SessionTask | null | undefined,
  deps: LinkedPinDeps
): Promise<void> {
  if (!task) return
  try {
    const { added, snapshot } = await deps.pinLinked(task.id)
    if (added > 0) deps.emit(snapshot)
  } catch (err) {
    deps.logError(err)
  }
}
