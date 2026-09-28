---
title: "Lane 8 (U8) - feat: repeatable -H/--header CLI flag"
type: feat
date: 2026-09-26
topic: header-flag
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#12
train: "9.2.0"
---

# Lane 8 - feat: repeatable -H/--header CLI flag

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.2.0
- **Branch:** `feat/cli-header-flag` based on `feat/cli-parseargs`
- **Upstream items:** jeffbski/wait-on#126
- **Rebased from upstream PR:** none
- **Allowed paths:** `bin/wait-on`, `bin/usage.txt`, `README.md`, `test/**`
- **Lane PR:** kevinold/wait-on#27

## Implementation unit

### U8. L8 `--header` flag (#126)

**Goal:** a repeatable `-H/--header "Name: value"` for http resources.
**Requirements:** R4.
**Dependencies:** U7.
**Files:** `bin/wait-on`, `bin/usage.txt`, `README.md`, `test/cli.mocha.js`.
**Test scenarios:**
- A single `-H "X-Test: 1"` reaches the server.
- Two `-H` flags both reach the server.
- A header value containing `:` is split only at the first colon.
- A malformed header without `:` exits non-zero with a message.
- CLI headers merge with config-file `headers`. Define and test which wins; the CLI should win.
**Verification:** tests pass, and usage and README document the flag.
