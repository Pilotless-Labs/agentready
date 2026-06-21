# agentready — agent instructions

A zero-dependency Node.js (>=18) CLI that audits a repository for AI-coding-agent
readiness. No build step, no install step, no external dependencies — clone and run.

## Run and test

- Run the CLI: `node bin/agentready.js <path-to-repo>` (also `--json`, `--min-score N`).
- Generate starter files: `node bin/agentready.js fix <path>` (dry run; `--write` applies).
- Run the tests: `npm test` (uses `node --test`; all tests must stay green).

## Structure

- `bin/agentready.js` — CLI entry point: arg parsing, exit codes.
- `lib/runner.js` — orchestrates checks, computes the weighted 0–100 score and grade.
- `lib/context.js` — filesystem access for checks (`exists`, `read`, cached file walk).
- `lib/report.js` — terminal and JSON renderers.
- `lib/fix.js` — the `fix` subcommand: plans and writes starter-file stubs. Hard
  rules: only create files that don't exist, never invent facts (detected commands
  are real, the rest are TODOs).
- `lib/checks/` — one module per check, registered in `lib/checks/index.js`. Each
  exports `{ id, title, weight, run(ctx) }`; `run` returns
  `{ score: 0..1, details, fix }`. Shared helper: `lib/checks/placeholders.js`
  (TODO/placeholder analysis used by the content-quality checks).

## Conventions

- ES modules (`"type": "module"`), no runtime dependencies — keep it that way.
- New checks follow the existing module pattern and must come with unit tests in
  `test/checks.test.js`.
- Check `fix` strings are concrete and actionable — tell the user exactly what file to
  add or change, never just "improve X".
- Weights across all checks should sum to 100 (`lib/runner.js` normalizes, but keep
  them honest).
