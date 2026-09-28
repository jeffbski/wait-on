---
title: "Lane LT1 - test: freeze the clock in time-dependent tests"
type: test
date: 2026-09-28
topic: freeze-clock
origin: docs/plans/2026-09-28-1239-feat-rust-port-plan.md
spine: kevinold/wait-on#4
lane_issue: kevinold/wait-on#37
track: kevinold/wait-on#35
train: "post-10.0.0"
---

# Lane LT1 - test: freeze the clock in time-dependent tests

Lane-scoped extract of the rust-port plan (`docs/plans/2026-09-28-1239-feat-rust-port-plan.md`, R17-R19, PO13-PO14). Stacks after the 10.0.0 train; base branch `chore/devdeps-major` (fetch/undici, `util.parseArgs`, no lodash, eslint 10, mocha 12).

## Lane contract

- **Branch:** `test/freeze-clock` based on `chore/devdeps-major`.
- **Scope:** test-only. No change to `lib/` or `bin/` behavior. **No new dependency** — `package.json` and `package-lock.json` are unchanged.
- **Allowed paths:** `test/**`, `.mocharc.json`, `docs/plans/**`.
- **Commit type:** `test:` (commitlint config-conventional).
- **Green bar:** `npm test` passes, and `mise exec node@22.19 -- sh -c 'npm ci --engine-strict && npm test'` passes.

## Problem

The suite spends ~56s in real timer waits: ~35 "should timeout when ..." negative tests bound by a real `timeout` (~1s each), plus real stability-window waits. `wait-on` polls on rxjs `timer(delay, interval)` and bounds each run with `timer(timeout)`, both on rxjs's asyncScheduler; the file stability window reads `Date.now()`. The waits are real wall time, not work. Only the in-process (`api.mocha.js`) tests are reachable — `cli.mocha.js` spawns `bin/wait-on` as a subprocess, out of an in-process clock's reach and out of this lane's `bin/`-excluded scope.

## KTD-LT1: test runner — stay on mocha 12 (do NOT switch to vitest)

Vitest's fake timers are the same fake-timers concept; switching runners does not remove this lane's real blockers (real `child_process.exec`, `net.Socket#setTimeout`, `AbortSignal.timeout`, subprocess CLI). Tests bind fixed ports (8125/3002 shared across `api` and `cli`), so vitest's default per-file parallelism would collide and force single-thread, erasing the speed pitch. CJS package, mocha 12 just landed in L14, 3 files use mocha+chai globals — a migration is `ci:`/`build:` churn beyond #37's `test:` scope and would force LT2/LT3/LT4 to restack for no gain. `npm test` stays the entry point.

## KTD-LT1a: timer mechanism — rxjs provider seam + fake Date, ZERO dependencies

Preference order, zero-dependency first:

1. **node:test `mock.timers`** (built-in) — **rejected**: experimental, and it throws `Error: executing a cancelled action` from `AsyncAction.execute` when `tick()` drives an rxjs interval on **Node 22.19** (the engines floor and a green-bar target). Works on Node 26 but fails `mise exec node@22.19 -- npm test`.
2. **`@sinonjs/fake-timers`** — **rejected**: would add a dependency; the hard constraint is no new deps and an unchanged lockfile.
3. **rxjs provider seam + fake `Date`** (hand-rolled, zero-dep) — **chosen**.

The seam fakes **only rxjs's own scheduling**, via `rxjs/internal/scheduler/intervalProvider`'s supported `delegate` (setInterval/clearInterval), plus a frozen global `Date`. This captures every `timer`/poll/timeout the lib schedules **without touching the global `setTimeout`/`setInterval`**, so undici (fetch) and `net` keep the **real** timers and their connection/socket teardown runs in real time exactly as before — no leaked handles or bound ports bleeding into the next test (the failure mode a global fake produced against undici and the #82 socket-leak test). The frozen `Date` covers the lib's `Date.now()` stability window and rxjs's scheduler clock. Verified driving rxjs on both Node 22.19 and Node 26.

## KTD-LT1b: opt-in and only for FIXED-state tests

The clock is opt-in through a shared setup module, applied per test via `itFrozen`, never a global root hook — command:, socket-lifecycle, tcpTimeout, httpTimeout, https-proxy TLS, and subprocess CLI tests all depend on real time and stay on plain `it`.

Within the frozen set, only **fixed-state** tests qualify — the resource is either never available or already available at test start:

- **Timeout negatives** (refused ports / 404 / missing files / reverse-with-files-present): the virtual `timeout` fires almost immediately, the test errors as expected, fast.
- **File-available / stability-window**: files written synchronously before `waitOn`; the 750ms window elapses in virtual time.

Tests whose resource is mutated by a **real `setTimeout`** are NOT frozen, because the virtual pump and real wall clock desynchronize:

- **Success "become available later" / delayed-listen** — the pump would spin virtual polls unbounded (a real connect storm) waiting for the real mutation. Kept real.
- **Timeout tests that start their server via `setTimeout(…, 300)`** — the virtual timeout ends the test first, then the real `setTimeout` fires and orphans a listening server that never gets torn down (observed as cross-test `EADDRINUSE`). Kept real.

## Implementation units

### ULT1a. Setup module `test/frozen-clock.js`

Exports:
- `FROZEN_NOW = new Date('2026-06-17T12:00:00.000Z')` — one shared instant (mid-month weekday, midday UTC, no DST edge).
- `itFrozen(title, fn)` — a mocha `it` that installs the seam (rxjs `intervalProvider.delegate` + frozen `Date`), runs an async **pump** that advances virtual time to the next rxjs timer and yields a real `setImmediate` between jumps so fast real I/O settles, and uninstalls on completion. Supports `done`-style and promise/sync bodies; a timer-callback throw is surfaced to the failing test rather than escaping the pump.
- `mochaHooks` — a defensive root `afterEach` that restores the clock if a test left it installed.

### ULT1b. Wire the setup

`.mocharc.json` with `{ "require": "./test/frozen-clock.js" }`. `test:mocha` and `npm test` unchanged.

### ULT1c. Convert the fixed-state tests to `itFrozen`

In `test/api.mocha.js` (top-level and `promise support` describes): the timeout-negative tests and the file-available/window tests. All other tests — become-available, delayed-server, command:, #82 socket-lifecycle, tcpTimeout, httpTimeout, IPv6 listener, plus all of `cli.mocha.js`, `https-proxy.mocha.js`, `validation.mocha.js` — stay on the real clock.

### ULT1d. Deterministic server teardown

`api.mocha.js` `afterEach` now `server.closeAllConnections()` and waits for `server.close(cb)` before the next test. Frozen tests finish in milliseconds, so the old fire-and-forget close could leave a port bound when the next same-port test ran; the real timeouts used to mask it. This is correct teardown regardless of the clock.

## Verification

- `npm test` green and stable across repeated runs; `api.mocha.js` mocha time ~35s -> ~9s (cli unchanged by design).
- `mise exec node@22.19 -- sh -c 'npm ci --engine-strict && npm test'` green (proves zero-dep: the restored lockfile has no fake-timer library).
- `package.json` / `package-lock.json` byte-unchanged from base.
- Lint (`test/**/*.js`) and `tsc` clean. One shared `FROZEN_NOW`; no real `sleep` in assertions.

## Out of scope

- Speeding up the CLI subprocess tests (needs child-side instrumentation; `bin/` out of this lane — LT2).
- Branch-coverage hardening and `bin/wait-on` instrumentation (R19/PO14 — separate lanes).
