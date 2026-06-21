---
title: "How to make your repo agent-ready: the complete guide"
description: >-
  A practical, check-by-check guide to making your repository readable by AI coding
  agents like Claude Code, Copilot and Cursor — agent instructions (CLAUDE.md / AGENTS.md),
  runnable tests, reproducible setup, docs, hygiene, CI, and instruction accuracy.
---

# How to make your repo agent-ready

AI coding agents are only as good as the repository you point them at. Give an agent a
repo where the tests are discoverable, the setup is reproducible, and an `AGENTS.md`
explains the conventions, and it ships clean changes on the first try. Give it a repo
where none of that is written down, and it burns your token budget rediscovering basics —
and still guesses wrong.

"Agent-ready" is not a vibe. It's a small set of concrete, checkable properties. This
guide walks through all seven, in the order [agentready](index.html) weights them, with
exactly what to do to pass each one. You can check your own repo as you go:

```bash
git clone https://github.com/Pilotless-Labs/agentready
node agentready/bin/agentready.js .
```

## 1. Agent instructions file (weight: 25)

**The single highest-leverage thing you can add.** An agent instructions file —
`CLAUDE.md`, `AGENTS.md`, or `.github/copilot-instructions.md` — is the first thing a
capable agent looks for. It's where you write down what the repo is, how to run the
tests, how to set it up, the directory layout, and the conventions that aren't obvious
from the code.

To pass, the file has to exist **and say something real**. The four topics that matter
most:

1. **What this project is** — one or two sentences of orientation.
2. **How to run the tests** — the exact command.
3. **How to set up / build** — install steps, runtime version.
4. **Conventions & structure** — where things live, style rules, gotchas.

A file full of unfilled `TODO` / `FIXME` placeholders does **not** count — agentready
discounts placeholder lines so a stub can't fake a passing grade. Write the real thing.

> New to this? Run `agentready fix .` and it generates an `AGENTS.md` pre-filled with the
> test and setup commands it *detected* in your repo, with clearly-marked `TODO`s for
> everything it couldn't infer. Fill those in and you're done.

## 2. Test suite runnability (weight: 20)

An agent that can run your tests can verify its own work before handing it back. An agent
that can't is flying blind, and so are you when you review its PR.

To pass: tests must be **discoverable** (a `test/` or `tests/` directory, or a test
script in your manifest) **and** runnable with a **standard, documented command**. The
command needs to appear somewhere an agent will look — your `package.json` scripts, a
`Makefile`, the README, or your agent instructions file.

- Node: a `"test"` script in `package.json` → `npm test`.
- Python: `pytest` with tests under `tests/`, documented in the README.
- Make-based: a `make test` target.
- Rust: `cargo test` (it's conventional, but document any non-default flags).

The point isn't a specific tool — it's that the command is **written down**, not folklore.

## 3. Documentation structure (weight: 13)

The README is an agent's map. To pass, it should cover the three things an agent needs to
get oriented:

1. **What this is** — a one-line description up top.
2. **How to set it up** — install/build steps.
3. **How to use it** — at least one concrete usage example.

Contributor docs (`CONTRIBUTING.md`) are a bonus signal: they're where review
expectations and the dev workflow live, which is exactly what an agent opening a PR needs
to respect.

## 4. Setup reproducibility (weight: 12)

If an agent (or a fresh CI runner, or a new hire) can't get to a working state
deterministically, every session starts with a yak-shave. To pass:

- **Commit a lockfile** — `package-lock.json`, `poetry.lock`, `Cargo.lock`, etc. — so
  dependency versions are pinned.
- **Pin the runtime** — an `.nvmrc`, a `python-version`, or a `devcontainer.json`.
- A **devcontainer** is judged on quality, not just presence: it should parse (JSONC is
  fine), pin an image or build, and install dependencies in a setup command. A
  devcontainer that doesn't actually install anything doesn't make setup reproducible.

## 5. Repository hygiene (weight: 10)

Noise costs an agent context-window space and attention. To pass:

- A **`.gitignore`** that's actually doing its job.
- **No committed build artifacts** — `node_modules/`, `dist/`, compiled binaries.
- **No giant checked-in files** that blow out an agent's context window when it reads the
  tree.

A clean, conventional layout means the agent spends its budget on your problem, not on
your clutter.

## 6. CI configuration (weight: 10)

CI is the verification loop reviewers — human and agent — trust. To pass, there should be
a CI workflow (`.github/workflows/`, GitLab CI, etc.) and it should **actually run the
tests**. A workflow that only lints, or that exists but never invokes your test command,
doesn't close the loop. Wire your documented test command into CI and an agent's changes
get verified automatically on every PR.

## 7. Agent instructions accuracy (weight: 10)

The cruelest failure mode: an agent instructions file that's **confidently wrong**.
Repos drift — a script gets renamed, a directory moves — but the `CLAUDE.md` that
references them doesn't. Now the agent follows your instructions straight into a dead end.

To pass, the paths and commands your instructions file references must **actually
resolve**: the files it points at exist, the commands it tells the agent to run are real.
agentready cross-checks every path and command reference in your instructions file
against the repo. Re-run it in CI and stale instructions get caught the moment they drift.

## Putting it together

You don't have to do this by hand. The workflow most teams use:

```bash
# 1. See where you stand
node agentready/bin/agentready.js .

# 2. Generate honest starter files for what's missing (never overwrites your files)
node agentready/bin/agentready.js fix . --write

# 3. Fill in the TODOs the stubs leave, then re-check
node agentready/bin/agentready.js .

# 4. Gate it in CI so it never regresses
#    uses: Pilotless-Labs/agentready@v1  (with: min-score: '80')
```

Add the [score badge](https://github.com/Pilotless-Labs/agentready#badge) to your README
once you're happy with the number, and every contributor — human or agent — sees the bar
at a glance.

## Related

- **[agentready home](index.html)** — what it is and how to install it.
- **[AGENTS.md vs CLAUDE.md](agents-md-vs-claude-md.html)** — how to write the
  highest-weighted file (check #1), with a copy-paste example.
- **[Why your AI coding agent keeps making mistakes](why-ai-coding-agents-make-mistakes.html)**
  — the same checks, read backwards from the symptoms they cause.
- **[How agentready compares](comparison.html)** — vs. `/init`, agents.md, repolinter,
  and session analytics.
- **[Source on GitHub](https://github.com/Pilotless-Labs/agentready)** — free CLI,
  Action, and badge.
