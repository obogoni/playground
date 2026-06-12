/** Handoff §Semantic color usage — type pills. */
export function typeClass(type: string): string {
  switch (type.toLowerCase()) {
    case 'bug':
      return 'red'
    case 'feature':
      return 'accent'
    case 'chore':
      return 'amber'
    default:
      return 'muted'
  }
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
