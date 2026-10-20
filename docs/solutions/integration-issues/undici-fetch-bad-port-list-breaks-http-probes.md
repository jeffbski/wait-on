---
title: undici fetch refuses Fetch bad-list ports, so an http probe built on it never reaches :6000
date: 2026-10-05
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
related_components: [test/https-proxy.mocha.js, test/cli.mocha.js]
tags: [undici, fetch, bad-port, axios, http-probe, redirect, parity]
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
const { origin, pathname, search } = new URL(url);
const { statusCode, body } = await requestDispatcher.request({ origin, path: pathname + search, method, headers, signal });
// ok -> await body.arrayBuffer() (same signal keeps httpTimeout over the body);
// else body.on('error', () => {}).destroy()
```

Leaving fetch also drops behavior fetch supplied implicitly. Restore each one deliberately
and give it a test, or the swap regresses something else:

| fetch did this implicitly | restored with |
|---|---|
| `accept: */*`, `accept-language: *`, `user-agent: undici` default headers (some servers/WAFs 403/406 without them) | defaults under caller headers, matched case-insensitively |
| sends the path as written, keeping an explicitly empty query (`/health?`) | path sliced from `href` after `origin`, minus any `#fragment`; `pathname + search` drops the `?` because `search` is `''` |
| fails after 20 redirects | `throwOnMaxRedirect: true` (undici otherwise hands the 21st 3xx to `validateStatus`) with `maxRedirections: 21`, because undici counts the final response: at 20, a 2xx after exactly 20 redirects fails with `max redirects` |
| `res.body.cancel()` drops a rejected body at once | `body.destroy()` with an `error` listener (destroy emits `RequestAbortedError`); not `body.dump()`, which waits for the body to end, so a non-2xx body that never ends holds the poll slot until timeout |
| refuses a URL with userinfo | explicit throw (`dispatcher.request` would drop the credentials and send) |
| `redirect: 'manual'` leaves the 3xx | no redirect interceptor when `followRedirect: false` |

Accepted deltas, both closer to 9.x than to fetch: undici's redirect handler follows `300`,
and a caller `Host` header is sent as given. `res.statusText` does not exist on
`dispatcher.request`; the verbose line uses `http.STATUS_CODES`.

## Prevention

Pin both boundaries with tests: a 2xx after exactly 20 redirects resolves, and a non-2xx GET
whose body never ends does not stall the wait. Code review of PR #262 found both after the
first version of this fix shipped `maxRedirections: 20` and `body.dump()`.

Test http probes on at least one Fetch bad-list port (6000 with skip-on-`EADDRINUSE`, since
macOS XQuartz may hold it), through every dispatcher branch: direct, explicit proxy, env proxy,
redirect onto the port, https with TLS options. The adversarial review of this fix found the
header and redirect-cap regressions; a fetch-to-request swap is a client change, not a
one-line call change.
