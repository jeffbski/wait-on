# PR #238 — axios → fetch/undici: feature & config parity confirmation

**PR:** jeffbski/wait-on#238 — `refactor!: replace axios with native fetch and undici (Node >=22.19)`
**Branch:** `refactor/axios-to-fetch` (rebased onto `upstream/master` @ `2f052a2`)
**Reviewed diff base:** `upstream/master...HEAD`
**Date:** 2026-09-29
**Method:** option-by-option comparison of the old axios path (`upstream/master:lib/wait-on.js`) vs the new fetch/undici path (`lib/wait-on.js`), the joi `WAIT_ON_SCHEMA`, `index.d.ts`, the vendored `@types/wait-on` consumer test (`test/types-compat/dt-wait-on-tests.ts`), and the runtime parity suite (`test/https-proxy.mocha.js`). Independent second read by a different model (codex) + a separate local reviewer.

## Verdict

**Reconciled from two independent model reviews (codex peer + a second local reviewer) plus direct repros against installed undici 8.11.2 / Node 26.** Both reviews + `npm test` (174 passing) agree the **documented, typed config surface is at parity**. They diverged on the edges; reconciled with empirical evidence below.

Types are solid: `index.d.ts` is a **superset** of the pre-refactor types (no narrowing, **no axios type references**), and the `@types/wait-on` consumer test compiles. Everything a caller passes via the published types maps 1:1 to fetch/undici with identical defaults: `headers`, `auth` (full creds), `ca`/`cert`/`key`/`passphrase`, `strictSSL`, `followRedirect` (true and false — undici `redirect:'manual'` returns the real 302, empirically), `validateStatus`, `--status-codes`, `proxy:false`, `proxy` object with a clean host/port, `proxy` unset (env), `http://unix:` / named pipes, all polling options. No leaks; teardown/abort/body-cancel verified.

**One genuine bug to fix for the literal "no exceptions" bar, plus narrow/benign edges:**

- **[MED · reproduced] B1 — proxy sync-throw escapes the callback contract.** A proxy object with a bare IPv6 host (`{host:'::1',port:8080}`) or a `protocol` with a trailing colon (`'http:'`) makes `buildDispatcher` throw **synchronously** out of `waitOn()` — the callback never fires. This violates the API's all-errors-via-callback/promise contract (which 238's own test asserts). This is the one item to fix.
- **[LOW · reproduced] B2 — `auth` + a capital-case custom `Authorization` header collide.** `{...headers}` keeps `Authorization` while the auth code sets `authorization`; undici merges them comma-joined (`"Bearer T, Basic …"`) instead of `auth` overriding, where axios deleted the existing header and won. Contradictory/rare config.
- **Narrow/benign (downgraded after the second review):** HTTPS-**proxy** TLS omits `proxyTls` (hardening; parity-vs-axios unverified); `EnvHttpProxyAgent` ignores `ALL_PROXY`; `proxy` schema requires host+port & rejects unknown keys (**benign — published `index.d.ts` already required host+port**); fetch redirect cap 20 vs axios 21 (extreme edge).
- **Not regressions / arguably improvements:** `httpTimeout` bounding the body read matches axios's whole-response timeout (immaterial for a readiness check); password-only `auth` now sends no header instead of a malformed `Basic :pw`; `false`/`null` header values stringify (number/boolean coerce fine). See below.

Two-review divergence, resolved: codex flagged the HTTPS-proxy/env/schema/timeout items as high/med; the second reviewer (empirically probing undici) rated them benign or parity and returned "ship-ready." Reconciled position: **parity holds for the real-world/typed path; fix B1 (and optionally B2) to make "100%, no exceptions" literal.** Details and repros below.

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
| `httpTimeout` | `int>=0` | axios `timeout` (whole response) | `AbortSignal.timeout(httpTimeout)`, also bounds the body read | https-proxy / api | YES (matches whole-response timeout) |
| `validateStatus` | `function` | axios `validateStatus(status)` | `validateStatus(res.status)`; default `2xx` when unset | cli (`--status-codes`) | YES |
| `headers` (string values) | `object` | axios `headers` | spread into `fetch` request headers | https-proxy (Basic) | YES |
| `headers` (`false`/`null`/`undefined` value) | `object` | omitted | stringified & sent | — | INFO (number/boolean coerce fine) |
| `auth` (username+password) | `object` | axios `auth` → Basic header | Basic header built from `auth` | https-proxy: "Basic Authorization header" | YES (edge **B2**: collides w/ capital-case custom `Authorization`) |
| `auth` (password only) | `object` | `Basic :p` (malformed) | no header | — | INFO (new more correct) |
| `ca` / `cert` / `key` / `passphrase` | str/binary/obj | `new https.Agent({...})` | undici `Agent`/`ProxyAgent` `connect: {...}` | https-proxy: self-signed + matching `ca` | YES (direct) |
| `strictSSL` | `bool =false` | `rejectUnauthorized` (default false), origin **and** proxy | `rejectUnauthorized` on origin (`requestTls`); **not on HTTPS proxy** | https-proxy: strictSSL true/false | YES (direct); HTTPS-proxy TLS = hardening (parity unverified) |
| `followRedirect: false` | `maxRedirects:0` (3xx fails 2xx) | `redirect:'manual'` (3xx returned, fails 2xx) | api: "timeout when followRedirect is false and redirects" | YES |
| `followRedirect: true` | follow, cap **21** hops | `redirect:'follow'`, cap **20** hops | — | NARROWED (extreme edge) |
| `proxy` object (clean host+port) | `[bool, object()]` (any object) | `ProxyAgent({uri, requestTls})`, creds %-encoded | https-proxy: dead-proxy fails reachable target | YES (**benign** narrowing — types already required host+port) |
| `proxy` object (IPv6 host / `protocol:'http:'`) | axios normalized | **sync `TypeError: Invalid URL`** out of `waitOn()` | verified repro | **B1** (bug) |
| `proxy: false` | no proxy | plain `Agent` | https-proxy: "connect directly when proxy is false" | YES |
| `proxy` unset (`HTTP(S)_PROXY`/`NO_PROXY`) | axios/proxy-from-env (also `ALL_PROXY`) | `EnvHttpProxyAgent` (no `ALL_PROXY`) | https-proxy: unix not routed via `HTTP_PROXY` | YES for `HTTP(S)_PROXY`/`NO_PROXY`; `ALL_PROXY` unsupported |
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

Severity-ranked, reconciled across both model reviews. "R" = reproduced by execution; "C" = code inspection.

### [B1 · MED · R] Malformed/IPv6 proxy object throws synchronously, escaping the callback/promise contract
`lib/wait-on.js` `buildDispatcher` (ProxyAgent branch, ~L360-369), called synchronously from `createHTTP$` inside `resources.map(...)` before `subscribe`.
`proxy.protocol` is `Joi.string()` and `proxy.host` is any string, so `{protocol:'http:'}` (trailing colon) or a bare IPv6 host `{host:'::1',port:8080}` pass validation; `buildDispatcher` builds `` `${protocol}://${host}:${port}` `` → `http:://…` / `http://::1:8080` → `new ProxyAgent()` throws `TypeError: Invalid URL` **synchronously** out of `waitOn()`. Callback never fires; promise never rejects.
- **Repro (both verified):** `waitOn({resources:['http://127.0.0.1:1/'], proxy:{host:'::1',port:8080}}, cb)` and `…proxy:{host:'h',port:8080,protocol:'http:'}…` → synchronous `TypeError`, `cb` never called.
- **Why it's the one to fix:** the API contract is all-errors-via-callback/promise — 238's own test asserts "malformed proxy → **callback** error, not a sync throw". These inputs slip past joi and violate it, regardless of what axios did with them.
- **Fix:** bracket IPv6 hosts and strip a trailing `:` from `protocol` before building the URI; wrap dispatcher construction in try/catch in `createHTTP$` and route via `throwError`/`cbOnce` (like `validateResources`). Optionally tighten `protocol` to `Joi.string().valid('http','https')`.

### [B2 · LOW · R] `auth` collides with a capital-case custom `Authorization` header
`lib/wait-on.js` L415-419. `requestHeaders = { ...headers }` keeps a caller's `Authorization` key; the auth code then sets `requestHeaders.authorization`. undici merges the two case-variants into one comma-joined header instead of `auth` overriding.
- **Repro (verified):** `waitOn({resources:['http://h'], headers:{Authorization:'Bearer T'}, auth:{username:'u',password:'p'}})` → sends `authorization: "Bearer T, Basic dXA6cA=="` → typically 401. axios deleted the existing header so `auth` won. (Lowercase `headers.authorization` + `auth` already works — the spread key is overwritten.)
- **Fix:** strip any case-variant `authorization` key from `requestHeaders` before setting it, or build with a `Headers` instance and `.set('authorization', …)`.

### Narrow / benign edges (downgraded after the second review)

- **[LOW · C] HTTPS-proxy TLS omits `proxyTls`.** `lib/wait-on.js` L369 sets `requestTls` (origin tunnel) but not `proxyTls` (TLS to the proxy), so a self-signed **HTTPS proxy** with `strictSSL:false` is rejected. Hardening opportunity; parity-vs-axios in this exact case is **unverified**. Fix: pass TLS as both `requestTls` and `proxyTls` (+ env path).
- **[LOW · C] Env-proxy ignores `ALL_PROXY`.** `lib/wait-on.js` L375 `EnvHttpProxyAgent` reads `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` only; axios's proxy-from-env also honored `ALL_PROXY`. Narrow. Fix: document supported env vars; add `ALL_PROXY` if desired.
- **[LOW · benign · R] `proxy` schema narrowed.** L54-62 requires `host`+`port` and rejects unknown keys (verified `"proxy.<key>" is not allowed`). **Benign:** the published `index.d.ts` `WaitOnProxyOptions` already required `host`+`port`, so typed consumers were already constrained and no well-formed axios `{host,port,auth,protocol}` is rejected — this aligns runtime with the published types. Only an untyped JS caller passing a loose object is affected. Decision: keep (document) or add `.unknown(true)` for literal passthrough.
- **[LOW · C] Redirect cap 20 vs 21.** L426 `redirect:'follow'` caps at 20 (WHATWG); axios/follow-redirects defaulted to 21. Only a chain of exactly 21 redirects then 200 differs. Document if it matters.

### Not regressions / arguably improvements (info)

- **`httpTimeout` bounds the body read** (L450-457, under `AbortSignal.any([teardown, timeout])`). Matches axios's whole-response `timeout`; immaterial for a readiness check (body discarded). No hang risk (unset → teardown-only signal). Second reviewer rated this parity.
- **Password-only `auth`** (L416, `auth.username != null`) now sends **no** header where axios sent a malformed `Basic base64(':pw')`. New behavior is more correct; nothing relies on the old header.
- **Non-string header values** (L415): axios omitted `null`/`undefined`/`false`; undici stringifies them. `number`/`boolean` coerce fine (probed `8080`/`true`). The widened `headers?: Record<string,string|number|boolean>` makes these typed values. Minor; drop `null`/`undefined`/`false` before fetch if exact omission is wanted.
- **Pre-existing:** `index.d.ts extends SecureContextOptions` advertises TLS fields (e.g. `ciphers`) as "type-check but ignored," but the joi schema rejects them at runtime (`"ciphers" is not allowed`) — true on `master` too, not a #238 regression.

### [I1] Node engines floor raised to `>=22.19` (intended breaking change)
`package.json` `engines.node: '>=22.19.0'` (from `>=20`). Required by `undici@^8`. Headline break of a `refactor!` major; commit carries a `BREAKING CHANGE:` footer (semantic-release → 10.0.0), CI matrix moved to 22/24/26, README/`index.d.ts` note the floor. No **type** impact beyond the runtime requirement. Ensure release notes call it out.

### [I2] README proxy docs still reference axios
`README.md` (~L198) still says environment proxies are "detected by axios". Update to describe undici's `EnvHttpProxyAgent` behavior.

## Test evidence

`npm test` on Node 26.3.1 — **174 passing** (eslint + `tsc` types + mocha), including:
- `test/https-proxy.mocha.js` — strictSSL true/false, matching `ca`, unix-socket (short+absolute), `HTTP_PROXY` not routed for unix, Basic auth header, explicit proxy object, `proxy:false` direct, malformed-proxy-as-callback-error.
- `test/api.mocha.js` — redirect follow (default) + "timeout when followRedirect is false and redirects".
- `test/cli.mocha.js` — `parseStatusCodes` / `--status-codes` → `validateStatus`.
- `test/types-compat/dt-wait-on-tests.ts` + `test/types.test-d.ts` — `@types/wait-on` compat compile.

## Bottom line

PR #238 ships a **superset of the pre-refactor types** (no narrowing, no axios types) and is at **full parity on the documented/typed config surface** — confirmed by two independent model reviews (one returned "100% parity, ship-ready") plus `npm test` (174 passing). The one item standing between it and literal "100%, no exceptions" is **B1** (proxy sync-throw — a contract-violation bug, reproduced; fix first). **B2** (auth/`Authorization` header collision) is a low-severity contradictory-config edge. The rest are narrow/benign (HTTPS-proxy `proxyTls`, `ALL_PROXY`, proxy schema, redirect cap) or arguably improvements (httpTimeout body scope, partial-auth, header sentinels); **I1** (engines) is intended and correctly flagged breaking. With **B1** fixed (and optionally **B2**), the "100%, no exceptions" claim holds. Tracked in the hardening plan: `docs/plans/2026-09-29-1030-refactor-harden-axios-fetch-parity-plan.md`.
