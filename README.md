# Playground

A Windows desktop app that bridges Azure DevOps work items to git worktrees — one place to see every worktree across registered workspaces, pin the ADO tasks being worked on, spin up task-linked worktrees, and launch Explorer / Windows Terminal / VS Code rooted at any worktree.

Built for a solo developer juggling multiple multi-repo projects with several AI coding agents running in parallel on different branches.

## Stack

- [Electron](https://www.electronjs.org/) + [React](https://react.dev/) + TypeScript, scaffolded with [electron-vite](https://electron-vite.org/)
- [Vitest](https://vitest.dev/) for behavior-level tests (real git/FS in temp dirs)
- JSON config persisted to `%APPDATA%/playground/config.json`

## Development

```bash
npm install
npm run dev        # start the app with HMR
npm test           # run tests
npm run typecheck  # type-check main + renderer
npm run lint       # eslint
npm run build:win  # production build + Windows installer
```

## Project docs

- `.specs/project/` — vision, roadmap, and decision log
- `.specs/features/` — per-feature spec → design → tasks
- `design/handoff/` — visual design reference (tokens, prototype); reference-only, never shipped
