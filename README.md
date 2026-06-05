# Worktree Launcher

Windows desktop app that hosts AI coding agents per git worktree.
Implements the Skinny MVP described in [the PRD (issue #1)](docs/) — see the issue tracker for the full feature breakdown.

## Stack

- Electron + React + TypeScript
- `node-pty` + `xterm.js` for terminal sessions
- YAML / JSON files on disk for persistence (no DB)

## Getting started

```powershell
npm install
npm run dev      # launch app in dev mode
npm test         # run module unit tests
npm run build    # production build
```

## Project layout

```
src/
  main/              Electron main process + business modules
    modules/
      WorkspaceRegistry.ts
      RepoScanner.ts
      WorktreeManager.ts
      TabSession.ts
      AgentLibrary.ts
      ShortcutLauncher.ts
  preload/           Context-bridged IPC surface
  renderer/          React UI (sidebar, worktree pane, terminal, dialogs)
  shared/            Types shared across processes
tests/               vitest specs against real fs / real git in temp dirs
```

## Persistence

- Global config: `%APPDATA%/worktree-launcher/`
  - `workspaces.json` — registered workspaces
  - `agents.json` — global simple-agent library
- Per-workspace config: `<workspace>/.app/agents/*.yaml`
