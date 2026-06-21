import { analyzePlaceholders } from './placeholders.js';
import { findInstructionFiles, describeInstructionFiles } from './instruction-files.js';

// Topics a useful agent-instructions file covers. Scored by coverage, not
// exact wording — these are regexes over the lowercased content.
const TOPICS = [
  { name: 'how to run tests', pattern: /\btest(s|ing)?\b/ },
  { name: 'build/setup commands', pattern: /\b(build|setup|install|run|compile)\b/ },
  { name: 'project structure', pattern: /\b(structure|layout|director(y|ies)|architecture|organiz)/ },
  { name: 'conventions/style', pattern: /\b(convention|style|pattern|idiom|format|lint)/ },
];

export const agentInstructions = {
  id: 'agent-instructions',
  title: 'Agent instructions file',
  weight: 25,
  run(ctx) {
    const found = findInstructionFiles(ctx);
    if (found.length === 0) {
      return {
        score: 0,
        details: 'no agent-instructions file (CLAUDE.md, AGENTS.md, GEMINI.md, .cursorrules, .cursor/rules/, .clinerules, …)',
        fix: 'Add a CLAUDE.md (or AGENTS.md) covering: how to run tests, how to build/set up, project structure, and code conventions.',
      };
    }
    const label = describeInstructionFiles(found);

    // Placeholder (TODO/FIXME/TBD) lines are scaffolding, not instructions:
    // they don't count toward substance or topic coverage, and their share of
    // the file discounts the score — an unfilled stub must not pass.
    const ph = analyzePlaceholders(found.map((f) => ctx.read(f) ?? '').join('\n'));
    const content = ph.stripped.toLowerCase();
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < 30) {
      return {
        score: 0.3,
        details: `${label} exists but is nearly empty (${wordCount} words${ph.markers ? ` once ${ph.markers} placeholder line(s) are ignored` : ''})`,
        fix: `Flesh out ${found[0]}: agents follow it literally, so cover tests, setup, structure, and conventions.`,
      };
    }

    const covered = TOPICS.filter((t) => t.pattern.test(content));
    const missing = TOPICS.filter((t) => !t.pattern.test(content)).map((t) => t.name);
    // File exists with substance = 0.4 floor; topic coverage fills the rest;
    // the unfilled-placeholder share discounts the result.
    const score = (0.4 + 0.6 * (covered.length / TOPICS.length)) * (1 - ph.ratio);
    const fixes = [];
    if (missing.length) fixes.push(`Cover the missing topics in ${found[0]}: ${missing.join(', ')}.`);
    if (ph.markers) fixes.push(`Fill in the ${ph.markers} TODO/placeholder line(s) in ${found[0]} — stubs only count once their content is real.`);
    return {
      score,
      details: `${label} covers ${covered.length}/${TOPICS.length} core topics${ph.markers ? `, ${ph.markers} unfilled placeholder line(s)` : ''}`,
      fix: fixes.length ? fixes.join(' ') : null,
    };
  },
};
