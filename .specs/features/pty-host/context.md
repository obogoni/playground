# PTY Host Context

**Gathered:** 2026-10-02
**Spec:** `.specs/features/pty-host/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Move node-pty out of the Electron main process into a PTY host (`utilityProcess`), so creating a
ConPTY never blocks main's event loop. Main keeps owning sessions, persistence, scrollback, activity
hooks and renderer routing. Source: issue #155.

---

## Implementation Decisions

### Spawn failure (async spawn)

- Main awaits the host's "spawned" acknowledgement before answering `sessions:spawn` /
  `sessions:respawn` / `sessions:duplicate`. The renderer waits as long as the ConPTY takes (~300 ms);
  main's event loop does not.
- A failed spawn behaves exactly as today: the invoke rejects, the renderer shows the toast, nothing
  is persisted, and main logs the plan (file/args/cwd) with the error (#89).

### PTY host crash

- Every running session is finalized as `stopped` and its terminal prints
  `[PTY host exited unexpectedly]`.
- The host is recreated, so the next spawn or respawn works without restarting the app.
- No session is respawned automatically.

### Fallback

- No in-process fallback. One code path; reverting the PR is the escape hatch.

### Agent's Discretion

- The scrollback ring buffer (`SessionRingBuffer`) stays in main: the smaller change, append cost is
  already proportional to the chunk (#154), and replay keeps riding `session:data` unchanged.
- The host starts eagerly when the app is ready, so the first spawn does not pay the host start-up.
- Message protocol, proxy shape and how the host is recreated are Design's call.

### Declined / Undiscussed Gray Areas → Assumptions

- Ring buffer location and eager start: stated as defaults to the owner, not objected to; logged in the
  spec's Assumptions table.

---

## Specific References

- Issue #155 (problem, CPU-profile numbers, implementation decisions to settle).
- `.specs/features/multi-agent-performance/validation.md` — the `WindowsPtyAgent` rows ("Not addressed").
- Memory: esbuild/native modules in the packaged Electron build — validate with `build:win`, not `dev`.

---

## Deferred Ideas

- Possibly contains the #103 crash (`write EAGAIN` closing an opencode session) — not verified to be
  the same cause; not a goal of this feature.
