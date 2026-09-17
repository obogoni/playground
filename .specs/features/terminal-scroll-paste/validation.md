# Terminal Scroll & Paste Validation

## Validation: terminal-scroll-paste — FAIL

**Date**: 2026-09-17
**Spec**: `.specs/features/terminal-scroll-paste/spec.md`
**Diff range**: `fa78f78..c569db1` (18 commits, branch `feature/terminal-scroll-paste`)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Verdict**: ❌ **FAIL** — no code defect found, but 7 acceptance criteria carry **no evidence of any
kind** (no test, and not listed among the owner-pending hand checks), 2 spec-stated precise values sit
outside the tested-seam convention this repo documents, and 3 documents still reference the withdrawn
requirement set as if in scope.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T13 | ✅ Done | One commit each, `90830f3`..`02f1413` |
| T14 | ✅ Done | Owner UAT, verdict **cause 3 only**; one Done-when marked `[~]` (partial) by the author |
| T15–T19 | ⏭️ Skipped | Phases 6 and 7, withdrawn by the T14 verdict |

Test baseline before the feature: 748 tests / 46 files. After: **819 / 51**. Delta **+71 tests, +5
files**. No test was deleted and no assertion was weakened — the only pre-existing test file touched is
`terminal-keys.test.ts`, which gained a block and lost nothing.

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ PASS = a located `file:line` assertion targets the spec-defined outcome. ⚠️ = spec-precision
gap or partial evidence. ❌ = no evidence located (evidence-or-zero).

### P1: A debug probe identifies the scroll cause

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| TSP-01 flag on + DEC mode set/reset parsed → one `console.debug` `[term-modes]` line with session id, raw params, decoded names, `mouseTrackingMode`, `buffer.active.type` after apply | all five components present on one prefixed line; **layout not defined by the spec** | `src/renderer/src/lib/terminal-modes.test.ts:47` — `expect(line).toBe('[term-modes] s-42 CSI ?1049;1003;1006h alt-screen,any,sgr-mouse tracking=any buffer=alternate')`; `:50` `expect(line.startsWith('[term-modes]')).toBe(true)`; reset variant `:62` | ⚠️ Spec-precision gap (layout undefined); **content** matched. "after the sequence applies" is `queueMicrotask` in `TerminalPane.tsx:163` — untested |
| TSP-02 flag on + Ctrl+C classified → one `[term-modes]` line with the classifier action and current tracking/buffer | line carries `copy-selection`/`swallow`/`pass` + tracking + buffer | **no evidence** — the line is a hand-built template literal at `src/renderer/src/components/TerminalPane.tsx:267`, not routed through `formatModeLog`; no test, and not in T14's owner-pending list | ❌ GAP |
| TSP-03 flag on + first `session:data` after attach parsed → one `[term-modes] replay` line with tracking, buffer, `bracketedPasteMode` | those three readouts on one `replay` line | **no evidence** — hand-built literal at `TerminalPane.tsx:332`; no test, not in T14's owner-pending list | ❌ GAP |
| TSP-04 flag absent or ≠ `'1'` at mount → no probe handler registered, zero `[term-modes]` lines | only the exact string `'1'` enables | `src/renderer/src/lib/terminal-modes.test.ts:68` — `expect(isProbeEnabled(() => '1')).toBe(true)`; `:72-75` `null`/`'0'`/`'true'`/`''` all `.toBe(false)`; `:80-84` a throwing read `.toBe(false)`; `:87` `expect(PROBE_FLAG_KEY).toBe('playground.debug.terminalModes')` | ✅ PASS (predicate); registration gated at `TerminalPane.tsx:178-188`, wiring hand-verified |
| TSP-05 decoder maps 14 named params, `?<n>` otherwise | the exact 14 names listed in the spec | `terminal-modes.test.ts:6-9` (x10/vt200/drag/any), `:13-16` (utf8-mouse/sgr-mouse/urxvt-mouse/sgr-pixels), `:20-22` (47/1047/1049 → `alt-screen`), `:26-28` (focus/bracketed-paste/cursor), `:32-34` `expect(modeName(1)).toBe('?1')`, `?12`, `?2026` | ✅ PASS — every name in the spec asserted individually |

### P1: Re-attach restores the terminal's modes

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| TSP-06 head-drop folds every tracked transition into a head-mode state | the dropped content's net mode state survives the drop | `src/main/session-ring-buffer.test.ts:70` — `expect(buf.snapshot()).toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?2004h' + 'l4\nl5\n')` (line cap); `:78` same for the byte cap; `src/main/terminal-mode-tracker.test.ts:70` `expect(prefixOf('\x1b[?1049;1003;1006h')).toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h')` | ✅ PASS |
| TSP-07 `snapshot()` = head prefix + retained content, prefix = exactly the tracked modes differing from a fresh xterm | nothing emitted for default state; `h`/`l` per differing mode | `terminal-mode-tracker.test.ts:13` fresh → `''`; `:17` plain output → `''`; `:76` full-state order `expect(prefixOf(all)).toBe('\x1b[?1049h\x1b[?1003h\x1b[?1006h\x1b[?1004h\x1b[?2004h\x1b[?25l')`; `:64` `expect(prefixOf('\x1b[?25l')).toBe('\x1b[?25l')` (the only `l` the spec's "or `ESC[?<n>l`" needs); `session-ring-buffer.test.ts:87` set-then-reset in the head → `expect(buf.snapshot()).toBe('l2\n')` | ✅ PASS |
| TSP-08 models alt (47/1047/1049 → 1049), tracking (last set wins, any reset → none), encoding (last set wins, any reset → default), focus 1004, bracketed 2004, cursor 25 default visible | each dimension's exact folding rule | `terminal-mode-tracker.test.ts:21-23` all three alt params → `'\x1b[?1049h'`; `:27-29` any alt reset → `''`; `:33-36` `expect(prefixOf('\x1b[?1000h\x1b[?1003h')).toBe('\x1b[?1003h')` and the reverse order; `:40-41` `expect(prefixOf('\x1b[?1003h\x1b[?1002l')).toBe('')`; `:45-48` encoding last-set-wins; `:52-53` encoding cross-reset → `''`; `:57-60` focus + bracketed set/reset; `:64-66` cursor default-visible, `?25h` → `''` | ✅ PASS — all six dimensions, both directions |
| TSP-09 sequence split across two dropped segments → carried, applied once | the same result as an unsplit feed, exactly once | `terminal-mode-tracker.test.ts:81-83` — loops **every** byte offset `0..seq.length` of `'\x1b[?1049;1003h'` and asserts `expect(prefixOf(a, b)).toBe('\x1b[?1049h\x1b[?1003h')`; `:87-88` split with surrounding output | ✅ PASS — exhaustive over the cut position |
| TSP-10 nothing dropped → `snapshot()` byte-equal to retained content | byte-for-byte identity | `session-ring-buffer.test.ts:95` — `expect(buf.snapshot()).toBe(content)` where content already holds `?1049h ?1003h ?2004h` | ✅ PASS |
| TSP-11 `tail()` never includes the head prefix | prefix absent from the preview while present in the snapshot | `session-ring-buffer.test.ts:103-104` — `expect(buf.tail(2)).toBe('l5\n')` **and** `expect(buf.snapshot()).toContain('\x1b[?1049h')` | ✅ PASS — the conjunction is the right control: it proves a prefix exists and is still excluded |

### P1: Ctrl+V pastes images

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| TSP-12 text on the clipboard → paste that text with one `term.paste` | exactly one chunk, verbatim | `src/shared/paste.test.ts:18` `expect(planPaste({kind:'text',text:'npm test'})).toEqual(['npm test'])` (length 1); `:23` multi-line stays one chunk; `src/main/clipboard-reader.test.ts:122-124` `toEqual({kind:'text',text:'npm test'})` **and** `expect(deps.listCalls).toBe(0)` **and** `expect(deps.writes).toEqual([])` | ✅ PASS — payload rule satisfied: value + both absent side effects |
| TSP-13 text **and** image → paste only the text | image is neither written nor pasted | `clipboard-reader.test.ts:56-61` classify → `'text'` with `imageEmpty: false`; `:130-131` `toEqual({kind:'text',text:'from the browser'})` **and** `expect(deps.writes).toEqual([])` | ✅ PASS |
| TSP-14 no text, no file list, non-empty image → PNG at `<tmpdir>\playground-paste\paste-<yyyyMMdd-HHmmss>-<6 hex>.png`, paste `"<path>"` | that exact name shape, path quoted | `clipboard-reader.test.ts:107-110` `expect(pasteImageName(NOW,'a1b2c3')).toBe('paste-20260917-184530-a1b2c3.png')` + a zero-pad case; `:168-169` `toEqual({kind:'paths',paths:[expected]})` **and** `expect(deps.writes).toEqual([{path: expected, data: PNG}])`; `paste.test.ts:6` `expect(quotePath('C:\\src\\notes.txt')).toBe('"C:\\src\\notes.txt"')` | ✅ PASS for the name and the write. The `<os.tmpdir()>` root (`src/main/index.ts:317`) and the 6-hex generator (`:333`) are untested wiring |
| TSP-15 no text, no files, no image → zero bytes to the PTY | no chunk planned | `clipboard-reader.test.ts:80-81` classify → `'empty'`; `:175-176` empty-buffer image → `toEqual({kind:'empty'})` + `writes` empty; `:182-183`; `paste.test.ts:27` `expect(planPaste({kind:'empty'})).toEqual([])` | ✅ PASS — the empty→no-chunk chain is closed end to end |
| TSP-16 PNG write fail, file-list fail, or >5 s → zero bytes, log the error, chip "Não foi possível colar" for `COPIED_FEEDBACK_MS` | `{kind:'error'}` → no chunk; 5 s bound; that exact chip text; that exact duration | `clipboard-reader.test.ts:192-195` `toEqual({kind:'error',message:'powershell timed out'})`; `:205-209` write failure → error **and** `expect(deps.writes).toEqual([])`; `paste.test.ts:31` `expect(planPaste({kind:'error',...})).toEqual([])`; duration `src/renderer/src/lib/terminal-keys.test.ts:331` `expect(COPIED_FEEDBACK_MS).toBe(1_200)` | ⚠️ Partial. The **5 s bound** is a bare literal at `src/main/index.ts:94` (`{ timeout: 5_000 }`) with no assertion, and the **chip text** is a bare const at `TerminalPane.tsx:31` with no assertion. Both are spec-stated precise values. Also a spec-precision gap the authors flagged: "next to the existing chip" vs "reuses the existing element" contradict; shipped as reuse |
| TSP-17 Alt+V → `pass`, so xterm sends `ESC v` unchanged | action is exactly `'pass'` | `terminal-keys.test.ts:119-121` `expect(classifyTerminalKey(key({altKey:true,code:'KeyV',key:'v'}), false, cold)).toBe('pass')`; `:126-127` Ctrl+Alt+V (AltGr on ABNT2) also `'pass'` | ✅ PASS |
| TSP-18 app start → delete every file in the paste dir with mtime > 7 days | strictly-older deleted, others kept | `src/main/paste-temp.test.ts:20` `expect(PASTE_MAX_AGE_MS).toBe(7*24*60*60*1000)`; `:32` `expect(selectExpired(entries, NOW_MS, PASTE_MAX_AGE_MS)).toEqual(['older.png'])`; `:67` real-fs purge → `expect(readdirSync(dir).sort()).toEqual(['paste-boundary.png','paste-today.png'])` | ✅ PASS. "at app start" is wiring at `src/main/index.ts:339` |
| TSP-19 missing dir, or one undeletable file → skip, continue, never block/fail startup | the other expired files still go | `paste-temp.test.ts:73-74` missing dir `.not.toThrow()` + `expect(existsSync(missing)).toBe(false)`; `:85-88` `.not.toThrow()` **and** `expect(readdirSync(dir)).toEqual(['paste-stuck.png'])` — the stuck entry survives while `paste-old.png` was removed — **and** the stuck entry's content intact | ✅ PASS — "continue with the rest" is actually proven, not just "did not throw" |
| TSP-20 right-click paste uses the same clipboard read and paste plan as Ctrl+V | one shared code path | **no test.** Structurally guaranteed: both branches call the single `pasteFromClipboard` (`TerminalPane.tsx:230` def; invoked from the Ctrl+V branch and the right-click branch). Not in T14's owner-pending list | ❌ GAP (structural argument only) |

### P1: Ctrl+V pastes files copied in Explorer

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| TSP-21 no text + file list → each path as `"<abs>"`, one `term.paste` per file, clipboard order | one quoted chunk per path, order preserved | `paste.test.ts:35-37` `expect(planPaste({kind:'paths',paths:['C:\\a\\one.png','C:\\b\\two.md','D:\\three']})).toEqual(['"C:\\a\\one.png"','"C:\\b\\two.md"','"D:\\three"'])`; `clipboard-reader.test.ts:140-144` order preserved **and** `expect(deps.listCalls).toBe(1)`; `:70-71` classify files over image | ✅ PASS |
| TSP-22 wait `PASTE_GAP_MS` (100 ms) between consecutive pastes | the constant is 100 ms **and** the wait happens | `paste.test.ts:60` `expect(PASTE_GAP_MS).toBe(100)` | ⚠️ Partial — the value is pinned; the waiting itself (`TerminalPane.tsx:198-201, 217`) has no test. Listed owner-pending in T14 |
| TSP-23 a paste requested mid-sequence starts only after the running one sends its last path | strict serialization, no interleaving | **no test.** Source-verified: a single `pasteQueue` promise chain (`TerminalPane.tsx:196, 205`) with the gap awaited **after** the last chunk too. Not in T14's owner-pending list | ❌ GAP |
| TSP-24 unmount or session change mid-sequence → remaining paths NOT sent | no further `term.paste` | **no test.** Source-verified and sound: `pasteDisposed` checked before **every** `term.paste` (`:211`), set in cleanup (`:473`), gap timer cleared (`:474`), effect key `[sessionId, undoByte]` (`:484`) so a session switch runs the cleanup. Not in T14's owner-pending list | ❌ GAP |

### P1: Dropping files on the terminal pastes their paths

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| TSP-25 drop → resolve each path via `webUtils.getPathForFile`, paste per TSP-21..24, in drop order | quoted paths, drop order | `paste.test.ts:35-37` covers the ordering/quoting of the plan. Resolution is `src/preload/index.ts:22` and `TerminalPane.tsx:447`, untested | ⚠️ Partial — plan tested, resolution hand-verified. Owner confirmed in T14: "dragging files onto the pane pastes their paths" |
| TSP-26 `preventDefault` on `dragover` and `drop` so the window never navigates | both handlers call it | **no test.** Source-verified: `TerminalPane.tsx:437` (dragover, first statement) and `:441` (drop, first statement); both registered at `:453-454` and removed in cleanup `:466-467`. Not in T14's owner-pending list | ❌ GAP (source-verified) |
| TSP-27 item resolving to an empty path skipped; none resolves → zero bytes | empty entries filtered, empty result plans nothing | `paste.test.ts:47-49` `expect(planPaste({kind:'paths',paths:['','C:\\a\\one.png','']})).toEqual(['"C:\\a\\one.png"'])`; `:53-54` `expect(planPaste({kind:'paths',paths:['','']})).toEqual([])` and `[]` → `[]` | ✅ PASS — this one *was* pushed into the seam properly |
| TSP-28 a handled drop takes keyboard focus | `term.focus()` after the drop | **no test.** Source-verified at `TerminalPane.tsx:450`. Not in T14's owner-pending list | ❌ GAP |

### P2: Withdrawn (TSP-29..34)

| Requirement | Status | Why |
| --- | --- | --- |
| TSP-29..32 (cause-1 mouse-reset guard) | ⏭️ Withdrawn | T14 probe verdict is **cause 3 only**; Phase 6 skipped |
| TSP-33..34 (cause-2 manual reset button) | ⏭️ Withdrawn | Same verdict; Phase 7 skipped |

**Correctly not reported as missing coverage.** The two candidate fixes contradict each other (one
suppresses mouse resets, the other applies them), so building either blind was the recorded risk.
Evidence quality is stated plainly in the spec and in T14: the verdict rests on a **non-reproduction**,
not a measured A/B, and the probe stays on the branch behind the flag so the log can be captured if the
dead scroll returns. That is an honest record, not a gap.

### Edge Cases

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| TSP-35 a copied directory pastes like a file | path passes through unchanged | `clipboard-reader.test.ts:150-153` `toEqual({kind:'paths',paths:['C:\\Acme Corp\\docs']})` | ✅ PASS |
| TSP-36 blank lines / trailing CRLF ignored | only real paths returned | `clipboard-reader.test.ts:87-90` `expect(parseFileDropList('C:\\a\\one.png\r\nC:\\b\\two.md\r\n\r\n')).toEqual([...2 paths])`; `:100-101` `''` → `[]` and `'\r\n  \n'` → `[]` | ✅ PASS |
| TSP-37 non-ASCII path pasted byte for byte | identical bytes inside the quotes | `paste.test.ts:11-12` `expect(quotePath(path)).toBe('"C:\\Acme Corp\\relatório.png"')` **and** `expect(quotePath(path).slice(1,-1)).toBe(path)` (round-trip); `:42-43`; `clipboard-reader.test.ts:94-96` | ✅ PASS |
| TSP-38 two images in the same second get different names | the two names differ | `clipboard-reader.test.ts:114` `expect(pasteImageName(NOW,'a1b2c3')).not.toBe(pasteImageName(NOW,'d4e5f6'))` | ⚠️ Tautological. It proves only that the function embeds its `rand` argument. The discriminating property — that the *system* supplies a fresh value per paste — is `randomBytes(3).toString('hex')` at `src/main/index.ts:333`, untested |
| TSP-39 a file exactly 7 days old is **kept** (strictly older only) | boundary excluded | `paste-temp.test.ts:29,32` the `exactly-seven-days.png` entry at `NOW_MS - 7*DAY_MS` is absent from `expect(selectExpired(...)).toEqual(['older.png'])`; `:67` `paste-boundary.png` survives a real purge | ✅ PASS — both sides of the boundary, in the pure seam and against a real filesystem |
| TSP-40 agent owns the mouse + nothing selected → right-click reaches the agent, no paste (TCU-27 preserved) | action is exactly `'none'` | `terminal-keys.test.ts:217` `expect(classifyTerminalMouse(rightClick, false, OWNED)).toBe('none')` | ✅ PASS — `classifyTerminalMouse` is byte-unchanged by this diff and its test still green, which is what "preserved" means |

**Status**: ❌ 27 of 34 non-withdrawn ACs matched their spec-defined outcome. **7 have no located
evidence** (TSP-02, TSP-03, TSP-20, TSP-23, TSP-24, TSP-26, TSP-28) and **4 are partial or
spec-precision gaps** (TSP-01, TSP-16, TSP-22, TSP-25, TSP-38).

---

## Spec-Precision Gaps

The authors flagged four during Execute. All four **verified as real**:

1. **TSP-01** — the spec enumerates the line's *contents* but not its layout. The shipped shape is
   pinned by `toBe` at `terminal-modes.test.ts:47`, which is stronger than the spec; the format itself
   is therefore an implementation choice, not a derived requirement. Accepted.
2. **TSP-02/03** — follow TSP-01's undefined layout, and additionally have no test at all (see gaps).
3. **TSP-16** — the spec says the chip sits "next to the existing 'Copiado' chip" *and* that it
   "reuses the existing element and timing". Those cannot both hold. Shipped as reuse, so the failure
   message inherits the success chip's styling. Genuine internal contradiction in the spec.
4. **`planPaste({kind:'text', text:''})`** — undefined by the spec; returns `['']`, which would reach
   `term.paste('')` and, under bracketed-paste mode, put `ESC[200~ESC[201~` on the PTY — a violation of
   TCU-18's "no byte for an empty clipboard". **Verified unreachable**: the only producer of
   `{kind:'text'}` is `clipboard-reader.ts:78`, guarded by `classifyClipboard`'s `state.text !== ''`
   (`:43`). Harmless today, one refactor away from not being.

**One the authors did not flag**, found here:

5. **TSP-14's "6 hex"** and **TSP-16's "5 s"** are precise values the spec states, and neither is
   asserted anywhere. `PASTE_GAP_MS` (100 ms), `COPIED_FEEDBACK_MS` (1200 ms) and `PASTE_MAX_AGE_MS`
   (7 days) were all deliberately pulled into tested seams for exactly this reason — `terminal-keys.ts:27`
   says so in as many words ("Declared here so the value an AC constrains lives in the unit-tested seam
   rather than as a literal inside the component the repo convention leaves untested"). The 5 s timeout
   (`index.ts:94`), the 3-byte rand (`index.ts:333`) and the chip text (`TerminalPane.tsx:31`) break that
   convention without a stated reason.

---

## Discrimination Sensor

**Isolation**: a temporary `git worktree` at `HEAD` (detached `c569db1`) in the session scratchpad, with
`node_modules` junctioned to the real one. Never `git stash`. Baseline `git status --porcelain` of the
real tree captured before any sensor work: **0 bytes**. Worktree removed with `git worktree remove
--force` + `git worktree prune`; post-sensor porcelain re-checked: **0 bytes, identical to baseline**,
`HEAD` still `c569db1` on `feature/terminal-scroll-paste`.

**Depth**: standard-risk feature, escalated to 18 mutations (the checklist's ≥5 floor is for P0; this run
covers every load-bearing branch named in the brief plus the probe seam).

| # | File:line | Behaviour-level fault | Covering suite | Killed? |
| --- | --- | --- | --- | --- |
| M1 | `terminal-mode-tracker.ts:82` | `#tracking = set ? param : 0` → `: this.#tracking` (a reset no longer clears tracking) | `terminal-mode-tracker.test.ts` | ✅ Killed (exit 1) |
| M2 | `terminal-mode-tracker.ts:72-73` | prefix emits encoding **before** tracking (TSP-07 order) | same | ✅ Killed |
| M3 | `terminal-mode-tracker.ts:61` | split-CSI carry discarded (`#carry = ''`) | same | ✅ Killed |
| M4 | `terminal-mode-tracker.ts:81` | `#alt = set` → `#alt = true` (`?1049l` no longer leaves the alt screen) | same | ✅ Killed |
| M5 | `session-ring-buffer.ts:55` | `snapshot()` returns `#buf` only — the head-mode prefix dropped (the whole cause-3 fix) | `session-ring-buffer.test.ts` | ✅ Killed |
| M6 | `session-ring-buffer.ts:62` | `tail()` prefixed with the head modes (TSP-11 inverted) | same | ✅ Killed |
| M7 | `session-ring-buffer.ts:70` | line-cap trim no longer feeds the dropped head to the tracker | same | ✅ Killed |
| M8 | `paste.ts:43` | `.filter(path => path !== '')` removed (empty resolved paths pasted as `""`) | `paste.test.ts` | ✅ Killed |
| M9 | `paste.ts:26` | `PASTE_GAP_MS = 100` → `40`, under Claude Code's 50 ms merge window | same | ✅ Killed |
| M10 | `clipboard-reader.ts:43-44` | files checked before text — image/file wins over text (TSP-13 inverted) | `clipboard-reader.test.ts` | ✅ Killed |
| M11 | `clipboard-reader.ts:44-45` | image checked before the file list (TSP-21 precedence inverted) | same | ✅ Killed |
| M12 | `clipboard-reader.ts:59` | `getMonth() + 1` → `getMonth()` (off-by-one in the PNG name) | same | ✅ Killed |
| M13 | `paste-temp.ts:21` | `> maxAgeMs` → `>= maxAgeMs` (the exactly-7-days file gets deleted) | `paste-temp.test.ts` | ✅ Killed |
| M14 | `paste-temp.ts:43-46` | per-file `try/catch` removed, so one undeletable entry aborts the purge | same | ✅ Killed |
| M15 | `terminal-keys.ts:122` | `!event.altKey` guard removed (Ctrl+Alt+V swallowed by the app paste again — the exact latent defect T10 fixed) | `terminal-keys.test.ts` | ✅ Killed |
| M16 | `terminal-modes.ts:31` | `1003: 'any'` → `'drag'` | `terminal-modes.test.ts` | ✅ Killed |
| M17 | `terminal-modes.ts:78` | `read() === '1'` → `read() !== null` (probe on for any flag value) | same | ✅ Killed |
| M18 | `terminal-modes.ts:68` | `tracking=` and `buffer=` readouts swapped in the probe line | same | ✅ Killed |

**Sensor outcome**: **18/18 killed, 0 survived** — objective met. Every load-bearing branch the brief named
(mode folding, split-CSI carry, `snapshot()` prefixing vs unprefixed `tail()`, `quotePath`/`planPaste`
ordering and skipping, `classifyClipboard` precedence, `selectExpired`'s strict boundary, the
Ctrl+V/Alt+V/Ctrl+Alt+V classification) is discriminated by an assertion that fails when it breaks.

Note the asymmetry this exposes: the sensor could reach **no** mutation of TSP-02, TSP-03, TSP-20,
TSP-23, TSP-24, TSP-26 or TSP-28, because nothing tests them. A perfect kill rate over the seams says
nothing about the pane.

---

## Probe / Cleanup Audit (the two untested author claims)

### (a) The CSI handlers observe without consuming — **CONFIRMED**

`TerminalPane.tsx:176` returns `false` unconditionally from `logModeChange`, and both handlers
(`:180`, `:183`) are thin arrows delegating to it, so neither can return anything else. The state
readouts happen in a `queueMicrotask` (`:163`) rather than inline, which is also what keeps the handler
from reporting the pre-apply state.

**What returning `true` would break**: xterm tries registered CSI handlers in reverse registration order
and stops at the first that returns `true`. With `{prefix:'?', final:'h'|'l'}` registered last, a `true`
would swallow **every** DEC private mode set and reset before xterm's own DECSET/DECRST ran — no
alternate screen, no mouse tracking, no mouse encoding, no bracketed paste, no cursor hiding. Every TUI
would render on the normal buffer with a dead wheel and unbracketed paste: the probe would manufacture a
superset of the bug it was built to diagnose, and only on machines with the flag set, which is the worst
possible failure shape for a diagnostic. The guard is one `return false` with no branch above it, which
is the right way to make it unmissable — but it is worth noting that **nothing in the suite would catch a
regression to `true`**, because the handlers are pane-local.

### (b) Every registration is disposed — **CONFIRMED, with two low-severity observations**

Registered in the effect, all released in the cleanup at `TerminalPane.tsx:461-483`:

| Registered | Disposed |
| --- | --- |
| `mousedown` / `contextmenu` capture listeners (`:451-452`) | removed `:464-465` |
| `dragover` / `drop` listeners (`:453-454`) | removed `:466-467` |
| chip feedback timer (`:99`) | `clearTimeout(chipTimer)` `:468`, element removed `:469` |
| paste gap timer (`:199`) | `clearTimeout(gapTimer)` `:474` |
| paste queue | `pasteDisposed = true` `:473`, checked before **every** `term.paste` (`:211`) and in both `pasteFromClipboard` continuations (`:233`, `:242`) |
| `onSelectionChange` (`selectionSub`) | `:475` |
| 2 probe CSI handlers | `:476` `for (const handler of probeHandlers) handler.dispose()` |
| `ResizeObserver`, theme `MutationObserver` | `:477-478` |
| `session:data`, `session:exit` IPC listeners | `offData()` `:479`, `offExit()` `:480` |
| `term.onData` (`inputSub`), the terminal itself | `:481`, `term.dispose()` `:482` |
| custom key event handler | dies with `term.dispose()` |

The effect key is `[sessionId, undoByte]` (`:484`), so a **session change runs the full cleanup** before
the next mount — TSP-24's "or its session changes" is structurally covered, not just unmount. **No path
was found where a disposed queue still writes to a dead terminal**: the loop's `pasteDisposed` check sits
immediately before `term.paste` and therefore also immediately after every gap await.

Two observations, neither blocking:

- **A never-settling promise is left behind.** `clearTimeout(gapTimer)` at `:474` cancels the timer the
  running sequence is awaiting, so the `pasteGap()` promise never resolves and the `pasteQueue` chain
  stays pending forever, retaining the disposed `term` and the unsent chunks in its closure. Correctness
  is fine (nothing is written); it is a small per-occurrence retention that only happens when a session
  is switched mid-paste. Resolving instead of cancelling, or rejecting into the existing `.catch`, would
  close it.
- **The replay write callback can outlive the terminal.** `term.write(payload.data, cb)` at `:330` reads
  `term.modes.mouseTrackingMode` and `term.buffer.active.type` from inside the callback. If the pane
  unmounts between the write and xterm parsing it, that callback touches a disposed terminal. Only
  reachable with the probe flag on, and worst case is a console throw, but it is the one probe path that
  is not guarded by `pasteDisposed`-style flag.

---

## Withdrawal Consistency

| Where | State |
| --- | --- |
| `spec.md` Requirement Traceability rows for TSP-29..34 | ✅ all six `Withdrawn (Q2: cause 3 only)`, Phase `—` |
| `spec.md` Q2 assumption row | ✅ `Confirmed? = y`, verdict recorded, evidence quality stated as a non-reproduction |
| `tasks.md` phase headers (Phase 6, Phase 7) | ✅ both `— **SKIPPED** (Q2: cause 3 only)` |
| `tasks.md` task headers T15..T19 | ✅ all five `**SKIPPED**` with the withdrawn ID range |
| `tasks.md` T14 Done-when | ✅ both withdrawal boxes ticked; the partial box honestly marked `[~]` |
| `tasks.md` **Test Coverage Matrix** | ❌ **out of sync.** The shared-helpers row still claims "1:1 to TSP-12/15/21/22/27/**34**" — TSP-34 is a withdrawn cause-2 AC about the reset button sending zero bytes, which has nothing to do with `src/shared/paste.ts` (it reads like a typo for TSP-24, itself not a `paste.ts` concern either). The renderer-libs row still claims "1:1 to TSP-04/05/17/**29-33**" |
| `design.md` | ⚠️ lines 15, 61-62, 171-172, 194, 197, 245-246 still present TSP-29..34 as in-scope conditional work with no withdrawn marker. Defensible as a design-as-planned record, but a reader gets no signal |
| `.specs/STATE.md` Handoff | ❌ **contradicts the recorded verdict.** Still reads "Phases 1-5 EXECUTED (T1-T13) … **BLOCKED ON THE OWNER at T14**" and lists the three verdict branches as still open. `c78fff6` wrote it *before* the verdict and `c569db1` updated only `spec.md` and `tasks.md` |

---

## Code Quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ — the one shared seam (`planPaste`) has three callers by design |
| No unnecessary flexibility | ✅ |
| Only touched files required for the task | ✅ 23 files, all in scope |
| Didn't "improve" unrelated code | ✅ — `classifyTerminalMouse` and the ring buffer's pre-existing tests are byte-unchanged |
| Matches existing patterns/style | ⚠️ — matches everywhere *except* the three spec-stated values left outside the seam (5 s, 3-byte rand, chip text), where `COPIED_FEEDBACK_MS`'s own docstring sets the convention |
| Would a senior engineer approve? | ✅ for the seams (the `TerminalModeTracker` and `SessionRingBuffer` tests are unusually strong — TSP-09 is exhaustive over the cut offset, TSP-11 asserts the negative *and* its control). ⚠️ for the pane, whose most intricate new logic ships with no evidence |
| Spec-anchored outcome check | ⚠️ 27/34 matched; 7 with no evidence |
| Per-layer Coverage Expectation met | ⚠️ pure seams 1:1 as the matrix requires; the matrix's own AC lists cite withdrawn IDs |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — 4 uncited tests are all negative controls tracing to TSP-08 (`terminal-mode-tracker.test.ts:91-100`), TSP-12/13 (`clipboard-reader.test.ts:64`), the format-gating assumption (`:156`) and TSP-19 (`paste-temp.test.ts:35`) |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` (hand-rolled DI fakes, real temp dirs), `CONVENTIONS.md`, `vitest.config.ts` |

---

## Gate Check

- **Command**: `npm run typecheck && npm run lint && npm test`
- **`npm run typecheck`** → exit **0**
- **`npm run lint`** → exit **0** (`✖ 18 problems (0 errors, 18 warnings)`, all `prettier/prettier` in
  files this feature did not touch — the recorded pre-existing baseline; judged by exit code, not by the
  summary line)
- **`npm test`** → exit **0** — **819 passed / 819**, **51 files passed / 51**, 0 failed, 0 skipped
- Test count before the feature: **748 / 46**. Delta **+71 tests / +5 files**. No deletions, no weakened
  assertions.

### Closing gate — and a hole found in it

`python scripts/validate_state.py terminal-scroll-paste` → exit **1**, message
`validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)`.
Correct.

**But it first returned exit 0 on this same FAIL report.** `_verdict()` builds its haystack from every
line matching `^#{1,4}\s*validation\b` **or** `\*{0,2}result\*{0,2}\s*:`, unanchored. This report's only
matching line was the Discrimination Sensor's summary — and the skill's own report template prescribes
that line verbatim as a bold `Result` label followed by the kill count and a pass/fail marker for the
*sensor* — not for the report. With a green sensor inside a FAIL
report, that single line is the entire haystack, it contains `PASS` and not `FAIL`, and the deterministic
completion gate declares the feature done. The report's `## Summary` verdict is never read, because no
line in the template matches `^##\s*validation`.

Reproduced and fixed here by renaming the sensor line to `**Sensor outcome**:` and adding an explicit
`## Validation: terminal-scroll-paste — FAIL` heading. **The skill's template and script still disagree**
— any Verifier that follows the template literally will produce a FAIL report that the gate passes.

---

## Owner-Pending Hand Checks

Recorded in `tasks.md` T14 and still unproven:

1. Which agent the paste checks ran against — TSP-14/TSP-21 say "in opencode **and** Claude Code"; the
   owner did not say which, so that wording is half-evidenced.
2. Several files in one paste, in clipboard order, one with a space in the name (TSP-21, TSP-22).
3. Clipboard holding both text and an image, where only the text should paste (TSP-13) — unit-covered,
   gesture unconfirmed.
4. Dragging a link, where nothing should paste (TSP-27) — unit-covered, gesture unconfirmed.
5. The paste-failure chip "Não foi possível colar" (TSP-16).
6. Switch away from a busy opencode session and back, and the wheel still scrolls (TSP-06..11) —
   unit-covered, gesture unconfirmed.

**Missing from that list** — neither tested nor recorded as pending, so they currently read as silent
passes: TSP-02 (the Ctrl+C probe line), TSP-03 (the replay probe line), TSP-20 (right-click uses the same
reader), TSP-23 (a second paste queues behind the first), TSP-24 (a session switch stops the remaining
paths), TSP-26 (the window does not navigate on a drop), TSP-28 (the terminal takes focus after a drop).

---

## Fix Plans

### Fix 1 — Record the seven unproven ACs (Blocker for the verdict, trivial to do)

- **Root cause**: T14's owner-pending list enumerates some hand items and omits seven others, so ACs
  with no evidence of any kind are indistinguishable from verified ones.
- **Task**: add TSP-02, TSP-03, TSP-20, TSP-23, TSP-24, TSP-26 and TSP-28 to T14's owner-pending list
  with the exact gesture that would prove each (set the flag and press Ctrl+C → one `ctrl-c` line;
  switch sessions → one `replay` line; right-click paste an image; Ctrl+V twice in a row with 3 files
  each and check no two paths merge; switch session mid-paste and check the rest never arrive; drop a
  file and check the window stays on the Agents view; drop a file and type immediately).
- **Done when**: every non-withdrawn AC in `spec.md` is either traced to a `file:line` or listed as
  owner-pending. Nothing silent.

### Fix 2 — Move the three spec-stated values into tested seams (Major)

- **Root cause**: the 5 s file-list timeout (`index.ts:94`), the 6-hex rand (`index.ts:333`) and the
  chip text (`TerminalPane.tsx:31`) are literals in untested files, while the feature's other
  spec-stated constants were deliberately placed in seams for exactly this reason.
- **Task**: export `FILE_DROP_LIST_TIMEOUT_MS = 5_000` and `PASTE_IMAGE_RAND_BYTES = 3` from a tested
  module (`src/shared/paste.ts` fits) and `PASTE_FAILED_TEXT` next to `COPIED_FEEDBACK_MS` in
  `terminal-keys.ts`; assert each value and reference them from `index.ts` / `TerminalPane.tsx`.
- **Done when**: a sensor mutation of any of the three fails a test.

### Fix 3 — Sync the documents to the withdrawal (Minor)

- **Root cause**: `c569db1` updated `spec.md` and `tasks.md` only.
- **Task**: (a) `.specs/STATE.md` Handoff — replace "BLOCKED ON THE OWNER at T14" with the recorded
  cause-3 verdict and the withdrawal; (b) `tasks.md` Test Coverage Matrix — fix the shared-helpers row's
  `TSP-34` and the renderer-libs row's `TSP-29-33`; (c) `design.md` — mark the conditional sections
  withdrawn. This is the third occurrence of drifted TSP citations on this feature (the first two were
  fixed in `b3b41e3` and `1467c64`).
- **Done when**: no document outside `design.md`'s historical record references TSP-29..34 as in scope,
  and no matrix row cites a withdrawn ID.

### Fix 4 — Close the two disposal observations (Cosmetic)

- Resolve rather than cancel the pending gap promise on cleanup, so the paste chain settles.
- Guard the replay write callback against a disposed terminal.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| --- | --- | --- |
| TSP-01 | Implementing | ⚠️ Verified with a spec-precision gap (layout undefined) |
| TSP-02, TSP-03 | Implementing | ❌ Needs evidence (no test, not recorded as pending) |
| TSP-04..TSP-15 | Implementing | ✅ Verified |
| TSP-16 | Implementing | ⚠️ Partial — error path verified; 5 s bound and chip text unasserted |
| TSP-17..TSP-19 | Implementing | ✅ Verified |
| TSP-20 | Implementing | ❌ Needs evidence (structural argument only) |
| TSP-21 | Implementing | ✅ Verified |
| TSP-22 | Implementing | ⚠️ Partial — constant pinned, the wait untested |
| TSP-23, TSP-24 | Implementing | ❌ Needs evidence |
| TSP-25 | Implementing | ⚠️ Partial — plan verified, resolution owner-confirmed |
| TSP-26 | Implementing | ❌ Needs evidence (source-verified) |
| TSP-27 | Implementing | ✅ Verified |
| TSP-28 | Implementing | ❌ Needs evidence |
| TSP-29..TSP-34 | Withdrawn | ⏭️ Withdrawn (confirmed consistent in `spec.md` and `tasks.md`) |
| TSP-35..TSP-37 | Implementing | ✅ Verified |
| TSP-38 | Implementing | ⚠️ Assertion tautological; the discriminating generator is untested |
| TSP-39, TSP-40 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ⚠️ **Issues — not ready to close, no defect found**

**Spec-anchored check**: 27/34 non-withdrawn ACs matched the spec-defined outcome; **7 no evidence**,
**4 partial / spec-precision**, 1 unreachable-undefined-branch confirmed harmless.
**Sensor**: **18/18 killed**, 0 survived. Scratch worktree discarded; real tree porcelain empty and
identical to the pre-sensor baseline.
**Gate**: typecheck 0, lint 0, test 0 — 819/819 passing, 51/51 files, 0 skipped.

**What works, and works well**: the pure seams. `TerminalModeTracker` folds all six mode dimensions in
both directions with an exhaustive split-offset test for TSP-09; `SessionRingBuffer` proves the prefix
appears in `snapshot()` *and* is absent from `tail()` in the same test; `clipboard-reader` asserts the
text-over-files-over-image precedence *and* the absence of the side effects it must not perform;
`paste-temp` pins both sides of the strictly-older boundary against a real filesystem. Every one of the
18 injected faults died. The cause-3 fix — the one thing on this branch that changes what the user sees
every day — is the best-covered code in the diff.

**Issues found**:

1. Seven ACs with no evidence of any kind, all of them pane-local, and the two with real bug potential
   (TSP-23 paste queueing, TSP-24 cancel-on-switch) are the most intricate new logic in the feature: a
   promise chain plus a disposal flag plus a cancelled timer. Source review found them correct; nothing
   would catch it if they stopped being.
2. Three spec-stated precise values outside the tested seams, against the repo's own documented
   convention.
3. Three documents still carrying the withdrawn requirement set, and a `STATE.md` that flatly
   contradicts the verdict the branch's last commit recorded.

**Next steps**: Fixes 1 and 3 are documentation and cost minutes; Fix 2 is three constants and three
assertions. None requires touching the behaviour the owner already confirmed. Re-verify after them.
