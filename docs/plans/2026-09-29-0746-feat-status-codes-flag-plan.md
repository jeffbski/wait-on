---
title: Status Codes CLI Flag - Plan
type: feat
date: 2026-09-29
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Status Codes CLI Flag - Plan

## Goal Capsule

- Objective: a CLI user can wait on an http(s) server whose probe path answers with a non-2XX status (e.g. an API root returning 404) by listing the accepted statuses on the command line, with no `.js` config file.
- Means: a `--status-codes CODES` flag in `bin/wait-on` compiled to the existing `validateStatus` option (KD2, KTD1). `lib/wait-on.js` is untouched.
- Delivery: one PR from a fresh branch off upstream `master` to jeffbski/wait-on, closing #187 and covering #49.
- Stop conditions: stop and surface if the library turns out not to forward `validateStatus` for some http resource form, or if upstream CI rejects the approach.

---

## Product Contract

### Summary

Today only a `.js` config or the Node API can set `validateStatus`, so a CLI user whose API root returns 404 cannot wait on it. `--status-codes 200-499` (or `404`, or `200,404`) maps to a `validateStatus` function inside `bin/wait-on`. The help text and README document it, and CLI tests cover parsing and end-to-end behavior.

### Problem Frame

Issue #187 (and #49): users want to check a server is up by polling a path that intentionally returns a non-2XX status. The library already supports arbitrary status acceptance (`WAIT_ON_SCHEMA` accepts `validateStatus: Joi.function()`; `createHTTP$` passes it to axios via `pick`), but the CLI cannot express it and a JSON config cannot hold a function. The gap is purely in `bin/wait-on`, `bin/usage.txt`, and `README.md`.

### Requirements

**Flag grammar and validation**

- R1. `--status-codes CODES` is accepted; `CODES` is a comma-separated list of tokens, each a single integer code `N` or an inclusive range `N-M`, whitespace around tokens ignored.
- R2. Each code is an integer in 100-599 and a range requires lo <= hi. An empty token, non-numeric token, out-of-range code, or inverted range exits non-zero with a message naming the offending value.

**Behavior**

- R3. The flag applies to every http(s)/http(s)-get resource in the run, including `http://unix:SOCK:URL` resources. A status in the set is available; any other status (including 2XX when not listed) is not. Reverse mode inverts as today; with default `followRedirect`, the final post-redirect response is judged.
- R4. `--status-codes` replaces a config-file `validateStatus` (CLI wins).
- R5. No short alias and not `multiple`; a repeated flag is last-wins (parseArgs default), documented in one line.

**Docs and tests**

- R6. `bin/usage.txt` gets an entry; `README.md` mirrors it in the usage copy, mentions the flag next to `validateStatus` in the API options, and the line-7 default-2XX sentence points to the flag.
- R7. The parser is exported from `bin/wait-on` (like `parseHeaders`) and unit-tested; CLI integration tests exercise success, failure, validation errors, and config override.

### Key Decisions

- KD1. Ship a CLI flag rather than leaving `validateStatus` config-file-only (session-settled: user-directed — chosen over option 1 "config file only": the user asked to implement option 2 and the reporter confirmed it is the request). Governs R1, R6.
- KD2. Flag name and grammar are `--status-codes CODES` with single/comma/range values (session-settled: user-directed — chosen over the narrower `--allow-non-5xx`: the maintainer specified this name and grammar on the issue). Governs R1, R2, R5.
- KD3. CLI value overrides (does not merge with) a config-file `validateStatus`; a set and a function cannot be sensibly merged, and precedence mirrors CLI resources and CLI headers. Governs R4.

### Scope Boundaries

- Out: an `--allow-non-5xx` alias, changing the default 2XX semantics, any `lib/wait-on.js` or `index.d.ts` change, a `followRedirect` CLI flag, #139 config-file docs (done in #231).
- Out: making the flag `multiple` or adding a short alias.
- Out: unrelated local working-tree changes (`.claude/settings.json`, `.mcp.json`, `mise.toml`, `scripts/reindex-codebase-memory.sh`, the untracked axios-to-fetch plan); none belong in this PR.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Parser in the CLI.** An exported pure function in `bin/wait-on` returns a predicate over a `Set` of accepted codes; wiring in `main` is a few lines. The library already accepts and forwards `validateStatus`, so this is the smallest diff and keeps the API and TypeScript types unchanged. Owns R1, R2, R7 (unit half).
- KTD2. **Option key `status-codes`.** Declared in `optionDefs` as a string; parseArgs keys it verbatim (`values['status-codes']`). Because it is declared, the `--no-` remap and unknown-flag consumption are unaffected. Owns R5.
- KTD3. **Precedence point.** Assign over `configOpts.validateStatus` after the config is required and before `waitOn`, next to the header block. Parse errors route through `errorExit` like `parseHeaders`. The existing `opts` reduce loop is not used because the flag does not map 1:1 to a library option name. Owns R4 per KD3.
- KTD4. **Test fixture proves override.** A new `test/config-status-codes.js` (sibling of `test/config-headers.js`) exports a `validateStatus` that always returns false, so a passing `--status-codes 404` run proves the CLI won. Tests are not date-dependent, so no frozen clock.

### High-Level Technical Design

Directional grammar for `CODES` (R1, R2):

```text
CODES := item ( "," item )*
item  := ws code ws | ws code ws "-" ws code ws
code  := integer, 100 <= code <= 599
range := lo "-" hi, lo <= hi, inclusive
ws    := optional spaces/tabs
```

Accepted: `404`, `200-499`, `200,204,404`, `200-299,404`, ` 200 - 499 , 503 `. Rejected with a message naming the value: empty, `abc`, `2xx`, `600`, `99`, `499-200`, `200,,204`.

---

## Implementation Units

### U1. Parser and wiring in the CLI

- **Goal:** `--status-codes CODES` becomes a `validateStatus` predicate passed to `waitOn`.
- **Requirements:** R1, R2, R3, R4, R5, R7 (unit half); KD2, KTD1-KTD3.
- **Dependencies:** none.
- **Files:** `bin/wait-on`, `test/cli.mocha.js`.
- **Approach:**
  1. Add the `status-codes` string option to `optionDefs`.
  2. Add the exported parser per the grammar in High-Level Technical Design; add it to `module.exports`.
  3. In `main`, after the header block, parse whenever the option is set (`!== undefined`, not a truthiness check like the header block: non-strict parseArgs yields `""` for `--status-codes=` and `true` for a bare trailing `--status-codes`, and both must fail per R2; the parser rejects a non-string value with a message naming the flag), route errors to `errorExit`, assign the predicate to `configOpts.validateStatus`, with a one-line comment on CLI-over-config precedence and last-wins on repeat.
- **Patterns to follow:** `parseHeaders` (throw with the bad value; caller wraps in try/catch and `errorExit`); header block placement and comment style in `main`; `cli parseHeaders` unit describe.
- **Test scenarios:**
  - Input `404`: predicate true for 404, false for 200 and 500.
  - Input `200-499`: true for 200, 404, 499; false for 199, 500.
  - Input ` 200 , 404-405 `: whitespace tolerated; true for 200, 404, 405.
  - Inputs `abc`, `2xx`, `600`, `99`, `499-200`, `200,,204`, empty string: each throws with the offending token in the message.
  - `parseArgv(['--status-codes', '404', RES])`: argv `status-codes` is `'404'`, resources `[RES]`.
  - `parseArgv(['--status-codes', '404', '--status-codes', '500', RES])`: `status-codes` is `'500'` (last wins).
- **Verification:** new `cli parseStatusCodes` describe and `cli parseArgv` row pass; lint clean.

### U2. CLI integration tests and config fixture

- **Goal:** end-to-end proof that the flag changes exit behavior for http resources and wins over config.
- **Requirements:** R2, R3, R4, R7; KTD4.
- **Dependencies:** U1.
- **Files:** `test/cli.mocha.js`, `test/config-status-codes.js` (new).
- **Approach:** a `context('status codes (#187, #49)')` block beside the header context, using fresh localhost ports and the existing `httpServer` cleanup. Keep "should timeout when an http resource returns 404" as the default-behavior baseline.
- **Patterns to follow:** the 404 server test (~line 316), the header context (~lines 668-753), the malformed-header stderr assertion (~line 719), and the `config-headers.js` merge test (~line 733).
- **Test scenarios:**
  - 404 server, `http://localhost:PORT --status-codes 200-499` + FAST_OPTS: exit 0.
  - 404 server, `--status-codes 404`: exit 0.
  - 500 server, `--status-codes 200-499`: exit non-zero (timeout).
  - 200 server, `--status-codes 404`: exit non-zero (2XX excluded when not listed).
  - 404 server, `http-get://localhost:PORT --status-codes 404`: exit 0.
  - `--status-codes 499-200` (and `abc`): exit non-zero, stderr contains the bad value.
  - `--status-codes=` + resource, and a trailing bare `--status-codes`: exit non-zero, stderr names the flag or empty value (no silent fallback to 2XX).
  - 404 server, `--config test/config-status-codes.js ... --status-codes 404`: exit 0 (CLI overrides config).
  - 404 server, `-r --status-codes 404`: exit non-zero (reverse inverts the accepted set).
- **Verification:** mocha green; nyc coverage gate still met for `bin/wait-on`.

### U3. Documentation

- **Goal:** help text and README describe the flag, its grammar, and precedence.
- **Requirements:** R5, R6.
- **Dependencies:** U1.
- **Files:** `bin/usage.txt`, `README.md`.
- **Approach:**
  1. Add a `--status-codes` entry to Standard Options in `bin/usage.txt` after `-H, --header`: grammar, example `--status-codes 200-499`, CLI overrides config `validateStatus`, repeat is last-wins.
  2. Mirror it verbatim in the README usage copy.
  3. Extend the README `validateStatus` API bullet and config-example comment to name `--status-codes`; amend line 7's 2XX sentence to point to the flag.
- **Patterns to follow:** the `-H, --header` entry in `bin/usage.txt` and its README mirror and API bullet.
- **Test scenarios:** Test expectation: none -- documentation only; the README usage block must match `bin/usage.txt` text.
- **Verification:** `wait-on --help` shows the entry; README and usage text agree.

---

## Verification Contract

| Gate | Command / check | Applies to |
|---|---|---|
| Lint + types + mocha | `npm test` | U1-U3 |
| Coverage gate | `npm run test:coverage` | U1, U2 |
| Manual smoke | 404 server satisfies `wait-on http://localhost:PORT --status-codes 200-499`; times out without the flag | U1 |
| Upstream CI | commitlint + pr-title (Conventional Commits) pass on the PR | delivery |

---

## Definition of Done

- R1-R7 implemented in `bin/wait-on`, `bin/usage.txt`, `README.md`, `test/cli.mocha.js`, `test/config-status-codes.js`; no change to `lib/wait-on.js` or `index.d.ts`.
- All Verification Contract gates green.
- This plan ships in the PR under `docs/plans/` (upstream tracks plans).
- PR opened from a fresh branch off upstream `master` against jeffbski/wait-on `master`, Conventional Commits title, body closes #187 and references #49; unrelated local modifications excluded.
- Cleanup: no abandoned-attempt code, debug output, or stray temp files in the diff; test servers closed by existing hooks.
