---
title: "Lane 6 (U6) - docs: httpTimeout, validateStatus, strictSSL, HEAD vs GET, localhost"
type: docs
date: 2026-09-26
topic: docs
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#10
train: "9.1.1"
---

# Lane 6 - docs: httpTimeout, validateStatus, strictSSL, HEAD vs GET, localhost

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.1.1
- **Branch:** `docs/9.1.x` based on `fix/tcp-socket-cleanup`
- **Upstream items:** jeffbski/wait-on#185, jeffbski/wait-on#139, jeffbski/wait-on#187, jeffbski/wait-on#100, jeffbski/wait-on#78, jeffbski/wait-on#109
- **Rebased from upstream PR:** none
- **Allowed paths:** `README.md`, `bin/usage.txt`, `exampleConfig.js`
- **Lane PR:** kevinold/wait-on#25

## Implementation unit

### U6. L6 docs 9.1.x

**Goal:** fix docs-only issues: #185 duplicate httpTimeout, #139 and #187 `validateStatus` from a config file, #100 `strictSSL` default, #78 HEAD vs GET, #109 localhost on Node 20+.
**Requirements:** R4, R5.
**Dependencies:** U5.
**Files:** `README.md`, `bin/usage.txt`, `exampleConfig.js`.
**Approach:** add an example `validateStatus` accepting any non-5xx to `exampleConfig.js`. List the upstream items the ledger closes against this PR.
**Test expectation:** none -- docs only.
**Verification:** each httpTimeout entry appears once, with the real default (no timeout). The example config loads under `--config` in a quick manual run.
