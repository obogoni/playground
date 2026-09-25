# Terminal Links Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/terminal-links/design.md`
**Status**: Done — T1–T11 committed on `feature/terminal-links`; fix tasks F1 (`9afe7f6`, stale `pendingLink`) and F2 (OSC 8 smoke rows 18–21) closed after the first Verifier pass; see `validation.md`
**Amendment 2026-09-19** (§Amendment below): T12–T15 — alternate-screen bug (LINK-32), `FORCE_HYPERLINK` (LINK-33), OSC 8 `file://` (LINK-21 reinstated, LINK-22 amended). T12–T14 committed (`6b2e493`, `1182ca1`, `f3436bf`); T15 smoke run 2026-09-24 (`validation.md` rows 22–30). Verifier pass 3 → one Minor gap on LINK-21, closed by F3 (`7da1cc1`, `openFileUrl` refuses a file URL with no local drive path instead of throwing); pass 4 re-verifies.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `README.md` §Development ("Pre-PR gate: `npm run typecheck && npm run lint && npm test`"), `vitest.config.ts` (coverage scoped to `src/main/**` + `src/shared/**`; "renderer components and thin OS/Electron shells are intentionally uncovered by convention"), `.github/workflows/ci.yml:37`, precedent in `.specs/features/terminal-copy-undo-fixes/spec.md` (classifier in `lib/` unit-tested, pane hand-verified), lessons L-001 / L-005.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Renderer pure libs (`terminal-links`, `terminal-buffer-lines`, `terminal-link-gesture`, `terminal-link-provider`) | unit | All branches; 1:1 to the LINK ACs each lib owns; every listed edge case that lands in the lib | `src/renderer/src/lib/<name>.test.ts` | `npx vitest run src/renderer/src/lib/<name>.test.ts` |
| Main service (`LinkOpener`) | unit, injected fakes only (L-005: no real spawn) | 1:1 to LINK-04/05/09/10/11/12/13/29/31 + every error path in the design's Error Handling table | `src/main/link-opener.test.ts` | `npx vitest run src/main/link-opener.test.ts` |
| Shared contract / types (`src/shared/links.ts`, `ipc-contract.ts`) | none | — (build gate only) | — | `npm run typecheck` |
| Main wiring (`src/main/index.ts`, `spawnDetached` export) | none | — (thin Electron shell, by convention) | — | build gate |
| Renderer components (`TerminalPane.tsx`, `AgentsView.tsx`, `App.tsx`) | none (hand-verified, by convention) | Owner smoke checklist covering every spec Success Criterion + LINK-14/15/16/18/19 | `validation.md` | `npm run dev` + checklist |

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Renderer lib unit | Yes | Pure functions; fake buffers/probes built per test; no globals | `src/renderer/src/lib/terminal-keys.test.ts`, `rail-groups.test.ts` |
| Main `LinkOpener` unit | Yes | All OS calls injected as fakes; no filesystem, no spawn | `src/main/shortcut-launcher.test.ts` (pure helpers), `session-manager.test.ts` (fakes) |
| Existing real-git / real-process suites | No (not touched by this feature) | Temp dirs + real `git`; near the 30 s ceiling under load | `vitest.config.ts` comment; L-005 |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task with unit tests | `npx vitest run <that test file>` |
| Full | After a task that touches shared types or main wiring | `npm test` |
| Build | After each phase and after wiring-only tasks | `npm run typecheck && npm run lint && npm test` (the CI gate) |

**Baseline before T1:** `npm test` → **917 tests passing, 0 failing** (2026-09-18, `985621d`); every task's count must be ≥ the previous one.

---

## Execution Plan

### Phase 1: Contract & main (Sequential)

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Renderer libs (Parallel OK)

```
        ┌→ T6 [P] ─┐
T1 ─────┼→ T7 [P] ─┼──→ T9
        └→ T8 [P]  (no dependents in this phase)
```

### Phase 3: Wiring & smoke (Sequential)

```
T5, T8, T9 ──→ T10 ──→ T11
```

Three phases → executed inline (no sub-agent offer). The Verifier runs automatically after T11.

---

## Task Breakdown

### T1: Declare the links contract

**What**: `ProbeResult`/`PathKind` types and the three `links:*` channels on the typed IPC contract.
**Where**: `src/shared/links.ts` (new), `src/shared/ipc-contract.ts` (modify)
**Depends on**: None
**Reuses**: `LaunchResult` from `src/shared/shortcuts.ts`; channel style of `shortcuts:launch`
**Requirement**: enables LINK-04/05/09–13/29 (contract only)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `PathKind = 'file' | 'dir' | 'missing'` and `ProbeResult { pathText, absolutePath: string | null, kind }` exported from `src/shared/links.ts`
- [ ] `'links:probe' { req: { cwd, paths: string[] }; res: ProbeResult[] }`, `'links:openUrl' { req: { url }; res: LaunchResult }`, `'links:openPath' { req: { cwd, pathText }; res: LaunchResult }` on `IpcContract`, doc-commented like their neighbors
- [ ] Gate: `npm run typecheck` passes

**Tests**: none (shared types — build gate)
**Gate**: build (typecheck only; no behavior yet)

**Commit**: `feat(shared): declare the terminal link probe and open channels`

---

### T2: `LinkOpener` — resolve and probe

**What**: `LinkOpener` class with injected deps, `resolveCandidate(cwd, pathText)` and `probe(cwd, paths)`.
**Where**: `src/main/link-opener.ts` (new), `src/main/link-opener.test.ts` (new)
**Depends on**: T1
**Reuses**: `path.win32`, `os.homedir` (injected); DI-with-fakes convention from `session-manager.test.ts`
**Requirement**: LINK-12, LINK-29, LINK-24 (main side), LINK-26 (probe is the cache's source)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `resolveCandidate`: `~/x` → `<homedir>\x`; `src/a.ts` → `path.win32.resolve(cwd, …)`; `E:\x\y` unchanged; result `null` when not absolute (e.g. empty cwd + relative)
- [ ] `probe`: returns one `ProbeResult` per input in order; `kind` from `stat` (`'dir'` when `isDirectory()`), `'missing'` on stat rejection or `null` resolution; input capped at 32 (extra entries → `'missing'`)
- [ ] Tests (fakes only): each bullet above has a test; `absolutePath` echoed for `'file'`/`'dir'`, `null` for unresolvable
- [ ] Gate: `npx vitest run src/main/link-opener.test.ts` passes

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): resolve and probe terminal link candidates`

---

### T3: `LinkOpener.openUrl`

**What**: Scheme-gated URL open.
**Where**: `src/main/link-opener.ts`, `src/main/link-opener.test.ts` (modify)
**Depends on**: T2
**Reuses**: `shell.openExternal` (injected)
**Requirement**: LINK-04, LINK-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `http:`/`https:` → `openExternal(parsed.toString())` → `{ ok: true }`
- [ ] any other scheme, or an unparsable string → `{ ok: false, error }` mentioning the URL, and `openExternal` **not** called (asserted on the fake)
- [ ] `openExternal` rejection → `{ ok: false, error }` (never throws)
- [ ] Gate: `npx vitest run src/main/link-opener.test.ts` passes; test count ≥ T2's

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): open http and https terminal links in the default browser`

---

### T4: `LinkOpener.openPath`

**What**: Directory → Explorer; file → default app or the "Open with" chooser.
**Where**: `src/main/link-opener.ts`, `src/main/link-opener.test.ts` (modify)
**Depends on**: T3
**Reuses**: `spawnDetached` (injected), `shell.openPath` (injected), `hasAssociation` (injected)
**Requirement**: LINK-09, LINK-10, LINK-11, LINK-13, LINK-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] resolves via `resolveCandidate`; `null`/stat rejection → `{ ok: false, error: "… no longer exists" }`
- [ ] directory → `spawnDetached('explorer.exe', [abs])`; spawn `false` → `{ ok: false }`
- [ ] file with association → `openPath(abs)`; `''` → `{ ok: true }`; non-empty string → chooser
- [ ] file without association → chooser directly, `openPath` **not** called
- [ ] chooser = `spawnDetached('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', abs])`; `false` → `{ ok: false, error }` naming the path
- [ ] an `.exe`/`.ps1` path takes the same route as any file (LINK-31 pinned by a test)
- [ ] Gate: `npx vitest run src/main/link-opener.test.ts` passes; count ≥ T3's

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): open terminal file links with the Windows default app or the chooser`

---

### T5: Register the handlers

**What**: Production `LinkOpener` wired into main with real deps; `spawnDetached` exported.
**Where**: `src/main/index.ts` (modify), `src/main/shortcut-launcher.ts` (export only)
**Depends on**: T4
**Reuses**: `handle()` from `src/main/ipc.ts`; `execFile('cmd.exe', ['/c', 'assoc', ext])` for `hasAssociation`
**Requirement**: wiring for LINK-04/05/09–13/29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `handle('links:probe' | 'links:openUrl' | 'links:openPath', …)` next to `shortcuts:launch`
- [ ] `hasAssociation(ext)` resolves `true` iff `cmd.exe /c assoc <ext>` exits 0; `''` ext → `false`
- [ ] Gate: `npm run typecheck && npm run lint && npm test` passes

**Tests**: none (thin Electron shell)
**Gate**: build

**Commit**: `feat(main): serve the terminal link channels`

---

### T6: `terminal-links.ts` — detection [P]

**What**: URL + path candidate detection over one logical line.
**Where**: `src/renderer/src/lib/terminal-links.ts` (new), `.test.ts` (new)
**Depends on**: None
**Reuses**: `strictUrlRegex` + `isUrl` ported from `@xterm/addon-web-links@0.12.0` (MIT, attributed in a header comment); Orca's path regex shape
**Requirement**: LINK-06, LINK-08, LINK-23, LINK-03 (detection over a joined line), LINK-22 (no non-http scheme is ever a candidate)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `detectLinkCandidates('see https://x.y/a?b=1.')` → one `url` candidate without the trailing `.`; also `,`, `;`, `:`, unmatched `)`/`]` excluded (LINK-23)
- [ ] `mailto:a@b`, `vscode://x`, `file:///E:/x` → no candidates
- [ ] `src/lib/foo.ts:12:3`, `E:\Repos\X\Foo.cs:40`, `.\a\b.sql`, `..\c.md`, `~/x/y`, `/abs/p` → `path` candidates with `pathText`, `line`, `col` parsed and `text` including the suffix
- [ ] `Foo.cs` (no separator) and `Foo.cs(40,12)` → not candidates (Out of Scope pinned)
- [ ] a URL range is never also a path candidate (`https://h/p/q.ts` → only `url`)
- [ ] `E:\Meus Docs\a.txt agora` → a spaced candidate whose `alternatives` list `E:\Meus Docs\a.txt` (and `E:\Meus` is **not** an alternative — no extension)
- [ ] more than 32 candidates on a line → exactly 32 returned, in order
- [ ] Gate: `npx vitest run src/renderer/src/lib/terminal-links.test.ts` passes

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): detect url and file path candidates on a terminal line`

---

### T7: `terminal-buffer-lines.ts` — geometry [P]

**What**: Soft-wrap joining, string-index → cell mapping, range containment, mouse → cell.
**Where**: `src/renderer/src/lib/terminal-buffer-lines.ts` (new), `.test.ts` (new, fake `BufferLike`)
**Depends on**: None
**Reuses**: `_getWindowedLineStrings` / `_mapStrIdx` ported from addon-web-links (MIT); Orca `terminal-mouse-buffer-position.ts`
**Requirement**: LINK-03, LINK-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `windowedLine(buffer, y0)`: a row with `isWrapped` continuation rows joins them (both directions), stops at a row containing a space, stops past 2048 chars; `topRow` is the first joined row; `fingerprint` changes when any joined row's text changes
- [ ] `rangeForStringSpan`: a span crossing a wrap boundary yields `start.y < end.y`; wide (2-cell) chars keep the mapping aligned (the addon's early-wrap correction case pinned by a test); a span past the buffer → `null`
- [ ] `rangeContains(range, x, y, cols)` true on both ends inclusive, false one cell outside
- [ ] `bufferPositionForMouseEvent`: with a fake `.xterm-screen` rect 800×400, 80 cols × 20 rows, `viewportY = 100`, a click at (405, 210) → `{ x: 41, y: 111 }` (1-based, scrollback-aware — LINK-28); outside the rect → `null`
- [ ] Gate: `npx vitest run src/renderer/src/lib/terminal-buffer-lines.test.ts` passes

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): map terminal link text to buffer cells across soft wraps`

---

### T8: `terminal-link-gesture.ts` — classifier [P]

**What**: Pure Ctrl-gesture decisions.
**Where**: `src/renderer/src/lib/terminal-link-gesture.ts` (new), `.test.ts` (new)
**Depends on**: None
**Reuses**: `terminal-keys.ts` shape (event-shaped plain objects, exported constants)
**Requirement**: LINK-14, LINK-15, LINK-16, LINK-17, LINK-18, LINK-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `DRAG_THRESHOLD_PX` exported and equal to `4` (asserted against the literal, per L-004's spirit)
- [ ] `linkGestureOnMouseDown`: `'intercept'` only for `button 0 + ctrlKey + !alt + !shift + !meta + hit ≠ null`; each negated condition has its own test (`'pass'`), including hit `null` (LINK-15) and no Ctrl (LINK-16)
- [ ] `linkGestureOnMouseUp(pending, event)`: `'open'` at 3.9 px, `'ignore'` at 4 px and beyond (LINK-17); `'ignore'` when `pending` is `null` (LINK-18/30)
- [ ] Gate: `npx vitest run src/renderer/src/lib/terminal-link-gesture.test.ts` passes

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): classify the ctrl-click link gesture`

---

### T9: `terminal-link-provider.ts` — provider + hit test

**What**: `createTerminalLinkProvider(deps)` serving xterm's `provideLinks` and the pane's `hitTest`, with the per-pane probe cache.
**Where**: `src/renderer/src/lib/terminal-link-provider.ts` (new), `.test.ts` (new, fake buffer + fake probe)
**Depends on**: T1, T6, T7
**Reuses**: T6 detection, T7 geometry, `ProbeResult`
**Requirement**: LINK-01, LINK-02 (hit), LINK-06, LINK-07, LINK-19, LINK-24, LINK-25, LINK-26, LINK-27, LINK-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `provideLinks(y1, cb)`: a row with a URL calls back synchronously with one `ILink` whose `range` matches T7's mapping, `decorations = { underline: true, pointerCursor: true }`, `activate` is a no-op (asserting `activate()` performs no call on any dep)
- [ ] a row with two path candidates issues **one** `probe` call with both `pathText`s; `'file'`/`'dir'` → links; `'missing'` → no link (LINK-06/07)
- [ ] second `provideLinks` on the same texts issues **no** probe (LINK-26); `dispose()` then a third call probes again (LINK-27)
- [ ] probe rejection → `cb(undefined)`, no throw, and the candidates are cached as `'missing'` (LINK-24)
- [ ] row text mutated on the fake buffer between probe start and settle → `cb(undefined)` (LINK-25)
- [ ] spaced candidate: alternatives probed in one batch; the longest `'file'` wins the link range (LINK-08)
- [ ] `hitTest(x, y)`: cell inside a URL → `{ kind: 'url' }`; inside a cached `'file'` path → `{ kind: 'path', state: 'file' }`; inside a cached `'missing'` → `null` (LINK-07); inside an unprobed path → `{ state: 'unprobed', settled }` and `settled` resolves to the probe's kind (LINK-19); on a scrollback row (`y1` > viewport) → same rules (LINK-28); empty cell → `null`
- [ ] Gate: `npx vitest run src/renderer/src/lib/terminal-link-provider.test.ts` passes

**Tests**: unit
**Gate**: quick

**Commit**: `feat(renderer): provide terminal links to xterm and hit-test them for the pane`

---

### T10: Wire the pane

**What**: `TerminalPane` registers the provider, owns the gesture, opens via IPC, toasts failures; `AgentsView`/`App` pass `cwd` and `onToast`. (Three files, one deliverable — merged backward so the commit typechecks; the pane's new props are required.)
**Where**: `src/renderer/src/components/TerminalPane.tsx`, `src/renderer/src/components/AgentsView.tsx`, `src/renderer/src/App.tsx` (modify)
**Depends on**: T5, T8, T9
**Reuses**: capture-listener pattern at `TerminalPane.tsx:253-302`; `api.invoke`; `setToast`
**Requirement**: LINK-01, LINK-02, LINK-03, LINK-05, LINK-13, LINK-14, LINK-15, LINK-16, LINK-18, LINK-19, LINK-20, LINK-22, LINK-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `term.registerLinkProvider(links)` where `links = createTerminalLinkProvider({ buffer: term.buffer.active, getCols, probe: (paths) => api.invoke('links:probe', { cwd, paths }) })`; disposed with the terminal (LINK-27)
- [ ] `term.options.linkHandler = { activate: () => {}, hover, leave }` tracking the hovered OSC 8 range; `allowNonHttpProtocols` **not** set (LINK-20/22)
- [ ] capture `mousedown`: `hit = osc range contains cell ? { kind: 'url', url } : links.hitTest(cell)`; `'intercept'` → `preventDefault` + `stopPropagation` + pending (LINK-14/15/16)
- [ ] capture `mouseup`: pending → `stopPropagation`; `'open'` → `activate(hit)`; pending cleared; `window` `blur` clears pending (LINK-18); nothing opens on `mousedown` (LINK-30)
- [ ] `activate`: url → `links:openUrl`; path → (`unprobed` → `await settled`) → `'missing'` → nothing, else `links:openPath`; `{ ok: false }` or rejection → `onToast(error)` (LINK-05/13)
- [ ] `AgentsView` gains `onToast`; passes `cwd={session.cwd}` and `onToast`; `App` passes `setToast`
- [ ] Gate: `npm run typecheck && npm run lint && npm test` passes (count ≥ T9's)

**Tests**: none (renderer components, by convention — every decision is in T6–T9's tested libs)
**Gate**: build

**Commit**: `feat(terminal): open urls and file paths with ctrl+click`

---

### T11: Owner smoke and validation record

**What**: Run the spec's Success Criteria and the mouse-ownership ACs in the dev app; record the outcomes for the Verifier.
**Where**: `.specs/features/terminal-links/validation.md` (owner-smoke section)
**Depends on**: T10
**Reuses**: precedent `.specs/features/terminal-copy-undo-fixes/validation.md`
**Requirement**: Success Criteria; LINK-10 (chooser on this Windows 11), LINK-14, LINK-15, LINK-16, LINK-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] In a Claude Code session: `echo https://dev.azure.com/…/123` → Ctrl+click opens the browser; Claude's input shows no stray text (LINK-14)
- [ ] `echo src/main/index.ts:10` → underlined → Ctrl+click opens the associated app; `echo src/main/nope.ts` not underlined; `echo .` → Explorer (LINK-11)
- [ ] a file with an extension that has no association → Windows "Open with" chooser appears (LINK-10 — the one behavior that could only be measured, not unit-tested)
- [ ] Ctrl+click on empty space, plain click on a link, Shift+drag, right-click copy/paste: unchanged (LINK-15/16; TCU suite)
- [ ] output printed under a still pointer → first Ctrl+click opens (LINK-19)
- [ ] results written to `validation.md` with date and app version; gate `npm run typecheck && npm run lint && npm test` still green

**Tests**: none (hand-verified)
**Gate**: build

**Commit**: `docs(specs): record the owner smoke for terminal-links`

---

---

## Amendment 2026-09-19 — hyperlinks and the alternate screen

Trigger: the owner ran the delivered branch against a real Claude Code session and got neither the hover underline nor the Ctrl+click; the reference look he wanted (Orca: files dashed, external links blue) turned out to be the agent's own OSC 8 output under `FORCE_HYPERLINK`. Spec: LINK-21 (reinstated), LINK-22 (amended), LINK-32, LINK-33. Four sequential tasks, executed inline; the Verifier runs automatically after T15.

```
T12 → T13 → T14 → T15
```

**Baseline before T12:** `npm test` → **1021 tests passing, 0 failing** (2026-09-18, `cb18b7a`).

### T12: Read the active buffer on every lookup

**What**: `activeBufferOf(term)` — a `BufferLike` that resolves `term.buffer.active` on each `getLine`/`getNullCell`; the pane passes it instead of `term.buffer.active`.
**Where**: `src/renderer/src/lib/terminal-buffer-lines.ts` (+ `.test.ts`), `src/renderer/src/lib/terminal-link-provider.test.ts` (one AC test), `src/renderer/src/components/TerminalPane.tsx:162` (modify)
**Depends on**: T10
**Reuses**: `BufferLike`, the provider test fakes
**Requirement**: LINK-32

**Done when**:

- [x] `activeBufferOf({ buffer: { active } })` returns the line/null cell of whichever buffer is `active` at call time — swapping `active` between two calls swaps the answers
- [x] a provider built over `activeBufferOf` finds the URL in the alternate buffer after the swap (`provideLinks` + `hitTest`) and nothing on that row once the normal buffer is active again
- [x] `TerminalPane` passes `activeBufferOf(term)`; gate `npx vitest run src/renderer/src/lib/terminal-buffer-lines.test.ts src/renderer/src/lib/terminal-link-provider.test.ts` green, count ≥ baseline for those files

**Tests**: unit
**Gate**: quick

**Commit**: `fix(renderer): read the active buffer on every terminal link lookup`

### T13: Claim `FORCE_HYPERLINK`

**What**: `PTY_ENV_FORCED` gains `FORCE_HYPERLINK: '1'`; the header comment says why.
**Where**: `src/main/terminal-env.ts`, `src/main/terminal-env.test.ts` (modify)
**Depends on**: —
**Requirement**: LINK-33

**Done when**:

- [x] `buildPtyEnv({})` yields `FORCE_HYPERLINK === '1'` and still `TERM_PROGRAM === undefined`
- [x] a parent `FORCE_HYPERLINK=0` is overridden to `'1'`
- [x] gate `npx vitest run src/main/terminal-env.test.ts` green

**Tests**: unit
**Gate**: quick

**Commit**: `feat(main): claim hyperlink support for agent sessions`

### T14: Open OSC 8 `file://` links

**What**: `hitForOscTarget(uri)` (pure) classifies an OSC 8 target; `LinkOpener.openFileUrl` converts `file://` to a path and applies the file rules; new `links:openFileUrl` channel; the pane sets `allowNonHttpProtocols: true` and routes by kind.
**Where**: `src/renderer/src/lib/terminal-link-provider.ts` (+ `.test.ts`; `hitForOscTarget`, and `KnownLinkHit` gains `fileUrl`), `src/main/link-opener.ts` (+ `.test.ts`), `src/shared/ipc-contract.ts`, `src/main/index.ts`, `src/renderer/src/components/TerminalPane.tsx` (modify)
**Depends on**: T12
**Reuses**: `openPath` body, `LaunchResult`, the `hoveredOsc` wiring
**Requirement**: LINK-20, LINK-21, LINK-22

**Done when**:

- [x] `hitForOscTarget('https://x')` → `{ kind: 'url', url }`; `'http://x'` same; `'file:///C:/a.txt'` → `{ kind: 'fileUrl', url }`; `'mailto:a@b.c'`, `'vscode://file/x'`, `'ms-teams:launch'`, garbage → `null` (LINK-20/21/22)
- [x] `openFileUrl('file:///C:/dir/a.txt')` stats `C:\dir\a.txt` and opens it like `openPath` (association → `openPath`, none → chooser, dir → Explorer); `#L10C5` and `:12:3` are dropped; `file://server/share/x` and `http://…` → `{ ok: false, error: 'Only local file links open here — <url>' }`; a missing file → `'<path> no longer exists'` (LINK-21, LINK-09..13)
- [x] `TerminalPane`: `allowNonHttpProtocols: true`; Ctrl+mousedown over an OSC 8 range uses `hitForOscTarget`; `null` ends the hit test — no fall-back to the visible text, which would open a URL shown as the text of a `mailto:` link (LINK-22); `activate` sends `fileUrl` to `links:openFileUrl`
- [x] gate `npm run typecheck && npm run lint && npm test` green, count ≥ T13's

**Tests**: unit
**Gate**: build

**Commit**: `feat(terminal): open osc 8 file links with ctrl+click`

### T15: Smoke in a live Claude Code session and hand off

**What**: Re-run the owner smoke against the real agent (alternate screen, mouse tracking, `FORCE_HYPERLINK`) through the CDP driver; record rows in `validation.md`; update traceability and the STATE handoff.
**Where**: `.specs/features/terminal-links/validation.md`, `spec.md` (traceability), `.specs/STATE.md` (Handoff only)
**Depends on**: T14
**Requirement**: LINK-21, LINK-22, LINK-32, LINK-33, Success Criteria (amendment row)

**Done when**:

- [x] Claude pane (alternate buffer): hover on a plain URL underlines it; Ctrl+click opens the browser (LINK-32)
- [x] `Write(C:\…)` header: dashed by xterm; hover underlines; Ctrl+click opens the file (LINK-21, LINK-33)
- [x] markdown link: blue + dashed; Ctrl+click opens the browser (LINK-20)
- [x] `mailto:` OSC 8: Ctrl+click passes through, nothing opens (LINK-22)
- [x] rows written to `validation.md`; gate `npm run typecheck && npm run lint && npm test` green

**Tests**: none (hand-verified through the CDP driver)
**Gate**: build

**Commit**: `docs(specs): record the hyperlink smoke for terminal-links`

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5

Phase 2 (Parallel, after T1):
    ├── T6 [P]
    ├── T7 [P]  } order-free; all pure, separate files
    └── T8 [P]
  T6, T7 complete, then:
    T9

Phase 3 (Sequential):
  T5, T8, T9 complete, then:
    T10 ──→ T11
```

`[P]` is ordering information only — no sub-agent per task. Three phases → inline execution.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: contract | 2 files, one concept (types + channels) | ✅ Granular |
| T2: resolve + probe | 1 class, 2 methods, same file | ✅ Granular |
| T3: openUrl | 1 method | ✅ Granular |
| T4: openPath | 1 method | ✅ Granular |
| T5: register handlers | 1 wiring change + 1 export | ✅ Granular |
| T6: detection lib | 1 module | ✅ Granular |
| T7: geometry lib | 1 module | ✅ Granular |
| T8: gesture lib | 1 module | ✅ Granular |
| T9: provider lib | 1 module | ✅ Granular |
| T10: pane wiring + plumbing | 3 files, one deliverable (merged backward so it compiles) | ⚠️ OK — cohesive |
| T11: owner smoke | 1 document | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | root | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | after T1 in phase 2 (phase gate, no data dep) | ✅ Match |
| T7 | None | after T1 in phase 2 (phase gate, no data dep) | ✅ Match |
| T8 | None | after T1 in phase 2 (phase gate, no data dep) | ✅ Match |
| T9 | T1, T6, T7 | T6, T7 → T9 (T1 via phase gate) | ✅ Match |
| T10 | T5, T8, T9 | T5, T8, T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: contract | Shared contract / types | none | none | ✅ OK |
| T2: resolve + probe | Main service | unit | unit | ✅ OK |
| T3: openUrl | Main service | unit | unit | ✅ OK |
| T4: openPath | Main service | unit | unit | ✅ OK |
| T5: register handlers | Main wiring | none | none | ✅ OK |
| T6: detection | Renderer pure lib | unit | unit | ✅ OK |
| T7: geometry | Renderer pure lib | unit | unit | ✅ OK |
| T8: gesture | Renderer pure lib | unit | unit | ✅ OK |
| T9: provider | Renderer pure lib | unit | unit | ✅ OK |
| T10: pane wiring | Renderer components | none (hand-verified) | none | ✅ OK |
| T11: owner smoke | Renderer components | none (hand-verified) | none | ✅ OK |

## Requirement → Task Coverage

| Requirement | Tasks |
| ----------- | ----- |
| LINK-01 | T9, T10 |
| LINK-02 | T9, T10 |
| LINK-03 | T6, T7, T10 |
| LINK-04 | T3 |
| LINK-05 | T3, T10 |
| LINK-06 | T6, T9 |
| LINK-07 | T9 |
| LINK-08 | T6, T9 |
| LINK-09 | T4 |
| LINK-10 | T4, T11 |
| LINK-11 | T4, T11 |
| LINK-12 | T2 |
| LINK-13 | T4, T10 |
| LINK-14 | T8, T10, T11 |
| LINK-15 | T8, T10, T11 |
| LINK-16 | T8, T10, T11 |
| LINK-17 | T8 |
| LINK-18 | T8, T10 |
| LINK-19 | T9, T10, T11 |
| LINK-20 | T10 |
| LINK-21 | T14, T15 (reinstated 2026-09-19) |
| LINK-22 | T6, T10, T14, T15 (amended 2026-09-19) |
| LINK-23 | T6 |
| LINK-24 | T2, T9 |
| LINK-25 | T9 |
| LINK-26 | T2, T9 |
| LINK-27 | T9, T10 |
| LINK-28 | T7, T9 |
| LINK-29 | T2 |
| LINK-30 | T8, T10 |
| LINK-31 | T4 |
| LINK-32 | T12, T15 |
| LINK-33 | T13, T15 |

**Coverage:** 33 active, 33 mapped, 0 unmapped.
