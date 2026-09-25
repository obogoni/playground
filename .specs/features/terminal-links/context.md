# Terminal Links Context

**Gathered:** 2026-09-18
**Spec:** `.specs/features/terminal-links/spec.md`
**Status:** Ready for design

---

## Feature Boundary

In the embedded agent terminal (`TerminalPane`), `http(s)` URLs, explicit OSC 8 hyperlinks and
file paths printed by the agent become links. **Ctrl+click** opens a URL in the default browser
and a file with the Windows default app for its type. Nothing else about the terminal's mouse
handling changes: plain clicks, drags and wheel keep reaching the agent exactly as today.

Reference implementation studied: Orca (`stablyai/orca` v1.4.197, clone at `E:\source\orca`,
`src/renderer/src/components/terminal-pane/`). Orca's model is the same xterm.js machinery
(`@xterm/addon-web-links`, `terminal.options.linkHandler`, `registerLinkProvider`) plus a
Ctrl+click direct gesture. What we port is the detection and the gesture; what we leave behind
is listed under Deferred Ideas.

---

## Implementation Decisions

### Path recognition

- A path becomes a link only when it **exists on disk**. The renderer asks main whether the
  resolved absolute path exists; the answer is cached per pane. No existence, no underline —
  `a/b` in prose never lights up.
- Recognized shapes: a path with at least one separator (`src/lib/foo.ts`, `E:\Repos\X\Foo.cs`,
  `./rel/a.md`, `..\b.sql`, `~/x`) with an optional `:line` and `:line:col` suffix; and a path
  whose segments contain **spaces** (`E:\Meus Docs\a.txt`). The spaced form is bounded by the
  existence check: the longest candidate that exists wins.
- Relative paths resolve against the session's **initial cwd** (`SessionView.cwd`, the worktree
  the agent was spawned in). Static — no OSC 7 tracking.
- Declined: the MSBuild/C# `Foo.cs(40,12)` form and bare filenames without a separator
  (`Foo.cs`, `package.json`). Both recorded as assumptions.

### File destination

- Ctrl+click opens the file with the **Windows default app** for its extension
  (`shell.openPath`). When Windows has no association, the app shows the native **"Open with"**
  chooser (`rundll32 shell32.dll,OpenAs_RunDLL <path>`).
- A **directory** opens in File Explorer (the existing launcher).
- **No** Shift+Ctrl alternate gesture in v1 — one gesture, one destination.
- **Executable files are treated like any other file** (`.exe`, `.cmd`, `.bat`, `.ps1`, `.msi`,
  `.lnk`, `.vbs`, `.js`, `.jar`): Ctrl+click launches whatever Windows associates. Owner
  decision, taken with the risk on the table (a wrong click on a `.ps1` the agent printed runs
  it). Orca does not block them either.
- `:line:col` is **parsed** (so the suffix does not break the existence check) but **not
  delivered**: the default-app launch has no way to carry it. Only an editor launched with its
  own CLI (`code -g`) could — declined with the VS Code option.
- A failed open (no app, path vanished between hover and click, `openPath` error) surfaces a
  **toast**, the same channel the worktree launchers use.

### Visual affordance

- **Underline on hover only** — xterm's own link decoration. **No tooltip.** (The position
  question was answered "bottom-left, like Orca" but is void without a tooltip; kept here in case
  a tooltip is added later.)

### Living with the agent's mouse

- Ctrl+click **over a link** is intercepted at the capture-phase `mousedown` on the pane
  container and never reaches xterm — so no mouse report reaches the agent (Claude Code and
  opencode enable mouse tracking). Ctrl+click **anywhere else** is untouched and reaches the
  agent as today.
- Ctrl+drag starting on a link opens **nothing**: the link activates only if the button is
  released on the same link with **< 4 px** of pointer movement (Orca's rule). Selection stays
  Shift+drag, unchanged.
- Plain click on a link: unchanged (no popover, no open).

### URLs

- Only **`http` and `https`** open, validated in the **main** process before
  `shell.openExternal` (the renderer is never trusted with the scheme decision). Other schemes
  (`mailto:`, `vscode://`, `ms-teams:`) never open; since the 2026-09-19 amendment they do get
  xterm's hover underline as OSC 8 targets (the gate is all-or-nothing) and Ctrl+click passes
  through.
- An OSC 8 hyperlink whose target is `file://` is routed as a file path (withdrawn at Design,
  reinstated by the 2026-09-19 amendment once Claude Code was seen emitting it with
  `FORCE_HYPERLINK`). `file://` in plain text is not detected.
- The owner's reference for the look (2026-09-19): Orca — file paths dashed, external links blue.
  Both come from the agent's own OSC 8 + colour once `FORCE_HYPERLINK=1` is in the environment;
  the app claims it for every session and does not style plain-text links itself.
- A failed URL open surfaces a toast.

### Agent's Discretion

- Regex shape and candidate bounding for spaced paths; cache keying; how the pending Ctrl
  gesture is tracked; how the existence check is batched per row; how `onToast` reaches
  `TerminalPane`.

### Declined / Undiscussed Gray Areas → Assumptions

- MSBuild `path(line,col)` form — not selected; assumption logged.
- Bare filename links — not selected; assumption logged.
- Tooltip — declined; assumption logged.
- Shift+Ctrl alternate — declined; assumption logged.

---

## Specific References

- "assim como faço no orca hoje" — Orca's Ctrl+click behavior is the reference for the gesture.
- Windows "Open with" dialog when no app is associated (owner's wording: "se não houver app
  padrão para abrir o arquivo, abrir janela para escolher onde abrir").

---

## Deferred Ideas

- Single-click action popover (Orca's `TerminalLinkActionPopover`) — needs deferring the PTY
  mouse reports while deciding whether the click is a link action; Orca's
  `terminal-link-pty-mouse-suppression.ts`.
- Shift+Ctrl+click alternate destination (e.g. VS Code at line via `code -g path:line:col`).
- Tooltip with the resolved destination and the gesture hint.
- Hard-wrapped links (a URL or path the TUI re-drew across rows without xterm's soft-wrap flag) —
  Orca's `hard-wrapped-terminal-http-links.ts` / `hard-wrapped-terminal-path-fragments.ts`.
- MSBuild `Foo.cs(40,12)` and `dotnet test` output forms.
- Live cwd via OSC 7 for relative paths after a `cd`.
- Bare filename detection against the cwd (VS Code's word-link detector).
- Upgrading `@xterm/xterm` to 6.1 for `mouseEventsRequireAlt` (Orca's way of keeping a link
  gesture from the TUI).
- Ctrl+click on an OSC 8 link that was never hovered (output painted under a still pointer): the
  pane only knows the OSC 8 target from xterm's last `hover`, so it falls to text detection. Every
  Claude Code tool header is OSC 8 since LINK-33, so this is now the common case of LINK-19;
  resolving the target at mousedown would close it (found by the pass 3 Verifier, 2026-09-24).
