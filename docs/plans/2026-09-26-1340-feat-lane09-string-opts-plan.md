---
title: "Lane 9 (U9) - feat: accept a string or string array as waitOn opts"
type: feat
date: 2026-09-26
topic: string-opts
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#13
train: "9.2.0"
---

# Lane 9 - feat: accept a string or string array as waitOn opts

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.2.0
- **Branch:** `feat/api-string-opts` based on `feat/cli-header-flag`
- **Upstream items:** jeffbski/wait-on#61
- **Rebased from upstream PR:** jeffbski/wait-on#61 (original authorship preserved, KD4)
- **Allowed paths:** `lib/wait-on.js`, `test/**`
- **Lane PR:** kevinold/wait-on#28

## Implementation unit

### U9. L9 string opts (rebase upstream #61)

**Goal:** `waitOn('tcp:3000')` accepts a string or a string array as the resources shorthand.
**Requirements:** R4, R5.
**Dependencies:** U8.
**Files:** `lib/wait-on.js`, `test/api.mocha.js`.
**Test scenarios:**
- A string resolves exactly like `{resources: [string]}`.
- An array of strings resolves like `{resources: arr}`.
- An object passes through unchanged.
- A callback form works with a string.
**Verification:** tests pass.
