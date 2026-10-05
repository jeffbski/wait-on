# Concepts

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Consumer contract

### Consumer contract
The executable statement of what a project using wait-on can rely on, as a library or as a CLI. Each scenario feeds concrete inputs to the installed package, never the repository's own source, and states the exact outcome a consumer sees: resolve or reject, error name and message, log lines, exit code, elapsed bounds.
*Avoid:* feature tests, acceptance tests

### Fixture project
A minimal consumer project the contract installs the package into before scenarios run, one per way a consumer can load wait-on (CommonJS, ESM, TypeScript). A scenario runs against one fixture project; behavior scenarios default to the CommonJS one.

### Release gate
The comparison that decides whether a new major is safe to publish: the same Consumer contract runs against the release candidate and against the previous published release (the Baseline run). Every scenario's pair of results yields one verdict: contract holds, Regression, Intentional change, or Harness defect.

### Baseline run
The Consumer contract run against the previous published release, excluding scenarios marked as guarantees of the new major only. Green Baseline run plus green candidate run is the Release gate passing.

### Intentional change
A scenario that passes on the candidate and fails on the Baseline run, reproducibly and not merely on timing, because the new major deliberately changed or fixed that behavior. It is marked as a new-major-only guarantee and becomes a release-note entry. A scenario that pins a known open defect is never an Intentional change, even when it is excluded from the Baseline run.

### Regression
A scenario that fails on the candidate and passes on the Baseline run. It blocks the release and is never marked or excluded.

### Harness defect
A scenario failure caused by the contract's own machinery rather than by either release: red on both runs, an elapsed bound missed only on one, or a step that times out because the consumer process never reported. It is fixed in the contract before any verdict is read.
