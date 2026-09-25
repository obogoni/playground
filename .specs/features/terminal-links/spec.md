# Terminal Links Specification

## Problem Statement

Agents print URLs and file paths all day — the ADO work item they are working on, a PR they
opened, the file and line they just edited — and in the embedded terminal every one of them is
dead text. The user selects it, copies it, and pastes it into a browser or an editor; in Orca,
Windows Terminal and VS Code the same output is a Ctrl+click away. The terminal pane mounts
xterm.js with no link provider at all: no addon, no `linkHandler`, no `registerLinkProvider`.

## Goals

- [ ] Ctrl+click on an `http(s)` URL printed by the agent opens it in the default browser
- [ ] Ctrl+click on a file path printed by the agent opens the file with its Windows default app
- [ ] The agent keeps the mouse for everything that is not a Ctrl+click on a link

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Single-click activation / an action popover on click | Chosen gesture is Ctrl+click. A plain click must keep reaching the agent's TUI, and deciding "link action or mouse report" requires deferring PTY input (Orca's `terminal-link-pty-mouse-suppression.ts`) — deferred |
| Shift+Ctrl+click alternate destination | One gesture, one destination in v1 (owner decision) |
| Opening a file in VS Code at `:line:col` (`code -g`) | The owner chose the OS default app as the destination; a default-app launch cannot carry a line. The suffix is still parsed so it does not break detection |
| Tooltip with the resolved destination | Declined by the owner; underline on hover is the only affordance |
| MSBuild / `dotnet` form `Foo.cs(40,12)` | Not selected in discussion; separate form with its own parsing |
| Bare filenames without a separator (`Foo.cs`, `package.json`) | Not selected; VS Code's word-link detector costs an existence check per candidate word |
| Hard-wrapped links (a URL or path the TUI re-drew across rows without xterm's wrap flag) | Orca carries ~700 lines of heuristics for this; soft-wrapped lines (xterm's `isWrapped`) are covered |
| Live cwd via OSC 7 | Agents do not `cd`; PowerShell does not emit OSC 7 by default. Relative paths resolve against the session's initial cwd |
| Schemes other than `http`/`https`/`file` (`mailto:`, `vscode://`, `ms-teams:`…) | `shell.openExternal` with an arbitrary scheme launches applications; the main process accepts only `http`/`https`, and `file` only as an OSC 8 target (amendment 2026-09-19) |
| `file://` URIs in plain text | Never in scope. The OSC 8 form was withdrawn at Design (LINK-21) and **reinstated by the 2026-09-19 amendment**: Claude Code emits it for every path it prints once `FORCE_HYPERLINK` is set (LINK-33) |
| Persistent styling of plain-text links (colour, always-on underline) | The dashed underline and the blue the owner saw in Orca are the agent's own OSC 8 + SGR colour rendered by xterm, not a terminal feature; Orca's plain-text provider is hover-only like ours |
| UNC paths (`\\server\share\…`) | Not requested; existence probing over the network on hover is a latency hazard |
| Remote / WSL / SSH path mapping | Playground is local-only (AD-005) |
| Upgrading `@xterm/xterm` past 6.0.0 | Same rationale as every previous terminal feature; `mouseEventsRequireAlt` (6.1) is replaced by a capture-phase `stopPropagation` the pane already uses for right-click |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| A path is a link only when it exists on disk | Existence checked in main per resolved absolute path, cached per pane | No false positives in prose (`a/b`); Orca and VS Code do the same. Cost is one IPC per new candidate per pane, amortized by the cache | y |
| Relative paths resolve against the session's initial cwd | `SessionView.cwd` | Static, already on the session; agents do not change directory | y |
| Recognized path shapes | Separator paths with optional `:line[:col]`; spaced paths | Owner selection. `~/` resolves to the user's home directory | y |
| Spaced-path bounding | Candidate runs from a path start (`X:\`, `\`, `/`, `./`, `../`, `~/`) to the last extension-terminated token before end of line or closing punctuation; the longest candidate that exists wins | Spaces are ambiguous in prose; existence is the only reliable disambiguator, so the parser stays broad and the probe decides | y |
| File destination is the Windows default app | `shell.openPath`; when Windows reports no association, show the native "Open with" chooser (`rundll32 shell32.dll,OpenAs_RunDLL`) | Owner: "se não houver app padrão para abrir o arquivo, abrir janela para escolher onde abrir" | y |
| Directory paths open in File Explorer | Existing `explorer.exe` launcher | A directory has no line and no editor; the tree's launcher already does this | y |
| Executable files are opened like any other file | No block list | Owner decision with the risk stated: a Ctrl+click on a `.ps1`/`.cmd`/`.exe` the agent printed runs it through the OS association. Orca does not block either | y |
| `:line:col` is parsed but not delivered | Strip before probing/opening; do not pass to the app | Default-app launch has no argument channel for it. Recorded in Out of Scope | y |
| Only `http`/`https` open in the browser, validated in main | Main rejects any other scheme before `shell.openExternal` | The renderer is not trusted with the scheme decision (same split as Orca's `shell:openUrl`) | y |
| ~~OSC 8 `file://` targets route as files~~ Withdrawn at Design, **reinstated 2026-09-19** | `linkHandler.allowNonHttpProtocols` is `true`; the pane classifies the hovered OSC 8 target by scheme (`http(s)` → browser, `file` → path rules, anything else → not openable) and main converts the `file://` URL to a path | The all-or-nothing gate is accepted: every OSC 8 cell already carries xterm's dashed underline, so a hover underline on `mailto:` adds nothing the user did not already see. Orca sets the same option. The trigger was seeing Claude Code emit `file:///C:/…` for every path in its tool headers once `FORCE_HYPERLINK` is set (LINK-33) | y |
| The provider reads the buffer that is active **at each call** | `activeBufferOf(term)` delegates `getLine`/`getNullCell` to `term.buffer.active` on every access | `term.buffer.active` is a getter; the first delivery captured it once at pane creation, so a TUI in the alternate screen (Claude Code 2.1.278 uses `?1049h`) left both hover and Ctrl+click reading the empty normal buffer — reproduced 2026-09-19 (LINK-32). Orca's provider reads `terminal.buffer.active` per call | y |
| `FORCE_HYPERLINK=1` is forced into every session's environment | Alongside `TERM`/`COLORTERM` in `PTY_ENV_FORCED`; `TERM_PROGRAM` stays unclaimed | It is the `supports-hyperlinks` convention Claude Code's binary checks **before** `TERM_PROGRAM` (`if (FORCE_HYPERLINK) return …`), so the CSI-u reason for not claiming `TERM_PROGRAM` is untouched. Orca forces the same variable (`TERM_PROGRAM=Orca` too). Any other CLI honouring it emits OSC 8 that xterm renders harmlessly | y |
| Plain click must not open an OSC 8 link | `linkHandler.activate` is a no-op; every activation goes through the Ctrl gesture | Today xterm's default OSC 8 handler opens `http` links on a plain click (`window.open` → `setWindowOpenHandler` → `shell.openExternal`), so LINK-16 needs the handler replaced, not just added | y |
| The "Open with" chooser is launched explicitly | Main checks the association (`cmd /c assoc .ext`) and runs `rundll32 shell32.dll,OpenAs_RunDLL <path>` when there is none | On Windows 11 `shell.openPath` no-ops on an unassociated file and shows nothing ([electron#36605](https://github.com/electron/electron/issues/36605), closed not planned) | y |
| A path candidate not yet probed at Ctrl+`mousedown` is intercepted | Probe, then open on `mouseup` if it exists; a miss swallows that one click and is cached | First-click reliability (LINK-19) is worth one lost Ctrl+click on prose that looked like a path (owner decision at Design) | y |
| xterm's static OSC 8 decoration is out of our hands | Every OSC 8 cell keeps xterm's own **dashed** underline (`AttributeData.underlineStyle` → `DASHED` whenever `urlId` is set; class `xterm-underline-5`), `https`, `file` and `mailto:` alike. Since the amendment, the hover underline/pointer applies to every OSC 8 target too; LINK-22 now governs **opening** only | Measured in the owner smoke (rows 20–21) and re-measured 2026-09-19 with `FORCE_HYPERLINK`: Claude Code's `Write(C:\…)` header is dashed in the default colour, its markdown link is dashed + `blueBright` (SGR 12) — the "Orca look" is the agent's output | y |
| Parentheses inside a URL | The ported addon regex stops a URL at `(`; `https://en.wikipedia.org/wiki/Foo_(bar)` links as `…/Foo_` (Verifier finding). LINK-23 covers the **unmatched** trailing bracket only; balanced ones are upstream xterm behavior, unchanged | Matching upstream keeps the port faithful; paths do balance brackets (`trimPathTail`). Revisit if Wikipedia-style URLs show up in agent output | y |
| No tooltip | Underline on hover only | Owner declined; the bottom-left position answer is void without it (kept in context.md) | y |
| Ctrl+click outside a link is untouched | Only a Ctrl+`mousedown` **over a link** is intercepted | The agent owns every other gesture (TCU-27 precedent) | y |
| Ctrl+drag does not open | Activation requires `mouseup` on the same link with < 4 px of movement since `mousedown` | Orca's `DRAG_THRESHOLD_PX`; avoids opening on a sloppy selection attempt | y |
| First-click reliability | The pane runs its own synchronous hit test at Ctrl+`mousedown` (cell from `.xterm-screen` geometry + the same detection the provider uses), independent of xterm's hover state | xterm resolves links only on `mousemove`; Orca primes the linkifier through private API (`terminal-linkifier-click-priming.ts`), which 6.0.0 stays clear of (Design approach B) | y |
| Failures surface a toast | `onToast` reaches `TerminalPane`; message names the target | Same channel as the worktree launchers (`WorktreeDetail.launch`) | y |
| Existence probe failure = not a link | An IPC error or a rejected probe yields "does not exist" | Best-effort detection; never block or crash the pane | y |
| Stale probe results are discarded | A probe result is applied only if the row's text is unchanged since the probe started | TUIs redraw rows constantly; Orca fingerprints the logical line for this reason | y |
| Existence cache lifetime | Per `TerminalPane` mount (per session); dropped with the terminal | A path created after a negative probe stays unlinked until the session is switched — accepted; matches Orca's per-pane cache | y |
| Verification split | Unit tests for the detection/resolution lib and the main-side handlers; the `TerminalPane` wiring is hand-verified | Repo convention: `src/renderer/src/lib/*` and `src/main/*` are the tested seams; renderer components have no unit tests | y |
| Branch and base | `feature/terminal-links` from `main` at `6ecd19c` | Fork synced to upstream on 2026-09-18. Upstream PR #95 (`terminal-scroll-paste`) also edits `TerminalPane.tsx` — rebase if it lands first | y |
| ~~OSC 8 emission by the agents is unverified~~ **Verified 2026-09-19** | Claude Code 2.1.278 emits OSC 8 **only** when its hyperlink check passes: `FORCE_HYPERLINK` (any value but `0`), `TERM_PROGRAM` in its list (`ghostty`, `Hyper`, `kitty`, `alacritty`, `iTerm.app`, `iTerm2`) or the other `supports-hyperlinks` signals. Without it every path and URL is plain text — which is why the first delivery never saw one | Read in the binary and measured live: with `FORCE_HYPERLINK=1` the `Write(...)` header carries `file:///C:/Users/MAUROP%7E1/…/hyperlink-probe.txt` and a markdown link carries its `https://` target | y |
| Remaining implicit dimensions (auth, rate limits, idempotency, data lifecycle beyond the cache) | N/A for this scope | Single-user local desktop; a double Ctrl+click opens the target twice and the OS focuses the existing window | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Ctrl+click opens a URL in the browser ⭐ MVP

**User Story**: As a developer watching an agent, I want to Ctrl+click the URL it printed (ADO
work item, PR, docs) so that it opens in my browser without select-copy-paste.

**Why P1**: The most frequent link the agents print; the whole feature is pointless without it.

**Acceptance Criteria**:

1. WHEN the pointer is over an `http://` or `https://` URL in the terminal THEN the app SHALL
   underline the URL for as long as the pointer stays over it. `LINK-01`
2. WHEN the user presses and releases the primary button over a URL with Ctrl held, moving less
   than 4 px in between, THEN the app SHALL open that URL with the OS default browser. `LINK-02`
3. WHEN a URL is soft-wrapped across terminal rows (xterm's wrap flag) THEN the app SHALL treat
   the whole wrapped text as one link and open the complete URL. `LINK-03`
4. WHEN the main process receives a URL to open whose scheme is not `http` or `https` THEN it
   SHALL NOT call `shell.openExternal` and SHALL report the refusal to the renderer. `LINK-04`
5. IF opening the URL fails (refused scheme, `shell.openExternal` error) THEN the app SHALL show
   a toast naming the URL and SHALL leave the terminal and the PTY untouched. `LINK-05`

**Independent Test**: In a running session, `echo https://dev.azure.com/x/y/_workitems/edit/123`
→ hover underlines it → Ctrl+click opens the browser on that item. `echo mailto:a@b.c` stays
plain text.

---

### P1: Ctrl+click opens a file path with its default app ⭐ MVP

**User Story**: As a developer, I want to Ctrl+click the file path an agent printed
(`src/main/foo.ts:42`, `E:\Repos\X\Foo.cs`) so that it opens in the app Windows associates with
that file.

**Why P1**: The second thing agents print constantly; the reason the user reaches for Orca.

**Acceptance Criteria**:

1. WHEN a row contains text shaped like a path with at least one separator, optionally followed by
   `:line` or `:line:col`, AND the path resolved against the session cwd exists on disk THEN the
   app SHALL underline the path text (suffix included) on hover. `LINK-06`
2. WHEN such a candidate does not exist on disk THEN the app SHALL NOT underline it, and once its
   non-existence is known (probed) a Ctrl+click on it SHALL reach xterm as an ordinary click.
   `LINK-07`
3. WHEN a candidate contains spaces (`E:\Meus Docs\a.txt`) THEN the app SHALL probe the candidates
   from the path start to each extension-terminated token and SHALL link the longest one that
   exists. `LINK-08`
4. WHEN the user Ctrl+clicks (per the < 4 px rule) a linked **file** THEN the app SHALL open it
   with the Windows default app for its extension. `LINK-09`
5. WHEN the file's extension has no Windows association THEN the app SHALL show the native
   "Open with" chooser for that file. `LINK-10`
6. WHEN the user Ctrl+clicks a linked **directory** THEN the app SHALL open it in File Explorer.
   `LINK-11`
7. WHEN a relative path is resolved THEN the base SHALL be the session's `cwd`; `~/` SHALL resolve
   to the user's home directory; a `:line[:col]` suffix SHALL be stripped before resolution and
   never passed to the app. `LINK-12`
8. IF opening fails (path vanished, `openPath` error, chooser could not launch) THEN the app SHALL
   show a toast naming the path. `LINK-13`

**Independent Test**: With a session in a worktree, `echo src/main/index.ts:10` → underlined →
Ctrl+click opens it in the associated editor; `echo src/main/nope.ts` stays plain; `echo .`
underlined → Ctrl+click opens Explorer on the worktree.

---

### P1: The agent keeps the mouse ⭐ MVP

**User Story**: As a developer running Claude Code or opencode (mouse-tracking TUIs), I want link
activation to be invisible to the agent so that a Ctrl+click never becomes a stray mouse report,
and every other gesture keeps working as today.

**Why P1**: Without this, opening a link also clicks inside the agent's UI — the exact
regression TCU-27 guarded against.

**Acceptance Criteria**:

1. WHEN the user Ctrl+presses the primary button over a link THEN the app SHALL stop the event
   before xterm sees it, so no mouse report is written to the PTY for that press or its release.
   `LINK-14`
2. WHEN the user Ctrl+presses the primary button **not** over a link THEN the app SHALL leave
   the event untouched (it reaches xterm and, with mouse tracking on, the agent). `LINK-15`
3. WHEN the user clicks a link **without** Ctrl THEN the app SHALL do nothing link-related; the
   click reaches xterm as today. `LINK-16`
4. WHEN the user Ctrl+presses over a link and moves 4 px or more before releasing THEN the app
   SHALL NOT open the link. `LINK-17`
5. WHEN the window loses focus while a Ctrl gesture is pending THEN the app SHALL forget the
   pending gesture. `LINK-18`
6. WHEN the pointer has not moved since new output was painted under it and the user
   Ctrl+clicks THEN the app SHALL still resolve and open the link under the pointer (first-click
   reliability). A path candidate not yet probed at that instant SHALL be intercepted and probed;
   if it turns out not to exist, that one click is swallowed and the result cached. `LINK-19`

**Independent Test**: In Claude Code with mouse tracking on, Ctrl+click a URL: the browser
opens and Claude's input shows no stray characters or cursor jump. Ctrl+click empty space:
behavior identical to before the feature. Shift+drag still selects.

---

### P2: Explicit OSC 8 hyperlinks

**User Story**: As a developer, I want a hyperlink an agent emits explicitly (OSC 8 escape) to
open with the same Ctrl+click so that tools which already mark their links work without the
text-scanning heuristics.

**Why P2**: Cheap to wire (`terminal.options.linkHandler`) and correct by construction. At the
first delivery no agent had been observed emitting OSC 8 on Windows; the 2026-09-19 amendment
found why (Claude Code gates it on `FORCE_HYPERLINK`, LINK-33) and made it the main path.

**Acceptance Criteria**:

1. WHEN the buffer contains an OSC 8 hyperlink with an `http`/`https` target THEN Ctrl+click on
   its text SHALL open the target per LINK-02/04/05, regardless of what the visible text is.
   `LINK-20`
2. WHEN the OSC 8 target is a `file://` URI THEN Ctrl+click on its text SHALL convert it to a
   local path in main (`file:///C:/dir/a.txt` → `C:\dir\a.txt`; a `#L10C5` fragment or a
   `:line:col` suffix is dropped, LINK-09) and apply the file rules of LINK-09..13, regardless
   of what the visible text is. A `file://` URL with a host other than empty or `localhost`
   (a UNC form) SHALL be refused with a toast, not opened. `LINK-21` (withdrawn at Design,
   **reinstated 2026-09-19**)
3. WHEN the OSC 8 target has any scheme other than `http`/`https`/`file` THEN the app SHALL NOT
   open it: Ctrl+click passes through as an ordinary click and nothing is launched. (xterm's
   hover underline and pointer cursor apply to every OSC 8 target once `allowNonHttpProtocols`
   is on — accepted, see Assumptions.) `LINK-22` (amended 2026-09-19)

**Independent Test**: `printf '\e]8;;https://example.com\e\\click me\e]8;;\e\\'` → "click me"
underlines on hover and Ctrl+click opens example.com. In a Claude Code session, the path in a
`Write(C:\…\x.txt)` header is dashed; Ctrl+click opens the file.

---

## Edge Cases

- WHEN a URL ends with `.`, `,`, `;`, `:` or an unmatched `)` / `]` THEN the app SHALL exclude
  that trailing character from the link. <!-- event-driven --> `LINK-23`
- IF the existence probe for a row fails (IPC error, rejected promise) THEN the app SHALL treat
  every candidate on that row as non-existent and SHALL NOT throw. <!-- unwanted-behavior -->
  `LINK-24`
- IF a probe result arrives after the row's text has changed THEN the app SHALL discard it and
  SHALL NOT link the stale text. <!-- unwanted-behavior --> `LINK-25`
- WHEN the same resolved path is encountered again in the same pane THEN the app SHALL reuse the
  cached existence answer instead of probing again. <!-- event-driven --> `LINK-26`
- WHEN the terminal is disposed (session switch, unmount) THEN the app SHALL dispose every link
  provider, listener and the cache with it. <!-- event-driven --> `LINK-27`
- WHEN a link sits in the scrollback (above the viewport's top at output time) THEN hover and
  Ctrl+click SHALL work the same as in the live rows. <!-- ubiquitous --> `LINK-28`
- IF the main process receives a path that is not absolute after resolution THEN it SHALL report
  "does not exist" and SHALL NOT probe or open it. <!-- unwanted-behavior --> `LINK-29`
- The app SHALL never open a target on `mousedown`; activation happens on `mouseup` only.
  <!-- ubiquitous --> `LINK-30`
- WHEN a candidate path is an executable (`.exe`, `.cmd`, `.ps1`, …) THEN the app SHALL treat it
  like any file (owner decision; see Assumptions). <!-- ubiquitous --> `LINK-31`
- WHEN the agent switches to the alternate screen buffer after the pane was created (a TUI's
  `?1049h`, as Claude Code does) THEN hover and Ctrl+click SHALL detect links in the rows of the
  buffer that is active at that moment — the alternate one while it is shown, the normal one
  again after `?1049l`. <!-- ubiquitous --> `LINK-32` (amendment 2026-09-19)
- The app SHALL launch every agent session with `FORCE_HYPERLINK=1` in its environment, in
  addition to `TERM` and `COLORTERM`, and SHALL still not claim a `TERM_PROGRAM`, so that a
  hyperlink-aware CLI (Claude Code) emits OSC 8 for the paths and URLs it prints and the pane
  shows them with xterm's dashed underline. <!-- ubiquitous --> `LINK-33` (amendment
  2026-09-19)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| LINK-01 | P1: URL | Execute | Verified |
| LINK-02 | P1: URL | Execute | Verified |
| LINK-03 | P1: URL | Execute | Verified |
| LINK-04 | P1: URL | Execute | Verified |
| LINK-05 | P1: URL | Execute | Verified |
| LINK-06 | P1: File | Execute | Verified |
| LINK-07 | P1: File | Execute | Verified |
| LINK-08 | P1: File | Execute | Verified |
| LINK-09 | P1: File | Execute | Verified |
| LINK-10 | P1: File | Execute | Verified |
| LINK-11 | P1: File | Execute | Verified |
| LINK-12 | P1: File | Execute | Verified |
| LINK-13 | P1: File | Execute | Verified |
| LINK-14 | P1: Mouse | Execute | Verified |
| LINK-15 | P1: Mouse | Execute | Verified |
| LINK-16 | P1: Mouse | Execute | Verified |
| LINK-17 | P1: Mouse | Execute | Verified |
| LINK-18 | P1: Mouse | Execute | Verified |
| LINK-19 | P1: Mouse | Execute | Verified |
| LINK-20 | P2: OSC 8 | Execute | Verified |
| LINK-21 | P2: OSC 8 | Execute (amendment) | Verified (reinstated 2026-09-19) |
| LINK-22 | P2: OSC 8 | Execute (amendment) | Verified (amended 2026-09-19) |
| LINK-23 | Edge | - | Verified |
| LINK-24 | Edge | - | Verified |
| LINK-25 | Edge | - | Verified |
| LINK-26 | Edge | - | Verified |
| LINK-27 | Edge | - | Verified |
| LINK-28 | Edge | - | Verified |
| LINK-29 | Edge | - | Verified |
| LINK-30 | Edge | - | Verified |
| LINK-31 | Edge | - | Verified |
| LINK-32 | Edge (amendment) | Execute (amendment) | Verified |
| LINK-33 | Edge (amendment) | Execute (amendment) | Verified |

**ID format:** `LINK-[NUMBER]`

**Coverage:** 33 active (LINK-21 reinstated 2026-09-19), 33 mapped to tasks (`tasks.md` §Requirement → Task Coverage), 33 verified (`validation.md`; the amendment's LINK-21/22/32/33 in passes 3–4, 2026-09-24)

---

## Success Criteria

- [ ] An ADO work-item URL printed by Claude Code opens in the browser with one Ctrl+click, and
      Claude's input box shows no trace of the click
- [ ] `src/main/index.ts:10` printed in a worktree session opens the file in its associated app
      with one Ctrl+click; `src/main/nope.ts` is not underlined
- [ ] A `.txt` with no association shows the Windows "Open with" chooser
- [ ] `echo .` → Ctrl+click opens Explorer on the worktree
- [ ] Shift+drag selection, right-click copy/paste and plain clicks behave exactly as before
      (TCU suite still green)
- [x] In a live Claude Code session (alternate screen, mouse tracking on): the path in a
      `Write(...)` header shows dashed, hover underlines it and Ctrl+click opens the file; a
      markdown link shows blue + dashed and Ctrl+click opens the browser (amendment 2026-09-19)
