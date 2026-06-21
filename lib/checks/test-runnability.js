// An agent that can't run the tests can't verify its own work. This check asks:
// is there a test suite, and is the command to run it discoverable?

import { README_PATTERN, CONTRIBUTING_PATTERN } from '../context.js';

const TEST_DIR_HINTS = /^(tests?|Tests|spec|__tests__)\//;
const TEST_FILE_HINTS = /(\.test\.|\.spec\.|_test\.(go|py|rb|rs|c|cc|cpp|java|ex|exs|dart|zig)$|^test_.*\.(py|zig)$)/;
// A bare `test.js` / `test.ts` (AVA's default convention, and many small libs)
// is a real test file even though it has no `.test.`/`.spec.` infix.
const TEST_FILE_NAMES = /^test\.(js|ts|mjs|cjs|jsx|tsx)$/;
// JVM (Maven/Gradle) puts tests under the standard `src/test/<lang>/` source
// set rather than a top-level `tests/` dir, so TEST_DIR_HINTS (anchored at
// root) misses them entirely.
const TEST_PATH_HINTS = /(^|\/)src\/(test|integrationTest)\/(java|kotlin|scala|groovy)\//;
// JVM/.NET/Swift test classes are CamelCase with no underscore (FooTest.java,
// BarTests.kt, BazIT.java, QuxSpec.groovy, SerializationTests.cs,
// AuthenticationTests.swift) — none of which the underscore-based heuristics
// above recognize. Matching is case-sensitive on the suffix so lowercase
// "latest"/"manifest" files don't get mistaken for tests.
const TEST_CLASS_NAMES = /(Test|Tests|TestCase|IT|Spec)\.(java|kt|scala|groovy|cs|fs|vb|swift)$/;

export const testRunnability = {
  id: 'test-runnability',
  title: 'Test suite runnability',
  weight: 20,
  run(ctx) {
    const files = ctx.files();
    const hasTestFiles = files.some((f) => {
      const base = f.split('/').pop();
      return TEST_DIR_HINTS.test(f) || TEST_PATH_HINTS.test(f)
        || TEST_FILE_HINTS.test(base) || TEST_FILE_NAMES.test(base) || TEST_CLASS_NAMES.test(base);
    });

    const command = findTestCommand(ctx);

    if (!hasTestFiles && !command) {
      return {
        score: 0,
        details: 'no test files or test command found',
        fix: 'Add a test suite and wire it to a standard entry point (npm test, make test, pytest, cargo test...) so agents can verify changes.',
      };
    }
    if (hasTestFiles && !command) {
      return {
        score: 0.5,
        details: 'test files exist but no standard command to run them was found',
        fix: 'Expose the tests through a standard command (e.g. a package.json "test" script or a Makefile target) and mention it in your agent instructions.',
      };
    }
    if (!hasTestFiles && command) {
      return {
        score: 0.4,
        details: `test command found (${command}) but no test files detected`,
        fix: 'The test entry point exists but appears to have nothing behind it — add actual tests.',
      };
    }

    const documented = isDocumented(ctx, command);
    return {
      score: documented ? 1 : 0.8,
      details: `tests present, runnable via: ${command}${documented ? ' (documented)' : ''}`,
      fix: documented
        ? null
        : `Mention \`${command}\` in CLAUDE.md/AGENTS.md/README so agents don't have to guess.`,
    };
  },
};

export function findTestCommand(ctx) {
  const pkg = ctx.readJson('package.json');
  if (pkg?.scripts?.test && !/no test specified/.test(pkg.scripts.test)) {
    return 'npm test';
  }
  const makefile = ctx.read('Makefile');
  if (makefile && /^test\s*:/m.test(makefile)) return 'make test';
  if (ctx.exists('pytest.ini') || ctx.exists('tox.ini') || ctx.exists('setup.cfg')) return 'pytest';
  const pyproject = ctx.read('pyproject.toml');
  if (pyproject && /\[tool\.pytest/.test(pyproject)) return 'pytest';
  if (ctx.exists('Cargo.toml')) return 'cargo test';
  if (ctx.exists('go.mod')) return 'go test ./...';
  // Elixir: `mix test` is the universal runner for any mix.exs project.
  if (ctx.exists('mix.exs')) return 'mix test';
  // Crystal: `crystal spec` runs the `spec/*_spec.cr` suite for any shard.yml
  // project (the Shards manifest). Checked after the Makefile branch so a repo
  // with an explicit `make test` target keeps it.
  if (ctx.exists('shard.yml')) return 'crystal spec';
  // Julia: a package is `Project.toml` (the manifest, with name/uuid) + the
  // canonical `test/runtests.jl` entry point that `Pkg.test()` executes. Gate
  // on the entry file existing so the command is only emitted when there is
  // actually something for it to run. `--project` activates the checked-out
  // package's environment.
  if (ctx.exists('Project.toml') && ctx.exists('test/runtests.jl')) {
    return "julia --project -e 'using Pkg; Pkg.test()'";
  }
  // Dart / Flutter: `dart test` runs the suite for any pubspec.yaml; Flutter
  // packages run `flutter test` instead (detected by a flutter SDK reference,
  // not a substring — `flutter_bloc:` is a dep, not the SDK).
  if (ctx.exists('pubspec.yaml')) {
    const pubspec = ctx.read('pubspec.yaml') ?? '';
    return /(^|\n)\s*flutter\s*:|sdk:\s*flutter\b/.test(pubspec) ? 'flutter test' : 'dart test';
  }
  // PHP: Composer's `test` script is the convention; otherwise a PHPUnit config
  // file implies the `phpunit` runner (via the vendored binary when present).
  const composer = ctx.readJson('composer.json');
  if (composer?.scripts?.test) return 'composer test';
  if (ctx.exists('phpunit.xml') || ctx.exists('phpunit.xml.dist')) {
    return ctx.exists('vendor/bin/phpunit') ? 'vendor/bin/phpunit' : 'phpunit';
  }
  // Ruby: a Rakefile with a test/spec task is the conventional runner; run it
  // through Bundler when a Gemfile pins the gems.
  const rakefile = ctx.read('Rakefile') ?? ctx.read('rakefile');
  if (rakefile && /\btest\b/i.test(rakefile)) {
    return ctx.exists('Gemfile') ? 'bundle exec rake test' : 'rake test';
  }
  if (ctx.exists('.rspec') || ctx.exists('spec/spec_helper.rb')) {
    return ctx.exists('Gemfile') ? 'bundle exec rspec' : 'rspec';
  }
  // JVM build systems run tests through their own CLI (there is no
  // package.json/Makefile to read) — prefer the committed Gradle wrapper.
  if (['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some((f) => ctx.exists(f))) {
    return ctx.exists('gradlew') ? './gradlew test' : 'gradle test';
  }
  if (ctx.exists('pom.xml')) return 'mvn test';
  // Swift Package Manager: `swift test` runs the suite for any Package.swift.
  if (ctx.exists('Package.swift')) return 'swift test';
  // Haskell: a `.cabal` file is the canonical package manifest (`cabal test`
  // runs its test-suite stanza); a Stack-only project exposes `stack test`.
  // Prefer cabal — it's what most Haskell docs cite and it's build-tool-neutral.
  if (ctx.files().some((f) => /\.cabal$/.test(f))) return 'cabal test';
  if (ctx.exists('stack.yaml')) return 'stack test';
  // Scala: sbt is the dominant build tool — `sbt test` runs any build.sbt project.
  if (ctx.exists('build.sbt')) return 'sbt test';
  // Zig: `zig build test` runs the `test` step that build.zig conventionally
  // defines (tests live in `test/` and in inline `test {}` blocks).
  if (ctx.exists('build.zig')) return 'zig build test';
  // .NET: any solution or project file runs through the dotnet CLI. Project
  // files have arbitrary names, so scan the tree rather than fixed filenames.
  if (ctx.files().some((f) => /\.(sln|csproj|fsproj|vbproj)$/.test(f))) return 'dotnet test';
  return null;
}

function isDocumented(ctx, command) {
  // Match the runner + subcommand ("npm test", "go test"), not just the first
  // word — a README that says "npm install" hasn't documented the test command.
  // Strip a leading `bundle exec` wrapper so the needle is the real runner
  // (`rake test`, `rspec`) rather than the Bundler prefix.
  const needle = command.replace(/^bundle exec /, '').split(/\s+/).slice(0, 2).join(' ');
  const docs = ['CLAUDE.md', 'AGENTS.md'];
  for (const pattern of [README_PATTERN, CONTRIBUTING_PATTERN]) {
    const name = ctx.findRootFile(pattern);
    if (name) docs.push(name);
  }
  for (const doc of docs) {
    const content = ctx.read(doc);
    if (content && content.includes(needle)) return true;
  }
  return false;
}
