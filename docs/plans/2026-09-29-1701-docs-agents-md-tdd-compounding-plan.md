---
title: Strict TDD and Mandatory Compounding in AGENTS.md - Plan
type: docs
date: 2026-09-29
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Strict TDD and Mandatory Compounding in AGENTS.md - Plan

## Goal Capsule

- Objective: any agent or engineer working in wait-on writes every executable change test-first, turns every named risk into a failing test before code, and leaves each non-trivial learning in `docs/solutions/`, so a defect like the #238 env-proxy TLS drop is caught by a red test during implementation instead of by a reviewer afterwards.
- Means: two new mandatory sections in `AGENTS.md` (KTD1, KTD2), adapted from an existing house TDD discipline and compounding policy with all source-project specifics removed.
- Authority: R-IDs own section content; KTDs own placement and wording mechanics; units cite both.
- Execution profile: worktree `.claude/worktrees/docs-agents-md-tdd` (branch `worktree-docs-agents-md-tdd`); only `AGENTS.md` and `docs/**` change; this plan commits with the `AGENTS.md` change.
- Stop conditions: stop and surface if meeting a requirement would mean editing the managed `<!-- overdrive:start -->` ... `<!-- overdrive:end -->` block, or if `npm test` fails for a reason this docs-only change could have caused.

---

## Product Contract

### Summary

`AGENTS.md` gains a `## Test-Driven Development (Mandatory)` section: the red-green-refactor cycle, a right-reason red check, and rules that target the #238 miss (named risk becomes a failing test, every dispatch branch tested, option combinations enumerated as a matrix, tests prove the routed path ran). It absorbs the scattered Conventions testing lines. A `## Compounding Knowledge (Mandatory)` section follows it, making `/ce-compound` a required close-out step that plans carry as a Definition of Done bullet and PRs attest.

### Problem Frame

`AGENTS.md` says only "A bug fix starts with a failing test that reproduces it." PR jeffbski/wait-on#238 (axios to undici fetch) shows the cost. Its plan named the risk that undici's `ProxyAgent` does not attach per-request TLS, and it assigned a prose "verify" step. That step was applied to the explicit-proxy branch only. With `HTTP_PROXY`/`HTTPS_PROXY` set, `EnvHttpProxyAgent` dropped `strictSSL`/`ca`/`cert`/`key`/`passphrase` for HTTPS targets. TLS tests were direct-only and proxy tests used plain-HTTP targets, so no test combined HTTPS target × proxy mode × TLS option; a parity review then marked the env branch at parity unchecked. An external reviewer found it.

Separately, learnings from sessions like that one are not captured: `docs/solutions/` holds only its README, and the only compounding guidance is an advisory loop inside the managed overdrive block.

### Requirements

**TDD section content**

- R1. A `## Test-Driven Development (Mandatory)` section states that all executable code (`lib/`, `bin/`, `index.d.ts`, scripts, test helpers) and all configuration, tooling, and CI changes are written test-first with no exceptions; docs-only edits (`README.md`, `AGENTS.md`, `docs/**`) are the one carve-out. Where a mocha test cannot go red, RED is the nearest failing check: a type test in `test/types.test-d.ts` (run by `npm run test:types`) for `index.d.ts`, or a command-level check observed failing before the change (e.g. `npm test`, `npm pack --dry-run` output) for config, tooling, and CI.
- R2. The section gives the cycle as an ordered list: RED (one failing test in the matching `test/*.mocha.js`, or the R1 seam when mocha cannot go red), right-reason check, GREEN (minimum code), full `npm test`, REFACTOR on green only, repeat.
- R3. Right-reason red: a test counts as red only after it is seen failing on the assertion that describes the missing behavior (not a typo, harness error, port collision, or timeout from a broken setup). A test that passes on first run is investigated before any code is written. For a bug fix, temporarily undoing the fix must make the new test fail with the expected error.
- R4. Bug fixes and externally reported defects start with a failing reproduction at the layer where the bug shows (API test for `lib/`, subprocess CLI test for `bin/`).
- R5. Named risks become failing tests: every plan risk, Outstanding Question, or "verify X" step names the test that answers it, and execution writes that test before the code it guards. A prose verification step does not satisfy it. When the risk concerns one branch of a selection or dispatch function (R6), its test runs on every sibling branch that shares the mechanism at risk, unless the plan records a reasoned carve-out for that branch. This also binds plan authors: an Outstanding Question without a named test is incomplete.
- R6. Every branch of a selection or dispatch function has a test (e.g. the `createResource$` prefix switch, `validateResource`, any function choosing an agent/dispatcher by option); adding a branch adds its test.
- R7. Input combinations are a matrix: a change to how two or more inputs interact (inputs include options, resource kind and scheme such as http vs https targets, and environment variables such as `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`) is planned as an enumerated matrix, and each reachable cell gets a test or an explicit, reasoned carve-out recorded in the plan. Testing each option alone does not cover their combination.
- R8. A test of a routed or conditional path asserts that the path actually ran (e.g. the stub proxy counted a CONNECT tunnel), not only the final outcome.
- R9. Coverage (`npm run test:coverage`) is a signal, not proof; full line/branch coverage can still miss a matrix cell.
- R10. wait-on test mechanics: behavior assertions on what `waitOn` resolves/rejects and the CLI's exit code/stdout/stderr; real servers, sockets, and files, stubbing only at the network edge with local servers; API/CLI parity tested at both front doors; self-contained tests (ephemeral ports, temp paths, skip-not-fail when a tool like `openssl` is missing, Windows delete-pending flakes fixed with test headroom and retry, not `lib/` changes), citing the Conventions CI bullet for platform rules rather than restating it; behavior-describing `it('should ...')` names.
- R11. Clock rule: timing-dependent tests run on a fake clock that virtualizes rxjs scheduling and freezes `Date` while leaving global timers real (network teardown needs them; node:test `mock.timers` breaks rxjs intervals on Node 22.19). Only fixed-state tests freeze; tests whose resource changes via a real `setTimeout`, and CLI subprocess tests, stay on the real clock with generous headroom. The rule holds whether or not a shared frozen-clock helper exists in `test/`, and it states itself as a deliberate wait-on exception to any freeze-the-clock-globally rule: do not convert real-clock tests.
- R12. An anti-pattern list: all tests first then all code, over-implementing on GREEN, mirror tests, skipping RED verification, mocking wait-on's own modules or rxjs, and leaving `.only`/`.skip` in the diff.
- R13. The Conventions sentence "A bug fix starts with a failing test that reproduces it." and the Conventions time-dependent-tests bullet are removed; Conventions points to the new section instead.

**Compounding section content**

- R14. A `## Compounding Knowledge (Mandatory)` section requires running `/ce-compound` (`compound-engineering:ce-compound`) after any non-trivial fix, architectural decision, or pattern discovery, writing or updating `docs/solutions/`.
- R15. Timing and mode: once per plan at close, before the shipping PR opens (so the `docs/solutions/` change lands in the same PR), plus mid-execution when an unanticipated pattern appears; headless runs (`/lfg` and other unattended runs) use `mode:non-interactive`, interactive sessions may run it bare.
- R16. The invocation is never skipped, and this overrides any skill's conditional compound step (e.g. `/lfg`'s): invoke it and let the skill decide whether anything qualifies. Only that run's own skip report (`Documentation skipped` with its reason) satisfies the item when nothing qualified; a close-out run uses `mode:non-interactive` so it ends on that parseable signal.
- R17. Every `ce-unified-plan/v1` plan dated on or after 2026-09-29 carries the Definition of Done bullet below verbatim; earlier plans are grandfathered; doc-review and simplification passes must not strip or soften it. Every plan-backed PR body carries a `### Compounding` line naming the `docs/solutions/` path(s) or `Documentation skipped: <reason>` copied from the skill's report.

  ```markdown
  - Run `/ce-compound` (`mode:non-interactive` when no human is present) for each non-trivial learning this work produced — new or updated `docs/solutions/` doc in the same PR; never skip the invocation — only that run's own skip report (reason recorded in the PR's Compounding line) satisfies this item when nothing qualified.
  ```

**Content hygiene**

- R18. Neither section names the source project or its stack (no relay, Vitest, Cypress, happy-dom, HubSpot, Redux, Amplify, Lambda, dorvie, Tailwind); both are written in wait-on terms.

### Key Decisions

- KD1. **Strict TDD with no exceptions** (session-settled: user-directed — chosen over relay's skip list: configuration changes, boilerplate wiring, pure styling/layout, trivial renames, and exploratory spikes are exactly where the #238-class miss hides). Governs R1.
- KD2. **Rules live in `AGENTS.md` only**: no wait-on TDD skill and no hook/CI enforcement in this change (session-settled: user-approved — chosen over a dedicated skill plus a lib-change-needs-test check: one source of truth first, enforcement later). Governs R1-R17.
- KD3. **Compounding is mandatory, without the source project's enforcement script** (session-settled: user-directed — chosen over porting the DoD-bullet checker: the policy lands now, a checker is follow-up). Governs R14-R17.

### Scope Boundaries

- Out: the #238 proxy/TLS fix itself and its regression test (ships separately).
- Out: any edit inside the managed overdrive block, including its advisory "The compounding loop".
- Out: any `lib/`, `bin/`, or `test/` change.

### Deferred to Follow-Up Work

- A wait-on TDD skill with worked mocha/chai examples.
- A hook or CI check that a `lib/`/`bin/` change ships with a `test/` change.
- A DoD-bullet checker that fails a dated plan missing the verbatim `/ce-compound` bullet.
- Fix the `AGENTS.md` Commands line for `npm test`, which omits `test:types`.
- Land the shared frozen-clock test helper (kevinold/wait-on#43).

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Placement.** The TDD section sits after `## Conventions` and before `## What not to do`; the compounding section follows the TDD section directly. Both stay outside the managed overdrive block, which a bootstrap rerun would overwrite. Owns R1, R14 placement.
- KTD2. **One owner per rule.** The TDD section owns every testing-discipline rule, so the two Conventions testing lines move into it (R13) rather than being duplicated. The Conventions `Tests:` bullet keeps its file inventory and gains a pointer. Owns R13.
- KTD3. **Size targets.** TDD section about 50-80 lines, compounding about 15-25, matching the density of the existing sections: bold-lead bullets, one rule per bullet, cross-referenced examples in wait-on terms (`createResource$`, `validateResource`, `api.mocha.js`, `cli.mocha.js`).
- KTD4. **Clock rule is helper-agnostic.** R11 describes the seam (rxjs scheduling plus frozen `Date`) rather than naming `test/frozen-clock.js`, which exists only on an unmerged branch.
- KTD5. **The #238 example is named once**, in the TDD section intro, as the motivating failure; rules stay general so they do not read as a proxy-only checklist.

---

## Implementation Units

### U1. Test-Driven Development section

- **Goal:** `AGENTS.md` carries the strict TDD section and the Conventions testing lines are folded into it.
- **Requirements:** R1-R13, R18; KD1, KD2; KTD1-KTD5.
- **Dependencies:** none.
- **Files:** `AGENTS.md`.
- **Approach:**
  1. Insert `## Test-Driven Development (Mandatory)` between `## Conventions` and `## What not to do`: intro (scope, carve-out, #238 motivation), `### The cycle` (R2, R3), `### Rules` (R4-R11), `### Anti-patterns` (R12).
  2. In `## Conventions`, drop the bug-fix sentence and the time-dependent-tests bullet; add a pointer to the new section on the `Tests:` bullet.
- **Patterns to follow:** existing `AGENTS.md` bullet style (bold lead, backticked paths and symbols); `docs/solutions/README.md` tone.
- **Test scenarios:** Test expectation: none -- documentation-only change; see Verification Contract walkthrough and grep.
- **Verification:** the section reads as wait-on guidance with no source-project terms, and the #238 walkthrough passes.

### U2. Compounding Knowledge section

- **Goal:** `AGENTS.md` makes `/ce-compound` a mandatory close-out step with a plan DoD bullet and a PR attestation line.
- **Requirements:** R14-R18; KD3; KTD1.
- **Dependencies:** U1 (placement follows it).
- **Files:** `AGENTS.md`.
- **Approach:**
  1. Insert `## Compounding Knowledge (Mandatory)` directly after the TDD section: lead paragraph (R14), bullets for when and mode (R15), never-skip (R16), plan DoD with the verbatim bullet in a fenced block plus the grandfather date and no-softening rule (R17), PR `### Compounding` line (R17).
  2. One line noting that the overdrive block's "The compounding loop" describes the loop and this section makes it mandatory.
- **Patterns to follow:** U1's section style.
- **Test scenarios:** Test expectation: none -- documentation-only change.
- **Verification:** the verbatim bullet in `AGENTS.md` matches R17 character for character, and this plan's Definition of Done carries the same bullet.

---

## Verification Contract

| Gate | Check | Applies to |
|---|---|---|
| Repo suite | `npm test` passes (lint + types + mocha) | U1, U2 |
| #238 walkthrough | Apply the new rules to the #238 plan and confirm at least two rules independently force a test combining HTTPS target × env proxy × `strictSSL: false` that asserts a tunnel was used | U1 |
| Source-term grep | `AGENTS.md` has no match for relay, Vitest, Cypress, happy-dom, HubSpot, Redux, Amplify, Lambda, dorvie, Tailwind (case-insensitive) | U1, U2 |
| Managed block intact | Diff shows no change between the overdrive start and end markers | U1, U2 |
| Verbatim bullet | `AGENTS.md` bullet equals the R17 bullet | U2 |

---

## Definition of Done

- R1-R18 met in `AGENTS.md`; no file outside `AGENTS.md` and `docs/**` changed.
- All Verification Contract gates pass.
- This plan and any `docs/solutions/` doc are committed with the `AGENTS.md` change in one Conventional Commit.
- Run `/ce-compound` (`mode:non-interactive` when no human is present) for each non-trivial learning this work produced — new or updated `docs/solutions/` doc in the same PR; never skip the invocation — only that run's own skip report (reason recorded in the PR's Compounding line) satisfies this item when nothing qualified.
- Cleanup: no stray drafts or temp files in the diff.
