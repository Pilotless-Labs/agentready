import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContext, README_PATTERN } from '../lib/context.js';
import { agentInstructions } from '../lib/checks/agent-instructions.js';
import { testRunnability } from '../lib/checks/test-runnability.js';
import { setupReproducibility } from '../lib/checks/setup-reproducibility.js';
import { docsStructure } from '../lib/checks/docs-structure.js';
import { repoHygiene } from '../lib/checks/repo-hygiene.js';
import { ciConfig } from '../lib/checks/ci-config.js';
import { instructionsAccuracy } from '../lib/checks/instructions-accuracy.js';

function ctxFor(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentready-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return createContext(dir);
}

test('agent-instructions: missing file scores 0', () => {
  const r = agentInstructions.run(ctxFor({}));
  assert.equal(r.score, 0);
});

test('agent-instructions: near-empty file scores low with a flesh-out fix', () => {
  const r = agentInstructions.run(ctxFor({ 'CLAUDE.md': '# hi' }));
  assert.ok(r.score > 0 && r.score < 0.5);
  assert.match(r.fix, /Flesh out/);
});

test('agent-instructions: topic coverage raises the score', () => {
  const sparse = agentInstructions.run(ctxFor({
    'AGENTS.md': 'This repository holds widget code for the widget machine. Widgets are made of cogs and sprockets. The widget machine consumes widgets at a steady rate. More prose follows about widgets, none of it actionable for an agent working here.',
  }));
  const full = agentInstructions.run(ctxFor({
    'AGENTS.md': 'How to verify changes: run the suite with make test before pushing. Build everything with make, and use make setup for a fresh install. Directory structure: src/ holds the modules and docs/ the manual. Conventions: gofmt style, table-driven tests preferred everywhere.',
  }));
  assert.ok(full.score > sparse.score);
  assert.equal(full.fix, null);
});

test('agent-instructions: GEMINI.md / .cursorrules count as instruction files', () => {
  // A repo whose agent instructions live in GEMINI.md (Gemini CLI) or
  // .cursorrules (Cursor) — no CLAUDE.md/AGENTS.md — is just as agent-ready and
  // must not be graded as if it had none (real bite: google-gemini/gemini-cli
  // graded agent-instructions 0%, overall 63/D, on a complete 96-line GEMINI.md).
  const body =
    'How to verify changes: run the suite with make test before pushing. Build everything with make, and use make setup for a fresh install. Directory structure: src/ holds the modules and docs/ the manual. Conventions: gofmt style, table-driven tests preferred everywhere.';
  for (const file of ['GEMINI.md', '.cursorrules', '.windsurfrules']) {
    const r = agentInstructions.run(ctxFor({ [file]: body }));
    assert.equal(r.score, 1, `${file} should be a full-credit instructions file: ${r.details}`);
    assert.match(r.details, new RegExp(file.replace('.', '\\.')));
  }
});

test('agent-instructions: directory rule sets (.cursor/rules, .clinerules) count as instructions', () => {
  // Newer agents keep instructions in a *directory* of rule files: Cursor's
  // `.cursor/rules/*.mdc`, Cline's `.clinerules/`. A repo whose only agent
  // instructions live there used to be graded as having none — a 0 on the
  // heaviest check (real bites: micronaut-spring 51/F on a substantive
  // `.clinerules/`; HappydanceLabs/umbraco-mcp-server 36/F on 5.7k words of
  // `.cursor/rules/`).
  const body =
    'How to verify changes: run the suite with make test before pushing. Build everything with make, and use make setup for a fresh install. Directory structure: src/ holds the modules and docs/ the manual. Conventions: gofmt style, table-driven tests preferred everywhere.';
  const cursor = agentInstructions.run(ctxFor({ '.cursor/rules/main.mdc': `---\nalwaysApply: true\n---\n${body}` }));
  assert.equal(cursor.score, 1, `.cursor/rules should be full credit: ${cursor.details}`);
  assert.match(cursor.details, /\.cursor\/rules\/ \(1 rule file\)/);

  const cline = agentInstructions.run(ctxFor({ '.clinerules/coding.md': body, '.clinerules/docs.md': body }));
  assert.equal(cline.score, 1, `.clinerules/ dir should be full credit: ${cline.details}`);
  assert.match(cline.details, /\.clinerules\/ \(2 rule files\)/);
});

test('agent-instructions: .clinerules single-file form counts as instructions', () => {
  // Cline allows `.clinerules` as a file *or* a directory — resolve by shape.
  const body =
    'How to verify changes: run the suite with make test before pushing. Build everything with make, and use make setup for a fresh install. Directory structure: src/ holds the modules and docs/ the manual. Conventions: gofmt style, table-driven tests preferred everywhere.';
  const r = agentInstructions.run(ctxFor({ '.clinerules': body }));
  assert.equal(r.score, 1, `.clinerules file should be full credit: ${r.details}`);
  assert.match(r.details, /\.clinerules/);
});

test('instructions-accuracy: references inside a .cursor/rules rule file are verified', () => {
  const r = instructionsAccuracy.run(ctxFor({
    '.cursor/rules/build.mdc': '---\nglobs: "**/*.js"\n---\nRun `npm test`. Entry point is `src/main.js`.',
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'src/main.js': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /\.cursor\/rules/);
});

test('test-runnability: tests without a command is half credit', () => {
  const r = testRunnability.run(ctxFor({ 'tests/foo_test.py': 'def test_x(): pass' }));
  assert.equal(r.score, 0.5);
});

test('test-runnability: a bare root test.js counts as a test file (AVA convention)', () => {
  const r = testRunnability.run(ctxFor({
    'package.json': JSON.stringify({ scripts: { test: 'ava' } }),
    'test.js': 'import test from "ava"; test("x", t => t.pass());',
  }));
  assert.ok(r.score >= 0.8, 'root test.js + test command should pass, not be flagged "no test files"');
  assert.doesNotMatch(r.details, /no test files/);
});

test('test-runnability: documented npm test passes fully', () => {
  const r = testRunnability.run(ctxFor({
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'test/a.test.js': '',
    'README.md': 'Run `npm test` before pushing.',
  }));
  assert.equal(r.score, 1);
});

test('test-runnability: default npm placeholder script does not count', () => {
  const r = testRunnability.run(ctxFor({
    'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  }));
  assert.equal(r.score, 0);
});

test('test-runnability: a docs/content-only repo is softened, not hard-failed', () => {
  const r = testRunnability.run(ctxFor({ 'README.md': '# Guide', 'docs/usage.md': 'how to' }));
  assert.ok(r.score > 0 && r.score < 1, 'no-code repo should be neutral, not 0 or full');
  assert.match(r.details, /content-only|docs|no code/i);
});

test('test-runnability: a code repo with no tests still scores 0 (not softened)', () => {
  const r = testRunnability.run(ctxFor({ 'src/app.py': 'print(1)' }));
  assert.equal(r.score, 0);
});

test('test-runnability: Gradle/Java repo is recognized (src/test/java + wrapper)', () => {
  const r = testRunnability.run(ctxFor({
    'build.gradle.kts': 'plugins { java }',
    'settings.gradle.kts': 'rootProject.name = "x"',
    'gradlew': '#!/bin/sh\n',
    'src/main/java/com/x/App.java': 'class App {}',
    'src/test/java/com/x/AppTests.java': 'class AppTests {}',
  }));
  // Java tests under src/test/java + a Gradle wrapper command — not "0, no test files".
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /gradlew test/);
});

test('test-runnability: Maven repo runs via mvn test', () => {
  const r = testRunnability.run(ctxFor({
    'pom.xml': '<project></project>',
    'src/test/java/com/x/WidgetTest.java': 'class WidgetTest {}',
  }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /mvn test/);
});

test('test-runnability: a CamelCase JVM test class is detected without the standard layout', () => {
  const r = testRunnability.run(ctxFor({ 'app/FooSpec.groovy': 'class FooSpec {}' }));
  // Test file recognized (Spock spec) even though no command → half credit, not 0.
  assert.equal(r.score, 0.5);
});

test('test-runnability: Ruby Rakefile test task → bundle exec rake test', () => {
  const r = testRunnability.run(ctxFor({
    'Gemfile': 'source "https://rubygems.org"',
    'Rakefile': "require 'rake/testtask'\nRake::TestTask.new(:test)\ntask default: :test\n",
    'test/widget_test.rb': 'class WidgetTest; end',
    'README.md': 'Run `rake test` to run the suite.',
  }));
  assert.equal(r.score, 1, `expected fully documented, got ${r.score}: ${r.details}`);
  assert.match(r.details, /bundle exec rake test/);
});

test('test-runnability: Elixir mix project runs via mix test', () => {
  const r = testRunnability.run(ctxFor({
    'mix.exs': 'defmodule X.MixProject do\nend',
    'test/x_test.exs': 'defmodule XTest do\nend',
    'README.md': 'Run `mix test` to run the suite.',
  }));
  assert.equal(r.score, 1, `expected fully documented, got ${r.score}: ${r.details}`);
  assert.match(r.details, /mix test/);
});

test('test-runnability: Crystal shard project runs via crystal spec', () => {
  const r = testRunnability.run(ctxFor({
    'shard.yml': 'name: kemal\nversion: 1.0.0\n',
    'spec/kemal_spec.cr': 'require "./spec_helper"\n',
    'README.md': 'Run `crystal spec` to run the suite.',
  }));
  // Crystal specs live in `spec/*_spec.cr` (caught by the dir hint) but the
  // runner is `crystal spec` — missed before (was 0.5, "test files but no command").
  assert.equal(r.score, 1, `expected fully documented, got ${r.score}: ${r.details}`);
  assert.match(r.details, /crystal spec/);
});

test('test-runnability: a Crystal repo with an explicit make test target keeps it', () => {
  // `make test` is checked before the shard.yml branch, so a project that
  // exposes one (e.g. ameba) is described by its real entry point, not crystal spec.
  const r = testRunnability.run(ctxFor({
    'shard.yml': 'name: ameba\nversion: 1.6.0\n',
    'Makefile': 'test:\n\tcrystal spec\n',
    'spec/ameba_spec.cr': 'require "./spec_helper"\n',
  }));
  assert.match(r.details, /make test/);
  assert.doesNotMatch(r.details, /crystal spec/);
});

test('test-runnability: Julia package runs via Pkg.test()', () => {
  const r = testRunnability.run(ctxFor({
    'Project.toml': 'name = "Example"\nuuid = "7876af07-990d-54b4-ab0e-23690620f79a"\nversion = "0.5.5"\n',
    'src/Example.jl': 'module Example\nend\n',
    'test/runtests.jl': 'using Test\n',
    'README.md': "Run tests with `julia --project -e 'using Pkg; Pkg.test()'`.",
  }));
  // Julia tests live in test/runtests.jl (caught by the dir hint) but the runner
  // is Pkg.test() — missed before (was 0.5, "test files but no command").
  assert.equal(r.score, 1, `expected fully documented, got ${r.score}: ${r.details}`);
  assert.match(r.details, /Pkg\.test\(\)/);
});

test('test-runnability: a Julia Project.toml without test/runtests.jl is not claimed', () => {
  // Project.toml can describe a bare environment, not a package. Without the
  // canonical entry point there is nothing for Pkg.test() to run, so we must
  // not emit the command (which would otherwise misreport an empty env as 0.4).
  const r = testRunnability.run(ctxFor({
    'Project.toml': '[deps]\nExample = "7876af07-990d-54b4-ab0e-23690620f79a"\n',
  }));
  assert.equal(r.score, 0, `expected no-tests-no-command, got ${r.score}: ${r.details}`);
  assert.doesNotMatch(r.details, /Pkg\.test/);
});

test('test-runnability: Dart package runs via dart test', () => {
  const r = testRunnability.run(ctxFor({
    'pubspec.yaml': 'name: path\nenvironment:\n  sdk: ^3.4.0\ndev_dependencies:\n  test: ^1.16.6\n',
    'test/path_test.dart': "import 'package:test/test.dart';\nvoid main() {}",
    'README.md': 'Run `dart test` to run the suite.',
  }));
  // Dart tests are `*_test.dart`; the universal runner is `dart test` — both
  // missed before (was 0.5, "test files but no command").
  assert.equal(r.score, 1, `expected fully documented, got ${r.score}: ${r.details}`);
  assert.match(r.details, /dart test/);
});

test('test-runnability: Flutter package runs via flutter test, not dart test', () => {
  const r = testRunnability.run(ctxFor({
    'pubspec.yaml': 'name: my_app\ndependencies:\n  flutter:\n    sdk: flutter\n',
    'test/widget_test.dart': "import 'package:flutter_test/flutter_test.dart';\nvoid main() {}",
  }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /flutter test/);
  assert.doesNotMatch(r.details, /dart test/);
});

test('test-runnability: a flutter_bloc dependency does not flip dart test to flutter test', () => {
  // `flutter_bloc:` is a package dependency, not the Flutter SDK — a pure-Dart
  // package that depends on it still runs via `dart test`.
  const r = testRunnability.run(ctxFor({
    'pubspec.yaml': 'name: lib\nenvironment:\n  sdk: ^3.4.0\ndependencies:\n  flutter_bloc: ^8.0.0\n',
    'test/lib_test.dart': 'void main() {}',
  }));
  assert.match(r.details, /dart test/);
  assert.doesNotMatch(r.details, /flutter test/);
});

test('test-runnability: PHP Composer test script is recognized', () => {
  const r = testRunnability.run(ctxFor({
    'composer.json': JSON.stringify({ scripts: { test: '@php vendor/bin/phpunit' } }),
    'phpunit.xml.dist': '<phpunit></phpunit>',
    'tests/FooTest.php': '<?php class FooTest {}',
  }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /composer test/);
});

test('test-runnability: PHP PHPUnit config without a composer script → phpunit', () => {
  const r = testRunnability.run(ctxFor({
    'phpunit.xml.dist': '<phpunit></phpunit>',
    'tests/FooTest.php': '<?php class FooTest {}',
  }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /phpunit/);
});

test('test-runnability: Swift Package Manager repo runs via swift test', () => {
  const r = testRunnability.run(ctxFor({
    'Package.swift': '// swift-tools-version:5.9\nimport PackageDescription',
    'Tests/AppTests/AuthenticationTests.swift': 'final class AuthenticationTests {}',
  }));
  // Swift tests live under capital-T `Tests/` with CamelCase `*Tests.swift` —
  // neither matched the old lowercase/underscore heuristics (was 0).
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /swift test/);
});

test('test-runnability: .NET project runs via dotnet test', () => {
  const r = testRunnability.run(ctxFor({
    'Src/Lib/Lib.csproj': '<Project></Project>',
    'Src/Lib.Tests/Lib.Tests.csproj': '<Project></Project>',
    'Src/Lib.Tests/SerializationTests.cs': 'class SerializationTests {}',
  }));
  // .NET tests are `*Tests.cs` under an arbitrarily-named project dir, run via
  // the dotnet CLI — both missed before (was 0).
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /dotnet test/);
});

test('test-runnability: Haskell .cabal project runs via cabal test', () => {
  const r = testRunnability.run(ctxFor({
    'ShellCheck.cabal': 'name: ShellCheck\ntest-suite test-shellcheck\n  type: exitcode-stdio-1.0',
    'test/shellcheck.hs': 'main = return ()',
    'README.md': 'Run `cabal test` to run the suite.',
  }));
  // A `.cabal` file is the canonical Haskell manifest; tests under `test/` plus
  // a documented `cabal test` should be full credit (was 0.5 — no command).
  assert.equal(r.score, 1, `expected 1, got ${r.score}: ${r.details}`);
  assert.match(r.details, /cabal test/);
});

test('test-runnability: Stack-only Haskell project runs via stack test', () => {
  const r = testRunnability.run(ctxFor({
    'stack.yaml': 'resolver: lts-21.0',
    'test/Spec.hs': 'main = return ()',
  }));
  // No `.cabal` in the tree (hpack/stack-only) → fall back to `stack test`.
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /stack test/);
});

test('test-runnability: Scala sbt project runs via sbt test', () => {
  const r = testRunnability.run(ctxFor({
    'build.sbt': 'name := "zio"',
    'core/src/test/scala/zio/CoreSpec.scala': 'class CoreSpec {}',
    'CONTRIBUTING.md': 'Run `sbt test` before opening a PR.',
  }));
  // Scala tests live under `src/test/scala/`; `sbt test` is the runner — was
  // 0.5 (files found via the JVM path hint, but no command).
  assert.equal(r.score, 1, `expected 1, got ${r.score}: ${r.details}`);
  assert.match(r.details, /sbt test/);
});

test('test-runnability: Zig project runs via zig build test', () => {
  const r = testRunnability.run(ctxFor({
    'build.zig': 'const test_step = b.step("test", "Run all the tests");',
    'test/behavior.zig': 'test "ok" {}',
    'doc/example/test_alloc.zig': 'test "alloc" {}',
  }));
  // Zig tests run via the `test` step in build.zig; test files are `*_test.zig`
  // / `test_*.zig` and the root `test/` dir — none matched before (was 0).
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.match(r.details, /zig build test/);
});

test('test-runnability: a lowercase "manifest.cs" is not mistaken for a test', () => {
  // The CamelCase suffix match is case-sensitive: "manifest"/"latest" must not
  // trip the `Test.cs` needle.
  const r = testRunnability.run(ctxFor({ 'src/manifest.cs': 'class Manifest {}' }));
  assert.equal(r.score, 0, `expected 0 (no tests, no command), got ${r.score}: ${r.details}`);
});

test('setup-reproducibility: Swift Package.swift + Package.resolved is reproducible', () => {
  const r = setupReproducibility.run(ctxFor({
    'Package.swift': '// swift-tools-version:5.9',
    'Package.resolved': '{ "pins": [] }',
  }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.doesNotMatch(r.details, /docs-only/);
  assert.doesNotMatch(r.details, /no lockfile/);
});

test('setup-reproducibility: manifest without lockfile is flagged', () => {
  const r = setupReproducibility.run(ctxFor({ 'package.json': '{}' }));
  assert.equal(r.score, 0.3);
  assert.match(r.fix, /lockfile/);
});

test('setup-reproducibility: a code repo with no root manifest is not labeled "docs-only"', () => {
  // A Makefile-driven / subdir-manifest project (e.g. dough itself: .js source,
  // tests via `make test`, no root package.json) has code — so the message must
  // not contradict test-runnability/ci-config by guessing "docs-only repo?".
  const r = setupReproducibility.run(ctxFor({
    'Makefile': "test:\n\tnode --test\n",
    'lib/app.js': 'export const x = 1;',
    'README.md': '# Tool',
  }));
  assert.equal(r.score, 0.7, `expected neutral 0.7, got ${r.score}: ${r.details}`);
  assert.doesNotMatch(r.details, /docs-only/);
  assert.match(r.details, /root/);
});

test('setup-reproducibility: a genuine docs-only repo keeps the "docs-only repo?" message', () => {
  const r = setupReproducibility.run(ctxFor({ 'README.md': '# Guide', 'docs/usage.md': 'how to' }));
  assert.equal(r.score, 0.7);
  assert.match(r.details, /docs-only/);
});

test('setup-reproducibility: a Ruby gem (gemspec) is not penalized for omitting Gemfile.lock', () => {
  // Gems conventionally gitignore Gemfile.lock — their deps resolve in the
  // consuming app — so the lockless state is correct, not a 0.3 misgrade.
  const r = setupReproducibility.run(ctxFor({
    'sinatra.gemspec': 'Gem::Specification.new {}',
    'Gemfile': "source 'https://rubygems.org'\ngemspec",
  }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.doesNotMatch(r.details, /no lockfile/);
  assert.doesNotMatch(r.details, /docs-only/);
});

test('setup-reproducibility: a gemspec plus an env pin earns full credit', () => {
  const r = setupReproducibility.run(ctxFor({
    'foo.gemspec': 'Gem::Specification.new {}',
    'Gemfile': "source 'https://rubygems.org'\ngemspec",
    '.ruby-version': '3.3.0',
  }));
  assert.equal(r.score, 1);
});

test('setup-reproducibility: a Ruby app (Gemfile, no gemspec) still needs a lockfile', () => {
  // The gemspec is what marks a *library*; a deployable app with no lockfile
  // must stay in the 0.3 band — the gem exemption must not become a free pass.
  const r = setupReproducibility.run(ctxFor({ 'Gemfile': "source 'https://rubygems.org'" }));
  assert.equal(r.score, 0.3);
  assert.match(r.fix, /lockfile/);
});

test('setup-reproducibility: a Gradle repo is not mistaken for "docs-only" and gets pin credit', () => {
  const r = setupReproducibility.run(ctxFor({
    'build.gradle.kts': 'plugins { java }',
    'settings.gradle.kts': 'rootProject.name = "x"',
    'gradle/libs.versions.toml': '[versions]\njunit = "5.11.0"',
    'gradle/wrapper/gradle-wrapper.properties': 'distributionUrl=gradle-8.10-bin.zip',
  }));
  // Gradle build file = a real manifest; wrapper + version catalog = the pin.
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.doesNotMatch(r.details, /docs-only/);
  assert.doesNotMatch(r.details, /no lockfile/);
});

test('setup-reproducibility: Maven pom.xml pins versions inline, not "no lockfile"', () => {
  const r = setupReproducibility.run(ctxFor({ 'pom.xml': '<project></project>' }));
  assert.ok(r.score >= 0.8, `expected >=0.8, got ${r.score}: ${r.details}`);
  assert.doesNotMatch(r.details, /no lockfile/);
});

test('setup-reproducibility: lockfile plus env pin is full credit', () => {
  const r = setupReproducibility.run(ctxFor({
    'package.json': '{}',
    'package-lock.json': '{}',
    '.nvmrc': '22',
  }));
  assert.equal(r.score, 1);
});

test('setup-reproducibility: complete devcontainer earns full credit', () => {
  const r = setupReproducibility.run(ctxFor({
    'package.json': '{}',
    'package-lock.json': '{}',
    // JSONC: comments and a trailing comma must not break parsing
    '.devcontainer/devcontainer.json': '{\n  // pin the runtime\n  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",\n  /* install deps */\n  "postCreateCommand": "npm ci",\n}',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /image \+ setup command/);
});

test('setup-reproducibility: devcontainer missing pin and setup command is flagged', () => {
  const r = setupReproducibility.run(ctxFor({
    'package.json': '{}',
    'package-lock.json': '{}',
    '.devcontainer/devcontainer.json': '{ "customizations": {} }',
  }));
  assert.equal(r.score, 0.9);
  assert.match(r.details, /pins no image/);
  assert.match(r.details, /no setup command/);
  assert.match(r.fix, /postCreateCommand/);
});

test('setup-reproducibility: unparseable devcontainer scores below no pin at all', () => {
  const broken = setupReproducibility.run(ctxFor({
    'package.json': '{}',
    'package-lock.json': '{}',
    '.devcontainer.json': '{ "image": ',
  }));
  const noPin = setupReproducibility.run(ctxFor({
    'package.json': '{}',
    'package-lock.json': '{}',
  }));
  assert.ok(broken.score < noPin.score, `broken ${broken.score} vs none ${noPin.score}`);
  assert.match(broken.fix, /not valid JSON/);
});

test('docs-structure: README with install, usage, and code blocks scores high', () => {
  const r = docsStructure.run(ctxFor({
    'README.md': '# x\n\nA small library that does one thing well: it turns raw widget data into tidy reports that humans and machines can both read without extra tooling.\n\n## Install\n\n```\nnpm i x\n```\n\n## Usage\n\n```js\nimport { x } from "x";\nconsole.log(x());\n```\n\n## Contributing\nPRs welcome — run the tests first.\n',
  }));
  assert.ok(r.score >= 0.9, `got ${r.score}`);
});

test('repo-hygiene: clean repo passes, unignored artifact dirs are flagged', () => {
  const clean = repoHygiene.run(ctxFor({ '.gitignore': 'node_modules/\ndist/' }));
  assert.equal(clean.score, 1);

  const dirty = repoHygiene.run(ctxFor({ 'dist/bundle.js': 'x' }));
  assert.ok(dirty.score < 1);
  assert.match(dirty.details, /no \.gitignore/);
  assert.match(dirty.details, /artifact directories not gitignored \(dist\)/);

  const ignoredInstall = repoHygiene.run(ctxFor({
    '.gitignore': 'node_modules/',
    'node_modules/pkg/index.js': 'x',
  }));
  assert.equal(ignoredInstall.score, 1, 'gitignored node_modules must not be flagged');

  // The "keep the dir, ignore its contents" pattern: a build/ whose only
  // tracked file is its own .gitignore must not be flagged as a stray artifact.
  const selfIgnoredDir = repoHygiene.run(ctxFor({
    '.gitignore': 'node_modules/',
    'build/.gitignore': '*\n!.gitignore\n',
  }));
  assert.equal(selfIgnoredDir.score, 1, 'a build/ that self-ignores its contents must not be flagged');
});

test('repo-hygiene: a build/ of hand-written source is not a committed artifact (#45)', () => {
  // bat (Rust) commits `build/*.rs` build-script modules — its real output is
  // target/. Such a dir holds authored source, so it must NOT be flagged.
  const sourceBuild = repoHygiene.run(ctxFor({
    '.gitignore': 'target/\n',
    'Cargo.toml': '[package]\nname = "x"\n',
    'build/application.rs': 'pub fn build() {}',
    'build/util.rs': 'pub fn util() {}',
  }));
  assert.equal(sourceBuild.score, 1, "bat-style build/ of .rs source must not be flagged as an artifact dir");

  // The discriminator must NOT weaken real artifact detection: a build/ of
  // content-hashed JS bundles (Create-React-App output) is still committed
  // output and stays flagged.
  const hashedOutput = repoHygiene.run(ctxFor({
    'package.json': '{}',
    'build/static/js/main.9f2a1c3e.js': 'x',
    'build/asset-manifest.json': '{}',
  }));
  assert.match(hashedOutput.details, /artifact directories not gitignored \(build\)/,
    'a build/ of hashed JS bundles is real output and must stay flagged');

  // A plain compiled dist/index.js (no markers, .js is not an exempt source
  // extension) must also stay flagged — the common library-output case.
  const distJs = repoHygiene.run(ctxFor({ 'package.json': '{}', 'dist/index.js': 'module.exports = {}' }));
  assert.match(distJs.details, /artifact directories not gitignored \(dist\)/,
    'a dist/ of compiled .js must stay flagged');
});

test('ci-config: a code repo with no CI config scores 0 with a fix', () => {
  const r = ciConfig.run(ctxFor({ 'package.json': '{}', 'index.js': 'export const x = 1;' }));
  assert.equal(r.score, 0);
  assert.match(r.fix, /CI workflow/);
});

test('ci-config: a docs/content-only repo is softened, not hard-failed', () => {
  const r = ciConfig.run(ctxFor({ 'README.md': '# Guide', 'docs/setup.md': 'steps' }));
  assert.ok(r.score > 0 && r.score < 1, 'no-code repo should be neutral, not 0 or full');
  assert.match(r.details, /content-only|docs/i);
});

test('ci-config: workflow without a test run gets partial credit', () => {
  const r = ciConfig.run(ctxFor({
    '.github/workflows/lint.yml': 'jobs:\n  lint:\n    steps:\n      - run: npx eslint .\n',
  }));
  assert.equal(r.score, 0.6);
  assert.match(r.fix, /run the test suite/);
});

test('ci-config: workflow that runs tests passes fully', () => {
  const r = ciConfig.run(ctxFor({
    '.github/workflows/ci.yml': 'jobs:\n  test:\n    steps:\n      - run: npm test\n',
  }));
  assert.equal(r.score, 1);
  assert.match(r.details, /ci\.yml/);

  const gitlab = ciConfig.run(ctxFor({ '.gitlab-ci.yml': 'test:\n  script: cargo test\n' }));
  assert.equal(gitlab.score, 1);
});

test('ci-config: gradle build and mvn install count as running the tests', () => {
  const gradle = ciConfig.run(ctxFor({
    '.github/workflows/ci.yml': 'jobs:\n  build:\n    steps:\n      - run: ./gradlew build\n',
  }));
  assert.equal(gradle.score, 1, `gradle build runs the test task: ${gradle.details}`);

  const maven = ciConfig.run(ctxFor({
    '.github/workflows/ci.yml': 'jobs:\n  build:\n    steps:\n      - run: mvn -B install\n',
  }));
  assert.equal(maven.score, 1, `mvn install runs the test phase: ${maven.details}`);
});

test('ci-config: nox sessions count as running the tests, citing the primary file (alembic)', () => {
  const r = ciConfig.run(ctxFor({
    '.github/workflows/run-on-pr.yaml': 'jobs:\n  run-test:\n    steps:\n      - name: Run tests\n        run: nox -t py-sqla20\n',
    '.github/workflows/run-test.yaml': 'jobs:\n  run-test:\n    steps:\n      - name: Run tests\n        run: nox -t py-sqla20\n',
  }));
  assert.equal(r.score, 1, `nox runs the suite: ${r.details}`);
  // both files match; the citation prefers the primary `run-test.yaml`, not `run-on-pr.yaml`.
  assert.match(r.details, /run-test\.yaml/);
});

test('instructions-accuracy: missing instructions file cannot be verified', () => {
  const r = instructionsAccuracy.run(ctxFor({}));
  assert.equal(r.score, 0.5);
  assert.ok(r.fix);
});

test('instructions-accuracy: resolving paths, make targets, and npm scripts pass', () => {
  const r = instructionsAccuracy.run(ctxFor({
    'CLAUDE.md': 'Run `npm test` or `make check`. Code lives in `src/lib/`, docs in `docs/guide.md`. Logs go to `logs/` (pattern `logs/<date>-*.md`, run `cd tools && npm test` there).',
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'Makefile': 'check:\n\tnpm test\n',
    'src/lib/a.js': 'x',
    'docs/guide.md': 'x',
    'logs/run.md': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /5 path\/command references/);
});

test('instructions-accuracy: git refs are not mistaken for repo paths', () => {
  const r = instructionsAccuracy.run(ctxFor({
    'CLAUDE.md': 'Rebase onto `origin/master` (or `upstream/main`) before pushing `src/app.js`.',
    'src/app.js': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /all 1 path\/command references/);
});

test('instructions-accuracy: stale references drag the score down and are named', () => {
  const r = instructionsAccuracy.run(ctxFor({
    'AGENTS.md': 'Tests: `npm run ci`. Entry point is `src/main.js`; helpers in `lib/utils.js`.',
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'lib/utils.js': 'x',
  }));
  assert.ok(r.score < 1 && r.score > 0, `got ${r.score}`);
  assert.match(r.details, /stale references/);
  assert.match(r.details, /npm run ci/);
  assert.match(r.details, /src\/main\.js/);
  assert.match(r.fix, /match the repo/);
});

test('instructions-accuracy: ellipsis wildcards are not treated as literal paths', () => {
  // `it/...` ("integration tests at `it/...`", real uv AGENTS.md) and Go's
  // package wildcard `cmd/...` are illustrative patterns, not path claims —
  // they must not be graded as stale references.
  const r = instructionsAccuracy.run(ctxFor({
    'AGENTS.md': 'PREFER integration tests, e.g. at `it/...` over unit tests. Lint with `go vet ./...`; sources in `cmd/...`.',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /no verifiable path\/command references/);
});

test('instructions-accuracy: gitignored generated/dep dirs are not stale references', () => {
  // `dist/` and `node_modules/` (real astro AGENTS.md) are generated/installed
  // dirs the repo gitignores — absent in a fresh checkout by design, so naming
  // where build output and deps live is a correct claim, not a stale one.
  const r = instructionsAccuracy.run(ctxFor({
    'AGENTS.md': 'Build output lands in `dist/`; deps install to `node_modules/`. Source is in `src/lib/`.',
    '.gitignore': 'node_modules/\ndist/\n*.log\n',
    'src/lib/a.js': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /resolve|no verifiable/);
  // A non-gitignored missing path is still caught.
  const stale = instructionsAccuracy.run(ctxFor({
    'AGENTS.md': 'Build output in `dist/`; entry point `src/gone.js`.',
    '.gitignore': 'dist/\n',
  }));
  assert.ok(stale.score < 1, `got ${stale.score}`);
  assert.match(stale.details, /src\/gone\.js/);
  assert.doesNotMatch(stale.details, /dist/);
});

test('instructions-accuracy: scoped npm package names are not stale paths', () => {
  // `@ai-sdk/provider` / `@vitejs/plugin-legacy` / `@biomejs/biome` (real
  // vercel/ai, vitejs/vite, biomejs/biome instruction files) are published
  // package names, not working-tree paths — naming a dependency you publish or
  // depend on is a correct claim, not a stale reference.
  const r = instructionsAccuracy.run(ctxFor({
    'AGENTS.md': 'This monorepo publishes `@ai-sdk/provider` and `@ai-sdk/openai`; the core lives in `src/index.ts`.',
    'src/index.ts': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /resolve|no verifiable/);
  // A real missing path is still caught, and a subpath form (`@scope/n/sub`,
  // two slashes) is left to the normal path check (here it resolves).
  const stale = instructionsAccuracy.run(ctxFor({
    'AGENTS.md': 'Depends on `@scope/pkg`; config in `@scope/pkg/config.json`; entry `src/gone.ts`.',
    '@scope/pkg/config.json': 'x',
  }));
  assert.ok(stale.score < 1, `got ${stale.score}`);
  assert.match(stale.details, /src\/gone\.ts/);
  assert.doesNotMatch(stale.details, /@scope\/pkg`/);
});

test('instructions-accuracy: convention-root dirs (placeholder-subpath sibling) are not stale', () => {
  // A template/monorepo documents `product/` as where code *will* live and also
  // cites the placeholder child `product/<bet>/` (real: dough's studio template
  // CLAUDE.md). The bare `product/` is correctly absent in a fresh checkout — a
  // convention root populated on demand, not a stale path — so the `<...>` child
  // exempts it. Same shape for `packages/<name>/`, `services/{svc}/`.
  const r = instructionsAccuracy.run(ctxFor({
    'CLAUDE.md': "Each venture's code lives under `product/<bet>/`; `product/` is created when there is one. Core is `src/index.js`.",
    'src/index.js': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /resolve|no verifiable/);
  // A real missing path with no placeholder sibling is still caught, and only the
  // exact prefix is exempted — a different missing dir is not.
  const stale = instructionsAccuracy.run(ctxFor({
    'CLAUDE.md': 'Packages live in `packages/<name>/`; legacy build was in `vendor/old/`.',
  }));
  assert.ok(stale.score < 1, `got ${stale.score}`);
  assert.match(stale.details, /vendor\/old/);
  assert.doesNotMatch(stale.details, /packages/);
});

test('instructions-accuracy: references in a GEMINI.md are verified too', () => {
  const r = instructionsAccuracy.run(ctxFor({
    'GEMINI.md': 'Run `npm test`. Entry point is `src/main.js`.',
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'src/main.js': 'x',
  }));
  assert.equal(r.score, 1, `${r.details}`);
  assert.match(r.details, /GEMINI\.md/);
});

test('agent-instructions: unfilled TODO placeholders are discounted', () => {
  const stub = [
    '# Agent instructions',
    'Detected commands below are real; the placeholders still need a human.',
    '## Project',
    '`widget` — TODO: one sentence on what this project does.',
    '## Setup',
    'Install dependencies with the lockfile-aware command shown here:',
    '```', 'npm ci', '```',
    '## Tests',
    'Run the whole suite before pushing any change:',
    '```', 'npm test', '```',
    '## Project structure',
    '- `lib/` — TODO: what lives here',
    '- `test/` — TODO: what lives here',
    '## Conventions',
    'TODO: code style, naming, patterns to follow.',
  ].join('\n');
  const filled = stub
    .replaceAll('TODO: what lives here', 'modules and their tests live here')
    .replace('TODO: one sentence on what this project does.', 'a widget-rendering library.')
    .replace('TODO: code style, naming, patterns to follow.', 'ESM, no default exports, prettier style.');

  const stubbed = agentInstructions.run(ctxFor({ 'AGENTS.md': stub }));
  const real = agentInstructions.run(ctxFor({ 'AGENTS.md': filled }));
  assert.ok(stubbed.score < real.score, `stub ${stubbed.score} should score below filled ${real.score}`);
  assert.ok(stubbed.score <= 0.8, `got ${stubbed.score}`);
  assert.match(stubbed.details, /unfilled placeholder/);
  assert.match(stubbed.fix, /Fill in the \d+ TODO/);
  assert.equal(real.fix, null);
});

test('agent-instructions: a topic claimed only by a TODO line is not covered', () => {
  const r = agentInstructions.run(ctxFor({
    'CLAUDE.md': [
      'Run the suite with `npm test` before pushing any change to this repository.',
      'Build with `npm run build` and install dependencies with npm ci as usual.',
      'Directory layout: lib/ holds the modules, test/ holds the node:test suites.',
      'TODO: conventions and style guide.',
    ].join('\n'),
  }));
  assert.match(r.fix, /conventions\/style/);
});

test('docs-structure: a TODO-stub README cannot score like a real one', () => {
  const stub = [
    '# widget', '',
    'TODO: one paragraph — what this project is and why someone would use it.', '',
    '## Install', '',
    '```', 'TODO: installation command', '```', '',
    '## Usage', '',
    '```', 'TODO: minimal working example', '```', '',
    '## Contributing', '',
    'TODO: how to file issues and propose changes.',
  ].join('\n');
  const r = docsStructure.run(ctxFor({ 'README.md': stub }));
  // With the TODO lines ignored, the stub is a nearly-empty skeleton.
  assert.ok(r.score <= 0.55, `got ${r.score}`);

  // Same skeleton, filled in, scores high.
  const filledContent = stub
    .replace('TODO: one paragraph — what this project is and why someone would use it.',
      'A widget library that renders widgets of every shape and size, with zero dependencies, a stable documented API, and first-class support for composing widgets together.')
    .replace('TODO: installation command', 'npm install widget')
    .replace('TODO: minimal working example', 'import { w } from "widget"; w();')
    .replace('TODO: how to file issues and propose changes.', 'PRs welcome — run npm test first and keep the changes small.');
  const filled = docsStructure.run(ctxFor({ 'README.md': filledContent }));
  assert.ok(filled.score >= 0.9, `got ${filled.score}`);
  assert.ok(r.score < filled.score);

  // Half-filled: enough real content to leave the nearly-empty branch, but
  // the remaining TODOs are named and discounted.
  const half = docsStructure.run(ctxFor({
    'README.md': filledContent
      .replace('npm install widget', 'TODO: installation command')
      .replace('PRs welcome — run npm test first and keep the changes small.', 'TODO: how to file issues and propose changes.'),
  }));
  assert.ok(half.score > r.score && half.score < filled.score, `got ${half.score}`);
  assert.match(half.details, /unfilled placeholder/);
  assert.match(half.fix, /Fill in the \d+ TODO/);
});

test('placeholders: mid-sentence prose mentions of TODO are not penalized', () => {
  const r = docsStructure.run(ctxFor({
    'README.md': [
      '# stubgen',
      'A generator whose output marks everything it cannot detect as a TODO so',
      'users always know what still needs filling in across their repositories.',
      '## Install', '```', 'npm install stubgen', '```',
      '## Usage', '```', 'stubgen --write', '```',
      '## Contributing', 'PRs welcome.',
    ].join('\n'),
  }));
  assert.equal(r.score, 1, `${r.details}`);
});

// --- Real-world layouts (from the 2026-06-13 OSS dogfood run: express, execa, rust log) ---

test('docs-structure: README detection is case-insensitive (express uses Readme.md)', () => {
  const content = '# x\n\nA small library that does one thing well: it turns raw widget data into tidy reports that humans and machines can both read without extra tooling.\n\n## Install\n\n```\nnpm i x\n```\n\n## Usage\n\n```js\nimport { x } from "x";\n```\n\n## Contributing\nPRs welcome.\n';
  const lower = docsStructure.run(ctxFor({ 'README.md': content }));
  const mixed = docsStructure.run(ctxFor({ 'Readme.md': content }));
  assert.equal(mixed.score, lower.score, `Readme.md ${mixed.score} vs README.md ${lower.score}`);
  assert.ok(mixed.score >= 0.9);
});

test('docs-structure: CONTRIBUTING detection accepts other casings and .rst', () => {
  const base = '# x\n\nA library that exists to demonstrate things in tests and has enough words in this opening paragraph to clear the minimum-substance bar for a README file.\n\n## Install\n\n```\nnpm i x\n```\n\n## Usage\n\n```js\nx();\n```\n';
  const withFile = docsStructure.run(ctxFor({ 'README.md': base, 'Contributing.rst': 'How to contribute' }));
  const without = docsStructure.run(ctxFor({ 'README.md': base }));
  assert.ok(withFile.score > without.score, `${withFile.score} vs ${without.score}`);
});

test('docs-structure: an "Installation"/"Set up" header counts as install instructions', () => {
  // "Installation" and "Set up" are the most common section headers but the bare
  // `\binstall\b`/`\bsetup\b` stems miss both; without the install signal this
  // README (which has usage + code blocks) would read as 2/3.
  const base = '# widget\n\nA library that exists to demonstrate things in tests and has enough words in this opening paragraph to clear the minimum-substance bar for the README file.\n\n## Usage\n\n```js\nwidget();\n```\n';
  const installation = docsStructure.run(ctxFor({ 'README.md': `${base}\n## Installation\n\nDownload the binary from the releases page and add it to your PATH.\n` }));
  assert.match(installation.details, /3\/3 core elements/, `"Installation" header must count: ${installation.details}`);
  assert.ok(installation.score >= 0.9, `got ${installation.score}`);
  const setUp = docsStructure.run(ctxFor({ 'README.md': `${base}\n## Set up\n\nDownload the binary from the releases page and add it to your PATH.\n` }));
  assert.match(setUp.details, /3\/3 core elements/, `"Set up" header must count: ${setUp.details}`);
});

test('docs-structure: a Go `go get` line counts as install instructions (httprouter)', () => {
  // julienschmidt/httprouter documents setup only as `go get github.com/...`
  // under "Usage" — no literal "install" word — and was misgraded 2/3 before.
  const readme = '# httprouter\n\nA high performance HTTP request router that scales well and exists here with enough descriptive words to clear the README minimum-substance bar comfortably.\n\n## Usage\n\nTo use it in your project, first fetch the package:\n\n```\ngo get github.com/julienschmidt/httprouter\n```\n';
  // Sanity: no literal "install"/"setup" stem anywhere — only `go get` carries it.
  assert.ok(!/\b(install|setup)\b/i.test(readme), 'fixture must rely solely on `go get`');
  const r = docsStructure.run(ctxFor({ 'README.md': readme }));
  assert.match(r.details, /3\/3 core elements/, `\`go get\` must count as install instructions: ${r.details}`);
});

test('docs-structure: a Rust `[dependencies]` block / `cargo add` counts as install instructions (tokio/serde/clap)', () => {
  // Rust *libraries* document setup as "add this to your Cargo.toml" — a
  // `[dependencies]` block — or `cargo add <crate>`, with no literal "install"
  // word (you depend on a crate, you don't install it). tokio, serde, rayon and
  // clap all do exactly this and were misgraded 2/3 before (the Rust analog of
  // the `go get` gap above).
  const depsBlock = '# tokio\n\nAn event-driven, non-blocking I/O platform for writing asynchronous applications, described here with plenty of descriptive words to clear the README minimum-substance bar.\n\nAdd this to your `Cargo.toml`:\n\n```toml\n[dependencies]\ntokio = { version = "1", features = ["full"] }\n```\n\n## Usage\n\n```rust\nfn main() {}\n```\n';
  // Sanity: no literal "install"/"setup" stem — only the `[dependencies]` block carries it.
  assert.ok(!/\b(install|setup)\b/i.test(depsBlock), 'fixture must rely solely on the [dependencies] block');
  const rDeps = docsStructure.run(ctxFor({ 'README.md': depsBlock }));
  assert.match(rDeps.details, /3\/3 core elements/, `[dependencies] block must count as install: ${rDeps.details}`);

  const cargoAdd = '# clap\n\nA simple to use, efficient, and full-featured command line argument parser, described with enough words here to comfortably clear the minimum-substance bar for a README.\n\n```\n$ cargo add clap\n```\n\n## Usage\n\n```rust\nfn main() {}\n```\n';
  assert.ok(!/\b(install|setup)\b/i.test(cargoAdd), 'fixture must rely solely on `cargo add`');
  const rAdd = docsStructure.run(ctxFor({ 'README.md': cargoAdd }));
  assert.match(rAdd.details, /3\/3 core elements/, `\`cargo add\` must count as install: ${rAdd.details}`);
});

test('context: huge monorepos still surface root files and top-level dirs (BFS, #50)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentready-big-'));
  // A README + manifest at root, a real test under a top-level test/ dir, and an
  // early-sorted giant subdir whose deep files would exhaust the 5000-file cap.
  fs.writeFileSync(path.join(dir, 'README.md'), '# x\n\nRun `sbt test`.\n');
  fs.writeFileSync(path.join(dir, 'build.sbt'), 'name := "x"\n');
  fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'test', 'FooTest.scala'), 'class FooTest {}\n');
  // 'a_big' sorts before 'test'; a depth-first walk dives in and never reaches
  // the sibling test/ dir. Nest the files so breadth-first keeps them deepest.
  for (let d = 1; d <= 6; d++) {
    const deep = path.join(dir, 'a_big', `l${d}`);
    fs.mkdirSync(deep, { recursive: true });
    for (let i = 0; i < 1000; i++) fs.writeFileSync(path.join(deep, `f${i}.txt`), '');
  }
  const ctx = createContext(dir);
  const files = ctx.files();
  assert.ok(files.length <= 5000, `cap respected (${files.length})`);
  assert.equal(ctx.findRootFile(README_PATTERN), 'README.md');
  assert.ok(files.includes('build.sbt'), 'root manifest must survive the cap');
  assert.ok(files.some((f) => /^tests?\//.test(f)), 'top-level test/ dir must survive the cap');
});

test('ci-config: cargo hack test and npm run unit count as test runs', () => {
  const cargoHack = ciConfig.run(ctxFor({
    '.github/workflows/main.yml': 'jobs:\n  build:\n    steps:\n      - run: cargo hack test --feature-powerset\n',
  }));
  assert.equal(cargoHack.score, 1, cargoHack.details);

  const npmUnit = ciConfig.run(ctxFor({
    '.github/workflows/main.yml': 'jobs:\n  build:\n    steps:\n      - run: npm run unit\n',
  }));
  assert.equal(npmUnit.score, 1, npmUnit.details);
});

test('ci-config: a job named test with an unrecognized command beats lint-only CI', () => {
  const testJob = ciConfig.run(ctxFor({
    '.github/workflows/ci.yml': 'jobs:\n  test:\n    steps:\n      - uses: ./.github/actions/run-suite\n',
  }));
  assert.equal(testJob.score, 0.9, testJob.details);
  assert.match(testJob.details, /named "test"/);

  const lintOnly = ciConfig.run(ctxFor({
    '.github/workflows/lint.yml': 'jobs:\n  lint:\n    steps:\n      - run: npx eslint .\n',
  }));
  assert.equal(lintOnly.score, 0.6);
});

test('ci-config: a workflow named "Testing" running a default task counts (sinatra)', () => {
  // Real misgrade: sinatra's test.yml is `name: Testing`, on push/PR, running
  // the suite via bare `bundle exec rake` (Ruby's default task = tests). The
  // command isn't in TEST_RUN_HINTS, so this must land in the 0.9 "named test"
  // band — not the 0.6 "no test run detected" band — and pick test.yml, not the
  // release-only workflow that ships alongside it.
  const r = ciConfig.run(ctxFor({
    '.github/workflows/release.yml': 'name: Release\njobs:\n  release:\n    steps:\n      - run: bundle exec rake release\n',
    '.github/workflows/test.yml': 'name: Testing\non:\n  push:\njobs:\n  rack-protection:\n    steps:\n      - run: bundle exec rake\n',
  }));
  assert.equal(r.score, 0.9, r.details);
  assert.match(r.details, /test\.yml/);

  // Guard: a repo with only a release workflow (no testing-named workflow, no
  // recognized test command) still gets the 0.6 partial credit, not 0.9.
  const releaseOnly = ciConfig.run(ctxFor({
    '.github/workflows/release.yml': 'name: Release\njobs:\n  release:\n    steps:\n      - run: bundle exec rake release\n',
  }));
  assert.equal(releaseOnly.score, 0.6, releaseOnly.details);
});

test('ci-config: a "Test PyPI" publish job does not shadow the real Tests workflow (requests)', () => {
  // Real misgrade (psf/requests): the suite runs in run-tests.yml (`name: Tests`,
  // step "Run tests" -> `make ci`, an unrecognized command, so the 0.9 band). The
  // publish workflow has a `test-pypi-only:` workflow_dispatch input (Test PyPI
  // trusted-publishing — near-universal in Python releases), which the test-job
  // heuristic wrongly read as a test job. publish.yml sorts before run-tests.yml,
  // so it shadowed the real test workflow and got cited as the test config.
  const r = ciConfig.run(ctxFor({
    '.github/workflows/publish.yml': 'name: Publish to PyPI\non:\n  workflow_dispatch:\n    inputs:\n      test-pypi-only:\n        description: "Publish to Test PyPI only"\njobs:\n  build:\n    steps:\n      - run: python -m build\n',
    '.github/workflows/run-tests.yml': 'name: Tests\non:\n  push:\njobs:\n  test:\n    steps:\n      - name: Run tests\n        run: make ci\n',
  }));
  assert.equal(r.score, 0.9, r.details);
  assert.match(r.details, /run-tests\.yml/);

  // Guard: a repo whose CI only publishes to Test PyPI (no real test run) is NOT
  // credited with a test job — it drops to the 0.6 "no test run detected" band,
  // not 0.9, instead of the Test-PyPI input falsely lifting it.
  const publishOnly = ciConfig.run(ctxFor({
    '.github/workflows/publish.yml': 'name: Publish to PyPI\non:\n  workflow_dispatch:\n    inputs:\n      test-pypi-only:\n        description: "Publish to Test PyPI only"\njobs:\n  publish-test-pypi:\n    steps:\n      - run: python -m build\n',
  }));
  assert.equal(publishOnly.score, 0.6, publishOnly.details);
});

test('ci-config: a secondary test workflow does not shadow the primary one in the citation', () => {
  // Real misgrade (psf/black, sympy/sympy): mature repos carry fuzz / emscripten /
  // nightly workflows that also invoke a test runner (`tox -e fuzz`, pytest under
  // Pyodide) and sort alphabetically BEFORE the canonical test.yml / runtests.yml.
  // A bare first-match cited the secondary file, sending an agent to the fuzzer.
  // The score is right (1.0 — CI does run tests); the citation must name the suite.
  const black = ciConfig.run(ctxFor({
    '.github/workflows/fuzz.yml': 'name: fuzz\njobs:\n  fuzz:\n    steps:\n      - run: tox -e fuzz\n',
    '.github/workflows/test.yml': 'name: Test\njobs:\n  main:\n    steps:\n      - run: tox -e ci-py312\n',
  }));
  assert.equal(black.score, 1, black.details);
  assert.match(black.details, /test\.yml/);
  assert.doesNotMatch(black.details, /fuzz/);

  // sympy: the Pyodide/emscripten workflow runs the suite under wasm and sorts
  // first; runtests.yml is the primary `name: test` suite running `pytest`.
  const sympy = ciConfig.run(ctxFor({
    '.github/workflows/emscripten.yml': 'name: Pyodide\njobs:\n  build:\n    steps:\n      - run: pytest\n',
    '.github/workflows/runtests.yml': 'name: test\njobs:\n  tests:\n    steps:\n      - run: pytest -n auto\n',
  }));
  assert.equal(sympy.score, 1, sympy.details);
  assert.match(sympy.details, /runtests\.yml/);

  // Guard: when the ONLY test-running workflow is secondary-named, it is still
  // cited (fall-through) — no false "no test run" downgrade.
  const onlyFuzz = ciConfig.run(ctxFor({
    '.github/workflows/fuzz.yml': 'name: fuzz\njobs:\n  fuzz:\n    steps:\n      - run: pytest\n',
  }));
  assert.equal(onlyFuzz.score, 1, onlyFuzz.details);
  assert.match(onlyFuzz.details, /fuzz\.yml/);

  // Real misgrade (pytest-dev/pytest): a basename can match BOTH families —
  // `doc-check-links` matches PRIMARY via the `checks?` token AND SECONDARY via
  // `docs?`. It's a scheduled sphinx link-checker (`tox -e docs-checklinks`) that
  // sorts BEFORE the genuine `test.yml` (`tox` test envs, `name: test`), so the
  // old "first primary" rule cited the link-checker as the test suite. A config
  // that is primary AND not also secondary must outrank one that merely matches
  // primary. Score is right (1.0 — tox does run); the citation must name test.yml.
  const pytest = ciConfig.run(ctxFor({
    '.github/workflows/doc-check-links.yml': 'name: Doc Check Links\njobs:\n  doc-check-links:\n    steps:\n      - run: tox -e docs-checklinks\n',
    '.github/workflows/test.yml': 'name: test\njobs:\n  test:\n    steps:\n      - run: tox -e py313\n',
  }));
  assert.equal(pytest.score, 1, pytest.details);
  assert.match(pytest.details, /test\.yml/);
  assert.doesNotMatch(pytest.details, /doc-check-links/);
});

test('test-runnability: "npm install" in a README does not document `npm test`', () => {
  const base = {
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'test/a.test.js': '',
  };
  const undocumented = testRunnability.run(ctxFor({
    ...base,
    'README.md': 'Get started with `npm install` and read the docs.',
  }));
  assert.equal(undocumented.score, 0.8, undocumented.details);

  const documented = testRunnability.run(ctxFor({
    ...base,
    'Readme.md': 'To run the test suite, first run `npm install`, then `npm test`.',
  }));
  assert.equal(documented.score, 1, documented.details);
});
