// CI is the agent's outer verification loop: a green check is what lets a
// human (or the agent itself) trust a change beyond "tests passed locally".
// This check asks: does CI exist, and does it actually run the tests?

const CI_CONFIGS = [
  '.gitlab-ci.yml', '.circleci/config.yml', 'Jenkinsfile', 'azure-pipelines.yml',
  '.travis.yml', 'bitbucket-pipelines.yml', '.drone.yml', '.woodpecker.yml',
  '.buildkite/pipeline.yml',
];

const TEST_RUN_HINTS = new RegExp([
  // package-manager scripts: `npm test`, `yarn run test:unit`, `pnpm run unit`, `bun test`
  String.raw`\b(npm|yarn|pnpm|bun)\s+(run\s+)?(test[\w:.-]*|unit[\w:.-]*)`,
  String.raw`\bmake\s+(test|check)\b`,
  String.raw`\bnode\s+--test\b`,
  // tox and its modern sibling nox are dedicated Python test-automation tools;
  // a bare `nox`/`tox` invocation runs the configured sessions/envs (the suite).
  // Verified on sqlalchemy/alembic, whose CI runs only `nox -t py-…` (no pytest/tox).
  String.raw`\b(pytest|tox|nox)\b`,
  String.raw`\bpython\d*\s+-m\s+(pytest|unittest)\b`,
  // `cargo test`, `cargo hack test`, `cargo nextest run`
  String.raw`\bcargo\s+(hack\s+)?test\b`,
  String.raw`\bcargo\s+nextest\s+run\b`,
  String.raw`\bgo\s+test\b`,
  // Maven/Gradle run the test task as part of these lifecycle phases by default
  String.raw`\bmvn\b[^\n]*\b(test|verify|install|package)\b`,
  String.raw`\bgradlew?\b[^\n]*\b(test|check|build)\b`,
  String.raw`\b(rake|mix|dotnet|swift|deno)\s+test\b`,
  String.raw`\bctest\b`,
  String.raw`\b(rspec|phpunit|jest|vitest|mocha|ava)\b`,
].join('|'));

// Fallback: a CI job or step literally named "test" is strong evidence the
// suite runs even when the command itself is hidden behind a script or action.
// The `name:` branch matches a leading "test" prefix (Test / Tests / Testing /
// "Test suite") rather than the exact word — many workflows are named "Testing"
// and run the suite via a default task (e.g. Ruby's bare `bundle exec rake`,
// whose default task is the test task) that TEST_RUN_HINTS can't recognize.
// Anchoring on `name:\s*` keeps it from matching mid-sentence step names like
// "Run rack-protection tests".
//
// Exclude "Test PyPI" publishing artifacts (`test-pypi-only:`, `publish-test-pypi`,
// a `name: Test PyPI` step): near-universal in Python release workflows, these name
// the *publishing* target, not a test suite. Without this guard a publish workflow's
// Test-PyPI job shadows the genuine `Tests` workflow (it sorts earlier) — mis-citing
// the test config, and over-crediting publish-only CI as 0.9 ("has a test job")
// instead of 0.6. Verified on psf/requests: `test-pypi-only:` is a workflow_dispatch
// input of publish.yml; the real suite lives in run-tests.yml (`name: Tests`).
const TEST_JOB_HINTS = /^\s{1,8}tests?(?![\w-]*pypi)[\w-]*:\s*$|^\s*name:\s*['"]?test(?![ _-]?pypi)/im;

// When several CI configs run a test command, the citation should point at the
// *primary* suite, not a secondary one. Mature repos commonly carry fuzz /
// emscripten / nightly / release-test workflows that also invoke a test runner
// (`tox -e fuzz`, pytest under Pyodide) and sort alphabetically *before* the
// canonical `test.yml` / `ci.yml` / `runtests.yml` — so a bare first-match cites
// the wrong file and sends an agent to the fuzzer instead of the suite. Prefer a
// config whose basename reads as the primary test/CI entry point; if none does,
// avoid an obviously-secondary one; else fall back to first match. Verified on
// psf/black (cited fuzz.yml → test.yml) and sympy/sympy (cited emscripten.yml →
// runtests.yml, which is `name: test` running `pytest -n auto`).
const PRIMARY_CI_NAME = /(^|[._-])(tests?|ci|main|unit-?tests?|run-?tests?|checks?|build-?and-?test)([._-]|$)/i;
const SECONDARY_CI_NAME = /(^|[._-])(fuzz|nightly|emscripten|pyodide|wasm|bench|benchmark|coverage|release|publish|deploy|cron|weekly|canary|experimental|lint|docs?|examples?|codeql|security)([._-]|$)/i;

function pickCiConfig(matches) {
  const base = (f) => f.split('/').pop().replace(/\.ya?ml$/, '');
  return matches.find((f) => PRIMARY_CI_NAME.test(base(f)))
    ?? matches.find((f) => !SECONDARY_CI_NAME.test(base(f)))
    ?? matches[0];
}

export const ciConfig = {
  id: 'ci-config',
  title: 'CI configuration',
  weight: 10,
  run(ctx) {
    const workflows = ctx.files().filter(
      (f) => f.startsWith('.github/workflows/') && /\.ya?ml$/.test(f),
    );
    const configs = [...workflows, ...CI_CONFIGS.filter((f) => ctx.exists(f))];

    if (configs.length === 0) {
      return {
        score: 0,
        details: 'no CI configuration found',
        fix: 'Add a CI workflow that runs the test suite on every push/PR (e.g. .github/workflows/test.yml) — CI is the verification agents and reviewers actually trust.',
      };
    }

    const testRunConfigs = configs.filter((f) => TEST_RUN_HINTS.test(ctx.read(f) ?? ''));
    if (testRunConfigs.length) {
      const testConfig = pickCiConfig(testRunConfigs);
      return { score: 1, details: `CI runs the test suite (${testConfig})` };
    }

    const testJobConfigs = configs.filter((f) => TEST_JOB_HINTS.test(ctx.read(f) ?? ''));
    if (testJobConfigs.length) {
      const testJobConfig = pickCiConfig(testJobConfigs);
      return {
        score: 0.9,
        details: `CI has a job/step named "test" (${testJobConfig}); the exact command wasn't recognized`,
        fix: 'Run the suite via a standard command (npm test, pytest, cargo test...) so agents can mirror CI locally.',
      };
    }

    return {
      score: 0.6,
      details: `CI config present (${configs[0]}) but no test run detected in it`,
      fix: 'Make CI run the test suite, not just lint/build — an agent\'s change is only verified once CI executes the tests.',
    };
  },
};
