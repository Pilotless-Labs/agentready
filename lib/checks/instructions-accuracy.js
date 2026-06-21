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

    const broken = refs.filter((ref) => !verify(ctx, ref));
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
