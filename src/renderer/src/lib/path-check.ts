import type { PathCheckRequest } from '../../../shared/worktrees'

/** How long the dialogs wait after the last change before asking main (BSLG-23). */
export const PATH_CHECK_DELAY_MS = 250

/** The dialog values a path check answer belongs to; absent and empty optional values alike. */
export function pathCheckKey(req: PathCheckRequest): string {
  return JSON.stringify([
    req.repoPath,
    req.branch,
    req.baseBranch || '',
    req.worktreeTemplate || ''
  ])
}

export interface PathCheckAnswer {
  key: string
  problem: string | null
}

/** The answer's problem only when it was given for the values the dialog shows now (BSLG-42). */
export function problemFor(answer: PathCheckAnswer | null, key: string): string | null {
  return answer !== null && answer.key === key ? answer.problem : null
}
