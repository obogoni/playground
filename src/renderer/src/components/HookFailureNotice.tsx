import type { JSX } from 'react'
import type { PostCreateHookResult } from '../../../shared/worktrees'
import { Icon } from './Icon'
import './HookFailureNotice.css'

interface HookFailureNoticeProps {
  /** Absolute path of the worktree that WAS created (WPC-12/13). */
  worktreePath: string
  hook: PostCreateHookResult
  /** Dismisses the notice and continues the normal post-create flow (WPC-14). */
  onProceed: () => void
}

/**
 * Inline report for a post-create command that failed (WPC-12/13), shown in the
 * dialog's footer region like `BranchExistsChoice`. Deliberately **amber, not
 * red**: the create itself succeeded and the worktree is kept (WPC-03) — only its
 * initialization fell over, so this is an advisory, not a failure.
 *
 * Leads with the created path so the outcome is unambiguous, then the evidence:
 * the command, how it ended, and the captured output tail. The single action
 * continues into the normal post-create flow rather than offering an undo (WPC-14),
 * and the create button is not rendered while this is up, so the same create can
 * never be re-submitted (WPC-16).
 */
export function HookFailureNotice({
  worktreePath,
  hook,
  onProceed
}: HookFailureNoticeProps): JSX.Element {
  return (
    <div className="hook-failure">
      <div className="hook-failure-head">
        <Icon name="alert" size={14} />
        <span>Worktree created, but its init command failed</span>
      </div>
      <div className="hook-failure-path">{worktreePath}</div>
      <div className="hook-failure-cmd">{hook.command}</div>
      <div className="hook-failure-code">
        {hook.timedOut ? 'timed out and was stopped' : `exit code ${hook.code}`}
      </div>
      {hook.output !== '' && <pre className="hook-failure-output">{hook.output}</pre>}
      <div className="hook-failure-note">
        The worktree was kept — run the command yourself in it once the cause is fixed.
      </div>
      <div className="hook-failure-actions">
        <button type="button" className="dialog-btn-primary" onClick={onProceed} autoFocus>
          Continue
        </button>
      </div>
    </div>
  )
}
