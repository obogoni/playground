# VS 2026 (Admin) Shortcut — Tasks

**Spec:** `spec.md` (VS26-01..05) · **Context:** `context.md` (C1..C4)
**Branch:** `feature/vs2026-admin-shortcut`, based on `origin/main` (`9d825d6`, the PR #75 merge)
**Batching:** 7 tasks — a single task-budgeted batch (≤ ~8), so **executed inline; no sub-agent
workers**. A fresh-eyes verification pass still runs after the last task.

## Inline Design

The feature is a **parameterization** of the proven VSAD path, not a second runtime shape (C1). One
new concept is introduced in the main process:

```
VS_EDITIONS: Readonly<Record<'vs2022' | 'vs2026', { label: string; versionRange: string }>>
  vs2022 → { label: 'Visual Studio 2022', versionRange: '[17.0,18.0)' }   // unchanged today
  vs2026 → { label: 'Visual Studio 2026', versionRange: '[18.0,19.0)' }   // measured, context.md
```

- `buildVswhereArgs(versionRange)` is **exported** so VS26-02.1 / VS26-03.1-2-4 are assertable
  without a real VS install — the alternative (asserting through `execFile`) would need a process
  mock and would still not prove the range came from the tool.
- `resolveDevenv(versionRange)` and `openVisualStudio(path, edition)` take their range/label as
  **parameters**; there is no module-level "current edition" (VS26-03.4 forbids mutable state).
- The three VSAD failure messages become templates over `edition.label`, which reproduces the 2022
  strings **character-for-character** — that is what makes VS26-03.5 / VS26-05.5 hold.
- `buildElevatedOpen` is already version-agnostic and is **not touched**.

Renderer: `LAUNCHERS` gains a fifth entry; `BoardView` gains a fifth footer button. A new `--pink`
token is added because the palette's five existing hues are all spoken for and the board footer is
icon-only (C2). Hue separation was the selection criterion: pink (~330°) sits ~65° from
`--accent` (265°) and ~45° from the unused-in-launchers `--red` (15°), whereas a teal/cyan
candidate would land ~20° from `--blue` — indistinguishable at 15px.

## Tasks

### T1 — Add the `--pink` design token and its tile/button styling

**Files:** `src/renderer/src/styles/tokens.css`, `src/renderer/src/components/WorktreeDetail.css`,
`src/renderer/src/components/BoardView.css`
**Covers:** VS26-01.2, VS26-04.1, VS26-04.4

- Add `--pink` to **both** theme blocks in `tokens.css` (dark pastel + light deep), matching the
  existing tokens' lightness convention.
- Add `.detail-launcher-tile.pink` mirroring the `.amber` rule (`color-mix(... 16%, transparent)`).
- Make `.detail-launcher-admin` take its card's tile colour instead of hard-coded amber
  (VS26-01.2) — add per-colour modifiers so the 2022 badge stays amber and the 2026 badge is pink.
- Add `.board-launch-btn.pink` mirroring `.board-launch-btn.amber` (base + `:hover`).

**Verify:** `npm run lint` clean; token present in both `:root` blocks; no existing `--pink` was
already defined (grep first — a shared-CSS assumption must be confirmed, not presumed).

---

### T2 — Widen the `ShortcutTool` union with `vs2026`

**File:** `src/shared/shortcuts.ts`
**Covers:** VS26-04.2 (IPC shape)

Add `'vs2026'` to the union. The `shortcuts:launch` channel shape is otherwise unchanged — no new
channel.

**Verify:** `npm run typecheck` now **fails** in `shortcut-launcher.ts` on the non-exhaustive
`switch` — that failure is the intended signal that T3 is required, and it is the reason T2 and T3
land as one commit (see Gate note below).

---

### T3 — Parameterize the VS launcher by edition

**File:** `src/main/shortcut-launcher.ts`
**Covers:** VS26-02.1, VS26-02.2, VS26-02.4, VS26-03.1, VS26-03.2, VS26-03.4, VS26-05.1, VS26-05.2,
VS26-05.3

- Introduce and export the frozen `VS_EDITIONS` map above.
- Export `buildVswhereArgs(versionRange): string[]` returning
  `['-latest', '-version', versionRange, '-property', 'productPath']` — **no `-prerelease`** (C4).
- Change `resolveDevenv` to accept a `versionRange` and use `buildVswhereArgs`; keep the existing
  "resolved path must still exist on disk" guard (VS26-02.4).
- Change `openVisualStudio(path, edition)` to template the three failure messages off
  `edition.label`, preserving the 2022 wording exactly.
- Route both `case 'vs2022'` and `case 'vs2026'` in `launch()` through it.

**Verify:** `npm run typecheck` green; `npm run test` green with the **pre-existing
`shortcut-launcher.test.ts` assertions unmodified** (VS26-03.5).

---

### T4 — Unit-test edition resolution and coexistence

**File:** `src/main/shortcut-launcher.test.ts`
**Covers:** VS26-02.1, VS26-03.1, VS26-03.2, VS26-03.4, VS26-05.1/2/3 (message wording)

New `describe` blocks, asserting **spec-defined outcomes**, not the implementation shape:

- `buildVswhereArgs` for the 2026 range contains `-version` immediately followed by `[18.0,19.0)`,
  `-property productPath`, and **does not contain `-prerelease`** (VS26-02.1, C4).
- The 2022 range is still `[17.0,18.0)` and the two ranges are **disjoint** — assert no version
  string can satisfy both by checking the ranges' numeric bounds do not overlap (VS26-03.2).
- Each tool maps to its **own** edition: `VS_EDITIONS.vs2022.versionRange !== VS_EDITIONS.vs2026.versionRange`
  and the labels name the right years (VS26-03.1/4).
- The three failure messages, generated for each edition, name that edition's year and the 2022
  variants match the VSAD strings verbatim (VS26-05.1/2/3/5).

**Verify:** `npm run test` green; deliberately flipping the 2026 range to `[17.0,18.0)` in scratch
makes these tests **fail** (they discriminate — confirmed, then reverted).

---

### T5 — Add the VS 2026 card to the detail pane

**File:** `src/renderer/src/components/WorktreeDetail.tsx`
**Covers:** VS26-01.1, VS26-01.2, VS26-01.3

Append a fifth `LAUNCHERS` entry after `vs2022`: `tool: 'vs2026'`, label `Visual Studio 2026`,
command `devenv.exe`, icon `shield`, tile `pink`, `admin: true`. Pass the tile colour through to the
ADMIN badge so tile and badge match (pairs with T1).

**Verify:** `npm run typecheck` green; card renders in the running app (checked at T7).

---

### T6 — Add the VS 2026 button to board card footers

**File:** `src/renderer/src/components/BoardView.tsx`
**Covers:** VS26-04.1, VS26-04.2, VS26-04.3

Add a fifth `board-launch-btn pink` button after the 2022 one, `title="Visual Studio 2026 (admin)"`,
`onClick={() => launch('vs2026')}`, `shield` icon at the same size/stroke.

**Verify:** `npm run typecheck` + `npm run lint` green.

---

### T7 — Update the CDP smoke script for five launchers

**File:** `scripts/smoke-shortcuts.mjs`
**Covers:** VS26-01.1, VS26-01.2, VS26-04.1 (executed evidence)

The script **currently breaks**: it asserts `four launcher cards render` and reads
`querySelectorAll('.detail-launcher')[3]`.

- Change the count assertion to five and extend the label/command expectations.
- Keep the existing `[3]` VS 2022 amber-tile + ADMIN assertion **as-is** (it is the 2022 regression
  sensor).
- Add a `[4]` assertion: label `Visual Studio 2026`, command `devenv.exe`,
  `.detail-launcher-tile.pink` present, ADMIN badge present.
- Add a board assertion for `.board-launch-btn.pink[title="Visual Studio 2026 (admin)"]` next to the
  existing amber 2022 one.

**Verify:** `node scripts/smoke-shortcuts.mjs` against a running seeded app — all checks pass,
including the untouched 2022 ones.

---

## Gate (every task)

`npm run typecheck && npm run lint && npm run test` must be green before a task is committed, and
each task is **one atomic commit**.

**One documented exception:** T2 alone cannot typecheck — widening the union deliberately breaks the
exhaustive `switch` it feeds. T2 and T3 are therefore committed together as a single atomic commit
whose gate is T3's. This is recorded here rather than discovered mid-execution, and it is the only
task pair permitted to merge.

## Verification (after T7)

A fresh-eyes pass re-derives coverage independently (author ≠ verifier, evidence-or-zero):
spec-anchored outcome check per AC + a discrimination sensor (behaviour-level mutations in scratch,
discarded after), written to `validation.md`. Mutations to inject at minimum: swap the 2026 range to
the 2022 range; add `-prerelease` to the arg vector; make both editions share one label.

## Out of this branch

Pushing, the GitHub issue, and the PR are **not** part of Execute — they are proposed to the owner
after validation passes (project convention: issue = feature, PR = feature, `Closes #<n>` in the
body).
