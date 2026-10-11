# Rail Clock Paint Artifacts Specification

## Problem Statement

On a session row in the rail, small dark specks sometimes appear just above the session clock's digits and
change as it ticks (issue #173). A magnified capture shows one block about 1 px tall over each digit of
`hh:mm:ss`, never over the colons, several with a sub-pixel colour fringe, on a working row whose loader was
spinning. The cause is not measured. The leading suspect is a stale paint strip around the once-a-second text
change at a fractional device pixel ratio, next to the loader's composited layer.

## Goals

- [ ] The cause is measured and recorded before any fix lands
- [ ] The clock's digits repaint with no leftover pixels at every scale that reproduced the specks

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Redesigning the clock (size, font, position) | The defect is paint, not layout; the row stays as AD-021 drew it |
| The Agents view's clock, unless the measurement shows the same specks there | It renders the same `SessionClock`, so the fix may cover it; it is not a separate goal |
| Other text that repaints next to an animation | Fix what is reported; a general paint audit is a different task |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Display scale of the report | Unknown; measure at 100%, 125% and 150% | Owner does not know and runs more than one monitor | y |
| Measure before fixing | A measurement step comes first and gates the fix | The cause is inferred; a fix chosen before measuring may only move the specks | y |
| How to reproduce at a given scale | `--force-device-scale-factor` on the built app, plus one capture at the real monitor scale | Lets the scales be tested on one machine; the real-scale capture guards against the switch hiding the bug | y |
| Candidate fixes, in order of preference | (1) contain the clock's paint (its own layer or `contain: paint`, an opaque background under the text); (2) integer font size; (3) isolate the loader's layer | Ordered from least to most visual change; the measurement picks which one | y |
| If the specks do not reproduce at any scale | Stop, report the measurement on #173, and leave the code untouched | No fix without a reproduction to prove it | y |
| Remaining implicit dimensions | N/A for this scope | Pure renderer paint; no state, calls or data | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Measure the cause ⭐ MVP

**User Story**: As the maintainer, I want the specks reproduced and their cause measured, so that the fix targets the real mechanism.

**Why P1**: The fix depends on it.

**Acceptance Criteria**:

1. The measurement SHALL capture a working rail row for at least 3 minutes at device scale factors 1, 1.25 and 1.5, with Paint flashing and Layer borders on
2. The measurement SHALL record, for each scale, whether the specks appear, whether they need the loader to be spinning, and the invalidated rectangle on a clock tick
3. WHEN the measurement ends THEN its result SHALL be posted on #173 and written to `.specs/features/rail-clock-paint/` before any code changes
4. IF no scale reproduces the specks THEN the work SHALL stop after posting the measurement, with no code change

**Independent Test**: The comment on #173 names the scales tried, the reproductions, and the confirmed or overturned cause.

---

### P1: Repaint the clock cleanly ⭐ MVP

**User Story**: As a developer watching an agent work, I want the clock to read cleanly, so that the row does not look broken.

**Why P1**: The visible defect.

**Acceptance Criteria**:

1. WHILE a session is working the rail clock SHALL repaint with no pixels outside its glyphs left from an earlier tick, at every scale that reproduced the specks
2. WHILE a session is not working the rail clock SHALL repaint with no leftover pixels at the same scales
3. The fix SHALL keep the clock's font family, size, colour and position in the row unchanged, to the pixel, at scale 1
4. The fix SHALL keep the 1 s tick inside `SessionClock`, so the row does not re-render once a second

**Independent Test**: Before and after captures at each reproducing scale, over 3 minutes of a working session.

---

## Edge Cases

- WHERE the user has reduced motion on the loader SHALL NOT spin, and the clock SHALL still repaint cleanly
- WHEN the window moves to a monitor with another scale THEN the clock SHALL repaint cleanly at the new scale

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RCLK-01 | P1: Measure | Execute | Verified, with the deviation in measurement.md |
| RCLK-02 | P1: Measure | Execute | Partial: scales and invalidation recorded; the loader question unanswered (measurement.md) |
| RCLK-03 | P1: Measure | Execute | Verified: posted on #173 and written to measurement.md before any code change |
| RCLK-04 | P1: Measure | Execute | N/A: it reproduced; stopped by the owner's decision instead (measurement.md) |
| RCLK-05 | P1: Repaint | - | Not implemented: cause unknown, no proven target (measurement.md) |
| RCLK-06 | P1: Repaint | - | Not implemented: cause unknown, no proven target (measurement.md) |
| RCLK-07 | P1: Repaint | - | Not implemented: cause unknown, no proven target (measurement.md) |
| RCLK-08 | P1: Repaint | - | Not implemented: cause unknown, no proven target (measurement.md) |
| RCLK-09 | Edge cases | - | Not implemented: cause unknown, no proven target (measurement.md) |
| RCLK-10 | Edge cases | - | Not implemented: cause unknown, no proven target (measurement.md) |

**Coverage:** 10 total; RCLK-01..04 measured, RCLK-05..10 not implemented by the owner's decision.

---

## Success Criteria

- [x] #173 carries the measurement (the cause is still unknown)
- [ ] No specks over 3 minutes at any scale that reproduced them before (not attempted: no fix)
