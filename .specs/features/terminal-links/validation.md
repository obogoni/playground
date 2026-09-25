# Terminal Links Validation

**Result**: ✅ PASS (pass 4, Fix 1 `dd83777..77d4e34`). `openFileUrl` now returns the refusal instead of throwing for file URLs with no local drive path, and LINK-21's `localhost` clause has a test. LINK-20, LINK-21, LINK-22, LINK-32 and LINK-33 are all verified. Gate 1036/1036 (typecheck 0, lint 0 errors); sensor 5/5 killed (19/19 cumulative). Pass 3 (amendment `3563b91..a83e62b`) failed on that one Minor gap, now closed. Passes 1–2 (`6ecd19c..626762f`, original delivery) passed after one fix round, 30/30 ACs. Full reports are below the owner smoke.

**Date**: 2026-09-18
**Spec**: `.specs/features/terminal-links/spec.md`
**Branch**: `feature/terminal-links` from `main` at `6ecd19c`
**Diff range**: `6ecd19c..HEAD` — see the Verifier report for the exact range of each pass

---

## Owner-run smoke (T11)

Run on 2026-09-18 by the author, driving the dev app (`electron-vite dev -- --remote-debugging-port=9222`,
xterm 6.0.0, Windows 11 Pro 10.0.26200) through the Chrome DevTools Protocol: mouse events dispatched by
coordinates (`Input.dispatchMouseEvent`, `modifiers: 2` = Ctrl), outcomes read from the OS (window titles,
Explorer COM, process list) and from the app DOM. The nightly install was left running untouched (separate
`playground-nightly` user data). Fixture: an ad-hoc `pwsh` session in `E:\Triade\Repos\playground` printing
six lines; a directory with a space (`%TEMP%\lnk test\probe.zzqx`) created for the run and removed after.

Machine facts that shaped the run: `assoc .md` → no association; `assoc .ts` → `WMP11.AssocFile.TTS`
(Windows Media Player). Both are real consequences of the "default app" decision (AD-041): on this machine a
Ctrl+click on `src\main\index.ts` would launch Media Player, so that link was hover-checked but not opened.

| # | Check | Requirement | Method | Observed | Result |
| - | ----- | ----------- | ------ | -------- | ------ |
| 1 | App mounts with the wiring | — | console after load | only vite/React DevTools notices; no errors | ✅ |
| 2 | Hover a URL | LINK-01 | mousemove to `https://example.com/`, screenshot | exact URL span underlined, `cursor: pointer` | ✅ |
| 3 | Ctrl+click the URL | LINK-02 | click with Ctrl, then window titles | default browser (Comet) window "Example Domain" | ✅ |
| 4 | Hover an existing file with `:line` | LINK-06 | `src\main\index.ts:10` | `cursor: pointer` (link) | ✅ |
| 5 | Hover a missing path | LINK-07 | `src/main/nope.ts` | `cursor: text` (not a link) | ✅ |
| 6 | Hover a spaced path | LINK-08 | `C:\…\Temp\lnk test\probe.zzqx` | whole path underlined, up to `.zzqx` | ✅ |
| 7 | Ctrl+click a directory | LINK-11 | `.\src`, then Explorer COM windows | new Explorer window on `E:\Triade\Repos\playground\src`; closed afterwards | ✅ |
| 8 | Ctrl+click an unassociated file | LINK-10 | `probe.zzqx`, then process/window list | `rundll32 shell32.dll,OpenAs_RunDLL "…\lnk test\probe.zzqx"` spawned; visible window "Selecionar um aplicativo" (OpenWith.exe); quoted spaced path accepted | ✅ |
| 9 | Ctrl+click `.\README.md:3` | LINK-10, LINK-12 | same | `rundll32 … OpenAs_RunDLL E:\Triade\Repos\playground\README.md` — resolved against cwd, `:3` stripped; chooser shown | ✅ |
| 10 | First click on output painted under a still pointer | LINK-19 | pointer parked on an empty row, then the shell printed its prompt `PS E:\Triade\Repos\playground>` under it; Ctrl+click with no mousemove | Explorer opened on `E:\Triade\Repos\playground` on the first click | ✅ |
| 11 | Plain click reaches a mouse-tracking agent | baseline | Node probe in the session (`setRawMode`, `CSI ?1000h ?1006h`, echoes stdin as hex) | `ESC[<0;59;30M` + `ESC[<0;59;30m` received | ✅ (probe works) |
| 12 | Ctrl+click on a link never reaches the agent | LINK-14 | Ctrl+click the URL with the probe listening | **no** bytes received; browser activated | ✅ |
| 13 | Ctrl+click off a link reaches the agent | LINK-15 | Ctrl+click empty space | `ESC[<16;72;33M` / `m` received (button 0 + Ctrl) | ✅ |
| 14 | Plain click on a link reaches the agent, opens nothing | LINK-16 | plain click on the URL | `ESC[<0;9;1M` / `m` received; no chooser/no new window | ✅ |
| 15 | Failure toast | LINK-13 | delete `probe.zzqx` after it was cached as existing, Ctrl+click it | toast "C:\…\lnk test\probe.zzqx no longer exists" | ✅ |
| 16 | Blur clears a pending press | LINK-18 | not exercised live (cannot blur the window from CDP without changing the foreground) | covered by `terminal-link-gesture.test.ts:58` (`pending null → ignore`) + inspection of the 3-line `blur` listener | ☐ unit + inspection |
| 17 | Shift+drag, right-click copy/paste unchanged | TCU suite | not re-exercised live | TCU tests green in the 1021-test run; the new listeners return early on every chord but bare Ctrl+button 0 (`terminal-link-gesture.test.ts:31-39`) | ☐ unit |
| 18 | Hover an OSC 8 `https` link | LINK-20 | second run (after the Verifier's gap): `[Console]::WriteLine` with `ESC ] 8 ; ; https://www.iana.org/domains/reserved BEL iana link ESC ] 8 ; ; BEL` | `cursor: pointer` on "iana link" | ✅ |
| 19 | Ctrl+click the OSC 8 `https` link | LINK-20, LINK-14 | Ctrl+click on "iana link" (a URL that appears nowhere in the visible text); raw-mode probe listening on a second click | browser opened "IANA-managed Reserved Domains"; **no** bytes reached the agent | ✅ |
| 20 | OSC 8 `mailto:` target | LINK-22 | `ESC ] 8 ; ; mailto:a@b.c BEL mail me …`; hover, then Ctrl+click with the probe listening | `cursor: text` (xterm provides no link for it); Ctrl+click passed through as `ESC[<16;7;2M` / `m`; nothing opened, no toast | ✅ |
| 21 | Static OSC 8 decoration | LINK-22 (precision) | screenshot of rows 1–2 | xterm draws its own dotted underline on **every** OSC 8 cell, `https` and `mailto:` alike — that is the renderer's hyperlink decoration, not a provided link; the link underline/pointer appears only for `http(s)` | ℹ️ recorded as a spec assumption |

Cleanup verified after both runs: ad-hoc sessions stopped and removed (config back to the two pre-existing
stopped Claude sessions), dev Electron processes ended, `%TEMP%\lnk test` removed, no `OpenWith`/`rundll32`
left, nightly install untouched.

**Finding for the owner (not a defect of the feature):** with `.ts` associated to Windows Media Player on this
machine, Ctrl+click on any `.ts` path opens Media Player. This is AD-041 working as decided; the follow-ups
recorded in `context.md` (VS Code at line via `code -g`, or a Shift+Ctrl alternate) are the way out if it
annoys in practice.

## Owner-run smoke — amendment (T15)

Run on 2026-09-24 by the author, with the owner at the window, against `feature/terminal-links` @ `fb662e6`
(`electron-vite dev -- --remote-debugging-port=9223 --user-data-dir=<scratch>`, Electron 39.8.10, xterm
6.0.0, Claude Code 2.1.281 on Haiku 4.5, Windows 11 Pro 10.0.26200), driven through the Chrome DevTools
Protocol. Three controls shaped the run:

- **No `WT_SESSION` in the app's environment.** Claude Code also turns hyperlinks on when it sees
  `WT_SESSION` (`if("WT_SESSION"in process.env)return!0` in its bundled `supports-hyperlinks`), and a dev app
  started from a Windows Terminal tab hands that variable down through `buildPtyEnv`. That is why the owner
  saw links on `main` with none of this branch in it. The smoke app was launched with `WT_SESSION` and
  `WT_PROFILE_ID` removed, so only `FORCE_HYPERLINK` (LINK-33) could produce them. Owner cross-check on the
  nightly (no branch, launched from the Start menu): the same markdown reply renders with no link
  decoration.
- **Isolated user data.** A second instance on the shared `userData` rewrites
  `agent-hooks/claude-settings.json` and breaks the first instance's hooks (STATE trap). With
  `--user-data-dir` the owner's `main` dev instance kept running untouched (hook file mtime and port
  unchanged before and after).
- **Channel read from logpoints.** `window.api` is frozen by `contextBridge` in this build, so the invoke
  recorder of the first run is a silent no-op. Two CDP logpoints (conditional breakpoints that log and never
  pause) in the served `TerminalPane.tsx` recorded what `onLinkMouseDown` resolved (`hoveredOsc`, cell,
  `hit`) and what `activateLink` received (`known.kind` picks the channel: `url` → `links:openUrl`,
  `fileUrl` → `links:openFileUrl`, `path` → `links:openPath`). Outcomes came from the OS (process parent
  chain, window titles).

Fixture: an ad-hoc `claude --model haiku --permission-mode acceptEdits` session in a scratch folder
`tl-smoke`, asked to Write `hello.txt`, to reply with `[IANA reserved](https://www.iana.org/domains/reserved)`
and `[mail me](mailto:a@b.c)`, and to reply with `` `https://example.com/plain-url` `` (a code span: printed as
plain text, no OSC 8); an ad-hoc `pwsh` session for the OSC 8 `mailto:` row.

| # | Check | Requirement | Method | Observed | Result |
| - | ----- | ----------- | ------ | -------- | ------ |
| 22 | The agent runs in the alternate screen | LINK-32 (precondition) | `term.buffer.active.type` once Claude Code drew | `alternate` | ✅ |
| 23 | Hover a plain URL in the alternate buffer | LINK-32, LINK-01 | mousemove over `https://example.com/plain-url` (no OSC 8 on those cells) | the provider returned `https://example.com/plain-url` for that row; the span gained `text-decoration: underline`; `xterm-cursor-pointer` on the screen | ✅ |
| 24 | Ctrl+click it | LINK-32, LINK-02 | Ctrl+click with the logpoints | mousedown `osc: null` → `hit { kind: 'url', url: 'https://example.com/plain-url' }` (text detection); activate `url`; Comet "Example Domain" | ✅ |
| 25 | The `Write(hello.txt)` header is an OSC 8 file link | LINK-33 | DOM of the header row, app without `WT_SESSION` | `<span class="xterm-underline-5">hello.txt</span>` (xterm's dashed OSC 8 decoration); hover adds `text-decoration: underline` and the pointer | ✅ |
| 26 | Ctrl+click the header path | LINK-21, LINK-14 | Ctrl+click with the logpoints, then the process parent chain | mousedown `osc: file:///C:/Users/MauroPaiva/…/tl-smoke/hello.txt` → `hit { kind: 'fileUrl' }`; activate `fileUrl`; `Notepad.exe "C:\Users\MauroPaiva\…\tl-smoke\hello.txt"` whose parent is the smoke app's main `electron.exe` — one launch, none from `claude.exe`, so the Ctrl+click never reached the agent | ✅ |
| 27 | Markdown link: blue + dashed, Ctrl+click opens the browser | LINK-20 | screenshot, then Ctrl+click on "IANA reserved" with the logpoints | blue text with the dashed decoration; mousedown `osc: https://www.iana.org/domains/reserved` → `hit { kind: 'url' }`; Comet "IANA-managed Reserved Domains" | ✅ |
| 28 | A `mailto:` markdown link in Claude Code | LINK-22 (precondition) | `[mail me](mailto:a@b.c)` in the reply | Claude Code 2.1.281 emits **no** OSC 8 for `mailto:` — it prints `mail me (a@b.c)` as plain text, so there is nothing to provide or open. The OSC 8 `mailto:` case was driven from pwsh instead | ℹ️ |
| 29 | OSC 8 `mailto:` target | LINK-22 | pwsh `[Console]::WriteLine` with `ESC ] 8 ; ; mailto:a@b.c BEL mail me ESC ] 8 ; ; BEL`; hover, Ctrl+click with the logpoints, process list | hover: `xterm-underline-5` + `text-decoration: underline` + pointer (the accepted assumption: `allowNonHttpProtocols` provides every OSC 8 target); mousedown `osc: mailto:a@b.c` → `hit: null` → not intercepted; `activateLink` never called; no process started | ✅ |
| 30 | Owner hands-on | LINK-20, LINK-21, LINK-22, LINK-32 | the owner used the smoke window directly | "os links funcionaram. apenas o de email que não" and "o clique no hello txt também funcionou" — the e-mail not opening is LINK-22 as specified (and row 28: Claude Code does not make it a link) | ✅ |

Cleanup verified: both smoke sessions stopped and removed (`sessions:list` empty in the smoke user data), the
smoke app's process tree ended (ports 5174 and 9223 free), Notepad windows closed, no `OpenWith`/`rundll32`
left; the owner's `main` dev instance and its sessions untouched. The browser tabs opened by rows 24 and 27
were left to the owner.

---

# Verifier report — terminal-links

**Date**: 2026-09-18
**Spec**: `.specs/features/terminal-links/spec.md` (30 active requirements, `LINK-21` withdrawn)
**Diff range**: `6ecd19c..49a70c1` — 15 commits: 4 `docs(specs)`, 10 feature, 1 unrelated `test(main)`
(`7e498c5`, `dir-remover.test.ts`: replaces a fixed 2.5 s pwsh delay with a lock probe — no assertion
added, removed or weakened; not counted as feature coverage)
**Verifier**: independent sub-agent (author ≠ verifier); read-only over the real tree; mutations in scratch
state only, `git status --short` empty at the end
**Baseline**: 917 tests at `985621d` → **1021** at `49a70c1` (+104 = exactly the five new test files)

---

## Task Completion

| Task | Commit | Status | Notes |
| ---- | ------ | ------ | ----- |
| T1 contract | `1b07824 feat(shared): declare the terminal link probe and open channels` | ✅ Done | `src/shared/links.ts`, three `links:*` channels doc-commented like their neighbours |
| T2 resolve + probe | `b6426c7 feat(main): resolve and probe terminal link candidates` | ✅ Done | — |
| T3 openUrl | `ade85c3 feat(main): open http and https terminal links in the default browser` | ✅ Done | — |
| T4 openPath | `12f0feb feat(main): open terminal file links with the Windows default app or the chooser` | ✅ Done | — |
| T5 handlers | `b02fbcf feat(main): serve the terminal link channels` | ✅ Done | `hasAssociation('')` is never reached: `openPath` guards `ext &&` (`link-opener.ts:85`), pinned by `link-opener.test.ts:210-216` |
| T6 detection | `ece154c feat(renderer): detect url and file path candidates on a terminal line` | ✅ Done | — |
| T7 geometry | `962f2e0 feat(renderer): map terminal link text to buffer cells across soft wraps` | ✅ Done | — |
| T8 gesture | `18f9e87 feat(renderer): classify the ctrl-click link gesture` | ✅ Done | — |
| T9 provider | `9f1afff feat(renderer): provide terminal links to xterm and hit-test them for the pane` | ✅ Done | `settled` resolves to `KnownLinkHit \| null`, not the design's `Promise<PathKind>` — harmless drift, design.md not updated |
| T10 pane wiring | `aa10c60 feat(terminal): open urls and file paths with ctrl+click` | ✅ Done | Task text claims "every decision is in T6–T9's tested libs" — not true for the OSC 8 branch (`hoveredOsc` containment → url hit), which is pane-only. See LINK-20 |
| T11 owner smoke | `49a70c1 docs(specs): record the owner smoke for terminal-links` | ⚠️ Partial | 17 rows cover every Success Criterion and LINK-14/15/16/19; **no OSC 8 row** (spec P2 Independent Test not run) |

---

## Spec-Anchored Acceptance Criteria

Evidence rule applied: tested libs (`src/main/link-opener.ts`, `src/renderer/src/lib/*`) need a `file:line`
+ assertion; wiring-only requirements (`TerminalPane.tsx`, `AgentsView.tsx`, `App.tsx` — hand-verified by
repo convention, `vitest.config.ts:15-18`, `tasks.md` Test Coverage Matrix) need the owner-smoke row **and**
the inspected source line. No citation → not covered.

### P1: Ctrl+click opens a URL in the browser

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-01 hover underlines an `http(s)` URL while the pointer is over it | link with `underline` decoration over the exact URL span | `terminal-link-provider.test.ts:65-70` — `expect(links).toHaveLength(1)`; `toMatchObject({ text: 'https://example.com/x', range: { start: { x: 5, y: 1 }, end: { x: 25, y: 1 } }, decorations: { underline: true, pointerCursor: true } })`; `terminal-links.test.ts:7-14` exact span; smoke row 2 (underline + `cursor: pointer` in the app) | ✅ PASS |
| LINK-02 Ctrl+press+release over a URL, < 4 px, opens it in the default browser | `shell.openExternal(url)` called once with that URL; `{ ok: true }` | `link-opener.test.ts:142-143` — `expect(result).toEqual({ ok: true })`; `expect(fakes.openedUrls).toEqual(['https://dev.azure.com/x/y/_workitems/edit/123'])`; hit: `terminal-link-provider.test.ts:157` — `expect(provider.hitTest(10, 1)).toEqual({ kind: 'url', url: 'https://example.com/x' })`; gesture: `terminal-link-gesture.test.ts:50-51` — `toBe('open')` at 0 px and 3.9 px; wiring `TerminalPane.tsx:183-184`; smoke row 3 | ✅ PASS |
| LINK-03 soft-wrapped URL is one link and opens complete | joined text equals the full URL; range spans the rows | `terminal-buffer-lines.test.ts:70-74` — `expect(windowedLine(buffer, 2)).toEqual({ text: 'https://example.com/a/b.ts', topRow: 1, … })`; `:139-140` — `expect(range).toEqual({ start: { x: 1, y: 1 }, end: { x: 0, y: 3 } })`, `expect(range!.start.y).toBeLessThan(range!.end.y)`; the provider's link `text` is `line.text.slice(candidate.start, end)` over the windowed text (`terminal-link-provider.ts:114`, inspected — no provider test uses a wrapped fake) | ✅ PASS (composition by inspection) |
| LINK-04 non-`http(s)` scheme in main: no `openExternal`, refusal reported | `{ ok: false, error }` naming the URL; fake never called | `link-opener.test.ts:152-161` (`mailto:`, `vscode://`, `file:///`, `javascript:`) — `expect(result.ok).toBe(false)`; `expect(result.error).toContain(url)`; `expect(fakes.openedUrls).toEqual([])`; `:163-169` unparsable text | ✅ PASS |
| LINK-05 open failure → toast naming the URL; terminal and PTY untouched | error string contains the URL; `onToast` receives it | `link-opener.test.ts:175-176` — `expect(result.ok).toBe(false)`; `expect(result.error).toContain('https://example.com/')`; toast wiring `TerminalPane.tsx:186` `onToastRef.current(result.error …)` and `:211-213` (rejection); PTY untouched by construction — `stopPropagation` at `:199-200`/`:205-206` precedes activation; smoke row 12 (no bytes reach the agent on a link Ctrl+click), row 15 (toast text) | ✅ PASS |

### P1: Ctrl+click opens a file path with its default app

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-06 separator path (+ optional `:line[:col]`) that exists → underlined, suffix included | candidate `text` includes the suffix, `pathText` excludes it; only existing candidates become links | `terminal-links.test.ts:50-70` — `toEqual([{ kind: 'path', text, pathText, line, col, start: 7, end: 7 + text.length }])` for `src/lib/foo.ts:12:3` (line 12, col 3), `E:\Repos\X\Foo.cs:40`, `.\a\b.sql`, `..\c.md`, `~/x/y`, `/abs/p`; `terminal-link-provider.test.ts:82-84` — `expect(calls).toEqual([['src/a.ts', 'src/b.ts', 'src/nope.ts']])`; `expect(links?.map((l) => l.text)).toEqual(['src/a.ts', 'src/b.ts'])`; `expect(links![0].range).toEqual({ start: { x: 8, y: 1 }, end: { x: 15, y: 1 } })`; smoke row 4 | ✅ PASS |
| LINK-07 missing candidate → no underline; once probed, Ctrl+click passes through | not in links; `hitTest` → `null`; gesture → `'pass'` | `terminal-link-provider.test.ts:83` (`nope.ts` absent), `:172-179` — `expect(provider.hitTest(10, 1)).toBeNull()` after the probe; `terminal-link-gesture.test.ts:23-25` — `expect(linkGestureOnMouseDown(ctrlClick, null)).toBe('pass')`; wiring `TerminalPane.tsx:198` (early return, no `stopPropagation`); smoke row 5 | ✅ PASS |
| LINK-08 spaced candidate: probe each extension-terminated prefix, link the longest that exists | alternatives = extension-terminated prefixes; longest existing wins | `terminal-links.test.ts:116-123` — `expect(alternatives?.map((a) => a.pathText)).toEqual(['E:\Meus Docs\a.txt b.md', 'E:\Meus Docs\a.txt'])`; `:110-114` `E:\Meus` **not** offered; `terminal-link-provider.test.ts:123-128` — one batch `expect.arrayContaining(['E:\Meus Docs\a.txt', 'E:\Meus', 'Docs\a.txt'])`, `expect(links?.map((l) => l.text)).toEqual(['E:\Meus Docs\a.txt'])`, range `{ start: { x: 10, y: 1 }, end: { x: 27, y: 1 } }`; `:131-137` fallback to the plain candidate; smoke row 6 | ✅ PASS |
| LINK-09 Ctrl+click a linked file → Windows default app | `shell.openPath(abs)` once; no spawn | `link-opener.test.ts:185-192` — `expect(result).toEqual({ ok: true })`; `expect(fakes.associationQueries).toEqual(['.ts'])`; `expect(fakes.openedPaths).toEqual([FILE])`; `expect(fakes.spawns).toEqual([])` (smoke deliberately did not open `.ts` — Media Player association on the author's machine) | ✅ PASS |
| LINK-10 no association → native "Open with" chooser | `rundll32.exe shell32.dll,OpenAs_RunDLL <abs>`; `openPath` not called | `link-opener.test.ts:194-200` — `expect(fakes.openedPaths).toEqual([])`; `expect(fakes.spawns).toEqual([CHOOSER])` with `CHOOSER = ['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', FILE]]`; `:202-208` fallback when `openPath` reports failure; smoke rows 8-9 (OpenWith window "Selecionar um aplicativo") | ✅ PASS |
| LINK-11 Ctrl+click a linked directory → File Explorer | `explorer.exe <abs>` | `link-opener.test.ts:218-224` — `expect(fakes.spawns).toEqual([['explorer.exe', [DIR]]])`; `expect(fakes.openedPaths).toEqual([])`; smoke row 7 | ✅ PASS |
| LINK-12 relative → session cwd; `~/` → home; `:line[:col]` stripped before resolution, never passed on | resolved absolute path; `pathText` without suffix | `link-opener.test.ts:66-68` — `toBe('E:\Repos\X\wt-1\src\main\index.ts')`; `:73-74` `./`, `../`; `:79` — `toBe('C:\Users\dev\x\y.txt')`; suffix strip `terminal-links.test.ts:51-52` (`pathText: 'src/lib/foo.ts'`, `line: 12`, `col: 3`); the renderer sends `pathText` only (`terminal-link-provider.ts:90,161`; `TerminalPane.tsx:185`, inspected); smoke row 9 (`:3` absent from the rundll32 args) | ✅ PASS |
| LINK-13 open fails → toast naming the path | error string contains the path | `link-opener.test.ts:226-229` — `toEqual({ ok: false, error: `${CWD}\src\gone.ts no longer exists` })`; `:236-246` — `` `Couldn’t open ${FILE}` `` / `` `Couldn’t open ${DIR}` ``; wiring `TerminalPane.tsx:186`; smoke row 15 (toast "… no longer exists") | ✅ PASS |

### P1: The agent keeps the mouse

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-14 Ctrl+press over a link is stopped before xterm; no mouse report for press or release | `'intercept'`; `preventDefault` + `stopPropagation` on both capture events | `terminal-link-gesture.test.ts:19-21` — `expect(linkGestureOnMouseDown(ctrlClick, hit)).toBe('intercept')`; wiring `TerminalPane.tsx:199-201` (mousedown), `:205-206` (mouseup), both registered in capture at `:219-220`, before `onRightMouseDown` (`:388`); smoke row 12 — mouse-tracking probe received **no** bytes | ✅ PASS |
| LINK-15 Ctrl+press not over a link is untouched | `'pass'`; no `stopPropagation` | `terminal-link-gesture.test.ts:23-25` — `toBe('pass')` with `null` hit; wiring `TerminalPane.tsx:197-198`; smoke row 13 — `ESC[<16;72;33M`/`m` received by the agent | ✅ PASS |
| LINK-16 click without Ctrl → nothing link-related | `'pass'`; no hit test, no probe; OSC 8 default activation disabled | `terminal-link-gesture.test.ts:27-29` — `expect(linkGestureOnMouseDown({ …ctrlClick, ctrlKey: false }, hit)).toBe('pass')`; wiring `TerminalPane.tsx:190` (chord checked before any hit test) and `:169` `activate: () => {}` (xterm's default would `window.open` the OSC 8 target — verified in the 6.0.0 bundle); smoke row 14 — plain click reaches the agent, nothing opens | ✅ PASS |
| LINK-17 Ctrl+press then ≥ 4 px before release → not opened | `'ignore'` at ≥ 4 px; threshold constant 4 | `terminal-link-gesture.test.ts:45-47` — `expect(DRAG_THRESHOLD_PX).toBe(4)`; `:54-57` — `toBe('ignore')` at 104,100 (4.0 px) and 103,103 (4.24 px); `:49-52` — `toBe('open')` at 3.9 px (mutation 2 killed) | ✅ PASS |
| LINK-18 window blur forgets the pending gesture | `pendingLink = null`; subsequent mouseup → `'ignore'` | `terminal-link-gesture.test.ts:59-61` — `expect(linkGestureOnMouseUp(null, …)).toBe('ignore')`; wiring `TerminalPane.tsx:216-218,221` (`window.addEventListener('blur', forgetPendingLink)`), removed at `:402`; smoke row 16 (not exercised live — unit + inspection, declared by the author) | ✅ PASS (wiring by inspection) |
| LINK-19 first click on output painted under a still pointer resolves and opens; unprobed candidate intercepted and probed; a miss is swallowed and cached | `hitTest` returns `{ state: 'unprobed', settled }`; `settled` → existing hit or `null`; miss cached → next `hitTest` `null` | `terminal-link-provider.test.ts:185-189` — `toMatchObject({ kind: 'path', pathText: 'src/a.ts', state: 'unprobed' })`; `expect(settled).toEqual({ kind: 'path', pathText: 'src/a.ts', state: 'file' })`; `expect(calls).toEqual([['src/a.ts']])`; `:192-198` — `expect(await hit.settled).toBeNull()`; `expect(provider.hitTest(10, 1)).toBeNull()`; wiring `TerminalPane.tsx:180-181` (`await hit.settled`, return on `null`), `:198-201` (unprobed hit is intercepted); smoke row 10 (prompt painted under a parked pointer, first Ctrl+click opened Explorer) | ✅ PASS |

### P2: Explicit OSC 8 hyperlinks

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-20 OSC 8 `http(s)` target: Ctrl+click on its text opens the target regardless of the visible text | `links:openUrl` with the OSC 8 URI | **No test** (pane-only composition: `TerminalPane.tsx:168-176` tracks `hoveredOsc = { text, range }` from `linkHandler.hover`; `:194-195` returns `{ kind: 'url', url: hoveredOsc.text }` when the cell is inside the range). xterm 6.0.0 bundle inspected: `OscLinkProvider` passes the link **URI** as `text` to `hover`/`activate`, so the mechanism is right. **No smoke row** — the spec's P2 Independent Test (`printf '\e]8;;https://example.com\e\\click me\e]8;;\e\\'`) was not run (T11 Done-when omits it) | ❌ GAP — implemented by inspection, never exercised |
| LINK-22 OSC 8 target with any other scheme is not a link: no underline, Ctrl+click passes through | xterm drops the link; text detection never yields non-http candidates | Text half: `terminal-links.test.ts:35-40` — `expect(detectLinkCandidates(line)).toEqual([])` for `mailto:`, `vscode://file/E:/x/y.ts`, `file:///E:/x/y.cs`, `ms-teams:launch`; `link-opener.test.ts:152-161` (main refuses anyway). OSC 8 half: `allowNonHttpProtocols` not set (`TerminalPane.tsx:168-176`) and the 6.0.0 bundle's `OscLinkProvider` gate `["http:","https:"].includes(e.protocol)` inspected; no smoke row for a non-http OSC 8 target | ✅ PASS (OSC half by inspection of xterm; would be closed for free by the LINK-20 smoke with a `mailto:` variant) |

### Edge cases

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-23 URL ending in `.`, `,`, `;`, `:` or an unmatched `)`/`]` excludes that character | link text without the trailing char | `terminal-links.test.ts:22-33` — six cases, `expect(candidates[0]).toMatchObject({ kind: 'url', text: expected })` (`https://x.y/a?b=1.` → `…?b=1`, `;` → mutation 4 killed, `(https://x.y/a)` → `https://x.y/a`, `[…]`); paths: `:84-87` `(see src/a.ts).` → `src/a.ts` | ✅ PASS — ⚠️ spec-precision flag: the spec says "unmatched", implying a **balanced** `)` stays; the ported URL regex excludes `(`/`)` from the URL body entirely, so `https://en.wikipedia.org/wiki/Foo_(bar)` links as `…/Foo_` (probed with the pure lib; addon-web-links behaviour). Paths do balance (`trimPathTail`). No AC states the balanced case; not a defect against the spec as written |
| LINK-24 probe failure → every candidate on the row non-existent, no throw | main: stat error → `'missing'`; renderer: rejection → `cb(undefined)`, cached `'missing'` | `link-opener.test.ts:117-121` — `expect(results[0].kind).toBe('missing')`; `terminal-link-provider.test.ts:100-107` — `expect(await provideLinks(provider, 1)).toBeUndefined()` twice, `expect(calls).toHaveLength(1)` (mutation 7 killed) | ✅ PASS |
| LINK-25 probe result after the row changed is discarded | `cb(undefined)` on fingerprint mismatch | `terminal-link-provider.test.ts:109-116` — `buffer.set(0, 'something else')` between start and settle; `expect(await pending).toBeUndefined()` (mutation 6 killed); fingerprint sensitivity `terminal-buffer-lines.test.ts:111-118` | ✅ PASS |
| LINK-26 same resolved path again in the pane → cached, no re-probe | second `provideLinks` issues no probe | `terminal-link-provider.test.ts:87-94` — `expect(calls).toHaveLength(1)` after the second call; `expect(second?.map((l) => l.text)).toEqual(['src/a.ts'])` | ✅ PASS |
| LINK-27 terminal disposed → provider, listeners and cache disposed | `dispose()` clears the cache; pane cleanup removes listeners and disposes the provider registration | `terminal-link-provider.test.ts:95-97` — `provider.dispose()` then `expect(calls).toHaveLength(2)`; wiring `TerminalPane.tsx:400-404` (`removeEventListener` ×3, `linkProvider.dispose()`, `links.dispose()`) inside the effect cleanup that also runs `term.dispose()` (`:413`); smoke row 1 / session switch not separately measured | ✅ PASS (wiring by inspection) |
| LINK-28 links in scrollback behave like live rows | mouse → 1-based, `viewportY`-offset cell; `hitTest` on a row above the viewport | `terminal-buffer-lines.test.ts:209-214` — `toEqual({ x: 41, y: 111 })` for (405, 210) at `viewportY = 100` (mutation 8 killed); `terminal-link-provider.test.ts:200-209` — `expect(provider.hitTest(10, 151)).toEqual({ kind: 'url', … })` on row 151 of 200 | ✅ PASS |
| LINK-29 non-absolute after resolution → "does not exist", not probed or opened | `absolutePath: null`, `kind: 'missing'`, no `stat`; `openPath` → `ok: false` | `link-opener.test.ts:87-91` — `expect(opener.resolveCandidate('', 'src/a.ts')).toBeNull()`; `:109-115` — `toEqual([{ pathText: 'src/a.ts', absolutePath: null, kind: 'missing' }])`, `expect(fakes.statCalls).toEqual([])`; `:231-234` — `toEqual({ ok: false, error: 'src/a.ts no longer exists' })` | ✅ PASS |
| LINK-30 never open on `mousedown`; activation on `mouseup` only | `mousedown` classifier returns only `'intercept' \| 'pass'`; `'open'` exists only on `mouseup` | `terminal-link-gesture.test.ts:19-21,49-52` (`'open'` is a `linkGestureOnMouseUp` outcome); wiring: `activateLink` is called only from `onLinkMouseUp` (`TerminalPane.tsx:210-211`), never from `onLinkMouseDown` (`:188-202`); smoke rows 3/7/8 opened after a full click | ✅ PASS (wiring by inspection) |
| LINK-31 executable path treated like any file | `.ps1` → association route, `openPath` called | `link-opener.test.ts:248-255` — `expect(fakes.associationQueries).toEqual(['.ps1'])`; `expect(fakes.openedPaths).toEqual([script])` | ✅ PASS |

**Status**: ❌ Gaps present — 29/30 active ACs evidenced (24/24 P1, 8/9 edge, 1/2 P2); **LINK-20** has no
test and no smoke; 1 ⚠️ spec-precision flag (LINK-23 balanced parentheses in URLs).

---

## Discrimination Sensor

Scratch-only: edit → run that module's test file (`--reporter=json`) → `git restore` → `git status --short`
empty before the next. Tree clean at the end.

| # | File:line | Mutation | Killed by | Result |
| - | --------- | -------- | --------- | ------ |
| 1 | `src/main/link-opener.ts:55` | scheme guard also accepts `mailto:` | `refuses mailto:a@b.c without calling the shell` (26/27) | ✅ Killed |
| 2 | `src/renderer/src/lib/terminal-link-gesture.ts:44` | `moved < DRAG_THRESHOLD_PX` → `<=` | `ignores a release 4 px or further away` (11/12) | ✅ Killed |
| 3 | `src/renderer/src/lib/terminal-link-gesture.ts:33` | dropped `!event.shiftKey` | `passes when Shift held` (11/12) | ✅ Killed |
| 4 | `src/renderer/src/lib/terminal-links.ts:30` | removed `;` from the URL last-char class | `excludes trailing punctuation: https://x.y/a; → https://x.y/a` (31/32) | ✅ Killed |
| 5 | `src/renderer/src/lib/terminal-links.ts:51` | dropped the drive lookbehind `(?<![\p{L}\p{N}])` | `never yields a candidate for vscode://file/E:/x/y.ts` + `file:///E:/x/y.cs` (30/32) | ✅ Killed |
| 6 | `src/renderer/src/lib/terminal-link-provider.ts:139` | fingerprint check skipped (always `linksFor`) | `discards a probe result for a row that was repainted meanwhile` (14/15) | ✅ Killed |
| 7 | `src/renderer/src/lib/terminal-link-provider.ts:66` | failed probe cached as `'file'` | `treats a failed probe as missing: no links, no throw, cached as missing` (14/15) | ✅ Killed |
| 8 | `src/renderer/src/lib/terminal-buffer-lines.ts:164` | dropped `+ viewportY` (scrollback offset) | `maps a click to the 1-based cell, offset by the viewport scroll` (17/18) | ✅ Killed |

**Sensor depth**: lightweight (8 behaviour-level mutations, two per tested module)
**Result**: 8/8 killed — PASS ✅

---

## Interactive UAT Results

Not performed by the Verifier; the owner-run smoke above (17 rows, CDP-driven, OS-observed) stands as the
hand-verification of the renderer wiring. Rows 16-17 are declared "unit + inspection" by the author.

---

## Code Quality

| Principle | Status | Notes |
| --------- | ------ | ----- |
| Minimum code | ✅ | 105-line `LinkOpener`; 45-line gesture classifier; 168/166/192-line libs where the ported addon code is attributed. `inFlight` dedupe in the provider is the minimum that keeps hover and `hitTest` from double-probing (LINK-19 + LINK-26) |
| Surgical changes | ✅ | `shortcut-launcher.ts`: `export` only. `index.ts`: one block next to `shortcuts:launch`, reuses the existing `execFileAsync`. No adjacent code reformatted; the `useEffect` gains `cwd` in its deps (static per session — no practical remount) |
| No scope creep | ✅ | Nothing beyond the 30 ACs: no tooltip, no `code -g`, no block list (AD-041), `allowNonHttpProtocols` untouched |
| Matches patterns | ✅ | Capture-listener pattern of TCU (`onRightMouseDown`), pure classifier shape of `terminal-keys.ts`, DI-with-fakes of `session-manager.test.ts`, typed `handle()` channels. Nit: `hit: unknown \| null` in `linkGestureOnMouseDown` collapses to `unknown` — harmless |
| Spec-anchored outcome check | ✅ | Every asserted value above matches the spec outcome; one ⚠️ (LINK-23 balanced parens) where the spec is silent |
| Per-layer Coverage Expectation met | ⚠️ | Libs and `LinkOpener`: 1:1 with the ACs they own, every design Error-Handling row has a test. Renderer components: the smoke covers every Success Criterion + LINK-14/15/16/19 as the matrix asked — but LINK-20/22 (OSC 8) were left out of both the matrix's smoke list and T11 |
| Every test maps to a spec AC / edge / Done-when — no unclaimed tests | ✅ | `describe` titles carry the LINK ids; the untitled ones map to Done-when items (`bounds` → T6 cap 32; `rangeContains` → T7; `file without an extension` → T4/T5 `''` ext; batch cap → T2) |
| Test integrity | ✅ | No existing assertion weakened or deleted; 917 → 1021, +104 = the five new files. `7e498c5` swaps a sleep for a lock probe in `dir-remover.test.ts` (timing only) |
| Documented guidelines followed | ✅ | `README.md:111` pre-PR gate run; `vitest.config.ts:15-18` layering respected (libs + main tested, components hand-verified); precedent `.specs/features/terminal-copy-undo-fixes/spec.md:52-54` (pure classifier + hand-verified pane) followed |

**Observations (non-blocking, by inspection):**

1. `TerminalPane.tsx:203-215` — `pendingLink` is cleared only by a `mouseup` **on the container** or a
   window `blur`. A Ctrl+press on a link followed by a release outside the pane (over the sidebar, in the
   same window) leaves `pendingLink` set: the next plain click's `mouseup` in the pane is then
   `preventDefault`ed/`stopPropagation`ed (the agent gets a press without its release), and if that click
   lands within 4 px of the original press point the link opens on a **plain** click (LINK-16 corner).
   One-line fix: reset `pendingLink = null` at the top of `onLinkMouseDown`, or listen `mouseup` on
   `window`. Not reproduced live.
2. LINK-19 × OSC 8: `hoveredOsc` is only set by xterm's `hover`, i.e. on mousemove. A first Ctrl+click on
   an un-hovered OSC 8 link whose visible text is not itself a URL/path (`click me`) falls to
   `links.hitTest` → `null` → passes through. The spec words LINK-19 for path candidates, so this is
   outside the ACs; recording it because it is the one first-click case the design's approach B does not
   cover.
3. design.md `LinkHit.settled: Promise<PathKind>` vs implementation `Promise<KnownLinkHit | null>` —
   doc drift only.
4. The header of this file says "13 commits"; `6ecd19c..49a70c1` holds 15 (14 before the smoke commit).

---

## Edge Cases

- [x] LINK-23 trailing punctuation / unmatched bracket excluded (⚠️ balanced `)` in a URL is cut — spec silent)
- [x] LINK-24 probe failure → non-existent, no throw (main and renderer)
- [x] LINK-25 stale probe result discarded
- [x] LINK-26 cache reuse per pane
- [x] LINK-27 dispose clears provider registration, listeners, cache
- [x] LINK-28 scrollback rows
- [x] LINK-29 non-absolute → "does not exist", never probed/opened
- [x] LINK-30 activation on `mouseup` only
- [x] LINK-31 executables take the file route

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Build level, `tasks.md` §Gate Check Commands)
- **typecheck**: exit 0 (`tsconfig.node.json` + `tsconfig.web.json`)
- **lint**: exit 0 — 0 errors, 18 warnings, all `prettier/prettier` in pre-existing files
  (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`,
  `src/shared/tasks.test.ts`); none in feature files — identical to `main`
- **tests**: `npx vitest run --reporter=json` → **1021 passed, 0 failed, 0 skipped, 0 todo** (236 suites, exit 0)
- **Test count before feature**: 917 (`985621d`)
- **Test count after feature**: 1021
- **Delta**: +104 — `link-opener.test.ts` 27, `terminal-links.test.ts` 32, `terminal-buffer-lines.test.ts` 18,
  `terminal-link-gesture.test.ts` 12, `terminal-link-provider.test.ts` 15
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: LINK-20 has no evidence (P2, Minor)

- **Root cause**: the OSC 8 branch is a pane-only composition (`hoveredOsc` range containment → url hit);
  the Test Coverage Matrix's smoke list named LINK-14/15/16/18/19 but not LINK-20/22, and T11's Done-when
  followed that list. The mechanism is correct by inspection of the xterm 6.0.0 bundle (`text` = URI,
  http(s) gate), but nothing measured it.
- **Fix task**: run the spec's P2 Independent Test in the dev app —
  `printf '\e]8;;https://example.com\e\\click me\e]8;;\e\\'` → hover underlines "click me", Ctrl+click
  opens example.com (LINK-20); repeat with `\e]8;;mailto:a@b.c\e\\mail\e]8;;\e\\` → no underline, Ctrl+click
  passes through (LINK-22 OSC half). Append two rows to the owner smoke table. No code change expected.
- **Priority**: Minor (P2 story; no agent observed emitting OSC 8)

### Fix 2 (optional): pending gesture survives a release outside the pane

- **Root cause**: `pendingLink` cleared only by container `mouseup` / window `blur` (Observation 1).
- **Fix task**: `pendingLink = null` at the top of `onLinkMouseDown` (or `window`-level `mouseup`); smoke:
  Ctrl+press a link, release over the sidebar, plain-click the same spot → nothing opens, agent receives
  the plain press and release.
- **Priority**: Minor (narrow corner, not reproduced)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| LINK-01 | In Tasks | ✅ Verified |
| LINK-02 | In Tasks | ✅ Verified |
| LINK-03 | In Tasks | ✅ Verified |
| LINK-04 | In Tasks | ✅ Verified |
| LINK-05 | In Tasks | ✅ Verified |
| LINK-06 | In Tasks | ✅ Verified |
| LINK-07 | In Tasks | ✅ Verified |
| LINK-08 | In Tasks | ✅ Verified |
| LINK-09 | In Tasks | ✅ Verified |
| LINK-10 | In Tasks | ✅ Verified |
| LINK-11 | In Tasks | ✅ Verified |
| LINK-12 | In Tasks | ✅ Verified |
| LINK-13 | In Tasks | ✅ Verified |
| LINK-14 | In Tasks | ✅ Verified |
| LINK-15 | In Tasks | ✅ Verified |
| LINK-16 | In Tasks | ✅ Verified |
| LINK-17 | In Tasks | ✅ Verified |
| LINK-18 | In Tasks | ✅ Verified |
| LINK-19 | In Tasks | ✅ Verified |
| LINK-20 | In Tasks | ❌ Needs Fix (evidence: smoke) |
| LINK-21 | Withdrawn | Withdrawn |
| LINK-22 | In Tasks | ✅ Verified |
| LINK-23 | In Tasks | ✅ Verified (⚠️ spec-precision: balanced `)` in URLs) |
| LINK-24 | In Tasks | ✅ Verified |
| LINK-25 | In Tasks | ✅ Verified |
| LINK-26 | In Tasks | ✅ Verified |
| LINK-27 | In Tasks | ✅ Verified |
| LINK-28 | In Tasks | ✅ Verified |
| LINK-29 | In Tasks | ✅ Verified |
| LINK-30 | In Tasks | ✅ Verified |
| LINK-31 | In Tasks | ✅ Verified |

---

## Summary

**Overall**: ⚠️ Issues — P1 MVP fully verified; one P2 AC unevidenced

**Spec-anchored check**: 29/30 ACs matched the spec outcome (24/24 P1, 8/9 edge, 1/2 P2) | 1 spec-precision gap flagged (LINK-23)
**Sensor**: 8/8 mutations killed
**Gate**: 1021 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors (18 pre-existing warnings)

**What works**: URL and file-path detection with the exact spans the spec asks for; existence-gated path
links with per-pane cache, stale-row discard and failure-as-missing; scheme-gated `openUrl` and the
Explorer / default-app / "Open with" routes in main, every error path returning a `LaunchResult` the pane
toasts; the Ctrl gesture classifier at the 4 px boundary; the capture-phase interception that keeps the
agent's mouse (measured with a mouse-tracking probe); first-click reliability on freshly painted output.

**Issues found**: LINK-20 (OSC 8 Ctrl+click) — implemented, never exercised: run the P2 Independent Test
and record it (Fix 1). Optional: clear `pendingLink` on every `mousedown` (Fix 2).

**Next steps**: Fix 1 (smoke rows for LINK-20/22) → re-verify; then update `spec.md` statuses per the
table above.

---

## Re-verification (pass 2)

**Date**: 2026-09-18
**Delta range**: `49a70c1..626762f` — 2 commits on top of the pass-1 range: `9afe7f6 fix(terminal): forget a
link press released outside the pane` (1 file, +3 lines) and `626762f docs(specs): close the terminal-links
verifier gaps …` (`.specs/` only: `validation.md` +4 smoke rows, `spec.md` +2 assumptions + traceability,
`design.md` `settled` type + Status Approved, `tasks.md` Status Done). Full feature range `6ecd19c..626762f`,
17 commits. No test file changed.
**Verifier**: independent sub-agent (author ≠ verifier), second pass; read-only over the real tree except
this file; one scratch mutation, `git restore`d, `git status --porcelain` empty at the end.

### Fix review — `9afe7f6` (pass-1 Fix 2 / Observation 1)

The diff is exactly the recommended one-liner plus a two-line comment, at the top of `onLinkMouseDown`
(`src/renderer/src/components/TerminalPane.tsx:189-191`), before the chord check (`:193`).

**Closes the corner case.** Sequence: Ctrl+press over a link → `pendingLink` set (`:204`); release over the
sidebar → the container's capture `mouseup` (`:206`) never fires, `pendingLink` stays; next **plain** press
in the pane → `:191` clears it, then `:193` returns `'pass'` (no Ctrl); its release → `:207` `if (!pendingLink)
return` → the plain `mouseup` is neither `preventDefault`ed nor stopped, and `activateLink` is never
reached. Before the fix that release was swallowed and, within 4 px of the stale press, opened the link on a
plain click (LINK-16 corner). Now the agent receives the plain press and its release.

**No regression on the gestures it touches, by trace:**

- LINK-14 (Ctrl+press over a link stopped for press and release): `:191` is a no-op when nothing is pending;
  `:193` `'intercept'`, hit test `:194-199`, `preventDefault`/`stopPropagation` `:202-203`, pending set
  `:204`; release stopped at `:208-209`. Unchanged. Smoke rows 12 and 19 measured it (no bytes reach the
  mouse-tracking probe).
- LINK-17 (≥ 4 px → not opened): decided on `mouseup` by `linkGestureOnMouseUp` (`:211`,
  `terminal-link-gesture.ts:38-45`); the new reset runs on a *later* `mousedown`, so it cannot change the
  outcome of the release it was armed for.
- LINK-18 (blur forgets): `forgetPendingLink` (`:219-221`) still registered on `window` `blur` (`:224`) and
  removed at `:405`. The new reset is a second, independent forget site.
- LINK-30 (never open on `mousedown`): `activateLink` (`:179`) is still called only from `onLinkMouseUp`
  (`:214`); the reset adds no call.

**Adversarial check on the one new behaviour.** The reset runs for *every* button, before the chord check.
So a secondary press while a Ctrl+primary press is still pending (right-click during the hold) now retires
the pending link; the primary release then propagates to xterm unstopped. Verified in the installed
`@xterm/xterm` 6.0.0 bundle (`lib/xterm.js`) that this orphan release is inert: xterm attaches its
mouse-report `mouseup` to `document` only from inside its own `mousedown` handler (`s.mouseup &&
this._document.addEventListener("mouseup", s.mouseup)` after `sendEvent`), and the selection service does the
same from its `mousedown`; both were skipped because the press was stopped in capture. The only element-level
`mouseup` is the Linkifier's activation path, and every link here carries a no-op `activate` (`:169` for OSC 8,
provider links by design). Net: that exotic chord opens nothing and reports nothing — more conservative than
before, consistent with LINK-17's intent. Not a defect.

**Citation shift.** The 3 inserted lines move every pass-1 `TerminalPane.tsx` citation after line 188 by +3
(`:190`→`:193`, `:194-195`→`:197-198`, `:197-198`→`:200-201`, `:199-201`→`:202-204`, `:203-215`→`:206-218`,
`:205-206`→`:208-209`, `:210-211`→`:213-214`, `:216-218,221`→`:219-221,224`, `:219-220`→`:222-223`,
`:388`→`:391`, `:400-404`→`:403-407`, `:402`→`:405`, `:413`→`:416`). Citations at or before `:186` are
unchanged. The pass-1 report is left as written; this table is the map.

### Evidence verdicts — LINK-20 / LINK-22 / LINK-23

| Criterion | Spec-defined outcome | New evidence | Result |
| --------- | -------------------- | ------------ | ------ |
| LINK-20 OSC 8 `http(s)` target: Ctrl+click on its text opens the target regardless of the visible text | target opened per LINK-02 (default browser); press stopped before xterm (LINK-14) | Smoke row 18: OSC 8 `https://www.iana.org/domains/reserved` with visible text `iana link` → `cursor: pointer` on hover. Row 19: Ctrl+click on `iana link` (the URL appears nowhere in the visible text, so text detection cannot have produced the hit) → browser opened "IANA-managed Reserved Domains"; raw-mode probe received **no** bytes. Wiring `TerminalPane.tsx:168-176` (`hoveredOsc`), `:197-198` (range containment → `{ kind: 'url', url: hoveredOsc.text }`), `:183-184` (`links:openUrl`) | ✅ PASS — the P2 Independent Test was run (target substituted for `example.com`, same outcome class); "regardless of the visible text" is exactly what the fixture isolates |
| LINK-22 OSC 8 target with any other scheme: not a link — no underline, Ctrl+click passes through | not provided as a link; Ctrl+click reaches xterm/agent as an ordinary click | Smoke row 20: OSC 8 `mailto:a@b.c` → `cursor: text` on hover (no provided link); Ctrl+click passed through as `ESC[<16;7;2M` / `m` (button 0 + Ctrl, same encoding as row 13's LINK-15 pass-through); nothing opened, no toast. Row 21 + new spec assumption "xterm's static OSC 8 decoration is out of our hands": xterm draws its own dotted underline on every OSC 8 cell regardless of scheme; the assumption (owner-accepted, `y`) scopes LINK-22's "no underline" to the **link** underline/pointer a provider grants. Text half unchanged (`terminal-links.test.ts:35-40`, `link-opener.test.ts:152-161`) | ✅ PASS — pass-through measured; "no underline" is now precise by assumption. Nit (cosmetic): the AC text still reads "no underline"; the assumption row is the disambiguation — "no link underline" in the AC would spare the next reader the lookup |
| LINK-23 trailing `.`/`,`/`;`/`:` or unmatched `)`/`]` excluded — pass-1 ⚠️ spec-precision flag on **balanced** parentheses | unmatched trailing char excluded (tested, `terminal-links.test.ts:22-33`); balanced case previously undefined | New spec assumption "Parentheses inside a URL" (owner-accepted, `y`): the ported regex stops a URL at `(`; `https://en.wikipedia.org/wiki/Foo_(bar)` links as `…/Foo_`; LINK-23 covers the unmatched trailing bracket only, balanced ones are upstream behaviour. Re-evaluated the regex at `terminal-links.ts:30` directly: `see https://en.wikipedia.org/wiki/Foo_(bar) now` → `["https://en.wikipedia.org/wiki/Foo_"]`; `(https://x.y/a)` → `["https://x.y/a"]` — the assumption states the implementation's actual behaviour, not a wish. No test asserts the balanced case (grep for `(bar)`/`wikipedia` in the test file: none) | ✅ PASS — the spec now defines the balanced outcome explicitly, so the ⚠️ flag is closed; evidence-or-zero applies to ACs, and the balanced case is an assumption, not an AC. Suggestion (not a gap): one `it` pinning `…/Foo_(bar)` → `…/Foo_` would turn the assumption into a guarded fact |

Pass-1 Observation 2 (first Ctrl+click on an **un-hovered** OSC 8 link whose visible text is not itself a
URL/path falls through) is unchanged and stays outside the ACs: LINK-19 is worded for path candidates, and
the new smoke rows hovered before clicking. Recorded, not counted.

**Spec-anchored status after pass 2**: 30/30 active ACs evidenced (19/19 P1, 2/2 P2, 9/9 edge); 0
spec-precision gaps open. `spec.md` traceability (30 × Verified, `626762f`) is consistent with this verdict.
Count re-derived from the spec's traceability table (LINK-01..19 P1, LINK-20/22 P2, LINK-23..31 edge) and
the pass-1 per-AC tables (19 + 2 + 9 rows). The pass-1 summary breakdown "24/24 P1, 8/9 edge, 1/2 P2" did
not sum to its own 29/30 (it is 33); the tables, not that line, were the authority — corrected here, the
pass-1 text left as written.
`design.md` drift (pass-1 Observation 3) closed: `settled: Promise<KnownLinkHit | null>` matches
`terminal-link-provider.ts`.

### Gate (Build level, re-run on `626762f`)

- **typecheck**: exit 0 (`tsconfig.node.json` + `tsconfig.web.json`)
- **lint**: exit 0 — **0 errors, 18 warnings**, all `prettier/prettier`, same four pre-existing files as pass 1
  (`scripts/fixtures/implement-ticket/workflow.ts` 1, `scripts/smoke-agent-config.mjs` 12,
  `scripts/smoke-agents.mjs` 4, `src/shared/tasks.test.ts` 1); none in feature files
- **tests**: `npx vitest run --reporter=json` → exit 0, **236/236 suites, 1021 passed, 0 failed, 0 skipped,
  0 todo** (`scratchpad/verify2.json`); the five feature files unchanged at 27 + 32 + 18 + 12 + 15 = 104
- **Test integrity**: 1021 → 1021 (no test added, removed or weakened in the delta — it is 1 source line +
  docs); baseline 917 at `985621d` still holds as the pre-feature count

### Discrimination Sensor (pass 2, +1)

| # | File:line | Mutation | Killed by | Result |
| - | --------- | -------- | --------- | ------ |
| 9 | `src/renderer/src/lib/terminal-link-gesture.ts:34` | dropped the hit gate: `bareCtrl && hit !== null` → `bareCtrl` (the `mousedown` classifier the fix sits in front of) | `passes a Ctrl press over nothing to the agent (LINK-15)` — `expected 'intercept' to be 'pass'` (11/12) | ✅ Killed |

`TerminalPane.tsx` not mutated (hand-verified by convention, `vitest.config.ts:15-18`). Scratch only:
`git restore` after the run; `git status --porcelain` → 0 lines.

**Cumulative**: 9/9 killed — PASS ✅

### Verdict

**✅ PASS.** Both pass-1 findings are closed with the minimum change: a one-line reset that closes the
release-outside-the-pane corner without touching any tested gesture, and smoke rows that exercise the OSC 8
path end-to-end with the agent's mouse-report probe listening. The two new assumptions state what the
implementation does (verified against the regex and the smoke), are owner-accepted, and turn the pass-1 ⚠️
into defined behaviour. Gate green, sensor 9/9, tree clean. Ready.

**Non-blocking, for the owner** (no fix task): (a) LINK-22 AC wording "no underline" vs the assumption's
"link underline" — cosmetic; (b) optional test pinning the balanced-parentheses URL behaviour; (c) pass-1
Observation 2 (un-hovered OSC 8 first click) remains a known, out-of-AC limit of Design approach B.

---

## Re-verification (pass 3 — amendment, 3563b91..a83e62b)

**Date**: 2026-09-24
**Spec**: `.specs/features/terminal-links/spec.md` — amendment 2026-09-19: LINK-21 (reinstated), LINK-22
(amended), LINK-32, LINK-33, LINK-20 (re-check), Success Criteria last bullet
**Diff range**: `3563b91..a83e62b` — 5 commits: `6b2e493` T12, `1182ca1` T13, `f3436bf` T14 (code + tests),
`fb662e6` handoff (`.specs/STATE.md` only), `a83e62b` T15 (`.specs/` only: smoke rows 22–30, one `design.md`
line, `tasks.md` checkboxes). Source surface: 11 files, +266/−15.
**Verifier**: independent sub-agent (author ≠ verifier), third pass. Read-only over the real tree except
this file. Each mutation followed the same cycle: back up the original to the scratchpad, edit, run the
covering test file, copy the original back, then check that `git status --short` is empty. The tree was
clean after every mutation and at the end.
**Baseline**: 1021 tests at `cb18b7a` → **1034** at `a83e62b` (+13)

### Task Completion

| Task | Commit | Status | Notes |
| ---- | ------ | ------ | ----- |
| T12 active buffer | `6b2e493 fix(renderer): read the active buffer on every terminal link lookup` | ✅ Done | `activeBufferOf` (`terminal-buffer-lines.ts:37-42`), pane passes it (`TerminalPane.tsx:171`); +2 tests in `terminal-buffer-lines.test.ts`, +1 in `terminal-link-provider.test.ts` |
| T13 `FORCE_HYPERLINK` | `1182ca1 feat(main): claim hyperlink support for agent sessions` | ✅ Done | `terminal-env.ts:17`; +2 tests |
| T14 OSC 8 `file://` | `f3436bf feat(terminal): open osc 8 file links with ctrl+click` | ⚠️ Done with one defect | Done-when bullets met as written, but `openFileUrl` rejects on unconvertible file URLs (Fix 1). Done-when bullet 3 wording ("`null` falls through to `links.hitTest`") contradicts the code and `design.md:144`, and the code is the correct one (Observation a). Bullet 2 typo "`C:\dir.txt`" (Observation b) |
| T15 smoke + handoff | `a83e62b docs(specs): record the hyperlink smoke for terminal-links` (+ `fb662e6`) | ✅ Done | Rows 22–30, run 2026-09-24 against `fb662e6` (code identical to `a83e62b`, since `a83e62b` touches only `.specs/`). The `WT_SESSION` control (row-block preamble) is what makes rows 25–26 attributable to LINK-33 rather than to Windows Terminal's variable |

### Spec-Anchored Acceptance Criteria (amendment)

Evidence rule as in passes 1–2. The tested seams (`src/main/*`, `src/renderer/src/lib/*`) need a `file:line`
plus the assertion expression. Pane wiring, which is hand-verified by convention (`tasks.md` Test Coverage
Matrix, `vitest.config.ts`), needs the smoke row **and** the inspected source line. Conjunction rule: every
clause of an AC needs its own evidence.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| LINK-20 (re-check) OSC 8 `http(s)` target → Ctrl+click opens it per LINK-02/04/05, regardless of the visible text | `{ kind: 'url', url }` → `links:openUrl` | `terminal-link-provider.test.ts:252-259` — `expect(hitForOscTarget('https://example.com/x')).toEqual({ kind: 'url', url: 'https://example.com/x' })`, same for `http://`. Wiring `TerminalPane.tsx:209-210` (the cell is inside the `hoveredOsc` range, so the hit is `hitForOscTarget(hoveredOsc.text)`, where `text` is the OSC 8 **URI**: `node_modules/@xterm/xterm/src/browser/OscLinkProvider.ts` pushes `{ text: uri, … hover: (e, text) => linkHandler?.hover?.(e, text, range) }`), and `:193-194` (`links:openUrl`). Smoke row 27: visible text "IANA reserved", mousedown `osc: https://www.iana.org/…` → `hit { kind: 'url' }` → browser opened. Main-side scheme gate unchanged (`link-opener.test.ts:152-161`) | ✅ PASS |
| LINK-21 (a) `file://` target converted in main: `file:///C:/dir/a.txt` → `C:\dir\a.txt` | exact Windows path, percent-decoded | `link-opener.test.ts:262-271` — `openFileUrl('file:///C:/Users/MAUROP%7E1/scratch/a.txt')` → `expect(result).toEqual({ ok: true })`; `expect(fakes.statCalls).toEqual([FILE])` with `FILE = 'C:\\Users\\MAUROP~1\\scratch\\a.txt'` (the conversion, including `%7E` → `~`, which is the form Claude Code actually emits per smoke row 26). The spec's literal example is not the test input. Re-derived with the same code path by the Verifier: `file:///C:/dir/a.txt` → `C:\dir\a.txt` | ✅ PASS |
| LINK-21 (b) `#L10C5` fragment dropped | the path opened is the bare file | `link-opener.test.ts:290` — `openFileUrl('…/a.txt#L10C5')` → `toEqual({ ok: true })`; `:296` — `expect(fakes.openedPaths).toEqual([FILE, FILE])` | ✅ PASS |
| LINK-21 (c) `:line:col` suffix dropped | same | `link-opener.test.ts:293-296` — `openFileUrl('…/a.txt:12:3')` → `{ ok: true }`, `openedPaths` `[FILE, FILE]` (mutation 13 killed) | ✅ PASS |
| LINK-21 (d) the file rules of LINK-09..13 apply | association → `openPath`; none → chooser; dir → Explorer; failure → error naming the path | `link-opener.test.ts:269-270` — `expect(fakes.associationQueries).toEqual(['.txt'])`, `expect(fakes.openedPaths).toEqual([FILE])` (LINK-09); `:278` — `expect(chooser.spawns).toEqual([['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', FILE]]])` (LINK-10); `:284` — `expect(explorer.spawns).toEqual([['explorer.exe', [DIR]]])` (LINK-11); `:323` — `toEqual({ ok: false, error: `${FILE} no longer exists` })` (LINK-13). The spawn-failure errors reuse `openAbsolute` (`link-opener.ts:106-120`), which `openPath`'s tests `:236-246` already pin; the refactor preserves `openPath` behaviour (`:226-234` still green) | ✅ PASS, with one exception: a URL that parses but cannot be converted fails without a toast naming the target. See Fix 1 |
| LINK-21 (e) regardless of the visible text | the OSC 8 URI, not the cell text, is what opens | Wiring `TerminalPane.tsx:209-210`, `:195-196` (`fileUrl` → `links:openFileUrl`); `index.ts:237`. Smoke row 26: visible `hello.txt`, `osc: file:///C:/Users/MauroPaiva/…/tl-smoke/hello.txt` → `hit { kind: 'fileUrl' }` → `Notepad.exe "C:\…\hello.txt"` whose parent is the app's main process | ✅ PASS |
| LINK-21 (f) host other than empty or `localhost` (UNC) → refused with a toast, not opened | `{ ok: false, error }`, no stat or launch; the pane toasts it | `link-opener.test.ts:302-305` — `toEqual({ ok: false, error: 'Only local file links open here — file://server/share/a.txt' })` (exact string from `tasks.md` T14); `:306-313` — `https://…` and `not a url` get the same shape; `:314-316` — `statCalls`, `openedPaths`, `spawns` all `[]` (mutation 12 killed). Toast: `TerminalPane.tsx:198` (`!result.ok` → `onToastRef.current(result.error …)`, smoke-verified in row 15 for the shared branch) | ✅ PASS for the host form. ⚠️ The 4-slash UNC form `file:////server/share/a.txt` has an **empty** host, so this rule lets it through. It is still not opened, but only because the conversion throws (Fix 1) |
| LINK-21 (g) host empty **or `localhost`** is accepted | `file://localhost/C:/…` opens like `file:///C:/…` | **No test.** Behaviour is correct as measured: the Verifier ran `openFileUrl('file://localhost/C:/dir/a.txt')` with fakes and it reached `stat C:\dir\a.txt`. WHATWG URL rewrites a `file:` host of `localhost` to empty, so the `parsed.hostname !== 'localhost'` operand at `link-opener.ts:96` can never be true. Only a test can pin the behaviour | ❌ GAP, evidence only (Fix 1b) |
| LINK-22 (amended) any other OSC 8 scheme → not opened: Ctrl+click passes through as an ordinary click, nothing launched (hover underline/pointer accepted) | `hitForOscTarget` → `null`; gesture `'pass'`; no `stopPropagation`; `activateLink` not called | `terminal-link-provider.test.ts:270-273` — `toBeNull()` for `mailto:a@b.c`, `vscode://file/E:/x/y.ts`, `ms-teams:launch`, `not a url` (mutation 11 killed); `terminal-link-gesture.test.ts:23-25` — `expect(linkGestureOnMouseDown(ctrlClick, null)).toBe('pass')`. Wiring `TerminalPane.tsx:209-213`: a `null` from `hitForOscTarget` ends the hit test and does **not** fall back to text detection, so a `mailto:` link whose visible text looks like a URL still launches nothing, and `:213` returns before `preventDefault`/`stopPropagation`. `allowNonHttpProtocols: true` at `:178`; xterm then provides every scheme (`OscLinkProvider.ts`: the `ignoreLink` check runs only when `!linkHandler?.allowNonHttpProtocols`). Defense in depth: `link-opener.test.ts:306-309` (`openFileUrl` refuses `https:`), `:152-161` (`openUrl` refuses `file:`/`mailto:`). Smoke row 29: `osc: mailto:a@b.c` → `hit: null` → not intercepted, `activateLink` never called, no process; hover shows underline + pointer (accepted assumption) | ✅ PASS |
| LINK-32 alternate screen: hover and Ctrl+click read the buffer active **at that moment** (alternate while shown, normal after `?1049l`) | every `getLine`/`getNullCell` delegates to `term.buffer.active` at call time | `terminal-buffer-lines.test.ts:242-248` — `toBe('normal')` → swap → `toBe('alt')` → swap back → `toBe('normal')`; `:260` — `expect(buffer.getNullCell()).toBe(marker)` after the swap; `terminal-link-provider.test.ts:237-246` — normal: `provideLinks` `undefined`, `hitTest(10, 1)` `null` → alternate: `['https://example.com/x']`, `{ kind: 'url', url: 'https://example.com/x' }` → normal again: `undefined`/`null` (both directions; mutation 10 killed 3 tests). Wiring `TerminalPane.tsx:171` `buffer: activeBufferOf(term)`. The click geometry already reads per call (`terminal-buffer-lines.ts:181` `terminal.buffer.active.viewportY`), and xterm's own `OscLinkProvider` reads `_bufferService.buffer` per call. Smoke rows 22 (`buffer.active.type === 'alternate'`), 23 (hover underline in the alternate buffer), 24 (Ctrl+click → text-detected `url` hit → browser) | ✅ PASS |
| LINK-33 every session gets `FORCE_HYPERLINK=1` besides `TERM`/`COLORTERM`; no `TERM_PROGRAM` | `env.FORCE_HYPERLINK === '1'`, also over a parent `0`; `TERM_PROGRAM` undefined | `terminal-env.test.ts:18-19` — `expect(env.FORCE_HYPERLINK).toBe('1')`; `expect(env.TERM_PROGRAM).toBeUndefined()`; `:23` — `expect(buildPtyEnv({ FORCE_HYPERLINK: '0' }).FORCE_HYPERLINK).toBe('1')`; `:7-8` `TERM`/`COLORTERM` from the same `buildPtyEnv({})` (mutation 14 killed 2 tests). "Every session": `pty-port.ts:32` is the sole `buildPtyEnv` call (and the only node-pty importer), and the forced spread comes last, so a per-session `env` cannot unset it. Smoke row 25: with `WT_SESSION`/`WT_PROFILE_ID` removed from the app environment, the `Write(hello.txt)` header renders as `<span class="xterm-underline-5">` (the OSC 8 dashed decoration). The owner cross-checked on the nightly build: no decoration | ✅ PASS |
| Success Criterion (amendment) live Claude Code session (alternate screen, mouse tracking on): `Write(...)` path dashed, hover underlines it, Ctrl+click opens the file; markdown link blue + dashed, Ctrl+click opens the browser | observable in the real agent | Rows 22 (alternate), 25 (dashed + hover underline + pointer), 26 (Ctrl+click → Notepad on the file), 27 (blue + dashed → browser), 30 (owner hands-on: "os links funcionaram … o clique no hello txt também funcionou") | ✅ Met. Evidence note: rows 22–30 do not record `term.modes.mouseTrackingMode` (Observation d) |

**Status**: 4/5 amendment ACs fully evidenced (LINK-20, LINK-22, LINK-32, LINK-33). LINK-21 has 6 of 7 clauses
evidenced. Clause (g) (`localhost` accepted) has no test, and the conversion step throws on unconvertible
URLs (Fix 1). No spec-precision gap: every asserted value above is the spec's (or `tasks.md` T14's exact
string) outcome.

### Edge cases touched by the amendment

- [x] LINK-32 alternate ↔ normal swap, both directions, hover and hit test
- [x] LINK-33 parent `FORCE_HYPERLINK=0` overridden; `TERM_PROGRAM` still unclaimed
- [x] LINK-21 UNC host form refused before any disk access
- [ ] LINK-21 file URLs that parse but have no Windows path (`file:////server/share/a.txt`, `file:///tmp/a.txt`,
  `file:///C:/dir%2Fa.txt`, `file:///`). The Verifier called `openFileUrl` directly with fakes and got a
  **rejection** (`ERR_INVALID_FILE_URL_PATH`: "File URL path must be absolute" / "must not include encoded \ or
  / characters"), with no stat and no spawn. The pane's catch (`TerminalPane.tsx:226-228`) toasts the
  wrapped IPC error (`api.ts` → "IPC 'links:openFileUrl' failed: Error invoking remote method … File URL path
  must be absolute"). Nothing opens, so the outcome is safe, but the toast does not name the target.
- [x] LINK-27 unchanged: the amendment adds no listener or provider. `hitForOscTarget` is pure, and
  `activeBufferOf` holds only the `term` reference, which dies with the effect

### Gate Check (Build level, run on `a83e62b`)

- **Gate command**: `npm run typecheck && npm run lint && npm test` (`tasks.md` §Gate Check Commands)
- **typecheck**: exit 0 (`tsconfig.node.json` + `tsconfig.web.json`)
- **lint**: exit 0, **0 errors, 18 warnings**, all `prettier/prettier`, in the same four pre-existing files as
  passes 1–2 (`scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`,
  `scripts/smoke-agents.mjs`, `src/shared/tasks.test.ts`); none in the diff
- **tests**: `npm test -- --reporter=json` → exit 0, **240/240 suites, 1034 passed, 0 failed, 0 skipped, 0 todo**
- **Test count before the amendment**: 1021 (`cb18b7a`, `tasks.md` §Amendment baseline)
- **Test count after**: 1034. **Delta +13**: `link-opener.test.ts` 27 → 32 (+5), `terminal-env.test.ts` 4 → 6 (+2),
  `terminal-buffer-lines.test.ts` 18 → 20 (+2), `terminal-link-provider.test.ts` 15 → 19 (+4)
- **Test integrity**: the diff only adds to test files. The 2 lines removed in `terminal-link-provider.test.ts`
  are its import lines, restructured. No assertion was deleted or weakened
- **Skipped / failures**: none

### Discrimination Sensor (pass 3, +5)

| # | File:line | Mutation | Killed by | Result |
| - | --------- | -------- | --------- | ------ |
| 10 | `src/renderer/src/lib/terminal-buffer-lines.ts:38-41` | `activeBufferOf` captures `terminal.buffer.active` once at creation (the LINK-32 bug itself) | `reads whichever buffer is active…` (`expected 'normal' to be 'alt'`), `takes the null cell from the active buffer too`, `alternate screen (LINK-32)` (`expected undefined to deeply equal ['https://example.com/x']`), 3 failures over the two files (36/39 passed) | ✅ Killed |
| 11 | `src/renderer/src/lib/terminal-link-provider.ts:65` | `hitForOscTarget` final `return null` → `return { kind: 'url', url: target }` (every other scheme sent to the browser) | `opens nothing for any other scheme…` (`expected { kind: 'url', url: 'mailto:a@b.c' } to be null`), 18/19 | ✅ Killed |
| 12 | `src/main/link-opener.ts:96` | host rule dropped: `parsed.protocol !== 'file:' \|\| (hostname …)` → `parsed.protocol !== 'file:'` | `refuses a unc host and a non-file scheme…` (error string mismatch, since the mutant stats `\\server\share\a.txt`), 31/32 | ✅ Killed |
| 13 | `src/main/link-opener.ts:101` | `.replace(/(?::\d+){1,2}$/, '')` removed (`:line:col` no longer stripped) | `drops a #L10C5 fragment and a :line:col suffix…` (`expected { ok: false, … } to deeply equal { ok: true }`), 31/32 | ✅ Killed |
| 14 | `src/main/terminal-env.ts:17` | `FORCE_HYPERLINK: '1'` removed from `PTY_ENV_FORCED` | both LINK-33 tests (`expected undefined to be '1'`, `expected '0' to be '1'`), 4/6 | ✅ Killed |

**Not mutated, and why**: `parsed.hash = ''` / `parsed.search = ''` (`link-opener.ts:99-100`) and the
`!== 'localhost'` operand (`:96`) have no observable effect. The Verifier's probe showed that
`fileURLToPath` reads only `pathname` (`file:///C:/dir/a.txt#L10C5` and `?x=1` convert to `C:\dir\a.txt`
without clearing), and WHATWG empties a `localhost` file host. Removing either would be an equivalent
mutant, so no test can guard them. `TerminalPane.tsx` is hand-verified by convention and was not mutated.

**Sensor depth**: lightweight, 5 behaviour-level mutations on the highest-risk new code.
**Result**: 5/5 killed. Cumulative 14/14. PASS ✅

### Code Quality

| Principle | Status | Notes |
| --------- | ------ | ----- |
| Minimum code | ✅ | `activeBufferOf` 6 lines; `hitForOscTarget` 11; `openFileUrl` 15; `openAbsolute` extracted for two real callers (`openPath`, `openFileUrl`), not single use. Two no-op lines and one unreachable operand in `openFileUrl` (Observation c) |
| Surgical changes | ✅ | Pane: import lists, one `buffer:` argument, `allowNonHttpProtocols`, one routing ternary, the OSC hit swap, and the rewritten comment. `index.ts`: one `handle` line. `ipc-contract.ts`: one doc-commented channel. `openPath` refactor keeps behaviour (its 10 tests unchanged and green) |
| No scope creep | ✅ | No `TERM_PROGRAM`, no scheme allow-list beyond `http`/`https`/`file`, no line delivery for `#L10C5` |
| Matches patterns | ⚠️ | The `LaunchResult` channels return failures and never throw: `ipc-contract.ts:40,42,50`, and `openUrl` catches its own parse failure (`link-opener.ts:50-55`). `openFileUrl` guards `new URL` but not `fileURLToPath` (`:101`), so it breaks that pattern for URLs Node cannot convert (Fix 1). Otherwise it mirrors `openUrl`'s parse-then-gate shape and the DI-with-fakes tests |
| Would a senior engineer approve? | ⚠️ | Yes once the conversion is guarded. It is a one-line move plus two tests |
| Spec-anchored outcome check | ✅ | Every asserted value matches the spec (or `tasks.md` T14's exact error string); nothing vague passed |
| Per-layer Coverage Expectation | ⚠️ | Main service: `openFileUrl`'s happy, chooser, Explorer, suffix, UNC and missing paths are each tested. The conversion-failure path and the `localhost` acceptance are not (Fix 1). Renderer libs: 1:1 to LINK-20/21/22/32. Pane: smoke rows 22–30 plus inspection |
| Every test maps to an AC / edge / Done-when | ✅ | `describe` titles carry `LINK-21`, `LINK-32`, `LINK-33`, `LINK-20/21/22`; no unclaimed test |
| Documented guidelines followed | ✅ | `README.md` pre-PR gate run; `vitest.config.ts` layering (libs + main tested, pane hand-verified); L-005 (fakes only, no real spawn) respected in the new `openFileUrl` tests |

**Observations (non-blocking):**

a. `tasks.md:454` (T14 Done-when) says "`null` falls through to `links.hitTest` on the text". The code
   (`TerminalPane.tsx:207-211`) and `design.md:144` ("`null` otherwise (pass-through, LINK-22)") do **not**
   fall through, and they are right. A fall-through would open an `https` URL printed as the visible text
   of a `mailto:` OSC 8 link, which violates LINK-22's "nothing is launched". Fix the doc wording only.
b. `tasks.md:453` reads "stats `C:\dir.txt`". It should read `C:\dir\a.txt` (typo).
c. `link-opener.ts:99-100` (`hash`/`search` cleared) are no-ops before `fileURLToPath`, and `:96`'s
   `!== 'localhost'` operand is unreachable for `file:`. They are harmless and document intent. Mentioned,
   not a fix.
d. The Success Criterion says "mouse tracking on". Rows 22–30 record `buffer.active.type` but not
   `term.modes.mouseTrackingMode`. Row 26's "never reached the agent" is inferred from process parentage
   (one Notepad, whose parent is the app's main process; none from `claude.exe`), not from a mouse-report
   probe as in rows 12/19. A `fileUrl` hit goes through the same interception code as rows 12/19
   (`TerminalPane.tsx:213-216`, `:219-221`), so LINK-14 still holds by inspection. The `TerminalPane.tsx`
   comment at `:352-353` records Claude Code's `mouseTracking "any"` (2026-09-09). This is a note on
   evidence strength, not a gap.
e. Pass-1 Observation 2 (first Ctrl+click on an **un-hovered** OSC 8 link) now sits on the main path. Claude
   Code's `Write(...)` headers are OSC 8, and their visible text (`hello.txt`) is no text-detectable path. A
   Ctrl+click on output painted under a parked pointer, with no mousemove, therefore passes through to the
   agent. LINK-19 is worded for path candidates, so this stays out of the ACs. It is worth a follow-up now
   that OSC 8 is the primary link source.

### Fix Plans

#### Fix 1 (LINK-21, Minor): guard the file-URL conversion and pin `localhost`

- **Root cause**: `openFileUrl` (`link-opener.ts:89-103`) guards only `new URL`. `fileURLToPath(parsed,
  { windows: true })` at `:101` throws `ERR_INVALID_FILE_URL_PATH` for URLs that parse but have no Windows
  path. Measured: `file:////server/share/a.txt` (the 4-slash UNC form, whose empty host passes the rule at
  `:96`), `file:///tmp/a.txt`, `file:///C:/dir%2Fa.txt`, `file:///`. The rejection crosses IPC
  (`index.ts:237`), `api.ts` wraps it, and the pane's catch toasts a technical message that does not name
  the target. Separately, clause (g) (`localhost` accepted) has no assertion.
- **Fix task**:
  - (a) Make any conversion throw return `{ ok: false, error: 'Only local file links open here — <url>' }`,
    for example by moving `fileURLToPath(...)` into the existing `try` with `new URL`.
  - (b) In `link-opener.test.ts` › `LinkOpener.openFileUrl (LINK-21)`, add:
    `file:////server/share/a.txt` and `file:///tmp/a.txt` → exactly
    `{ ok: false, error: 'Only local file links open here — <url>' }`, with `statCalls` and `spawns` `[]`;
    and `file://localhost/C:/Users/MAUROP%7E1/scratch/a.txt` → `{ ok: true }`, `openedPaths` `[FILE]`.
- **Verify**: `npx vitest run src/main/link-opener.test.ts` green (+2 tests, 1036 total). Undo the guard and
  the new refusal test must fail. Build gate green.
- **Priority**: Minor. Nothing unsafe opens today and the main path (Claude Code's `file:///C:/…`) is
  verified end to end.

### Requirement Traceability Update (proposal; the orchestrator applies it to `spec.md`)

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| LINK-20 | Verified | ✅ Verified (re-checked against the amended routing; smoke row 27) |
| LINK-21 | Reinstated — pending | ❌ Needs Fix (Fix 1: unguarded conversion + `localhost` clause unevidenced) |
| LINK-22 | Amended — pending | ✅ Verified |
| LINK-32 | Pending | ✅ Verified |
| LINK-33 | Pending | ✅ Verified |
| Success Criteria, amendment bullet | — | ✅ Met (rows 22–27, 30) |

### Lesson candidates

- A method whose contract is "failures are returned, never thrown" has to guard **every** throwing step,
  not just the first parse. `fileURLToPath` throws on file URLs that `new URL` accepted (4-slash UNC,
  drive-less, encoded separator). Grounded in Fix 1, `link-opener.ts:101`.
- When an AC names an **allowed** set ("host empty or `localhost`"), test each allowed member, not only the
  refused case. Check whether the platform parser already normalizes a member away: WHATWG maps a `file:`
  host of `localhost` to empty. When it does, the in-code guard is dead and only a test pins the
  behaviour. Grounded in LINK-21 (g).
- Done-when prose can drift from the design's step text. Here T14 said "falls through" and the design said
  "pass-through". Before trusting either, check the Done-when against the design step **and** the AC.
  Grounded in Observation a.

### Summary

**Overall**: ⚠️ Issues. The amendment works end to end in a live Claude Code session. One Minor fix remains
in the new main-side converter.

**Spec-anchored check**: 4/5 amendment ACs fully evidenced; LINK-21 6/7 clauses plus one robustness defect;
0 spec-precision gaps
**Sensor**: 5/5 killed (cumulative 14/14)
**Gate**: 1034 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors (18 pre-existing warnings)

**What works**:

- The provider follows the buffer that is active at each call, in both directions. This fixes the
  alternate-screen blindness, measured in the real agent.
- `FORCE_HYPERLINK=1` is forced on every PTY over any parent value, still with no `TERM_PROGRAM`.
- OSC 8 targets are classified by scheme in a pure, tested function:
  - `http(s)` goes to the browser;
  - `file` goes to main's converter, then the same default app, chooser or Explorer routes as printed paths;
  - anything else passes through to the agent untouched.
- The `WT_SESSION` control in the smoke isolates LINK-33 from Windows Terminal's own hyperlink signal.

**Issues found**: Fix 1. Guard `fileURLToPath` so unconvertible file URLs return the `LaunchResult`
refusal, and add the `localhost` acceptance test.

**Next steps**: apply Fix 1, then run pass 4 (link-opener tests + build gate + one sensor mutation on the
guard). After that, update `spec.md` traceability per the table above. Fix `tasks.md:453-454` wording
(Observations a, b) at the same time.

---

## Re-verification (pass 4 — Fix 1, dd83777..77d4e34)

**Date**: 2026-09-24
**Spec**: `.specs/features/terminal-links/spec.md`, LINK-21 (P2 OSC 8, acceptance criterion 2) and the file
rules it references (LINK-09..13); pass 3 §Fix Plans › Fix 1 for the task and its Verify criteria
**Diff range**: `dd83777..77d4e34`, 2 commits. `7da1cc1 fix(main): refuse file links that have no local drive
path` touches `src/main/link-opener.ts` (+6/−1) and `src/main/link-opener.test.ts` (+25). `77d4e34 docs(specs):
correct T14's done-when and defer the unhovered osc click` touches `tasks.md` (3 lines) and `context.md` (+4).
`TerminalPane.tsx`, `index.ts`, `ipc-contract.ts`, `design.md` and `spec.md` are unchanged.
**Verifier**: independent sub-agent (author ≠ verifier), fourth pass. Read-only over the real tree except
this file. The sensor ran on scratch copies outside the worktree (see Sensor).
**Baseline**: 1034 at `dd83777` → **1036** at `77d4e34` (+2)

### Fix completion

| Item | Commit | Status | Notes |
| ---- | ------ | ------ | ----- |
| Fix 1 (a): guard the conversion | `7da1cc1` | ✅ Done | `link-opener.ts:101-106`: `fileURLToPath(…)` and the `:line:col` strip now sit in their own `try`. The `catch` returns `{ ok: false, error: `Only local file links open here — ${url}` }`, the same string as the two refusals above it (`:94`, `:97`). The Fix Plan suggested moving the call into the `new URL` try, but that try runs before the host rule (`:96`), so a second try after the rule is the minimal form. It has the same `let x; try { x = … } catch { return refusal }` shape as `openUrl` (`:50-55`) |
| Fix 1 (b): tests | `7da1cc1` | ✅ Done | `link-opener.test.ts:319-333` and `:335-342`, with exactly the inputs and outcomes the Fix Plan named |
| Fix 1 Verify: "undo the guard and the new refusal test must fail" | — | ✅ | Mutation 15 below |
| Fix 1 Verify: +2 tests, 1036 total, build gate green | — | ✅ | `link-opener.test.ts` 32 → 34; suite 1036; see Gate |
| Pass-3 Observations a, b (T14 Done-when wording) | `77d4e34` | ✅ Done | See Doc corrections |

### Independent probe: the four URLs

The Verifier loaded the real `link-opener.ts` twice with the worktree's `tsx`: once at HEAD and once at
`dd83777` (via `git show`). It gave both the same fakes and called `openFileUrl` directly (scratch
`verifier4/probe.mts`). Neither run touched the disk or spawned anything.

| URL | WHATWG host | `fileURLToPath(…, { windows: true })` | `dd83777` | HEAD `77d4e34` | Evidence |
| --- | ----------- | ------------------------------------- | --------- | -------------- | -------- |
| `file:////server/share/a.txt` | `""` | throws `ERR_INVALID_FILE_URL_PATH`, "File URL path must be absolute" | **rejects** | `{ ok: false, error: 'Only local file links open here — file:////server/share/a.txt' }`; no stat, open or spawn | test `:322-325` |
| `file:///tmp/a.txt` | `""` | same throw, "must be absolute" | rejects | the refusal naming the URL; no disk access | test `:326-329` |
| `file:///C:/dir%2Fa.txt` | `""` | throws "must not include encoded \ or / characters" | rejects | the refusal naming the URL | **By construction.** The `catch` at `:104` catches everything, so any throw from the same call takes the same branch. The two tests hit only the "must be absolute" throw. The probe shows the encoded-separator throw (also `file:///C:/dir%5Ca.txt`) returns the same refusal |
| `file:///` | `""` | "must be absolute" | rejects | the refusal | **By construction**: the same throw as the two tested URLs |

Controls behave the same in both versions:

- `file://server/share/a.txt` is refused by the host rule at `:96`. It converts cleanly to
  `\\server\share\a.txt`, so the host rule refuses it, not the new catch (mutation 19).
- `file://localhost/C:/dir/a.txt` → `{ ok: true }` and stats `C:\dir\a.txt`.
- `file:///C:/dir/a.txt`, with or without `#L10C5`, `:12:3` or `?x=1`, → `{ ok: true }` and stats
  `C:\dir\a.txt`.

### Spec-anchored check: LINK-21, all clauses

Clause letters follow pass 3. (f′) and (f″) are the robustness rows that Fix 1 added.

| Clause | Spec-defined outcome | `file:line` + assertion | Result |
| ------ | -------------------- | ----------------------- | ------ |
| (a) converted in main: `file:///C:/dir/a.txt` → `C:\dir\a.txt` | exact Windows path, percent-decoded | `link-opener.test.ts:264-268`: `openFileUrl('file:///C:/Users/MAUROP%7E1/scratch/a.txt')` → `expect(result).toEqual({ ok: true })`; `expect(fakes.statCalls).toEqual([FILE])`, with `FILE = 'C:\\Users\\MAUROP~1\\scratch\\a.txt'` (`:259`). The probe re-derived the spec's own example: it stats `C:\dir\a.txt` | ✅ PASS |
| (b) `#L10C5` dropped | the bare file is opened | `:290` → `toEqual({ ok: true })`; `:296` `expect(fakes.openedPaths).toEqual([FILE, FILE])` | ✅ PASS |
| (c) `:line:col` dropped | same | `:293-296` (pass-3 mutation 13) | ✅ PASS |
| (d) file rules of LINK-09..13 | association → `openPath`; none → chooser; dir → Explorer; failure → error naming the path | `:269-270` `associationQueries` `['.txt']`, `openedPaths` `[FILE]` (LINK-09); `:278` `[['rundll32.exe', ['shell32.dll,OpenAs_RunDLL', FILE]]]` (LINK-10); `:284` `[['explorer.exe', [DIR]]]` (LINK-11); `:344-348` `toEqual({ ok: false, error: `${FILE} no longer exists` })` (LINK-13). Pass 3's exception, where a URL that parsed but could not be converted gave no toast naming the target, is closed by (f′)/(f″) | ✅ PASS |
| (e) regardless of the visible text | the OSC 8 URI opens, not the cell text | unchanged since pass 3: `TerminalPane.tsx:209-210`, `:195-196`; smoke row 26 | ✅ PASS |
| (f) a host other than empty or `localhost` (UNC form) is refused with a toast, not opened | `{ ok: false, error }`, no stat or launch; the pane toasts it | `:302-305`: `toEqual({ ok: false, error: 'Only local file links open here — file://server/share/a.txt' })`; `:314-316`: `statCalls`, `openedPaths`, `spawns` all `[]` (mutations 12 and 19) | ✅ PASS |
| (f′) the 4-slash UNC form `file:////server/share/a.txt` (empty host, still "a UNC form") | same outcome as (f) | `:322-325`: `toEqual({ ok: false, error: 'Only local file links open here — file:////server/share/a.txt' })`; `:330-332`: `statCalls`, `openedPaths`, `spawns` all `[]` (mutations 15, 16, 17). Toast: the IPC result is now `{ ok: false }`, so `TerminalPane.tsx:198` toasts `result.error`, which names the URL. Before the fix it arrived through the rejection path `:226-228` with Node's text | ✅ PASS (was ⚠️ in pass 3) |
| (f″) drive-less `file:///tmp/a.txt`: no local path to open | a returned refusal, not a throw (the `LaunchResult` channel contract, `ipc-contract.ts:49`) | `:326-329`, exact string; `:330-332`, no disk access | ✅ PASS |
| (g) host `localhost` accepted | `file://localhost/C:/…` opens like `file:///C:/…` | `:337-341`: `openFileUrl('file://localhost/C:/Users/MAUROP%7E1/scratch/a.txt')` → `expect(result).toEqual({ ok: true })`; `expect(fakes.openedPaths).toEqual([FILE])`. Only this test kills mutation 18 | ✅ PASS (was ❌ GAP) |

**Status**: all 7 LINK-21 clauses are evidenced, plus the two robustness rows. With LINK-20, LINK-22, LINK-32
and LINK-33 from pass 3 (none of their code or tests changed in this diff), the amendment is **5/5 ACs**.
Every asserted value is the spec's outcome or T14's exact error string, so there is no spec-precision gap. The
spec gives no message for a drive-less URL beyond the toast. The implementation reuses T14's refusal string,
which names the target as LINK-13 asks.

Pass-3 edge-case row, now closed:

- [x] LINK-21 file URLs that parse but have no Windows path (`file:////server/share/a.txt`, `file:///tmp/a.txt`,
  `file:///C:/dir%2Fa.txt`, `file:///`): all return `{ ok: false, error: 'Only local file links open here — <url>' }`
  with no stat and no spawn. Two are tested; the other two are covered by construction and by the probe

### Gate Check (Build level, run on `77d4e34`)

- **Gate command**: `npm run typecheck && npm run lint && npm test` (`tasks.md` §Gate Check Commands)
- **typecheck**: exit 0 (`tsconfig.node.json` + `tsconfig.web.json`)
- **lint**: exit 0, **0 errors, 18 warnings**, all `prettier/prettier`, in the same four pre-existing files as
  passes 1–3. The main lint uses `--cache`, so the two changed source files were also checked directly with
  the worktree binaries: `eslint --no-cache` exit 0, and `prettier --check` clean
- **tests**: `npm test -- --reporter=json` → exit 0, **240/240 suites, 1036 passed, 0 failed, 0 skipped, 0 todo**
- **Test count**: 1034 → 1036, **+2**, both in `link-opener.test.ts` (32 → 34)
- **Test integrity**: the diff only adds two `it` blocks to the test file; no assertion was removed or weakened
- **Tree**: `git status --short` empty after the gate, after every mutation, and before this file was written

### Discrimination Sensor (pass 4, +5)

**Method.** The first attempt to mutate `src/main/link-opener.ts` in place was refused by the session's
permission guard before any change landed. A Bash command sent in the same batch then ran the suite on the
unmutated file (34/34; no information, discarded) and copied the backup over it. The backup was
byte-identical, and `git status --short` showed 0 lines. The sensor then used the temp-copy route that
`validate.md` §5 allows:

- **Harness.** `link-opener.ts`, `link-opener.test.ts` and the two type-only shared files were copied to
  `scratchpad/verifier4/sensor/`. They were run by the worktree's vitest 4.1.9, through a scratch config
  that aliases `vitest` to the worktree's package.
- **Baseline.** Unmutated, the harness gave 34/34, the same as the worktree.
- **Per mutant.** Edit the scratch copy, run it, copy the original back (`cmp` identical), then confirm the
  worktree's `git status --short` is 0 lines.

| # | File:line | Mutation | Killed by | Result |
| - | --------- | -------- | --------- | ------ |
| 15 | `src/main/link-opener.ts:101-106` | guard removed: back to `dd83777`'s unguarded `const absolutePath = fileURLToPath(…)` (Fix 1's own Verify) | `refuses a file url with no local drive path instead of throwing`: `TypeError: File URL path must be absolute` (33/34) | ✅ Killed |
| 16 | `src/main/link-opener.ts:105` | catch returns `{ ok: true }` | same test: `expected { ok: true } to deeply equal { ok: false, … }` (33/34) | ✅ Killed |
| 17 | `src/main/link-opener.ts:105` | catch message changed to `Couldn’t open ${url}` (LINK-13's wording, a plausible slip) | same test: deep-equal mismatch on `error` (33/34) | ✅ Killed |
| 18 | `src/main/link-opener.ts:96` | host rule rewritten on the raw string: `!url.startsWith('file:///')`. It still refuses `file://server/…` but now also refuses `file://localhost/…` | `opens a file url whose host is localhost`: `expected { ok: false, … } to deeply equal { ok: true }` (33/34); no other test notices | ✅ Killed |
| 19 | `src/main/link-opener.ts:96` | host rule dropped. This is pass 3's mutation 12, re-run on the fixed code to check that the new catch has not made the rule redundant | `refuses a unc host and a non-file scheme…` (33/34). `file://server/share/a.txt` converts to `\\server\share\a.txt` and would be stat'ed; the new catch does not cover it | ✅ Killed |

**Sensor depth**: lightweight, 5 behaviour-level mutations on the fix and the clause it pins.
**Result**: 5/5 killed. Cumulative 19/19. PASS ✅

### Doc corrections (`77d4e34`)

| Change | Checked against | Verdict |
| ------ | --------------- | ------- |
| `tasks.md:453`: `C:\dir.txt` → `C:\dir\a.txt` | Byte scan of `dd83777:tasks.md`: line 453, column 58 held **0x07 (BEL)** where `\a` belonged. Pass 3's Observation b took it for a typo, but a write had turned the `\a` escape into a control byte | ✅ Correct. At HEAD, all five `.specs/features/terminal-links/*.md` have 0 C0 control bytes (other than TAB/CR/LF) and no DEL |
| `tasks.md:454`: "`null` ends the hit test — no fall-back to the visible text … (LINK-22)" | `TerminalPane.tsx:209-213`: inside the hovered OSC range the hit is `hitForOscTarget`, and a `null` returns at `:213` before `preventDefault`/`stopPropagation`. `links.hitTest` runs only in the else branch (`:211`). `design.md:144`: "`null` otherwise (pass-through, LINK-22)" | ✅ Accurate; pass-3 Observation a closed |
| `tasks.md:13`: header status | `7da1cc1` exists. "F3" continues the header's F1/F2 numbering of fix tasks; this file calls the same item "pass-3 Fix 1" | ✅ Accurate. "pass 4 re-verifies" is this section |
| `context.md:126-129`: deferred idea (Ctrl+click on an un-hovered OSC 8 link) | `TerminalPane.tsx:176-186`: `hoveredOsc` is set only by `hover` and cleared by `leave`. `:209-211`: with no hover, the hit comes from `links.hitTest` (text detection) | ✅ The mechanism is described correctly. Nit: it says "found by the pass 3 Verifier", but pass 1 first recorded it (Observation 2, 2026-09-18); pass 3 (Observation e) re-raised it because OSC 8 is now the main path |

### Code Quality

| Principle | Status | Notes |
| --------- | ------ | ----- |
| Minimum code | ✅ | +5 net source lines; no helper, no new error type, no new message |
| Surgical changes | ✅ | Only the conversion step of `openFileUrl` changed. Its doc comment (`:83-88`, "Only a local URL is accepted") is unchanged and still true |
| No scope creep | ✅ | No UNC support, no line/col delivery, no extra scheme |
| Matches patterns | ✅ | Same try, catch, return-refusal shape as `openUrl` (`:50-55`) and as `openFileUrl`'s own parse guard (`:90-95`). The `LaunchResult` never-throw contract (`ipc-contract.ts:49`) now holds for every input (⚠️ in pass 3) |
| Would a senior engineer approve? | ✅ | Yes |
| Spec-anchored outcome check | ✅ | Every asserted value is the spec's or T14's exact string |
| Per-layer Coverage Expectation | ✅ | `openFileUrl` now has a test for each path: happy, chooser, Explorer, suffix/fragment, host refusal, conversion refusal, `localhost`, missing file |
| Every test maps to an AC / edge / Done-when | ✅ | Both new tests sit in `describe('LinkOpener.openFileUrl (LINK-21)')` and map to (f′)/(f″) and (g) |
| Test integrity | ✅ | Additions only |
| Documented guidelines followed | ✅ | `README.md` pre-PR gate run; `vitest.config.ts` layering; L-005 (the new tests use `makeFakes`, with no real spawn) |

**Observations (non-blocking):**

a. `design.md:170` lists `openFileUrl`'s refusals as protocol and host only. The conversion-failure refusal
   that F3 added is not in the design step, and the Error Handling table (`design.md:235-245`) has no
   `openFileUrl` row. This is one clause of doc drift, not a gap.
b. The new test's title ("…instead of throwing") describes the fix's history rather than the behaviour.
   Harmless.
c. Pass-3 Observation c still holds (`hash`/`search` cleared as no-ops, and the `!== 'localhost'` operand is
   unreachable). Mutation 18 shows the `localhost` test now pins the behaviour however the rule is written.
d. `context.md` attribution nit (see Doc corrections).

### Requirement Traceability Update (proposal; the orchestrator applies it to `spec.md`)

| Requirement | `spec.md` today | New Status |
| ----------- | --------------- | ---------- |
| LINK-20 | Verified | ✅ Verified (pass 3 re-check, smoke row 27; untouched by this diff) |
| LINK-21 | Reinstated — pending | ✅ Verified (pass 4: 7/7 clauses plus the conversion guard; mutations 12, 13, 15–19) |
| LINK-22 | Amended — pending | ✅ Verified (pass 3; `hitForOscTarget` and the pane unchanged since) |
| LINK-32 | Pending | ✅ Verified (pass 3) |
| LINK-33 | Pending | ✅ Verified (pass 3) |
| `spec.md` Coverage line | "30 verified … 3 pending the amendment's Verifier pass" | "33 active, 33 verified" |
| Success Criteria, amendment bullet | unticked | ✅ Met (pass 3: rows 22–27, 30). The other five boxes are also unticked; pass 1 reported them covered by the T11 smoke, so tick them in the same edit if the owner agrees |

### Lesson candidates

Not recorded with `scripts/lessons.py` (the orchestrator decides). Pass 3's candidates stand; the fix confirms
the first one ("guard every throwing step"). New in this pass:

- Escape sequences in spec prose can be eaten on write: `C:\dir\a.txt` became `C:\dir<BEL>.txt`, which
  renders as `C:\dir.txt`. A later reviewer then reads a mangled Windows path as a typo. When a path in a spec
  file looks wrong, scan the file for C0 control bytes before editing the prose. Grounded in `dd83777:tasks.md:453:58`
  (0x07) and pass-3 Observation b.
- When an in-place mutation of a tracked file is not allowed, run the sensor on a scratch copy of the module
  and its test outside the repo, with the runner's import aliased to the repo's package. First check that the
  unmutated baseline in the harness matches the repo run. The verdict is the same and the tree is never at
  risk. Grounded in this pass's method (baseline 34/34 in both).

### Summary

**Overall**: ✅ Ready. Fix 1 is closed with the minimum change, and every amendment AC is evidenced.

**Spec-anchored check**: LINK-21 7/7 clauses plus 2 robustness rows; amendment 5/5 ACs (LINK-20/21/22/32/33);
0 spec-precision gaps
**Sensor**: 5/5 killed (cumulative 19/19)
**Gate**: 1036 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors (18 pre-existing warnings)

**What works**: `openFileUrl` keeps the `LaunchResult` contract for every input. A file URL with no local drive
path (the 4-slash UNC form, a drive-less POSIX path, an encoded separator, a bare `file:///`) now returns the
same refusal that names the URL, with no disk access, instead of rejecting across IPC. The host rule is still
load-bearing for the `file://server/…` form. `localhost` acceptance is pinned by a test that fails if the rule
is rewritten to refuse it.

**Issues found**: none blocking. Observations a–d are documentation nits.

**Next steps**: apply the traceability proposal to `spec.md` (LINK-21/22/32/33 → Verified, Coverage line,
Success Criteria). Optionally add the conversion-failure refusal to `design.md:170` and the Error Handling table.
