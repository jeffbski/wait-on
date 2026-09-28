# Lane LR — semantic-release with approval gate, commitlint and PR-title lint

- **Issue:** kevinold/wait-on#33 · **Spine:** kevinold/wait-on#4
- **Branch:** `ci/semantic-release` · **Base:** `master` · **Repo:** kevinold/wait-on (fork), push to `fork` remote only
- **Status:** implementation-ready
- **Date:** 2026-09-28

## Goal

Add release automation modeled on semantic-release's own `release.yml`, with a human-in-the-loop
approval gate that flips to fully-automatic by removing the environment's required reviewers — no
code change. Plus CI-only commitlint and a Conventional-Commits PR-title check. Independent of the
release trains; goes upstream to jeffbski/wait-on once green in the fork.

Scope, decisions (KTD1–KTD12) and acceptance are **confirmed by the user** — implement against them,
do not re-scope.

## Verified pins (checked this run against source)

| Tool | Pin | How verified |
|---|---|---|
| actions/checkout | `3d3c42e5aac5ba805825da76410c181273ba90b1` # v7.0.1 | `gh api repos/actions/checkout/commits/v7.0.1` |
| actions/setup-node | `820762786026740c76f36085b0efc47a31fe5020` # v7.0.0 | `gh api repos/actions/setup-node/commits/v7.0.0` |
| amannn/action-semantic-pull-request | `48f256284bd46cdaab1048c3721360e808335d50` # v6.1.1 | `gh api .../commits/v6.1.1` |
| semantic-release (npx) | `25.0.9` | `npm view semantic-release version` |
| @semantic-release/git (npx) | `11.0.1` (engines `^22.22.2 || >=24.15`) | npm registry `/@semantic-release/git/latest` |
| @commitlint/cli + config-conventional (npx) | `21.2.3` | `npm view` |

`@semantic-release/commit-analyzer`, `release-notes-generator`, `npm` (13.2.0) and `github` ship
**bundled** with `semantic-release@25.0.9`, so they need no separate `-p` pin (mirrors the reference
workflow's bare `npx semantic-release`). `@semantic-release/git` is the only plugin not bundled.

**Node:** release, preview and validate jobs use `lts/*` (currently Node 24 LTS). Node 20 cannot run
semantic-release 25 / `@semantic-release/git` 11 / commitlint 21 — fine, these jobs are separate from
the test matrix (`node.js.yml`, 20/22/24). For npm OIDC/trusted-publishing the release job upgrades
npm on PATH (reference uses `npm install --global corepack@latest` + `corepack npm`; we use
`npm install --global npm@latest` — simpler, no `packageManager` field needed, guarantees npm
≥11.5.1 on PATH for the publish). **Recorded choice.**

## Decision: npx (KTD4), not cycjimmy/semantic-release-action

The addendum permits switching to `cycjimmy/semantic-release-action` if it makes installing
`@semantic-release/git` materially simpler. It does not: one `-p @semantic-release/git@11.0.1` on the
pinned `npx` line is trivial, adds no third-party action, and matches semantic-release's own workflow.
**Keep KTD4 (pinned npx).**

## Files (allowed paths only)

`allowed-paths: .github/workflows/**, .github/RELEASING.md, .releaserc.json, commitlint.config.*, package.json, .npmignore, docs/plans/**`

### 1. `.github/workflows/release.yml` (new) — push to `master`

- Top-level `permissions: contents: read` (KTD11), raised per job.
- `concurrency: group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: false`
  (KTD1/KTD11) — no queued release dropped.
- Jobs, chained with `needs:` so a red commit never reaches approval (KTD8):
  1. **validate** — `permissions: contents: read`. checkout + setup-node(`lts/*`, `cache: npm`) +
     `npm ci` + `npm test` (lint + mocha).
  2. **preview** — `needs: validate`, `permissions: contents: write` (core `verifyAuth` git
     push-access check runs even in dry-run — the dry-run is **not** read-only). No repo guard, so it
     runs on forks too (this is how a fork push proves the flow — KTD9). Overrides plugins to the two
     analysis plugins only so no npm OIDC / github-git write verification is needed:
     `npx -p semantic-release@25.0.9 semantic-release --dry-run --plugins @semantic-release/commit-analyzer @semantic-release/release-notes-generator`.
     Capture stdout → next version + notes into `$GITHUB_STEP_SUMMARY` and `$GITHUB_OUTPUT`
     (`no release` handled). `GITHUB_TOKEN` in env for core.
  3. **release** — `needs: preview`, `if: github.repository == 'jeffbski/wait-on' && github.event_name == 'push'`
     (KTD9: forks never publish/commit-back). `environment: release` (KTD1 gate).
     `permissions: contents: write, issues: write, pull-requests: write, id-token: write`
     (KTD10/KTD2). setup-node with `registry-url: https://registry.npmjs.org` (KTD12).
     `npm install --global npm@latest` for OIDC. env `NPM_CONFIG_PROVENANCE: 'true'` (KTD10),
     `GITHUB_TOKEN`. Run `npx -p semantic-release@25.0.9 -p @semantic-release/git@11.0.1 semantic-release`.
- Emoji step names optional (readability): ⬇️ checkout, ⎔ setup node, 📥 deps, ▶️ validate, 🚀 release.

### 2. `.github/workflows/commitlint.yml` (new) — `pull_request` to `master`

- `permissions: contents: read`. checkout `fetch-depth: 0`, setup-node `lts/*`, then
  `npx -p @commitlint/cli@21.2.3 -p @commitlint/config-conventional@21.2.3 commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose`.
- CI only, no husky (scope).

### 3. `.github/workflows/pr-title.yml` (new) — `pull_request_target`

- `types: [opened, edited, synchronize]`, `permissions: pull-requests: read` (research: amannn runs
  on `pull_request_target`; safe — reads title from event context, no PR-code checkout).
- `uses: amannn/action-semantic-pull-request@48f256284bd46cdaab1048c3721360e808335d50 # v6.1.1`,
  `env: GITHUB_TOKEN`.

### 4. `.releaserc.json` (new) — KTD5

`branches: ["master"]`, default `tagFormat` (`v${version}`, continues from `v9.1.0`), plugins
commit-analyzer, release-notes-generator, npm, github, and `@semantic-release/git` with
`assets: ["package.json","package-lock.json"]` and message
`chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}`. (The commit-back edits
package-lock.json **at release time on upstream**, not in this PR.)

### 5. `commitlint.config.js` (new) — KTD6

`extends: ['@commitlint/config-conventional']` plus an `ignores` predicate matching the three exact
non-conventional in-flight subjects, with a comment to delete once #228/#233/#235 merge:

- `improve: use Node's util.parseArgs over \`minimist\`` (d76fa26)
- `[Api]: QOL imporvement. Allow string as opts.` (dae5e74)
- `Support Windows named pipe paths in http://unix: resources and run tests on Windows` (b594acb)

### 6. `package.json` (modify) — KTD2

`repository.url`: `http://github.com/jeffbski/wait-on.git` → `git+https://github.com/jeffbski/wait-on.git`
so npm provenance matches the repo. No other change; **not** package-lock.json.

### 7. `.npmignore` (modify) — tarball hygiene

Add `.releaserc.json` and `commitlint.config.js` (root files would otherwise ship). `.github` is
already ignored. Verify with `npm pack --dry-run`.

### 8. `.github/RELEASING.md` (new)

How to approve a release (Environments → `release` → Review deployment); how to go autonomous (remove
required reviewers — the only lever, no code change); one-time npm trusted-publisher setup (repo
`jeffbski/wait-on`, workflow `release.yml`, environment `release`, no `NPM_TOKEN`); rollback
(`npm deprecate`; why not `unpublish` — 72h window + breaks consumers/immutable versions); deploy-key
/ GitHub-App-token fallback if branch protection is later added to `master` (KTD3).

### 9. `docs/plans/2026-09-28-ci-lane-LR-semantic-release-plan.md` — this file, committed in the PR.

## Verification (green bar)

- `npm test` (lint + mocha) — must stay green; no change to `lib/`, `test/`, `package-lock.json`.
- `npx --yes actionlint` — passes on all three new workflows.
- commitlint locally over this branch's own commits (`--from fork/master --to HEAD`) — passes; and
  would pass on the #228/#233/#235 heads (ignore predicate).
- `npm pack --dry-run` — new config files absent from the tarball.
- PR opened on kevinold/wait-on, base master, CI (`node.js.yml`) green.

## Out of scope

CHANGELOG.md; prerelease `next`/`beta` channels (`publish:next` untouched); rewriting existing
commits; build/pack artifact job (no build step); os/node matrix (belongs to train lanes).
