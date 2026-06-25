// Stale instructions are worse than none: agents follow them literally, so a
// CLAUDE.md that names commands or paths that no longer exist sends every
// session down a dead end. This check verifies the claims, not the prose —
// inline-code references to repo paths, make targets, and npm scripts must
// actually resolve against the repo.

import { findInstructionFiles, describeInstructionFiles } from './instruction-files.js';

// Repo-relative path shape: dot-files allowed, segments of word chars, a
// trailing slash for directories. Globs, placeholders, URLs, and anything
// with whitespace or shell syntax never gets here (see classify).
const PATH_RE = /^\.?[\w@.-]+(?:\/[\w@.+-]+)*\/?$/;

export const instructionsAccuracy = {
  id: 'instructions-accuracy',
  title: 'Agent instructions accuracy',
  weight: 10,
  run(ctx) {
    const found = findInstructionFiles(ctx);
    if (found.length === 0) {
      return {
        score: 0.5,
        details: 'no agent instructions file, so nothing to verify',
        fix: 'Add a CLAUDE.md/AGENTS.md (see the agent-instructions check) that names the real test command and key paths.',
      };
    }
    const label = describeInstructionFiles(found);

    const seen = new Set();
    const refs = [];
    for (const file of found) {
      for (const [, raw] of (ctx.read(file) ?? '').matchAll(/`([^`\n]+)`/g)) {
        const span = raw.trim();
        if (seen.has(span)) continue;
        seen.add(span);
        const ref = classify(span);
        if (ref) refs.push({ ...ref, span });
      }
    }

    if (refs.length === 0) {
      return { score: 1, details: `${label}: no verifiable path/command references` };
    }

    const ignored = gitignoredDirs(ctx);
    const conventions = conventionRoots(ctx, found);
    const broken = refs.filter(
      (ref) =>
        !verify(ctx, ref) &&
        !(ref.kind === 'path' && isGitignored(ignored, ref.name)) &&
        !(ref.kind === 'path' && conventions.has(ref.name)),
    );
    if (broken.length === 0) {
      return { score: 1, details: `all ${refs.length} path/command references in ${label} resolve` };
    }

    const shown = broken.slice(0, 3).map((r) => `\`${r.span}\``).join(', ');
    return {
      score: (refs.length - broken.length) / refs.length,
      details: `stale references in ${label}: ${shown}${broken.length > 3 ? ` (+${broken.length - 3} more)` : ''}`,
      fix: 'Update the instructions to match the repo (or restore the missing files/commands) — agents follow these references literally.',
    };
  },
};

function classify(span) {
  let m;
  if (/^(npm|pnpm|yarn) test$/.test(span)) return { kind: 'npm-script', name: 'test' };
  if ((m = span.match(/^(?:npm|pnpm|yarn) run ([\w:.-]+)$/))) return { kind: 'npm-script', name: m[1] };
  if ((m = span.match(/^make ([\w.-]+)$/))) return { kind: 'make-target', name: m[1] };
  // Git refs (`origin/master`, `upstream/main`, `refs/heads/x`) look like
  // paths but aren't claims about the working tree.
  if (/^(origin|upstream|refs|remotes)\//.test(span)) return null;
  // An ellipsis is a wildcard/"and-so-on" marker, never a literal directory:
  // prose patterns like `it/...` (e.g. "integration tests at `it/...`") and Go's
  // package wildcard (`cmd/...`, `go test ./...`) are illustrative, not claims a
  // real path resolves — don't grade them as stale.
  if (span.includes('...')) return null;
  // A scoped npm package reference (`@scope/name`) is a dependency/package
  // name, not a path in this repo — instruction files routinely cite their own
  // published packages this way ("the `@ai-sdk/provider` package", "depends on
  // `@vitejs/plugin-legacy`"). The `@`+single-`/` shape is an npm package,
  // never a working-tree path, so it isn't a stale-path claim (real:
  // vercel/ai `@ai-sdk/*`, biomejs/biome `@biomejs/biome`, vitejs/vite
  // `@vitejs/plugin-legacy`). Subpath forms (`@scope/name/sub`, two+ slashes)
  // are left alone — rarer in prose and murkier to tell from a real path.
  if (/^@[\w.-]+\/[\w.-]+$/.test(span)) return null;
  if (
    span.includes('/') && !span.includes('//') &&
    !/[\s*<>{}$|;&"'`\\]/.test(span) && PATH_RE.test(span)
  ) {
    return { kind: 'path', name: span.replace(/\/$/, '') };
  }
  return null;
}

function verify(ctx, ref) {
  if (ref.kind === 'path') return ctx.exists(ref.name);
  if (ref.kind === 'make-target') {
    const makefile = ctx.read('Makefile') ?? ctx.read('makefile');
    return !!makefile && new RegExp(`^${escapeRe(ref.name)}\\s*:`, 'm').test(makefile);
  }
  const script = ctx.readJson('package.json')?.scripts?.[ref.name];
  return typeof script === 'string' && !/no test specified/.test(script);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A path the repo gitignores is meant to be absent in a fresh checkout — it's
// generated (`dist/`, `build/`, `target/`) or installed (`node_modules/`). When
// instructions name where output/deps land ("build output is in `dist/`"), that
// is a correct claim, not a stale one, so don't grade it as broken just because
// the directory isn't committed. Parsed from the repo's own .gitignore (covers
// whatever it generates) rather than a hardcoded list. Glob patterns (`*.log`,
// `**/foo`) are skipped to keep the directory-name match crisp.
function gitignoredDirs(ctx) {
  const text = ctx.read('.gitignore');
  if (!text) return null;
  const dirs = new Set();
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('!')) continue;
    if (/[*?[\]]/.test(t)) continue;
    const norm = t.replace(/^\/+/, '').replace(/\/+$/, '');
    if (norm) dirs.add(norm);
  }
  return dirs.size ? dirs : null;
}

function isGitignored(dirs, name) {
  if (!dirs) return false;
  return dirs.has(name) || dirs.has(name.split('/')[0]);
}

// A directory the instructions document as a *convention root* — a place where
// code/files get created on demand — is correctly absent in a fresh checkout,
// just like a gitignored output dir. The crisp signal that a bare dir ref is a
// convention root rather than a stale path: the same instruction files also
// cite a placeholder-subpath child of it, e.g. `product/<bet>/`, `packages/<name>/`,
// `services/{svc}/`. A `<...>`/`{...}` segment is a template slot, so its parent
// is a root populated per-bet/per-package, not a concrete path that must resolve
// now. A genuinely deleted path essentially never has a placeholder-subpath
// sibling (the two are contradictory), so this exempts the template/monorepo
// false positive without giving real stale paths a pass. Returns the set of
// prefix dirs before the first placeholder segment (`product/<bet>/` → `product`).
function conventionRoots(ctx, found) {
  const roots = new Set();
  for (const file of found) {
    for (const [, raw] of (ctx.read(file) ?? '').matchAll(/`([^`\n]+)`/g)) {
      const span = raw.trim().replace(/\/$/, '');
      if (!span.includes('/') || !/[<>{}]/.test(span)) continue;
      const segs = span.split('/');
      const at = segs.findIndex((s) => /[<>{}]/.test(s));
      if (at <= 0) continue; // leading/no placeholder → no concrete root
      const prefix = segs.slice(0, at).join('/');
      // The prefix itself must look like a real path (no placeholders/spaces).
      if (PATH_RE.test(prefix)) roots.add(prefix);
    }
  }
  return roots;
}
