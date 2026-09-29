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
- `npm run lint` — eslint over `lib/**/*.js`, `test/**/*.js`, `bin/wait-on`
  (flat config `eslint.config.mjs`).
- `npm run test:mocha` — `mocha --exit "test/**/*.mocha.js"` (`--exit` is required: spun-up
  test servers leave open handles).
- `npm run test:coverage` — nyc + mocha.
- Node engines floor is `>=20.0.0` on master.

## Conventions

- CommonJS throughout; keep it (no ESM, no build step).
- Tests: mocha + chai, files `test/*.mocha.js` (`api.mocha.js`, `cli.mocha.js`,
  `validation.mocha.js`); shared fixtures `test/config-http-resources.js` and
  `test/config-headers.js`. A bug fix starts with a failing test that reproduces it.
- Time-dependent tests run on a frozen/fake clock. The pipeline is timer-driven; never
  assert against the real wall clock.
- CI runs on **ubuntu + windows** (matrix node 20/22/24, `npm ci --engine-strict`). No
  POSIX-only assumptions: mind Windows named pipes and path separators, and don't rely on
  unix-only tooling (e.g. `openssl speed`) or shell.
- Conventional Commit messages (semantic-release + commitlint are proposed in #241).
- Keep `README.md` (and `bin/usage.txt`) in sync whenever options or CLI flags change.
- `.npmignore` hygiene: exclude new top-level dev/tooling files from the published package.
- CLI headers: `-H` / `--header "Name: value"` is repeatable and merges with config-file
  headers, CLI winning on conflict (#234).

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
