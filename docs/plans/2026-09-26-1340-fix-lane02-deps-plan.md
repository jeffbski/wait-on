---
title: "Lane 2 (U2) - fix(deps): refresh dependencies within majors"
type: fix
date: 2026-09-26
topic: deps
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#6
train: "9.1.1"
---

# Lane 2 - fix(deps): refresh dependencies within majors

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.1.1
- **Branch:** `fix/deps-9.1.x` based on `ci/engine-strict-stack-trigger`
- **Upstream items:** jeffbski/wait-on#221, jeffbski/wait-on#222, jeffbski/wait-on#224
- **Rebased from upstream PR:** none
- **Allowed paths:** `package.json`, `package-lock.json`
- **Lane PR:** kevinold/wait-on#21

## Implementation unit

### U2. L2 dependency refresh (9.1.x)

**Goal:** take current compatible versions: axios ^1.20.0, joi ^18.2.9, eslint 9.39.5, mocha 11.8.0, and the transitive js-yaml and @humanfs/node bumps.
**Requirements:** R4. Supersedes upstream #221, #222, #224. Interim for #149.
**Dependencies:** U1.
**Files:** `package.json`, `package-lock.json`.
**Approach:** bump within majors only, then regenerate the lockfile.
**Test expectation:** none -- dependency bump. The existing suite is the bar.
**Verification:** `npm ci --engine-strict` and `npm test` pass on Node 20.
