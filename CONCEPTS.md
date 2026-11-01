# Concepts

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## HTTP checks

### HTTP probe
The check an `http:`/`https:` (HEAD) or `http-get:`/`https-get:` (GET) resource runs on each poll: one request on a per-request undici dispatcher that carries TLS options, proxy choice and the unix socket path.

It must reach any port a server can listen on, so it uses undici's `dispatcher.request`, not `fetch`. See `docs/solutions/integration-issues/undici-fetch-bad-port-list-breaks-http-probes.md`.

### Fetch bad-port list
The WHATWG Fetch list of ports (e.g. 5060, 5061, 6000, 6665-6669, 10080) that any `fetch` implementation, undici's included, refuses before connecting.

9.x (axios) never had it; 10.0.0-rc.1 (undici `fetch`) did, which made waits on those ports time out (#260).

## Releases

### Dependents run
Running a published dependent's own test suite against the packed wait-on tarball, compared with the dependent's pinned published wait-on as a baseline; a command that fails only on the tarball is a regression.

See `docs/solutions/best-practices/run-dependents-suites-against-the-tarball-before-a-major.md`.
