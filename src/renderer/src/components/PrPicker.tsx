import type { JSX } from 'react'
import type { PrSummary } from '../../../shared/files'
import { prKey, prLabel } from '../lib/pr-view'
import { providerName } from '../lib/pr-lookup'
import './PrPicker.css'

/**
 * Which of several active pull requests the mode shows (FPRA-04): each named
 * by its provider, number, title and target branch — the provider first, so
 * an Azure DevOps and a GitHub pull request of one branch tell apart at a
 * glance even with equal numbers (FPRG-07). The choice is the hook's, kept per
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
        value={current ? prKey(current) : ''}
        onChange={(event) => {
          const picked = prs.find((pr) => prKey(pr) === event.target.value)
          if (picked) onChoose(picked)
        }}
      >
        {current === null && (
          <option value="" disabled>
            Choose one of {prs.length} pull requests…
          </option>
        )}
        {prs.map((pr) => (
          <option key={prKey(pr)} value={prKey(pr)} data-provider={pr.target.provider}>
            {providerName(pr.target.provider)} · {prLabel(pr)} {pr.title} → {pr.targetBranch}
          </option>
        ))}
      </select>
    </label>
  )
}
