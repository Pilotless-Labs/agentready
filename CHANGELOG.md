# Changelog

All notable changes to agentready. Format follows [Keep a Changelog](https://keepachangelog.com/);
versioning will follow [SemVer](https://semver.org/) once released. Dates are UTC.

## [Unreleased] — 0.1.0

Pre-release. The tool runs in one command via `npx github:Pilotless-Labs/agentready .`
(no install, no clone, no npm publish needed) or via clone-and-run; a published npm name
is still pending (see README). History below is by build date.

### 2026-06-21 (latest)

- **Accuracy — Rust install conventions (`[dependencies]` block / `cargo add`) now count as
  install instructions.** docs-structure's install/setup signal recognized morphological
  "install"/"setup" variants and Go's `go get`, but not the way Rust *libraries* document setup:
  "add this to your `Cargo.toml`" — a `[dependencies]` block — or `cargo add <crate>` (you depend
  on a crate, you don't "install" it). So flagship crates were misgraded as missing install
  instructions: **tokio**, **serde**, **rayon** and **clap** all show only a `[dependencies]`
  block / `cargo add` and read as 2/3 core elements. Now matched (the Rust analog of the `go get`
  fix), bringing each to 3/3; `click`, which genuinely omits an install section, correctly stays
  2/3 (no false-positive flip). tokio docs-structure 0.83 → 1.0. 97 → 98 tests; self-audits
  unchanged (dough 96/A, product 100/A).
- **Accuracy — directory-based agent-rule sets (`.cursor/rules/`, `.clinerules/`, `.windsurf/rules/`)
  now count as agent-instructions.** The agent-instructions check (highest-weighted, 25 pts) and
  instructions-accuracy recognized only single-file conventions, so a repo whose only agent
  instructions live in a *directory* of rule files — Cursor's `.cursor/rules/*.mdc`, Cline's
  `.clinerules/` (file *or* directory), Windsurf's `.windsurf/rules/` — was graded as if it had
  *none*, a 0 on the heaviest check. Real bites: `micronaut-projects/micronaut-spring` (substantive
  `.clinerules/`) **51/F → 80/B** (agent-instructions 0% → 100%); `HappydanceLabs/umbraco-mcp-server`
  (5.7k words of `.cursor/rules/`) **36/F → 56/F** (and accuracy now correctly flags its genuinely
  stale `npm run lint` reference). Both checks and the `fix` planner now resolve their file set
  through one shared `findInstructionFiles()` so they can't drift; directory rule sets expand to
  their rule files (recursively), `.clinerules` is resolved by shape. 94 → 97 tests; self-audits
  unchanged (dough 96/A, product 100/A).

- **Accuracy — `GEMINI.md`, `.cursorrules`, and `.windsurfrules` now count as agent-instructions
  files.** The agent-instructions check (the highest-weighted, 25 pts) and the
  instructions-accuracy check recognized only `CLAUDE.md`, `AGENTS.md`, and
  `.github/copilot-instructions.md` — so a repo whose agent instructions live in a `GEMINI.md`
  (Gemini CLI) or `.cursorrules`/`.windsurfrules` (Cursor/Windsurf) was graded as if it had *no*
  instructions at all. Real bite: `google-gemini/gemini-cli` ships a complete 96-line `GEMINI.md`
  yet was graded agent-instructions **0% → 100%** and overall **63/D → 93/A**. The recognized set
  now mirrors the companion tool ctxcost's catalog of single-file conventions (extracted to one
  shared list so the two checks can't drift). Directory-based rule sets (`.cursor/rules/`,
  `.clinerules/`) followed in the entry above. 92 → 94 tests; self-audits unchanged (dough 96/A, product 100/A).

- **Accuracy — `Installation`/`Installing`/`Set up` headers and `go get` now count as
  install instructions.** The documentation-structure check looked for the install/setup
  signal with the bare stems `install`/`setup`, which silently missed the two most common
  section headers — `## Installation` (no word boundary after "install") and `## Set up`
  (a space) — and the canonical Go install command `go get`, which carries no literal
  "install" word. A perfectly documented Go library (e.g. `julienschmidt/httprouter`, which
  documents setup only as `go get github.com/...`) was therefore graded as *missing* install
  instructions (docs-structure 0.73 → 0.90). The signal now recognizes the morphological
  variants (`install\w*`, `set ?up`) and `go get`. All three are unambiguous install signals,
  so no new false positives. 90 → 92 tests; self-audits unchanged (dough 96/A, product 100/A).

### 2026-06-20

- **Accuracy — a Ruby gem is no longer penalized for omitting `Gemfile.lock`.** Setup
  reproducibility dropped any "manifest but no lockfile" repo to the harsh 0.3 band — but a
  published *library* intentionally omits its lockfile (its dependencies resolve in the
  consuming app; `bundle gem` even gitignores `Gemfile.lock`), so for a gem the lockless
  state is correct, not a defect. A root `*.gemspec` now marks the repo as a gem: it counts
  as a manifest and earns 0.8 (1.0 with an env pin such as `.ruby-version` / `.tool-versions`
  / a devcontainer) instead of 0.3. Scoped deliberately to the unambiguous gem signal — a
  Ruby *app* (Gemfile, no gemspec) still needs a committed lockfile. Also added
  `.ruby-version` to the recognized environment pins. Verified on `sinatra/sinatra`
  (setup-reproducibility 0.3 → **0.8**); `expressjs/express` (npm library) unchanged at 0.3.
  87 → 90 tests green.
- **Accuracy — a CI workflow named "Testing" that runs a default task is no longer
  graded as having no tests.** The CI check's job/step-name fallback only matched the
  exact word `test`, so a workflow titled `name: Testing` (the `\b` word boundary failed
  on "Test"+"ing") slipped through to the harsh "no test run detected" band — even though
  it clearly runs the suite via a default task the command-regex can't see (e.g. Ruby's
  bare `bundle exec rake`, whose default task is the test task). The name fallback now
  matches a leading `test` prefix (Test / Tests / Testing / "Test suite"), still anchored
  on `name:` so mid-sentence step names ("Run rack-protection tests") don't false-match.
  Verified on `sinatra/sinatra` (CI 60% → **90%**, and it now names the real `test.yml`
  instead of the release-only workflow); `expressjs/express`, `pallets/flask`, and
  `psf/requests` are unchanged. 86 → 87 tests green.
- **Accuracy — Julia and Crystal test suites are now recognized.** Both ecosystems keep
  their tests where the directory heuristics already find them (`test/runtests.jl` for
  Julia, `spec/*_spec.cr` for Crystal) but `findTestCommand` had no manifest rule for
  either, so real packages reported "test files exist but no command to run them" and were
  docked half the test-runnability check. **Julia:** a `Project.toml` package with the
  canonical `test/runtests.jl` entry point now resolves to
  `julia --project -e 'using Pkg; Pkg.test()'` (verified on `JuliaLang/Example.jl` and
  `JuliaCollections/DataStructures.jl`: 50% → **80%**); the rule requires the entry file to
  exist so a bare environment `Project.toml` is never claimed. **Crystal:** a `shard.yml`
  project now resolves to `crystal spec` (verified on `kemalcr/kemal` and
  `mamantoha/crest`: 55/F → **65/D**). Both rules sit after the `make test` branch, so a
  repo with an explicit Makefile target keeps it (verified on `veelenga/ameba`). 82 → 86
  tests green.

### 2026-06-19 (earlier)

- **Accuracy — a `build/`/`dist/`/`out/`/`target/` directory of hand-written source is no
  longer mis-flagged as committed build output.** Some projects keep authored source in a
  directory that merely shares a name with a build-output dir — e.g. `bat` (Rust) commits
  `build/*.rs` build-script modules while its real output goes to `target/`. The hygiene
  check flagged any such dir and told maintainers to delete it, costing real,
  well-maintained repos a third of the hygiene check (bat: 67/D → **70/C**, hygiene
  67% → **100%**). The check now peeks inside the ambiguously-named dirs and skips one only
  when it holds authored source in a compiled language whose output lives elsewhere
  (Rust/Go/Swift/Zig/C/C++/…) **and** contains zero generated-output markers (object code,
  bytecode, archives, minified or content-hashed/source-mapped web assets). Detection of
  real committed output is deliberately unweakened: a `dist/` of `.js`, a Create-React-App
  `build/` of content-hashed bundles, a committed Rust `target/`, and a setuptools `build/`
  of copied `.py` all stay flagged (`.js`/`.ts`/`.css`/`.py` are never exempted). New
  bounded `ctx.listDir()` peeks into walker-skipped dirs. 81 → 82 tests green.

### 2026-06-19 (later still)

- **Reliability — breadth-first repository walk** so huge monorepos grade on their
  highest-signal files. The file walk that backs `ctx.files()` was depth-first with a
  5000-file cap, so on a large repo it could dive into one early-sorted giant subdirectory
  (e.g. a 20k-file `doc/`) and exhaust the cap before ever reaching a sibling top-level
  `src/` or `test/` directory — silently dropping the test files (and other shallow,
  high-signal entries) that the test/CI/docs checks rely on. The walk is now breadth-first:
  it captures root files, then every subdirectory's immediate contents, before descending,
  so when the cap is reached it truncates the *deepest* files rather than whole top-level
  directories. Results are byte-identical on any repo under the cap (the common case); only
  pathological monorepos change, and only for the better. 80 → 81 tests green.

### 2026-06-19 (later)

- **Scoring accuracy — Haskell, Scala, and Zig test detection** (dogfood-hardened on real
  OSS repos: `koalaman/shellcheck` (Haskell), `zio/zio` (Scala), `ziglang/zig` (Zig);
  regression-checked on `ring-clojure/ring` and `nim-lang/Nim`, which correctly stay
  deferred). **Test runnability** now recognizes three more ecosystems' standard runners:
  a `.cabal` file runs via `cabal test` (Stack-only projects fall back to `stack test`),
  `build.sbt` runs via `sbt test`, and `build.zig` runs via `zig build test`. Zig test
  files (`*_test.zig` / `test_*.zig`) are also recognized. Results on the real repos:
  `shellcheck` 50% → 100% (documented), `zio` 50% → 80%, `zig` 0% → 80% on this check.
  76 → 80 tests green.

### 2026-06-19

- **Scoring accuracy — Dart / Flutter test detection** (dogfood-hardened on real OSS
  repos: `dart-lang/path`, `dart-lang/http`; regression-checked on `jaegertracing/jaeger`
  and `metabase/metabase`). **Test runnability** now recognizes Dart's universal runner:
  any `pubspec.yaml` runs via `dart test`, and Flutter packages (detected by a `flutter`
  SDK reference, not the substring — `flutter_bloc:` is a dependency, not the SDK) run via
  `flutter test`. `*_test.dart` is also recognized as a test-file suffix. `dart-lang/path`
  went 50% → 80% on this check. Monorepos with no root `pubspec.yaml` (e.g. `dart-lang/http`)
  correctly stay unrecognized — there is no single root test command. 73 → 76 tests green.
  (The Dart setup-reproducibility manifest gap — `pubspec.yaml` reads as "docs-only" — is
  deferred for the same reason as #47: Dart *libraries* don't commit `pubspec.lock`, so
  recognizing the manifest without a pin-equivalent rule would over-penalize them.)

### 2026-06-18 (later)

- **Scoring accuracy — PHP, Elixir, Swift, and .NET test detection** (dogfood-hardened on
  real OSS repos: `Seldaek/monolog`, `elixir-ecto/ecto`, `Alamofire/Alamofire`,
  `JamesNK/Newtonsoft.Json`, regression-checked on `guzzle/guzzle`). **Test runnability**
  now recognizes four more ecosystems' standard runners and test layouts, with tests:
  - **PHP** — Composer's `test` script (`composer test`) or a `phpunit.xml[.dist]` config
    (`phpunit`, or `vendor/bin/phpunit` when vendored). monolog went 50% → 80%.
  - **Elixir** — any `mix.exs` project runs via `mix test`. ecto went 50% → 100%.
  - **Swift** — `swift test` for any `Package.swift`, plus the SwiftPM layout (capital-`T`
    `Tests/` dir and CamelCase `*Tests.swift` / `*TestCase.swift` files). Alamofire, which
    scored **0/100** ("no test files or command"), now scores 80%.
  - **.NET** — `dotnet test` for any `*.sln`/`*.csproj`/`*.fsproj`/`*.vbproj`, plus
    `*Tests.cs` test files under arbitrarily-named project dirs. Newtonsoft.Json went
    **0** → 80%. The CamelCase suffix match stays case-sensitive so lowercase
    `manifest.cs` / `latest.cs` aren't mistaken for tests.
- **Setup reproducibility** now treats Swift's `Package.swift` as a manifest and
  `Package.resolved` as its lockfile (additive — only credits repos that commit them).

### 2026-06-18

- **Scoring accuracy — JVM (Gradle/Maven) and Ruby ecosystems** (dogfood-hardened on real
  OSS repos: `junit-team/junit5`, `sinatra/sinatra`, `pallets/flask`, `sharkdp/bat`). Three
  genuine misgrade classes fixed, with tests:
  - **Test runnability** now recognizes JVM projects: tests under the standard
    `src/test/{java,kotlin,scala,groovy}/` source set and CamelCase test classes
    (`FooTest`, `BarTests`, `BazIT`, `QuxSpec`), plus the run commands `./gradlew test`,
    `gradle test`, and `mvn test`. Also adds Ruby (`bundle exec rake test` / `rake test`
    from a Rakefile, `bundle exec rspec` / `rspec`). Before this, junit5 — the canonical
    Java test framework — scored **0/100 on test runnability** ("no test files or command")
    and sinatra **50%** (no recognized command).
  - **Setup reproducibility** now treats Gradle/Maven build files (`build.gradle[.kts]`,
    `settings.gradle[.kts]`, `pom.xml`) as dependency manifests, and recognizes their
    lockfile-equivalent pins (Maven's inline versions, Gradle's committed wrapper +
    `libs.versions.toml` / `gradle.lockfile`). A Gradle repo is no longer mislabeled a
    "docs-only repo" nor penalized for having "no lockfile."
  - **CI configuration** now counts the Maven/Gradle lifecycle phases that run tests by
    default (`mvn install|package`, `gradle build`) as a test run.
- **SEO article — "Why your AI coding agent keeps making mistakes"**: added
  `docs/why-ai-coding-agents-make-mistakes.md`, a bottom-funnel troubleshooting guide that
  walks the common agent failures (ignores instructions, hallucinates APIs/paths, skips
  tests, works-locally-breaks-in-CI) back to the repo problems that cause them and maps each
  symptom onto the seven checks. Targets high-intent symptom searches and funnels to the
  one-command `npx` trial. Linked from the README Guides, the docs index, and both sibling
  guides. (Docs only; tests still green, self-audit unchanged.)

### 2026-06-17

- **SEO cornerstone — "AGENTS.md vs CLAUDE.md"**: added `docs/agents-md-vs-claude-md.md`,
  a long-form guide on writing the agent instructions file (which name to use across Claude
  Code / Copilot / the agents.md convention, what to put in it, a copy-paste example, and
  the stale/placeholder mistakes the linter catches). Targets a high-intent search cluster
  and maps to the highest-weighted check; linked from the README, the docs index, the
  cornerstone guide, and the comparison page. (Docs only; 59 tests still green, self-audit
  100/A.)
- **One-command trial via `npx github:`**: documented `npx github:Pilotless-Labs/agentready .`
  as the lead quick-start in the README and docs landing page. The package already exposes
  a `bin` with zero dependencies and no build step, so npx fetches and runs it straight from
  GitHub — no clone, no install, no npm publication required. Lowers trial friction to a
  single command. (Docs/packaging only; no code or scoring change — 59 tests still green.)

### 2026-06-16

- **`agentready comment` subcommand + Action PR comments**: renders the score as a
  GitHub-flavored Markdown table (`lib/comment.js`, pure/offline) and, via the Action's
  new `comment: 'true'` input, posts it on pull requests — one rolling comment, updated
  in place on each push, using the workflow's own `GITHUB_TOKEN` (agentready hosts nothing
  and stores no token; requires `permissions: pull-requests: write`). Network upsert lives
  in `lib/pr-comment.js` (Node 18+ global `fetch`, zero deps). 10 new tests (58 total).

### 2026-06-14

- **`agentready badge` subcommand**: emits the score as a self-contained flat SVG
  (no hosting, no third-party service) — `--write` saves `agentready-badge.svg` to
  embed in your README; `--json` emits a Shields.io endpoint payload. Color tracks the
  letter grade. 5 new tests (48 total).
- **GitHub Action** (`action.yml`): a zero-config composite action —
  `uses: Pilotless-Labs/agentready@v1` with `min-score` (CI gate) and `badge` (refresh
  the SVG) inputs. Makes agentready a one-line CI step and a Marketplace-discoverable
  surface.
- README now carries its own live badge (dogfooded); the badge and Action are **free**
  (moved out of the planned Pro tier — they are the product's growth surfaces).

### 2026-06-13

- **Real-world dogfood fixes** (from auditing express, flask, fastapi, rust log,
  golang/example, and execa):
  - README/CONTRIBUTING detection is case-insensitive and accepts
    `.md/.markdown/.rst/.txt` and bare names — express's `Readme.md` now counts
    (its audit went 45/F → 62/D). `fix` likewise no longer proposes a README stub
    next to an existing `Readme.md`.
  - CI test-run detection recognizes more real commands (`cargo hack test`,
    `cargo nextest run`, `npm run unit`, package-manager script variants, rspec,
    phpunit, jest, vitest, swift/deno test...), and a CI job literally named
    `test` with an unrecognized command earns 90% instead of 60%.
  - Documented-test-command detection now matches the runner + subcommand
    ("npm test"), not just the first word — a README that only says "npm install"
    (or mentions the word "go") no longer counts as documenting the test suite.
  6 new tests (43 total).

### 2026-06-12

- **Placeholder-aware scoring**: the agent-instructions and docs-structure checks
  now ignore unfilled TODO/FIXME/TBD lines and discount their share of the file —
  generated scaffolding (including our own `fix` stubs) can no longer score as
  readiness. A bare repo after `fix --write` now grades B, not A, with the unfilled
  lines named in the report. Mid-sentence prose mentions of "TODO" are not penalized.
  5 new tests (37 total).
- **`agentready fix` subcommand**: generates starter files for failed checks —
  AGENTS.md pre-filled with detected test/setup commands and layout, README and
  CONTRIBUTING skeletons, ecosystem-matched .gitignore, .nvmrc, and a CI workflow
  (only when guaranteed runnable). Dry run by default, `--write` to apply; only
  ever creates missing files, never modifies existing ones; undetectable facts are
  explicit TODOs. 7 new tests (32 total).
- README: "How is this different from…" section comparing agentready to AGENTS.md
  generators, agents.md, repolinter, and agent-session analytics.
- CONTRIBUTING.md: contributor guide (check-proposal shape, zero-dependency rule,
  check module pattern).

### 2026-06-11

- **Devcontainer quality** folded into the setup-reproducibility check: a present
  devcontainer.json must parse (JSONC ok), pin an image/build/compose, and install
  deps in a setup command. An unparseable devcontainer scores below having none.
- **Two new checks** (now 7 total): `ci-config` (CI exists and actually runs the
  tests) and `instructions-accuracy` (paths/commands referenced in
  CLAUDE.md/AGENTS.md actually resolve). Weights rebalanced to keep the total at 100.
- GitHub Actions CI for this repo itself, plus `.nvmrc` and issue templates.
- Scoring/report fixes from the first dogfood runs.
- **v0 built**: zero-dependency Node 18+ CLI with five checks (agent instructions,
  test runnability, setup reproducibility, docs structure, repo hygiene), weighted
  0–100 score with letter grade, a concrete fix per failed check, `--json` output,
  and `--min-score` CI gating. 15 unit tests.
