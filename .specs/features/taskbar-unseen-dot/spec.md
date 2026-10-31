# Taskbar Unseen Dot Specification

Issue: #184

## Problem Statement

When a session needs the user or finishes its turn while the window is not
focused, the OS toast is the only signal, and it disappears after a few seconds.
A user who was away from the keyboard or on another screen has nothing to tell
them later that a session is waiting: the taskbar icon looks the same either way.

## Goals

- [ ] A red dot sits over the taskbar icon from the first OS toast while the window is away until the window is focused again
- [ ] The dot fires on exactly the same rule as the OS toast, with no new setting

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| A count of unseen notifications | Owner chose a dot only |
| A dot for in-app notices or while focused | The dot means "while you were away" |
| Its own on/off switch | Owner chose to follow the existing switches |
| Flashing the taskbar button, sounds | Not asked |
| macOS dock / Linux launcher badges | Windows is the only packaged target |
| Clearing per session | Clears on window focus only |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| When the dot appears | Whenever `SessionNotifier` shows an OS toast (surface `os`) | That surface already means "window unfocused or minimized, switches on, real state change" (NOTF-24) | y |
| When the dot clears | On the window's `focus` event (also fired by `revealWindow` after a toast click) | Owner choice; matches Teams/Slack | y |
| Shape | One fixed red-dot image bundled with the app, set as the window's overlay icon | No runtime drawing for a dot without a count | y |
| Accessible description | The overlay carries the description `Unseen notifications` | `setOverlayIcon` takes a description for screen readers | y |
| A toast while the dot is already shown | No-op | One dot, no stack | y |
| Platform without overlay support | The call does nothing | Same rule as toasts where unsupported (NOTF-06) | y |
| Window destroyed when a toast fires | Skip the dot | Same guard as `revealWindow` (NOTF-21) | y |
| Remaining implicit dimensions (persistence, external calls, auth, data lifecycle) | N/A | In-memory window state; nothing stored | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: A dot marks a notification I missed ⭐ MVP

**User Story**: As a developer running several sessions, I want a red dot on the taskbar icon when a session notifies me while I am away, so that I notice it after the toast is gone.

**Why P1**: It is the whole request.

**Acceptance Criteria**:

1. WHEN the session notifier shows an OS toast THEN the app SHALL set the red-dot overlay on the window's taskbar icon. <!-- event-driven -->
2. WHEN the session notifier shows an in-app notice or no notification THEN the app SHALL leave the overlay unchanged. <!-- event-driven -->
3. WHEN the main window gains focus THEN the app SHALL clear the overlay. <!-- event-driven -->
4. WHILE the overlay is set, WHEN another OS toast is shown THEN the app SHALL keep a single dot. <!-- complex -->
5. IF the window is destroyed or the platform has no overlay support THEN the app SHALL skip the dot without error. <!-- unwanted-behavior -->

**Independent Test**: Unfocus the window, let a session finish its turn, see the dot; click the app's taskbar button, see it go.

---

## Edge Cases

- WHEN notifications are switched off, globally or for that state, THEN the app SHALL not set the dot, because no OS toast is shown.
- WHEN the user clicks the toast THEN the dot SHALL clear, because revealing the window focuses it.
- WHEN the window is minimized and a toast fires THEN the app SHALL set the dot.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TBDT-01 | P1 (AC 1, edge cases 1 and 3) | Execute | Verified |
| TBDT-02 | P1 (AC 2) | Execute | Verified |
| TBDT-03 | P1 (AC 3, edge case 2) | Execute | Verified |
| TBDT-04 | P1 (AC 4) | Execute | Verified |
| TBDT-05 | P1 (AC 5) | Execute | Verified |

**Coverage:** 5 total, 5 mapped to Execute, 0 unmapped

---

## Success Criteria

- [x] After a toast fires while the window is away, the dot is visible on the taskbar until the window is focused

---

## Follow-ups (from validation)

- F1: the smoke's one-dot and notifications-off checks do not confirm the toast itself went out; count `Notification.prototype.show` calls.
- F2: no check clicks a real toast end to end; hand-verify once.
- F3: TBDT-05 (no overlay off Windows or on a destroyed window) is read from the code only.
- F4: the dot's look on the taskbar and the packaged build are hand-verify items.
