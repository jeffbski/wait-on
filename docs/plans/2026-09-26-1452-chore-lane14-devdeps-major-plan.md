---
title: "Lane 14 (U14) - chore(deps): eslint 10 and mocha 12"
type: chore
date: 2026-09-26
topic: devdeps-major
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#17
train: "10.0.0"
---

# Lane 14 - chore(deps): eslint 10 and mocha 12

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 10.0.0
- **Branch:** `chore/devdeps-major` based on `refactor/drop-lodash`
- **Upstream items:** none
- **Rebased from upstream PR:** none
- **Allowed paths:** `package.json`, `package-lock.json`, `eslint.config.mjs`, `.nycrc.json`

## Implementation unit

### U14. L14 dev-deps major

**Goal:** eslint 10 (flat-config updates) and mocha 12, now that the floor is Node 22.19.
**Requirements:** R4.
**Dependencies:** U13.
**Files:** `package.json`, `package-lock.json`, `eslint.config.mjs`, `.nycrc.json` if needed.
**Test expectation:** none -- dev tooling. Lint and the suite are the bar.
**Verification:** `npm test` passes with no lint rule silently disabled.
