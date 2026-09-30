# Releasing wait-on

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/). Every push to
a release branch (`master`, `next`, or a maintenance branch such as `9.x`) runs
`.github/workflows/release.yml`. The run validates (lint and test), previews the next version, then
waits for a human to approve the publish. semantic-release derives the version and release notes
from [Conventional Commit](https://www.conventionalcommits.org/) messages, and the branch picks the
npm dist-tag (see [Release channels](#release-channels)). There is no local publish path.

| Commit | on `next` (before 10.0.0) | on `master` before 10.0.0 | on `master` after 10.0.0 | on `9.x` |
|---|---|---|---|---|
| `fix:` | `10.0.0-rc.N+1` | 9.5.x patch | 10.0.x patch | 9.5.x patch |
| `feat:` | `10.0.0-rc.N+1` | 9.x minor | 10.x minor | 9.x minor |
| `!` after the type, or a `BREAKING CHANGE:` footer | `10.0.0-rc.N+1` | **avoid**: ships 10.0.0 to `latest`, skipping the rc | 11.0.0 (route it through `next`) | run fails (`EINVALIDNEXTVERSION`) |
| `ci:`, `docs:`, `chore:`, `refactor:`, `test:`, merge commits | no release on their own | none | none | none |

## Setup runbook (one time, maintainer)

Do steps 1–4 **before** merging the PR that adds this file. Each step is in a GitHub or npmjs
settings page. Nothing in the repo changes.

### 1. Create the `release` environment (the approval gate)

GitHub creates a missing environment automatically, and **without protection rules**. So create it
first. Otherwise the first release would publish without asking.

1. **Settings → Environments → New environment**, name it exactly `release`, then **Configure environment**.
2. Check **Required reviewers** and add yourself (`jeffbski`), plus any co-maintainer.
3. Leave **Prevent self-review** unchecked. If it's checked, a solo maintainer can't approve their own merge.
4. **Deployment branches and tags → Selected branches and tags → Add rule** three times: `master`,
   `next`, and `*.x`. Only release branches can reach the publish job. Without the `next` and `*.x`
   rules the publish job is rejected on those branches.
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

Repeat for 9.2.0 (after #237). 10.0.0 ships as a release candidate first: see
[Release channels](#release-channels). To hold back a pending run you don't want
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

Runs are serialized per branch (`concurrency`, `cancel-in-progress: false`), so a running release is
never interrupted, and a `next` release never blocks a `master` one. Approving the latest pending run
releases everything up to that commit.

## Release channels

Each release branch publishes to its own npm dist-tag:

| Branch | Versions | npm dist-tag | Install |
|---|---|---|---|
| `master` | `9.x`, then `10.x` after promotion | `latest` | `npm i wait-on` |
| `next` | `10.0.0-rc.N` prereleases (GitHub release marked prerelease) | `next` | `npm i wait-on@next` |
| `9.x` (maintenance, created after 10.0.0) | `9.5.x` patches, `9.x` minors | `release-9.x` | `npm i wait-on@^9` |

Each branch runs the `release.yml` and `.releaserc.json` in its own commits. Before approving the
first run on a new `next` or `*.x` branch, check that its copies match `master`'s.

### Ship a release candidate on `next`

1. Create `next` from `master`: `git push origin origin/master:refs/heads/next`.
2. Retarget the PR to `next` (`gh pr edit <n> --base next`) and merge it with a **merge commit**.
3. Approve the **Release** run on `next`. The preview reads `Next release: v10.0.0-rc.1`. It
   publishes to dist-tag `next`, which replaces the stale `5.1.0-rc.1`.
4. Ask users to try `npm i wait-on@next`. Each `fix:`/`feat:` merged to `next` publishes the next
   rc (`rc.2`, `rc.3`, ...).
5. Keep `next` current: after each `master` release, merge `master` into `next`. Expect a
   `package.json`/`package-lock.json` conflict; resolve it as described in
   [Version-file conflicts](#version-file-conflicts).

### Promote the release candidate to 10.0.0

Promote on judgment once at least one user confirms `wait-on@next` works for them. Each new rc
needs a fresh confirmation. There is no fixed soak period.

1. Open a PR from `next` to `master` and merge it with a **merge commit**. **Never squash it**: a
   squash body collects the rc `chore(release): ... [skip ci]` subjects and suppresses the run.
2. Resolve the version-file conflict as described in
   [Version-file conflicts](#version-file-conflicts).
3. Approve the **Release** run on `master`. It publishes a fresh `10.0.0` to `latest`.
4. Merge `master` back into `next` (for the next rc cycle), or delete `next` until it's needed.
5. The `next` dist-tag stays on the last rc until the next rc publishes. Leave it: the maintainer
   can move it with `npm dist-tag add wait-on@10.0.0 next` if needed.

### Ship a 9.x fix after 10.0.0

1. Only after `10.0.0` is on `latest`, create `9.x` from the **latest published** 9 tag (not
   necessarily `v9.5.1`: 9.x releases may have shipped from `master` during the rc):
   `TAG=$(git tag -l 'v9.*' --sort=-v:refname | head -1)` then
   `git push origin "$TAG^{commit}:refs/heads/9.x"`. A `9.x` created before 10.0.0 can't release
   anything, and one cut from an older tag computes a version that is already published.
2. Cherry-pick this repo's release-channels `ci:` commit onto `9.x` first (`git cherry-pick -x`),
   so the branch has the new triggers and branch config. It releases nothing on its own.
3. Open a PR against `9.x` with the fix cherry-picked (`git cherry-pick -x`), keeping its `fix:`
   subject. Fix `master` separately if it needs the same change.
4. Approve the **Release** run on `9.x`. It publishes the next patch after that tag (for example
   `9.5.2`) to dist-tag `release-9.x`. `latest`
   stays on 10.x, and users on `^9` get the fix through normal semver resolution.

Use `9.x` (patch and minor), not `9.5.x` (patch only), unless a 9.x minor must be ruled out.

### Version-file conflicts

semantic-release commits the version to `package.json` and `package-lock.json` on every release
branch, so merges between `master` and `next` conflict on them. Resolve by keeping `next`'s
dependencies (the 10.x runtime set) plus any dependency change `master` made, take either side's
`version`, and regenerate the lockfile with `npm install`. semantic-release rewrites `version` on the
next release. Let CI on the merge PR prove the result.

## Going fully autonomous (no code change)

The gate is the environment's required reviewers.

- **Settings → Environments → `release` → Required reviewers**: uncheck it, then **Save protection rules**.

With no reviewers, every push to a release branch that contains a `fix:`/`feat:`/breaking commit
releases automatically. Check the box again to turn the gate back on. Keep the `master`, `next`,
and `*.x` deployment-branch rules either way.

## Troubleshooting

| Symptom in the `release` job | Cause | Fix |
|---|---|---|
| `ENEEDAUTH` / `Invalid npm token` / OIDC exchange failed | The trusted publisher fields don't match | Recheck step 2. The workflow filename is `release.yml` and the environment is `release`, both exact |
| `E403 ... OIDC permission denied for this action` at `npm publish` (verify step said the OIDC exchange succeeded) | An `.npmrc` auth line (for example from `setup-node` `registry-url` with no `NPM_TOKEN`) makes npm skip OIDC | Keep `registry-url` off the release job's `setup-node`. Then [recover the half-finished release](#recovering-a-half-finished-release) |
| Re-run says "The local branch master is behind the remote one" | A failed run already pushed its `chore(release)` commit, so re-running the old run is stale | Don't re-run. [Recover the half-finished release](#recovering-a-half-finished-release) |
| Provenance or repository mismatch | `repository.url` changed | Keep `git+https://github.com/jeffbski/wait-on.git` in `package.json` |
| `EGITNOPERMISSION` / push rejected | Branch protection blocks the Actions bot | See the next section |
| Preview says "No release due" but you expected one | No `fix:`/`feat:`/breaking commit since the last tag | Expected behavior. Non-conventional or `chore:`/`docs:` commits don't release |
| Job never asks for approval | The `release` environment has no required reviewers | Step 1 |
| Run stuck "Waiting" for weeks | Pending deployments expire after 30 days | Approve or reject. The next push queues a fresh run |
| `EINVALIDNEXTVERSION` on a maintenance branch | A breaking commit on `9.x`, or `9.x` was created before 10.0.0 shipped | Move breaking changes to `next`; recreate `9.x` after 10.0.0. The preview summary can still show a version (for example `v10.0.0` on `9.x`); the error is only in the preview log and the `release` job |
| Preview log says semantic-release is "configured to only publish from" other branches | The branch is not in `.releaserc.json` `branches`, or doesn't exist on the remote | Check the branch name matches `master`, `next`, or `*.x` |
| No Release run on a `9.x` push | `9.x` was created without the release-channels `ci:` commit | Cherry-pick it (see [Ship a 9.x fix](#ship-a-9x-fix-after-1000)) |
| Promotion merge published nothing | The merge's head commit carries `[skip ci]` (squash-merged) | Push any `fix:` commit to `master`, or redo the promotion as a merge commit |
| `npm i wait-on@next` installs an old rc after 10.0.0 | The `next` dist-tag isn't moved on promotion | Expected; the next rc moves it |

## Recovering a half-finished release

semantic-release commits the version and pushes the tag **before** it publishes. If `npm publish`
then fails, `master` has a `chore(release): X.Y.Z [skip ci]` commit and a `vX.Y.Z` tag, but nothing
is on npm and there's no GitHub release. The next run sees the tag and thinks X.Y.Z already shipped.

1. Check nothing was published: `npm view wait-on version` still shows the previous version.
2. Delete **only the tag** (keep the `chore(release)` commit):
   `git push origin :refs/tags/vX.Y.Z` (and `git tag -d vX.Y.Z` locally if you fetched it).
3. Merge the fix (or any commit) to `master` and approve the new **Release** run. semantic-release
   finds the previous tag, computes X.Y.Z again, re-tags the new `HEAD`, publishes to npm, and
   creates the GitHub release. The version files already say X.Y.Z, so no second bump commit is made.

Never delete a tag whose version *is* on npm. That version is permanent; ship the next one instead.

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
