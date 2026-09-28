---
title: "Lane 1 (U1) - ci: npm ci --engine-strict and run CI on PRs to any base"
type: chore
date: 2026-09-26
topic: ci
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#5
train: "9.1.1"
---

# Lane 1 - ci: npm ci --engine-strict and run CI on PRs to any base

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.1.1
- **Branch:** `ci/engine-strict-stack-trigger` based on `master`
- **Upstream items:** jeffbski/wait-on#186
- **Rebased from upstream PR:** none
- **Allowed paths:** `.github/workflows/node.js.yml`
- **Lane PR:** kevinold/wait-on#19

## Implementation unit

### U1. L1 CI: engine-strict and stacked-PR trigger

**Goal:** add `npm ci --engine-strict` (#186) and run CI on PRs to any base (KTD3).
**Requirements:** R1, R2.
**Dependencies:** U0.
**Files:** `.github/workflows/node.js.yml`.
**Approach:**
- Remove the `pull_request.branches` filter.
- Make the install step `npm ci --engine-strict`.
- Keep the 20/22/24 matrix.
**Test expectation:** none -- CI config. Proof is the lane's own workflow run.
**Verification:** the PR's CI runs on all three Node versions and passes.
