# Concepts

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## Dependents check

### Dependents check
An on-demand release check that runs published dependents' own commands against a packed wait-on tarball, to catch regressions that only show up the way the ecosystem uses wait-on.

It runs before each release candidate and general release, never in required CI, because it needs the network and the dependents bind fixed ports, so entries run one at a time. It is distinct from the consumer contract, which runs scenarios this project writes; the dependents check runs other people's suites.

### Dependent
A published package that depends on wait-on and is listed in the dependents manifest with a pinned tag, the commands to judge, and the operating systems it runs on. A dependent marked optional runs only when asked for.

### Baseline run
The pass of a dependent's commands on the wait-on version the dependent itself pins, before any swap. It is the reference each later pass is compared against.

### Tarball run
The pass of a dependent's commands after the packed wait-on under test has been swapped in and the swap proven.

### Control run
An optional third pass on wait-on 9.5.1, used to tell a 10.x change apart from a defect that already existed in 9.x. It does not change the verdict.

### Swap proof
The check, after swapping wait-on into a dependent, that every installed copy of wait-on at any depth is the expected version. It judges the installed versions only, never the package manager's exit status, which reports the dependent's broken pin as a problem.

### Regression
The verdict for a command that passed in the baseline run and failed in the tarball run. Any regression makes the dependents check fail.

### Pre-existing failure
The verdict for a command that failed in both the baseline run and the tarball run. It is reported but does not fail the check, so anything in the environment that fails the baseline (a missing tool, a proxy only the baseline honors) can hide a regression behind it.
