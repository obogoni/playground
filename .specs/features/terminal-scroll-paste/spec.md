# Terminal Scroll & Paste Specification

## Problem Statement

Two gaps in the embedded terminal break the daily loop with opencode and Claude Code.

**Scroll dies.** From time to time the mouse wheel stops scrolling inside opencode, apparently
after a Ctrl+C. The pane itself never touches wheel events or mouse modes
(`TerminalPane.tsx:145-197`, `:246-297`), so the fault is a terminal-mode change that xterm
receives. Three causes fit the symptom, and the owner's observation that tells them apart (Q2)
was not in yet when this spec was written:

1. **ConPTY clears mouse tracking under a live TUI.** A Ctrl+C reaches every process on the
   console, and a dying child's console-mode change becomes DECRST 1003/1006 in the stream.
   opencode sets the mouse modes once at startup, so xterm is left on the alternate screen with
   tracking off. Each wheel notch then becomes an arrow key (xterm 6 `CoreBrowserTerminal.bindMouse`),
   so scrolling looks dead.
2. **opencode dies without restoring the terminal.** Its Ctrl+C is bound to both clear and exit
   (opencode #6912, #11748, #11826). The user lands in pwsh with tracking still on, and mouse
   movement prints `[555;58;25M`-style garbage.
3. **Replay after re-attach loses the mode prefix.** `SessionRingBuffer` keeps the last
   1 MB / 5,000 lines and trims the oldest content (`session-ring-buffer.ts:21-22`, `:54-77`).
   opencode redraws constantly, so the `?1049h` / `?1003h` / `?1006h` it sent at startup fall
   off the head. `attach` replays `snapshot()` into a fresh `Terminal` (`session-manager.ts:210-214`,
   `TerminalPane.tsx:108`), which starts on the normal screen with tracking off.

**Paste is text-only.** Ctrl+V and the right-click paste read only `navigator.clipboard.readText()`
(`TerminalPane.tsx:188-195`, `:287-295`). An image or a file copied in Explorer pastes nothing.
Dropping a file on the terminal does nothing either: there is no drop handler, and Electron's
default is to navigate the window to the dropped file.

## Goals

- [ ] One debug-flag session tells which of the three scroll causes happens on the owner's machine
- [ ] Switching sessions never loses the alternate screen, mouse tracking, mouse encoding or bracketed paste mode of a running TUI
- [ ] The confirmed scroll cause is fixed, so after a Ctrl+C the wheel scrolls opencode again
- [ ] Ctrl+V with an image on the clipboard attaches it in opencode and Claude Code
- [ ] Ctrl+V with files copied in Explorer, or dropping files on the pane, pastes every file's path in a form both agents recognize

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Guaranteeing image attachment in Codex or Copilot | Owner decision (Q3): opencode and Claude Code are the targets. The other agents get the same pasted paths; whether they attach an image is up to them (Copilot CLI has no clipboard-image support, copilot-cli #1452) |
| Forwarding Ctrl+V to the agent so it reads the clipboard itself | Owner decision (Q14): agents disagree on the key (opencode reads the clipboard on 0x16, Claude Code on Windows on Alt+V). A pasted path works the same way in both. Alt+V stays untouched for anyone who wants the native behavior |
| Joining several paths into one paste, as Windows Terminal does | Owner decision (Q4): opencode attaches only when the whole paste is one path, and Claude Code splits only on newlines or before `/`, `X:\`. One paste per path is the only form both recognize |
| Dropping text, links or browser images, meaning anything without a filesystem path | Not requested. Only dropped files carry a path (`webUtils.getPathForFile`) |
| Automatic detection that an agent died and left modes behind (cause 2) | A shell-hosted PTY has no signal for a child's death; the same limitation deferred the agent-exited sub-status in AM3. Cause 2 gets a manual reset action instead |
| Upgrading `@xterm/xterm` past 6.0.0 or switching node-pty to `useConptyDll` | Same regression-risk rationale as the earlier terminal features. The bundled ConPTY DLL is worth trying only if cause 1 survives the fix |
| Changing the ring buffer's 1 MB / 5,000-line caps | The replay fix restores the modes; the caps stay |
| A paste confirmation for large or multi-file pastes | No reported pain; `term.paste` already brackets every paste |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| **Which scroll cause happens (Q2)** | **Open.** The spec ships a debug probe first (TSP-01..05). The cause-1 fix (TSP-29..32) and the cause-2 fix (TSP-33..34) are **conditional**: at Execute only the one the probe or the owner's Q2 answer confirms is built, and the other's IDs are marked `Withdrawn` | The two fixes point in opposite directions: cause 1 needs resets suppressed, cause 2 needs resets applied. Building both blind risks turning one into the other | n |
| Cause 3 (replay drops the mode prefix) is fixed regardless of Q2 | In scope, unconditional (TSP-06..11) | It is deterministic from the code (`session-ring-buffer.ts:54-77` trims the head; `session-manager.ts:213` replays what is left). It is cheap, and the paste feature depends on it: bracketed paste (DECSET 2004) is one of the modes lost, and without it `term.paste` sends paths unbracketed, which opencode reads as keystrokes | y |
| The probe stays in the product | Kept, behind `localStorage['playground.debug.terminalModes'] === '1'`, and silent otherwise | Terminal-mode bugs have come up three times (INPUT, TCU, this one). A flag-gated log is cheaper than re-instrumenting each time | y |
| Text wins over image (Q5) | Clipboard text present means only the text is pasted | Owner decision. Copying from a browser, Word or Teams puts both on the clipboard, and attaching an image by accident is the expensive error | y |
| Precedence when text is absent | Files, then image | Explorer puts a file list (`text/uri-list`) and no image when a file is copied. An image with no file list is a screenshot or an in-app copy | y |
| One paste per path, always double-quoted, 100 ms apart (Q4) | `"<absolute path>"`, one `term.paste` each, `PASTE_GAP_MS = 100` | opencode strips the surrounding quotes and attaches only when the whole paste is one path (`component/prompt/index.tsx`); Claude Code strips outer quotes per piece and merges paste chunks that arrive within 50 ms. Windows paths cannot contain `"`, so quoting is always safe | y |
| Clipboard reads happen in main, over IPC | New `clipboard:read-paste` channel | Electron deprecates `clipboard` in the renderer from 40 and removes it in 44. The file list needs a child process, which only main can spawn | y |
| Reading the file list | Windows PowerShell 5.1: `powershell.exe -NoProfile -STA`, `[System.Windows.Forms.Clipboard]::GetFileDropList()`, UTF-8 output. Spawned only when `availableFormats()` lists `text/uri-list` | Measured on Electron 39.8.10: `readBuffer('FileNameW')` returned only the first file and `CF_HDROP` came back empty. `GetFileDropList` is what opencode and Claude Code use. Gating on the format keeps a text Ctrl+V free of a ~300 ms process start | y |
| File-list read timeout | 5 s, then treated as a failure | A wedged PowerShell must not leave a paste hanging forever | y |
| Where pasted images go (Q14, Q15) | `<os.tmpdir()>\playground-paste\paste-<yyyyMMdd-HHmmss>-<6 hex>.png`; files older than 7 days (by mtime) are purged at app start | Owner decision. The agents read the file the moment the path is pasted, but a resumed conversation may reopen it within the week | y |
| Paste failure feedback | The pane shows a transient "Não foi possível colar" chip next to the existing "Copiado" chip and logs the error; nothing reaches the PTY | TCU-28 showed that a silent gesture is indistinguishable from a broken one. The chip reuses the existing element and timing (`COPIED_FEEDBACK_MS`) | n |
| Right-click paste uses the same path as Ctrl+V | Yes, both call one `pasteFromClipboard` | Two paste gestures with different capabilities would be a new bug. TCU-18 (empty clipboard, no byte) and TCU-27 (agent owns the mouse, so no paste) stay in force | y |
| A second paste while one is still in progress | Queued after the running one | Interleaving two path sequences would merge pieces inside the agent's 50 ms window | y |
| Cause-2 remedy | A "Reset terminal modes" button in the session detail bar that writes the resets to xterm locally and sends nothing to the PTY | No death signal exists (see Out of Scope). A local write cannot disturb the running shell | n |
| Cause-1 remedy | While the alternate screen is active, mouse-tracking and mouse-encoding DECRSTs are deferred, then applied when the alternate screen exits | A TUI that wants its mouse off for good leaves the alternate screen in the same breath (opencode, Claude Code). Deferring rather than dropping keeps a clean exit clean | n |
| Verification split | Pure seams unit-tested (mode tracker, clipboard classification, file-list parsing, paste plan, temp naming and purge selection, mouse-reset guard, probe decoding). Pane, preload and `index.ts` wiring hand-verified | TESTING.md: renderer components and thin Electron shells are not unit-tested; `src/renderer/src/lib/*` is | y |
| Implicit dimensions: auth, rate limits, idempotency | N/A for this scope | Local clipboard and filesystem only. No network, no permission boundary, and a repeated paste is a user action, not a retry | y |

**Open questions:** none - Q2 (which scroll cause) is logged above as a conditional-branch assumption, resolved by the probe task at Execute or earlier if the owner answers.

---

## User Stories

### P1: A debug probe identifies the scroll cause ⭐ MVP

**User Story**: As the owner, I want to switch on a mode-change log, reproduce the dead scroll and
read what happened, so that the fix targets the real cause and not a guess.

**Why P1**: Q2 is open, and the two candidate fixes contradict each other.

**Acceptance Criteria**:

1. WHERE `localStorage['playground.debug.terminalModes']` is `'1'`, WHEN xterm parses a DEC private mode set or reset (`CSI ? Pm h` / `CSI ? Pm l`) THEN the pane SHALL log one `console.debug` line prefixed `[term-modes]` carrying the session id, the raw params, the decoded mode names, and `mouseTrackingMode` and `buffer.active.type` after the sequence applies (TSP-01)
2. WHERE the debug flag is `'1'`, WHEN a Ctrl+C keydown is classified THEN the pane SHALL log one `[term-modes]` line carrying the classifier action (`copy-selection`, `swallow` or `pass`) and the current `mouseTrackingMode` and `buffer.active.type` (TSP-02)
3. WHERE the debug flag is `'1'`, WHEN the first `session:data` chunk after `sessions:attach` has been parsed THEN the pane SHALL log one `[term-modes] replay` line with the resulting `mouseTrackingMode`, `buffer.active.type` and `bracketedPasteMode` (TSP-03)
4. IF the debug flag is absent or not `'1'` when the pane mounts THEN the pane SHALL register no probe handler and emit zero `[term-modes]` lines (TSP-04)
5. The mode decoder SHALL map each DEC private param to a stable name: 9 `x10`, 1000 `vt200`, 1002 `drag`, 1003 `any`, 1004 `focus`, 1005 `utf8-mouse`, 1006 `sgr-mouse`, 1015 `urxvt-mouse`, 1016 `sgr-pixels`, 47, 1047 and 1049 `alt-screen`, 2004 `bracketed-paste`, 25 `cursor`, and any other number `?<n>` (TSP-05)

**Independent Test**: set the flag, open an opencode session, press Ctrl+C until scroll dies, and read
the console. A `?1003l`/`?1006l` with `alt` still active points to cause 1. `pass` followed by
prompt output with tracking still `any` on the normal buffer points to cause 2. A replay line with
`normal`/`none` right after a session switch points to cause 3.

---

### P1: Re-attach restores the terminal's modes ⭐ MVP

**User Story**: As a user switching between agent sessions, I want the session I come back to to
still scroll, click and paste like before, so that leaving a TUI for a minute does not break it.

**Why P1**: Deterministic loss, independent of Q2, and a prerequisite for bracketed paths.

**Acceptance Criteria**:

1. WHEN the ring buffer drops content from its head THEN it SHALL fold every tracked DEC private mode transition in the dropped content into a head-mode state (TSP-06)
2. WHEN `snapshot()` is called after content was dropped THEN it SHALL return the head-mode prefix followed by the retained content, where the prefix sets, via `ESC[?<n>h` or `ESC[?<n>l`, exactly the tracked modes whose head state differs from a fresh xterm (TSP-07)
3. The tracker SHALL model: alternate screen (47/1047/1049, emitted as 1049), mouse tracking protocol (9/1000/1002/1003, last set wins, any reset clears to none), mouse encoding (1005/1006/1015/1016, last set wins, any reset clears to default), focus events (1004), bracketed paste (2004) and cursor visibility (25, default visible) (TSP-08)
4. IF a mode sequence is split across two dropped segments THEN the tracker SHALL carry the partial bytes and apply the sequence once it completes (TSP-09)
5. WHEN nothing has been dropped since the buffer was created THEN `snapshot()` SHALL equal the retained content byte for byte (TSP-10)
6. The `tail()` preview SHALL never include the head-mode prefix (TSP-11)

**Independent Test**: unit, via a small `maxLines` buffer fed `ESC[?1049h ESC[?1003h ESC[?1006h ESC[?2004h`
followed by enough lines to trim them. The snapshot starts with those four sets. Manual check: switch
away from a busy opencode session and back, and the wheel still scrolls.

---

### P1: Ctrl+V pastes images ⭐ MVP

**User Story**: As a user with a screenshot on the clipboard, I want Ctrl+V in the terminal to attach
it in opencode or Claude Code, so that I don't have to save the file and type its path.

**Why P1**: Headline request. Dead today.

**Acceptance Criteria**:

1. WHEN Ctrl+V is pressed and the clipboard holds text THEN the pane SHALL paste that text with one `term.paste`, the same as today (TSP-12)
2. WHEN the clipboard holds both text and an image THEN the pane SHALL paste only the text (TSP-13)
3. WHEN Ctrl+V is pressed and the clipboard holds no text, no file list and a non-empty image THEN main SHALL write the image as PNG to `<os.tmpdir()>\playground-paste\paste-<yyyyMMdd-HHmmss>-<6 hex>.png` and the pane SHALL paste `"<that path>"` with one `term.paste` (TSP-14)
4. IF the clipboard holds no text, no file list and no image THEN the pane SHALL send zero bytes to the PTY (TSP-15)
5. IF writing the PNG or reading the file list fails, or the file-list read exceeds 5 s, THEN the pane SHALL send zero bytes to the PTY, log the error and show the "Não foi possível colar" chip for `COPIED_FEEDBACK_MS` (TSP-16)
6. WHEN Alt+V is pressed THEN the key classifier SHALL return `pass`, so xterm sends `ESC v` to the PTY unchanged (TSP-17)
7. WHEN the app starts THEN main SHALL delete every file in `<os.tmpdir()>\playground-paste\` whose mtime is more than 7 days old (TSP-18)
8. IF the paste directory is missing, or a single file cannot be deleted, THEN the purge SHALL skip it, continue with the rest and never block or fail startup (TSP-19)
9. WHEN the right-click paste branch fires (TCU-10..14, TCU-27 unchanged) THEN it SHALL use the same clipboard read and paste plan as Ctrl+V (TSP-20)

**Independent Test**: Win+Shift+S a region, then Ctrl+V in an opencode session and in a Claude Code
session. Each shows an attached image. Copy text from a browser page containing an image: only
the text pastes.

---

### P1: Ctrl+V pastes files copied in Explorer ⭐ MVP

**User Story**: As a user who copied files in Explorer, I want Ctrl+V to paste each file's path so
the agent can read or attach them.

**Why P1**: Same request, same gesture.

**Acceptance Criteria**:

1. WHEN Ctrl+V is pressed and the clipboard holds no text and a file list THEN the pane SHALL paste each path as `"<absolute path>"` with one `term.paste` per file, in clipboard order (TSP-21)
2. WHILE a multi-path paste is in progress, the pane SHALL wait `PASTE_GAP_MS` (100 ms) between consecutive `term.paste` calls (TSP-22)
3. WHEN a paste is requested while another paste sequence is still in progress THEN the new sequence SHALL start only after the running one sends its last path (TSP-23)
4. IF the pane unmounts, or its session changes, while a paste sequence is in progress THEN the remaining paths SHALL NOT be sent (TSP-24)

**Independent Test**: copy three files (one with a space in its name) in Explorer, then Ctrl+V in opencode.
Three quoted paths arrive, and an image among them is attached. In Claude Code, each image path attaches.

---

### P1: Dropping files on the terminal pastes their paths ⭐ MVP

**User Story**: As a user, I want to drag files from Explorer onto the terminal and have their paths
pasted, like Windows Terminal but in a form the agents recognize.

**Why P1**: Named in the request. Today a drop does nothing, or navigates the window away.

**Acceptance Criteria**:

1. WHEN one or more files are dropped on the terminal pane THEN the pane SHALL resolve each file's absolute path via `webUtils.getPathForFile` and paste them as TSP-21..24 specify, in drop order (TSP-25)
2. WHILE files are dragged over the terminal pane, the pane SHALL call `preventDefault` on `dragover` and `drop`, so the window never navigates to the dropped file (TSP-26)
3. IF a dropped item resolves to an empty path THEN the pane SHALL skip it, and IF no item resolves to a path THEN it SHALL send zero bytes (TSP-27)
4. WHEN a drop is handled THEN the terminal SHALL take keyboard focus (TSP-28)

**Independent Test**: drag two files onto an opencode session: two quoted paths arrive and the app window
stays on the Agents view. Drag a link from a browser: nothing is pasted.

---

### P2: Mouse tracking survives a stray reset under a live TUI (conditional: cause 1)

**User Story**: As a user in opencode, I want the wheel to keep scrolling after a Ctrl+C, even when
the console host announces a mouse-mode reset the TUI never asked for.

**Why P2**: Built only if the probe or Q2 confirms cause 1. Otherwise withdrawn.

**Acceptance Criteria**:

1. WHILE `buffer.active.type` is `alternate`, WHEN a DECRST for mouse tracking (9/1000/1002/1003) or mouse encoding (1005/1006/1015/1016) arrives THEN the pane SHALL leave xterm's mouse mode unchanged and record the reset as deferred (TSP-29)
2. WHEN the alternate screen is exited (DECRST 47/1047/1049) THEN the pane SHALL apply every deferred mouse reset after the exit, so the normal buffer ends with tracking `none` (TSP-30)
3. IF one DECRST mixes mouse and non-mouse params while the alternate screen is active THEN the non-mouse params SHALL still apply (TSP-31)
4. WHILE `buffer.active.type` is `normal`, the pane SHALL apply mouse DECRSTs immediately, as today (TSP-32)

**Independent Test**: unit on the guard. Manual: in opencode, Ctrl+C to clear the prompt several times,
then the wheel scrolls the conversation. Exit opencode, then moving the mouse over the pwsh prompt
prints nothing.

---

### P2: Manual reset of leftover terminal modes (conditional: cause 2)

**User Story**: As a user whose agent died and left the terminal in mouse mode, I want one click to
restore it, so that I don't have to stop and respawn the session.

**Why P2**: Built only if the probe or Q2 confirms cause 2. Otherwise withdrawn.

**Acceptance Criteria**:

1. WHEN the user clicks "Reset terminal modes" in the session detail bar THEN the pane SHALL write, to xterm only, resets for mouse tracking (9/1000/1002/1003), mouse encoding (1005/1006/1015/1016), focus events (1004) and bracketed paste (2004), then exit the alternate screen (1049) (TSP-33)
2. The reset action SHALL send zero bytes to the PTY (TSP-34)

**Independent Test**: after opencode is killed mid-session, clicking the button stops the escape garbage on
mouse movement, and the wheel scrolls pwsh's scrollback.

---

## Edge Cases

- WHEN the clipboard file list contains a directory THEN its path SHALL be pasted like a file's (TSP-21 applies; agents decide) (TSP-35)
- IF `GetFileDropList` output has blank lines or trailing CRLF THEN the parser SHALL ignore them (TSP-36)
- IF a path contains non-ASCII characters (e.g. `relatório.png`) THEN the pasted path SHALL match the original byte for byte (TSP-37)
- WHEN two images are pasted within the same second THEN the two PNG names SHALL differ (TSP-38)
- WHEN the purge runs, a file whose mtime is exactly 7 days old SHALL be kept, because only strictly older files are purged (TSP-39)
- WHILE the agent owns the mouse and nothing is selected, a right-click SHALL still reach the agent and not paste (TCU-27 preserved) (TSP-40)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TSP-01 | P1: Probe | Tasks | Pending |
| TSP-02 | P1: Probe | Tasks | Pending |
| TSP-03 | P1: Probe | Tasks | Pending |
| TSP-04 | P1: Probe | Tasks | Pending |
| TSP-05 | P1: Probe | Tasks | Pending |
| TSP-06 | P1: Replay modes | T3, T4 | Implementing |
| TSP-07 | P1: Replay modes | T3, T4 | Implementing |
| TSP-08 | P1: Replay modes | T3 | Implementing |
| TSP-09 | P1: Replay modes | T3 | Implementing |
| TSP-10 | P1: Replay modes | T4 | Implementing |
| TSP-11 | P1: Replay modes | T4 | Implementing |
| TSP-12 | P1: Image paste | T1, T5 | Implementing |
| TSP-13 | P1: Image paste | T5 | Implementing |
| TSP-14 | P1: Image paste | T2, T5 | Implementing |
| TSP-15 | P1: Image paste | T1, T5 | Implementing |
| TSP-16 | P1: Image paste | T5 | Implementing |
| TSP-17 | P1: Image paste | Tasks | Pending |
| TSP-18 | P1: Image paste | Tasks | Pending |
| TSP-19 | P1: Image paste | Tasks | Pending |
| TSP-20 | P1: Image paste | Tasks | Pending |
| TSP-21 | P1: File paste | T1, T5 | Implementing |
| TSP-22 | P1: File paste | T1 | Implementing |
| TSP-23 | P1: File paste | Tasks | Pending |
| TSP-24 | P1: File paste | Tasks | Pending |
| TSP-25 | P1: Drop | T2 | Implementing |
| TSP-26 | P1: Drop | Tasks | Pending |
| TSP-27 | P1: Drop | T1 | Implementing |
| TSP-28 | P1: Drop | Tasks | Pending |
| TSP-29 | P2: Cause-1 guard (conditional) | Tasks | Pending |
| TSP-30 | P2: Cause-1 guard (conditional) | Tasks | Pending |
| TSP-31 | P2: Cause-1 guard (conditional) | Tasks | Pending |
| TSP-32 | P2: Cause-1 guard (conditional) | Tasks | Pending |
| TSP-33 | P2: Cause-2 reset (conditional) | Tasks | Pending |
| TSP-34 | P2: Cause-2 reset (conditional) | Tasks | Pending |
| TSP-35 | Edge | T5 | Implementing |
| TSP-36 | Edge | T5 | Implementing |
| TSP-37 | Edge | T1 | Implementing |
| TSP-38 | Edge | T5 | Implementing |
| TSP-39 | Edge | Tasks | Pending |
| TSP-40 | Edge | Tasks | Pending |

**Coverage:** 40 total (6 conditional), 40 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] The owner identifies the scroll cause from one probe session, with no further instrumentation
- [ ] After the confirmed fix, 10 consecutive Ctrl+C presses in opencode leave the wheel scrolling
- [ ] Switching away from and back to a running opencode session 10 times never loses wheel scrolling or bracketed paste
- [ ] A screenshot pasted with Ctrl+V attaches in both opencode and Claude Code on the first try
- [ ] Three files copied in Explorer, or dropped on the pane, arrive as three recognized paths in both agents
