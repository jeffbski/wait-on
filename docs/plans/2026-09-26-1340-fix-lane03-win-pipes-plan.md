---
title: "Lane 3 (U3) - fix: support Windows named pipes in http://unix: resources"
type: fix
date: 2026-09-26
topic: win-pipes
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#7
train: "9.1.1"
---

# Lane 3 - fix: support Windows named pipes in http://unix: resources

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.1.1
- **Branch:** `fix/windows-named-pipes` based on `fix/deps-9.1.x`
- **Upstream items:** jeffbski/wait-on#223
- **Rebased from upstream PR:** jeffbski/wait-on#223 (original authorship preserved, KD4)
- **Allowed paths:** `lib/wait-on.js`, `.github/workflows/node.js.yml`, `package.json`, `test/**`
- **Lane PR:** kevinold/wait-on#22

## Implementation unit

### U3. L3 Windows named pipes (rebase upstream #223)

**Goal:** `http://unix:` accepts Windows named-pipe paths, and CI adds a Windows row. Classified as a patch: `http://unix:` is documented as cross-platform, and on Windows it mis-parses at the first colon today, so this fixes a platform bug rather than adding a new option.
**Requirements:** R4, R5.
**Dependencies:** U2.
**Files:** `lib/wait-on.js` (`HTTP_UNIX_RE`, socket parse), `.github/workflows/node.js.yml`, `package.json` (test glob quoting), `test/api.mocha.js`, `test/cli.mocha.js`.
**Approach:** cherry-pick #223's commit, keeping its author. Resolve the workflow conflict with U1 by keeping engine-strict and the unfiltered trigger.
**Test scenarios:**
- `http://unix:\\.\pipe\name:/path` resolves the pipe and the request path. Windows row only.
- A POSIX `http://unix:/tmp/sock:/path` still resolves, which proves the old regex fallback.
- A path with extra colons after the socket part keeps the remainder as the request path.
**Verification:** green on ubuntu and windows rows.
