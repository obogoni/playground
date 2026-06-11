# Pinned Tasks Pane Specification

**Milestone:** M3 — ADO Tasks & Start-Work Flow (first M3 feature)
**Sources of truth:** PRD issue #1 (stories 6, 7, 8, 9, 20 partial; §ADO integration, §Data model `PinnedTask`/`Settings`, §Module decomposition `AdoGateway`/`TaskBoard`, §Testing Decisions), `design_handoff_worktree_manager/README.md` (§1c Pinned tasks, §Top bar sync status, §State Management ADO auth note)
**Scope size:** Medium — spec only; design inline (architecture fully dictated by PRD §Module decomposition), tasks implicit in Execute

## Problem Statement

The app manages worktrees end-to-end but knows nothing about the tasks that motivate them. The PRD's headline loop — "task in ADO → worktree on disk" — starts here: a curated pane of pinned work items whose details stay live with ADO, authenticated through the developer's existing `az` login. This feature ships `AdoGateway` + the pin/unpin/persistence half of `TaskBoard` + the §1c pane; the start-work flow builds on it next.

## Goals

- [ ] Pin a work item by pasting its ID or full ADO URL; it appears as a card with live title, type pill, and state pill (PRD stories 6, 7)
- [ ] Unpin a task; the pinned set survives app restarts (PRD stories 8, 20)
- [ ] When the app can't obtain an ADO token, the pane says "run `az login`" instead of an error wall (PRD story 9)
- [ ] Details re-fetch on app focus and on manual refresh; `TaskBoard` parsing/persistence fully unit-tested per PRD §Testing Decisions

## Out of Scope

| Feature                                          | Reason                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Card footer (worktree count, Start work button)  | Belongs to "Start Work from Task" (next M3 feature) — cards ship header + title only for now  |
| Task tags on sidebar rows / linked-task card     | Same — requires `taskIdFromBranch`, deferred with start-work                                  |
| `branchNameFor` / `taskIdFromBranch` in TaskBoard| Template rendering and ID extraction land with start-work                                     |
| Settings UI for default org/project              | M4 (Per-Workspace Config); defaults are read from global config, hand-editable until then     |
| WIQL / saved queries / "assigned to me"          | PRD: tasks are pinned manually in v1                                                          |
| ADO writes (state changes, comments)             | PRD: view only in v1                                                                          |
| Legacy `*.visualstudio.com` URL parsing          | Handoff/PRD specify the `dev.azure.com/<org>/<project>/_workitems/edit/<id>` pattern only     |

---

## Decisions (gray areas resolved during Specify)

- **Unpin affordance** *(neither PRD nor handoff §1c shows one — the card header is pills + spacer + `#id`)*: a small ✕ icon button in the card header, visible on card hover — discoverable without cluttering the resting design. ⚠️ Flagged for user review.
- **Bare ID with no defaults configured**: pinning a bare ID requires `ado.defaultOrg`/`ado.defaultProject` in global config (no settings UI until M4 — hand-edit `config.json`). If unset, the add row shows an inline error: paste a full URL or set defaults. ⚠️ Flagged for user review.
- **Auth-failure presentation** *(handoff: "this state is not in the prototype — design it consistent with the tasks pane styling")*: a prompt block at the top of the pane body (terminal-style `az login` hint, faint text, bordered card) while pinned cards remain listed in an id-only "details unavailable" muted state — the user's curated set is never hidden by an auth hiccup.
- **Live details are memory-only** (PRD §Data model): only `{ id, org, project, url }` persists; `{ title, type, state }` lives in main-process cache, re-fetched on focus/manual refresh. Restart with no network shows id-only cards until the first successful fetch.
- **Errors returned, never thrown**: `tasks:*` IPC results follow the `CreateWorktreeResult` shape discipline; auth failure is a typed reason (`'auth'`), distinct from per-item fetch failures.
- **Pin validates via fetch**: `pin(idOrUrl)` resolves org/project/id, then fetches the item once before persisting — a typo'd ID fails inline at the add row instead of creating a dead card.

---

## User Stories

### P1: AdoGateway — az token + work item GET ⭐ MVP

**User Story**: As a developer, I want the app to fetch work item details using my existing `az` CLI login, so that no secrets are stored and auth is whatever I already use (PRD §ADO integration).

**Acceptance Criteria**:

1. WHEN a token is needed THEN the gateway SHALL run `az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798` via execFile (no shell) and use the bearer token
2. WHEN a token was acquired THEN it SHALL be cached and reused until near expiry (the az response carries `expiresOn`); a fresh call replaces it
3. WHEN `getWorkItems(refs)` is called THEN items SHALL be fetched per org/project group via the batch REST endpoint (`GET https://dev.azure.com/{org}/{project}/_apis/wit/workitems?ids=…&api-version=7.1`) returning `{ id, title, type, state, url }[]`
4. WHEN `az` is missing, not logged in, or the token call fails THEN the gateway SHALL return `{ ok: false, reason: 'auth' }` — never throw
5. WHEN an individual item can't be resolved (deleted, no permission) THEN the rest of the batch SHALL still return; the missing item is reported per-id

**Independent Test**: By hand per PRD (§Modules deliberately not tested: thin HTTP + az wrapper) — with `az login` active, pinned IDs resolve; after `az logout`, the pane shows the auth prompt.

---

### P1: TaskBoard — pin, unpin, parsing, persistence ⭐ MVP

**User Story**: As a developer, I want to add a work item by pasting its ID or URL and remove it when done, with my list surviving restarts, so that I curate a focused working set (PRD stories 6, 8, 20).

**Acceptance Criteria**:

1. WHEN a full ADO URL is pasted (`https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`, tolerating trailing segments/slashes/query strings and URL-encoded project names) THEN org, project, and id SHALL be extracted from the URL itself
2. WHEN a bare numeric ID is pasted THEN org/project SHALL come from `ado.defaultOrg`/`ado.defaultProject` in global config; if unset, pin SHALL fail with a message saying so
3. WHEN the input is malformed (non-numeric, wrong host, no id segment) THEN pin SHALL fail with a clear message and persist nothing
4. WHEN a task is already pinned (same org/project/id) THEN pin SHALL fail with "already pinned" and not duplicate
5. WHEN pin succeeds THEN `{ id, org, project, url }` SHALL be persisted to global config; unpin SHALL remove it; both round-trip across a ConfigStore reload
6. WHEN `list()` is called THEN persisted pins SHALL be merged with the gateway's cached live details (title/type/state absent when never fetched)

**Independent Test**: Vitest, full coverage per PRD §Testing Decisions — URL parsing happy/malformed/encoded cases, bare-ID defaults present/absent, duplicate pin, pin/unpin persistence round-trip on a temp config dir.

---

### P1: Tasks pane UI (§1c) ⭐ MVP

**User Story**: As a developer, I want a pinned-tasks pane with an add row and live task cards, so that my working set is visible next to my worktrees (handoff §1c).

**Acceptance Criteria**:

1. WHEN the Tree direction renders THEN a 322px right pane SHALL appear (`--panel` bg, left border): header "PINNED TASKS" + "N items" count, add row, scrollable card list per §1c
2. WHEN the add row is used (input placeholder "Paste ID or ADO URL…", Pin button accent/white with "+") THEN Enter or clicking Pin SHALL pin; the input clears on success; failures render inline below the add row (never a toast)
3. WHEN a card renders THEN it SHALL show the §1c header row — type pill with leading dot (Bug → `--red`, Feature → `--accent`, Chore → `--amber`, fallback muted), state pill (Active → green, New → blue, In Progress → amber, Resolved → accent, Closed → faint), spacer, `#id` mono — and the title (14px/600); no footer yet (see Out of Scope)
4. WHEN a card's hover ✕ is clicked THEN the task SHALL be unpinned and the card removed
5. WHEN a pinned item has no live details (auth down, item unresolvable) THEN the card SHALL render id-only with a muted "details unavailable" note instead of pills/title

**Independent Test**: Pin a real work item by URL — card appears with correct pills and title; restart the app — card returns and re-resolves; unpin — gone and stays gone after restart.

---

### P1: "run `az login`" empty state ⭐ MVP

**User Story**: As a developer, I want a clear message telling me to run `az login` when the app cannot obtain an ADO token, so that auth failures are self-explanatory (PRD story 9).

**Acceptance Criteria**:

1. WHEN token acquisition fails THEN the pane SHALL show the auth prompt block — a bordered card, consistent with §1c styling, telling the user to run `az login` (mono command) — instead of an error wall
2. WHEN auth recovers (next focus/manual refresh succeeds) THEN the prompt SHALL disappear and cards SHALL fill with live details
3. WHEN auth is down THEN pinning by URL SHALL still fail gracefully with the auth message (validation fetch can't run); the persisted list is untouched

**Independent Test**: `az logout` → focus the app — prompt appears, cards drop to id-only; `az login` → manual refresh — prompt gone, details back.

---

### P2: Live refresh — app focus, manual, sync status

**User Story**: As a developer, I want pinned task details re-fetched on app focus and manual refresh, so that the list stays honest with reality (PRD story 7).

**Acceptance Criteria**:

1. WHEN the app window regains focus THEN details SHALL re-fetch (debounced — rapid focus flips don't stack requests)
2. WHEN the top-bar refresh button is clicked THEN task details SHALL re-fetch along with the tree
3. WHEN a fetch succeeds THEN the top-bar sync status (handoff: 7px green dot + "az · `<org>` · synced Nm ago") SHALL show the default org and relative time, ticking as time passes; WHEN auth is down THEN the dot SHALL be muted with "az · not signed in"

**Independent Test**: Change a work item's state in the ADO web UI, alt-tab back to the app — the state pill updates; sync status timestamp resets.

---

## Edge Cases

- WHEN pinned tasks span multiple org/project pairs THEN fetches SHALL be grouped per pair (the batch endpoint is project-scoped) and merged
- WHEN a pinned item is deleted in ADO THEN its card SHALL degrade to the id-only "details unavailable" state, not break the batch (AC 1.5)
- WHEN the pasted URL has a title slug after the id (`…/edit/4821/some-title`) or query params THEN parsing SHALL still extract the id
- WHEN `az` exists but is logged into a tenant without ADO access (token ok, REST 401/403) THEN it SHALL surface as the auth prompt, not a crash
- WHEN config contains pins but the network is down at startup THEN the pane SHALL render id-only cards and recover on the next successful refresh

---

## Requirement Traceability

| Requirement ID | Story                                        | Phase   | Status  |
| -------------- | -------------------------------------------- | ------- | ------- |
| PNTK-01        | P1: AdoGateway — az token + work item GET    | Planned | Pending |
| PNTK-02        | P1: TaskBoard — pin/unpin/parsing/persistence| Planned | Pending |
| PNTK-03        | P1: Tasks pane UI (§1c)                      | Planned | Pending |
| PNTK-04        | P1: "run `az login`" empty state             | Planned | Pending |
| PNTK-05        | P2: Live refresh + sync status               | Planned | Pending |

**Coverage:** 5 total, 0 verified

---

## Testing Notes (from PRD §Testing Decisions)

- `TaskBoard` is a pure-logic core — full Vitest coverage: URL parsing (org/project/id extraction, malformed input, encoded names), bare IDs with/without defaults, duplicate pins, pin/unpin persistence round-trip (temp config dir, reuse the `ConfigStore` injected-dir pattern)
- `AdoGateway` deliberately not unit-tested (thin az + HTTP wrapper; mocking the transport would test the mock) — verified by hand and CDP smoke against a live `az login`
- New IPC channels (`tasks:list`, `tasks:pin`, `tasks:unpin`, `tasks:refresh`) follow `ipc-contract.ts`; failures returned, never thrown
- Config grows `ado: { defaultOrg, defaultProject }` + `pinnedTasks: PinnedTask[]`; `ConfigPatch` mapped type covers them automatically

## Success Criteria

- [ ] From a fresh start with `az login` active: paste a work item URL → card with correct type/state pills and title; restart → card persists and re-resolves; unpin → gone for good
- [ ] `az logout` → pane shows the "run `az login`" prompt and id-only cards; `az login` + refresh → recovers
- [ ] All `TaskBoard` parsing/persistence cases green in Vitest
- [ ] Visual fidelity pass of the pane against `.dc.html` §1c (header, add row, cards minus footer)
