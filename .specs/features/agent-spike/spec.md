# Agent Spike (AM1 — De-risk the native + streaming stack) Specification

**Milestone:** M5 — Embedded Agent Sessions (first M5 feature; the de-risk spike)
**Sources of truth:** PRD issue #37 (stories 1, 2, 15, 16, 18, 39, 40 — partial, spike subset; §Hosting model; §Implementation Decisions — spawn-plan builder + PtyPort; AD-004 streaming IPC; §Testing Decisions; §Further Notes "AM1 — De-risk spike"), `design/handoff/DESIGN_HANDOFF_AGENTS.md` (§C-b Terminal detail surface, §Terminal theming production note, §Changes to the Global Shell — `blink` caret keyframe), STATE.md AD-004
**Scope size:** Large — the app's **first native module** (`node-pty`) and **first streaming IPC** (AD-004), plus a **packaging** concern. Design phase required (architecture is the point of the spike); tasks phase required. This spec is deliberately thin per AD-001 and references the PRD + handoff rather than restating them.

## Problem Statement

The whole embedded-agent feature (PRD #37) rests on three pieces of plumbing the codebase has never used: a **native module** (`node-pty`, rebuilt against Electron's ABI and surviving `asar` packaging), a **streaming IPC** layer (continuous PTY bytes pushed main→renderer, keystrokes/resize fired renderer→main — AD-004), and an **embedded terminal** (`xterm.js`). Each is a known failure point (native rebuild / asar unpacking / electron-builder packaging in particular). Building the full Agents view on top of unproven plumbing risks discovering a packaging dead-end after a large UI investment. AM1 proves the scary stack end-to-end with the **thinnest** possible slice — one hard-coded agent in one live, interactive, **packaged** terminal — so AM2/AM3 grow on verified ground.

## Goals

- [ ] A live `node-pty` PTY is spawned in the main process via a `PtyPort` adapter and a pure **spawn-plan builder** (shell auto-runs the agent; `pwsh` default, `cmd` fallback)
- [ ] Typed **streaming IPC** (AD-004): `IpcEvents` (`session:data` / `session:exit`) + `IpcSends` (`session:input` / `session:resize`) maps beside `IpcContract`, with typed `on()` / `send()` wrappers and a preload `on` / `send` bridge
- [ ] An embedded **`xterm.js` terminal** renders the PTY output and forwards keystrokes — fully bidirectional and interactive (type to the agent, see it respond, answer prompts)
- [ ] **The packaged build works**: `npm run build:win` produces an installer whose installed app spawns the PTY and runs the agent (native module rebuilt + asar-unpacked as needed) — the single most important de-risk outcome
- [ ] The **permanent plumbing is isolated from the throwaway scaffolding**: `PtyPort`, the streaming-IPC maps/wrappers/bridge, the `spawn-plan` builder, `TerminalPane`, and the packaging fix are kept and grown by AM2/AM3; only the single-hard-coded-agent trigger is thrown away

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Session rail / cards / master-detail Agents view | AM2 — the spike has **one** terminal, no rail (PRD §Further Notes) |
| Persistence, restore-as-stopped, respawn, `AppConfig.sessions[]` | AM2 — no persisted state in the spike |
| `SessionManager`, `SessionRingBuffer`, scrollback replay, attach/detach | AM2 — the spike streams one live PTY with no buffering/replay |
| Multiple sessions, worktree attachment, derived task tags, reconciliation, path-missing | AM2 — the spike spawns in one fixed cwd with no worktree model |
| Entry points (+ New session, worktree/board/task spawn, sidebar context) | AM2 — the spike uses a throwaway dev trigger |
| Configurable agent definitions, ad-hoc command, Settings dialog, default-shell setting | AM3 — the spike hard-codes one agent and the default shell |
| Worktree-delete-vs-running confirmation, rename/duplicate/remove, concurrency warning | AM3 |
| Task→agent auto-briefing (`promptTemplate`) | PRD Out of Scope — reserved field, deferred to v3 |
| Sessions surviving app restart as live processes (daemon) | PRD Out of Scope — PTYs die on quit |

---

## Decisions (gray areas resolved during Specify)

- **Throwaway trigger, permanent mount.** The spike needs *some* way to reach the one terminal. Decision: a **minimal dev-only trigger** mounts a single bare `TerminalPane` (e.g. a temporary third "Agents" segment that renders only the terminal surface, or a debug button) — explicitly throwaway. `TerminalPane` itself (the xterm wrapper + streaming-IPC client) is **permanent** and grows into AM2's terminal detail. The polished Agents segment + master-detail rail is AM2. ⚠️ Flagged for user review.
- **Hard-coded agent + fixed cwd.** AM1 hard-codes **one** agent (Claude, command `claude`) spawned through the real spawn-plan (`pwsh` runs `claude`), in **one fixed cwd** — a real folder picked at spawn or a hard-coded path. The full cwd/worktree-attachment model is AM2. Hard-coding the *agent and cwd* is throwaway; the *spawn-plan builder* that turns `(agentDef, cwd, shell) → { shell, args, autoCommand }` is permanent and unit-tested. ⚠️ Flagged for user review (agent choice = Claude).
- **node-pty packaging strategy is the spike's core question** *(design-phase detail, recorded here so Design resolves it explicitly)*: rely first on the existing `postinstall: electron-builder install-app-deps` (rebuild against Electron's ABI) + electron-vite **externalizing** `node-pty` (not bundling it); if the packaged app can't load the native `.node`, add `asarUnpack` for `node-pty` to `electron-builder.yml`. The spike is not "done" until a **packaged** (not just `dev`) build runs the PTY.
- **Streaming IPC follows AD-004 exactly** — two new maps (`IpcEvents`, `IpcSends`) beside `IpcContract`, typed `on()`/`send()` peers to the existing typed `handle()`, preload exposes `on`/`send` alongside `invoke`. No multiplexed channel, no `MessageChannel`. The spike implements `session:data`/`session:exit` (main→renderer) and `session:input`/`session:resize` (renderer→main); `session:status` and the `sessions:*` request/response control verbs arrive with the lifecycle work in AM2.
- **`PtyPort` and the IPC wiring are hand-verified, not unit-tested** — per `TESTING.md` (thin OS/Electron shells). The spike's only unit-tested seam is the pure **spawn-plan builder**. This is intentional: the spike's risk lives in the OS/packaging boundary, which unit tests cannot exercise — its gate is a real packaged build + hand-run terminal, not a test count.
- **Basic theming in the spike, full token-mapping as P2** — the terminal must be readable in both themes, but re-emitting the full ANSI-token map on theme toggle (handoff §Terminal theming) is the P2 polish; a correct background/foreground/cursor mapping is enough to prove the approach.

---

## User Stories

### P1: Spawn-plan builder (pure helper) ⭐ MVP

**User Story**: As a developer, I want the agent launched inside a shell that auto-runs it (not the agent binary directly), so that npm `.cmd`/`.ps1` shims and PATH resolve naturally and I never hit the spawn-ENOENT class of bug (PRD story 15; §Implementation Decisions — spawn-plan).

**Why P1**: It is the one piece of decision logic in the spike and the permanent seam every later spawn rides on.

**Acceptance Criteria**:

1. WHEN `buildSpawnPlan(agentDef, cwd, shellSetting)` is called THEN it SHALL return `{ shell, args, autoCommand }` where `shell` is the chosen shell binary (`pwsh` by default, `cmd` fallback), and `autoCommand` is the agent's `command args` to auto-run inside that shell
2. WHEN the shell is `pwsh` THEN the plan SHALL invoke the agent so that `.cmd`/`.ps1` PATH shims resolve (agent run as a shell command, not as the spawned executable)
3. WHEN the shell is `cmd` THEN the plan SHALL produce the cmd-equivalent auto-run form
4. WHEN `cwd` is passed THEN it SHALL be carried through as the PTY working directory (the builder does not itself touch the filesystem)

**Independent Test**: Vitest pure input→output (style of `shortcut-launcher.test.ts`) — assert the plan for Claude under `pwsh` and under `cmd`; assert cwd passthrough; no FS, no spawn.

---

### P1: PtyPort spawns a live shell-hosted PTY ⭐ MVP

**User Story**: As a developer, I want the app to spawn a real PTY running the agent inside a worktree-rooted shell, so that an embedded terminal has a live process behind it (PRD stories 1, 15, 16; §Modules — `PtyPort`).

**Why P1**: This is the native-module proof — `node-pty` spawning + streaming + exit under Electron's ABI.

**Acceptance Criteria**:

1. WHEN `PtyPort.spawn({ shell, args, cwd })` is called THEN a `node-pty` PTY (Windows ConPTY) SHALL start the shell in `cwd` and auto-run the agent per the spawn-plan, **inheriting the developer's environment** (PATH etc.)
2. WHEN the PTY emits output THEN `onData` SHALL deliver it; WHEN `write(data)` is called THEN keystrokes SHALL reach the PTY; WHEN `resize(cols, rows)` is called THEN the PTY SHALL resize
3. WHEN the agent exits on its own THEN the shell SHALL remain live (the developer drops back to a prompt) and the PTY SHALL stay open; WHEN the shell itself exits THEN `onExit` SHALL fire with the exit code
4. WHEN `kill()` is called THEN the PTY process SHALL terminate
5. `node-pty` is added as a **runtime dependency**, rebuilt by the existing `postinstall` (`electron-builder install-app-deps`) and **externalized** by electron-vite (not bundled)

**Independent Test**: Hand-verified (thin OS shell, per `TESTING.md`) — run `dev`, confirm the agent banner appears, type to it and watch it respond, `exit` the shell and confirm the exit event. Covered end-to-end by ASPK-04 (TerminalPane) and ASPK-05 (packaged build).

---

### P1: Typed streaming IPC (AD-004) ⭐ MVP

**User Story**: As a developer, I want PTY bytes pushed to the renderer and my keystrokes fired back, so that an embedded terminal is genuinely interactive without per-keystroke request/response round-trips (AD-004).

**Why P1**: The first streaming IPC — proving the typed event/send maps work is a primary de-risk goal and the permanent transport for every later session.

**Acceptance Criteria**:

1. WHEN the contract is extended THEN `IpcEvents` (main→renderer: `session:data`, `session:exit`) and `IpcSends` (renderer→main: `session:input`, `session:resize`) SHALL exist as typed maps **beside** `IpcContract` in `src/shared/ipc-contract.ts`, each payload carrying the session `id`
2. WHEN main pushes PTY output THEN it SHALL use a typed `on`/emit helper (peer to the existing typed `handle()`); WHEN the renderer sends keystrokes/resize THEN it SHALL use a typed `send()` wrapper
3. WHEN preload runs THEN the bridge SHALL expose `on` (subscribe to events, returning an unsubscribe) and `send` (fire-and-forget) alongside the existing `invoke`
4. WHEN the PTY exits THEN a `session:exit` event SHALL reach the renderer with the exit code

**Independent Test**: Hand-verified IPC wiring (per `TESTING.md`) — exercised through the live terminal in ASPK-04; typecheck proves the maps are coherent.

---

### P1: Embedded xterm TerminalPane with live I/O ⭐ MVP

**User Story**: As a developer, I want to read from and type into the agent terminal exactly like a normal terminal, so that I can answer the agent's prompts and approvals from inside the app (PRD stories 2, 18; handoff §C-b terminal surface).

**Why P1**: The xterm proof and the visible payoff of the spike — a real interactive terminal in the app window.

**Acceptance Criteria**:

1. WHEN a session is active THEN `TerminalPane` SHALL mount an `@xterm/xterm` instance (with `@xterm/addon-fit`) and subscribe to `session:data` for that id, writing output to the terminal
2. WHEN the developer types in the terminal THEN keystrokes SHALL be sent over `session:input` to the PTY and echoed by the shell/agent
3. WHEN the agent prompts (e.g. an approval) THEN the developer SHALL be able to answer it from the terminal and see the agent continue
4. WHEN the container resizes THEN `addon-fit` SHALL refit and a `session:resize` SHALL be sent so the PTY matches
5. WHEN `session:exit` arrives THEN the terminal SHALL show a plain "shell exited" indication (no card/rail behavior — that is AM2)

**Independent Test**: Hand-run CDP smoke / visual pass (`scripts/smoke-*.mjs` pattern) — trigger the agent, assert output renders, send input and observe the response, resize the window and confirm reflow.

---

### P1: Rebuilt + packaged proof ⭐ MVP

**User Story**: As a developer, I want the **installed, packaged** app to run the embedded agent — not just `dev` — so that the whole feature is proven shippable before AM2/AM3 build on it (PRD §Further Notes "rebuilt + packaged").

**Why P1**: The native-module + asar packaging path is the highest-risk unknown; an unpackageable PTY would invalidate the entire feature direction. This story is the reason AM1 exists.

**Acceptance Criteria**:

1. WHEN `npm run build:win` runs THEN it SHALL complete with `node-pty` rebuilt against Electron's ABI (no native build error, no bundling of `node-pty` by electron-vite)
2. WHEN the produced installer is installed and launched THEN the embedded terminal SHALL spawn the PTY and run the agent — identical behavior to `dev`
3. IF the packaged app cannot load the native `.node` THEN `node-pty` SHALL be added to `asarUnpack` (electron-builder) until it loads — and the working configuration recorded as a Lesson in STATE.md
4. WHEN the spike is complete THEN the throwaway single-agent trigger SHALL be clearly isolated (so AM2 can remove it without disturbing `PtyPort` / IPC / `TerminalPane` / packaging)

**Independent Test**: Build verification — `npm run build:win`, install the artifact, launch, drive the terminal by hand; record the asar/unpack outcome.

---

### P2: Token-mapped terminal theming + refit

**User Story**: As a developer, I want the embedded terminal styled to match the app's light/dark theme tokens, so that it feels native to the app (PRD story 39; handoff §Terminal theming).

**Why P2**: The terminal must be readable in both themes (covered minimally in P1), but the full token→ANSI mapping and re-emit-on-toggle is polish that doesn't block the de-risk goal.

**Acceptance Criteria**:

1. WHEN `TerminalPane` mounts THEN the xterm theme SHALL map `background → var(--bg)`, `foreground → var(--text)`, `cursor → var(--accent)`, and the ANSI palette to `--green`/`--amber`/`--red`/`--blue`/`--accent`/`--text-muted` (handoff table)
2. WHEN the app theme toggles THEN the xterm theme SHALL be re-emitted so the terminal recolors live
3. WHEN the live prompt shows THEN a blinking caret SHALL render (handoff `blink` keyframe, or xterm's native cursor blink)

**Independent Test**: Visual pass — toggle theme with the terminal open; colors recolor and stay readable in both themes.

---

## Edge Cases

- WHEN `pwsh` is not on PATH THEN the spawn-plan SHALL fall back to `cmd` (the PTY still starts a shell, never spawn-ENOENT)
- WHEN the hard-coded agent command (`claude`) is not installed THEN the shell SHALL surface its own "command not found" inside the terminal and stay live (the spike does not pre-validate the agent — the shell host is exactly what makes this graceful)
- WHEN the window is resized rapidly THEN refit + `session:resize` SHALL coalesce without crashing the PTY
- WHEN the app quits with the PTY running THEN the PTY SHALL be killed (no orphaned process, no daemon) — proven for the single spike session
- WHEN the packaged app runs from `Program Files` (read-only, asar-packed) THEN the native module SHALL still load (this is precisely what ASPK-05 verifies)
- WHEN output arrives as a high-volume burst (e.g. the agent prints a large file) THEN the stream SHALL render without blocking the renderer (spike-level: no ring buffer yet; just confirm it survives)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ASPK-01 | P1: Spawn-plan builder (pure helper) | Pending | Pending |
| ASPK-02 | P1: PtyPort live shell-hosted PTY | Pending | Pending |
| ASPK-03 | P1: Typed streaming IPC (AD-004) | Pending | Pending |
| ASPK-04 | P1: Embedded xterm TerminalPane | Pending | Pending |
| ASPK-05 | P1: Rebuilt + packaged proof | Pending | Pending |
| ASPK-06 | P2: Token-mapped theming + refit | Pending | Pending |

**ID format:** `ASPK-NN` (Agent SPiKe). **Status values:** Pending → In Design → In Tasks → Implementing → Verified.

**Coverage:** 6 total, 0 mapped to tasks yet (Design + Tasks phases pending).

---

## Testing Notes (from PRD §Testing Decisions + `.specs/codebase/TESTING.md`)

- **Unit-tested seam (the only one in AM1):** the pure **spawn-plan builder** — input→output Vitest, co-located `src/main/*.test.ts`, in the style of `shortcut-launcher.test.ts`'s `buildElevatedOpen`. Adds a small number of cases to the current green baseline (137 locally after worktree-name-template; anchor to whatever is green on the working branch, zero deletions).
- **Deliberately NOT unit-tested** (per `TESTING.md` — thin OS/Electron shells + renderer): `PtyPort` (node-pty adapter), the streaming-IPC wiring (`IpcEvents`/`IpcSends`, preload `on`/`send`, main emit/handlers), and `TerminalPane` (renderer React + xterm). These are the spike's risk surface and are verified by **hand-run** terminal + **packaged build**, not units — the whole point of a de-risk spike.
- **Gate:** `npm run typecheck && npm run lint && npm test` stays green (Full), plus the **Build** gate `npm run build:win` is mandatory for this feature (it is the de-risk deliverable), plus a Manual gate (drive the embedded terminal in both `dev` and the installed packaged app).

## Success Criteria

- [ ] In `dev`, the embedded terminal spawns Claude inside `pwsh`, renders its output, accepts typed input, and lets the developer answer a prompt — fully interactive
- [ ] The agent quitting drops to a live shell prompt (terminal stays usable); the shell exiting fires `session:exit` and the terminal shows "shell exited"
- [ ] `npm run build:win` succeeds and the **installed** app runs the embedded terminal identically to `dev` (native module loads from the packaged app; asar/unpack config recorded)
- [ ] The streaming IPC is the typed AD-004 shape (`IpcEvents`/`IpcSends` + `on`/`send` bridge) and typechecks
- [ ] The permanent plumbing (`PtyPort`, IPC maps/wrappers/bridge, `buildSpawnPlan`, `TerminalPane`, packaging fix) is cleanly separable from the throwaway single-agent trigger, ready for AM2 to grow
- [ ] The spawn-plan builder is unit-tested and the full gate (typecheck + lint + test) is green
