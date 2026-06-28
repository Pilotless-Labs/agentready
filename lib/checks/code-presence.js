// Shared signal: does this repo contain code an agent would need to test or
// build? A repo with neither a dependency manifest nor any source file is a
// docs / content / template repo (a README + guides, an awesome-list, a
// markdown-only project template like our own venture-studio template) — for
// which a missing test suite or CI workflow is the *expected* shape, not a
// defect. The test-runnability and ci-config checks use this to soften their
// hard 0% (correct advice for a code repo) into a neutral "not applicable",
// the same way setup-reproducibility already softens a missing manifest to
// "docs-only repo?".
//
// Erring toward "has code" is the safe direction: an unrecognized language keeps
// the strict 0% (no regression), and the only cost is not softening a content
// repo that happens to ship a stray script — never giving a real code repo a
// free pass on tests/CI.

import { MANIFESTS } from './setup-reproducibility.js';

// Unambiguous programming-language source extensions. Deliberately excludes
// markup / styling / data / config (md, txt, html, css, json, yml, toml, csv,
// svg, …) — those populate docs and content repos and must not count as "code".
const SOURCE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'groovy',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'fs', 'vb',
  'swift', 'm', 'mm', 'php', 'ex', 'exs', 'erl', 'dart', 'zig',
  'clj', 'cljs', 'cljc', 'lua', 'pl', 'pm', 'r', 'jl', 'hs', 'ml', 'mli',
  'sh', 'bash', 'zsh', 'ps1', 'sql', 'nim', 'cr',
]);

// Documentation / prose extensions. A genuine docs-or-content repo *has* these;
// an empty or skeleton repo (just a manifest, or nothing) does not — and must
// not be softened, since it really is unready, not a content project.
const CONTENT_EXTENSIONS = new Set([
  'md', 'markdown', 'mdx', 'rst', 'txt', 'adoc', 'asciidoc', 'org',
]);

const ext = (f) => (f.includes('.') ? f.split('.').pop().toLowerCase() : '');

/** True if the repo has a dependency manifest or any recognized source file. */
export function repoHasCode(ctx) {
  if (MANIFESTS.some((f) => ctx.exists(f))) return true;
  // A root *.gemspec is a (Ruby library) manifest too.
  if (ctx.findRootFile(/\.gemspec$/)) return true;
  return ctx.files().some((f) => SOURCE_EXTENSIONS.has(ext(f)));
}

/**
 * True when the repo is a genuine docs / content / template repo: it carries no
 * code (no manifest, no source files) *and* it actually contains documentation
 * content. The content requirement keeps an empty or manifest-only skeleton —
 * which is unready, not a docs project — out of the softened band.
 */
export function isDocsOnlyRepo(ctx) {
  if (repoHasCode(ctx)) return false;
  return ctx.files().some((f) => CONTENT_EXTENSIONS.has(ext(f)));
}
