---
title: "Lane 5 (U5) - fix: destroy tcp/unix sockets after checks"
type: fix
date: 2026-09-26
topic: socket-cleanup
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#9
train: "9.1.1"
---

# Lane 5 - fix: destroy tcp/unix sockets after checks

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.1.1
- **Branch:** `fix/tcp-socket-cleanup` based on `fix/resource-validation`
- **Upstream items:** jeffbski/wait-on#82
- **Rebased from upstream PR:** none
- **Allowed paths:** `lib/wait-on.js`, `test/**`
- **Lane PR:** kevinold/wait-on#24

## Implementation unit

### U5. L5 TCP and socket cleanup (#82)

**Goal:** stop leaking connections: `destroy()` instead of `end()` in the tcp and socket checks.
**Requirements:** R4.
**Dependencies:** U4.
**Files:** `lib/wait-on.js` (`tcpExists`, `socketExists`), `test/api.mocha.js`.
**Test scenarios:**
- After a successful tcp check, the test server sees its connection closed. The server's connection count returns to 0.
- A timed-out tcp attempt against a non-accepting socket leaves the client socket `destroyed` and no leftover `TCPWrap` in `process.getActiveResourcesInfo()`. Assert this inside the test, because `mocha --exit` masks hangs.
- A unix socket check does the same.
**Verification:** tests pass. No behaviour change beyond cleanup.
