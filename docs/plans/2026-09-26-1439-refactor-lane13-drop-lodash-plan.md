---
title: "Lane 13 (U13) - refactor: drop lodash"
type: refactor
date: 2026-09-26
topic: drop-lodash
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#16
train: "10.0.0"
---

# Lane 13 - refactor: drop lodash

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 10.0.0
- **Branch:** `refactor/drop-lodash` based on `refactor/axios-to-fetch`
- **Upstream items:** jeffbski/wait-on#212, jeffbski/wait-on#172
- **Rebased from upstream PR:** none
- **Allowed paths:** `lib/wait-on.js`, `package.json`, `package-lock.json`, `test/**`

## Implementation unit

### U13. L13 drop lodash (#212)

**Goal:** replace the remaining lodash uses with native equivalents, and remove the dependency.
**Requirements:** R4.
**Dependencies:** U12.
**Files:** `lib/wait-on.js`, `package.json`, `package-lock.json`.
**Test expectation:** the existing suite is the parity bar. Add a test only where a replaced helper had edge-case semantics (for example `pick` with undefined keys, or deep `merge`/`defaults`).
**Verification:** `lodash` is absent from `npm ls --prod`, and the suite passes.
