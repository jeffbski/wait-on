---
title: Restore @types/wait-on Compatibility - Plan
type: fix
date: 2026-09-29
artifact_contract: ce-unified-plan/v1
product_contract_source: legacy-requirements
execution: code
---

# Restore @types/wait-on Compatibility - Plan

## Goal Capsule

- **Objective:** TypeScript projects that compiled against `@types/wait-on@5.3.4` compile again against the `index.d.ts` that `wait-on` began bundling in 9.3.0 — verified by the `ts250` repro and DefinitelyTyped's own consumer test compiling clean.
- **Means:** Relax three over-strict declarations in `index.d.ts` back to the `@types` shape (callback `err`, proxy/signature aliases, TLS options), and add regression tests that would have failed on the 9.3.0 break (KTD1–KTD3).
- **Authority:** Orchestrator brief (all decisions user-directed). Runtime `lib/wait-on.js` is the source of truth for the callback contract.
- **Stop conditions:** any lib/ runtime change becomes necessary; a decision below proves wrong against the runtime; a new dependency would be required.
- **Execution profile:** types + tests only. `fix(types):` commit → semantic-release cuts 9.4.1.

## Product Contract

### Summary

Widen the bundled `index.d.ts` to be source-compatible with `@types/wait-on@5.3.4`, and lock the compatibility in with tests: annotated-callback type tests, a vendored DefinitelyTyped consumer corpus, and a runtime/type agreement test.

### Problem Frame

Since 9.3.0 (#236) the package ships `index.d.ts` (`"types": "index.d.ts"`), which TypeScript prefers over the `@types/wait-on@5.3.4` a consumer may still have installed. The bundled types are stricter than the old ones and break existing code (jeffbski/wait-on#250):

- Callback typed `(err: Error | null) => void`; a `(err?: Error) => void` handler fails with TS2345.
- `waitOn.AxiosProxyConfig` / `waitOn.HttpSignature` removed → TS2694 for consumers that referenced them.
- `WaitOnOptions extends Pick<SecureContextOptions, 'ca'|'cert'|'key'|'passphrase'>` rejects any other TLS option (e.g. `ciphers`) the old full-`SecureContextOptions` extension allowed.

The existing type tests only used unannotated `(err) =>` callbacks, which echo the declaration back and cannot catch a compatibility break — so #250 shipped green.

### Requirements

Type compatibility:
- R1. The callback overload accepts `(err?: Error) => void` (and `(err: any)`, `(err: unknown)`, `(err: Error | undefined)`), and does not force `Error | null` handling.
- R2. `waitOn.AxiosProxyConfig` and `waitOn.HttpSignature` resolve as named types in the `waitOn` namespace, marked `@deprecated`.
- R3. `WaitOnOptions` accepts TLS options beyond `ca`/`cert`/`key`/`passphrase` (e.g. `ciphers`).

Regression coverage (would have caught #250):
- R4. `test/types.test-d.ts` asserts R1 with explicitly annotated callbacks plus a `@ts-expect-error` case proving `null` handling is not forced, and references the R2 aliases and an R3 TLS option.
- R5. DefinitelyTyped's own `@types/wait-on` consumer test is vendored and kept compiling under `npm run test:types`.
- R6. A runtime/type agreement test asserts the success callback receives `err === undefined` (strictly, not `null`) in both normal and reverse-mode success.

Constraints:
- R7. No `lib/` runtime change; no new dependencies. Verified: on success rxjs `complete: cleanup` calls `cleanup()` with no arg → `cbOnce(undefined)`; error paths pass an `Error`/Joi error. `null` never occurs.

### Scope Boundaries

`index.d.ts` and `test/**` only. README documents only plain-JS `waitOn(opts, function (err) {...})` (no TS signature) → no README change.

## Planning Contract

### Key Technical Decisions

- KTD1. Callback overload becomes `cb: (err?: Error) => void` (session-settled: user-directed — chosen over keeping `Error | null`: `null` never occurs at runtime and the union breaks `(err?: Error)` consumers). Governs R1.
- KTD2. Add to the namespace: `/** @deprecated use WaitOnProxyOptions */ type AxiosProxyConfig = WaitOnProxyOptions;` and a `@deprecated` `HttpSignature` (`{ keyId: string; key: string }`, with a note it is not used at runtime). Alias over reintroduced standalone interfaces — `AxiosProxyConfig` and `WaitOnProxyOptions` are structurally identical (session-settled: user-directed — chosen over leaving them removed: removal causes TS2694). Governs R2.
- KTD3. `WaitOnOptions extends SecureContextOptions` (full), with a doc comment that only `ca`/`cert`/`key`/`passphrase` are used at runtime (session-settled: user-directed — chosen over the `Pick`: `@types` extended full `SecureContextOptions`). `SecureContextOptions` has no index signature, so excess-property checks still reject unknown keys like `bogus`. Governs R3.
- KTD4. Vendor the DT consumer test verbatim except the import path (`wait-on` → `../../index`), with an MIT-from-DefinitelyTyped header (source URL + note it must keep compiling), and add it to `test/tsconfig.json` `include`. Its options are all runtime-supported, so no edits to the vendored body. Governs R5.

### Assumptions

- Named type import `import { WaitOnOptions } from "../../index"` compiles under the test's `module: node16` against our `export =` namespace — DT's identical `export = waitOn` structure compiled the same import in DT CI. Verified at implementation; if it fails it is a real compat gap to fix, not to work around.

## Implementation Units

U1. **Relax `index.d.ts`** — Files: `index.d.ts`. Apply KTD1 (line 5 overload), KTD2 (add two `@deprecated` members in the `waitOn` namespace), KTD3 (change the `WaitOnOptions extends` clause + doc comment). Verify: `npm run test:types`.

U2. **Annotated callback type tests** — Files: `test/types.test-d.ts`. Add positive cases `(err?: Error)`, `(err: any)`, `(err: unknown)`, `(err: Error | undefined)`; a `@ts-expect-error` case that forcing `Error | null` is not required; and references to `waitOn.AxiosProxyConfig`, `waitOn.HttpSignature`, and a `ciphers` TLS option. Covers R4. Verify: `npm run test:types`.

U3. **Vendor DT compat corpus** — Files: `test/types-compat/dt-wait-on-tests.ts` (new), `test/tsconfig.json`. Fetch via `gh api repos/DefinitelyTyped/DefinitelyTyped/contents/types/wait-on/wait-on-tests.ts --jq .content | base64 -d`; keep verbatim except imports → `../../index`; add MIT/source/must-keep-compiling header; add the path to `include`. Covers R5 (and KTD4). Verify: `npm run test:types`.

U4. **Runtime/type agreement test** — Files: `test/api.mocha.js`. Assert the success callback is invoked with `err === undefined` (strict, not `null`) in normal callback form and in a reverse-mode success. Covers R6. Verify: `npm run test:mocha`.

## Verification Contract

- `npm test` green in the worktree (`lint` + `test:types` = `tsc -p test/tsconfig.json` + `test:mocha`).
- External consumer proof: `npm pack`, install the tarball into the `ts250` repro, run the repro's `tsc` (`repro.ts` uses `(err?: Error)` callback, `waitOn.WaitOnOptions`, `waitOn.AxiosProxyConfig`) → clean compile.
- Fork CI green on the PR.

## Definition of Done

- R1–R7 met; `index.d.ts` diff is the three relaxations only; no `lib/` or dependency change.
- All four units' verifications pass; `npm test` green; `ts250` repro compiles against the packed tarball.
- No experimental/dead code left in the diff.
- PR open on `kevinold/wait-on` (base `master`), `fix(types):` title, body lists the three "tests that would have caught this", CI green.
