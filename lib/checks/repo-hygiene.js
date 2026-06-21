// Mechanical hygiene that trips agents up: missing .gitignore, giant files
// bloating context windows and checkouts, build artifacts committed to source.

// Checked by direct existence (the context walker skips them for speed). Only
// flagged when .gitignore doesn't cover them — a locally installed
// node_modules that IS ignored is normal, not a problem.
const ARTIFACT_DIRS = ['node_modules', 'dist', 'build', 'out', '__pycache__', 'target'];
const BIG_FILE_BYTES = 5 * 1024 * 1024;

// Some projects keep hand-written *source* in a dir that merely shares a name
// with a build-output dir — e.g. bat (Rust) commits `build/*.rs` (build-script
// modules; Rust's real output is `target/`). Flagging those as committed
// artifacts is a false positive that tells maintainers to delete their source
// (#45). For build/dist/out/target we peek inside and skip the dir only when it
// holds authored source and zero generated-output markers.
const DISCRIMINATED_DIRS = new Set(['dist', 'build', 'out', 'target']);
// Hallmarks of real build output: compiled objects/bytecode/archives, minified
// or content-hashed/source-mapped web assets, Rust/Cargo cache files. Any of
// these inside the dir means it IS output — keep flagging it.
const ARTIFACT_FILE = /\.(o|a|so|dylib|dll|lib|class|pyc|pyo|wasm|jar|rlib|rmeta|nupkg|map)$|\.min\.(js|css)$|\.[0-9a-f]{8,}\.(js|css)$/i;
// Authored-source extensions of compiled languages whose build output lives in
// a *differently named* dir (Rust→target/, Go→bin, Swift→.build, Zig→zig-out,
// C/C++→*.o). Deliberately EXCLUDES web/interpreted extensions (.js/.ts/.css/
// .py): a dist/ of .js or a build/ of copied .py is the common *real* committed-
// output case and must stay flagged — those are never exempted.
const EXEMPT_SOURCE = /\.(rs|go|c|h|hpp|hh|cc|cpp|cxx|swift|zig|hs|rb|ex|exs)$/i;

// True when an artifact-named dir actually holds authored source rather than
// build output: it has tracked files, none look generated, and at least one is
// recognized source in a compiled language whose output dir is named otherwise.
// Empty/unreadable dirs return false, preserving the original (flag-it) default.
function isSourceDir(ctx, dir) {
  const contents = ctx.listDir(dir);
  if (contents.length === 0) return false;
  if (contents.some((f) => ARTIFACT_FILE.test(f.split('/').pop()))) return false;
  return contents.some((f) => EXEMPT_SOURCE.test(f.split('/').pop()));
}

export const repoHygiene = {
  id: 'repo-hygiene',
  title: 'Repository hygiene',
  weight: 10,
  run(ctx) {
    const problems = [];
    const fixes = [];

    const gitignore = ctx.read('.gitignore');
    if (gitignore === null) {
      problems.push('no .gitignore');
      fixes.push('Add a .gitignore for your toolchain so agents never commit artifacts.');
    }

    const ignoredPatterns = (gitignore ?? '')
      .split('\n')
      .map((l) => l.trim().replace(/\/+$/, ''))
      .filter((l) => l && !l.startsWith('#'));
    const unignoredArtifacts = ARTIFACT_DIRS.filter(
      (dir) =>
        ctx.exists(dir) &&
        // A dir whose own `.gitignore` ignores its contents (the standard
        // "keep the empty dir, ignore everything in it" pattern) is fine.
        !ctx.exists(`${dir}/.gitignore`) &&
        !ignoredPatterns.some((p) => p === dir || p === `/${dir}` || p === `**/${dir}`) &&
        // …and, for the ambiguously-named dirs, isn't actually authored source
        // sharing the name (e.g. bat's Rust `build/`) — #45.
        !(DISCRIMINATED_DIRS.has(dir) && isSourceDir(ctx, dir)),
    );
    if (unignoredArtifacts.length > 0) {
      problems.push(`artifact directories not gitignored (${unignoredArtifacts.join(', ')})`);
      fixes.push('Gitignore (and remove from version control) build/dependency directories.');
    }

    const bigFiles = ctx.files().filter((f) => ctx.fileSize(f) > BIG_FILE_BYTES);
    if (bigFiles.length > 0) {
      problems.push(`files over 5MB (${bigFiles.slice(0, 3).join(', ')})`);
      fixes.push('Move large binaries out of the repo (releases, LFS, or object storage).');
    }

    if (problems.length === 0) {
      return { score: 1, details: 'clean: .gitignore present, no stray artifacts, no oversized files' };
    }
    return {
      score: Math.max(0, 1 - problems.length / 3),
      details: problems.join('; '),
      fix: fixes.join(' '),
    };
  },
};
