# CLAUDE.md

Guidance for AI agents and engineers working in **wait-on**.

## Project Overview

`wait-on` is a cross-platform CLI + Node.js API that waits for files, ports, TCP
sockets, and http(s) resources to become available (or, with `--reverse`, to go
away). It is a widely-used build/test utility (e.g. wait for a dev server before
running e2e tests).

- **CLI** — `bin/wait-on` (help text in `bin/usage.txt`).
- **API** — `lib/wait-on.js`, exported as `main` (`lib/wait-on`). One `waitOn(opts, cb?)`
  function; promise-based, callback optional.
- Resource prefixes: `file:`, `http(s):`, `http(s)-get:`, `tcp:`, `socket:`, plus
  `http://unix:<socket>:<path>` (see `PREFIX_RE` in `lib/wait-on.js`).

## Stack

- Node `>=20`. Plain CommonJS (`'use strict'`), no build step.
- Deps: `axios` (http, forced http adapter), `rxjs` (polling/merge logic),
  `joi` (options schema `WAIT_ON_SCHEMA`), `lodash/fp`, `minimist` (CLI args).

## Commands

- `npm test` — lint + mocha (the full check).
- `npm run test:mocha` — `mocha --exit 'test/**/*.mocha.js'`.
- `npm run test:coverage` — nyc + mocha.
- `npm run lint` — eslint over `lib/`, `test/`, `bin/wait-on` (flat config: `eslint.config.mjs`).

## Testing

- Mocha, files `test/**/*.mocha.js`: `api.mocha.js`, `cli.mocha.js`,
  `validation.mocha.js`. Shared http fixtures in `test/config-http-resources.js`.
- `--exit` is required (open handles from spun-up test servers). Add tests
  alongside behavior changes; a bug fix starts with a failing test that
  reproduces it.

## Code Discovery (graph-first)

This repo is indexed by **codebase-memory-mcp**. For structural questions —
what calls X, what X calls, where a symbol is defined, dead code, impact —
use the graph tools first (`search_graph`, `trace_path`, `get_code_snippet`,
`get_architecture`), then LSP (documentSymbol / findReferences / goToDefinition),
then fall back to `rg`/Grep for text, comments, and config. The graph is small
(~150 nodes) and precise; grep over `lib/wait-on.js` is the last resort.

## Agent Tooling

- `.mcp.json` launches codebase-memory-mcp via `mise exec -- codebase-memory-mcp`;
  `mise.toml` pins the version. The graph cache is per-developer under
  `~/.cache/codebase-memory-mcp` (never committed).
- `.claude/settings.json` SessionStart hook runs `scripts/reindex-codebase-memory.sh`
  to refresh the graph at session start (best-effort, backgrounded).
- Compound Engineering: per-checkout config in `.compound-engineering/config.local.yaml`
  (gitignored; all settings optional).

@AGENTS.md
