---
title: "Why your AI coding agent keeps making mistakes (and how to fix your repo)"
description: >-
  AI coding agents like Claude Code, Cursor, and Copilot get things wrong, ignore your
  instructions, and hallucinate APIs more often when your repository is hard to read.
  A symptom-by-symptom guide to the repo problems behind agent mistakes, and how to fix them.
---

# Why your AI coding agent keeps making mistakes

You gave the agent a clear task. It edited the wrong file, invented a function that
doesn't exist, skipped the tests, or confidently followed a setup step that fails. The
reflex is to blame the model — "Cursor is dumb today", "Claude ignored my instructions",
"Copilot hallucinated the API". Sometimes that's true. More often the model is doing its
best with a repository that doesn't tell it what it needs to know.

An AI coding agent doesn't have your team's tribal knowledge. It has your repository.
Whatever isn't discoverable from the files in front of it, the agent has to *guess* — and
guesses are where mistakes come from. This guide walks the common symptoms back to the
repo problems that cause them, and points at the concrete fix for each.

## "It ignores my instructions"

The most common complaint, and usually the most fixable. If the agent isn't following your
conventions, ask first whether the conventions are *written down where the agent looks*.

- **There's no instructions file.** Claude Code reads `CLAUDE.md`; the cross-tool
  convention is `AGENTS.md`; Copilot reads `.github/copilot-instructions.md`. If none
  exists, the agent has nothing to follow — it's improvising from the code. ([Which file
  should you write?](agents-md-vs-claude-md.html))
- **The file exists but is thin or full of `TODO`s.** A placeholder stub gives the agent
  nothing to act on while giving *you* a false sense that you've covered it.
- **The rules are buried in prose.** If "always run the linter before committing" is in
  paragraph nine, the agent — like a human skimming — may never reach it. Lead with the
  rules; use headings and short lists.

The fix is a short, specific instructions file: what the project is, how to run the tests,
how to set up, and the conventions that aren't obvious from the code. A rule the agent can
find and act on ("all DB calls go through `db/query.js`") changes behavior; a vague one
("write clean code") is noise.

## "It hallucinates functions, paths, or commands"

When an agent calls an API that doesn't exist or runs a command that fails, look for places
where your repo *says one thing and is another*:

- **Stale instructions.** The cruelest failure mode: your `CLAUDE.md` says "run
  `npm run test`" but the script is `test:ci`, or it points at `src/utils` after that code
  moved to `lib/`. The agent trusts your file over the actual tree and walks straight into
  a dead end. **Stale instructions are worse than none** — they actively mislead.
- **No reproducible setup.** If there's no dependency manifest and lockfile, the agent
  can't know which version of a library you're on, so it guesses an API surface — and
  hallucinates the half that changed between versions.
- **Undocumented structure.** With no map of where things live, the agent infers paths
  from naming conventions, and infers wrong.

The durable fix isn't "write the file once" — it's making the file *checkable*, so the
paths and commands it references are verified against the actual repo (ideally in CI) and
drift gets caught the moment it happens. You wouldn't trust a README's code samples without
running them; don't trust an agent instructions file without checking it still resolves.

## "It doesn't run the tests" / "it says it can't verify its work"

An agent that can run your tests can check its own work before handing it back — that single
capability turns a guessing agent into a self-correcting one. When it can't:

- **The test command isn't discoverable.** No `npm test` script, no `make test`, nothing in
  the instructions file. The agent can't find the entry point, so it stops verifying.
- **Tests need an environment the agent can't reproduce.** Hidden env vars, a database that
  isn't mocked, a build step documented nowhere. Setup that only lives in a teammate's head
  is setup the agent can't perform.

Make the test command a one-liner, document it in both the README and the instructions file,
and make sure a fresh checkout can actually reach a green run.

## "It works on my repo but breaks in CI"

If the agent's changes pass locally and fail on the build, the gap is usually that **CI
doesn't run what the agent ran** — or runs nothing. When CI actually exercises the test
suite, the agent (and you) get a trustworthy signal on every change. When CI is absent or
only lints, "it worked locally" is the best anyone can say, and regressions ship.

## The pattern behind all of these

Every symptom above traces back to the same root cause: **the repository is hard to read for
something that only has the repository.** The instructions are missing, thin, or stale; the
setup isn't reproducible; the tests aren't runnable; the structure isn't documented; CI
doesn't verify. Fix those and agent mistakes drop sharply — not because the model got
smarter, but because it stopped having to guess.

These aren't vague qualities, either. They're checkable, and they map almost one-to-one onto
what an [agent-readiness audit](make-your-repo-agent-ready.html) measures:

| Symptom | Root cause in the repo | The check |
|---|---|---|
| Ignores instructions | No / thin instructions file | Agent instructions file |
| Hallucinates paths & commands | Stale references in the instructions | Agent instructions accuracy |
| Hallucinates APIs | No manifest + lockfile (version unknown) | Setup reproducibility |
| Can't verify its work | Test command not discoverable | Test suite runnability |
| Edits the wrong thing | Undocumented structure | Documentation structure |
| Works locally, breaks in CI | CI doesn't run the tests | CI configuration |

## See which of these your repo has — in 30 seconds

Instead of guessing which problem is biting you, measure it. **agentready** scores how your
repo reads to an agent across all seven checks and tells you the specific gap behind each —
no account, no telemetry, no network calls. Node 18+.

```bash
npx github:Pilotless-Labs/agentready .
```

One command, no install. Missing the instructions file entirely? `agentready fix .`
generates an `AGENTS.md` pre-filled with the test and setup commands it *detected* in your
repo, with clearly-marked `TODO`s for the rest — fill those in and re-run to watch the score
climb.

## Related

- **[How to make your repo agent-ready](make-your-repo-agent-ready.html)** — the full
  check-by-check guide (all seven checks, weighted, with how to pass each).
- **[AGENTS.md vs CLAUDE.md: how to write an agent instructions file](agents-md-vs-claude-md.html)**
  — the single highest-leverage fix, with a copy-paste example.
- **[How agentready compares](comparison.html)** — vs. `/init`, the agents.md standard,
  repolinter, and session analytics.
- **[agentready home](index.html)** — what it is and how to install it.
