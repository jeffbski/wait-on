---
title: "Lane 11 (U11) - feat: command: resource"
type: feat
date: 2026-09-26
topic: command-resource
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#15
train: "9.2.0"
---

# Lane 11 - feat: command: resource

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.2.0
- **Branch:** `feat/command-resource` based on `feat/typescript-types`
- **Upstream items:** jeffbski/wait-on#87, jeffbski/wait-on#88, jeffbski/wait-on#15, jeffbski/wait-on#71
- **Rebased from upstream PR:** jeffbski/wait-on#88 (original authorship preserved, KD4)
- **Allowed paths:** `lib/wait-on.js`, `index.d.ts`, `bin/usage.txt`, `README.md`, `test/**`

## Implementation unit

### U11. L11 `command:` resource (rebase upstream #88)

**Goal:** `command:<shell command>` succeeds when the command exits 0. This covers #87, #15, #71 and answers #96 and #108.
**Requirements:** R4, R5.
**Dependencies:** U10.
**Files:** `lib/wait-on.js` (`PREFIX_RE`, `createResource$`), `index.d.ts`, `bin/usage.txt`, `README.md`, `test/api.mocha.js`.
**Approach:** cherry-pick #88 with its author, then add follow-up commits for:
1. One in-flight exec per command resource, regardless of `simultaneous`.
2. Kill the exec at `httpTimeout`-equivalent per-attempt bounds, or a new `commandTimeout` option. Choose at implementation and document it.
3. Types and docs.
**Test scenarios:**
- `command:true` succeeds.
- `command:false` keeps polling until the global timeout.
- A command that becomes true after N polls succeeds.
- A slow command (sleep longer than the interval) is never run concurrently with itself.
- A hung command is killed at the per-attempt bound, and polling continues.
- Reverse mode waits until the command fails.
**Verification:** tests pass, and the process count stays at 1 during the slow-command test.
