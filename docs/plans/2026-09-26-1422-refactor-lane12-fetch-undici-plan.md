---
title: "Lane 12 (U12) - refactor!: replace axios with native fetch and undici (Node >=22.19)"
type: refactor
date: 2026-09-26
topic: fetch-undici
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#1
train: "10.0.0"
---

# Lane 12 - refactor!: replace axios with native fetch and undici (Node >=22.19)

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 10.0.0
- **Branch:** `refactor/axios-to-fetch` based on `feat/command-resource`
- **Upstream items:** jeffbski/wait-on#176, jeffbski/wait-on#149
- **Rebased from upstream PR:** none
- **Allowed paths:** `lib/wait-on.js`, `package.json`, `package-lock.json`, `.github/workflows/node.js.yml`, `index.d.ts`, `README.md`, `test/**`, `docs/plans/**`

## Implementation unit

### U12. L12 fetch + undici (fork PR #2) — train 10.0.0 starts

**Goal:** remove axios in favour of `fetch` + undici. Engines become ≥22.19 and the CI matrix becomes 22/24/26, keeping the Windows row.
**Requirements:** R4, R5. Follows KD3, KTD4.
**Dependencies:** U11.
**Files:** `lib/wait-on.js`, `package.json`, `package-lock.json`, `.github/workflows/node.js.yml`, `index.d.ts` (proxy types), `README.md`, tests per `docs/plans/2026-09-16-0754-refactor-axios-to-fetch-plan.md`.
**Approach:**
1. Rebase the existing branch onto U11 and retarget PR #2's base.
2. Reconcile with U3's `HTTP_UNIX_RE` and U4's URL validation.
3. Add `Co-authored-by` for upstream #196 and #177 authors.
   Expect conflicts in most of the four existing commits, because L3, L4, L5, L9 and L11 all rewrite `lib/wait-on.js`. Squashing to one commit before rebasing is acceptable.
4. Re-check the default `Accept` header behaviour (#78).
**Test scenarios:** as in the origin axios plan (parity suite, proxy, TLS client options), plus:
- A Windows named-pipe resource still resolves through the undici `socketPath` dispatcher.
- A malformed-URL rejection (U4) still fires before any fetch.
**Verification:** green on 22/24/26 and windows. `axios` is absent from `npm ls`.
