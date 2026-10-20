---
title: Running the dependents check - proxy asymmetry, npm release-age gates, shell-free npm, and the puppeteer row
date: 2026-10-05
category: best-practices
module: scripts/dependents.js
problem_type: best_practice
component: testing_framework
severity: medium
applies_when:
  - "Running npm run dependents before an rc or GA release"
  - "Adding a proxy variable, a control version, or a manifest entry to the dependents check"
  - "Porting the check to another runtime or CI host"
related_components: [test/dependents/dependents.json, .github/RELEASING.md]
tags: [dependents, npm, proxy, all-proxy, min-release-age, release-check, puppeteer, jest-dev-server]
---

# Running the dependents check - proxy asymmetry, npm release-age gates, shell-free npm, and the puppeteer row

## Context

`npm run dependents` (jeffbski/wait-on#264) runs published dependents' own commands
twice: on the wait-on version they pin (baseline), then on the packed tarball. A row that
fails on the tarball but passed on baseline is a `regression` and exits 1. A row that fails
on both is `pre-existing` and exits 0. So anything that fails the baseline for an
environment reason can hide a real tarball regression. The first recorded run, and the
review of it, turned up two environment traps the code alone does not explain.

## Guidance

- **Scrub every proxy source either side honors, not only `HTTP(S)_PROXY` and `NO_PROXY`.**
  The baseline and the tarball do not read the same proxy variables. start-server-and-test
  v3.0.12 pins wait-on 9.1.0, which probes with axios, and axios resolves proxies through
  proxy-from-env, which also honors `ALL_PROXY` and the `npm_config_*proxy` variables that
  `npm run` exports. The demos' `curl` honors `ALL_PROXY` too. The 10.x tarball probes
  through undici's `EnvHttpProxyAgent`, which reads only `HTTP(S)_PROXY` and `NO_PROXY`. With
  one of the extra variables set, the baseline can fail through the proxy while the tarball
  goes direct. If the tarball also regresses that command, the row reads `pre-existing` and
  the run exits 0. The run environment drops all of them (`PROXIES` in
  `scripts/dependents.js`). The #263 consumer-contract review reached the same rule for its
  9.5.1 control (session history). An npm that re-reads a proxy from `.npmrc` inside the
  dependent's own `npm run` can still set it again, which the scrub cannot prevent.
- **The 9.5.1 control needs the control version to be older than npm's release-age gate.**
  With `min-release-age=7` in `~/.npmrc`, `npm install --no-save --ignore-scripts wait-on@9.5.1` failed with
  `ETARGET No matching version found for wait-on@9.5.1 with a date before ...`, because
  9.5.1 was published on 2026-09-29. `npm config get` did not show the setting; reading
  `~/.npmrc` did. A failed swap is a harness failure, so it aborts the entry before the
  verdict table prints, and the baseline and tarball results are lost too. Run without
  `--control` until the control version clears the window. Do not override the gate from
  the script: it is the maintainer's supply-chain setting.
- **Spawn npm as `node <npm_execpath> ...`, never `npm` or `shell: true`.** `npm` is a
  `.cmd` shim on Windows, and a shell brings back quoting. `npm run` sets `npm_execpath`. The
  script refuses to start without it, so run it through `npm run dependents`
  (`main` in `scripts/dependents.js`).
- **Judge `npm ls` by its parsed versions only.** After `npm install --no-save <tgz>` breaks
  the dependent's exact pin, `npm ls wait-on --all --json` exits 1 (`ELSPROBLEMS`), so its
  exit code means nothing here (`lsVerdict` in `scripts/dependents.js`).
- **Set `npm_config_ignore_scripts=true` for the dependent's commands**
  (`runEnv` in `scripts/dependents.js`). start-server-and-test's `demo3` runs `npm run test`, whose
  `pretest` runs `prettier --write` on the clone. Explicit `npm run <script>` still runs with
  the flag set; only pre and post hooks are skipped.
- **The run needs `git` and `curl`.** `demo-multiple`, the #260 bad-port control, ends in
  `curl`. On a host without `curl` it fails on both sides and reads `pre-existing`, so the
  run cannot judge the regression it was built to catch.
- **jest-dev-server has no tests of its own; run the suites that call it.**
  `packages/jest-dev-server` in argos-ci/jest-puppeteer v11.0.0 reports "No tests found".
  The suites that exercise wait-on are `jest-environment-puppeteer` and `expect-puppeteer`:
  their global setup starts the repo's test server through jest-dev-server, which calls
  `waitOn({ resources: ['tcp:0.0.0.0:4444'], timeout })` and spots a timeout by the message
  prefix `Timed out waiting for`. The row runs
  `npm test -- packages/jest-environment-puppeteer packages/expect-puppeteer`, through npm so
  `node_modules/.bin` (cross-env) is on `PATH`.
- **Download Chrome with a newer puppeteer CLI, not the pinned puppeteer's installer.**
  jest-puppeteer v11.0.0 locks puppeteer 23, whose installer unzips Chrome only partly on
  Node 24 and 26 and still exits 0: a fresh `~/.cache/puppeteer/chrome/<platform>-<v>` held
  192KB on macOS (Node 26.3) instead of about 300MB, and no `chrome` executable in a
  `node:24-bookworm` container. The same installer works on Node 22. The suites then fail in
  global setup with `Could not find Chrome (ver. 131.0.6778.204)`, on baseline and tarball
  alike, so the row reads `pre-existing`. A warm cache hides all of this, which is why the
  first macOS runs passed. The entry's first build step runs
  `npm exec --yes --ignore-scripts --package=puppeteer@25.15.0 -- puppeteer browsers install chrome@131.0.6778.204`:
  puppeteer 25's CLI extracts correctly, writes the cache path puppeteer 23 reads, and
  `--ignore-scripts` skips its own postinstall (a second, unused Chrome). Keep the build id in
  step with the tag's locked puppeteer.
- **Install with scripts off.** Whether `npm ci` runs puppeteer's postinstall depends on the
  npm version: npm 11.16 gates it behind `allow-scripts`, npm 11.13 runs it. When it runs, it
  leaves the half-extracted folder above, and a later install fails with `The browser folder ...
  exists but the executable ... is missing`. The entry sets `scripts: false`.
- **The overrides swap needs a recent npm.** npm 11.13 answers `npm pkg set
  overrides.wait-on=file:<tgz>` plus `npm install` with "up to date" and leaves the workspace
  package's wait-on at 8.0.1; npm 11.16 and 11.19 apply the override. The `npm ls` guard
  catches it (`swap incomplete, expected 9.5.1: jest-dev-server > wait-on@8.0.1`) and aborts
  the entry, so upgrade npm rather than reading the row.
- **Chrome for Testing ships no linux-arm64 build.** In an arm64 Linux container (OrbStack or
  Docker Desktop on Apple silicon) the download "succeeds" into `linux_arm-<v>` but holds the
  x86-64 binary (ELF machine `0x3e`). Run the container with `--platform linux/amd64` so the
  whole stack matches the browser; the recorded Linux runs used that. The `node:24-bookworm`
  image also lacks Chrome's shared libraries (`libnss3`, `libgbm1`, `libgtk-3-0` and
  friends), and Chrome runs there as the image's `node` user; ubuntu CI runners have them.
- **The puppeteer row is noisier than the anchor, which is why it stays optional.** A cold
  Chrome can miss the suites' 5000ms test timeout or 500ms element waits, and an earlier research
  run saw the server miss its 4000ms `launchTimeout` on a first, cold run. Those failures are in Puppeteer, not
  wait-on; one hit the baseline of a macOS run (`FAIL` baseline, `pass` tarball, `ok`). The
  same flake on the tarball side reads `regression`, so rerun the row before believing one.

## Why This Matters

The check exists to catch regressions no repo test sees, such as #260 (Fetch refuses ports
6000 and 6010). Each trap above turns that signal into a quiet exit 0 or an aborted run.
The code carries the scrub list and the guards, but not why `ALL_PROXY` belongs on the list,
or why a control install can fail on one maintainer's machine and not another's.

## When to Apply

- Before each rc or GA approval (`.github/RELEASING.md`, Dependents check).
- When a run shows `pre-existing` rows that fail on a probe of localhost: check the proxy
  variables in the shell first.
- When `--control` fails with `ETARGET` and a "date before" message: check `~/.npmrc` for
  `min-release-age` or `before`.
- When adding a dependent whose pinned wait-on uses a different HTTP client from the tarball.

## Examples

A control run blocked by the release-age gate (the swap fails before the table):

```text
npm error notarget No matching version found for wait-on@9.5.1 with a date before 9/28/2026
start-server-and-test: npm install --no-save --ignore-scripts wait-on@9.5.1 failed (kept /tmp/...)
```

The same check without `--control` prints the table and exits on the verdict:

```sh
npm pack --pack-destination /tmp/pack
npm run dependents -- --tgz /tmp/pack/wait-on-10.0.0-rc.1.tgz
```

## Related

- `.github/RELEASING.md` (Dependents check): when and how to run it.
- `test/dependents/dependents.json`: the manifest of dependents and their commands.
- The Rust spike's `cargo xtask dependents` has a sibling learning on the `spike-next-rs`
  branch (`docs/solutions/best-practices/dependents-harness-npm-and-candidate-list.md`), not
  present on `next`.
