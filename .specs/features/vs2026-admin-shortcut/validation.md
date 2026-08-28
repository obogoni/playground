# VS 2026 (Admin) Shortcut — Validation Report

**Verdict:** **PASS** — VS26-01, VS26-02 (discovery), VS26-03 and VS26-05 verified by executed
evidence; VS26-04 partially verified (its board-footer smoke block has not yet run). Two gates remain,
listed below. Updated 2026-08-28 after the owner ran the smoke script and confirmed the colours.
**Diff range:** `origin/main..HEAD` = `9d825d6..64eb192` (8 commits, 12 files, +780 / −51)
**Gates:** `npm run typecheck` clean · `npm run lint` **0 errors** / 18 warnings (baseline
unchanged, none in changed files) · `npx vitest run` **617 passed / 1 failed**

The single failure is `worktree-manager.test.ts > removeWorktree > force-removes a worktree with
mixed dirt and reports each change` — the **pre-existing** baseline failure recorded in STATE.md
before this branch existed. It was confirmed present on this branch's base commit before any code
was written. Test count moved 605 → 617 (+12 new).

> **Independence caveat, recorded not buried.** The skill mandates a fresh Verifier sub-agent
> (author ≠ verifier). This harness is configured without sub-agents, so this is the skill's
> **standalone fresh-eyes fallback**, performed by the same agent that wrote the code. **Author ≠
> verifier is therefore UNMET**, exactly as it was for AD-015. The compensating control is the
> mutation sensor below, which is adversarial rather than self-attesting — and it did in fact catch
> a real gap the author had missed (see Sensor).

---

## Per-AC evidence

Legend: **V** = verified by executed evidence · **C** = code-verified (change is present and
correct by inspection, but no test executed it) · **O** = owner-run gate outstanding.

### VS26-01 — Detail-pane card

| AC | Status | Evidence |
| -- | ------ | -------- |
| 01.1 five cards in order, label/command/icon/badge | **V** | **Executed** on the owner's machine 2026-08-28: smoke reported `five launcher cards render` with the exact ordered payload `File Explorer/explorer.exe, Windows Terminal/wt.exe, VS Code/code, Visual Studio 2022/devenv.exe, Visual Studio 2026/devenv.exe`, and the labels/commands check passed. |
| 01.2 distinct token; badge matches its own tile | **V** | **Executed**: smoke passed both `VS 2022 card marked elevated (amber)` and `VS 2026 card marked elevated with its own tint`, each returning `{tile:true, admin:"admin"}` — so the two cards resolve *different* tint classes at runtime, not just in source. Owner confirmed the colours read correctly in the app (2026-08-28). |
| 01.3 3 + 2 grid stays correct | **O** | Requires a visual pass. The grid is `repeat(3, 1fr)` and was not modified, so a 5th card wraps to a 2-item row — plausible but **not observed**. |
| 01.4 empty state unchanged | **C** | The `worktree`-null early return is untouched. |

### VS26-02 — Elevated launch

| AC | Status | Evidence |
| -- | ------ | -------- |
| 02.1 vswhere `[18.0,19.0)`, no `-prerelease` | **V** | Unit: `buildVswhereArgs` returns the exact vector; a loop asserts **no** edition ever emits `-prerelease`. **Plus executed on the real machine**: `vswhere -latest -version "[18.0,19.0)" -property productPath` → `C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\IDE\devenv.exe`. |
| 02.2 elevated Open Folder via `Start-Process -Verb RunAs` | **C / O** | `buildElevatedOpen` is shared verbatim with 2022 and its 3 tests pass unmodified. Actual UAC elevation is **owner-run** (O) — it cannot run headless. |
| 02.3 spaces / non-ASCII / single quote | **V** | The 3 pre-existing `buildElevatedOpen` tests (incl. `Configuração de ambiente` and `o'brien`) pass unmodified; 2026 uses the identical helper. |
| 02.4 stale `productPath` treated as not-found | **C** | The `existsSync(devenv)` guard is retained in `resolveDevenv`. **Gap:** not directly unit-tested — `resolveDevenv` is unexported and hits the filesystem. |
| 02.5 no toast on success | **C** | Unchanged `{ ok: true }` path. |

### VS26-03 — Coexistence (the defining constraint)

| AC | Status | Evidence |
| -- | ------ | -------- |
| 03.1 each card resolves its own major | **V** | Unit: 17.14 → `vs2022` only, 18.4 → `vs2026` only. **Plus executed on the real machine**: the two ranges returned the `\2022\` and the `\18\` devenv respectively. |
| 03.2 ranges disjoint | **V** | Asserted as an interval property — ranges parsed to numeric bounds, non-overlap checked. Deliberately *not* string inequality, which would pass for two overlapping ranges. |
| 03.3 no fallback when one version is absent | **C** | Follows from 03.2 + 03.4: each query is range-scoped with no shared "latest VS" call, so an absent version yields null rather than the other. Not executed — would require uninstalling a VS. Negative control run instead: neither range reaches the machine's VS 2019 (16.7) install. |
| 03.4 range derived from the tool, no mutable state | **V** | Unit: `buildVswhereArgs` purity (interleaved calls independent) **and** the routing tests below. |
| 03.5 every pre-existing VSAD test passes unmodified | **V** | `git diff origin/main -- shortcut-launcher.test.ts` shows exactly **one** deletion — the import line. All 6 original assertions are byte-identical and green. |

### VS26-04 — Board card button

| AC | Status | Evidence |
| -- | ------ | -------- |
| 04.1 button after 2022, own token, tooltip | **C** | `BoardView.tsx:374-381`. The smoke assertion exists but **still has not executed** — the run crashed before reaching the board block (see Gates). |
| 04.2 dispatches `tool: 'vs2026'` | **C** | `onClick={() => launch('vs2026')}` through the same `shortcuts:launch` channel; the IPC contract widened via `ShortcutTool`. |
| 04.3 footer layout survives a 5th button | **O** | Visual pass required. |
| 04.4 distinguishable by colour alone | **V** | Owner-confirmed 2026-08-28 ("color themes for shortcuts are ok"). |

### VS26-05 — Failure feedback

| AC | Status | Evidence |
| -- | ------ | -------- |
| 05.1 not-installed names 2026 | **V** | `vsFailureMessages` unit test pins all three 2026 strings. |
| 05.2 UAC-declined names 2026 | **V** (message) / **O** (real UAC) | Message pinned; the real decline path is owner-run. |
| 05.3 vanished path names 2026 | **V** | Executed end-to-end through `launcher.launch('vs2026', <missing>)` — returns the 2026 message with no spawn. |
| 05.4 no toast on success | **C** | Unchanged. |
| 05.5 2022 wording untouched | **V** | 2022's three strings pinned verbatim; a cross-check asserts no 2022 message contains "2026" and vice versa. |

**Coverage:** 5 requirements — **VS26-01, VS26-02, VS26-03, VS26-05 verified** by executed
tests, executed CDP smoke and real-machine vswhere evidence. **VS26-04 partially verified**: its
colour-distinguishability AC is owner-confirmed, but the board-footer rendering assertions have not
run because the smoke script aborts before that block on an unseeded workspace (see Gates).

---

## Discrimination sensor

Five behaviour-level mutations injected into `shortcut-launcher.ts`, each reverted immediately
(`git status` clean after each round; the production file was restored from a snapshot every time).

| # | Mutation | Result |
| - | -------- | ------ |
| M1 | `vs2026` given the 2022 range `[17.0,18.0)` | **Killed** — 4 tests failed |
| M2 | `-prerelease` added to the argument vector | **Killed** — 2 tests failed |
| M3 | Both editions collapsed to the label "Visual Studio 2022" | **Killed** — 3 tests failed |
| M4 | `launch()` routes **both** VS tools to `VS_EDITIONS.vs2022` | **SURVIVED** → fixed → now killed |
| M5 | `openVisualStudio` ignores its `edition` argument | **SURVIVED** → fixed → now killed |

**Final: 5 / 5 killed.**

**M4 and M5 are the finding of this pass.** Both meant the 2026 card would silently open Visual
Studio **2022** while the entire suite stayed green — precisely the failure VS26-03 exists to
prevent, and invisible to the data-level tests because those covered the `VS_EDITIONS` table but
never the wiring from tool to edition. Fixed in `64eb192` by launching against a path that cannot
exist: `openVisualStudio`'s vanished-path guard returns before vswhere or any spawn, so routing is
assertable without popping UAC, and the message names whichever edition the tool actually resolved.

**Not mutated:** the renderer (`WorktreeDetail.tsx`, `BoardView.tsx`) and CSS. The project has no
renderer unit tests by convention (PRD §Testing Decisions), so every renderer mutant would survive
by construction. That is why VS26-01 and VS26-04 rest on the owner-run smoke rather than on this
sensor — stated as a limitation, not scored as a pass.

---

## Owner-run gates — status

### 1. CDP smoke — RUN 2026-08-28, partially completed

`node scripts/smoke-shortcuts.mjs` was run by the owner against a live app. **Every assertion this
feature added, passed:**

```
PASS  five launcher cards render — [... "Visual Studio 2022"/devenv.exe, "Visual Studio 2026"/devenv.exe]
PASS  card labels and commands per §1b + VS 2022/2026 (VSAD-01, VS26-01)
PASS  VS 2022 card marked elevated (amber)   — {"tile":true,"admin":"admin"}
PASS  VS 2026 card marked elevated with its own tint (VS26-01) — {"tile":true,"admin":"admin"}
```

Both VS cards resolved **different** tint classes at runtime, which is the coexistence property
stated in VS26-01.2 rather than merely the presence of a CSS rule.

**The run then aborted before the board block, so VS26-04.1/04.2 remain unexecuted.** The cause is
pre-existing and unrelated to this feature: the first check, `seeded workspace with sibling
worktrees present`, **FAILED** (no `wtm-smoke-*` workspace with repo `api` + worktree
`api-feature-42` on disk), but the script only `check()`s the seed and keeps going, so `sibling`
stayed `undefined` and it threw `TypeError: Cannot read properties of undefined (reading 'path')`
at line 156 — roughly 80 lines later, in code this branch never touched (`git diff origin/main`
shows no `sibling` lines added or removed).

**Follow-up worth doing:** make the script exit immediately when the seed check fails, so the
failure reads as "seed the workspace first" instead of an unrelated `TypeError` far downstream.
Note also that completing a full run has real side effects — it opens Explorer/Terminal/VS Code
windows and `rmSync`s a worktree directory, the latter sitting on the known non-ASCII-path no-op.

### 2. Elevation pass — STILL OUTSTANDING

Click "Visual Studio 2026" on a real worktree, accept UAC, confirm the title bar shows
"Administrator" and Help > About reports **18.x**; then click "Visual Studio 2022" in the same
session and confirm it opens **17.x**. Decline UAC once and confirm the toast names 2026.
This is the last unverified behaviour of VS26-02.2 / VS26-05.2 and cannot run headless.

### 3. Visual pass — COLOUR HALF CONFIRMED 2026-08-28

Owner confirmed the colours read correctly ("color themes for shortcuts are ok"), discharging
**VS26-04.4** and the visual half of VS26-01.2 in both themes. `--pink` needs no adjustment.

**Not yet confirmed:** the *layout* ACs — **VS26-01.3** (the detail grid wrapping 3 + 2 without
the trailing row stretching or misaligning) and **VS26-04.3** (the board footer absorbing a 5th
button without overflow or wrap). The colour confirmation does not speak to either.

## Known limitations (accepted, not defects)

- An **Insiders-only** VS 2026 machine reports "not installed" (decision C4).
- A future VS 19.x needs its own card; ranges are pinned per year on purpose.
- `resolveDevenv`'s stale-path guard (VS26-02.4) is code-verified only — it is unexported and
  filesystem-bound. Closing it would mean injecting a filesystem seam, which was judged
  disproportionate for a guard carried over unchanged from VSAD.
