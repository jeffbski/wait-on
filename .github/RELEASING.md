# Releasing wait-on

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/). Every push to
`master` runs `.github/workflows/release.yml`: it validates (lint + test), previews the next version,
then waits for a human to approve the publish. semantic-release derives the version and release notes
from [Conventional Commit](https://www.conventionalcommits.org/) messages.

## How to approve a release

1. A push to `master` starts a **Release** workflow run. The `validate` and `preview` jobs run first.
   Open the run and read the **preview** job summary — it shows the next version and the release notes.
2. The `release` job is held at the **`release`** environment, waiting for a reviewer.
3. Go to the run (or **Settings → Environments → `release`**) and click **Review deployments →
   Approve and deploy**. The `release` job then publishes to npm, creates the GitHub release, and
   commits the version bump back to `master`.

Runs are serialized (`concurrency`, `cancel-in-progress: false`), so nothing is dropped. If several
pushes queue up, approving the latest releases everything up to that commit.

## How to go fully autonomous (no code change)

The gate is just the environment's required reviewers.

- **Settings → Environments → `release` → Deployment protection rules** → remove **Required reviewers**
  (uncheck it / clear the list).

With no reviewers, every push to `master` releases automatically. Re-add reviewers to turn the gate
back on. This is the only lever — no workflow edit required.

## One-time npm trusted-publisher setup (maintainer)

Publishing uses npm **OIDC trusted publishing** with provenance — there is **no `NPM_TOKEN`**. Set it
up once on npm:

1. Sign in to [npmjs.com](https://www.npmjs.com/) as a maintainer of `wait-on`.
2. Package **Settings → Trusted Publisher → GitHub Actions**, and add:
   - **Repository:** `jeffbski/wait-on`
   - **Workflow filename:** `release.yml`
   - **Environment:** `release`
3. Save. The next approved `release` job mints a short-lived token via OIDC and publishes with
   provenance. No secret is stored in GitHub.

`package.json` `repository.url` is normalized to `git+https://github.com/jeffbski/wait-on.git` so the
provenance statement matches the repository.

## Rolling back a bad publish

Prefer **deprecate**, not unpublish:

```bash
npm deprecate wait-on@<bad-version> "Broken release — use <good-version> instead"
```

Then land a fix and let the next release supersede it. **Do not `npm unpublish`:** it is only allowed
within 72 hours, it breaks anyone who already pinned that version, and the version number can never be
reused. Deprecation keeps installs working while steering everyone off the bad version.

## If `master` gets branch protection later

Today `master` has no branch protection, so the version commit-back uses the default `GITHUB_TOKEN`
(KTD3). If protected-branch rules are added and block that push, switch the commit-back auth to a
deploy key or a GitHub App token:

- **Deploy key:** add an SSH deploy key with write access, store the private key as a secret, and have
  the `release` job's checkout use it (`actions/checkout` with `ssh-key:`). semantic-release then
  pushes over SSH.
- **GitHub App token:** mint a short-lived installation token in the job and pass it as the checkout
  token / `GITHUB_TOKEN` for semantic-release.

Either identity must be allowed to bypass the branch protection for the release commit.
