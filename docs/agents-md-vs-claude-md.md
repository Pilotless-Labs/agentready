---
title: "AGENTS.md vs CLAUDE.md: how to write an agent instructions file (with examples)"
description: >-
  What an agent instructions file is, the difference between AGENTS.md, CLAUDE.md and
  .github/copilot-instructions.md, what to put in one, a copy-paste example, and the
  mistakes that make AI coding agents ignore or mistrust it.
---

# AGENTS.md vs CLAUDE.md: how to write an agent instructions file

The single highest-leverage file you can add for AI coding agents isn't code — it's a
short markdown file that tells the agent how your repository works. Claude Code reads
`CLAUDE.md`. The cross-tool convention is `AGENTS.md`. GitHub Copilot reads
`.github/copilot-instructions.md`. They're the same idea under three names, and getting one
right is worth more than any other single change you can make to how an agent performs in
your repo.

This guide covers what the file is, which name to use, exactly what to put in it, a
copy-paste starting point, and the mistakes that make agents quietly ignore it.

## What an agent instructions file is

When a capable coding agent opens your repository, it looks for a top-level instructions
file before it does anything else. That file is the agent's orientation: what the project
is, how to run the tests, how to set it up, where things live, and the conventions that
aren't obvious from the code. Without it, every session starts with the agent inferring all
of that from scratch — burning tokens, guessing at the test command, and sometimes guessing
wrong.

Think of it as the onboarding doc you'd give a sharp new contributor who is fast but has
zero tribal knowledge and won't ask clarifying questions. Everything they'd need to be
productive on day one goes in the file.

## AGENTS.md vs CLAUDE.md vs copilot-instructions.md

The three are the same concept addressed to different readers:

| File | Read by | Notes |
|---|---|---|
| `AGENTS.md` | The cross-tool convention ([agents.md](https://agents.md/)) | Tool-neutral; the safest default if you use more than one agent |
| `CLAUDE.md` | Claude Code | Claude Code reads this by name; supports nested files per-directory |
| `.github/copilot-instructions.md` | GitHub Copilot | Lives under `.github/` |

**Which should you use?** If your team uses a single agent, use that agent's native file
(`CLAUDE.md` for Claude Code). If you use more than one — or you want the file to keep
working as people switch tools — write the content once in `AGENTS.md` and leave a
one-line pointer in the tool-specific files (e.g. a `CLAUDE.md` that says "See AGENTS.md").
The content matters far more than the filename; pick one home for it and don't duplicate
the same prose in three places where it'll drift out of sync.

[agentready](index.html) treats any of the three as a valid agent instructions file, so you
won't be penalized for the name you pick — only for the file being missing, thin, or stale.

## What to put in it

A good instructions file is short and specific. Four topics carry almost all the value:

1. **What this project is** — one or two sentences of orientation. What it does, and the
   stack it's built on.
2. **How to run the tests** — the *exact* command. `npm test`, `make test`, `pytest -q`.
   An agent that can run your tests can verify its own work before handing it back.
3. **How to set up / build** — install steps and the runtime version. The commands a fresh
   checkout needs to reach a working state.
4. **Conventions & structure** — where things live, the style rules that matter, and the
   gotchas a newcomer always trips over.

Beyond those, add anything an agent would otherwise get wrong: "never edit files under
`generated/`", "we use tabs", "run the linter before committing", "the API client is in
`lib/api`, not `src/api`". Be concrete. Vague guidance ("write clean code") is noise; a
specific rule ("all DB calls go through `db/query.js`, never raw SQL in handlers") changes
behavior.

## A copy-paste example

```markdown
# AGENTS.md

## What this is
A zero-dependency Node.js CLI that audits a repository and prints a 0–100 score.
Node 18+. No build step.

## Setup
- `npm install` — installs dev dependencies (none required to run the CLI).
- Node 18 or newer (uses the built-in `fetch` and `node:test`).

## Tests
- Run the full suite with `make test` (or `npm test`).
- Tests live in `test/` and use the built-in `node:test` runner. Add a test for every
  behavior change.

## Layout & conventions
- `bin/` — CLI entry point.   `lib/` — one module per check.
- Pure functions in `lib/`; side effects (file I/O, network) stay in `bin/` and the
  `*-runner` modules so the checks stay unit-testable.
- No runtime dependencies — keep it that way. Don't add a package to `dependencies`.
- Conventional Commits for commit messages.
```

Keep it that tight. A file an agent can read in five seconds and act on beats a 600-line
manifesto it has to wade through — and which no one will keep up to date.

## The mistakes that make agents ignore it

Writing the file is half the job. These are the failure modes that make it worthless — or
worse than nothing:

- **Placeholder stubs.** A file that's mostly unfilled `TODO` / `FIXME` lines gives the
  agent nothing and gives *you* a false sense of coverage. Tools that audit for this (agentready
  among them) discount placeholder lines, so a stub won't fake a passing grade — but more
  importantly, the agent can't act on a `TODO`.
- **Confidently wrong references.** The cruelest failure mode: the file says "run
  `npm run test`" but the script is named `test:ci`, or it points at `src/utils` after that
  directory moved to `lib/`. The agent follows your instructions straight into a dead end and
  trusts them over the actual repo. Stale instructions are worse than no instructions.
- **A wall of prose.** If the test command is buried in paragraph nine, the agent — like a
  human — may not find it. Lead with the commands. Use headings and lists.
- **Letting it rot.** The file is correct the day you write it and drifts every week after.
  The fix is to make it *checkable*: cross-check the paths and commands it references against
  the repo, in CI, so drift gets caught the moment it happens.

That last point is the whole reason a linter for this file exists. You wouldn't trust a
README's code samples without running them; don't trust an agent instructions file without
checking that what it claims is still true.

## Check yours in 30 seconds

agentready scores whether your `AGENTS.md` / `CLAUDE.md` exists, covers the topics that
matter, and still resolves — plus six other checks that decide how well an agent works in
your repo. Zero dependencies, no account, no telemetry. Node 18+.

```bash
npx github:Pilotless-Labs/agentready .
```

Missing the file entirely? `agentready fix .` generates an `AGENTS.md` pre-filled with the
test and setup commands it *detected* in your repo, with clearly-marked `TODO`s for the rest
— fill those in and re-run.

## Related

- **[How to make your repo agent-ready](make-your-repo-agent-ready.html)** — the full
  check-by-check guide (all seven checks, weighted).
- **[How agentready compares](comparison.html)** — vs. `/init`, the agents.md standard,
  repolinter, and session analytics.
- **[agentready home](index.html)** — what it is and how to install it.
