# PR #238 — axios → fetch/undici: feature & config parity confirmation

**PR:** jeffbski/wait-on#238 — `refactor!: replace axios with native fetch and undici (Node >=22.19)`
**Branch:** `refactor/axios-to-fetch` (rebased onto `upstream/master` @ `2f052a2`)
**Reviewed diff base:** `upstream/master...HEAD`
**Date:** 2026-09-29
**Method:** option-by-option comparison of the old axios path (`upstream/master:lib/wait-on.js`) vs the new fetch/undici path (`lib/wait-on.js`), the joi `WAIT_ON_SCHEMA`, `index.d.ts`, the vendored `@types/wait-on` consumer test (`test/types-compat/dt-wait-on-tests.ts`), and the runtime parity suite (`test/https-proxy.mocha.js`). Independent second read by a different model (codex) + a separate local reviewer.

## Verdict

**The common path is at full parity and tested; literal "100%, no exceptions" needs a handful of edge fixes — all in the proxy / TLS-proxy / timeout / header-coercion corners.**

Types are solid: `index.d.ts` is a **superset** of the pre-refactor types (no narrowing, **no axios type references**), and `npm test` is green (174 passing: eslint + `tsc` type-check + mocha), including the TLS/proxy/unix-socket parity suite and the `@types/wait-on` compat compile.

Everything a typical caller passes maps 1:1 to fetch/undici with identical defaults: `headers`, `auth` (full creds), `ca`/`cert`/`key`/`passphrase`, `strictSSL`, `followRedirect` (true and false), `validateStatus`, `--status-codes`, `proxy:false`, `proxy` object with a clean host/port, `proxy` unset (env), `http://unix:` / named pipes, and every polling option. See the matrix.

But an option-by-option audit (with an independent cross-model peer) found **edge gaps that break a literal 100%-parity claim** — mostly narrow, one that violates the API's error contract:

- **[H1]** Proxy objects that axios normalized but that break URL construction — a bare IPv6 host (`{host:'::1',port:8080}`) or a `protocol` with a trailing colon (`'http:'`) — make `buildDispatcher` throw **synchronously** out of `waitOn()`, escaping the callback/promise contract (both **verified**).
- **[H2]** TLS options are **not** applied to an HTTPS *proxy* connection (`proxyTls` omitted), so a self-signed HTTPS proxy with `strictSSL:false` is rejected where axios accepted it.
- **[M1]** Env-proxy resolution differs (`EnvHttpProxyAgent` ignores `ALL_PROXY`; per-URL rules differ from axios's proxy-from-env).
- **[M2]** `proxy` schema is narrowed (requires `host`+`port`, rejects unknown keys) vs the old unconstrained object.
- **[M3]** `httpTimeout` now bounds the whole request **including body read** (deliberate) — a slow-streaming 200 GET body that outlived `httpTimeout` used to succeed.
- **[L1]** redirect cap 20 (fetch) vs 21 (axios); **[L2]** password-only `auth` sends no header (axios sent `Basic :p`); **[L3]** `false`/`null`/`undefined` header values are stringified (axios omitted them).

None affect the tested common path; all are addressed in the hardening plan. Details and repros below.

## Config-object parity matrix

Legend: **YES** = identical behavior · **YES\*** = identical behavior, stricter fail-fast validation · **FIX** = gap, see findings.

| Option | Schema (joi) | Old (axios) | New (fetch/undici) | Test evidence | Parity |
|---|---|---|---|---|---|
| `resources` | `array(string).required` | n/a | n/a | api/cli suites | YES |
| `delay` | `int>=0 =0` | timer delay | timer delay (unchanged) | api | YES |
| `interval` | `int>=0 =250` | timer interval | timer interval (unchanged) | api | YES |
| `timeout` | `int>=0 =Inf` | overall wait timeout | overall wait timeout (unchanged) | api | YES |
| `window` | `int>=0 =750` | file stability window | file stability window (unchanged) | api | YES |
| `tcpTimeout` | `int>=0 =300` | socket setTimeout | socket setTimeout (unchanged) | api | YES |
| `commandTimeout` | `int>=0 =0` | exec kill bound | exec kill bound (unchanged) | api | YES |
| `simultaneous` | `int>=1 =Inf` | mergeMap concurrency | mergeMap concurrency (unchanged) | api | YES |
| `reverse` | `bool =false` | `negateAsync` | `negateAsync` (unchanged) | api | YES |
| `log` / `verbose` | `bool =false` | console logging | console logging (unchanged) | api | YES |
| `httpTimeout` | `int>=0` | axios `timeout`, reset on response headers | `AbortSignal.timeout(httpTimeout)`, **also bounds the body read** | https-proxy / api | CHANGED (**M3**) |
| `validateStatus` | `function` | axios `validateStatus(status)` | `validateStatus(res.status)`; default `2xx` when unset | cli (`--status-codes`) | YES |
| `headers` (string values) | `object` | axios `headers` | spread into `fetch` request headers | https-proxy (Basic) | YES |
| `headers` (`false`/`null`/`undefined` value) | `object` | omitted | stringified & sent | — | CHANGED (**L3**) |
| `auth` (username+password) | `object` | axios `auth` → Basic header | Basic header built from `auth` | https-proxy: "Basic Authorization header" | YES |
| `auth` (password only) | `object` | `Basic :p` | no header (guard requires username) | — | CHANGED (**L2**) |
| `ca` / `cert` / `key` / `passphrase` | str/binary/obj | `new https.Agent({...})` | undici `Agent`/`ProxyAgent` `connect: {...}` | https-proxy: self-signed + matching `ca` | YES (direct) |
| `strictSSL` | `bool =false` | `rejectUnauthorized` (default false), origin **and** proxy | `rejectUnauthorized` on origin (`requestTls`); **not on HTTPS proxy** | https-proxy: strictSSL true/false | YES (direct) / **H2** (via HTTPS proxy) |
| `followRedirect: false` | `maxRedirects:0` (3xx fails 2xx) | `redirect:'manual'` (3xx returned, fails 2xx) | api: "timeout when followRedirect is false and redirects" | YES |
| `followRedirect: true` | follow, cap **21** hops | `redirect:'follow'`, cap **20** hops | — | NARROWED (**L1**) |
| `proxy` object (clean host+port) | `[bool, object()]` (any object) | `ProxyAgent({uri, requestTls})`, creds %-encoded | https-proxy: dead-proxy fails reachable target | YES\* (**M2** narrowing) |
| `proxy` object (IPv6 host / `protocol:'http:'`) | axios normalized | **sync `TypeError: Invalid URL`** out of `waitOn()` | verified repro | **H1** |
| `proxy: false` | no proxy | plain `Agent` | https-proxy: "connect directly when proxy is false" | YES |
| `proxy` unset (`HTTP(S)_PROXY`/`NO_PROXY`) | axios/proxy-from-env (also `ALL_PROXY`) | `EnvHttpProxyAgent` (no `ALL_PROXY`; different per-URL rules) | https-proxy: unix not routed via `HTTP_PROXY` | PARTIAL (**M1**) |
| `socket:` / `http://unix:` | axios `socketPath` | undici `Agent({connect:{socketPath}})`, url normalized; Windows named-pipe aware `HTTP_UNIX_RE` | https-proxy: unix short + absolute forms | YES |
| `--status-codes` (CLI) | (n/a pre-#253) | `validateStatus` predicate → fetch path | cli `parseStatusCodes` suite | YES |

### On `proxy` validation (YES\*)

Old schema: `proxy: [Joi.boolean(), Joi.object()]` — accepted **any** object. New schema requires `host`+`port` and rejects unknown keys. This is a **tightening**, not a drop: the accepted shape exactly matches axios's documented proxy config and the `@types/wait-on` `AxiosProxyConfig`/`WaitOnProxyOptions` interface (`host`, `port`, `protocol?`, `auth{username,password}?`), which the compat test exercises. A caller passing a proxy object with extra keys that axios silently ignored would now get a fail-fast validation error. See **[LOW-1]**.

## Type compatibility (`index.d.ts`)

- **No axios types referenced.** `AxiosProxyConfig` and `HttpSignature` exist only as **local, deprecated aliases** kept for `@types/wait-on` source compatibility — they do **not** `import` from `axios`. No axios type dependency leaks to consumers.
- **No narrowing vs master / `@types/wait-on`.** After the rebase, `index.d.ts` is master's compat-hardened version: callback `cb(err?: Error)` (not narrowed to `Error | null`), `WaitOnOptions extends SecureContextOptions` (full, not `Pick<...>`), `headers?: Record<string, string | number | boolean>`. The only 238-side change retained is the richer `proxy` doc-comment (documents the `EnvHttpProxyAgent` env behavior).
- **Verified by compile.** `npm run test:types` (`tsc -p test/tsconfig.json`) compiles `test/types-compat/dt-wait-on-tests.ts` (verbatim DefinitelyTyped consumer test) and `test/types.test-d.ts` against the bundled `index.d.ts` — green.

## Refuted concerns (not regressions)

- **`httpsAgent` / `httpAgent` were never accepted.** `WAIT_ON_SCHEMA` is `Joi.object({...})` with **no** `.unknown(true)` on both old and new, so joi rejects unknown keys. wait-on always **constructed its own** `https.Agent` from `ca`/`cert`/`key`/`passphrase`/`strictSSL`; a user-supplied agent was never honored. `buildDispatcher` preserves this exactly. (Upstream #107 proposed adding custom-agent support; it never merged.)
- **`maxRedirects` was never a user option.** Only `followRedirect` (boolean) was exposed; joi rejects `maxRedirects`. `followRedirect` parity is preserved and tested.
- **No default drift.** `strictSSL=false`, `followRedirect=true`, `validateStatus=2xx`, proxy-unset→honor env — all identical to axios.

### Pre-existing note (parity-neutral, not introduced by #238)

`index.d.ts` declares `WaitOnOptions extends SecureContextOptions` with the comment "other TLS fields type-check but are **ignored**." At runtime the joi schema accepts only `ca`/`cert`/`key`/`passphrase`, so a TS consumer that sets another TLS field (e.g. `ciphers`, `minVersion`) compiles but gets a runtime `"<field>" is not allowed` validation error — "rejected," not "ignored." This types-vs-runtime mismatch exists **identically on `master` (axios) and on this branch**, so it is not a #238 parity regression, but it is worth reconciling separately (either widen the schema to accept-and-ignore extra `SecureContextOptions` fields, or soften the doc comment to say "rejected at runtime"). Confirmed independently by the cross-model peer.

## Findings

Severity-ranked. "V" = verified by repro/execution; "C" = confirmed by code inspection. Independently produced with a cross-model peer (codex).

### [H1] (V) Malformed-but-valid proxy object throws synchronously, escaping the callback/promise contract
`lib/wait-on.js` `buildDispatcher` (ProxyAgent branch, ~L360-369), called synchronously from `createHTTP$` inside `resources.map(...)` before `subscribe`.
`proxy.protocol` is `Joi.string()` and `proxy.host` is any string, so `{protocol:'http:'}` (trailing colon) or a bare IPv6 host `{host:'::1',port:8080}` pass validation; `buildDispatcher` then builds `` `${protocol}://${host}:${port}` `` → `http:://…` / `http://::1:8080` → `new ProxyAgent()` throws `TypeError: Invalid URL` **synchronously** out of `waitOn()`. Callback never fires; promise never rejects.
- **Repro (both verified):** `waitOn({resources:['http://127.0.0.1:1/'], proxy:{host:'::1',port:8080}}, cb)` and `…proxy:{host:'h',port:8080,protocol:'http:'}…` → synchronous `TypeError`, `cb` never called.
- **Parity impact:** axios normalized these and only touched the proxy inside the async request, so proxy errors always surfaced via callback/timeout. 238's own test asserts "malformed proxy → **callback** error, not a sync throw"; these cases slip past joi and violate it.
- **Fix:** bracket IPv6 hosts and strip a trailing `:` from `protocol` before building the URI; wrap dispatcher construction in try/catch in `createHTTP$` and route the error through `throwError`/`cbOnce` (like `validateResources`). Optionally tighten `protocol` to `Joi.string().valid('http','https')`.

### [H2] (C) TLS options are not applied to an HTTPS *proxy* connection
`lib/wait-on.js` L369 `new ProxyAgent({ uri, requestTls: connect })`. `requestTls` governs the tunneled origin TLS only; `proxyTls` (TLS to the proxy itself) is omitted, so it defaults to `rejectUnauthorized:true`. With `proxy:{protocol:'https',…}` behind a self-signed proxy cert and `strictSSL:false`, axios applied its (non-rejecting) https agent to the proxy hop and connected; undici rejects it.
- **Fix:** pass the resolved TLS opts as **both** `requestTls` and `proxyTls`; do the same for the `EnvHttpProxyAgent` connect path.

### [M1] (C) Environment-proxy resolution differs from axios
`lib/wait-on.js` L375 `EnvHttpProxyAgent`. axios's proxy-from-env honored `ALL_PROXY` and its own per-URL/`NO_PROXY` rules; `EnvHttpProxyAgent` reads only `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` (no `ALL_PROXY`) and resolves per-URL differently. A user relying on `ALL_PROXY` (or the exact axios env semantics) sees different routing.
- **Fix:** document the supported env vars explicitly, and/or resolve the proxy per-target-URL to match axios (add `ALL_PROXY`). Add an env-matrix test. Update the README proxy paragraph (see **I2**).

### [M2] (V) `proxy` object validation is narrowed
`lib/wait-on.js` L54-62. Old `proxy: [Joi.boolean(), Joi.object()]` accepted any object (including a port-less `{host}` and extra axios-shaped keys). New requires `host`+`port` and rejects unknown keys (`"proxy.<key>" is not allowed`, verified). Matches the `@types/wait-on` shape, but is a runtime tightening a looser axios caller would hit.
- **Fix:** either keep the fail-fast tightening and call it out as a documented breaking incompatibility, or add `.unknown(true)` / relax `port` for literal passthrough parity.

### [M3] (C) `httpTimeout` now bounds the whole request including body read (intentional semantic change)
`lib/wait-on.js` L450-457. The body read (`res.arrayBuffer()`) runs under the same `AbortSignal.timeout(httpTimeout)` as the request. axios reset its timeout on response headers, then relied on socket inactivity — a 200 whose body streams steadily for longer than `httpTimeout` succeeded before and now aborts (affects `http-get:`/`https-get:` only; HEAD has no body). Deliberate (documented in code), but a behavior change.
- **Fix:** keep it (recommended for a readiness check) but **document + test** the new semantics, or restore header-time timeout scoping if strict parity is required.

### [L1] (C) Default redirect cap changed 21 → 20
`lib/wait-on.js` L426 `redirect:'follow'`. fetch/WHATWG caps at 20 redirects; axios/follow-redirects defaulted to 21. A chain of exactly 21 redirects then 200 succeeded before and now fails.
- **Fix:** document, or intercept redirects to enforce 21 if parity matters (rare).

### [L2] (V) Password-only `auth` sends no header
`lib/wait-on.js` L416 `if (auth && auth.username != null)`. Schema allows `{auth:{password:'p'}}` (both fields optional); axios sent `Basic :p`, new code sends no `authorization`.
- **Fix:** build Basic whenever `auth` exists, defaulting `username`/`password` to `''`.

### [L3] (C) Non-string header values are stringified instead of omitted
`lib/wait-on.js` L415 `{ ...headers }`. axios omitted headers whose value was `null`/`undefined`/`false`; fetch stringifies them (`X-Feature: false`). The widened `headers?: Record<string, string|number|boolean>` type now makes `false` a typed value, so this is reachable.
- **Fix:** drop `null`/`undefined`/`false`-valued headers before the fetch (or coerce numbers/booleans to axios-equivalent strings) to match old omission.

### [I1] Node engines floor raised to `>=22.19` (intended breaking change)
`package.json` `engines.node: '>=22.19.0'` (from `>=20`). Required by `undici@^8`. Headline break of a `refactor!` major; commit carries a `BREAKING CHANGE:` footer (semantic-release → 10.0.0), CI matrix moved to 22/24/26, README/`index.d.ts` note the floor. No **type** impact beyond the runtime requirement (`@types/node` is a devDep; `/// <reference types="node" />` was already required). Ensure release notes call it out.

### [I2] README proxy docs still reference axios
`README.md` (~L198) still says environment proxies are "detected by axios". Update to describe undici's `EnvHttpProxyAgent` behavior once **M1** is resolved.

## Test evidence

`npm test` on Node 26.3.1 — **174 passing** (eslint + `tsc` types + mocha), including:
- `test/https-proxy.mocha.js` — strictSSL true/false, matching `ca`, unix-socket (short+absolute), `HTTP_PROXY` not routed for unix, Basic auth header, explicit proxy object, `proxy:false` direct, malformed-proxy-as-callback-error.
- `test/api.mocha.js` — redirect follow (default) + "timeout when followRedirect is false and redirects".
- `test/cli.mocha.js` — `parseStatusCodes` / `--status-codes` → `validateStatus`.
- `test/types-compat/dt-wait-on-tests.ts` + `test/types.test-d.ts` — `@types/wait-on` compat compile.

## Bottom line

PR #238 ships a **superset of the pre-refactor types** (no narrowing, no axios types) and is at **full parity on the tested common path**. It is **not yet literal "100%, no exceptions"**: fix **H1** (proxy sync-throw — contract violation, do first) and **H2** (HTTPS-proxy TLS); decide + document **M1/M2/M3** (env-proxy, proxy schema, httpTimeout body scope); mop up **L1/L2/L3** (redirect cap, partial auth, header sentinels) and **I2** (README). **I1** (engines) is intended and correctly flagged breaking. With H1/H2 fixed and M1–M3 decided-and-tested, the parity claim holds. Tracked in the hardening plan: `docs/plans/2026-09-29-*-harden-axios-to-fetch-parity-plan.md`.
