# VS 2026 Shortcut — Discuss Context

Owner decisions captured before Specify. Four gray areas were surfaced; all four
resolved to the recommended option.

## Environment findings (measured, not assumed)

Probed on the owner's machine via the shipped
`%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe`:

| Install | `catalog_productDisplayVersion` | `productPath` |
| ------- | ------------------------------- | ------------- |
| VS 2019 Professional | `16.7.28` | `C:\Program Files (x86)\Microsoft Visual Studio\2019\Professional\Common7\IDE\devenv.exe` |
| VS 2022 Professional | `17.14.18 (October 2025)` | `C:\Program Files\Microsoft Visual Studio\2022\Professional\Common7\IDE\devenv.exe` |
| **VS 2026 Professional** | **`18.4.2`** | **`C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\IDE\devenv.exe`** |

Verified by direct invocation:

- `-latest -version "[17.0,18.0)" -property productPath` → the **2022** devenv (unchanged today).
- `-latest -version "[18.0,19.0)" -property productPath` → the **2026** devenv.
- VS 2026 GA is found **without** `-prerelease`; only Insiders builds would require it.
- VS 2026 installs under a **version-numbered** folder (`\Microsoft Visual Studio\18\`), not a
  year-named one (`\2022\`) — so no path-shape assumption may be baked in; `productPath` is the
  only supported source.

**Consequence:** the two version ranges are disjoint, so coexistence is clean at the discovery
layer. Neither launcher can shadow the other.

## Decisions

| # | Decision | Rationale |
| - | -------- | --------- |
| C1 | **VS 2026 launches elevated (UAC), exactly like VS 2022** — vswhere → `Start-Process -Verb RunAs` → Open Folder, with the same shield tile + ADMIN badge and the same not-installed / cancelled toasts. | Symmetry: the elevated-only workflows that motivated VSAD (IIS Express privileged ports, attach-to-elevated, COM registration) are identical under 2026. Mirroring 2022 means the new path is a parameterization of proven code, not a second runtime shape. A non-elevated variant was rejected as behaviourally inconsistent; shipping *both* an admin and a normal 2026 card was rejected as scope creep beyond "coexist with 2022". |
| C2 | **A new colour token distinguishes 2026 from 2022**; both keep the `shield` icon, 2022 stays `--amber`, 2026 takes the new token. | The board card footer renders launchers as **icon-only 15px buttons** with hover tooltips — two amber shields there would be indistinguishable at a glance, and left-to-right order is not an affordance. Tooltip-only was rejected for that reason; an overlaid `22`/`26` text badge was rejected as a new visual pattern absent from `design/handoff/`. |
| C3 | **Both VS cards always render, regardless of what is installed**; a click on a missing VS surfaces the existing transient toast. | Matches every existing launcher: the `wt.exe`, `code`, and VS 2022 cards already render unconditionally (LNCH-05, VSAD-04). Hiding cards per install would need a new main→renderer install-probe channel, a cache invalidation story, and an empty-grid edge case — a real scope increase for cosmetic gain. |
| C4 | **GA only — the 2026 query does NOT pass `-prerelease`**, mirroring the 2022 query verbatim. | The owner's 18.4.2 install resolves without it, so `-prerelease` buys nothing today and carries a concrete hazard: on a machine with both stable and Insiders, `-latest -prerelease` can pick Insiders and silently launch the wrong VS. An Insiders-only machine correctly reports "not installed". Revisit only if an Insiders-only case appears. |

## Deliberately deferred

- Insiders / prerelease discovery and a "which build resolved?" UI affordance (C4).
- A VS 2019 launcher, or any generic "latest VS" card — the ask is 2026 coexisting with 2022.
- A future VS version (19.x / "2028"): each year is an explicit, pinned range, so a new version
  needs a new card. Accepted — pinning is what makes coexistence deterministic.
- `.sln` selection — VSAD D1 stands project-wide: always Open Folder.
