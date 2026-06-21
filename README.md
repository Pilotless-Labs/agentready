# agentready

![agentready](agentready-badge.svg)

**Audit your repo for AI-coding-agent readiness.** Like a linter, but for how well
Claude Code, Copilot, Cursor, and other coding agents can actually work in your
repository.

Agents don't read your team's tribal knowledge. They read your repo. If the test
command isn't discoverable, the setup isn't reproducible, and there's no
CLAUDE.md/AGENTS.md, every agent session starts by guessing — and you pay for the
guesses in tokens, wrong turns, and broken CI. `agentready` scores how your repo reads
to an agent (0–100) and tells you exactly what to fix.

Zero dependencies. No account, no telemetry, no network calls. Node 18+.

## Quick start

Run it on your repo in one command — no install, no clone:

```bash
npx github:Pilotless-Labs/agentready .
```

That fetches and runs the current version straight from GitHub (zero dependencies, no
build step, nothing published to npm, nothing phones home). Swap `.` for any path to audit
a different repo.

Prefer to clone — to run offline, or read the source first?

```bash
git clone https://github.com/Pilotless-Labs/agentready
node agentready/bin/agentready.js /path/to/your/repo
```

(A short `npm i -g agentready` name is coming once it's settled; until then the
npx-from-GitHub form above already needs no install.)

## What it looks like

Real output, run against the repo of the autonomous venture that builds this tool:

```
  agentready score: 96/100 (A)

  ✓ Agent instructions file      100%  CLAUDE.md covers 4/4 core topics
  ✓ Test suite runnability       100%  tests present, runnable via: make test (documented)
  ~ Setup reproducibility         70%  no dependency manifest found (docs-only repo?)
      → If this repo has runtime dependencies, declare them in a manifest with a lockfile.
  ✓ Documentation structure      100%  README has 3/3 core elements + contributor docs
  ✓ Repository hygiene           100%  clean: .gitignore present, no stray artifacts, no oversized files
  ✓ CI configuration             100%  CI runs the test suite (.github/workflows/test.yml)
  ✓ Agent instructions accuracy  100%  all 15 path/command references in CLAUDE.md resolve
```

(That score was 70/C before the venture dogfooded its own tool and applied the fixes —
the fix advice is the product.)

Every failed check comes with a concrete fix, not a vibe.

## The checks

| Check | Weight | What it asks |
|---|---|---|
| Agent instructions file | 25 | Is there a CLAUDE.md / AGENTS.md / copilot-instructions with real substance — tests, setup, structure, conventions? Unfilled TODO placeholders don't count. |
| Test suite runnability | 20 | Can an agent find AND run your tests with a standard, documented command? |
| Documentation structure | 13 | Does the README tell an agent what this is, how to set it up, how to use it? |
| Setup reproducibility | 12 | Lockfile committed? Runtime pinned (.nvmrc, devcontainer)? A devcontainer is also judged on quality: it must parse (JSONC ok), pin an image/build, and install deps in a setup command. |
| Repository hygiene | 10 | .gitignore present, no committed artifacts, no giant files burning context windows. |
| CI configuration | 10 | Is there CI, and does it actually run the tests? CI is the verification loop reviewers trust. |
| Agent instructions accuracy | 10 | Do the paths and commands your CLAUDE.md/AGENTS.md reference actually exist? Stale instructions send agents down dead ends. |

## How is this different from…

- **`/init` and AGENTS.md generators** (Claude Code's `/init`, agent-written
  scaffolds): those *create* instructions once. agentready *audits* them continuously —
  presence, substance, and whether the commands and paths they mention still resolve
  after six months of drift. Run both: generate, then gate.
- **[agents.md](https://agents.md/)**: the standard says what the file is; agentready
  checks that yours exists, says something real, and hasn't gone stale. Same relation a
  linter has to a style guide.
- **repolinter & community-health checkers**: they audit open-source compliance —
  licenses, codes of conduct. agentready audits *agent operability* — can a coding
  agent figure out how to build, test, and change this repo without guessing?
- **Agent-session analytics** (token/cost/latency dashboards): those measure how a
  session went after the fact. agentready works on the cause side — the repo conditions
  that make sessions go badly — and runs in CI before the agent ever shows up.

## Use it as a CI gate

```bash
agentready . --min-score 80   # exits 1 below the threshold
agentready . --json           # machine-readable, for your own tooling
```

## GitHub Action

Gate every PR on agent-readiness with zero setup:

```yaml
# .github/workflows/agentready.yml
name: agentready
on: [push, pull_request]
permissions:
  pull-requests: write   # only needed for comment: true
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Pilotless-Labs/agentready@v1
        with:
          min-score: '80'   # optional CI gate; omit to just report
          badge: 'true'     # optional: refresh agentready-badge.svg
          comment: 'true'   # optional: post the score on the PR (one rolling comment)
```

Inputs: `path` (default `.`), `min-score` (empty = report only), `badge` (`true` to
rewrite the badge so a follow-up commit step can keep it current), `comment` (`true` to
post the score on pull requests). The action is a composite wrapper around the CLI — same
zero-dependency tool, nothing phones home.

**PR comments.** With `comment: 'true'`, on a `pull_request` event the action posts the
score table as a single comment and updates that same comment on each new push (no pile-up).
It uses the workflow's own `GITHUB_TOKEN` — agentready hosts nothing and stores no token —
so you must grant `permissions: pull-requests: write` (shown above). Preview the exact
Markdown locally with `agentready comment`.

## Badge

Show your score in your README. The badge is a **self-contained SVG** — no hosting, no
third-party service, no tracking:

```bash
agentready badge . --write    # writes agentready-badge.svg
```

```markdown
![agentready](agentready-badge.svg)
```

Commit the SVG and regenerate it in CI (the Action's `badge: true` input does this), or
prefer a live [Shields.io](https://shields.io/badges/endpoint-badge) endpoint badge:
`agentready badge . --json` emits the `{ schemaVersion, label, message, color }` payload.

## Fix what it finds

```bash
agentready fix .              # dry run: lists the starter files it would create
agentready fix . --write      # create them
```

`fix` generates honest starter files for failed checks: an AGENTS.md pre-filled
with your *detected* test/setup commands and directory layout, a README and
CONTRIBUTING skeleton, an ecosystem-matched .gitignore, an .nvmrc, and a CI
workflow (only when it's certain to run as-is). Everything it can't detect is a
clearly marked TODO — the stubs are scaffolding, not a substitute for filling
them in.

Two hard rules: it **only creates files that don't exist** (your existing files
are never modified), and it never invents facts (detected commands are real,
everything else says TODO). And the audit keeps you honest: unfilled placeholder
lines are discounted from the score, so generated stubs raise your grade but
can't fake an A — only filled-in content can.

## Guides

Longer-form docs (also published as a site once GitHub Pages is enabled):

- [How to make your repo agent-ready](docs/make-your-repo-agent-ready.md) — the complete
  check-by-check guide.
- [AGENTS.md vs CLAUDE.md](docs/agents-md-vs-claude-md.md) — how to write the agent
  instructions file (check #1), with a copy-paste example.
- [Why your AI coding agent keeps making mistakes](docs/why-ai-coding-agents-make-mistakes.md)
  — the repo problems behind agent mistakes, symptom by symptom, and how to fix each.
- [How agentready compares](docs/comparison.md) — vs. `/init`, agents.md, repolinter, and
  session analytics.

## Free vs Pro

Everything you see here — the CLI, all checks, the GitHub Action, and the score
badge — is **free forever** (MIT).

A **Pro** tier is planned for teams running agents across many repos: trend/history
badges, org-wide multi-repo dashboards, and CI gating *policies* (one required-score
config across every repo). If you'd pay for that,
[open a "request Pro" issue](../../issues/new?title=Request%20Pro) — that's the signal
that makes it exist.

If this is useful, **star the repo**. Stars are literally this project's product
validation metric (see below).

## Who built this (honesty label)

`agentready` is built and operated by **an autonomous AI venture**: scheduled Claude
sessions decide what to build, write the code, and ship it, with a human approving
only account/billing actions. This repo is its first product, and the tool is
dogfooded on the venture's own repo every session. Issues and PRs are read and
answered by the AI (clearly labeled as such).

## Contributing

Bug reports and check ideas are very welcome as issues. For code: the repo is
zero-dependency ES modules; run tests with `npm test`; new checks follow the module
pattern in `lib/checks/` and ship with unit tests. Details in
[CONTRIBUTING.md](CONTRIBUTING.md); see also `AGENTS.md` — which is what the AI
maintainer follows.

## License

MIT
