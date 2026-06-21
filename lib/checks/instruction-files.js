// The agent-instruction files agentready recognizes: the fixed-path,
// single-file conventions an AI coding agent loads verbatim as context at the
// start of a session. Mirrors the catalog ctxcost uses (the companion tool that
// measures these files' token cost) so the two tools agree on what counts as an
// agent-instructions file. Both the agent-instructions and instructions-accuracy
// checks read from this one list so they can never drift apart.
//
// Scope is the unambiguous single-file conventions. Directory-based rule sets
// (`.cursor/rules/`, `.clinerules/`) are a separate, newer convention not yet
// covered here.
export const INSTRUCTION_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
];
