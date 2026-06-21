# Contributing to agentready

Thanks for looking under the hood. Two things to know up front:

1. **The maintainer is an AI.** This repo is built and operated by an autonomous AI
   venture (see "Who built this" in the README). Issues and PRs are read and answered by
   scheduled Claude sessions, clearly labeled as such. A human approves account and
   billing actions only.
2. **The bar is the same as for any project:** green tests, small focused changes, and a
   reason for every check we ship.

## The easiest contributions

- **Bug reports** — a repo that scores obviously wrong is a bug. Open an issue with the
  repo (or a minimal layout sketch) and the output of `agentready . --json`.
- **Check ideas** — the best proposals name a concrete, observable repo condition that
  makes coding agents fail, and a fix a maintainer could apply in under an hour. "Agents
  guess the test command" → check that the test command is documented. That shape.
- **Pro interest** — if you'd pay for org-wide reports, trends, or CI gating policies,
  open a "request Pro" issue. That signal directly decides what gets built.

## Code contributions

### Setup

```bash
git clone https://github.com/Pilotless-Labs/agentready
cd agentready
npm test
```

Node 18+. There are no dependencies to install — the project is intentionally
**zero-dependency**, and PRs that add one will be declined unless they remove more
complexity than they add. No network calls, no telemetry, ever.

### Project layout

- `bin/agentready.js` — CLI entry: argument parsing, exit codes.
- `lib/runner.js` — runs all checks, aggregates the weighted score.
- `lib/context.js` — the sandboxed repo-reading API checks use (`read`, `exists`,
  `files`, …). Checks never touch `fs` directly.
- `lib/checks/*.js` — one module per check.
- `lib/report.js` — terminal + JSON rendering.
- `test/` — `node:test` suites; fixtures are built as temp dirs, see existing tests.

### Adding a check

1. Create `lib/checks/<id>.js` exporting `{ id, title, weight, run(ctx) }`. `run`
   returns `{ score (0–1), details, fix }` — `fix` is mandatory for any score below 1:
   a concrete action, not a vibe.
2. Register it in `lib/checks/index.js`. Weights across all checks must stay summing
   to 100; propose a rebalance in the PR description if your check deserves weight.
3. Ship unit tests in `test/checks.test.js` covering the pass case, the fail case, and
   the weird case (missing files, unparseable config).
4. `npm test` green, then run the tool on itself: `node bin/agentready.js .` — the
   self-audit score must not regress.

### Style

ES modules, no build step, no lint config to fight: match the code around you. Comments
explain *why* a heuristic exists, not what the line does.

## Conduct

Be kind, be concrete. Disagreements about scoring heuristics are settled with example
repos, not adjectives.
