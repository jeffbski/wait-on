# docs/solutions — the compounding layer

Durable learnings live here. This is the "Learn / Compound" phase of the harness: every
non-trivial fix becomes a doc the next session reads instead of rediscovering.

## The loop

1. You (or the agent) solve a non-trivial problem during a session.
2. Run `/ce-compound`. It captures the problem + the fix as a solution doc in this directory.
3. File-memory + these docs are read at the start of the next session, so the next cycle
   starts from the solution — not from scratch.

Combined with the other two memory layers (prompt cache for reuse, `codebase-memory-mcp`
for the code graph), this is the durable, human-readable layer: the one that makes the
harness *more effective the longer you use it*.

## Conventions

- One solved problem per file. Name it for the problem, not the fix
  (`mise-exec-fails-on-clone.md`, not `pin-version.md`).
- State the symptom, the root cause, and the fix. Link related solutions.
- Keep it short — the point is that the next session reads it fast.

## Seeded

This file is the seed. `/ce-compound` writes siblings next to it as you go.
