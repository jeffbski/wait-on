---
title: AGENTS.md wait-on Specialization - Plan
type: docs
date: 2026-09-28
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan (orchestrator settled-decisions brief)
execution: code
---

# AGENTS.md wait-on Specialization - Plan

## Goal Capsule

**Objective:** An agent or engineer opening `wait-on` learns what the project is,
how it is built, and how to change it safely from a single, accurate guidance file
(`AGENTS.md`) — not from a generic harness block that describes nothing about
wait-on.

**Means:** Move the current `CLAUDE.md` content into `AGENTS.md` above the overdrive
managed block, expand it into a wait-on-specific section grounded in the code on
master 2b1241f, and reduce `CLAUDE.md` to the `@AGENTS.md` import (KTD1, KTD2).

**Authority hierarchy:** the settled-decisions brief (user-directed) > this plan >
implementer discretion on wording.

**Stop conditions:** a claim cannot be grounded in the code as it is on master; a
decision in the brief conflicts with the code. Report and stop rather than guess.

**Who finishes and ships:** `ce-work` implements in worktree `docs/agents-md-wait-on`;
the lfg pipeline reviews, commits (`docs:`), and opens the fork PR.

## Product Contract

### Summary

Rewrite `AGENTS.md` so wait-on-specific guidance lives above the overdrive managed
block, and collapse `CLAUDE.md` to a one-line `@AGENTS.md` import. The wait-on
section covers what the tool is, the public API/CLI contract, the rxjs architecture
and resource-type extension point, the build/test commands, the repo conventions,
and the things not to do. Existing "Code Discovery (graph-first)" and "Agent Tooling"
guidance is preserved, reworded host-neutrally.

### Problem Frame

`AGENTS.md` on master (from jeffbski/wait-on#232) contains only the generic overdrive
harness block. `CLAUDE.md` holds the real wait-on guidance but is Claude-specific and
partly stale after recent merges (#233 parseArgs, #234 header flag). Two files, one
generic and one stale, means neither is a reliable single source.

### Requirements

Content and structure:

- R1. `AGENTS.md` contains a wait-on-specific section placed ABOVE the
  `<!-- overdrive:start -->` line; the managed block (start…end) is left byte-for-byte
  unchanged.
- R2. `CLAUDE.md` contains only the `@AGENTS.md` import plus at most a one-line heading;
  no wait-on content remains duplicated in it.
- R3. The wait-on section states what wait-on is and that the public API
  `waitOn(opts[, cb])` (promise when no callback, callback otherwise) and the CLI
  `bin/wait-on` are two front doors to the same behavior and must stay in sync.
- R4. It documents the architecture: the rxjs polling pipeline in `lib/wait-on.js`,
  the resource types and prefixes (`file:`, `http(s):`, `http(s)-get:`, `tcp:`,
  `socket:`, `http://unix:<sock>:<path>`), reverse mode, and joi `WAIT_ON_SCHEMA`
  validation.
- R5. It names the extension point for a new resource type: `PREFIX_RE`, the
  `createResource$` switch, the `validateResource` switch, and a new `create<Type>$`
  observable factory.
- R6. It lists commands: `npm test` (lint + mocha), `npm run lint`,
  `npm run test:coverage`; states the Node engines floor is `>=20.0.0` on master and
  notes 10.0.0 raises it to `>=22.19` (jeffbski/wait-on#238).
- R7. It records conventions: CommonJS; tests in `test/*.mocha.js` with mocha + chai;
  fixtures `config-http-resources.js` and `config-headers.js`; time-dependent tests on
  a frozen/fake clock; CI runs ubuntu + windows (node 20/22/24, `npm ci --engine-strict`)
  so no POSIX-only assumptions (named pipes, path separators, openssl speed);
  Conventional Commit messages (semantic-release + commitlint proposed in
  jeffbski/wait-on#241); keep `README.md` in sync when options/CLI flags change;
  `.npmignore` hygiene for new top-level files.
- R8. It records what not to do: no new runtime dependencies without discussion; no
  breaking API/CLI changes outside a major; never publish from a local machine.
- R9. It preserves "Code Discovery (graph-first)" and "Agent Tooling" content,
  reworded host-neutrally where not Claude-specific, without duplicating anything.

Accuracy (grounded on master 2b1241f):

- R10. CLI parsing is described as `util.parseArgs` (not minimist); `minimist` is no
  longer a dependency (#233 merged).
- R11. The repeatable `-H`/`--header` flag is documented (#234 merged).
- R12. `axios` and `lodash` are described as present dependencies on master, with a note
  that #238/#239 propose removing/replacing them — current state stated, upcoming change
  flagged, neither asserted as already done.

### Sources

- `lib/wait-on.js` — `PREFIX_RE` (L20), `WAIT_ON_SCHEMA` (L31-58), `waitOn`/`waitOnImpl`
  (L92-178), pipeline (`combineLatest`/`merge`/`takeWhile` L166-177), `createResource$`
  switch (L193-208), `validateResource` switch (L281-317), `create<Type>$` factories.
- `bin/wait-on` — `require('util').parseArgs` (L4), `optionDefs` incl. `header` short `H`
  multiple (L12), `parseHeaders` (L157-167), exports (L188).
- `package.json` — `engines.node >=20.0.0` (L27), deps `axios`/`joi`/`lodash`/`rxjs`
  (L38-43), scripts (L19-25).
- `.github/workflows/node.js.yml` — matrix `os: [ubuntu-latest, windows-latest]`,
  node `20/22/24`, `npm ci --engine-strict`.
- `test/` — `api.mocha.js`, `cli.mocha.js`, `validation.mocha.js`,
  `config-http-resources.js`, `config-headers.js`.

## Planning Contract

### Key Technical Decisions

- KTD1. Put wait-on content ABOVE `<!-- overdrive:start -->` and never edit inside the
  managed block. (session-settled: user-directed — chosen over editing inside the block:
  overdrive `bootstrap.sh --init` replaces the managed block on rerun and would clobber
  in-block edits.) Governs R1.
- KTD2. `AGENTS.md` is the single source; `CLAUDE.md` becomes only `@AGENTS.md`.
  (session-settled: user-directed — chosen over keeping CLAUDE.md as content home with
  AGENTS.md pointing at it, or duplicating a section into both: one source avoids drift.)
  Governs R2, R9.
- KTD3. Ground every claim by re-reading the code on master rather than trusting the old
  CLAUDE.md prose, which is why R10-R12 correct stale statements. Governs R10, R11, R12.
- KTD4. Reword Claude-specific phrasing ("This repo is indexed by codebase-memory-mcp",
  ".claude/settings.json SessionStart hook") to host-neutral wording where the underlying
  fact is host-neutral; keep concrete file paths that are real in the repo. Governs R9.

### Assumptions

- The overdrive managed block content is correct and current; only its placement (below
  the new section) matters here.
- `docs_root` is unset, so plans and this artifact live under `docs/`.

## Implementation Units

### U1. Author the wait-on section and rewrite AGENTS.md

- Goal: `AGENTS.md` opens with the wait-on-specific section, then the unchanged managed
  block. (R1, R3-R12)
- Files: `AGENTS.md`.
- Approach: Build the new section from the CLAUDE.md content (Project Overview, Stack →
  reframed as Architecture, Commands, Testing, Code Discovery, Agent Tooling) merged with
  the brief's added coverage (API/CLI sync, resource-type extension point, conventions,
  what-not-to-do, accuracy fixes R10-R12). Append the existing managed block verbatim
  (copy the current `<!-- overdrive:start -->…<!-- overdrive:end -->` from AGENTS.md).
  Keep it scannable: short headed subsections and bullets, not prose walls.
- Test Scenarios: managed block bytes unchanged (diff shows only additions above it);
  every code claim matches `lib/wait-on.js` / `bin/wait-on` / `package.json` /
  workflow / `test/`.
- Verification: `npm run lint` (markdown is not linted, but the run must stay green);
  manual read-through against Sources.

### U2. Collapse CLAUDE.md to the AGENTS.md import

- Goal: `CLAUDE.md` is only the `@AGENTS.md` import (plus at most a one-line heading).
  (R2)
- Files: `CLAUDE.md`.
- Approach: Replace the whole file with a minimal heading line and `@AGENTS.md`. Confirm
  no wait-on content is left behind that now lives in AGENTS.md.
- Test Scenarios: `CLAUDE.md` has no duplicated wait-on section; still imports AGENTS.md.
- Verification: read the file; grep it for content that should now only be in AGENTS.md.

## Verification Contract

- `npm test` (runs `npm run lint` then `mocha --exit "test/**/*.mocha.js"`) passes —
  docs-only change must leave lint and tests green.
- Manual: `git diff` on `AGENTS.md` shows only added lines above the managed block and
  the managed block unchanged; `CLAUDE.md` reduced to the import.
- Every factual claim in the new section is traceable to a Source above.

## Definition of Done

- R1-R12 satisfied.
- `npm test` green in the worktree.
- This plan committed under `docs/plans/` (never discarded).
- Commit uses a `docs:` Conventional Commit message; PR base `master`, title
  `docs: make AGENTS.md specific to wait-on`, opened against `kevinold/wait-on`.
- No abandoned scratch content left in the diff.
