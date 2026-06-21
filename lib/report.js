const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

export function renderTerminal(report, { color = true } = {}) {
  const c = (code, s) => (color ? `${code}${s}${RESET}` : s);
  const lines = [];

  lines.push('');
  lines.push(c(BOLD, `  agentready score: ${report.total}/100 (${report.grade})`));
  lines.push('');

  for (const r of report.results) {
    const pct = Math.round(r.score * 100);
    const mark = r.score >= 0.85 ? c(GREEN, '✓') : r.score >= 0.5 ? c(YELLOW, '~') : c(RED, '✗');
    lines.push(`  ${mark} ${r.title.padEnd(28)} ${String(pct).padStart(3)}%  ${c(DIM, r.details ?? '')}`);
    if (r.fix) {
      lines.push(`      ${c(YELLOW, '→')} ${r.fix}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export function renderJson(report) {
  return JSON.stringify(report, null, 2);
}

export function renderBadge(badge, { written = null, color = true } = {}) {
  const c = (code, s) => (color ? `${code}${s}${RESET}` : s);
  const lines = [''];
  lines.push(c(BOLD, `  agentready badge: ${badge.message}`));
  lines.push('');
  if (written) {
    lines.push(`  ${c(GREEN, '✓')} wrote ${written}`);
    lines.push(`  ${c(DIM, 'Add it to your README:')}`);
    lines.push(`      ![agentready](${written})`);
  } else {
    lines.push(`  ${c(DIM, 'Run with --write to save agentready-badge.svg, then add to your README:')}`);
    lines.push('      ![agentready](agentready-badge.svg)');
    lines.push(`  ${c(DIM, 'Or --json for a Shields.io endpoint badge (no committed file).')}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderFixPlan(plan, applied, { color = true } = {}) {
  const c = (code, s) => (color ? `${code}${s}${RESET}` : s);
  const lines = [''];

  if (plan.length === 0) {
    lines.push(c(BOLD, '  agentready fix: nothing to generate — no missing starter files.'));
    lines.push(`  ${c(DIM, 'Remaining audit findings (if any) are content fixes inside existing files; run the audit to see them.')}`);
    lines.push('');
    return lines.join('\n');
  }

  const verb = applied ? 'created' : 'would create';
  lines.push(c(BOLD, `  agentready fix: ${verb} ${plan.length} file(s)${applied ? '' : ' (dry run)'}`));
  lines.push('');
  for (const item of plan) {
    const skipped = applied?.skipped.includes(item.path);
    const mark = applied ? (skipped ? c(YELLOW, '~') : c(GREEN, '+')) : c(YELLOW, '+');
    lines.push(`  ${mark} ${item.path.padEnd(28)} ${c(DIM, `${item.checkId}: ${item.reason}${skipped ? ' (already exists, skipped)' : ''}`)}`);
  }
  lines.push('');
  lines.push(applied
    ? `  ${c(DIM, 'Generated files are stubs — search for TODO and fill them in, then re-run the audit.')}`
    : `  ${c(DIM, 'Run with --write to create them. Existing files are never modified.')}`);
  lines.push('');
  return lines.join('\n');
}
