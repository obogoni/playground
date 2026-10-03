import type { CreateStep } from '../../../shared/worktrees'

/** How the create dialogs' progress line names each step (CRTO-16). */
export const STEP_LABELS: Record<CreateStep, string> = {
  'refreshing-base': 'Updating base branch from remote…',
  'creating-worktree': 'Creating worktree…',
  'running-hook': 'Running post-create command…'
}

/** The progress line before the first step arrives (CRTO-16). */
export const PREPARING_LABEL = 'Preparing…'

/** The busy dialog's Cancel tooltip (CRTO-20). */
export const BUSY_CANCEL_TITLE = 'Wait for the create to finish'

/** The progress line for the last step pushed, or `Preparing…` before any. */
export function progressLabel(step: CreateStep | null): string {
  return step === null ? PREPARING_LABEL : STEP_LABELS[step]
}

/**
 * Whether a pushed step belongs to the dialog's create in flight: only a step for
 * its own request id, and none once the create settled (CRTO-16, CRTO-17).
 */
export function acceptsStep(current: string | null, event: { requestId: string }): boolean {
  return current !== null && current === event.requestId
}
