# Fix: intermittent Windows failure — reverse-mode file unlink test

- **Date:** 2026-09-28
- **Branch:** `fix/win-reverse-file-unlink` (lands on `refactor/axios-to-fetch`, #238 head)
- **Symptom:** `api › should succeed when file resources are not available later in reverse mode: Error: Timeout of 3000ms exceeded` (`test/api.mocha.js`), windows-latest, Node 26.x. Intermittent — 22.x/24.x passed the same run; the promise-form twin passed while the callback-form twin failed. Normally finishes ~500ms.

## Root cause

The test writes two temp files, `fs.unlinkSync`s them after 300ms, and expects reverse-mode `waitOn` to succeed once both are gone.

Reverse file detection path (`lib/wait-on.js`):

- `createFileResource$` reverse operator is `map((size) => size === -1)` — "gone" iff size is -1.
- `getFileSize` does `try { return (await fstat(path)).size } catch { return -1 }`.

So the error-code hypothesis (EPERM/EBUSY on a delete-pending file) is **already handled**: any stat throw → `-1` → reverse "gone". Not a product bug.

The real mechanism is the *other* branch: on Windows an unlinked file can linger in **delete-pending** state — an antivirus/Search-indexer handle held without `FILE_SHARE_DELETE` makes Node fall back to delete-on-close. While pending, `fs.stat` keeps **succeeding** and returns the real size, so `size === -1` stays false and wait-on **correctly** keeps polling until the OS finishes the delete. Under Defender load that window can exceed the suite's `this.timeout(3000)` (top of the `api` describe) → mocha timeout.

## Decision: test-only fix (`test:`)

wait-on cannot treat a successfully-statable file with a real size as "gone" without breaking forward-mode detection, so there is no safe product fix. A statable file *is* present by every available signal. This is test fragility: the tests assume the OS makes an unlinked file stat-invisible within the ~2.7s budget, which Windows does not guarantee.

Fix mirrors the repo's established Windows-flake handling (recent `test: fix flaky Windows https-proxy before-hook timeout`; `describe('command')` already uses `this.timeout(10000)`):

- Both reverse "not available later" file tests (callback + promise twins) get `this.timeout(15000)` — the happy path is ~500ms, so this only adds slack for the delete-pending window.
- `this.retries(2)` re-runs the `it` with fresh temp files if a transient scanner hit lingers past the timeout, cutting per-run flake probability to ~p³.

No lib changes, no new deps, CommonJS unchanged. Reproduction is the CI matrix itself (delete-pending is not deterministically reproducible on darwin).

## Verification

- `npm test` locally (lint + types + mocha), green.
- Fork PR #2 (`refactor/axios-to-fetch`) CI green on windows-latest Node 22/24/26, Windows jobs re-run ≥2x for stability; run IDs reported.
