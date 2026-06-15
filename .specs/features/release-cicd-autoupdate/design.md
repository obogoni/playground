# Release CI/CD & Auto-Update Design

**Spec**: `.specs/features/release-cicd-autoupdate/spec.md`
**Status**: Draft

---

## Research Notes (Knowledge Verification Chain)

Verified against electron-builder/electron-updater docs + issue tracker (June 2026), because two assumptions, if wrong, would cascade into the workflows:

1. **GitHub publishing never auto-detects the update channel from the version.** electron-builder's `detectUpdateChannel` (version → channel inference) explicitly does **not** apply to the GitHub provider (electron-builder issues #8388, #8589; Publish docs). ⇒ The nightly `alpha` routing **must be set explicitly** via `publish.channel`, never inferred from the `-nightly.N` suffix. The `-nightly.N` suffix still matters for two *other* reasons: it makes the GitHub release a semver pre-release, and it keeps stable's `latest.yml` from ever listing it.
2. **Only a fixed set of channel names is valid:** `alpha | beta | dev | rc | stable | null` (custom names like `nightly` are rejected at validation). ⇒ Nightly uses the supported **`alpha`** channel (→ `alpha.yml`); stable uses the default **`latest`** channel (→ `latest.yml`). The two channel files are independent, so a stable install reading `latest.yml` never sees a nightly.
3. **`forceDevUpdateConfig` + `dev-app-update.yml`** is the sanctioned way to exercise the real feed from an unpackaged build. This is an **explicit opt-in** in our design (env-gated), so it never contradicts RLCD-06 ("inert in dev") on a normal `electron-vite dev` run.
4. **`electron-updater` 6.x** is the runtime companion to `electron-builder` 26.x and is currently absent from `package.json` — it must be added as a **dependency** (not devDependency, since it runs in the packaged main process).

> _mermaid-studio skill not installed — using inline mermaid. Installing it would give rendered/validated diagrams; mentioning once._

---

## Architecture Overview

Two independent surfaces that meet only at the published GitHub Release feed:

- **Build/publish (CI, build-time):** two workflows reuse one base `electron-builder.yml` and differ only by a handful of CLI overrides + the stamped version. Each build bakes exactly one channel into the packaged `app-update.yml`.
- **Auto-update (runtime, main process):** a single injected `UpdateService` reads that baked channel and silently pulls from the matching channel file.

```mermaid
graph TD
    subgraph CI[GitHub Actions]
        TAG[push v* tag] --> RW[release.yml]
        DISP[workflow_dispatch] --> NW[nightly.yml]
        RW --> GATE1[gate: typecheck → lint → test]
        NW --> GATE2[gate: typecheck → lint → test]
        GATE1 --> STAMP1[stamp X.Y.Z from tag]
        GATE2 --> STAMP2[stamp X.Y.Z-nightly.run#]
        STAMP1 --> EB1["electron-builder --win<br/>(base config: latest, Playground)"]
        STAMP2 --> EB2["electron-builder --win<br/>-c.appId / -c.productName / -c.publish.channel=alpha"]
        EB1 --> REL["GitHub Release (full)<br/>setup.exe + latest.yml"]
        EB2 --> PRE["GitHub Pre-release (rolling single)<br/>setup.exe + alpha.yml"]
    end

    subgraph App[Installed app, main process]
        READY[app.whenReady] --> US[UpdateService.start]
        US -->|isPackaged & channel from app-update.yml| AU[electron-updater autoUpdater]
    end

    REL -. latest.yml .-> AU
    PRE -. alpha.yml .-> AU
    AU -->|autoDownload, autoInstallOnAppQuit| QUIT[apply on next quit]
```

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --------- | -------- | ---------- |
| Deep-module + DI pattern | `src/main/task-board.ts`, `config-store.ts` | `UpdateService` follows the same constructor-injection shape so it unit-tests with a fake |
| `app.whenReady()` wiring | `src/main/index.ts:52-95` | Add one `new UpdateService(...).start()` glue line beside the existing `handle(...)` calls (RLCD-07) |
| Co-located vitest + DI convention | `src/main/*.test.ts` | New `update-service.test.ts` follows it exactly (fake `autoUpdater`, fake timer) |
| Base build config | `electron-builder.yml` | Trim to Windows-only + repoint `publish`; keep NSIS block + `build/icon.ico` |
| `files` ignore list | `electron-builder.yml:9` | Already excludes `dev-app-update.yml` — the new file is auto-kept out of the package |
| Existing gate scripts | `package.json` `typecheck`/`lint`/`test` | Workflows call these verbatim — CI mirrors local gates (RLCD-03) |

### Integration Points

| System | Integration Method |
| ------ | ------------------ |
| `electron-updater` autoUpdater | Wrapped behind `AutoUpdaterPort`; real instance injected in `index.ts`, fake in tests |
| GitHub Releases | `publish: { provider: github, owner/repo }` (tokenless at runtime; `GITHUB_TOKEN` + `contents: write` at publish time) |
| `package.json#version` | electron-builder reads it; CI stamps it pre-build via the version helper + `npm version --no-git-tag-version` |

---

## Components

### 1. `electron-updater` runtime dependency

- **Purpose**: Provides `autoUpdater` for the packaged main process.
- **Change**: add `"electron-updater": "^6.x"` to **`dependencies`** in `package.json`. Run `npm install`.
- **Reuses**: ships with electron-builder's update metadata format already produced by our builds.

### 2. `AutoUpdaterPort` + `UpdateService` (new deep module)

- **Purpose**: Encapsulate **all** update policy behind `start()`; no UI, fully testable, inert in dev.
- **Location**: `src/main/update-service.ts` (+ `src/main/update-service.test.ts`).
- **Interfaces**:

```typescript
/** The slice of electron-updater's autoUpdater we actually touch — lets tests inject a fake. */
export interface AutoUpdaterPort {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  forceDevUpdateConfig: boolean
  checkForUpdates(): Promise<unknown>
  on(event: 'error', listener: (err: unknown) => void): void
}

/** Injectable scheduler so the recurring check is testable with a fake clock. */
export interface Scheduler {
  every(ms: number, fn: () => void): void
}

export interface UpdateServiceOptions {
  updater: AutoUpdaterPort
  isPackaged: boolean
  forceDev?: boolean            // RLCD-13 local-feed test opt-in (env-gated in index.ts)
  scheduler?: Scheduler         // default: wraps global setInterval
  checkIntervalMs?: number      // default: 4 * 60 * 60 * 1000
  log?: (msg: string, err?: unknown) => void
}

export class UpdateService {
  constructor(opts: UpdateServiceOptions)
  start(): void
}
```

- **`start()` behavior**:
  1. `if (!isPackaged && !forceDev) return` — no field writes, no listeners, no timer, no network (RLCD-06).
  2. `if (forceDev) updater.forceDevUpdateConfig = true` (RLCD-13 only).
  3. `updater.autoDownload = true; updater.autoInstallOnAppQuit = true` (RLCD-05).
  4. `updater.on('error', e => log(...))` — feed unreachable fails quietly, no dialog (edge case).
  5. **Never assigns `updater.channel`** — the channel baked into `app-update.yml` is honored as-is (RLCD-05 AC4).
  6. `updater.checkForUpdates().catch(log)` — initial check (RLCD-05).
  7. `scheduler.every(checkIntervalMs, () => updater.checkForUpdates().catch(log))` — recurring (RLCD-08).
- **Dependencies**: `electron-updater` (real `autoUpdater`), `electron` (`app.isPackaged`) — both injected via `index.ts`, never imported by the test.
- **Reuses**: `TaskBoard`/`ConfigStore` DI shape.

### 3. Version-stamping helper + CI entry (new, pure + testable)

- **Purpose**: Single source for deriving the build version; pure functions are unit-tested, a thin node entry stamps `package.json` in CI.
- **Location**: `scripts/release-version.ts` (pure) · `scripts/release-version.test.ts` (co-located) · `scripts/stamp-version.ts` (node entry).
- **Interfaces**:

```typescript
/** 'refs/tags/v1.2.3' -> '1.2.3'. Throws on anything not matching refs/tags/vX.Y.Z[-pre]. */
export function stableVersionFromTag(githubRef: string): string

/** ('0.1.0', 42) -> '0.1.0-nightly.42'. runNumber must be a positive integer. */
export function nightlyVersion(baseVersion: string, runNumber: number | string): string
```

- **`stamp-version.ts`**: reads `GITHUB_REF` (stable) or `GITHUB_RUN_NUMBER` + current `package.json` version (nightly) per a `--mode` arg, computes the string via the helper, then `execSync('npm version <v> --no-git-tag-version --allow-same-version')`.
- **Dependencies**: none for the pure helper; `node:child_process`/`node:fs` for the entry.
- **Reuses**: nothing — new pure logic.

### 4. `electron-builder.yml` rewrite (base config)

- **Purpose**: Windows-only base identity + GitHub feed; channel/identity diffs come from CI overrides, not duplicate files.
- **Changes**:
  - **Remove** `mac`, `dmg`, `linux`, `appImage` blocks (D1).
  - **Keep** `appId: com.playground`, `productName: Playground`, `win`, `nsis`, `build/icon.ico`.
  - **Replace** `publish` with:
    ```yaml
    publish:
      provider: github
      owner: obogoni
      repo: playground
    ```
    (channel omitted ⇒ defaults to `latest` for stable; nightly overrides it.)
- **Reuses**: existing NSIS artifact naming + icon.

### 5. Channel / identity override matrix (applied by CI, not stored)

| Setting | Stable (`release.yml`) | Nightly (`nightly.yml`) |
| ------- | ---------------------- | ----------------------- |
| version | `X.Y.Z` (from tag) | `X.Y.Z-nightly.<run#>` |
| `appId` | `com.playground` (base) | `-c.appId=com.playground.nightly` |
| `productName` | `Playground` (base) | `-c.productName="Playground Nightly"` |
| `publish.channel` | `latest` (default) | `-c.publish.channel=alpha` |
| channel file emitted | `latest.yml` | `alpha.yml` |
| install dir / shortcut / user-data | derived from `Playground` | derived from `Playground Nightly` (distinct ⇒ side-by-side) |
| GitHub release | full release | pre-release, rolling single |

> Distinct `productName` + `appId` is sufficient for full side-by-side isolation: NSIS one-click install dir, Start-menu shortcut, and Electron `userData` (`%APPDATA%\<productName>`) all key off them (D3 / RLCD-10). No extra NSIS keys needed.

### 6. `release.yml` workflow (new)

- **Trigger**: `push: tags: ['v*']`. **Permissions**: `contents: write`. **Runner**: `windows-latest`.
- **Steps**: checkout → setup-node (+npm cache) → `npm ci` → **gate**: `npm run typecheck && npm run lint && npm test` → `npx tsx scripts/stamp-version.ts --mode=stable` → `npx electron-builder --win --publish always` (base config) → create/Update GitHub Release with `generate_release_notes` (RLCD-11).
- **Gate-blocks-publish (RLCD-03)**: gate runs as earlier steps; `electron-builder` step only runs on success (default fail-fast).
- **Env**: `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`; signing seam = commented `CSC_LINK`/`CSC_KEY_PASSWORD` env wired to secrets (D7 / RLCD-14).

### 7. `nightly.yml` workflow (new)

- **Trigger**: `workflow_dispatch`. **Permissions**: `contents: write`. **Runner**: `windows-latest`.
- **Steps**: checkout → setup-node → `npm ci` → same **gate** → `npx tsx scripts/stamp-version.ts --mode=nightly` → `npx electron-builder --win --publish always -c.appId=com.playground.nightly -c.productName="Playground Nightly" -c.publish.channel=alpha` → **rolling single**: delete the previous `nightly`-tag release/tag (`gh release delete nightly --cleanup-tag --yes || true`) then publish as a **pre-release** on a reused fixed `nightly` tag with a one-line commit-stamped body (RLCD-11 / D8).
- **Note**: reusing a fixed `nightly` tag keeps exactly one nightly in the list; electron-updater follows `alpha.yml` (asset), not the tag name.

### 8. `dev-app-update.yml` (new)

- **Purpose**: Point an unpackaged local build at the real GitHub feed for hand-testing (RLCD-13).
- **Content**: `provider: github`, `owner: obogoni`, `repo: playground` (+ `channel: latest` or `alpha` as needed).
- **Activation**: only when `index.ts` passes `forceDev: true` (env-gated, see §9). Already in the `files` ignore list ⇒ never packaged.

### 9. `index.ts` wiring (modify)

- Inside `app.whenReady()`, after the existing `handle(...)` block:
  ```typescript
  import { autoUpdater } from 'electron-updater'
  import { UpdateService } from './update-service'
  // ...
  new UpdateService({
    updater: autoUpdater,
    isPackaged: app.isPackaged,
    forceDev: process.env.PLAYGROUND_FORCE_UPDATE === '1'
  }).start()
  ```
- **AUMID note**: line 54 hard-codes `electronApp.setAppUserModelId('com.playground')`; for the nightly identity to group correctly in the taskbar this should track the channel appId. Low impact (taskbar grouping/notifications only) — handled as a small task, not a component.

### 10. `vitest.config.ts` (modify) + `tsx` devDependency

- Broaden `include` to `['src/**/*.test.ts', 'scripts/**/*.test.ts']` so the version-helper test (in `scripts/`) is picked up.
- Add `tsx` to `devDependencies` so CI runs the TS stamping entry with no build step (`npx tsx scripts/stamp-version.ts`).

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| -------------- | -------- | ----------- |
| Update feed unreachable at runtime | `autoUpdater.on('error')` → log only; recurring timer retries | None — silent, no dialog |
| Running under `electron-vite dev` | `start()` early-returns (not packaged, no `forceDev`) | None — zero update activity |
| Gate (typecheck/lint/test) fails in CI | Step fails → build/publish steps never run | No release published |
| Malformed tag ref (`stableVersionFromTag`) | Helper throws → stamping step fails the workflow | No bad-version release |
| No signing cert present | Build proceeds unsigned; SmartScreen click-through at install | One-time "unknown publisher" warning; updates still work |
| Previous nightly tag missing on first dispatch | `gh release delete ... || true` no-ops | First nightly publishes normally |

---

## Tech Decisions (non-obvious)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Nightly channel routing | Explicit `-c.publish.channel=alpha` | GitHub provider never auto-detects channel from version (verified) — inferring from `-nightly.N` would silently publish to `latest` and leak nightlies to stable users |
| Channel name | `alpha` (not custom `nightly`) | Only `alpha\|beta\|dev\|rc\|stable\|null` are valid channel values |
| `forceDevUpdateConfig` | Env-gated opt-in (`PLAYGROUND_FORCE_UPDATE=1`) | Reconciles RLCD-13 (local feed test) with RLCD-06 (inert on normal dev runs) |
| Version helper placement | `scripts/release-version.ts`, vitest `include` broadened, run via `tsx` | PRD mandates an importable, unit-tested helper (not an inline shell line); keeps it TS + co-located test; `tsx` avoids a build step in CI |
| Side-by-side isolation | `productName` + `appId` overrides only | NSIS dir, shortcut, and Electron `userData` all derive from them — no bespoke NSIS keys |
| Nightly retention | Reuse a fixed `nightly` tag, delete-then-publish | Guarantees exactly one nightly pre-release; `alpha.yml` asset drives the updater regardless of tag |
| Identity overrides | CLI `-c.*` flags in CI vs. separate config files | One base `electron-builder.yml`; `electron-builder -c <file>` replaces rather than merges, so per-key CLI overrides are the clean way to diff stable/nightly |

---

## Traceability Check (every RLCD-xx has a home)

| Req | Realized by |
| --- | ----------- |
| RLCD-01 | §6 release.yml |
| RLCD-02 | §3 `stableVersionFromTag` |
| RLCD-03 | §6/§7 gate-before-build |
| RLCD-04 | §4 electron-builder.yml rewrite |
| RLCD-05 | §2 UpdateService.start (packaged path) |
| RLCD-06 | §2 start early-return |
| RLCD-07 | §9 index.ts wiring |
| RLCD-08 | §2 scheduler.every |
| RLCD-09 | §3 `nightlyVersion` + §7 nightly.yml |
| RLCD-10 | §5 override matrix + §7 |
| RLCD-11 | §6 generate_release_notes + §7 rolling pre-release |
| RLCD-12 | §6 generate_release_notes |
| RLCD-13 | §8 dev-app-update.yml + §2 forceDev path |
| RLCD-14 | §6/§7 unsigned build + commented signing-secret seam |

---

## Tips / Open Items for Tasks phase

- The live GitHub round-trip (install vN → publish vN+1 → upgrade on quit) is **not** unit-tested — it's a manual real-release check (spec §Testing Notes). Tasks should include a manual-verification task, not an automated one.
- First real stable tag should be a throwaway (`v0.0.1`-style) to smoke the whole pipeline before trusting it.
