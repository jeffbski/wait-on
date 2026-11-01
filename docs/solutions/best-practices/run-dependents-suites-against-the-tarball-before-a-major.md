---
title: Run top dependents' own suites against the packed tarball before a major
date: 2026-10-05
category: best-practices
module: release
problem_type: best_practice
component: testing_framework
severity: high
applies_when:
  - "Cutting a release candidate for a major version"
  - "Swapping a transport or runtime dependency (axios -> fetch, a new engine)"
symptoms:
  - "A regression the repo's own suite cannot see because no test uses the triggering input"
tags: [dependents, release, start-server-and-test, tarball, regression]
---

# Run top dependents' own suites against the packed tarball before a major

## Context

10.0.0-rc.1 shipped with the Fetch bad-port regression (#260): http waits on :6000 never
succeed. wait-on's own suite was green, because every test server listened on an ephemeral
port or a hand-picked one like 3000, and none is on the Fetch bad-port list. The bug was found
on the Rust-engine spike fork by running start-server-and-test's own suite (2.4M weekly
downloads) against a packed local tarball. start-server-and-test's own `demo-multiple` script (defined in its package.json, not wait-on's)
waits on ports 6000 and 6010. It passes against wait-on 9.1.0 and fails against the 10.x tarball.

## Guidance

Before a major (and on any transport swap), run the most-downloaded dependents' **own** test
suites against `npm pack` output, three ways: their pinned published wait-on (baseline), then
the tarball. A command that fails only on the tarball is a regression; one that fails on the
baseline too is pre-existing. Dependents exercise inputs the maintainers never chose (fixed
ports, odd URLs, real redirect chains), which is exactly what a parity test suite misses.

Practical notes from doing it:

- Install the tarball with `npm install --no-save <tgz>`; the dependent's exact pin then makes
  `npm ls wait-on` exit non-zero, so parse its JSON instead of trusting the exit code.
- Set `npm_config_ignore_scripts=true`: start-server-and-test's own `pretest` script (in its
  package.json, not wait-on's) runs `prettier --write`.
- Few big tools depend on wait-on directly (nx, cypress, playwright, storybook do not), so
  the list is short: start-server-and-test and jest-dev-server.

The spike branch automates this as `cargo xtask dependents` (kevinold/wait-on).
