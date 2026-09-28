---
title: "Lane LT3 - test: property/differential tests for the pure parsers - Plan"
type: test
date: 2026-09-28
topic: parser-properties
artifact_contract: ce-unified-plan/v1
product_contract_source: legacy-requirements
execution: code
origin: docs/plans/2026-09-28-1239-feat-rust-port-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#39
track: kevinold/wait-on#35
---

# Lane LT3 - test: property/differential tests for the pure parsers

Test-only lane. Adds property-based tests for wait-on's four pure parsers,
structured as the Node oracle a future Rust port must match in differential
mode. Uses a self-contained seeded PRNG (no new dependency), so property inputs
are deterministic and reproducible. Source: rust-port plan
`docs/plans/2026-09-28-1239-feat-rust-port-plan.md` (R17-R19, PO13-PO14), issue
kevinold/wait-on#39.

## Lane contract

- **Branch:** `test/parser-properties` based on `fork/chore/devdeps-major`
- **Base for PR:** `chore/devdeps-major` (train 10.0.0 base: fetch/undici, `util.parseArgs`, no lodash, eslint 10, mocha 12)
- **Remote:** push to `fork` only; GitHub target `kevinold/wait-on`
- **Allowed paths:** `test/parser-properties.mocha.js` (new), `bin/wait-on` (export only), `docs/plans/**`. `package.json`/`package-lock.json` MUST NOT change (no new dependency).
- **Commit type:** `test:` (commitlint config-conventional)
- **Parallel build:** LT1 (#37, `test/freeze-clock`) owns the global frozen-clock setup; LT2 (#38). Restacked onto final predecessor later — keep the diff minimal.

## Goal Capsule

- **Objective:** wait-on's four pure parsers (resource-prefix, `host:port`, `ms/s/m/h` interval, `http://unix:` split) have executable, property-based specifications that hold across their full input space, so a future Rust implementation can be validated against the same vectors (differential mode) and any parser regression fails a test rather than reaching users.
- **Means:** one new mocha test file with a dependency-free seeded PRNG, exercising each parser's Node reference behavior against invariants derived from the live regexes/logic in `lib/wait-on.js` and `bin/wait-on` (KTD1, KTD2, KTD5).
- **Authority:** kevinold (fork owner). Orchestrator directives (runner stays mocha, portable tests, minimal deps) are user-directed.
- **Stop conditions:** any need to change `lib/` behavior; any need for a second new dependency; a green-bar failure that requires editing existing test files or the mocha/nyc config.

## Product Contract

### Summary

Add `test/parser-properties.mocha.js`: property tests covering the four pure
parsers named in rust-port R18, driven by a self-contained seeded PRNG
(mulberry32, ~10 lines) plus table-driven edge vectors — no new dependency. The
tests assert structural invariants (round-trip recomposition, classification
totality, unit scaling, split correctness) over N generated inputs rather than
re-listing hand-picked examples, and are shaped so the same generators feed a
Rust parser later (differential mode). The failing seed is printed so any
counterexample is reproducible. Only runtime change: export `parseInterval`
from `bin/wait-on` so the interval parser is directly testable.

### Problem Frame

The rust-port parity contract (R17-R19) is a black-box CLI conformance suite
plus property/differential parser tests, hardened before any Rust code lands.
The parsers are currently untested in isolation: `parseInterval` is a private
function in `bin/wait-on`, and the three `lib/wait-on.js` regexes
(`PREFIX_RE`, `HOST_PORT_RE`, `HTTP_UNIX_RE`/`HTTP_UNIX_LEGACY_RE`) are only
exercised incidentally through the network-touching resource checks. Property
tests give a wide, cheap, deterministic contract that pins parser behavior now
and becomes the Rust acceptance oracle. A dependency-free seeded PRNG keeps the
lockfile untouched (clean restack) while still exploring a wide input space
reproducibly.

### Requirements

Parser coverage:

- R1. Property tests cover the resource-prefix parser: `PREFIX_RE`
  (`lib/wait-on.js:35`) classification into `https-get:`/`http-get:`/`https:`/`http:`/`tcp:`/`socket:`/`file:`/`command:` with the `file:` default, and the `prefix + rest === input` recomposition that `extractPrefix`/`extractPath` rely on.
- R2. Property tests cover the `host:port` parser: `HOST_PORT_RE`
  (`lib/wait-on.js:37`) split into `{ host, port }` as `tcpExists` reads it — bare port → `localhost`, `host:port`, and bracketed IPv6 `[::1]:port` — plus the reject set (missing port, non-numeric port, empty input).
- R3. Property tests cover the `ms/s/m/h` interval parser: `parseInterval`
  (`bin/wait-on`) — unit scaling (`ms`/``/`s`/`m`/`h`), floor semantics, case-insensitivity, and pass-through of unparseable input unchanged.
- R4. Property tests cover the `http://unix:` split: `HTTP_UNIX_RE`
  (`lib/wait-on.js:42`) and `HTTP_UNIX_LEGACY_RE` (`lib/wait-on.js:43`) split into `{ socketPath, requestPath }`, including socket paths that themselves contain colons (Windows named pipes) and the `http-get:` → `http:` normalization.

Structure and portability:

- R5. Tests live in one new file `test/parser-properties.mocha.js` (picked up by the `test/**/*.mocha.js` glob); existing `test/*.mocha.js` files and the mocha/nyc config are not edited.
- R6. Tests are runner-portable: `describe`/`it` + `require('chai')` `expect`, no mocha-only APIs (`this.timeout`, `this.skip`, `done` callbacks); any per-test timeout is configured, not written in a test body.
- R7. Tests are deterministic and not time-dependent (the parsers read no clock), so no frozen-clock setup is added; LT1's global setup is left to own that.
- R8. No new dependency. Property inputs come from a self-contained seeded PRNG (mulberry32) defined in the test file; `package.json` (dependencies and devDependencies) and `package-lock.json` do not change. The failing seed is printed so counterexamples reproduce.

### Scope Boundaries

- The Rust implementation and the actual differential harness are future work (rust-port plan, later phase). This lane delivers the Node reference + invariants only, factored so a `differential` mode can be added without rewriting the generators.
- Not in scope: CLI conformance suite (R17), coverage hardening to ~100% / `bin` instrumentation for coverage (R19/PO14), `lib/wait-on.js:141` branch. Those are sibling lanes.

## Planning Contract

### Key Technical Decisions

- KTD1. Test `parseInterval` as the real exported function; test the three `lib` regexes via reference parsers defined in the test file, keyed to the live regexes. (session-settled: user-directed — chosen over refactoring `lib/wait-on.js` to export its regexes: the lane is test-only and only a `bin/` instrumentation change is permitted; exporting `parseInterval` is behavior-neutral, the three `lib` regexes are copied verbatim with a `lib/wait-on.js` line citation and locked by golden examples drawn from lib's own doc comments so drift is caught.) Governs R1, R2, R3, R4.
- KTD2. Assert invariants, not example tables: recomposition (`prefix+rest`, `socketPath`+`requestPath`), classification totality/mutual-exclusivity, monotonic unit scaling for intervals, and reject-set closure. Governs R1-R4.
- KTD3. Structure parsers as a single `nodeParsers` object and drive each property from a shared generator, so a later `rustParsers` can be diff-tested with the same generators (differential mode) with no generator rewrite. (session-settled: user-directed — chosen over ad-hoc per-test inline parsing: R18 requires the vectors run against both implementations.) Governs R1-R4.
- KTD4. Runner-portable, mocha-glob-named file; no clock setup. (session-settled: user-directed — chosen over vitest-specific or mocha-only APIs and over a local frozen clock: the lane restacks onto LT1's runner + clock choices.) Governs R5, R6, R7.
- KTD5. Property inputs come from a self-contained seeded PRNG (mulberry32) + table-driven edge vectors — no dependency. Each property runs N generated inputs; on failure the seed, iteration, and generated input are thrown in the message so it reproduces. (session-settled: user-directed — chosen over fast-check / any new dependency: a hard rule forbids new deps so the lockfile stays untouched for a clean restack.) Governs R8.

### Assumptions

- Assertions use `node:assert/strict` (built-in) and `describe`/`it` from `mocha`, so the file needs no dependency and stays runner-portable.
- The reference parsers must reproduce the live regexes exactly; the golden-example assertions (from lib comments at `lib/wait-on.js:42` and the doc block at `:95-99`) are the drift tripwire.

## Implementation Units

### U1. Export `parseInterval` from `bin/wait-on`

**Goal:** make the `ms/s/m/h` interval parser importable without changing CLI behavior.
**Requirements:** R3.
**Files:** `bin/wait-on`.
**Approach:** add `parseInterval` to the existing `module.exports = { parseArgv, optionDefs, parseHeaders }`. No other change; `require.main === module` guard already prevents side effects on import.
**Verification:** `node -e "require('./bin/wait-on').parseInterval('2s')"` returns `2000`; existing `test/cli.mocha.js` still green.

### U2. Write `test/parser-properties.mocha.js` (seeded PRNG + property tests)

**Goal:** property tests for all four parsers per R1-R4, portable per R5-R7, dependency-free per R8.
**Requirements:** R1, R2, R3, R4, R5, R6, R7, R8.
**Files:** `test/parser-properties.mocha.js` (new).
**Approach:**
- Test harness (no deps): `mulberry32(seed)` PRNG (~10 lines); a `forAll(label, gen, prop, {n, seed})` runner that generates N inputs and, on a thrown assertion, rethrows with the seed, iteration, and generated input in the message (R8 reproducibility). Base seed is a fixed constant, overridable via an env var for repro.
- Define `nodeParsers`: `prefix(resource)` → `{ type, rest }`, `hostPort(str)` → `{ host, port }` or `null`, `interval(arg)` = the real `require('../bin/wait-on').parseInterval`, `httpUnix(url)` → `{ socketPath, requestPath }` or `null`. Each `lib`-derived parser copies its regex verbatim with a `// lib/wait-on.js:NN` citation (KTD1).
- Golden-example `it` blocks pinning lib's documented cases (`tcp:my.server.com:3000`, `[::1]:8080`, `http://unix:/path/to/sock:/foo/bar`, a `C:`-containing named-pipe path, `2s`/`500ms`/`1h`).
- Property `it` blocks per parser (each calls `forAll(...)`) asserting KTD2 invariants: prefix recomposition + classification totality + file default; host:port split + localhost default + IPv6 + reject set; interval unit scaling + floor + case-insensitivity + pass-through; http-unix split with colon-bearing socket paths + `http-get:`→`http:` normalization.
- `describe`/`it` from `require('mocha')`; assertions via `require('node:assert/strict')` (zero-dep, runner-portable); no mocha-only APIs, no per-test timeout in bodies.
**Test scenarios:** each R1-R4 invariant above; reject sets return `null`/pass-through as the live code does.
**Verification:** file lints clean (eslint 10 + chai-friendly); `npm run test:mocha` includes and passes it.

## Verification Contract

- `npm test` passes (runs `lint` → `test:types` → `test:mocha`). New file must satisfy eslint 10 with `eslint-plugin-chai-friendly`.
- `mise exec node@22.19 -- sh -c 'npm ci --engine-strict && npm test'` passes (clean install under the pinned Node + engine-strict).
- New tests run under the existing `mocha --exit "test/**/*.mocha.js"` with no config change.
- No `lib/wait-on.js` change; `bin/wait-on` diff is the single export line; `git diff` shows NO change to `package.json` or `package-lock.json`.

## Definition of Done

- R1-R8 met; `test/parser-properties.mocha.js` present and green in both verification runs.
- `bin/wait-on` exports `parseInterval` with unchanged CLI behavior; no `lib/` edit.
- No dependency added; `package.json` and `package-lock.json` unchanged.
- Plan committed under `docs/plans/`; PR opened against `chore/devdeps-major` on `kevinold/wait-on`, pushed to `fork`, CI green.
- No frozen-clock setup added; no existing test file or mocha/nyc config edited.
- No dead/experimental code left in the diff.
