---
title: Reach Fetch bad-list ports again (undici request instead of fetch) - Plan
type: fix
date: 2026-10-05
artifact_contract: ce-unified-plan/v1
product_contract_source: legacy-requirements
execution: code
issue: 260
---

# Reach Fetch bad-list ports again (undici request instead of fetch) - Plan

Implementation-ready plan for jeffbski/wait-on#260 on branch `fix/260-fetch-bad-ports`
(base `next`). Executed by `/ce-work`, test-first per `AGENTS.md`.

## Goal Capsule

- **Objective:** an `http:`/`https:`/`http-get:`/`https-get:` wait on a live server whose port
  is on the WHATWG Fetch bad-port list (6000, 5060/5061, 6665-6669, 10080, ...) resolves again,
  as it did on every 9.x release (axios). start-server-and-test's own `demo-multiple` script (its package.json, not wait-on's; ports
  6000/6010) passes on 10.x.
- **Means:** replace undici `fetch` with `dispatcher.request` on the existing per-request
  dispatcher, composed with `interceptors.redirect` when `followRedirect` is true (KTD1, KTD2).
- **Authority:** jeffbski/wait-on#260 (issue body is the spec).
- **Stop conditions:** a public API / CLI flag / `WAIT_ON_SCHEMA` / `index.d.ts` change becomes
  necessary; a new runtime dependency becomes necessary; a `.github/workflows/` edit becomes
  necessary.
- **Ships via:** PR to `jeffbski/wait-on` base `next`, `Fixes #260`. Never merged by the worker.

## Product Contract

### Problem Frame

PR #238 moved HTTP checks from axios to undici `fetch`. Fetch enforces the bad-port list and
rejects with `TypeError: fetch failed` (cause `bad port`) before connecting, so wait-on polls
until timeout. 9.5.1 resolves on :6000; 10.0.0-rc.1 times out. Repo tests never used a
bad-list port; a dependent's own suite (start-server-and-test) found it.

### Requirements

- R1. HEAD (`http:`) and GET (`http-get:`) waits on a server listening on 127.0.0.1:6000 resolve.
- R2. `https:` on :6000 with `ca` + `strictSSL: true` resolves (TLS options still reach the
  connection).
- R3. `followRedirect: true` (default) follows a 302 whose `Location` is a bad-list port.
  `followRedirect: false` hands the 3xx status to `validateStatus` (a 302 from :6000 is
  accepted by a `validateStatus` that allows it).
- R4. An explicit `proxy` object and `HTTP_PROXY` (env) carry a request to a bad-list target,
  and the stub proxy counts it (proof the proxy path ran).
- R5. CLI `wait-on http://127.0.0.1:6000/` exits 0 with a server listening.
- R6. Unchanged: `auth` → Basic `Authorization` override, `headers`, `socketPath`/named pipes,
  `proxy: false`, `httpTimeout` bounding the whole response including the body,
  `validateStatus` default 2xx, body always consumed/dumped, teardown abort on finalize.
- R7. A url with userinfo (`http://user:pass@host/`) keeps failing as it did under `fetch`
  (which refuses credentials in URLs); `dispatcher.request` would silently drop them and send.
  Found during execution; guarded by "should keep failing an http url with userinfo".
- R8. fetch's default `accept: */*` and `user-agent: undici` are still sent (caller headers
  win, case-insensitively), and a chain past 20 redirects still fails even when
  `validateStatus` accepts 3xx (`throwOnMaxRedirect`). Found by the adversarial review;
  guarded by "should send default accept and user-agent headers" and "should fail an endless
  redirect chain".

### Accepted deltas from the fetch version

Each is closer to 9.x (axios + follow-redirects) than to 10.0.0-rc.1, so none is guarded back
to fetch behavior:

- A `300` with `Location` is followed (undici's redirect handler and follow-redirects both do;
  fetch did not).
- A caller `Host` header is sent as given (axios did; fetch replaced it).
- The verbose result line's `statusText` comes from `http.STATUS_CODES`, so a non-standard
  status logs `undefined` instead of the server's reason phrase. Log text is not a contract.

### Scope Boundaries

- No change on `master` / 9.x (axios has no bad-port list).
- No new options; the redirect cap stays Fetch's 20.

## Planning Contract

### Key Technical Decisions

- KTD1. `dispatcher.request({ origin, path, method, headers, signal })` instead of
  `undici.request(url, { dispatcher })`: same dispatcher, so TLS (`connect`), `ProxyAgent`,
  `EnvHttpProxyAgent` and `socketPath` routing are untouched. undici's non-Fetch API has no
  bad-port list. Alternative (keep fetch, special-case ports) rejected: undici exposes no
  switch, and a second code path doubles the matrix.
- KTD2. `followRedirect: true` → `requestDispatcher = dispatcher.compose(interceptors.redirect({
  maxRedirections: 20 }))`, matching Fetch's cap. `false` → base dispatcher, so the 3xx is the
  response and reaches `validateStatus`. `finalize` still closes the base dispatcher.
- KTD3. Body: on ok, `await body.arrayBuffer()` under the same signal (keeps `httpTimeout` over
  the body); on every other exit, `body.dump()` so the connection returns to the pool.
- KTD4. Verbose output used `res.statusText`, which `request()` lacks; use
  `http.STATUS_CODES[status]`.
- KTD5. Tests that need port 6000 skip (not fail) when it is taken (`EADDRINUSE` → `this.skip()`),
  since macOS XQuartz and parallel lanes can hold it.

### Test placement

API tests go in `test/https-proxy.mocha.js` (it owns the generated cert and the fetch-migration
parity matrix) under a new `describe('Fetch bad-list ports (#260)')`; CLI test in
`test/cli.mocha.js`.

### Matrix (R1-R4)

| target port | scheme | method | redirect | proxy | test |
|---|---|---|---|---|---|
| 6000 | http | HEAD | - | env unset | R1 HEAD |
| 6000 | http | GET | - | env unset | R1 GET |
| 6000 | https + ca + strictSSL | HEAD | - | env unset | R2 |
| ephemeral → 6000 | http | HEAD | follow | env unset | R3 follow |
| 6000 | http | HEAD | 302, no follow | env unset | R3 no-follow |
| 6000 | http | HEAD | - | explicit object | R4 explicit (count) |
| 6000 | http | HEAD | - | `HTTP_PROXY` | R4 env (count) |

Carve-out: https × proxy × bad port is not added; the https proxy path (CONNECT + `requestTls`)
is unchanged by this fix and already covered by existing parity tests, and the bad-port gate
lived only in `fetch`, which is removed for every cell at once.

## Implementation Units

### U1. Failing bad-port tests (RED)

- **Requirements:** R1-R5.
- **Files:** `test/https-proxy.mocha.js`, `test/cli.mocha.js`.
- **Approach:** helper `listenOn6000(server, cb)` that skips on `EADDRINUSE`; a counting stub
  proxy (`connect` handler tunnels and counts; absolute-form requests forwarded and counted).
- **Test scenarios:** the matrix rows plus the CLI exit-0 case.
- **Verification:** each fails on `next` with a timeout whose verbose cause is `bad port`.

### U2. Switch `httpCallSucceeds` to `dispatcher.request` (GREEN)

- **Requirements:** R1-R6.
- **Files:** `lib/wait-on.js`.
- **Approach:** KTD1-KTD4. Update the undici import comment.
- **Verification:** U1 tests green; whole suite green.

## Verification Contract

- `npm run test:mocha -- --grep "bad-list"` red before U2, green after.
- `npm test` (lint + types + mocha + coverage gate) green.
- After GREEN, revert `lib/wait-on.js` temporarily and confirm U1 fails with `bad port`.

## Definition of Done

- U1 and U2 land in one commit; `npm test` green locally and upstream CI green on ubuntu + windows.
- PR to `jeffbski/wait-on` base `next` with `Fixes #260` and a "How this lands on the Rust spike"
  section.
- `docs/solutions/` learning (Fetch bad-port list vs probes; dependents-before-major) committed.
