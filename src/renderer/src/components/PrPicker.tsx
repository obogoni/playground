import type { JSX } from 'react'
import type { PrRef, PrSummary } from '../../../shared/files'
import './PrPicker.css'

/** One option's value: the pull request's repository and number, which name it. */
function keyOf(pr: PrRef): string {
  return [pr.target.org, pr.target.project, pr.target.repo, pr.id].join('/')
}

/**
 * Which of several active pull requests the mode shows (FPRA-04): each named
 * by its number, title and target branch. The choice is the hook's, kept per
 * worktree while the app runs, so leaving the worktree and coming back finds
 * the same pull request. The caller shows it only when there is more than one.
 */
export function PrPicker({
  prs,
  current,
  onChoose
}: {
  prs: PrSummary[]
  current: PrSummary | null
  onChoose: (pr: PrSummary) => void
}): JSX.Element {
  return (
    <label className="pr-picker">
      <span className="pr-picker-label">Pull request</span>
      <select
        className="pr-picker-select"
        value={current ? keyOf(current) : ''}
        onChange={(event) => {
          const picked = prs.find((pr) => keyOf(pr) === event.target.value)
          if (picked) onChoose(picked)
        }}
      >
        {current === null && (
          <option value="" disabled>
            Choose one of {prs.length} pull requests…
          </option>
        )}
        {prs.map((pr) => (
          <option key={keyOf(pr)} value={keyOf(pr)}>
            !{pr.id} {pr.title} → {pr.targetBranch}
          </option>
        ))}
      </select>
    </label>
  )
}
