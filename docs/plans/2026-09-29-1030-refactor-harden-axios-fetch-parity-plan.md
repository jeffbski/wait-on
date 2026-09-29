---
title: Harden axios→fetch/undici config parity - Plan
type: refactor
date: 2026-09-29
topic: harden-axios-fetch-parity
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-code-review
execution: code
depends_on: 2026-09-16-0754-refactor-axios-to-fetch-plan.md
review_source: docs/reviews/2026-09-29-pr238-axios-fetch-parity.md
---

# Harden axios→fetch/undici config parity - Plan

## Goal Capsule

- **Objective:** close the edge-case parity gaps found reviewing PR #238 so that **every** axios-shaped config `waitOn()` accepts maps to identical fetch/undici behavior — literal 100%, no exceptions — while keeping the error contract (all failures via callback/promise) intact.
- **Means:** extract proxy/TLS/header/auth option handling into a small, unit-tested translation layer (`buildDispatcher` + a header/auth normalizer), fix the eight verified gaps, and add per-option + differential (axios-vs-fetch) tests plus type-compat tests.
- **Product authority:** repo owner.
- **Open blockers:** decide the M-series policy calls (keep-and-document vs restore-exact-axios) — see Key Decisions.

---

## Product Contract

### Summary

PR #238 replaced axios with native `fetch` + an `undici` dispatcher. A parity audit (`docs/reviews/2026-09-29-pr238-axios-fetch-parity.md`) reconciling **two independent model reviews** + repros found the documented/typed config surface fully at parity and tested; one reproduced bug and a small set of narrow/benign edges remain. This plan hardens the HTTP config translation so the parity claim holds without exceptions, adds the missing per-option and differential tests, and records the stacked-PR merge order for the trains that sit on top of #238.

> **Reconciled IDs (this plan predates the second review).** The review's canonical IDs: **B1** = proxy sync-throw (was H1, the one bug to fix), **B2** = `auth`/capital-`Authorization` header collision (new, low). The former H2/M1/M2/M3/L-series are downgraded to narrow/benign or info in the review; this plan still covers them all under the requirements below — treat their priority as: B1 first, then B2, then the narrow edges as decided by the owner.

### Problem Frame

`createHTTP$` builds the dispatcher and request options inline and synchronously. Because dispatcher construction runs during `resources.map()` (before `subscribe`), any construction error escapes the callback/promise contract. Several axios normalizations (IPv6 proxy hosts, protocol strings, `ALL_PROXY`, partial auth, header sentinel omission, HTTPS-proxy TLS) are not reproduced. The narrow surface is exactly the axios→undici config translation; isolating it makes each rule testable and each gap a one-spot fix.

### Key Decisions

- **KD1. Extract a translation layer.** Move proxy/TLS/socket dispatcher assembly (`buildDispatcher`) and a new header/auth normalizer into pure, individually unit-testable functions. Governs every finding below; enables differential tests.
- **KD2. Errors always flow through the observable/callback.** Wrap dispatcher construction in `createHTTP$` in try/catch and surface via `throwError`/`cbOnce`, matching the fail-fast `validateResources` path. Governs H1.
- **KD3. Policy calls for the M-series (owner decides, default = restore exact axios parity):**
  - M2 proxy schema: default **restore permissive** (`.unknown(true)` on the proxy object, `port` optional) for literal passthrough; alternative = keep fail-fast and document as an intentional breaking incompatibility.
  - M3 httpTimeout body scope: default **keep** the whole-request bound (correct for a readiness check) and **document + test** it as an intentional change; alternative = restore header-time scoping.
  - M1 env-proxy: default **document** the supported env vars and add `ALL_PROXY`; full per-URL axios emulation only if required.
- **KD4. The parity bar is per-option tests, not just a green suite.** Each finding lands with a test that fails before the fix. Differential tests (spin one server, assert axios and fetch paths agree) where a fixture can express it.

### Option mapping (delta from #238)

| Gap | Current (238) | Target |
|---|---|---|
| H1 IPv6 proxy host | `http://::1:8080` → throws | bracket IPv6 → `http://[::1]:8080` |
| H1 protocol `'http:'` | `http:://…` → throws | strip trailing `:`; validate `http`/`https` |
| H1 construction error | sync throw out of `waitOn()` | try/catch → callback/promise error |
| H2 HTTPS proxy TLS | `requestTls` only | `requestTls` **and** `proxyTls` (+ env path) |
| M1 env proxy | `EnvHttpProxyAgent` (no `ALL_PROXY`) | add `ALL_PROXY`; document env matrix |
| M2 proxy schema | `host`+`port` required, no unknowns | `.unknown(true)`, `port` optional (KD3) |
| M3 httpTimeout | bounds request+body | keep + document + test (KD3) |
| L1 redirect cap | 20 (fetch) | document (or enforce 21 if needed) |
| L2 partial auth | header only if `username` | build Basic whenever `auth` present, default `''` |
| L3 header sentinels | `false`/`null`/`undefined` stringified | drop them (axios omission) |
| I2 README | "axios detects" env proxies | describe undici env behavior |

---

## Requirements

- **R1 (H1):** proxy objects with a bare IPv6 host or a `protocol` containing a colon connect (or fail) exactly as axios did; no construction error ever throws synchronously out of `waitOn()` — it arrives at the callback/promise. Test: sync-throw guard + IPv6 + protocol-colon repros.
- **R2 (H2):** a self-signed HTTPS proxy with `strictSSL:false` connects (TLS opts applied to the proxy hop). Test: self-signed proxy fixture.
- **R3 (M1):** env-proxy behavior is documented and covers `ALL_PROXY`; `NO_PROXY` and unix-socket bypass unchanged. Test: env matrix.
- **R4 (M2):** decision applied; if permissive, a port-less/extra-key proxy object behaves as under axios. Test: proxy schema cases.
- **R5 (M3):** httpTimeout semantics documented; a GET whose body streams beyond httpTimeout has a test pinning the chosen behavior.
- **R6 (L1/L2/L3):** redirect cap documented; partial auth sends `Basic :p`; `false`/`null`/`undefined` headers omitted. Unit tests each.
- **R7 (types):** `index.d.ts` stays a superset of `@types/wait-on` — no narrowing, no axios types. `test/types-compat/dt-wait-on-tests.ts` + `test/types.test-d.ts` keep compiling; add a `tsd` assertion for `proxy`/`auth`/`headers` value types.
- **R8:** `npm test` green on Node 22.19 and 26; parity suite extended, no flake on the Windows CI row.

### Scope boundaries

- No new runtime deps (undici already carries proxy/TLS). No CLI flag changes. Reverse mode, file/tcp/socket/command resources untouched. Log-string format not a parity bar.

---

## Test strategy

- **Per-option unit tests** on the extracted translation functions (`buildDispatcher`, header/auth normalizer): pure input→output, no network.
- **Differential tests** where a fixture allows: one server, assert the axios reference behavior (documented/pinned) and the fetch path agree — proxy object, strictSSL, redirect on/off, partial auth header bytes.
- **Type-compat:** keep the vendored DefinitelyTyped consumer test; add `tsd` cases for `proxy` (host/port/protocol/auth), `auth`, and `headers` string|number|boolean values.
- **Frozen clock** for any timeout-dependent test (repo rule); mocha `--exit` retained.

---

## Stacked-PR merge order (trains on top of #238)

All of #239–#246 contain #238's `refactor!` commit — they are a **linear stack** on the same base. Merge in stack order; rebase each onto the previous once #238 lands. Force-push #238 first (rebased). Details in the review doc's forward-PR table.

| Order | PR | Adds | Conflict risk on rebase | Notes |
|---|---|---|---|---|
| 1 | **#238** axios→fetch | fetch/undici refactor | rebased clean onto master (index.d.ts auto-merged to master's superset) | this branch; land H1/H2 before/with it |
| 2 | **#239** drop-lodash | native replacements in `lib/wait-on.js` | low — its diff is relative to #238's `pick`/`partial`; replays on new #238 | removes `lodash` from deps |
| 3 | **#240** devdeps | eslint 10, mocha 12 | **med** — `package.json` devDeps + `package-lock` vs master (eslint 9/mocha 11); run `npm i`; fix any eslint-10 lint | lands before the test lane so 243–246 target eslint 10 |
| 4 | **#243** freeze-clock | `test/frozen-clock.js`, `.mocharc.json`, api tests | **med** — `test/api.mocha.js` three-way (238 +11, master #252 tweak, freeze-clock hunks) | keep mocha `--exit` in `.mocharc.json` |
| 5 | **#244** coverage-bin | `.nycrc.json`, coverage test, bin instrument | **med** — `bin/wait-on` now has #253 `--status-codes`; coverage numbers/branches shift | `.nycrc extension:""` instruments extensionless `bin/wait-on` |
| 6 | **#245** parser-properties | parser property tests | low-med — `bin/wait-on` 2-line vs #253; add `parseStatusCodes` property coverage | new master parser exists post-rebase |
| 7 | **#246** cli-conformance | black-box CLI suite (new files) | low — assert against current bin (status-codes, headers) | run last |

New-master features the stack inherits on rebase: types #250/#252 (index.d.ts), `--status-codes` #253 (bin), AGENTS.md #249 — additive; conflicts only where a PR touches the same file (noted above).

---

## Execution order

1. Extract `buildDispatcher` + header/auth normalizer (KD1); no behavior change; suite stays green.
2. H1 (guard + IPv6 + protocol) → R1. 3. H2 (proxyTls) → R2.
4. Owner confirms KD3 policy; apply M1/M2/M3 → R3/R4/R5.
5. L1/L2/L3 + README I2 → R6.
6. Add differential + tsd tests → R7; full suite on 22.19 + 26 → R8.
7. Rebase the stack #239→#246 in order (separate PRs; not this branch).

## Done when

- All eight findings closed or explicitly owner-accepted-and-documented; `docs/reviews/2026-09-29-pr238-axios-fetch-parity.md` verdict flips to "100%, no exceptions."
- Per-option + differential + type-compat tests green on Node 22.19 and 26; Windows row non-flaky.
