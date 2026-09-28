---
title: "Lane 10 (U10) - feat: TypeScript definitions"
type: feat
date: 2026-09-26
topic: ts-types
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#14
train: "9.2.0"
---

# Lane 10 - feat: TypeScript definitions

Lane-scoped extract of the spine plan (`docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md`). The spine plan is authoritative for cross-lane decisions (KD/KTD IDs cited below).

## Lane contract

- **Train:** 9.2.0
- **Branch:** `feat/typescript-types` based on `feat/api-string-opts`
- **Upstream items:** jeffbski/wait-on#35, jeffbski/wait-on#197
- **Rebased from upstream PR:** jeffbski/wait-on#197 (original authorship preserved, KD4)
- **Allowed paths:** `index.d.ts`, `package.json`, `package-lock.json`, `test/**`

## Implementation unit

### U10. L10 TypeScript types (rebase upstream #197)

**Goal:** ship `index.d.ts` (#35), including the U9 string overload.
**Requirements:** R4, R5.
**Dependencies:** U9.
**Files:** `index.d.ts`, `package.json` (`types` only; the existing `.npmignore` already ships `index.d.ts`), `package-lock.json`, a type test under `test/`.
**Approach:** cherry-pick #197 with its author and resolve the lockfile against U2. Upstream #107 is superseded (ledger).
**Test scenarios:**
- The type test compiles valid usages: object, string and array opts, promise and callback forms, and `validateStatus`.
- Invalid usages, such as an unknown option and a wrong `timeout` type, fail compilation (`@ts-expect-error`).
**Verification:** the type check runs in `npm test` and passes. `npm pack` includes `index.d.ts` and `bin/usage.txt`.
