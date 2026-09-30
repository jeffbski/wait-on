# Fix flaky Windows CI: https-proxy `before` hook timeout

- **Date:** 2026-09-28
- **Branch:** `fix/https-proxy-win-hook` (stacked on `refactor/axios-to-fetch`, fork PR kevinold/wait-on#2)
- **Scope:** test-only, one file — `test/https-proxy.mocha.js`
- **Confidence:** high

## Problem

Suite `https/tls and proxy parity` sets `this.timeout(6000)` at suite level.
Its `before` hook shells `openssl req -x509 -newkey rsa:2048 ...` to generate a
self-signed cert. RSA-2048 keygen (prime search) is slow and highly variable on
Windows GitHub runners; it intermittently exceeds 6000ms, so the `before` hook
fails with `Timeout of 6000ms exceeded` and the whole suite fails.

Observed: upstream PRs jeffbski/wait-on#243 and #245, `windows-latest`, Node
22/24/26 (intermittent; #244/#246 passed on the same code). Runs:
`36482802707`, `36482814608`.

## Root cause

Two independent factors, both fixed:

1. **Slow key type.** RSA-2048 keygen time is unbounded and worst on Windows.
2. **Hook under a tight per-test timeout.** The suite's 6000ms (sized for the
   actual TLS/proxy checks) also governs the one-time `before` setup, which does
   real cert-generation work and should not share that budget.

## Fix (both, test-only)

In `test/https-proxy.mocha.js`:

1. Switch the keygen from RSA-2048 to an **EC P-256** key
   (`-newkey ec -pkeyopt ec_paramgen_curve:prime256v1`). Fixed-curve keygen is
   near-instant and constant-time — no prime search — and Node's TLS fully
   supports EC self-signed certs, so all three cert assertions
   (self-signed reject with `strictSSL:true`; accept with `strictSSL:false`;
   accept with matching `ca`) stay valid and unchanged.
2. Give the `before` hook its **own generous timeout** — `this.timeout(30000)`
   as the hook's first statement — so slow Windows setup never trips the tight
   suite timeout. Belt-and-suspenders with (1).

Leave the suite-level `this.timeout(6000)` for the tests themselves. No
assertion, coverage, or test-count change.

## Constraints

- No `lib/` or `bin/` edits.
- No new dependencies — `package.json` / `package-lock.json` byte-identical.
- Only `test/https-proxy.mocha.js` changes.
- Rest of `test/` checked: no other slow-setup-under-tight-hook-timeout pattern
  (only this file has a `before` hook running openssl; cli/validation use
  `child_process` inside `it` tests, api.mocha.js:1033 already has a 10s budget).

## Verification

1. `npm test` (lint + mocha) locally on darwin — green.
2. `mise exec node@22.19 -- sh -c 'npm ci --engine-strict && npm test'` — green.
3. Fast-forward push onto `refactor/axios-to-fetch`; fork PR #2 `windows-latest`
   jobs green.
4. Re-run the PR's Windows jobs at least twice to show the flake is gone; report
   run IDs.
