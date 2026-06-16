# Feature: Repository Presentation (README + Screenshots)

**Status:** In progress
**Scope:** Medium (docs + one capture helper). No app behavior changes.

## Why

The root `README.md` predates the entire M5 work (embedded agent sessions) and still
describes the skinny v1 ("no xterm.js, no node-pty"). The GitHub repo reads as a stub.
Goal: a README that reflects everything actually shipped (M1–M5 + post-v1 worktree
template), with screenshots so a visitor sees the app at a glance.

## Decisions (from grilling)

- **Screenshot source:** render the existing design prototype
  (`design/handoff/Worktree Manager.dc.html`), which carries placeholder data — the repo
  is **public**, so live-app shots (real ADO task titles / internal repo names) are out.
  The prototype is hifi and matches the shipped UI.
- **Featured views:** Tree (3-pane), Agents (embedded sessions), Board.
- **Description scope:** README rewrite only. GitHub "About" blurb + topics are
  **intentionally left untouched** (owner's call).

## Requirements

- **RP-01** A repeatable capture helper renders the prototype and saves PNGs for the
  three directions (Tree, Board, Agents) in the dark theme, without requiring the live
  app or any real ADO/workspace data.
- **RP-02** Screenshots are committed under `docs/screenshots/` and referenced from the
  README with relative paths (render on GitHub).
- **RP-03** README rewrite covers: one-line pitch, screenshots, the full current feature
  set grouped by capability (navigation, worktree lifecycle, ADO tasks + start-work,
  board, embedded agent sessions, configurability), the real stack (Electron + React 19 +
  TS, node-pty, xterm.js, streaming IPC, Vitest), and the dev/build commands.
- **RP-04** README points at `.specs/` and the design handoff as deeper references, and
  is honest about platform scope (Windows-only) and ADO auth (`az` CLI, no stored secrets).

## Out of scope

- GitHub About/topics, social preview image, CONTRIBUTING/LICENSE.
- Any change to app code, IPC, or tests.
- Light-theme or dialog-state screenshots (can be added later from the same helper).

## Verification

- Capture helper produces 3 non-empty PNGs.
- `npm run lint` clean (helper script lints).
- README renders correctly (relative image paths resolve in the repo).
