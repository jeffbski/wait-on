# AGENTS.md

Guidance for AI agents and engineers working in **wait-on**. This file is the single
source; `CLAUDE.md` only imports it.

## What wait-on is

`wait-on` is a cross-platform CLI + Node.js API that waits for files, ports, TCP
sockets, and http(s) resources to become available — or, with `--reverse` / `reverse`,
to go away. It is a widely-used build/test utility (e.g. wait for a dev server before
running e2e tests).

Two front doors to the same behavior — **keep them in sync**:

- **API** — `waitOn(opts[, cb])` in `lib/wait-on.js` (package `main`, `lib/wait-on`).
  Omit the callback and it returns a Promise; pass `cb(err)` and it uses the callback
  form. Options are validated against `WAIT_ON_SCHEMA`.
- **CLI** — `bin/wait-on` (help text in `bin/usage.txt`). A new user-facing option needs
  the schema entry *and*, when exposed on the CLI, a flag in `bin/wait-on`, an entry in
  `bin/usage.txt`, and a `README.md` update.

## Architecture

An rxjs polling pipeline in `lib/wait-on.js`:

- `waitOn` → `waitOnImpl`: validate `opts` against the joi `WAIT_ON_SCHEMA`, fail fast on
  malformed resources (`validateResources`), build one observable per resource with
  `createResource$`, then `combineLatest` them and `merge` in a `timer(timeout)` error
  observable. The stream runs `takeWhile(states => states.some(x => !x))` until every
  resource reports ready, then `cleanup` fires the callback once.
- Each resource polls with `timer(delay, interval)` → `mergeMap` (concurrency =
  `simultaneous`) → check → `startWith(false)` → `distinctUntilChanged()` → `take(2)`.
- **Resource types by prefix** (`PREFIX_RE`, dispatched in the `createResource$` switch):
  - `file:` (default when no prefix) — waits for the file to exist and its size to
    stabilize over `window`.
  - `http:` / `https:` — HEAD returns 2xx.
  - `http-get:` / `https-get:` — GET returns 2xx.
  - `tcp:` — `tcp:host:port` connects (bare port defaults to localhost; `[ipv6]:port` ok).
  - `socket:` — connects to a unix-domain socket.
  - `http://unix:<sock>:<path>` — http over a unix socket / Windows named pipe.
- **Reverse mode** (`reverse: true` / `--reverse`): each check is inverted (async checks
  via `negateAsync`; the `file:` check flips to "size is -1"), so `waitOn` succeeds when
  the resources are *un*available.
- **Validation**: `WAIT_ON_SCHEMA` (joi) defines every option and its default;
  `validateResource` rejects syntactically bad http/tcp resources up front with a clear
  error instead of polling until timeout.
- **HTTP**: requests go through axios with the http adapter forced
  (`axios.create({ adapter: 'http' })`), which avoids xhr/jsdom log pollution.

**Add a new resource type:** extend `PREFIX_RE`, add a `case` in the `createResource$`
switch, write a `create<Type>$` factory following the existing
`timer → mergeMap → startWith(false) → distinctUntilChanged → take(2)` shape (honor
`reverse` via `negateAsync`), and add a `case` in `validateResource` when the resource
has syntax worth failing fast on.

## Stack

- Node `>=20`, plain CommonJS (`"type": "commonjs"`, `'use strict'`), no build step.
- Runtime deps (current on master): `axios` (http), `rxjs` (polling/merge), `joi`
  (`WAIT_ON_SCHEMA`), `lodash` (via `lodash/fp`).
- CLI args are parsed with Node's built-in `util.parseArgs` (minimist was removed, #233).
- **Upcoming:** jeffbski/wait-on#238 raises the engines floor to `>=22.19` and #238/#239
  propose dropping `axios`/`lodash`. Describe the current state above; do not assume those
  have merged.

## Commands

- `npm test` — the full check: `npm run lint && npm run test:mocha`.
- `npm run lint` — eslint over `lib/**/*.js`, `test/**/*.js`, `features/**/*.js`, `cucumber.js`,
  `bin/wait-on`
  (flat config `eslint.config.mjs`).
- `npm run test:mocha` — `mocha --exit "test/**/*.mocha.js"` (`--exit` is required: spun-up
  test servers leave open handles).
- `npm run test:coverage` — nyc + mocha.
- `npm run contract` — the consumer contract: cucumber-js runs `features/*.feature` against the
  packed working tree, installed into the `features/fixtures/{cjs,esm,ts}` projects. Pass
  cucumber flags after `--` (`--tags`, `--name`, `--world-parameters '{"package":"<tgz|spec>"}'`).
- `npm run contract:9` — the same contract against the published `wait-on@9.5.1`, minus
  `@since:10` scenarios.
- Node engines floor is `>=20.0.0` on master.

## Conventions

- CommonJS throughout; keep it (no ESM, no build step).
- Tests: mocha + chai, files `test/*.mocha.js` (`api.mocha.js`, `cli.mocha.js`,
  `validation.mocha.js`); shared fixtures `test/config-http-resources.js` and
  `test/config-headers.js`. How to write them: see
  [Test-Driven Development](#test-driven-development-mandatory).
- CI runs on **ubuntu + windows** (matrix node 20/22/24, `npm ci --engine-strict`). No
  POSIX-only assumptions: mind Windows named pipes and path separators, and don't rely on
  unix-only tooling (e.g. `openssl speed`) or shell.
- Conventional Commit messages (semantic-release + commitlint are proposed in #241).
- Keep `README.md` (and `bin/usage.txt`) in sync whenever options or CLI flags change.
- `.npmignore` hygiene: exclude new top-level dev/tooling files from the published package.
- CLI headers: `-H` / `--header "Name: value"` is repeatable and merges with config-file
  headers, CLI winning on conflict (#234).

## Test-Driven Development (Mandatory)

**All executable code is written test-first. No exceptions.** That covers `lib/`, `bin/`,
`index.d.ts`, scripts, test helpers, and configuration, tooling, and CI changes; "trivial",
"just wiring", and "just a rename" are not exemptions. The one carve-out is docs-only
edits (`README.md`, `AGENTS.md`, `docs/**`), which have no behavior to test. Where a mocha
test cannot go red, RED is the nearest failing check: a type test in `test/types.test-d.ts`
(`npm run test:types`) for `index.d.ts`, or a command observed failing before the change
(`npm test`, `npm pack --dry-run` output) for config, tooling, and CI.

Why this is strict: #238 (axios → undici) named its riskiest assumption in the plan and
verified it in prose. The env-proxy branch dropped `strictSSL`/`ca`/`cert` for HTTPS
targets, and no test combined HTTPS target × env proxy × TLS option. A reviewer found it.

**How implementation runs:** through `/ce-work` (`compound-engineering:ce-work`) from a
plan in `docs/plans/`, including the increment that follows a `/ce-brainstorm` or
`/ce-plan` handoff. The cycle below is what that run must do; it is not a license to
edit `lib/`, `bin/`, or `test/` inline in the main session.

### The cycle

1. **RED** — write one failing test for the next behavioral increment in the matching file
   (API → `test/api.mocha.js`, CLI → `test/cli.mocha.js`, schema and resource syntax →
   `test/validation.mocha.js`). Run it (`npm run test:mocha -- --grep "<name>"`).
2. **Right reason** — read the failure. It counts as red only when it fails on the
   assertion that describes the missing behavior, not on a typo, missing fixture, port
   collision, or a timeout from a broken harness. A test that passes on first run is
   investigated before any code is written.
3. **GREEN** — the minimum code that passes. Nothing the test does not demand.
4. **Full suite** — `npm test` (lint + types + mocha), not just the new test.
5. **REFACTOR** — on green only; rerun after each change.
6. **Repeat** per increment. Test and code land in the same commit.

### Rules

- **Bugs start as a failing reproduction** at the layer where the bug shows (API test for
  `lib/`, subprocess CLI test for `bin/`), including reviewer- and user-reported defects.
  After GREEN, temporarily undo the fix and confirm the test fails with the reported error.
- **Named risks become failing tests.** Every plan risk, Outstanding Question, or "verify X"
  step names the test that answers it, and that test is written before the code it guards.
  A prose verification step does not count. When the risk concerns one branch of a dispatch
  (below), its test runs on every sibling branch sharing the mechanism at risk, unless the
  plan records a reasoned carve-out. Plan authors: an Outstanding Question without a named
  test is incomplete.
- **Every branch of a selection or dispatch function has a test**: the `createResource$`
  prefix switch, `validateResource`, any function that picks an agent or dispatcher by
  option. Adding a branch adds its test.
- **Input combinations are a matrix.** When a change touches how two or more inputs interact
  (options, resource scheme such as http vs https, environment such as
  `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`), the plan enumerates the matrix and each reachable
  cell gets a test or a reasoned carve-out. Testing each input alone does not cover the
  combination.
- **Prove the path ran.** A test of a routed or conditional path asserts that the path was
  taken (the stub proxy counted a CONNECT tunnel, the socket server saw the request), not
  only the final outcome. Otherwise it can pass through a fallback.
- **Coverage is a signal, not proof.** Full line and branch coverage from
  `npm run test:coverage` can still miss a matrix cell.
- **Test behavior at the front doors**: what `waitOn` resolves or rejects with, and the CLI's
  exit code, stdout, and stderr. Behavior reachable from both gets a test at both. Use real
  servers, sockets, and files; stub only the network edge, with local servers. Name tests
  for behavior: `it('should succeed when ...')`.
- **Self-contained tests**: ephemeral ports (`listen(0)`), temp paths, skip (don't fail)
  when a tool such as `openssl` is missing. Platform rules are in Conventions (CI bullet).
  Windows delete-pending flakes are fixed with test headroom and retry, not `lib/` changes.
- **Clock.** Timing-dependent tests use a fake clock that virtualizes rxjs scheduling and
  freezes `Date`, leaving global timers real (network teardown needs them; node:test
  `mock.timers` breaks rxjs intervals on Node 22.19). Only fixed-state tests freeze. Tests
  whose resource changes on a real `setTimeout`, and CLI subprocess tests, stay on the real
  clock with generous headroom. This is a deliberate wait-on exception to any
  freeze-the-clock-globally rule: do not convert real-clock tests.

### Anti-patterns

- Writing all the tests first, then all the code.
- Over-implementing on GREEN (the complete, optimized solution instead of what the test demands).
- Mirror tests that recompute the expected value with the production logic; use concrete values.
- Skipping RED verification: writing test and code together, never seeing the failure.
- Mocking wait-on's own modules or rxjs instead of testing through `waitOn` or the CLI.
- Leaving `.only`, `.skip`, or a disabled test in the diff.

## Consumer contract

`features/*.feature` is the executable contract for projects that use `wait-on` as a library
or CLI. Each scenario states concrete values (outcome, error name and message, stderr line,
exit code, elapsed bounds). cucumber-js (`cucumber.js`, strict: an undefined or pending step
fails) installs the package once per run into fresh temp copies of the fixture projects.

- **Layout.** `features/*.feature`; step code, hooks and servers in `features/support/`
  (the only `require` path, so fixture runners never load as steps); consumer projects in
  `features/fixtures/{cjs,esm,ts}`; committed test-only TLS material in `features/fixtures/tls`.
- **Package.** The `package` world parameter: unset packs the working tree, `*.tgz` installs a
  tarball, anything else is an npm spec. A `name@x.y.z` spec must install exactly that version,
  or `BeforeAll` fails.
- **Fixtures.** `cjs/run.js` is the full runner: JSON options and an optional `--callback` in,
  one JSON result line out (`outcome`, `errorName`, `errorMessage`, `cbCalls`, `cbArg`,
  `cbSync`, `returned`, `elapsedMs`) after any log output; a string `validateStatus` is the body
  of `function (status)`. It reports at `beforeExit`, or exits shortly after settling when a
  handle keeps the process alive (9.5.1 leaves an unanswered request open); in callback form it
  first waits out the wait's timeout so a late second callback is counted. `esm/run.mjs` and
  `ts/run.ts` (compiled once per run, `@types/node` at the locked version) run the Promise form;
  `esm/named.mjs` is the named import that must fail.
- **Tags.** Layers `@api`, `@cli`, `@engine`, `@consumer`; `@kind:good` / `@kind:bad` pair what
  works with how it fails; `@fixture:<cjs|esm|ts>` pins a scenario's fixture (default `cjs`);
  `@since:10` marks a 10-only guarantee (gate below); `@engines:multi` scenarios are excluded;
  `@route:js` / `@route:none` are inert text kept from the spike.
- **Placeholders.** Steps fill `<tmp>`, `<port>` (and other server vars such as `<proxy>`) and
  `<resource N>` (the Nth resource the scenario declared) into inputs, and map actual values
  back before comparing output; log lines read `wait-on(<pid>)`. CLI output keeps resource
  strings and maps only the vars.
- **Clock and env.** Real clock with the `TOLERANCE_MS` bounds from
  `test/helpers/cli-conformance.js` (subprocess runs, the TDD Clock exception). Servers use
  `listen(0)`. Children get the proxy variables (`HTTP(S)_PROXY`, `ALL_PROXY`, `NO_PROXY`,
  `npm_config_*proxy`) scrubbed, plus only what the scenario sets.
- **Offline.** Both commands need the registry: the tarball's dependencies, and `wait-on@9.5.1`.
- **PEMs.** Regenerate all seven files together (the CA keys are discarded; 100-year validity,
  so no rotation):

  ```sh
  cd features/fixtures/tls
  T=$(mktemp -d)
  ca() { openssl req -x509 -newkey rsa:2048 -nodes -keyout "$2" -out "$1" -days 36500 -subj "/CN=$3" \
    -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign,cRLSign; }
  leaf() { # out key cn extfile
    openssl req -newkey rsa:2048 -nodes -keyout "$2" -out "$T/req.csr" -subj "/CN=$3"
    openssl x509 -req -in "$T/req.csr" -CA ca.pem -CAkey "$T/ca-key.pem" -CAcreateserial \
      -CAserial "$T/ca.srl" -out "$1" -days 36500 -extfile "$4"
  }
  ca ca.pem "$T/ca-key.pem" "wait-on test CA"
  ca other-ca.pem "$T/other-ca-key.pem" "wait-on other CA"
  printf 'basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\nextendedKeyUsage=serverAuth\n' > "$T/server.ext"
  printf 'basicConstraints=critical,CA:FALSE\nextendedKeyUsage=clientAuth\n' > "$T/client.ext"
  leaf server.pem server-key.pem localhost "$T/server.ext"
  leaf client.pem client-key.pem "wait-on test client" "$T/client.ext"
  openssl pkcs8 -topk8 -v2 aes-256-cbc -in client-key.pem -out client-key-encrypted.pem -passout pass:wait-on-test-passphrase
  rm -rf "$T"
  ```

### Release gate (9.5.1 vs 10.x)

At RC time, pack the candidate and run
`npm run contract -- --world-parameters '{"package":"<rc tgz>"}'` and `npm run contract:9`.
To (re)assign `@since:10`, run the whole suite on 9.5.1 with no tag filter:
`npm run contract -- --world-parameters '{"package":"wait-on@9.5.1"}'`. Re-run each failure
with `--name`; only a failure that reproduces counts. Verdict per scenario:

- red on 10.x, green on 9.5.1: **regression**, blocks GA. Never tag it.
- red on both: **harness defect**; fix the scenario or step (never `lib/`) before reading verdicts.
- red on 9.5.1 only on an elapsed bound: harness defect (tolerance), never `@since:10`.
- red on 9.5.1 on a cucumber step or hook timeout: harness defect until a direct run of the
  fixture shows 9.5.1 itself misbehaving
  (`docs/solutions/test-failures/contract-runner-hangs-on-9-5-1-open-handle.md`).
- green on 10.x, red on 9.5.1: **intentional change**. Tag `@since:10` with a one-line
  `# 9.5.1: <behavior it replaces>` directly above the tag line. The PR body lists those lines;
  each becomes a BREAKING or fixed release-note entry.
- a scenario pinning a known open 10.x defect that is red on 9.5.1 is tagged `@since:10` only to
  keep `contract:9` green, its comment reads `# 9.5.1: <observed> — 10.x pins a known defect here
  (<name>), not an intentional change`, and it is not a release-note change.

`npm run contract:9 -- --tags @since:10` must run zero scenarios (tag expressions combine
with `and`).

## Compounding Knowledge

Run `/ce-compound` (`compound-engineering:ce-compound`) when the work produced a specific
learning a future session would otherwise rediscover: a non-obvious fix, an architectural
decision, or a pattern the plan did not anticipate. It writes the problem, what worked, and
what failed to `docs/solutions/` (new doc or update). Routine work with nothing non-obvious
behind it needs no run.

- **When:** before the shipping PR opens, so the `docs/solutions/` change lands in the same
  PR; or mid-execution as soon as the learning appears.
- **Mode:** headless runs (`/lfg` and other unattended runs) use
  `/ce-compound mode:non-interactive`; interactive sessions may run it bare.

## What not to do

- No new runtime dependencies without discussion — the dep list is deliberately small and
  under active trimming.
- No breaking API or CLI changes outside a major version.
- Never publish from a local machine; publishing is release automation's job.

## Code Discovery (graph-first)

This repo is indexed by **codebase-memory-mcp**. For structural questions — what calls X,
what X calls, where a symbol is defined, dead code, impact — use the graph tools first
(`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`), then your editor's
LSP (documentSymbol / findReferences / goToDefinition), then fall back to `rg`/grep for
text, comments, and config. The graph is small (~150 nodes) and precise; grep over
`lib/wait-on.js` is the last resort.

## Agent Tooling

- `.mcp.json` launches codebase-memory-mcp via `mise exec -- codebase-memory-mcp`;
  `mise.toml` pins the version. The graph cache is per-developer under
  `~/.cache/codebase-memory-mcp` (never committed).
- A SessionStart hook (`.claude/settings.json`) runs `scripts/reindex-codebase-memory.sh`
  to refresh the graph at session start (best-effort, backgrounded).
- Compound Engineering: per-checkout config in `.compound-engineering/config.local.yaml`
  (gitignored; all settings optional).

<!-- overdrive:start (managed by overdrive `bootstrap.sh --init`; a rerun replaces this block) -->
## Overdrive harness

This project uses the [overdrive](https://github.com/kevinold/overdrive) harness. Install or update the agent side (plugins, skills, hooks, MCP) with `npx -y github:kevinold/overdrive`; what each agent gets: [capability matrix](https://github.com/kevinold/overdrive/blob/main/docs/capability-matrix.md).

### Project commands

Detected stack: JavaScript (Node). Run these before calling work done:

- Test: `npm test`
- Lint: `npm run lint`

### Model gears

Three gears, never one model:

- **Driver (worker)** — the everyday model, set per session. Does the typing/building.
- **Overdrive (reasoning)** — a stronger model escalates for plan + brainstorm
  (compound-engineering: `plan_model` / `brainstorm_model`).
- **Peer (second opinion)** — `cross_model_peer`. A *different*, differently-trained model
  adversarially re-reviews. Never trust one model's output.

Each host sets gears its own way: [docs/capability-matrix.md](https://github.com/kevinold/overdrive/blob/main/docs/capability-matrix.md) (Gears per host).

### House style

Two behavior plugins run by default. They set how the agent works, not what it builds.

- **ponytail**: build the least code that works. Reuse before you add. Question whether a piece needs to exist.
- **caveman**: keep output terse. Signal, not filler.

Toggle per session: `/ponytail lite|full|ultra`, `/caveman lite|full|ultra`. Turn off with `stop ponytail` or `stop caveman`.

### Egress disclosure (important)

`cross_model_peer: codex` **sends full file/document content to a separate third-party
model** (codex / OpenAI). It runs on a *separate* subscription — it buys a second opinion,
not free tokens, and it is not covered by your Claude budget.

Enable it as a **reviewed, opt-in** decision weighed against your repo's data sensitivity —
**not** a default. If your code must not leave your Claude provider, leave `cross_model_peer`
unset. See `.compound-engineering/config.yaml`.

### The compounding loop

Knowledge compounds instead of being rediscovered:

1. Solve a non-trivial problem during a session.
2. Run `/ce-compound` — it writes the learning to `docs/solutions/`.
3. File-memory + `docs/solutions/` are read by the next session, so the next cycle starts
   from the fix instead of rediscovering it.

Three memory layers under everything: prompt cache (reuse, not re-send) ·
`codebase-memory-mcp` (code graph) · file-memory + `docs/solutions/` (durable knowledge).

<!-- overdrive:end -->
