---
title: "Lane 4 (U4) - fix: fail fast on malformed http/tcp resources and support tcp IPv6"
type: fix
date: 2026-09-26
topic: resource-validation
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#8
train: "9.1.1"
---

# Lane 4 - fix: fail fast on malformed http/tcp resources and support tcp IPv6

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.1.1
- **Branch:** `fix/resource-validation` based on `fix/windows-named-pipes`
- **Upstream items:** jeffbski/wait-on#217, jeffbski/wait-on#140, jeffbski/wait-on#141
- **Rebased from upstream PR:** none
- **Allowed paths:** `lib/wait-on.js`, `test/**`
- **Lane PR:** kevinold/wait-on#23

## Implementation unit

### U4. L4 resource validation (#217, #140, #141)

**Goal:** malformed resources fail fast with an actionable error instead of polling to timeout.
**Requirements:** R4.
**Dependencies:** U3.
**Files:** `lib/wait-on.js` (`HOST_PORT_RE`, resource parse around `createHTTP$` / `createTCP$`), `test/api.mocha.js`, `test/cli.mocha.js`.
**Approach:**
- Validate http resources syntactically: require `//` right after the scheme once the prefix is stripped (`http://unix:` included), then parse with `new URL`. `new URL('http:localhost:3000/x')` parses successfully, so parsing alone cannot catch #217.
- Accept `tcp:[ipv6]:port`.
- Reject `tcp://…` with a message that points at the `tcp:host:port` form.
**Execution note:** write each reproduction as a failing test first. Each one currently times out.
**Test scenarios:**
- `http-get:localhost:P/x` rejects promptly with an error naming the resource. Covers #217.
- `tcp://127.0.0.1:P` rejects with the "use tcp:host:port" message. Covers #140.
- `tcp:[::1]:P` succeeds against an IPv6 listener. Covers #141.
- `tcp:[::1]:P` with nothing listening times out normally, with no TypeError.
- A valid `tcp:localhost:P` and `http://localhost:P` still succeed (regression).
- CLI exit code is non-zero, and stderr names the bad resource.
**Verification:** new tests pass, and none of them relies on the global timeout to fail.
