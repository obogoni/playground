## Validation: file-icons — PASS

**Date**: 2026-09-26
**Spec**: `.specs/features/file-icons/spec.md` (FICN-01..15, four edge cases)
**Reference table**: `.specs/features/file-icons/expected-icons.md` (91 names)
**Diff range**: `c31bb9a..HEAD`. Plan commits `460d827`, `f29d33b`; implementation `1143e50..5433040` (8 commits). 18 files, +1404 / −3
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree. Mutations ran in a temporary `git worktree` only

---

## Task Completion

T1–T8 are all checked off in `tasks.md`; nothing is blocked or partial. I checked these claims against the tree instead of taking them on trust:

| Task | Claim checked | Finding |
| ---- | ------------- | ------- |
| T1 | Both packages MIT, pinned | `package.json:43` `"@iconify-json/vscode-icons": "1.2.82"`, `:63` `"vscode-icons-js": "11.6.1"` (exact pins, in `devDependencies` beside `react`, which is how this repo bundles renderer libraries). Installed `package.json` `license` = `MIT` for both |
| T2 | 108 new tests, expected names copied rather than computed | `file-icons.test.ts:41-48` parses the rows of `expected-icons.md?raw`; `:52` pins the count to 91. The expected values come from the markdown and are never produced by the resolver |
| T3 | 7 new tests, injected importer | `icon-set.test.ts:37-100`. The importer is always `vi.fn`/inline, and the real `import('./icon-data')` appears only at `icon-set.ts:72` |
| T5 | Row height unchanged (23.3 px) | **Not re-measured**, because this verifier may not launch the app. `FileIcon.css:11` `margin: -1px 0` is the mechanism the author describes |
| T6 | Set in its own chunk; entry +4,633 B | Rebuilt independently, see FICN-12. Baseline re-measured by building `c31bb9a` in the scratch worktree: **6,490,413 → 6,495,046 B**, the same as the author's figures |
| T7 | Notices copied, not retyped | The `vscode-icons-js` block in `THIRD-PARTY-NOTICES.md` is byte-identical to `node_modules/vscode-icons-js/LICENSE` once CR and trailing blank lines are stripped. `@iconify-json/vscode-icons` is covered by the vscode-icons section (`THIRD-PARTY-NOTICES.md:6-10`), which states that it ships under the same licence. README link at `README.md:119` |
| T8 | Smoke 29/29 plus four mutant runs | Not re-run (app launch not allowed). The checks are judged by reading them, below |

---

## Spec-Anchored Acceptance Criteria

`smoke N` = `scripts/smoke-files-diff.mjs`, numbered in the order `check()` fires (the icon section is checks 20–29, `:855-954`). Unit citations are `src/renderer/src/lib/…`.

### P1: Files show what they are

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| FICN-01 file row / changed row / tab shows the mapped icon of the lower-cased name, after corrections | The Iconify name from `vscode-icons-js(lower(name))` + corrections; the 91 rows of `expected-icons.md` | `file-icons.test.ts:55-65`, with `expect(file(name)).toBe(closed)` over all 91 rows (the real mapping and the real 1.2.82 set). Wiring: smoke 20 (`:855`) `tsRow === 'file-type-typescript'` (Explore row); smoke 26 (`:908`) `changedTs === 'file-type-typescript'` (changed row, Diff to origin); smoke 24 (`:877`) `tabIcons[0] === 'file-type-typescript' && editor > 0` (file tab). The smoke decodes the `<img>` data URI and compares the SVG body with the set's (`:786-799`), so a wrong icon reads `unknown` | PASS (diff tab and uncommitted mode by code only, gap 3) |
| FICN-02 unmapped name → default file icon | `default-file` | `file-icons.test.ts:86-87`: `expect(file('notes.unknownext')).toBe('default-file')`, `expect(file('notes')).toBe('default-file')` | PASS |
| FICN-03 `*.slnx` → same icon as `*.sln` | `file-type-sln` | `file-icons.test.ts:68-69`: `.toBe('file-type-sln')` and `.toBe(file('Acme.Widget.sln'))`; `:81` upper-case; table row `Acme.Widget.slnx`. Smoke 21 (`:860`) `slnx === 'file-type-sln'` | PASS |
| FICN-04 `*.razor` → `file-type-razor` | `file-type-razor` | `file-icons.test.ts:73`: `expect(file('Counter.razor')).toBe('file-type-razor')` | PASS |
| FICN-05 `*.resx` → XML icon | `file-type-xml` | `file-icons.test.ts:77`: `.toBe('file-type-xml')`; `:82` `Strings.pt-BR.resx` (last extension) | PASS |
| FICN-06 missing name → `2` variant, else default | `file-type-pdf2`; `default-file` | `file-icons.test.ts:91-92`: `expect(available.has('file-type-pdf')).toBe(false)`, `expect(file('contract.pdf')).toBe('file-type-pdf2')`; `:97-99`: a synthetic `file_type_nowhere.svg` → `'default-file'`. Loader half: `icon-set.test.ts:74` `expect(icons!.uri('file-type-nowhere')).toBeNull()` | PASS |
| FICN-07 light theme → light variant when the set has one | `file-type-light-vite`, `folder-type-light-node(-opened)`; unchanged when there is no light variant | `file-icons.test.ts:103-106`, `:110-112`. Smoke 25 (`:892`) `viteDark === 'file-type-vite' && viteLight === 'file-type-light-vite' && tsLight === 'file-type-typescript'` | PASS |
| FICN-08 theme change → every visible icon follows without restart | Icons re-resolve on `data-theme` change | Smoke 25 (`:892`): the same rows are read before and after clicking the theme toggle, with no reload in between (`toLight && viteDark… && viteLight…`). Mechanism: `FileIcon.tsx:26-29` `MutationObserver` on `data-theme` feeding `useSyncExternalStore` (`:52`); `App.tsx:247` is the writer | PASS (smoke only, by design of the matrix) |
| FICN-15 dark theme → a light answer of the mapping replaced by its base | `settings.json` → `file-type-json` in dark, `file-type-light-json` in light; kept light when the base is absent | `file-icons.test.ts:116-118` (the mapping's raw answer is pinned as `file_type_light_json.svg`, then `.toBe('file-type-json')` / `.toBe('file-type-light-json')`); `:123-125` base removed → `'file-type-light-json'`; table rows `.json`, `.js`, `.mjs`, `.yml`, `.rs`, `.env`, `node_modules`. Smoke 23 (`:866`) `json === 'file-type-json'` | PASS |

### P1: Folders show what they are

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| FICN-09 collapsed folder → closed icon for lower-cased name, else default | e.g. `folder-type-src`; `default-folder` for `Properties` | `file-icons.test.ts:61` `expect(folder(name, false)).toBe(closed)` over the 23 folder rows; `:138` `Properties` → `'default-folder'`; `:147` `SRC`/`Src` → `'folder-type-src'`. Smoke 22 (`:861`) `srcClosed === 'folder-type-src'` | PASS |
| FICN-10 expanded folder → matching opened icon | `folder-type-src-opened`; `default-folder-opened` | `file-icons.test.ts:62` `expect(folder(name, true)).toBe(opened)`; `:139`. Smoke 22 `srcOpened === 'folder-type-src-opened'`. Wiring `FileTree.tsx:99-103` passes `open={files.expanded.includes(entry.path)}` | PASS |
| FICN-11 changed-list folder follows 9 and 10 | The opened icon (the changed list always draws its folders expanded, `FileTree.tsx:123-127`) | Smoke 26 (`:908`) `changedSrc === 'folder-type-src-opened'`; wiring `FileTree.tsx:159` `open` | PASS |

### P1: Icons never slow the app down

| Criterion | Spec-defined outcome | `file:line` + assertion | Verdict |
| --------- | -------------------- | ----------------------- | ------- |
| FICN-12 set emitted as its own chunk, not imported by the entry chunk | A separate chunk that the entry reaches only lazily | Build inspection (`npx electron-vite build`, exit 0): `out/renderer/assets/icon-data-gtQrt48u.js` is 3,899,380 B and holds the set and the mapping (`file_type_light_json` ×12, `folder_type_github` ×1). The entry `index-t0ZHZ3ug.js` (6,495,046 B) holds **zero** of those markers, and its only reference is `createIconLoader(() => __vitePreload(() => import("./icon-data-gtQrt48u.js"), true ? [] : void 0, …))` (a dynamic import with an empty preload list). `out/renderer/index.html:11` loads only the entry script; there is no `modulepreload` of `icon-data`. The source side: `icon-set.ts:72` is the only importer of `icon-data.ts`; `file-icons.ts:18-22` takes the mapping as a parameter. Indirect runtime proof: smoke 28 blocks `*icon-data*` and expects generic icons, which cannot pass if the set sat in the entry chunk | PASS |
| FICN-13 while loading, rows show the generic `file` icon of today | "the generic `file` icon they show today" | `FileIcon.tsx:53-62`: `uri` is null while `icons` is null, so it renders `<Icon name={kind} size={13} />`. Smoke 28 (`:945`) `blocked.length > 3 && blocked.every((icon) => icon === 'generic')` covers the never-loaded state, which takes the same `icons === null` branch as the loading window | ⚠️ Spec-precision gap (gap 2): the spec's "shown today" is undefined for folder rows, changed rows and tabs, which showed no icon before; the code shows the generic *folder* glyph for folders and the generic file glyph elsewhere. The transient loading window itself is not exercised |
| FICN-14 chunk fails → generic icon kept, failure logged once | Every call resolves to null; exactly one log | `icon-set.test.ts:95-99`: `expect(await load()).toBeNull()` ×3, `expect(error).toHaveBeenCalledTimes(1)`, the message contains the cause. Smoke 28 (generic rows with the chunk blocked) and smoke 29 (`:950`) `failures.length === 1` across every row mounted after a reload | PASS |

**Status**: 14/15 PASS on a spec-precise outcome, and 1 spec-precision gap (FICN-13), which is non-blocking.

---

## Edge Cases

- [x] Several dots: `file-icons.test.ts:151-152`, `OrderList.test.tsx` → `'file-type-testts'` and `appsettings.Development.json` → `'file-type-json'` (the package's rule); corrections by the last extension at `:82` (`Strings.pt-BR.resx` → xml) and `file-icons.ts:50-51` (`lastIndexOf`, where M3 was killed)
- [x] No extension: `file-icons.test.ts:143-147`, `Dockerfile`/`DOCKERFILE` → `'file-type-docker'`, `LICENSE`/`License` → `'file-type-license'`; table rows `Makefile`, `.env`, `.gitignore`
- [x] Non-ASCII, locale-independent: `file-icons.test.ts:156-158`, `Relatório.MD` → markdown, `ÜBERSICHT.JSON` → json, `.GİTHUB` → `'default-folder'` (locale-independent `İ` → `i̇`; a Turkish-locale lower-case would give `folder-type-github`, so M2 was killed)
- [x] `light` inside a word: `file-icons.test.ts:129-134`, `file-type-lighthouse` and `file-type-go-lightblue` stay themselves in both themes. `file-icons.ts:35-36` anchors on `light-`

---

## Discrimination Sensor

Scratch: `git worktree add --detach <scratchpad>/wt HEAD` with a junction to the main `node_modules`. The unmutated scoped run gave 115/115 green. Each mutant ran `vitest run file-icons.test.ts icon-set.test.ts` and was then restored from its original bytes. Afterwards the worktree was removed and pruned. `git status --porcelain` of `D:\playground-main` was empty before and is empty after.

| # | File:line | Mutation | Result |
| - | --------- | -------- | ------ |
| M1 | `file-icons.ts:46` | `name.toLowerCase()` → `name` | ✅ Killed (10 failed) |
| M2 | `file-icons.ts:46` | `toLowerCase()` → `toLocaleLowerCase('tr-TR')` | ✅ Killed (3) |
| M3 | `file-icons.ts:50` | corrections by first extension (`indexOf('.')`) | ✅ Killed (3) |
| M4 | `file-icons.ts:74` | dark rule disabled (FICN-15) | ✅ Killed (14) |
| M5 | `file-icons.ts:78` | `2`-variant step removed (FICN-06) | ✅ Killed (2) |
| M6 | `file-icons.ts:79` | light rule in the dark theme (FICN-07) | ✅ Killed (16) |
| M7 | `file-icons.ts:48` | open/closed folder mapping swapped (FICN-09/10) | ✅ Killed (28) |
| M8 | `file-icons.ts:30` | `.razor` correction dropped (FICN-04) | ✅ Killed (2) |
| M9 | `file-icons.ts:35` | `LIGHT_VARIANT` loosened to `-type-light` (no dash) | ✅ Killed (14) |
| M10 | `file-icons.ts:36` | `HAS_LIGHT_VARIANT` lookahead `(?!light-)` removed | ⚪ Survived: **equivalent**. Over all names in the 1.2.82 set, 0 resolve differently (there is no `*-type-light-light-*` name for a light icon to be doubled into). The lookahead guards against data that does not exist, so no test on the real set can kill it. No fix task |
| M11 | `file-icons.ts:56` | unmapped file default → `default-folder` (FICN-02) | ✅ Killed (1) |
| M12 | `icon-set.ts:63` | `pending ??=` → `pending =` (import on every call) | ✅ Killed (2) |
| M13 | `icon-set.ts:40` | alias resolution removed | ✅ Killed (1) |
| M14 | `icon-set.ts:65` | failed import rethrows instead of resolving null (FICN-14) | ✅ Killed (1) |
| M15 | `icon-set.ts:41` | missing name → `''` instead of `null` | ✅ Killed (1) |
| M16 | `icon-set.ts:33` | aliases left out of `available` | ✅ Killed (1) |

**Sensor depth**: expanded (16 manual mutations across the resolver and the loader; no mutation tooling in the repo)
**Result**: 15/15 non-equivalent mutants killed, 1 equivalent. PASS ✅

**Component layer (`FileIcon`, `FileTree`, `FileTabs`)** has no unit tests, by the plan's matrix, and the sensor does not reach it. Its discrimination rests on the smoke, which I judged by reading:

| Smoke | Asserts the spec outcome? | Could it pass with the behaviour broken? |
| ----- | ------------------------- | ---------------------------------------- |
| 20 `.ts` row | Yes: the decoded body equals `file-type-typescript` | No. A generic glyph reads `generic`, a wrong icon reads `unknown` |
| 21 `.slnx` | Yes, `file-type-sln` | No. The guard at `:822-833` proves that `file-type-sln` and `default-file` bodies differ |
| 22 `src` closed → open | Yes, both states on the same row | No. The body guard separates closed and opened |
| 23 `.json` dark | Yes, `file-type-json` | No. The guard separates it from `file-type-light-json` |
| 24 file tab | Yes, plus the editor still mounts | Only for diff tabs, which are not checked (gap 3) |
| 25 light swap | Yes: `vite` changes from base to light in place, `.json` stays light, `.ts` is unchanged | No. `vite.config.ts` is answered base by the mapping, so it proves the light rule itself (the author's first B run showed that `.json` alone could not) |
| 26 changed list | Yes, file and open folder | Only for the uncommitted mode, which is not exercised (same `ChangedRows` component) |
| 27 All changes | Yes, zero `.file-icon` in the fixed tab | No |
| 28 chunk blocked | Yes, every row is `generic` | No. It needs more than 3 rows, and it fails if the set had been bundled eagerly |
| 29 logged once | Yes, exactly one console line | No. `failures.length === 1` also fails at 0 |

---

## Gate Check

- **Full suite** `npx vitest run`: exit 0. **1778 passed / 0 failed / 0 skipped**, 92 files (84 s). The flaky real-git suite did not flake in this run
- **Test count before feature**: 1663 (the author's baseline; consistent with 1778 − 115, where the scoped files hold exactly 108 + 7 = 115)
- **Test count after feature**: 1778. **Delta**: +115, and no test was removed or weakened (the diff touches no existing test file)
- **Typecheck** `npm run typecheck`: exit 0
- **Lint** `npx eslint .`: exit 0, **18 warnings = the pre-existing count**. `npx eslint` over the ten files in scope reports 0 problems
- **Build** `npx electron-vite build`: exit 0, built in 5 s. See FICN-12

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: resolver 84 lines, loader 72, component 65, data module 6 | ✅ |
| Surgical changes: `FileTree.tsx` +10/−1 and `FileTabs.tsx` +4, only at the icon sites; no unrelated edits | ✅ |
| No scope creep: no theme picker, and no icon on All changes (smoke 27) or on commit tabs (`FileTabs.tsx:190` gates on `file`/`diff`) | ✅ |
| Matches patterns: the theme observer copies `TerminalPane.tsx:462-468` / `monaco-setup.ts:42`; the import-injected loader keeps the 3.7 MB set out of unit tests | ✅ |
| Spec-anchored outcome check (asserted values match the spec) | ✅, except FICN-13 (spec-precision gap) |
| Per-layer coverage: the resolver is 1:1 to FICN-01..07, 09, 10, 15 and the four edge cases; the loader covers FICN-06 and 14; the component is covered by the smoke per the matrix | ✅ |
| Every test maps to a spec requirement: the two loader tests without an FICN tag (own `viewBox` size, `available` + mapping hand-off) map to T3's "What" (alias resolution, `availableIconNames()`) | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, and tasks.md's Gate Check Commands | ✅ |

Notes:
- `FileIcon.tsx:13-23`: every mounting row calls `loadIcons()` while the set is absent. This is harmless: the promise is cached (`icon-set.ts:63`), and only the first resolver writes `icons` and notifies.
- CSP already allows `img-src 'self' data:` (`out/renderer/index.html:9`), and the feature did not change it.

---

## SPEC_DEVIATION (T6): entry chunk +4,633 B, not ≤ 1 KB — **accepted**

FICN-12's text asks for two things: an own chunk, and no import from the entry. It sets no byte budget, and both halves hold (see the table). The 1 KB figure was a planning estimate in T6's Done-when. The growth is the resolver, the loader and `FileIcon`, which must be eager to draw the stand-in and to trigger the lazy import. The renderer build is unminified, so their source counts byte for byte. No mapping or icon data leaked into the entry.

One thing the owner should see: the spec's **Success Criteria** line "the entry chunk's size unchanged" (`spec.md:138`) is, read literally, not met. The change is +0.07 % (6,490,413 → 6,495,046 B, measured at both ends by this verifier). This is not an AC, and I do not count it against the verdict. The owner can accept it or reword the success criterion.

---

## Ranked gaps (non-blocking)

1. **Equivalent mutant M10**. The `(?!light-)` lookahead in `HAS_LIGHT_VARIANT` (`file-icons.ts:36`) cannot be discriminated on the 1.2.82 set. This is information, not a fix task.
2. **FICN-13 spec precision**. "The generic `file` icon they show today" is undefined for folder rows, changed rows and tabs, which showed no icon before. The code's choice (a generic folder glyph for folders, a file glyph elsewhere) is reasonable. Rewording the AC would make it testable to the letter. Also, only the never-loaded state is exercised, not the transient loading window (`FileIcon.tsx:53-62`, same branch).
3. **FICN-01 wiring breadth**. Diff tabs (`FileTabs.tsx:190`) and the uncommitted changed-list mode have code evidence only. The smoke checks a file tab and Diff to origin. Both go through the same `FileIcon` call, so the risk is low.

No gap blocks the verdict.

---

## Requirement Traceability Update

For the orchestrator to apply to `spec.md` (this verifier writes only this file):

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| FICN-01 | Wired (T5, T6) | ✅ Verified |
| FICN-02..07 | Resolved (T2) | ✅ Verified |
| FICN-08 | Smoke (T8) | ✅ Verified (smoke) |
| FICN-09, 10 | Resolved (T2) | ✅ Verified |
| FICN-11 | Wired (T5) | ✅ Verified (smoke) |
| FICN-12 | Own chunk (T6) | ✅ Verified (build) |
| FICN-13 | Smoke (T8) | ✅ Verified (smoke), ⚠️ spec-precision gap |
| FICN-14 | Loader (T3) | ✅ Verified |
| FICN-15 | Resolved (T2) | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 14/15 ACs matched a spec-precise outcome; 1 spec-precision gap flagged (FICN-13)
**Sensor**: 16 mutations, 15 killed, 1 survived (equivalent: 0 names differ on the real set)
**Gate**: 1778 passed, 0 failed; typecheck 0; lint 0 errors / 18 warnings (unchanged); build OK

**What works**: the resolver matches all 91 names in the reference table, with the corrections, the `2` fallback, the light and dark rules and the edge cases, and is discriminating under mutation. The loader imports once, resolves aliases and fails soft with a single log. The set and the mapping sit in a lazy chunk the entry never imports statically. The UI wiring is covered by smoke checks that compare decoded SVG bodies, not mere presence.

**Next steps**: the owner decides on the success-criterion wording (entry +0.07 %) and optionally sharpens FICN-13's text.
