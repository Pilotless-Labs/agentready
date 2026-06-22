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
  String.raw`\b(pytest|tox)\b`,
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

    const testConfig = configs.find((f) => TEST_RUN_HINTS.test(ctx.read(f) ?? ''));
    if (testConfig) {
      return { score: 1, details: `CI runs the test suite (${testConfig})` };
    }

    const testJobConfig = configs.find((f) => TEST_JOB_HINTS.test(ctx.read(f) ?? ''));
    if (testJobConfig) {
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
