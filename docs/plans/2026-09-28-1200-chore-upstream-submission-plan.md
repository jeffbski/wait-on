---
title: Upstream Submission of Spine Lanes - Plan
type: chore
date: 2026-09-28
topic: upstream-submission
origin: docs/plans/2026-09-26-1056-feat-backlog-spine-release-trains-plan.md
spine: kevinold/wait-on#4
---

# Upstream Submission of Spine Lanes - Plan

## Goal

Get the fork's stacked lanes (kevinold/wait-on#4) merged into jeffbski/wait-on as reviewable PRs, one release train at a time, starting with lane 1 (fork PR #19).

## Constraints

- GitHub cannot move an existing PR to another base repository. Each lane needs a new PR opened in jeffbski/wait-on with `--head kevinold:<branch>`.
- Upstream PRs can only target branches that exist upstream. The fork's lane-branch bases don't exist there, so every upstream PR targets `master`.
- Upstream merges with merge commits (for example #220, #210, #209), so a later PR's diff shrinks as its predecessors merge. If a PR is squash-merged instead, the next upstream branches are restacked with `--onto`.
- Upstream `master` is 30ec141 (9.1.0), the same base the fork stack was built on.

## Decisions

- D1. **One train at a time.** (user-directed; chosen over one lane at a time, all 14 at once, and asking for upstream lane branches.) Open only the current train's PRs. Each is based on `master` and states "Depends on #N". The next train opens after the current one is merged and released.
- D2. **Upstream PRs carry the CE plan docs.** (user-directed, 2026-09-28; this reverses an earlier choice to strip them.) Upstream PRs use the fork lane branches directly as `--head kevinold:<lane-branch>`, so each PR includes its lane plan, and lane 1 also includes the spine plan. Upstream PRs and fork PRs share commits. Lane 1's PR (#226) was opened from `up/ci/engine-strict-stack-trigger` and reset to the lane-1 head; later lanes need no `up/` branch.
- D3. **The fork lane is the upstream PR's head.** Review fixes land on the fork lane and restack the later lanes with `--onto`. The upstream PRs update automatically. For lane 1, also move `up/ci/engine-strict-stack-trigger` to the new lane-1 head. The fork PR closes when its upstream PR merges, not when it opens.
- D4. **Upstream-facing PR bodies.** Rewrite each body for the maintainer: what changed and why, how it was tested, `Closes #N` for the upstream issues (real keywords are correct upstream), "Depends on #N" for the predecessor, and credit for contributors. No fork process vocabulary (lane, spine, KTD, train IDs).

## Status (2026-09-28)

Every lane is open upstream, with `[Lx]` title prefixes and one "Depends on" chain. By user direction, all trains were opened at once instead of one at a time (D1 superseded):

- 9.1.1: #226 → #227 → #228 → #229 → #230 → #231
- 9.2.0: #233 → #234 → #235 → #236 → #237
- 10.0.0: #238 → #239 → #240
- Harness (independent): #232

Merge in chain order. Cut 9.1.1 after #231, 9.2.0 after #237, and 10.0.0 after #240. U3 and U4 below are done. U5 still applies.

## Units

### U1. (Retired) Upstream branch builder

Not needed after the D2 reversal: upstream PRs use the fork lane branches directly.

### U2. Upstream PR for lane 1 (fork #19)

1. (Done: jeffbski/wait-on#226.) Open a PR in jeffbski/wait-on with base `master`, head `kevinold:up/ci/engine-strict-stack-trigger` (reset to the lane-1 head, including its plans), and a D4 body. It closes #186 and references #225.
3. Expect the first-time-contributor "Approve and run" gate on Actions. That gate is not a failure.
4. Post the upstream PR link on fork PR #19 and on spine #4.

### U3. Rest of train 9.1.1 (fork #21 to #25)

Same as U2, one PR per lane in stack order. Each body says "Depends on #<previous upstream PR>". The upstream PRs for #22 (Windows pipes) and #26 (parseArgs) close upstream #223 and #218 as superseded and credit their authors. Their original commits keep the contributor as author.

### U4. Later trains

After 9.1.1 merges and is released:
1. If upstream merged with merge commits, open the 9.2.0 lane branches as they are. If it squashed, restack them `--onto origin/master` first.
2. Open them (U3 shape).
3. Repeat for 10.0.0. Its L12 picks up jeffbski/wait-on#225: pin the 22.19.0 matrix row before opening.

### U5. Closing the loop

When an upstream PR merges:
1. Close the fork PR with a link to it.
2. Post `state: merged-upstream` on the lane's sub-issue.
3. Once the train is released, post the triage-ledger closes for that train's upstream issues (plan Appendix).

## Risks

| Risk | Mitigation |
|---|---|
| A PR is squash-merged, so later PRs repeat commits | Restack the later lane branches with `--onto origin/master` |
| The maintainer asks for changes | D3: fix the fork lane, restack the later lanes, force-push with lease |
| No response | The origin plan's rule: after 14 days of silence, offer the whole train as a single PR |
