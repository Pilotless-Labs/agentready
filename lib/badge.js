// `agentready badge` — turn the audit score into a self-contained SVG badge.
// On-brand with the rest of the tool: zero dependencies, no network calls, no
// hosting. The SVG is fully static (commit it, regenerate in CI via the Action).
// `--json` emits a Shields.io endpoint object for those who prefer a dynamic badge.

import fs from 'node:fs';
import path from 'node:path';
import { audit } from './runner.js';

export const BADGE_FILENAME = 'agentready-badge.svg';

const GRADE_COLORS = {
  A: '#3fb950', // bright green
  B: '#7cb342', // green
  C: '#dfb317', // yellow
  D: '#fe7d37', // orange
  F: '#e05d44', // red
};

export function gradeColor(grade) {
  return GRADE_COLORS[grade] ?? '#9f9f9f';
}

const escapeXml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Render a flat-style badge SVG. Widths are estimated (no font metrics needed);
 * `textLength` forces the text to fit its segment regardless of the renderer's
 * font, so the badge is robust everywhere. Uses the standard 10x-scale text trick.
 */
export function renderBadgeSvg({ label, message, color }) {
  const charW = 6.5;
  const pad = 10;
  const labelW = Math.round(label.length * charW) + pad;
  const msgW = Math.round(message.length * charW) + pad;
  const totalW = labelW + msgW;
  const l = escapeXml(label);
  const m = escapeXml(message);
  const labelX = (labelW / 2) * 10;
  const msgX = (labelW + msgW / 2) * 10;
  const labelLen = (labelW - pad) * 10;
  const msgLen = (msgW - pad) * 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${l}: ${m}">
<title>${l}: ${m}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)">
<rect width="${labelW}" height="20" fill="#555"/>
<rect x="${labelW}" width="${msgW}" height="20" fill="${color}"/>
<rect width="${totalW}" height="20" fill="url(#s)"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="110" text-rendering="geometricPrecision">
<text x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${labelLen}">${l}</text>
<text x="${labelX}" y="140" transform="scale(.1)" textLength="${labelLen}">${l}</text>
<text x="${msgX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${msgLen}">${m}</text>
<text x="${msgX}" y="140" transform="scale(.1)" textLength="${msgLen}">${m}</text>
</g>
</svg>
`;
}

/**
 * Audit the repo at `root` and build the badge payload. Pure — writes nothing.
 * Returns { score, grade, color, label, message, svg, endpoint }.
 */
export function planBadge(root) {
  const report = audit(root);
  const label = 'agentready';
  const message = `${report.total} ${report.grade}`;
  const color = gradeColor(report.grade);
  const svg = renderBadgeSvg({ label, message, color });
  return {
    score: report.total,
    grade: report.grade,
    color,
    label,
    message,
    svg,
    endpoint: { schemaVersion: 1, label, message, color },
  };
}

/** Write the badge SVG to `<root>/agentready-badge.svg`. Returns the relative path. */
export function writeBadge(root, svg) {
  fs.writeFileSync(path.join(root, BADGE_FILENAME), svg);
  return BADGE_FILENAME;
}
