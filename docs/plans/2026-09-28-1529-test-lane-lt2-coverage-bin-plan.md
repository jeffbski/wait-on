# [LT2] test: branch coverage toward 100% and instrument bin/wait-on

Status: implementation-ready
Issue: kevinold/wait-on#38 · Track: #35 · Spine: #4
Lane: LT2 · Branch: `test/coverage-bin` · Base (PR): `test/freeze-clock` · Train: post-10.0.0 (test-only, no version)
Source: rust-port plan R17–R19, PO13–PO14 (`docs/plans/2026-09-28-1239-feat-rust-port-plan.md`, PR #36)

## Goal Capsule

**Objective.** Harden the Node test suite as the executable parity contract for the Rust port: raise `lib/wait-on.js` branch coverage from the 89.9% baseline toward ~100%, instrument the previously-invisible `bin/wait-on` CLI (0% → measured), and lock the gain behind an enforced nyc branch threshold — all test-only, no new dependencies, and green under the frozen clock.

**Means.** One new test file `test/coverage.mocha.js` targeting the reachable uncovered branches (KTD1); a one-key `.nycrc.json` change that makes nyc instrument the extensionless bin (KTD2); an enforced coverage threshold wired into `npm test` so CI actually gates it (KTD3). Reuse the LT1 frozen-clock helper (KTD4).

**Non-goals.** No change to `lib/` or `bin/` runtime behavior. No new dependency. No edit to the LT3/LT4 files (`test/parser-properties.mocha.js`, `test/cli-conformance*.mocha.js`, `test/helpers/cli-conformance.js`). Not chasing literal 100% — the one genuinely unreachable branch is documented, not forced (KTD5).

## Product Contract

**Problem Frame.** The rust-port hardening phase (R19/PO14) needs the Node suite to be a trustworthy contract before any Rust engine code lands. Two gaps block that: (a) `bin/wait-on` reports 0% coverage because nyc never instruments it, so the entire CLI surface is unverified by coverage; (b) `lib/wait-on.js` sits at 89.9% branch with a cluster of untested validation, TLS-option, proxy-auth, reverse-mode, and verbose paths. Without an enforced threshold, any future change can silently regress the contract.

**Baseline (measured 2026-09-28, this worktree).**
- `lib/wait-on.js`: 97.05% stmt / **89.92% branch** / 94.82% funcs / 98.64% lines. Uncovered: 180, 330, 340 (+ the branch cluster below).
- `bin/wait-on`: **0%** (not instrumented at all).
- 144 tests passing.

## Planning Contract

### KTD1 — Cover reachable branches with a single new frozen-clock + subprocess test file
`test/coverage.mocha.js` holds all new tests, so nothing in the existing suite is touched and the parallel LT3/LT4 lanes (which restack on top of this branch) get a zero-conflict merge. Rejected: adding to `api.mocha.js`/`cli.mocha.js` (larger conflict surface with parallel lanes). Reason: isolation beats co-location when siblings are editing nearby files.

Reachable `lib/wait-on.js` targets and how each is exercised:
| Line(s) | Branch | Exercise |
|---|---|---|
| 330 | `new URL` throws for `http://[` | resource `http://[`, expect fail-fast validation error |
| 339/340 | tcp host:port regex miss | resource `tcp:nope`, expect validation error |
| 147, 158 | `verbose` truthy → `log:true`, `output=console.log` | `verbose:true` with an available file (console.log stubbed) |
| 363/364/365 | buildDispatcher sets cert/key/passphrase | http resource + `{cert,key,passphrase}` opts, bounded by frozen-clock timeout |
| 378 (+ `?? ''` both sides) | proxy object with auth | proxy `{host,port,auth:{username,password}}` and a second with no password |
| 433 | `auth.password ?? ''` nullish branch | http + `auth:{username}` (no password) |
| 446 | http reverse mode | `http-get:`/`http:` down + `reverse:true` → succeeds |
| 527 | socket reverse mode | non-existent socket + `reverse:true` → succeeds |

Reachable `bin/wait-on` targets (node-spawned so nyc instruments them):
| Line(s) | Exercise |
|---|---|
| 86–89 | help path: `execCLI(['--help'])` / no resources → exit ≠ 0 |
| 179 | `parseInterval` `m`: `-t 2m` with an available file |
| 180 | `parseInterval` `h`: `--httpTimeout 1h` with an available file |
| 172 | `parseInterval` no-match: `-t abc` → returns as-is → validation errorExit |

### KTD2 — Instrument the extensionless bin via `.nycrc.json` `extension`
`bin/wait-on` has no `.js` extension, and nyc's default `extension` list (`.js`, `.cjs`, `.mjs`, `.ts`, …) never matches it, so the require-hook skips instrumenting it whether it is `require`d in-process (cli.mocha's `parseArgv` import) or spawned. Adding `"extension": [".js", ""]` to `.nycrc.json` lets the hook instrument it. Verified: bin jumps 0% → 90.9% stmt / 88.23% branch with zero test changes, because `cli.mocha.js` already spawns via `process.execPath` (spawn-wrap-instrumentable) and `require`s the bin. Rejected: a spawn-wrapper module or `NODE_OPTIONS` shim (more moving parts, a new file); rejected: editing `cli.mocha.js`'s spawn (unnecessary — env already inherits). Reason: the smallest change that removes the real blocker.

### KTD3 — Enforce the threshold where CI actually runs
CI (`​.github/workflows/node.js.yml`) and both green-bar commands run `npm test`, which today is `lint && test:types && test:mocha` — coverage never runs, so a bare `check-coverage` in `.nycrc.json` would be enforced nowhere. Point `npm test`'s last step at `test:coverage` (`nyc npm run test:mocha`) and set `check-coverage: true` with thresholds in `.nycrc.json`. This makes the threshold real, stays test-only, and keeps `npm test` the single green-bar entry point. Thresholds are set to the achieved floor **measured on both local Node and Node 22.19** (engines floor), with a small safety margin to absorb cross-version branch-count variance. Rejected: leaving enforcement to a separate `test:coverage` nobody runs (theater). Reason: a threshold that gates nothing does not harden the contract.

### KTD4 — Reuse the LT1 frozen clock; no second mechanism
Time-dependent new tests (any that would otherwise wait on a timer — the TLS-option and proxy tests bounded by a timeout, reverse-mode polling) use `itFrozen`/`FROZEN_NOW` from `test/frozen-clock.js` (already globally required via `.mocharc.json`). Fail-fast validation tests and available-resource CLI subprocess tests are not time-dependent and use plain `it`. Rejected: `node:test` mock.timers (crashes with rxjs on 22.19 — see LT1 KTD). Reason: one clock mechanism, already proven.

### KTD5 — `lib/wait-on.js:180` is unreachable; document, do not force
The non-timeout error-log branch (`cleanup`'s `else`, line 180) cannot be reached through the public API: every inner resource observable catches its own errors and resolves to a boolean, so the only error notification the merged stream can emit is the timeout, whose message always starts with `TIMEOUT_ERR_MSG` (→ line 178). Reaching 180 would require a `lib/` change, which is out of scope (test-only). It stays uncovered; the branch threshold is set below 100% accordingly. Same treatment for the hard-to-reach `once` double-call (line 24) and the `dispatcher.close()` rejection fallback (line 457 inner catch) and `errorExit` no-stack branch (bin 149) — not worth a contrived harness. Rejected: forcing coverage via lib edits or private-function extraction. Reason: rule 5 (behavior unchanged) and honesty over a vanity 100%.

### Assumptions
- Coverage numbers are stable enough across Node 22.19 and the local Node that a small threshold margin absorbs any drift (validated in the Verification Contract before the threshold is frozen).
- LT3/LT4 do not edit `.nycrc.json`; if they do, the threshold merges additively.

## Implementation Units

### U1. `.nycrc.json`: instrument the bin + enforce the threshold
- **Files:** `.nycrc.json`
- **Approach:** add `"extension": [".js", ""]`; add `"check-coverage": true` and per-metric thresholds (`branches`, `lines`, `functions`, `statements`) set to the achieved floor minus a small margin (finalized in U4 after measuring on both Node versions).
- **Verification:** `npm run test:coverage` reports `bin/wait-on` non-zero and exits 0 with thresholds present.

### U2. `package.json`: run coverage as the test gate
- **Files:** `package.json` (scripts only; deps/devDeps untouched)
- **Approach:** change `"test"` from `… && npm run test:mocha` to `… && npm run test:coverage`. Leave `test:mocha` and `test:coverage` as-is.
- **Verification:** `npm test` runs nyc and enforces the threshold.

### U3. `test/coverage.mocha.js`: new targeted tests
- **Files:** `test/coverage.mocha.js` (new)
- **Approach:** two describes — a frozen-clock lib block (`require('../')`, `itFrozen`/`FROZEN_NOW` from `./frozen-clock`) covering the KTD1 lib rows, and a bin CLI block spawning `node bin/wait-on` via `process.execPath` covering the KTD1 bin rows. Stub `console.log` for the verbose test. Bounded timeouts (small, virtual) for the never-succeeding TLS/proxy/auth requests so the frozen pump settles them. No real sleeps in assertions.
- **Test Scenarios:** the KTD1 tables. Each asserts the observable outcome (callback error / resolve / reject / CLI exit code), not coverage itself.
- **Verification:** all new tests pass; the targeted lines flip to covered.

### U4. Finalize thresholds against both Node versions
- **Files:** `.nycrc.json` (threshold values)
- **Approach:** run coverage on local Node and under `mise exec node@22.19`, take the per-metric min, subtract a ~1–2 pt margin, set those as the thresholds.
- **Verification:** both green-bar commands pass (below).

## Verification Contract

Green bar (both must pass):
1. `npm test` — lint + types + nyc mocha with `check-coverage` (local Node).
2. `mise exec node@22.19 -- sh -c 'npm ci --engine-strict && npm test'`.

Spot checks:
- `npm run test:coverage` text report shows `bin/wait-on` non-zero branch/stmt and `lib/wait-on.js` branch ≥ baseline+; uncovered set shrinks to the documented-unreachable lines.
- No diff to `lib/`, `bin/`, `package.json` deps/devDeps, or `package-lock.json`.
- No edit to `test/parser-properties.mocha.js`, `test/cli-conformance*.mocha.js`, `test/helpers/cli-conformance.js`.

## Definition of Done
- [ ] `bin/wait-on` instrumented (non-zero coverage) via `.nycrc.json`.
- [ ] `lib/wait-on.js` branch coverage raised toward ~100%; only documented-unreachable branches remain.
- [ ] Enforced nyc branch/line/func/stmt thresholds in `.nycrc.json`, gated by `npm test`.
- [ ] New tests live only in `test/coverage.mocha.js`; frozen clock reused; no new deps; no lib/bin behavior change.
- [ ] Both green-bar commands pass. Plan committed under `docs/plans/`.
- [ ] PR open against `test/freeze-clock` with the required stack/Spine footer.

## Risks & Dependencies
- Cross-Node coverage drift → mitigated by U4 (measure both, margin).
- Depends on LT1 (frozen clock) already on base — present.
- `extension: ""` could in principle widen `all:true` file discovery, but `include` is `["lib/**/*.js", "bin/wait-on"]` (literal bin path), so scope is unchanged (verified: only lib+bin in report).
