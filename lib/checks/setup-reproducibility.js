// Can a fresh clone (human or agent sandbox) reach a working dev environment
// deterministically? Lockfiles pin dependencies; devcontainers/setup scripts
// pin everything else. A devcontainer that exists but is broken is worse than
// none at all — agent sandboxes will try to honor it and fail — so when one is
// present, its quality governs the environment-pin credit.

const LOCKFILES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'poetry.lock', 'Pipfile.lock', 'uv.lock', 'requirements.txt',
  'Cargo.lock', 'go.sum', 'Gemfile.lock', 'composer.lock', 'mix.lock',
  'Package.resolved',
];

const MANIFESTS = [
  'package.json', 'pyproject.toml', 'Pipfile', 'setup.py',
  'Cargo.toml', 'go.mod', 'Gemfile', 'composer.json', 'mix.exs',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts',
  'Package.swift',
];

// JVM build systems pin differently than the npm/pip world: Maven declares
// exact dependency versions inline in pom.xml, and Gradle pins its toolchain
// via the committed wrapper and dependencies via a version catalog / lockfile.
// Treat these as the lockfile-equivalent so a reproducible Gradle/Maven repo
// isn't scored as "manifest present but no lockfile committed".
const JVM_PINS = [
  'pom.xml', 'gradle.lockfile', 'gradle/libs.versions.toml',
  'gradle/wrapper/gradle-wrapper.properties',
];

const DEVCONTAINER_PATHS = ['.devcontainer/devcontainer.json', '.devcontainer.json'];

export const ENV_PINS = [
  ...DEVCONTAINER_PATHS, 'flake.nix',
  'shell.nix', '.tool-versions', '.nvmrc', '.python-version', '.ruby-version', 'Dockerfile',
  'docker-compose.yml', 'compose.yaml',
];

const SETUP_COMMAND_KEYS = ['postCreateCommand', 'onCreateCommand', 'updateContentCommand'];

// devcontainer.json is JSONC: comments and trailing commas are legal.
function stripJsonc(raw) {
  let out = '';
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      out += ch;
      if (ch === '\\') { out += raw[++i] ?? ''; continue; }
      if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && raw[i + 1] === '/') {
      while (i < raw.length && raw[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && raw[i + 1] === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/** null if no devcontainer file; otherwise { file, parses, problems[] }. */
function assessDevcontainer(ctx) {
  const file = DEVCONTAINER_PATHS.find((f) => ctx.exists(f));
  if (!file) return null;
  let config;
  try {
    config = JSON.parse(stripJsonc(ctx.read(file) ?? ''));
  } catch {
    return { file, parses: false, problems: ['does not parse as JSON/JSONC'] };
  }
  const problems = [];
  const pinned = typeof config.image === 'string' || config.build
    || typeof config.dockerFile === 'string' || config.dockerComposeFile;
  if (!pinned) problems.push('pins no image, build, or compose file');
  if (!SETUP_COMMAND_KEYS.some((k) => config[k])) {
    problems.push('has no setup command (postCreateCommand/onCreateCommand)');
  }
  return { file, parses: true, problems };
}

function devcontainerFix(dc) {
  return dc.parses
    ? `Make ${dc.file} self-sufficient: pin an image or build, and install dependencies in a postCreateCommand so agent sandboxes come up ready.`
    : `${dc.file} is not valid JSON/JSONC — a sandbox that honors it will fail to start. Fix the syntax.`;
}

export const setupReproducibility = {
  id: 'setup-reproducibility',
  title: 'Setup reproducibility',
  weight: 12,
  run(ctx) {
    // A published library intentionally omits a lockfile: its dependencies are
    // resolved by the *consuming* application, not pinned in the library's own
    // repo. Ruby's `bundle gem` even gitignores Gemfile.lock by default. So a
    // repo whose manifest is a library descriptor (a root `*.gemspec`) is
    // correctly configured without a committed lockfile — it must not be dropped
    // to the harsh "manifest but no lockfile" band the way a deployable app is.
    const gemspec = ctx.findRootFile(/\.gemspec$/);
    const hasManifest = MANIFESTS.some((f) => ctx.exists(f)) || !!gemspec;
    const hasLockfile = LOCKFILES.some((f) => ctx.exists(f)) || JVM_PINS.some((f) => ctx.exists(f));
    const envPin = ENV_PINS.find((f) => ctx.exists(f));
    const dc = assessDevcontainer(ctx);

    if (!hasManifest) {
      // No dependency manifest at all — docs-only or unconventional repo.
      // An environment pin still earns full marks; otherwise neutral-pass.
      if (!envPin) {
        return { score: 0.7, details: 'no dependency manifest found (docs-only repo?)', fix: 'If this repo has runtime dependencies, declare them in a manifest with a lockfile.' };
      }
      if (dc && dc.problems.length > 0) {
        return { score: 0.8, details: `no dependency manifest; ${dc.file} present but ${dc.problems.join(' and ')}`, fix: devcontainerFix(dc) };
      }
      return { score: 1, details: `no dependency manifest; environment pinned via ${envPin}` };
    }

    if (!hasLockfile) {
      if (gemspec) {
        // Ruby gem: a committed Gemfile.lock is the wrong convention for a
        // library, so its absence is not a defect. The gemspec is the manifest;
        // an env pin (.ruby-version / .tool-versions / devcontainer) is what
        // still makes the gem's *own* dev environment reproducible for an agent.
        return {
          score: envPin ? 1 : 0.8,
          details: `Ruby gem (${gemspec}); a library's lockfile is conventionally not committed${envPin ? `, environment pinned via ${envPin}` : ''}`,
          fix: envPin
            ? null
            : 'Gems rightly omit Gemfile.lock (deps resolve in the consuming app); pin the dev runtime (.ruby-version or .tool-versions) so agent sandboxes match your Ruby version.',
        };
      }
      return {
        score: 0.3,
        details: 'dependency manifest present but no lockfile committed',
        fix: 'Commit a lockfile so installs are deterministic — agents (and CI) get the same dependency tree you do.',
      };
    }

    if (dc) {
      if (!dc.parses) {
        return { score: 0.7, details: `lockfile committed, but ${dc.file} ${dc.problems[0]}`, fix: devcontainerFix(dc) };
      }
      if (dc.problems.length > 0) {
        return { score: 0.9, details: `lockfile committed; ${dc.file} present but ${dc.problems.join(' and ')}`, fix: devcontainerFix(dc) };
      }
      return { score: 1, details: `lockfile committed, environment pinned via ${dc.file} (image + setup command)` };
    }

    return {
      score: envPin ? 1 : 0.8,
      details: `lockfile committed${envPin ? `, environment pinned via ${envPin}` : ''}`,
      fix: envPin
        ? null
        : 'Consider pinning the runtime too (.devcontainer, .tool-versions, or .nvmrc) so agent sandboxes match your environment.',
    };
  },
};
