<!-- overdrive:start (managed by overdrive `bootstrap.sh --init`; a rerun replaces this block) -->
## Overdrive harness

This project uses the [overdrive](https://github.com/kevinold/overdrive) harness. Install or update the agent side (plugins, skills, hooks, MCP) with `npx -y github:kevinold/overdrive`; what each agent gets: [capability matrix](https://github.com/kevinold/overdrive/blob/main/docs/capability-matrix.md).

### Project commands

Detected stack: JavaScript (Node). Run these before calling work done:

- Test: `npm test`
- Lint: `npm run lint`

### Model gears

Three gears, never one model:

- **Driver (worker)** — the everyday model, set per session. Does the typing/building.
- **Overdrive (reasoning)** — a stronger model escalates for plan + brainstorm
  (compound-engineering: `plan_model` / `brainstorm_model`).
- **Peer (second opinion)** — `cross_model_peer`. A *different*, differently-trained model
  adversarially re-reviews. Never trust one model's output.

Each host sets gears its own way: [docs/capability-matrix.md](https://github.com/kevinold/overdrive/blob/main/docs/capability-matrix.md) (Gears per host).

### House style

Two behavior plugins run by default. They set how the agent works, not what it builds.

- **ponytail**: build the least code that works. Reuse before you add. Question whether a piece needs to exist.
- **caveman**: keep output terse. Signal, not filler.

Toggle per session: `/ponytail lite|full|ultra`, `/caveman lite|full|ultra`. Turn off with `stop ponytail` or `stop caveman`.

### Egress disclosure (important)

`cross_model_peer: codex` **sends full file/document content to a separate third-party
model** (codex / OpenAI). It runs on a *separate* subscription — it buys a second opinion,
not free tokens, and it is not covered by your Claude budget.

Enable it as a **reviewed, opt-in** decision weighed against your repo's data sensitivity —
**not** a default. If your code must not leave your Claude provider, leave `cross_model_peer`
unset. See `.compound-engineering/config.yaml`.

### The compounding loop

Knowledge compounds instead of being rediscovered:

1. Solve a non-trivial problem during a session.
2. Run `/ce-compound` — it writes the learning to `docs/solutions/`.
3. File-memory + `docs/solutions/` are read by the next session, so the next cycle starts
   from the fix instead of rediscovering it.

Three memory layers under everything: prompt cache (reuse, not re-send) ·
`codebase-memory-mcp` (code graph) · file-memory + `docs/solutions/` (durable knowledge).

<!-- overdrive:end -->
