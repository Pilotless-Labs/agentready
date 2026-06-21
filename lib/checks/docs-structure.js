// README quality from an agent's point of view: does it say what the project
// is, how to install/set it up, and how to use it?

import { analyzePlaceholders } from './placeholders.js';
import { README_PATTERN, CONTRIBUTING_PATTERN } from '../context.js';

// The install/setup signal has to recognize how repos actually head and word
// these instructions, not just the bare stems "install"/"setup":
//   - morphological variants — "## Installation", "## Installing", "## Set up"
//     are the most common section headers, but `\binstall\b`/`\bsetup\b` miss
//     them ("Installation" has no word boundary after "install"; "set up" has a
//     space). `install\w*` covers Install/Installation/Installing/Installed and
//     `set ?up` covers both "setup" and "set up".
//   - the canonical install *command* `go get` — Go libraries routinely document
//     setup only as `go get github.com/org/repo` (no literal "install" word and
//     often under a "Usage" header), so without this a perfectly set-up Go repo
//     reads as missing install instructions (real misgrade: julienschmidt/httprouter).
//   - the canonical Rust install forms `cargo add <crate>` and a `[dependencies]`
//     Cargo.toml block — Rust *libraries* document setup as "add this to your
//     Cargo.toml" rather than with the word "install" (the crate is a dependency,
//     not something you install), so without these a perfectly set-up crate reads
//     as missing install instructions (real misgrade: tokio, serde, rayon, clap —
//     all show only a `[dependencies]` block / `cargo add`, the Rust analog of
//     `go get`). `[dependencies]` is matched literally since `[` has no word
//     boundary; it's a strong, specific signal (a README showing that block is
//     telling you how to depend on the crate = install).
const SECTION_SIGNALS = [
  { name: 'install/setup instructions', pattern: /(\b(install\w*|set ?up|getting started|quick ?start|go get|cargo add)\b|\[dependencies\])/i },
  { name: 'usage/examples', pattern: /\b(usage|example|how to use|api)\b/i },
  { name: 'code blocks', pattern: /```/ },
];

export const docsStructure = {
  id: 'docs-structure',
  title: 'Documentation structure',
  weight: 13,
  run(ctx) {
    const readmeName = ctx.findRootFile(README_PATTERN);
    const readme = readmeName ? ctx.read(readmeName) : null;
    if (readme === null) {
      return {
        score: 0,
        details: 'no README found',
        fix: 'Add a README.md: what the project is, how to install it, how to use it. It is the first file every agent reads.',
      };
    }

    // Placeholder (TODO/FIXME/TBD) lines don't count as content, and their
    // share of the README discounts the score — see lib/checks/placeholders.js.
    const ph = analyzePlaceholders(readme);
    const wordCount = ph.stripped.split(/\s+/).filter(Boolean).length;
    if (wordCount < 40) {
      return {
        score: 0.2,
        details: `README is nearly empty (${wordCount} words${ph.markers ? ` once ${ph.markers} placeholder line(s) are ignored` : ''})`,
        fix: 'Expand the README: purpose, install/setup, and at least one usage example.',
      };
    }

    const present = SECTION_SIGNALS.filter((s) => s.pattern.test(ph.stripped));
    const missing = SECTION_SIGNALS.filter((s) => !s.pattern.test(ph.stripped)).map((s) => s.name);
    const hasContributing = ctx.findRootFile(CONTRIBUTING_PATTERN) !== null || /contribut/i.test(readme);

    // README with substance = 0.4 floor; sections fill 0.5; contributor docs
    // 0.1; the unfilled-placeholder share discounts the result.
    const score = (0.4 + 0.5 * (present.length / SECTION_SIGNALS.length) + (hasContributing ? 0.1 : 0)) * (1 - ph.ratio);
    const fixes = [];
    if (missing.length) fixes.push(`Add to the README: ${missing.join(', ')}.`);
    if (!hasContributing) fixes.push('Add a CONTRIBUTING.md (or a contributing section) so agents know the change workflow.');
    if (ph.markers) fixes.push(`Fill in the ${ph.markers} TODO/placeholder line(s) in the README — stubs only count once their content is real.`);
    return {
      score,
      details: `README has ${present.length}/${SECTION_SIGNALS.length} core elements${hasContributing ? ' + contributor docs' : ''}${ph.markers ? `, ${ph.markers} unfilled placeholder line(s)` : ''}`,
      fix: fixes.length ? fixes.join(' ') : null,
    };
  },
};
