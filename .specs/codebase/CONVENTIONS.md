# Conventions

Project conventions for the ADO Task & Worktree Manager. Add to this file as
patterns solidify.

## Git & Pull Requests

- **PRs must close their respective issue, if any.** Include a GitHub closing
  keyword + the issue number in the PR **body** (not the title), e.g.
  `Closes #25`. Merging into `main` then auto-closes the linked issue. In this
  repo's planning pipeline (issue = feature = PR), the feature issue number
  matches the feature synced from `.specs/` via `tlc-to-issues`. Use one
  `closes` keyword per issue when a PR resolves several (`Closes #24, closes #25`).
