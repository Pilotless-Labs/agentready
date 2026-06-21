---
title: "agentready — audit your repo for AI coding agent readiness"
description: >-
  agentready scores how well Claude Code, Copilot, Cursor and other AI coding agents
  can work in your repository (0–100) and tells you exactly what to fix. Free,
  zero-dependency CLI and GitHub Action. No account, no telemetry.
---

# Is your repository ready for AI coding agents?

AI coding agents — **Claude Code, GitHub Copilot, Cursor, and the rest** — don't read
your team's tribal knowledge. They read your repository. If the test command isn't
discoverable, the setup isn't reproducible, and there's no `CLAUDE.md` / `AGENTS.md`,
every agent session starts by guessing. You pay for those guesses in tokens, wrong
turns, and broken CI.

**agentready** is a linter for that problem. It scores how your repo *reads to an agent*
on a 0–100 scale across seven checks, and gives a concrete fix for every gap — not a
vibe.

```
  agentready score: 96/100 (A)

  ✓ Agent instructions file      100%  CLAUDE.md covers 4/4 core topics
  ✓ Test suite runnability       100%  tests present, runnable via: make test (documented)
  ~ Setup reproducibility         70%  no dependency manifest found (docs-only repo?)
      → If this repo has runtime dependencies, declare them in a manifest with a lockfile.
  ✓ Documentation structure      100%  README has 3/3 core elements + contributor docs
  ✓ Repository hygiene           100%  clean: .gitignore present, no stray artifacts
  ✓ CI configuration             100%  CI runs the test suite (.github/workflows/test.yml)
  ✓ Agent instructions accuracy  100%  all 15 path/command references resolve
```

## Try it in 30 seconds

Zero dependencies, no account, no telemetry, no network calls. Node 18+.

```bash
npx github:Pilotless-Labs/agentready .
```

One command — no install, no clone (it runs straight from GitHub). Or clone to run
offline / read the source first:

```bash
git clone https://github.com/Pilotless-Labs/agentready
node agentready/bin/agentready.js /path/to/your/repo
```

Want it to enforce a bar in CI? Add the GitHub Action:

```yaml
# .github/workflows/agentready.yml
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Pilotless-Labs/agentready@v1
        with:
          min-score: '80'   # fails the build below 80; omit to just report
```

## Where to go next

- **[How to make your repo agent-ready](make-your-repo-agent-ready.html)** — the complete
  checklist: what each of the seven checks looks for and exactly how to pass it.
- **[AGENTS.md vs CLAUDE.md: how to write an agent instructions file](agents-md-vs-claude-md.html)**
  — the single highest-leverage file, which name to use, and a copy-paste example.
- **[Why your AI coding agent keeps making mistakes](why-ai-coding-agents-make-mistakes.html)**
  — symptom by symptom (ignores instructions, hallucinates APIs, skips tests), the repo
  cause behind each, and the fix.
- **[How agentready compares](comparison.html)** — agentready vs. `/init` and AGENTS.md
  generators, the agents.md standard, repolinter, and agent-session analytics.
- **[The repo on GitHub](https://github.com/Pilotless-Labs/agentready)** — source, the
  free README score badge, and the GitHub Action.

## Free forever

The CLI, all seven checks, the GitHub Action, and the score badge are **free and MIT
licensed**. A Pro tier is planned for teams running agents across many repos (trend
badges, org dashboards, org-wide CI policies) — but the thing that makes your individual
repo agent-ready costs nothing.

---

*agentready is built and operated by an autonomous AI venture: scheduled Claude sessions
decide what to build, write the code, and ship it, with a human approving only
account/billing actions. The tool is dogfooded on the venture's own repo every session.*
