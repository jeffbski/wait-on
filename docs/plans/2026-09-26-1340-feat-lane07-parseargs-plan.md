---
title: "Lane 7 (U7) - feat: use util.parseArgs instead of minimist"
type: feat
date: 2026-09-26
topic: parseargs
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#11
train: "9.2.0"
---

# Lane 7 - feat: use util.parseArgs instead of minimist

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.2.0
- **Branch:** `feat/cli-parseargs` based on `docs/9.1.x`
- **Upstream items:** jeffbski/wait-on#218
- **Rebased from upstream PR:** jeffbski/wait-on#218 (original authorship preserved, KD4)
- **Allowed paths:** `bin/wait-on`, `package.json`, `package-lock.json`, `test/**`
- **Lane PR:** kevinold/wait-on#26

## Implementation unit

### U7. L7 parseArgs (rebase upstream #218) — train 9.2.0 starts

**Goal:** replace minimist with `util.parseArgs` and drop the minimist dependency.
**Requirements:** R4, R5. Follows KTD5.
**Dependencies:** U6.
**Files:** `bin/wait-on`, `package.json`, `package-lock.json`, `test/cli.mocha.js`.
**Approach:** cherry-pick #218 with its author, then add a follow-up commit (KTD5) that:
- sets `strict: false`
- parses with `tokens: true` and treats the argument after an unknown `--flag` (no `=`) as that flag's value, matching minimist
- maps `no-<x>` keys to `<x>: false` by hand, because `allowNegative` needs Node ≥20.16 and the 9.x floor stays `>=20.0.0`
**Test scenarios:**
- Every documented flag in `bin/usage.txt` parses to the same option as before (table-driven).
- An unknown flag is ignored, not an error.
- `--unknown val tcp:P` waits only on `tcp:P`, and `val` is not treated as a resource.
- Short aliases and `--no-*` boolean forms behave as before.
**Verification:** the existing CLI suite passes, and `minimist` is gone from dependencies.
