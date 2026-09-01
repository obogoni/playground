import type { WorkItemDetails } from '../../../shared/tasks'

/** Handoff §Semantic color usage — type pills. Colors sourced from an
 * Azure DevOps process definition (`wit/workitemtypes`, 2026-08-31) per
 * TYPE-01; types the process does not define fall back to neutral
 * `muted` (TYPE-02). */
export function typeClass(type: string): string {
  switch (type.trim().toLowerCase()) {
    case 'bug':
      return 'tp-bug'
    case 'task':
      return 'tp-task'
    case 'user story':
      return 'tp-user-story'
    case 'feature':
      return 'tp-feature'
    case 'epic':
      return 'tp-epic'
    case 'issue':
      return 'tp-issue'
    case 'code review request':
    case 'code review response':
      return 'tp-code-review'
    case 'fault':
      return 'tp-fault'
    case 'initiative':
      return 'tp-initiative'
    case 'request':
      return 'tp-request'
    case 'test case':
      return 'tp-test-case'
    case 'test plan':
      return 'tp-test-plan'
    case 'test suite':
      return 'tp-test-suite'
    case 'feedback request':
    case 'feedback response':
      return 'tp-feedback'
    case 'shared steps':
      return 'tp-shared-steps'
    case 'shared parameter':
      return 'tp-shared-parameter'
    default:
      return 'muted'
  }
}

/** The type the badge shows: a Task's first non-Task ancestor (BPTK-01), or the
 * item's own type when it isn't a Task / the parent couldn't be resolved. */
export function badgeTypeOf(details: WorkItemDetails): string {
  return details.parentType ?? details.type
}

/** Handoff §Semantic color usage — state pills/dots. */
export function stateClass(state: string): string {
  switch (state.toLowerCase()) {
    case 'active':
      return 'green'
    case 'new':
      return 'blue'
    case 'in progress':
      return 'amber'
    case 'resolved':
      return 'accent'
    case 'closed':
      return 'faint'
    default:
      return 'muted'
  }
}
