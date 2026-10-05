---
title: Consumer contract runner never exits against wait-on 9.5.1
date: 2026-10-05
category: test-failures
module: consumer contract (features/)
problem_type: test_failure
component: testing_framework
symptoms:
  - "npm run contract:9 fails a scenario with cucumber's 30 s step timeout although 9.5.1 settled in about 1 s"
  - "The same scenario passes on 10.x"
root_cause: async_timing
resolution_type: test_fix
severity: medium
retire_when: "the release gate no longer runs against a version that leaves sockets open after settling (9.5.1 dropped from npm run contract:9)"
tags: [consumer-contract, release-gate, baseline, child-process, beforeExit, callback]
---

# Consumer contract runner never exits against wait-on 9.5.1

## Problem

The cjs fixture runner (`features/fixtures/cjs/run.js`) printed its JSON result only on
`beforeExit`. Against wait-on 9.5.1 the runner child never exited, so a scenario hung until
cucumber's 30 s step timeout. A 9.5.1 run is the release gate's baseline, so a hang there
reads as "red on 9.5.1" and invites a wrong `@since:10` tag.

## Symptoms

- On the first whole-suite 9.5.1 run (127 scenarios), 6 failed. Two of them were these
  hangs, not verdicts: "without httpTimeout a check that gets no answer keeps a reverse wait
  waiting" and the pinned "HTTPS_PROXY tunnels an https check without the TLS options".
- Run directly, 9.5.1 rejected the first one at about 1006 ms with the expected text; only
  the runner never reported.

## What Didn't Work

- Reading the two failures as 10.x-only behavior. Both scenarios pass on 9.5.1 once the
  runner exits, so tagging them `@since:10` would have hidden real 9.5.1-compatible
  behavior from the gate.
- A fixed 500 ms forced exit after settling for every call form. It fixed the hang, but
  code review (correctness and adversarial, confirmed by the validator) showed it hides a
  late second callback. Reproduced with a fake `wait-on` that calls back at 10 ms and again
  at 1500 ms: with `timeout: 2000` the runner reported `cbCalls: 1`, so "the callback was
  called once" passed for a package that called back twice.

## Solution

Report once, from whichever comes first: `beforeExit`, or an unref'd timer armed when the
wait settles that reports and calls `process.exit()`. In callback form the timer waits out
the wait's own timeout first, so a timeout-driven second callback is still counted:

```js
const grace = callback ? Math.min(Math.max(500, (opts.timeout || 0) - result.elapsedMs + 250), 2 ** 31 - 1) : 500;
setTimeout(() => {
  report();
  process.exit();
}, grace).unref();
```

The `2 ** 31 - 1` cap matters: Node fires a longer delay after 1 ms, which would
reintroduce the early exit for a scenario with a huge timeout.

## Why This Works

9.5.1 checks http with axios, and an unanswered request leaves a socket open after `waitOn`
settles, so the event loop never empties and `beforeExit` never fires. 10.x (undici) closes
it, so the same runner exits on its own there. The unref'd timer adds no handle of its own:
on 10.x the process exits before it fires, and on 9.5.1 the open socket keeps the loop alive
long enough for it to fire. Waiting past `opts.timeout` in callback form keeps the "called
once" assertion meaningful, because a regression that calls back again on timeout does so
before the timer fires.

## Prevention

- Treat a 9.5.1 failure that is a step or hook timeout as a harness defect until a direct
  run of the fixture proves otherwise. Only a reproduced, non-timing failure earns
  `@since:10` (the gate rule in `AGENTS.md`, Consumer contract).
- Any fixture runner that forces an exit must not exit before the latest moment the
  behavior under test could still change the result.
- The esm and ts runners keep the `beforeExit`-only shape; they only wait on files, which
  leave no socket open. Give them the same timer before pointing a network scenario at
  them.

## Related Issues

- jeffbski/wait-on#263 (consumer contract and 9.5.1 gate); plan
  `docs/plans/2026-10-05-feat-gherkin-consumer-contract-v10-plan.md`.
