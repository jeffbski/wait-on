# Releasing wait-on

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/). Every push to
`master` runs `.github/workflows/release.yml`. The run validates (lint and test), previews the next
version, then waits for a human to approve the publish. semantic-release derives the version and
release notes from [Conventional Commit](https://www.conventionalcommits.org/) messages:

| Commit type | Release |
|---|---|
| `fix:` | patch (9.1.0 → 9.1.1) |
| `feat:` | minor (9.1.0 → 9.2.0) |
| `!` after the type, or a `BREAKING CHANGE:` footer | major (9.x → 10.0.0) |
| `ci:`, `docs:`, `chore:`, `refactor:`, `test:`, merge commits | no release on their own |

## Setup runbook (one time, maintainer)

Do steps 1–4 **before** merging the PR that adds this file. Each step is in a GitHub or npmjs
settings page. Nothing in the repo changes.

### 1. Create the `release` environment (the approval gate)

GitHub creates a missing environment automatically, and **without protection rules**. So create it
first. Otherwise the first release would publish without asking.

1. **Settings → Environments → New environment**, name it exactly `release`, then **Configure environment**.
2. Check **Required reviewers** and add yourself (`jeffbski`), plus any co-maintainer.
3. Leave **Prevent self-review** unchecked. If it's checked, a solo maintainer can't approve their own merge.
4. **Deployment branches and tags → Selected branches and tags → Add rule → `master`.**
   Only `master` can reach the publish job.
5. Leave **Wait timer** at 0. **Save protection rules.**

Check it worked: **Settings → Environments** lists `release` with "1 protection rule" (or 2 with the branch rule).

### 2. Register the npm trusted publisher (no token needed)

Publishing uses npm OIDC trusted publishing with provenance. No `NPM_TOKEN` is stored anywhere.

1. Sign in at [npmjs.com](https://www.npmjs.com/) as a `wait-on` owner.
2. Open [the package settings](https://www.npmjs.com/package/wait-on/access) (**Settings** tab) →
   **Trusted Publisher → GitHub Actions**.
3. Enter these values exactly. They are case-sensitive and must match the workflow:
   - **Organization or user:** `jeffbski`
   - **Repository:** `wait-on`
   - **Workflow filename:** `release.yml` (the file name only, not the path)
   - **Environment name:** `release`
4. Save.

Leave the old publish token alone for now. Step 8 locks tokens out after the first OIDC release works.

### 3. Check the Actions settings

1. **Settings → Actions → General → Actions permissions.** If it's limited to an allow list, add
   `actions/checkout`, `actions/setup-node`, and `amannn/action-semantic-pull-request`.
   "Allow all actions" needs no change.
2. **Workflow permissions:** "Read repository contents" is fine. Each job asks for exactly the
   permissions it needs.
3. **Branch protection / rulesets on `master`:** none today, which is what the version commit-back
   needs. If you add protection later, see [If `master` gets branch protection](#if-master-gets-branch-protection-later).

### 4. Check the merge settings

1. **Settings → General → Pull Requests.** Keep **Allow merge commits** on. The PR's own commits then
   drive the version, and commitlint checks each of them.
2. If you also allow **squash merging**, set **Default commit message → Pull request title**. The PR
   Title check makes sure that title is a valid Conventional Commit.

### 5. Merge the PR and watch the first run

1. Merge the PR. A **Release** run starts on `master`.
2. `validate` should pass. The `preview` job summary should say **"No release due"**, because the PR
   only has `ci:`/`docs:` commits.
3. The `release` job then shows **Waiting for review**. **Reject** it: there's nothing to publish.
   Approving is harmless too, since semantic-release exits with no release.
4. On the next PR, the **PR Title** check appears. It runs from `master`'s copy of the workflow, so it
   can't show up before this merges.

### 6. Cut the first real release (for example 9.1.1)

1. Merge the PRs that belong in the release in order (for the current queue: #226 → #231).
   Each merge queues a Release run. A newer run replaces the older pending one, so only the latest waits.
2. When the last PR for the release is in, open that run and read the **preview** summary. It should
   say **Next release: v9.1.1** and list the fixes.
3. **Review deployments → `release` → Approve and deploy.**
4. Check the result:
   - `npm view wait-on version` prints `9.1.1`.
   - The npm package page shows a **Provenance** badge linked to this run.
   - **Releases** has `v9.1.1` with generated notes, and the tag `v9.1.1` exists.
   - `master` has a new commit `chore(release): 9.1.1 [skip ci]` that bumps `package.json` and
     `package-lock.json`. `[skip ci]` keeps it from starting another run.
   - Released PRs and issues get a "released in v9.1.1" comment.

Repeat for 9.2.0 (after #237) and 10.0.0 (after #240). To hold back a pending run you don't want
published yet, **Reject** it. The commits stay on `master` and go out with the next approved run.

### 7. Remove the in-flight commitlint exceptions

`commitlint.config.js` ignores three older contributor commit subjects so their open PRs (#228, #233,
#235) stay green. Once those PRs merge, delete the `ignores` entry and its comment.

### 8. Lock down npm tokens (after the first OIDC release works)

npmjs.com → `wait-on` → **Settings → Publishing access → Require two-factor authentication and
disallow tokens**. Then revoke any old automation or publish tokens, and remove any old
`NPM_TOKEN` repo secret. From then on, only the approved `release` job can publish.

## Day-to-day: approving a release

1. A push to `master` starts a **Release** run. The `validate` and `preview` jobs run first.
   Read the **preview** job summary: it shows the next version and the release notes.
2. The `release` job waits at the **`release`** environment.
3. **Review deployments → Approve and deploy.** The job publishes to npm, creates the GitHub
   release, and commits the version bump back to `master`.

Runs are serialized (`concurrency`, `cancel-in-progress: false`), so a running release is never
interrupted. Approving the latest pending run releases everything up to that commit.

## Going fully autonomous (no code change)

The gate is the environment's required reviewers.

- **Settings → Environments → `release` → Required reviewers**: uncheck it, then **Save protection rules**.

With no reviewers, every push to `master` that contains a `fix:`/`feat:`/breaking commit releases
automatically. Check the box again to turn the gate back on. Keep the `master` deployment-branch
rule either way.

## Troubleshooting

| Symptom in the `release` job | Cause | Fix |
|---|---|---|
| `ENEEDAUTH` / `Invalid npm token` / OIDC exchange failed | The trusted publisher fields don't match | Recheck step 2. The workflow filename is `release.yml` and the environment is `release`, both exact |
| Provenance or repository mismatch | `repository.url` changed | Keep `git+https://github.com/jeffbski/wait-on.git` in `package.json` |
| `EGITNOPERMISSION` / push rejected | Branch protection blocks the Actions bot | See the next section |
| Preview says "No release due" but you expected one | No `fix:`/`feat:`/breaking commit since the last tag | Expected behavior. Non-conventional or `chore:`/`docs:` commits don't release |
| Job never asks for approval | The `release` environment has no required reviewers | Step 1 |
| Run stuck "Waiting" for weeks | Pending deployments expire after 30 days | Approve or reject. The next push queues a fresh run |

## Rolling back a bad publish

Deprecate the version instead of unpublishing it:

```bash
npm deprecate wait-on@<bad-version> "Broken release, use <good-version> instead"
```

Then land a `fix:` and let the next release supersede it. **Don't `npm unpublish`.** It's only
allowed within 72 hours, it breaks anyone who already pinned that version, and the version number
can never be reused.

## If `master` gets branch protection later

Today `master` has no branch protection, so the version commit-back uses the default `GITHUB_TOKEN`.
If protected-branch rules are added and they block that push, switch the commit-back auth to a
deploy key or a GitHub App token:

- **Deploy key:** add an SSH deploy key with write access, store the private key as a secret in the
  `release` environment, and have the `release` job's checkout use it (`actions/checkout` with
  `ssh-key:`). semantic-release then pushes over SSH.
- **GitHub App token:** mint a short-lived installation token in the job and pass it as the checkout
  token and `GITHUB_TOKEN` for semantic-release.

That identity must be allowed to bypass the branch protection for the release commit.
