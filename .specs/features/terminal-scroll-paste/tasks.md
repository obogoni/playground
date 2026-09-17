# Terminal Scroll & Paste Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/terminal-scroll-paste/design.md`
**Status**: Executing (approved 2026-09-17). Q2 unanswered by the owner, so the probe path applies: T14 records the verdict.
**Branch**: `feature/terminal-scroll-paste` (cut from `origin/main`)
**Test baseline**: measured green on the branch before T1 — 748 tests / 46 files, `typecheck` and `lint` exit 0 (18 prettier warnings, 0 errors).

**Conditional phases.** Phase 6 (cause 1) and Phase 7 (cause 2) are mutually exclusive. T14 records the
probe verdict, or the owner's Q2 answer if it arrives first. The phase that verdict does not confirm is
skipped, and its requirement IDs are marked `Withdrawn` in `spec.md`. If the verdict is cause 3 only,
both are skipped.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shared pure helpers (`src/shared/paste.ts`) | unit | All branches; 1:1 to TSP-12/15/21/22/27/34 | `src/shared/<module>.test.ts` | `npx vitest run <file>` |
| Main pure / DI modules (`terminal-mode-tracker`, `session-ring-buffer`, `clipboard-reader`, `paste-temp`) | unit | All branches; 1:1 to spec ACs; every listed edge case (TSP-09, 33-36); DI fakes hand-rolled, temp dirs real (TESTING.md patterns 2 and 3) | `src/main/<module>.test.ts` | `npx vitest run <file>` |
| Renderer pure libs (`terminal-modes.ts`, `terminal-keys.ts`) | unit | All branches; 1:1 to TSP-04/05/17/29-33 | `src/renderer/src/lib/<module>.test.ts` | `npx vitest run <file>` |
| Type-only contract (`src/shared/ipc-contract.ts`) | none | Build gate only | - | build gate only |
| Thin Electron shells (`src/main/index.ts`, `src/preload/index.ts`) | none | Hand-verified (TESTING.md) | - | build gate only |
| Renderer components (`TerminalPane.tsx`, `AgentsView.tsx`) | none | Hand-verified in the owner UAT (TESTING.md) | - | build gate only |
| Owner probe / UAT (T14) | none | Owner-run against a built app; verdict recorded in `spec.md` | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests only | `npx vitest run <the task's test file>` |
| Full | After tasks touching `session-ring-buffer` (consumed by `SessionManager`) | `npm test` |
| Build | Contract, wiring, renderer and docs tasks; end of every phase | `npm run typecheck && npm run lint && npm test` (+ `npx electron-vite build` at the end of Phase 5, 6 and 7) |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

Each block shows the real dependency edges, including those crossing a phase boundary. A task with no incoming edge still runs in the listed order.

### Phase 1: Shared contracts

```
T1 → T2
```

### Phase 2: Main-process seams

```
T3 → T4
T1 → T5
T6
```

### Phase 3: Main and preload wiring

```
T2 → T7
T5 → T7
T6 → T7
T2 → T8
```

### Phase 4: Renderer seams

```
T9
T10
```

### Phase 5: Pane wiring and owner verdict

```
T9 → T11
T1 → T12
T7 → T12
T10 → T12
T8 → T13
T12 → T13
T4 → T14
T11 → T14
T13 → T14
```

### Phase 6: Cause-1 guard (conditional)

```
T9 → T15
T14 → T15
T11 → T16
T15 → T16
```

### Phase 7: Cause-2 reset (conditional)

```
T9 → T17
T14 → T17
T17 → T18
T18 → T19
```

---

## Task Breakdown

### T1: Shared paste plan ✅

**What**: Create `ClipboardPaste`, `quotePath`, `planPaste` and `PASTE_GAP_MS` so every paste source (clipboard text, file list, image, drop) resolves to one ordered list of `term.paste` chunks.
**Where**: `src/shared/paste.ts`
**Depends on**: None
**Reuses**: `terminal-keys.ts` convention (constrained values exported from the tested seam)
**Requirement**: TSP-12, TSP-15, TSP-21, TSP-22, TSP-27, TSP-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `planPaste({kind:'text'})` → `[text]` verbatim, multi-line included (TSP-12)
- [x] `planPaste({kind:'empty'})` and `{kind:'error'}` → `[]` (TSP-15)
- [x] `planPaste({kind:'paths'})` → one `"<path>"` per path, order kept, paths with spaces and non-ASCII (`relatório.png`) unchanged inside the quotes (TSP-21, TSP-34)
- [x] Empty-string paths skipped; all-empty → `[]` (TSP-27)
- [x] `PASTE_GAP_MS === 100` asserted (TSP-22)
- [x] Gate check passes: `npx vitest run src/shared/paste.test.ts`
- [x] Test count: baseline + ~8 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(shared): plan terminal pastes as quoted path chunks`

---

### T2: `clipboard:read-paste` channel and `pathForFile` bridge type

**What**: Declare `'clipboard:read-paste': { req: void; res: ClipboardPaste }` in `IpcContract` and `pathForFile(file: File): string` on `RendererApi`.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T1
**Reuses**: `IpcContract` (`ipc-contract.ts:27`), `RendererApi` (`:167-176`)
**Requirement**: TSP-14, TSP-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Channel and bridge method declared with doc comments
- [ ] Typecheck fails nowhere else. `pathForFile` is optional-free, so T8 must land before any renderer consumer; the preload typecheck is covered because the preload casts `as RendererApi`. If the cast fails, add a stub in this task (lesson L-001: wire producer and consumer together rather than relaxing to optional)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(shared): declare the clipboard paste channel and file path bridge`

---

### T3: Terminal mode tracker

**What**: Implement `TerminalModeTracker` (`feed`, `prefix`) folding DEC private mode sets/resets into the tracked state and encoding the non-default state as a prefix.
**Where**: `src/main/terminal-mode-tracker.ts`
**Depends on**: None
**Reuses**: none (pure string scan)
**Requirement**: TSP-06, TSP-07, TSP-08, TSP-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fresh tracker `prefix()` = `''`
- [ ] `?1049h`, `?47h`, `?1047h` all → prefix contains `\x1b[?1049h`; a later `?1049l` removes it (TSP-08)
- [ ] Tracking: `?1000h` then `?1003h` → only `?1003h` in prefix; `?1002l` clears tracking (any reset clears) (TSP-08)
- [ ] Encoding: `?1006h` then `?1016h` → `?1016h`; any encoding reset clears (TSP-08)
- [ ] `?1004h`, `?2004h` set; `?25l` → prefix contains `\x1b[?25l` (TSP-08)
- [ ] Multi-param `\x1b[?1049;1003;1006h` handled (TSP-06)
- [ ] Sequence split across two `feed` calls at every byte offset applies once (TSP-09)
- [ ] Non-private CSI (`\x1b[1049h`, SGR) ignored
- [ ] Prefix order: alt-screen, tracking, encoding, focus, bracketed paste, cursor (TSP-07)
- [ ] Gate check passes: `npx vitest run src/main/terminal-mode-tracker.test.ts`
- [ ] Test count: +~14 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): track terminal DEC private modes from a byte stream`

---

### T4: Ring buffer replays head modes

**What**: Feed every trimmed head segment of `SessionRingBuffer` to a private `TerminalModeTracker` and prepend its prefix in `snapshot()`, leaving `tail()` unprefixed.
**Where**: `src/main/session-ring-buffer.ts`
**Depends on**: T3
**Reuses**: existing `#trimToLines` / `#trimToBytes` (`session-ring-buffer.ts:54-77`)
**Requirement**: TSP-06, TSP-07, TSP-10, TSP-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Buffer `maxLines: 3` fed `\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h\n` + 5 lines → `snapshot()` starts with those four sets, then the retained 3 lines (TSP-06, TSP-07)
- [ ] Same via the byte cap (`maxBytes` small) (TSP-06)
- [ ] Modes set then reset inside the dropped head → no prefix (TSP-07)
- [ ] Nothing dropped → `snapshot()` byte-equal to appended content (TSP-10)
- [ ] `tail(2)` never contains the prefix (TSP-11)
- [ ] Existing `session-ring-buffer.test.ts` and `session-manager.test.ts` pass unmodified
- [ ] Gate check passes: `npm test`
- [ ] Test count: +~5 (no silent deletions)

**Tests**: unit
**Gate**: full

**Commit**: `fix(main): restore trimmed terminal modes when replaying a session`

---

### T5: Clipboard reader

**What**: Implement `classifyClipboard`, `parseFileDropList`, `pasteImageName` and `readClipboardPaste(deps)` producing a `ClipboardPaste` from injected clipboard, file-list runner and writer ports.
**Where**: `src/main/clipboard-reader.ts`
**Depends on**: T1
**Reuses**: DI + hand-rolled fakes (TESTING.md pattern 3, `task-board.test.ts`)
**Requirement**: TSP-12, TSP-13, TSP-14, TSP-15, TSP-16, TSP-21, TSP-32, TSP-33, TSP-34, TSP-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Text non-empty wins over files and image (TSP-12, TSP-13); whitespace-only text is still text (it is what the user copied)
- [ ] No text + `text/uri-list` → runner called once, `{kind:'paths'}` in runner order (TSP-21); directories pass through (TSP-32)
- [ ] No text, no `text/uri-list` → runner **never** called
- [ ] No text, no files, non-empty image → writer called once with `<pasteDir>\paste-yyyyMMdd-HHmmss-<rand>.png`, result `{kind:'paths', paths:[that]}` (TSP-14)
- [ ] Nothing → `{kind:'empty'}` (TSP-15)
- [ ] Runner reject / writer reject → `{kind:'error'}`, never throws (TSP-16)
- [ ] `parseFileDropList` drops blank lines and trailing CRLF, keeps non-ASCII intact (TSP-33, TSP-34)
- [ ] `pasteImageName` differs for two calls with the same second and different `rand` (TSP-35)
- [ ] Gate check passes: `npx vitest run src/main/clipboard-reader.test.ts`
- [ ] Test count: +~14 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): classify clipboard content into a terminal paste`

---

### T6: Paste temp purge

**What**: Implement `PASTE_MAX_AGE_MS`, `selectExpired` and `purgePasteDir` that deletes pasted images strictly older than 7 days and never throws.
**Where**: `src/main/paste-temp.ts`
**Depends on**: None
**Reuses**: real temp-dir tests (TESTING.md pattern 2)
**Requirement**: TSP-18, TSP-19, TSP-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `selectExpired`: older than max → selected; exactly max → kept (TSP-36); newer → kept
- [ ] `purgePasteDir` on a `mkdtempSync` dir with `utimesSync`-aged files deletes only the expired ones (TSP-18)
- [ ] Missing dir → no throw, no side effect (TSP-19)
- [ ] An undeletable entry (e.g. a non-empty subdirectory named like a file) is skipped and the rest still purged (TSP-19)
- [ ] Gate check passes: `npx vitest run src/main/paste-temp.test.ts`
- [ ] Test count: +~6 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): purge pasted images older than a week`

---

### T7: Main wiring for clipboard paste and purge

**What**: Register `clipboard:read-paste` with real deps (Electron `clipboard`, `execFile('powershell.exe', …, {timeout: 5000, windowsHide: true})`, `mkdir` + `writeFile`) and call `purgePasteDir` once in `whenReady`.
**Where**: `src/main/index.ts`
**Depends on**: T2, T5, T6
**Reuses**: `handle()` pattern (`index.ts:178-304`), `execFileAsync` (`index.ts:41`)
**Requirement**: TSP-14, TSP-16, TSP-18, TSP-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] PowerShell command sets UTF-8 output and runs `-NoProfile -STA`
- [ ] `pasteDir = join(tmpdir(), 'playground-paste')`
- [ ] Purge call wrapped so a throw is logged, never propagated
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(main): serve clipboard pastes and purge stale paste images`

---

### T8: Preload `pathForFile`

**What**: Expose `pathForFile: (file) => webUtils.getPathForFile(file)` on the bridged `api`.
**Where**: `src/preload/index.ts`
**Depends on**: T2
**Reuses**: existing `api` object (`preload/index.ts:9-20`)
**Requirement**: TSP-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Method present; `as RendererApi` cast typechecks without `@ts-ignore`
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(preload): resolve dropped files to filesystem paths`

---

### T9: Terminal mode names and probe helpers

**What**: Create `modeName`, `formatModeLog` and `isProbeEnabled` for the flag-gated mode probe.
**Where**: `src/renderer/src/lib/terminal-modes.ts`
**Depends on**: None
**Reuses**: `terminal-keys.ts` lib convention
**Requirement**: TSP-01, TSP-02, TSP-03, TSP-04, TSP-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `modeName` maps every number in TSP-05 to its name, and an unknown number `n` to `?n`
- [ ] `formatModeLog` output starts with `[term-modes]` and contains session id, `h`/`l`, raw params, decoded names, tracking and buffer (TSP-01)
- [ ] `isProbeEnabled` true only for exactly `'1'`; `null`, `'0'`, `'true'` and a throwing reader → false (TSP-04)
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/terminal-modes.test.ts`
- [ ] Test count: +~8 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(terminal): name DEC private modes for the mode probe`

---

### T10: Pin Alt+V and Ctrl+V classification

**What**: Add classifier tests pinning Alt+V → `pass` and Ctrl+V → `paste`, so the native Alt+V path to the agent can never be swallowed.
**Where**: `src/renderer/src/lib/terminal-keys.test.ts`
**Depends on**: None
**Reuses**: existing `classifyTerminalKey` tests
**Requirement**: TSP-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Alt+V (`altKey`, `code: 'KeyV'`, no ctrl) → `pass`; Ctrl+Alt+V (AltGr) → `pass`; Ctrl+V → `paste`
- [ ] No production change needed; if one is, it is limited to `terminal-keys.ts` and noted in the commit body
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/terminal-keys.test.ts`
- [ ] Test count: +~3 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(terminal): pin Alt+V as a pass-through chord`

---

### T11: Wire the mode probe into the pane

**What**: When `isProbeEnabled` at mount, register observing `?h`/`?l` CSI handlers (return `false`), log each Ctrl+C classification, and log one `replay` line after the first `session:data` write.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T9
**Reuses**: `term.parser.registerCsiHandler` (`xterm.d.ts:1817`), `term.write(data, callback)`
**Requirement**: TSP-01, TSP-02, TSP-03, TSP-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Handlers disposed on effect cleanup
- [ ] Flag off → no handler registered (code path inspected: registration is inside the `isProbeEnabled` branch)
- [ ] `localStorage` read wrapped in try/catch
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(terminal): log terminal mode changes behind a debug flag`

---

### T12: Paste from the clipboard over IPC

**What**: Replace both `readText` paste paths with one `pasteFromClipboard` (invoke → `planPaste` → serialized, disposable queue with `PASTE_GAP_MS` gaps), and show "Não foi possível colar" on `error`.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T1, T7, T10
**Reuses**: `copied` chip + `COPIED_FEEDBACK_MS` (`TerminalPane.tsx:94-106`), `classifyTerminalMouse` branch (`:271-295`)
**Requirement**: TSP-12, TSP-13, TSP-14, TSP-15, TSP-16, TSP-20, TSP-21, TSP-22, TSP-23, TSP-24, TSP-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ctrl+V and right-click paste both call `pasteFromClipboard`; no `navigator.clipboard.readText` remains in the pane
- [ ] A second paste waits for the running sequence (TSP-23); cleanup sets the disposed flag and clears the pending timer (TSP-24)
- [ ] `agentOwnsMouse` right-click behavior untouched (TSP-37)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(terminal): paste images and copied files as quoted paths`

---

### T13: Drop files on the terminal

**What**: Add `dragover`/`drop` listeners on the pane container that `preventDefault`, resolve `dataTransfer.files` via `api.pathForFile`, enqueue `planPaste({kind:'paths'})` and focus the terminal.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T8, T12
**Reuses**: the paste queue from T12
**Requirement**: TSP-25, TSP-26, TSP-27, TSP-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `dragover` sets `dropEffect = 'copy'`; both events `preventDefault` (TSP-26)
- [ ] Listeners removed on cleanup
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(terminal): paste the paths of files dropped on the terminal`

---

### T14: Owner UAT and probe verdict

**What**: The owner runs a built app. They set the probe flag, reproduce the dead scroll after Ctrl+C in opencode, and run the paste/drop/replay checks from the spec's Independent Tests. The agent then records the verdict (cause 1, 2 or 3 only) in `spec.md` and marks the unconfirmed conditional IDs `Withdrawn`.
**Where**: `.specs/features/terminal-scroll-paste/spec.md`
**Depends on**: T4, T11, T13
**Reuses**: probe from T11
**Requirement**: TSP-01, TSP-02, TSP-03, TSP-06, TSP-12, TSP-14, TSP-21, TSP-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Owner's `[term-modes]` excerpt quoted in the Q2 assumption row, with the verdict set to `y`
- [ ] Phase 6 or Phase 7 (or both) marked skipped in this file; withdrawn IDs updated in Traceability
- [ ] Paste image / files / drop / session-switch replay confirmed in both opencode and Claude Code, or failures turned into fix tasks
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): record the terminal scroll probe verdict`

---

### T15: Mouse reset guard (conditional: cause 1)

**What**: Implement `MouseResetGuard` (`onReset(params, altActive)`, `onAltExit()`), which defers mouse-tracking and mouse-encoding resets while the alternate screen is active and releases them on exit.
**Where**: `src/renderer/src/lib/terminal-modes.ts`
**Depends on**: T9, T14
**Reuses**: `modeName` groups from T9
**Requirement**: TSP-29, TSP-30, TSP-31, TSP-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Alt active + `[1003]` → consume, deferred `[1003]` (TSP-29)
- [ ] Alt active + `[1049]` or `[1049,1003]` → not consumed (TSP-31: the alt exit must apply)
- [ ] Alt active + `[1006, 2004]` → consume, `passThrough: [2004]` (TSP-31)
- [ ] `onAltExit` returns the deferred list once, then `[]` (TSP-30)
- [ ] Alt inactive + `[1003]` → not consumed (TSP-32)
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/terminal-modes.test.ts`
- [ ] Test count: +~7 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(terminal): defer mouse mode resets while a TUI holds the alt screen`

---

### T16: Wire the guard into the pane (conditional: cause 1)

**What**: Register a consuming `?l` CSI handler driven by `MouseResetGuard`. It re-writes `passThrough` params as their own `CSI ? … l`, and it writes the deferred resets after an observed alt-screen exit.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T11, T15
**Reuses**: probe handler registration pattern from T11
**Requirement**: TSP-29, TSP-30, TSP-31, TSP-32

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Guard handler registered after the probe handler, so the probe still logs the raw sequence; disposed on cleanup
- [ ] Owner re-runs the Ctrl+C repro: the wheel still scrolls opencode; after exiting opencode, mouse movement over pwsh prints nothing
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `fix(terminal): keep mouse tracking alive through stray console resets`

---

### T17: Mode reset sequence (conditional: cause 2)

**What**: Export `MODE_RESET_SEQUENCE`, the local reset of mouse tracking, encodings, focus and bracketed paste followed by alt-screen exit.
**Where**: `src/renderer/src/lib/terminal-modes.ts`
**Depends on**: T9, T14
**Reuses**: `modeName` groups from T9
**Requirement**: TSP-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Sequence asserted exactly: resets for 9, 1000, 1002, 1003, 1005, 1006, 1015, 1016, 1004, 2004, then `\x1b[?1049l` last
- [ ] Gate check passes: `npx vitest run src/renderer/src/lib/terminal-modes.test.ts`
- [ ] Test count: +~1 (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(terminal): define the local terminal mode reset`

---

### T18: Pane accepts a reset signal (conditional: cause 2)

**What**: Add an optional `resetNonce: number` prop to `TerminalPane`. On change (not on mount), it calls `term.write(MODE_RESET_SEQUENCE)` and never `session:input`.
**Where**: `src/renderer/src/components/TerminalPane.tsx`
**Depends on**: T17
**Reuses**: pane effect structure
**Requirement**: TSP-33, TSP-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Separate effect keyed on `resetNonce`, so it does not rebuild the terminal
- [ ] No `api.send` in the reset path (TSP-34)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(terminal): reset leftover terminal modes on request`

---

### T19: Reset button in the session detail bar (conditional: cause 2)

**What**: Add a "Reset terminal modes" icon button to `SessionDetail`'s bar, shown while the session is running, that bumps the nonce passed to `TerminalPane`.
**Where**: `src/renderer/src/components/AgentsView.tsx`
**Depends on**: T18
**Reuses**: existing detail-bar buttons (`AgentsView.tsx:145`)
**Requirement**: TSP-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Button has a tooltip and an accessible label; hidden for stopped sessions
- [ ] Owner verifies: after killing opencode mid-session, one click stops the escape garbage and restores wheel scroll in pwsh
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`
- [ ] Test count: unchanged (no silent deletions)

**Tests**: none
**Gate**: build

**Commit**: `feat(agents): add a reset-terminal-modes action to the session bar`

---

## Phase Execution Map

Phases run in sequence; within a phase the tasks run in the order listed.

| Order | Phase | Tasks | Condition |
| ----- | ----- | ----- | --------- |
| 1 | Shared contracts | T1, T2 | always |
| 2 | Main-process seams | T3, T4, T5, T6 | always |
| 3 | Main and preload wiring | T7, T8 | always |
| 4 | Renderer seams | T9, T10 | always |
| 5 | Pane wiring and owner verdict | T11, T12, T13, T14 | always |
| 6 | Cause-1 guard | T15, T16 | only if T14 confirms cause 1 |
| 7 | Cause-2 reset | T17, T18, T19 | only if T14 confirms cause 2 |

Execution is strictly sequential - there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in order.

Packing for Execute: 19 tasks planned; 16 or 17 once T14 withdraws a conditional phase. Batches: Phases 1-3 (8 tasks), Phases 4-5 (6 tasks), then the confirmed conditional phase (2 or 3 tasks). That is more than one batch, so the sub-agent offer applies. T14 is an owner checkpoint, so the second batch ends there by construction.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Shared paste plan | 1 module, 3 small related exports | ✅ Granular |
| T2: IPC channel + bridge type | 1 file, type-only | ✅ Granular |
| T3: Mode tracker | 1 class | ✅ Granular |
| T4: Ring buffer prefix | 1 class change | ✅ Granular |
| T5: Clipboard reader | 1 module, cohesive classifier + reader | ⚠️ OK (cohesive, one file) |
| T6: Paste temp purge | 1 module | ✅ Granular |
| T7: Main wiring | 1 file | ✅ Granular |
| T8: Preload method | 1 function | ✅ Granular |
| T9: Mode names/probe helpers | 1 module | ✅ Granular |
| T10: Alt+V test pin | 1 test file | ✅ Granular |
| T11: Probe wiring | 1 concern in 1 component | ✅ Granular |
| T12: IPC paste + queue | 1 concern in 1 component | ⚠️ OK (paste path is one flow) |
| T13: Drop | 1 concern in 1 component | ✅ Granular |
| T14: Owner verdict | 1 doc update | ✅ Granular |
| T15: Guard | 1 class | ✅ Granular |
| T16: Guard wiring | 1 handler | ✅ Granular |
| T17: Reset sequence | 1 constant | ✅ Granular |
| T18: Reset prop | 1 effect | ✅ Granular |
| T19: Reset button | 1 button | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (none) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | None | (none) | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T1 | T1 → T5 | ✅ Match |
| T6 | None | (none) | ✅ Match |
| T7 | T2, T5, T6 | T2/T5/T6 → T7 | ✅ Match |
| T8 | T2 | T2 → T8 | ✅ Match |
| T9 | None | (none) | ✅ Match |
| T10 | None | (none) | ✅ Match |
| T11 | T9 | T9 → T11 | ✅ Match |
| T12 | T1, T7, T10 | T1/T7/T10 → T12 | ✅ Match |
| T13 | T8, T12 | T8/T12 → T13 | ✅ Match |
| T14 | T4, T11, T13 | T4/T11/T13 → T14 | ✅ Match |
| T15 | T9, T14 | T9/T14 → T15 | ✅ Match |
| T16 | T11, T15 | T11/T15 → T16 | ✅ Match |
| T17 | T9, T14 | T9/T14 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |

No dependency points to a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Shared pure helper | unit | unit | ✅ OK |
| T2 | Type-only contract | none | none | ✅ OK |
| T3 | Main pure module | unit | unit | ✅ OK |
| T4 | Main pure module | unit | unit | ✅ OK |
| T5 | Main DI module | unit | unit | ✅ OK |
| T6 | Main module (temp dir) | unit | unit | ✅ OK |
| T7 | Thin Electron shell | none | none | ✅ OK |
| T8 | Thin Electron shell (preload) | none | none | ✅ OK |
| T9 | Renderer pure lib | unit | unit | ✅ OK |
| T10 | Renderer pure lib (tests) | unit | unit | ✅ OK |
| T11 | Renderer component | none | none | ✅ OK |
| T12 | Renderer component | none | none | ✅ OK |
| T13 | Renderer component | none | none | ✅ OK |
| T14 | Owner probe / UAT | none | none | ✅ OK |
| T15 | Renderer pure lib | unit | unit | ✅ OK |
| T16 | Renderer component | none | none | ✅ OK |
| T17 | Renderer pure lib | unit | unit | ✅ OK |
| T18 | Renderer component | none | none | ✅ OK |
| T19 | Renderer component | none | none | ✅ OK |

**Tools per task:** no MCP server or skill applies to any task (local TypeScript + vitest only). To confirm with the owner at approval.
