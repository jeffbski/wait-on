---
title: "Lane LT4 - test: black-box CLI conformance suite"
type: test
date: 2026-09-28
topic: cli-conformance
origin: docs/plans/2026-09-28-1239-feat-rust-port-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#40
track: kevinold/wait-on#35
train: "post-10.0.0 (test-only, no version)"
---

# Lane LT4 - test: black-box CLI conformance suite

Lane-scoped plan for issue [kevinold/wait-on#40](https://github.com/kevinold/wait-on/issues/40).
Governed by the rust-port plan (`docs/plans/2026-09-28-1239-feat-rust-port-plan.md`, R17-R19 and
PO13-PO14). The rust-port plan is authoritative for cross-lane parity-contract decisions.

## Lane contract

- **Train:** post-10.0.0, test-only (`test:` commits, no semantic-release version of its own).
- **Branch:** `test/cli-conformance`, built for now off `chore/devdeps-major` (parallel build;
  orchestrator restacks onto the final predecessor later with `git rebase --onto`).
- **Base behavior:** fetch/undici, `util.parseArgs` (non-strict), no lodash, eslint 10, mocha 12,
  Node floor `>=22.19.0`.
- **Allowed paths:** NEW files only under `test/` (and one fixture dir). Do **not** edit existing
  `test/*.mocha.js`, `.nycrc.json`, `.mocharc*`, or `eslint.config.mjs`. `package.json` /
  `package-lock.json` change only if a dependency is strictly required (goal: none).

## Settled decisions (do not relitigate)

- SD1. Base is `chore/devdeps-major`; both LT4a (CLI/file/tcp/socket) and LT4b (HTTP) baselines are
  present in the base, so this lane covers both in one suite.
- SD2. Test-only. No change to `lib/` or `bin/` behavior. No `bin/` instrumentation (that is PO14 /
  a coverage lane, not this issue).
- SD3. New files only; mocha runner stays; no new npm dependencies.
- SD4. Runner-portable style: `describe/it/before/after` + chai `expect`; NO mocha-only APIs
  (`this.timeout`, `this.skip`, `done` callbacks); per-test time budget comes from wait-on CLI
  options (`-t/-i/-w`), never a test-body timeout call.
- SD5. Timing contract measures the **spawned subprocess's** own elapsed wall time (monotonic
  `process.hrtime.bigint()` in the harness). A subprocess clock cannot be frozen from the parent;
  this is the frozen-clock rule's explicit "verifying real-time behavior" skip case. LT1 owns the
  global frozen-clock setup for the in-process unit suite; this lane adds **no** competing global
  setup and reads no calendar date.

## Design

### Language-agnostic driver (the parity seam)

A small harness spawns the CLI as a subprocess and returns `{ code, signal, stdout, stderr, elapsedMs }`.

- Default target: `process.execPath` + `<repo>/bin/wait-on` (today's Node CLI).
- Override: env `WAIT_ON_BIN` names an executable spawned **directly** with the vector's args — the
  seam a future Rust standalone binary (or napi-backed shim) plugs into to run the identical vectors.
- `elapsedMs` is measured with `process.hrtime.bigint()` around spawn->exit (monotonic; immune to
  wall-clock changes). Assertions await the child `exit` event, never a fixed `sleep()`.

### Timing tolerance model

Constants (chosen so every vector's worst case stays well under mocha's 2000 ms default, so no
runner-timeout override is needed): `T=800ms` (`-t`), `I=100ms` (`-i`), `W=100ms` (`-w`),
`APPEAR=250ms` (delay before a "later" resource is made available), generous slack for CI.

Assertions avoid any upper bound tied to `T`, because `elapsedMs` is parent-measured and includes
variable subprocess spawn overhead (notably slow on the Windows CI leg); `code===0` already proves a
success is not a timeout. Only robust bounds remain (spawn overhead can push elapsed up, never down):

- **Immediate success** (resource pre-available): `code===0`.
- **Timeout failure** (resource never available): `code!==0` and `elapsedMs >= T*0.5` — it genuinely
  waited rather than failing fast. This is the primary timing-within-tolerance assertion. A true hang
  is caught by the runner's own default timeout.
- **Becomes-available-later**: `code===0` and `elapsedMs >= APPEAR - slack` — it did not report a
  pathologically instant success.
- **stdout/stderr**: on a validation failure assert `code!==0` and that stderr contains the offending
  token; for the no-resource/usage path assert stdout contains the usage text. The usage path's exit
  code is not pinned — bin/wait-on only exits non-zero there when stdout is a TTY, so it is
  environment-dependent (noted for a future lane; out of scope for this test-only lane).

### Ports & fixtures

- Allocate ephemeral free ports at runtime (`net.createServer().listen(0)` -> `.address().port`) to
  avoid collisions with the seed suite that shares the mocha process. No hard-coded ports.
- Unix-socket paths built in an OS temp dir; Windows uses named-pipe paths (mirror seed
  `socketPathIn`). HTTP-over-unix and socket vectors skip cleanly on Windows where not supported.
- Config-file precedence: write a JSON config to a temp file at runtime pointing at a freshly
  allocated port (valid input for any language's `--config` loader), then assert (a) config-only
  resources are honored and (b) a CLI resource overrides config resources.
- All servers/sockets torn down in `after`/`afterEach` (no `done`; use async or sync teardown).

## Implementation units

### U1. Conformance harness (new, non-test helper)

**File:** `test/helpers/cli-conformance.js` (NEW; not matched by the `*.mocha.js` glob, so not run as a
suite). Exports: `runCli(args, opts)` -> Promise of `{code, signal, stdout, stderr, elapsedMs}`;
`resolveCli()`; `getFreePort()`; `socketPathIn(dir)`; `makeHttpServer()`; timing constants and a
`within`/tolerance assertion helper.
**Test expectation:** exercised by U2/U3 vectors.
**Verification:** part of `npm test`.

### U2. CLI / file / tcp / socket vectors (LT4a)

**File:** `test/cli-conformance.mocha.js` (NEW). `describe` groups for: file (success, later, timeout,
reverse), tcp (listening success, not-listening timeout, unreachable-host reverse-success), socket
(listening success, not-listening timeout), argument/usage (no-resource usage exit 1, malformed
resource names the bad token on stderr), config-file precedence (config-only success, CLI overrides
config).
**Test expectation:** all green under mocha 12 and lint-clean under eslint 10.
**Verification:** `npm test`.

### U3. HTTP vectors (LT4b)

**File:** `test/cli-conformance-http.mocha.js` (NEW). `describe` groups for: http/https and
http-get/https-get (success later, redirect follow, 404 timeout, not-available timeout,
httpTimeout), http-over-unix (success, 404 timeout). Reuses the U1 harness. Kept in a second file so
LT4a and LT4b stay independently reviewable and match the issue's a/b split; both run today because
the base has fetch/undici.
**Verification:** `npm test`.

### U4. Plan + docs

Commit this plan under `docs/plans/`. Never delete or discard `docs/` files.

## Verification (green bar)

1. `npm test` (lint + types + mocha) passes locally.
2. `mise exec node@22.19 -- sh -c 'npm ci --engine-strict && npm test'` passes (engine floor).
3. New files only; `git diff --stat` touches no existing `test/*.mocha.js`, no mocha/nyc/eslint
   config, and (goal) no `package.json`/`package-lock.json`.

## Out of scope

- `bin/wait-on` coverage instrumentation (PO14 / coverage lane).
- Property/differential parser tests (R18, a sibling lane).
- Any change to `lib/` or `bin/` behavior.
- A global frozen-clock setup (LT1 / #37 owns it).
