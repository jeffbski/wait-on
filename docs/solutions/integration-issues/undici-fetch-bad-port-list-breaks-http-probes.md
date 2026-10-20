---
title: undici fetch refuses Fetch bad-list ports, so an http probe built on it never reaches :6000
date: 2026-10-05
last_updated: 2026-10-20
category: integration-issues
module: lib/wait-on.js
problem_type: integration_issue
component: http_check
severity: high
symptoms:
  - "An http:/http-get: wait on a live server on port 6000 (or 5060, 6665-6669, 10080, ...) times out on 10.0.0-rc.1"
  - "Verbose log shows `HTTP(S) error for http://127.0.0.1:6000/ TypeError: fetch failed` on every poll"
  - "The same wait resolves on 9.5.1 (axios)"
root_cause: wrong_api
resolution_type: code_fix
applies_when:
  - "Building a liveness or reachability probe on fetch (undici or Node's global)"
  - "Migrating an HTTP client from axios/http to fetch"
  - "Setting maxRedirections on undici's redirect interceptor, or widening the undici range"
related_components: [test/https-proxy.mocha.js, test/cli.mocha.js]
tags: [undici, fetch, bad-port, axios, http-probe, redirect, parity, accept-encoding, lockfile, interceptor, proxy-agent]
---

# undici fetch refuses Fetch bad-list ports, so an http probe built on it never reaches :6000

## Problem

PR #238 moved wait-on's http checks from axios to undici `fetch`. Fetch implements the WHATWG
"bad port" list (1, 7, 9, ..., 5060, 5061, 6000, 6566, 6665-6669, 6697, 10080). It rejects a
request to those ports with `TypeError: fetch failed` (cause `bad port`) **before connecting**.
wait-on read that as "not ready yet" and polled until timeout. 9.x (axios) has no such list, so
this was a silent regression for anyone waiting on :6000, as
start-server-and-test's own `demo-multiple` script (defined in its package.json, not wait-on's) does. Repro: `node -e "require('undici').fetch('http://127.0.0.1:6000/').catch(e=>console.log(e.cause.message))"`
prints `bad port`.

## Root cause

fetch is a browser-security API: the bad-port list exists so a page cannot talk to SMTP, X11,
IRC and similar services. undici exposes no switch to turn it off. A probe whose job is
"can I reach whatever is listening on this port" is the wrong client for that API.

## Solution

Use undici's non-Fetch API on the same dispatcher (jeffbski/wait-on#260, pending upstream):

```js
const requestDispatcher = followRedirect
  ? dispatcher.compose(interceptors.redirect({ maxRedirections: 21, throwOnMaxRedirect: true }))
  : dispatcher;
const { origin, href } = new URL(url);
const path = href.slice(origin.length).split('#')[0];
const { statusCode, body } = await requestDispatcher.request({ origin, path, method, headers, signal });
// ok -> await body.arrayBuffer() (same signal keeps httpTimeout over the body);
// else body.on('error', () => {}).destroy()
```

Leaving fetch also drops behavior fetch supplied implicitly. Restore each one deliberately
and give it a test, or the swap regresses something else:

| fetch did this implicitly | restored with |
|---|---|
| `accept: */*`, `accept-language: *`, `user-agent: undici` default headers (some servers/WAFs 403/406 without them) | defaults under caller headers, matched case-insensitively |
| `accept-encoding`, chosen per request from that request's own url (undici `node_modules/undici/lib/web/fetch/index.js`, `httpNetworkOrCacheFetch`): `br, gzip, deflate, zstd` over https, `gzip, deflate` otherwise, `identity` under a `Range` header, recomputed on every redirect hop. `dispatcher.request` sends none, so a server that answers 406 without it timed out | `fetchAcceptEncoding` in `lib/wait-on.js`, an interceptor composed inside `interceptors.redirect` so it runs on every hop; skipped when the caller sets accept-encoding. The body is destroyed, never decoded, so any value is safe |
| sends the path as written, keeping an explicitly empty query (`/health?`), on the first request and on every redirect hop | `requestPath` slices `href` after `origin`, minus any `#fragment`; `pathname + search` drops the `?` because `search` is `''`. undici's redirect handler builds hop paths that way, so `keepRedirectQuery` (also inside the redirect interceptor) records the path each 3xx `Location` asked for and sends it on the next hop |
| fails after 20 redirects (9.x followed 21) | 9.x parity, not fetch: `maxRedirections: 21` with `throwOnMaxRedirect: true` (`lib/wait-on.js:469`), so a 2xx after 21 redirects resolves and a 22nd 3xx fails instead of reaching `validateStatus`. Requires undici `>=8.12.0`; see "The redirect count moved under a caret range" below |
| `res.body.cancel()` drops a rejected body at once | `body.destroy()` with an `error` listener (destroy emits `RequestAbortedError`); not `body.dump()`, which waits for the body to end, so a non-2xx body that never ends holds the poll slot until timeout |
| refuses a URL with userinfo | explicit throw (`dispatcher.request` would drop the credentials and send) |
| `redirect: 'manual'` leaves the 3xx | no redirect interceptor when `followRedirect: false` |

Accepted deltas, all closer to 9.x than to fetch: undici's redirect handler follows `300`,
a 2xx after 21 redirects resolves, a redirect loop stops at the first repeated URL, and a
caller `Host` header is sent as given.

One known delta from both: a redirect from a path to the same path plus an empty `?`
(`/selfq` → `/selfq?`) fails as `Redirect loop detected`. undici's redirect handler builds
its loop history from `pathname + search`, which drops the empty `?`, so the target equals
the current URL; `keepRedirectQuery` only changes what is sent on the wire and cannot reach
that check. fetch (`next`) follows it and resolves. 9.5.1 also fails, but by dropping the `?`
and re-requesting `/selfq` until its 21-redirect cap. Fixing it means replacing undici's
redirect interceptor, which is not worth it for a server that redirects to its own URL.

### Per-hop interceptors

Anything fetch computed per request must run on every redirect hop. `dispatcher.compose`
applies interceptors first-listed innermost, and `RedirectHandler` dispatches each hop
through the dispatch it was given, so an interceptor listed **before** `interceptors.redirect`
sees every hop with that hop's `origin` and `path`. It receives fresh opts each time; return
a copy rather than mutating them, or the change leaks into the redirect handler's own state.

`keepRedirectQuery` keeps one `WeakMap` per dispatcher, keyed by the `RedirectHandler`
instance, which dispatches every hop of one request. On a 3xx with a `Location` it stores the
origin and raw path that `Location` resolves to against the URL this hop actually sent. The
next dispatch through the same handler takes and deletes the entry, and uses its path only
when its origin equals that hop's `opts.origin`. The origin guard stops a saved path from
being sent to another server. If a hop ever got no entry of its own, a stale path saved for
an earlier origin must not be reused after a cross-origin redirect. A test pins this:
`/` → `/first?` → `http://other/second` must request `/second`.

To observe a hop's response, wrap the handler in a plain object that forwards each hook.
Do not use a JS `Proxy`, and do not use the deprecated `DecoratorHandler`. `ProxyAgent`
assigns `handler.onResponseStart = wrapper` on the handler it receives. A `Proxy` without a
`set` trap writes that through to the shared redirect handler, so the two wrappers call each
other and every request through an explicit or env proxy fails with `RangeError: Maximum
call stack size exceeded`. `DecoratorHandler` asserts `onResponseStart` runs once, but a
`100 Continue` calls it twice. `res.statusText` does not exist on
`dispatcher.request`; the verbose line uses `http.STATUS_CODES`.

## The redirect count moved under a caret range

The package range was `undici: ^8.10.2` and the lockfile held 8.11.2. Through 8.11.2 the
redirect handler checked `history.length >= maxRedirections` before deciding whether the
response was a redirect at all, so the final 2xx counted: `maxRedirections: 21` rejected a 2xx
after 21 redirects. undici 8.12.0 (nodejs/undici#5879, "fix throwOnMaxRedirect edge") counts
only a redirect it would follow, so the same setting resolves it. Checked 8.12.0 through 8.12.3.

CI ran `npm ci` on the lockfile and passed a test asserting the 8.11 behavior, while any
consumer's fresh install resolved 8.12.x and got the other behavior. That test failed under
8.12.3. A differential run of 9.5.1, next (fetch) and the PR against the same local servers
found it; the test suite alone could not, because it only ever saw the locked version.

The fix: raise the floor to `^8.12.0` (lockfile 8.12.3, no new dependency) so every install
has the 8.12 semantics, then choose `maxRedirections` for those semantics (21 = 9.x).

## Prevention

When a behavior depends on a dependency's off-by-one or edge semantics, the range floor must
be the version whose semantics the tests assert. Check by installing the newest version the
range allows (`npm install <dep>@<newest-in-range>`) and rerunning the boundary tests, not only
the locked one.

Pin the boundaries with tests in `test/https-proxy.mocha.js`: a 2xx after 20 and after 21
redirects resolves, after 22 fails; accept-encoding is fetch's value per scheme
over http and https and switches on http->https and https->http hops; a redirect to `/final?`
requests `/final?`, including cross-origin; an explicit and an env proxy still work (they caught
the `Proxy` recursion above), and a redirect hop through each keeps the empty query and
accept-encoding; `Range` gives `identity` over https and on every hop; a cross-origin hop
never reuses a saved path; a 3xx without `Location` reaches `validateStatus`; and a non-2xx GET whose body never
ends does not stall the wait. Code review of PR #262 found both after the
first version of this fix shipped `maxRedirections: 20` and `body.dump()`.

Test http probes on at least one Fetch bad-list port (`test/helpers/bad-port.js` listens on
the first free one, since macOS XQuartz may hold 6000; skipping on `EADDRINUSE` hid the tests), through every dispatcher branch: direct, explicit proxy, env proxy,
redirect onto the port, https with TLS options. The adversarial review of this fix found the
header and redirect-cap regressions; a fetch-to-request swap is a client change, not a
one-line call change.
