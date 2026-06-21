// The agent-instruction sources agentready recognizes: the files — and, newer,
// directory rule sets — an AI coding agent loads as context at the start of a
// session. The single-file list mirrors the catalog ctxcost uses (the companion
// tool that measures these files' token cost) so the two tools agree on what
// counts. Every consumer resolves its file set through findInstructionFiles()
// so the agent-instructions check, the instructions-accuracy check, and the
// `fix` planner can never drift apart on what an instruction file is.

// Fixed-path, single-file conventions an agent loads verbatim.
export const INSTRUCTION_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];

// Directory-based rule sets — a *folder* of rule files an agent loads together.
// Cursor (`.cursor/rules/*.mdc`), Cline (`.clinerules/`, which Cline also allows
// as a single file), and Windsurf (`.windsurf/rules/`). A repo whose only agent
// instructions live in one of these directories used to be graded as
// instruction-less — a 0 on the heaviest check. Real bites: micronaut-spring
// 51/F on a substantive `.clinerules/`; HappydanceLabs/umbraco-mcp-server 36/F
// on 5.7k words of `.cursor/rules/`.
export const INSTRUCTION_DIRS = [
  '.cursor/rules',
  '.clinerules',
  '.windsurf/rules',
];

// Rule files inside a directory rule set are markdown/text (Cursor uses .mdc).
const RULE_FILE_RE = /\.(mdc|mdx|md|markdown|txt)$/i;

/**
 * Every agent-instruction source in the repo, resolved to a flat list of
 * repo-relative file paths to read. Single-file conventions resolve to
 * themselves; directory rule sets expand to their rule files (recursively —
 * Cline loads nested rules too). `.clinerules` is ambiguous in the wild (Cline
 * allows it as a file *or* a directory), so it is resolved by shape: a
 * directory expands to its rule files, a plain file is taken as-is.
 */
export function findInstructionFiles(ctx) {
  const out = [];
  for (const f of INSTRUCTION_FILES) {
    if (ctx.exists(f)) out.push(f);
  }
  for (const dir of INSTRUCTION_DIRS) {
    const entries = ctx.listDir(dir); // recursive; [] if missing or not a dir
    if (entries.length > 0) {
      for (const e of entries) if (RULE_FILE_RE.test(e)) out.push(e);
    } else if (ctx.exists(dir)) {
      // Exists but lists no files => it's the single-file form (e.g. `.clinerules`).
      out.push(dir);
    }
  }
  return out;
}

/**
 * Human-readable summary of a resolved instruction-file set: single files are
 * named, directory rule sets are collapsed to `<dir>/ (N rule files)` so a
 * check's details line stays short even for a `.cursor/rules/` with a dozen
 * rules.
 */
export function describeInstructionFiles(files) {
  const dirCounts = new Map();
  const singles = [];
  for (const f of files) {
    const dir = INSTRUCTION_DIRS.find((d) => f.startsWith(`${d}/`));
    if (dir) dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    else singles.push(f);
  }
  const parts = [...singles];
  for (const [dir, n] of dirCounts) parts.push(`${dir}/ (${n} rule file${n === 1 ? '' : 's'})`);
  return parts.join(', ');
}
