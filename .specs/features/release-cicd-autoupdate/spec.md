# Release CI/CD & Auto-Update Specification

**Milestone:** Post-v1 — first distribution/release feature (no prior milestone; the app has only ever run from source)
**Sources of truth:** PRD issue #30 (problem, 22 user stories, Implementation Decisions, Testing Decisions, Out of Scope); existing `electron-builder.yml` (placeholder `generic`/example.com publish, mac+linux targets still present); `src/main/index.ts` `app.whenReady()` wiring pattern (`ConfigStore`, `WorkspaceRegistry`, `ShortcutLauncher`, `TaskBoard`); co-located `*.test.ts` DI convention.
**Scope size:** **Large** — multi-surface (runtime dep + new main-process module + index.ts wiring + testable version helper + build-config rewrite + two new workflows + `dev-app-update.yml`). PRD §Further Notes explicitly calls for a `tlc-spec-driven` breakdown → **Design and Tasks phases follow this spec.**

## Problem Statement

Playground is only runnable from source (`electron-vite dev`/`build`); there is no installable Windows binary and no way to ship a new version short of pulling the repo and rebuilding. As the owner I want to install Playground like a normal Windows app that quietly updates itself when I cut a release, plus a separate side-by-side "Nightly" build to dog-food unreleased changes without giving up my stable copy.

## Goals

- [ ] Pushing a `vX.Y.Z` tag is the single act that gates, builds, and publishes an installable stable Windows binary to GitHub Releases
- [ ] Installed stable copies auto-update silently from the `latest` channel and apply on next quit — no UI, no prompts
- [ ] A manually dispatched workflow produces a side-by-side "Playground Nightly" installer on the `alpha` channel that auto-updates the same way and never collides with stable
- [ ] The updater is fully inert under `electron-vite dev`; all update *policy* is unit-tested with no network/Electron/`electron-updater` dependency
- [ ] The build config is Windows-only and structured so a code-signing certificate can be added later via secrets without restructuring

## Decisions (from PRD Implementation/Testing Decisions — gray areas already resolved)

| #  | Decision | Rationale |
| -- | -------- | --------- |
| D1 | **Windows-only.** Remove `mac`/`dmg`/`linux`/`appImage` targets from `electron-builder.yml`; keep NSIS. Reuse `build/icon.ico` as-is. | Reflects reality; keeps CI a single cheap runner (PRD stories 19, 22) |
| D2 | **GitHub publish provider** against public `obogoni/playground`, replacing the `generic`/example.com placeholder. | Public repo ⇒ tokenless runtime auto-update feed (PRD story 18) |
| D3 | **Two channels from one base config + CI-applied overrides.** Stable → `latest`, `appId: com.playground`, `productName: Playground`. Nightly → `alpha`, `appId: com.playground.nightly`, `productName: "Playground Nightly"`, distinct install dir / shortcut / user-data. Channel is baked into the packaged `app-update.yml` at build time. | One config, two identities; each installed build follows exactly one channel side-by-side (PRD stories 10, 12, 14) |
| D4 | **`UpdateService` — new main-process deep module** wrapping `electron-updater`'s `autoUpdater` behind a minimal interface (`start()`). No-op unless `app.isPackaged`; `autoDownload: true`, `autoInstallOnAppQuit: true`; check on startup + ~4h recurring interval; reads channel from build config. `autoUpdater` and the timer are **injected** so policy is unit-testable with a fake. | Established `ConfigStore`/`TaskBoard` DI pattern; isolates all update policy (PRD §UpdateService, §Testing) |
| D5 | **Version stamping is an importable helper, not an inline shell line.** Stable: `refs/tags/vX.Y.Z` → `X.Y.Z`. Nightly: base version + run number → `X.Y.Z-nightly.<run#>` (pre-release id mapping to `alpha`). CI writes it into `package.json` (`npm version --no-git-tag-version`) before `electron-builder` (which reads version from `package.json`). | Pure input→output derivation is unit-testable; tag stays the single source of truth (PRD stories 2, 3, §Version stamping) |
| D6 | **`index.ts` wires `new UpdateService(...).start()` inside `app.whenReady()`** as one thin glue line alongside the existing `handle(...)` calls. | Matches every existing deep module's wiring (PRD §UpdateService) |
| D7 | **Unsigned for now**, SmartScreen click-through accepted; `electron-updater` doesn't require signing on Windows so auto-update still works. Workflow leaves a seam for an OV cert + password via secrets. | No cert today; don't block shipping; don't restructure later (PRD stories 20, 21) |
| D8 | **Nightly is a rolling single pre-release** — each dispatch removes/reuses the previous nightly so only the latest survives; published as a GitHub pre-release. | Releases list stays clean; stable users never offered a nightly (PRD stories 13, 14) |

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Code signing / notarization | Deferred; D7 leaves the seam (PRD Out of Scope) |
| mac & linux builds + their update feeds | Windows-only (D1) |
| In-app update UI (banner, "restart now", progress bar) | Updates are fully silent, apply-on-quit (PRD Out of Scope) |
| In-app channel toggle | Channel = which installer you ran, not a runtime setting (PRD Out of Scope) |
| Running `smoke-shortcuts.mjs` / any E2E UI test in CI | Needs a live desktop session, seeded ADO workspace, real GUI tools — stays a hand-run local check (PRD §Out-of-CI) |
| Auto-versioning / release-please automation | Versions are tag-driven (stable) or run-number-derived (nightly) (PRD Out of Scope) |
| Keeping nightly history | Only the latest nightly is retained (D8) |
| Unit-testing the live GitHub round-trip | The end-to-end upgrade loop is verified by cutting a real test release, not in unit tests (PRD §Further Notes) |

---

## User Stories

### P1: Tag-driven stable release pipeline ⭐ MVP

**User Story**: As the app owner, I want pushing a `vX.Y.Z` git tag to be the single act that gates, builds, and publishes an installable stable Windows binary, so that releasing is deliberate, reproducible, and tag = single source of truth (PRD stories 1, 2, 3, 15).

**Acceptance Criteria**:

1. WHEN a `v*` tag is pushed THEN `release.yml` SHALL run on a Windows runner in order: install → quality gate (`typecheck` → `lint` → `test`) → stamp version from the tag → `electron-builder --win` with stable overrides + GitHub publish → publish a full GitHub Release
2. WHEN the tag is `refs/tags/vX.Y.Z` THEN the stamped `package.json` version SHALL be exactly `X.Y.Z` so the binary's reported version matches the tag (via the testable version helper, D5)
3. WHEN any gate step (typecheck, lint, or unit tests) fails THEN the workflow SHALL stop before the build/publish step — no release is ever published from a red build
4. WHEN the build succeeds THEN an NSIS installer SHALL be produced carrying the existing `build/icon.ico` and `productName: Playground`, uploaded to the GitHub Release on the public repo using the built-in `GITHUB_TOKEN` (`contents: write`), needing no separate hosting or runtime token (D2)

**Independent Test**: Push a throwaway `v0.0.1-test` tag → Action runs the gate, builds an installer named for `0.0.1-test`, and a GitHub Release appears with the `.exe` attached; intentionally break a test on a branch tag and confirm the publish step never runs.

---

### P1: Windows-only build config on the GitHub feed ⭐ MVP

**User Story**: As the app owner, I want `electron-builder.yml` to target only Windows and publish to GitHub Releases, so that the config reflects the Windows-only reality and auto-update has a tokenless feed (PRD stories 18, 19, 22).

**Acceptance Criteria**:

1. WHEN the build config is read THEN the `mac`, `dmg`, `linux`, and `appImage` sections SHALL be gone and only the NSIS Windows target SHALL remain (D1)
2. WHEN the `publish` block is read THEN it SHALL be `provider: github` against `obogoni/playground` (replacing `generic`/`https://example.com/auto-updates`) (D2)
3. WHEN a build is produced THEN the packaged `app-update.yml` SHALL carry exactly one channel baked in at build time, matching the identity overrides for that build (D3)

**Independent Test**: Inspect a stable build's resources → `app-update.yml` names the GitHub provider + `latest` channel; the config has no mac/linux targets.

---

### P1: Silent stable auto-update (UpdateService) ⭐ MVP

**User Story**: As an installed stable user, I want the app to check for updates on startup, download them silently, and apply on next quit, so that I get new versions without manual checks or interruptions (PRD stories 4, 5, 6).

**Acceptance Criteria**:

1. WHEN the packaged app reaches `app.whenReady()` THEN `index.ts` SHALL construct and `start()` a `UpdateService` as a thin glue line alongside the existing `handle(...)` wiring (D6)
2. WHEN `start()` runs in a packaged build THEN the service SHALL set `autoDownload: true` and `autoInstallOnAppQuit: true`, wire no UI/banner, and trigger an initial update check (D4)
3. WHEN an update is available THEN it SHALL download in the background with no user interaction and apply automatically on the next app quit
4. WHEN reading which channel to follow THEN the service SHALL honor the channel from the packaged build config rather than hard-coding it (D3, D4)

**Independent Test (unit)**: Drive `UpdateService.start()` with an injected fake `autoUpdater` in a packaged-simulated state → assert `autoDownload`/`autoInstallOnAppQuit` set and a check was triggered; assert the channel comes from config, not a literal.

---

### P1: Updater inert when running from source ⭐ MVP

**User Story**: As the app owner, I want the updater to be completely inert under `electron-vite dev`, so that development is never disrupted by update logic (PRD story 16).

**Acceptance Criteria**:

1. WHEN `start()` runs and the app is not packaged (`app.isPackaged === false`) THEN the service SHALL perform no update work — no `checkForUpdates`, no event wiring, no timer
2. WHEN running in dev THEN no network call SHALL be made to any update feed

**Independent Test (unit)**: Call `start()` with the fake `autoUpdater` in a not-packaged state → assert zero interactions with the fake.

---

### P2: Periodic re-check for long sessions

**User Story**: As an installed stable user, I want the update check to repeat periodically during long sessions, so that I still get updates even if I rarely fully quit the app (PRD story 7).

**Acceptance Criteria**:

1. WHEN the packaged app has been running THEN the service SHALL re-trigger an update check on a recurring interval (~4h), using an injected/fake timer
2. WHEN the interval fires THEN it SHALL use the same check path as the startup check (same channel, same silent behavior)

**Independent Test (unit)**: Advance the injected fake timer by the configured interval → assert an additional check fired; advance again → another check.

---

### P2: Manually dispatched nightly, side-by-side identity

**User Story**: As a developer testing changes, I want to manually trigger a "Playground Nightly" build that installs alongside my stable copy and auto-updates from the alpha channel, so that I dog-food unreleased changes without losing my stable install (PRD stories 9, 10, 11, 12).

**Acceptance Criteria**:

1. WHEN `nightly.yml` is dispatched (`workflow_dispatch`) THEN it SHALL run the same gate, stamp `X.Y.Z-nightly.<run#>` (D5), and build with nightly identity + `alpha` channel
2. WHEN the nightly is built THEN it SHALL use `appId: com.playground.nightly`, `productName: "Playground Nightly"`, and a distinct install dir / shortcut / user-data folder so it never collides with stable over config or files (D3)
3. WHEN the nightly build is installed THEN it SHALL auto-update from the `alpha` feed via the same `UpdateService` policy as stable (the channel baked into its `app-update.yml`)
4. WHEN a `X.Y.Z-nightly.<run#>` version string is produced THEN it SHALL be a pre-release identifier that maps to the `alpha` channel (D5)

**Independent Test**: Dispatch the nightly workflow → a "Playground Nightly" installer is produced versioned `X.Y.Z-nightly.<run#>`; installing it alongside stable yields two separate Start-menu entries and two separate user-data folders.

---

### P2: Rolling single nightly pre-release

**User Story**: As a developer cutting nightlies, I want each dispatch to replace the previous nightly and be published as a pre-release, so that the releases list stays clean and stable users are never offered a nightly (PRD stories 13, 14).

**Acceptance Criteria**:

1. WHEN a nightly is published THEN it SHALL be a GitHub **pre-release** with a one-line commit-stamped body
2. WHEN a new nightly is dispatched THEN the previous nightly release/tag SHALL be removed (or a fixed `nightly` tag reused) so only the latest nightly survives (D8)
3. WHEN the stable `latest` feed is queried by an installed stable build THEN no nightly pre-release SHALL ever be offered to it

**Independent Test**: Dispatch nightly twice → the releases list shows exactly one nightly pre-release (the newer one); a stable build's update check ignores it.

---

### P2: Auto-generated stable release notes

**User Story**: As the app owner, I want stable release notes generated automatically from merged PRs/commits, so that I never hand-maintain a changelog (PRD story 8).

**Acceptance Criteria**:

1. WHEN a stable release is published THEN its body SHALL be auto-generated (`generate_release_notes`) from merged PRs/commits since the previous release
2. WHEN there are no merged PRs since the last release THEN the release SHALL still publish (empty/minimal notes, not a failure)

**Independent Test**: Cut two stable releases with a merged PR between them → the second release's notes list that PR without manual authoring.

---

### P2: Local update-flow testing

**User Story**: As the app owner, I want to locally exercise the update flow against the real GitHub feed, so that I can verify auto-update before relying on it (PRD story 17).

**Acceptance Criteria**:

1. WHEN testing locally THEN a `dev-app-update.yml` SHALL exist pointing at the GitHub feed so a locally packaged build can be driven against the real release feed
2. WHEN `dev-app-update.yml` is added THEN it SHALL remain excluded from the packaged app (it is already in the `electron-builder.yml` `files` ignore list)

**Independent Test**: Point a local packaged build at `dev-app-update.yml`, publish a higher version to the feed, and observe the local build detect/download it.

---

### P3: Unsigned-but-updatable, signing seam left open

**User Story**: As a first-time installer of an unsigned build, I want auto-updates to still work despite SmartScreen, and as the owner I want the config ready to accept a signing cert later via secrets, so that the missing certificate only costs a one-time click-through and adding signing later needs no restructuring (PRD stories 20, 21).

**Acceptance Criteria**:

1. WHEN an unsigned build is installed past the SmartScreen "unknown publisher" warning THEN auto-update SHALL still function (no signing required by `electron-updater` on Windows) (D7)
2. WHEN a code-signing certificate + password are later supplied via GitHub secrets THEN the existing workflow/config SHALL accept them without structural changes (the seam is present from day one) (D7)

**Independent Test**: Install an unsigned build (click through SmartScreen) and confirm it later auto-updates; review the workflow/config and confirm the documented secret-driven signing hook exists.

---

## Edge Cases

- WHEN the version helper receives a malformed/unexpected ref (not `refs/tags/vX.Y.Z`) THEN it SHALL reject or handle it explicitly rather than stamping a garbage version (PRD §Testing)
- WHEN the update feed is unreachable at runtime THEN the silent updater SHALL fail quietly (no crash, no dialog) and retry on the next interval
- WHEN a nightly and a stable build run on the same machine THEN neither SHALL read or overwrite the other's user-data/config (distinct `appId` + user-data folder, D3)
- WHEN `electron-builder` runs in CI without a signing cert THEN the build SHALL succeed unsigned (no hard dependency on the absent secret, D7)
- WHEN the recurring update timer is still pending at app quit THEN it SHALL not block or delay quit (apply-on-quit semantics unaffected)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RLCD-01 | P1: Tag-driven stable release pipeline (`release.yml`: gate → stamp → build → publish) | Design | Pending |
| RLCD-02 | P1: Version-stamping helper — `vX.Y.Z` → `X.Y.Z` (tag = source of truth) | Design | Pending |
| RLCD-03 | P1: Quality gate (typecheck/lint/test) blocks publish | Design | Pending |
| RLCD-04 | P1: Windows-only `electron-builder.yml` + GitHub publish provider + icon/product name | Design | Pending |
| RLCD-05 | P1: `UpdateService` — startup check, silent download, apply-on-quit, channel-from-config | Design | Pending |
| RLCD-06 | P1: `UpdateService` inert when not packaged (dev) | Design | Pending |
| RLCD-07 | P1: `index.ts` wiring of `UpdateService.start()` in `app.whenReady()` | Design | Pending |
| RLCD-08 | P2: Periodic ~4h re-check (injected timer) | Design | Pending |
| RLCD-09 | P2: Nightly dispatch workflow + nightly version stamping (`X.Y.Z-nightly.<run#>` → alpha) | Design | Pending |
| RLCD-10 | P2: Nightly side-by-side identity (appId/productName/install dir/shortcut/user-data/channel) | Design | Pending |
| RLCD-11 | P2: Rolling single nightly pre-release (replace previous; pre-release; never offered to stable) | Design | Pending |
| RLCD-12 | P2: Auto-generated stable release notes | Design | Pending |
| RLCD-13 | P2: `dev-app-update.yml` local update-flow testing | Design | Pending |
| RLCD-14 | P3: Unsigned auto-update works + signing seam via secrets | Design | Pending |

**ID format:** `RLCD-[NUMBER]`
**Status values:** Pending → In Design → In Tasks → Implementing → Verified
**Coverage:** 14 total, 0 mapped to tasks yet (Tasks phase pending) ⚠️

---

## Testing Notes

Per PRD §Testing Decisions, good tests exercise external behavior through each module's public interface — no test reaches the network, the real `electron-updater`, or a real Electron runtime.

- **UpdateService** (injected fake `autoUpdater` + fake timer): not-packaged ⇒ no work (RLCD-06); packaged ⇒ `autoDownload`/`autoInstallOnAppQuit` set + initial check (RLCD-05); recurring check fires on interval (RLCD-08); channel honored from config not overridden (RLCD-05). Co-located `update-service.test.ts` following the existing DI convention.
- **Version-stamping helper** (pure input→output): `refs/tags/vX.Y.Z` → `X.Y.Z` (RLCD-02); nightly inputs → `X.Y.Z-nightly.<run#>` mapping to `alpha` (RLCD-09); malformed refs rejected/handled (edge case). Co-located `*.test.ts`.
- **Not unit-tested** (verified by cutting a real test release / hand checks): the live GitHub round-trip, `electron-builder` packaging, the two workflows, SmartScreen click-through, and side-by-side install behavior (PRD §Further Notes). `smoke-shortcuts.mjs` stays out of CI.

## Success Criteria

- [ ] Pushing a `vX.Y.Z` tag produces a GitHub Release with a Windows installer whose reported version equals the tag; a red gate blocks it
- [ ] Installing vN then publishing vN+1 results in the running stable app upgrading silently on next quit (verified by a real test release)
- [ ] A dispatched nightly yields a "Playground Nightly" installer that installs alongside stable, auto-updates from `alpha`, and only ever leaves one nightly pre-release in the list
- [ ] `npm run typecheck && npm run lint && npm test` stays green with new `UpdateService` + version-helper unit tests; dev (`electron-vite dev`) shows zero update activity
