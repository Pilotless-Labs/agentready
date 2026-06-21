// `agentready comment` — render the audit as a Markdown PR comment.
//
// Pure and offline: this module only turns a report into Markdown and helps a
// caller find a previous agentready comment to update. The actual network call
// lives in lib/pr-comment.js and runs only inside the GitHub Action, using the
// runner's own GITHUB_TOKEN — agentready itself hosts nothing and needs no
// account. The hidden HTML marker lets the Action upsert (one rolling comment
// per PR) instead of piling up a new comment every push.

export const COMMENT_MARKER = '<!-- agentready-report -->';

const GRADE_EMOJI = { A: '🟢', B: '🟢', C: '🟡', D: '🟠', F: '🔴' };

// Markdown table cells can't contain a raw pipe or newline.
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

/**
 * Render a report (from runner.js `audit`) as a GitHub-flavored Markdown comment.
 * Pure — no I/O. The first line is COMMENT_MARKER so the comment can be found
 * and updated in place on later runs.
 */
export function renderComment(report) {
  const emoji = GRADE_EMOJI[report.grade] ?? '⚪';
  const lines = [];
  lines.push(COMMENT_MARKER);
  lines.push(`## ${emoji} agentready: ${report.total}/100 (${report.grade})`);
  lines.push('');
  lines.push('How ready is this repository for AI coding agents?');
  lines.push('');
  lines.push('| | Check | Score | Notes |');
  lines.push('|---|---|---:|---|');
  for (const r of report.results) {
    const pct = Math.round(r.score * 100);
    const mark = r.score >= 0.85 ? '✅' : r.score >= 0.5 ? '🟡' : '❌';
    lines.push(`| ${mark} | ${cell(r.title)} | ${pct}% | ${cell(r.details)} |`);
  }
  lines.push('');

  const fixes = report.results.filter((r) => r.fix);
  if (fixes.length) {
    lines.push('<details><summary>Suggested fixes</summary>');
    lines.push('');
    for (const r of fixes) {
      lines.push(`- **${cell(r.title)}** — ${cell(r.fix)}`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  lines.push(
    '<sub>Posted by [agentready](https://github.com/Pilotless-Labs/agentready) · ' +
      'run `npx agentready` locally · built & operated by an autonomous AI venture.</sub>'
  );
  return lines.join('\n');
}

/**
 * Given a list of issue comments (GitHub API shape: `{ id, body }`), return the
 * existing agentready comment (the one carrying COMMENT_MARKER), or null. Pure.
 */
export function findAgentreadyComment(comments) {
  if (!Array.isArray(comments)) return null;
  return (
    comments.find((c) => typeof c?.body === 'string' && c.body.includes(COMMENT_MARKER)) ?? null
  );
}
