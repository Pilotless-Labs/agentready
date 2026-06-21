import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planBadge, writeBadge, gradeColor, renderBadgeSvg, BADGE_FILENAME } from '../lib/badge.js';

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentready-badge-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test('gradeColor maps every grade to a distinct hex, with a gray fallback', () => {
  const colors = ['A', 'B', 'C', 'D', 'F'].map(gradeColor);
  for (const col of colors) assert.match(col, /^#[0-9a-f]{6}$/i);
  assert.equal(new Set(colors).size, 5, 'each grade should have its own color');
  assert.equal(gradeColor('A'), '#3fb950');
  assert.equal(gradeColor('Z'), '#9f9f9f', 'unknown grade falls back to gray');
});

test('renderBadgeSvg is a well-formed SVG containing the message and color', () => {
  const svg = renderBadgeSvg({ label: 'agentready', message: '100 A', color: '#3fb950' });
  assert.ok(svg.trimStart().startsWith('<svg'), 'starts with <svg');
  assert.ok(svg.trimEnd().endsWith('</svg>'), 'ends with </svg>');
  assert.ok(svg.includes('100 A'), 'contains the message');
  assert.ok(svg.includes('#3fb950'), 'contains the color');
  assert.ok(svg.includes('agentready'), 'contains the label');
  assert.match(svg, /width="\d+"/, 'has a numeric width');
});

test('renderBadgeSvg escapes XML-special characters', () => {
  const svg = renderBadgeSvg({ label: 'a&b', message: '<x>', color: '#fff' });
  assert.ok(svg.includes('a&amp;b'));
  assert.ok(svg.includes('&lt;x&gt;'));
  assert.ok(!svg.includes('<x>'), 'raw angle brackets must not leak into markup');
});

test('planBadge returns a self-consistent payload', () => {
  const root = makeRepo({ 'README.md': '# hi\n', 'package.json': '{"name":"x"}\n' });
  const badge = planBadge(root);
  assert.equal(badge.label, 'agentready');
  assert.equal(typeof badge.score, 'number');
  assert.ok(badge.score >= 0 && badge.score <= 100);
  assert.equal(badge.message, `${badge.score} ${badge.grade}`);
  assert.equal(badge.color, gradeColor(badge.grade));
  assert.equal(badge.endpoint.schemaVersion, 1);
  assert.equal(badge.endpoint.label, 'agentready');
  assert.equal(badge.endpoint.message, badge.message);
  assert.equal(badge.endpoint.color, badge.color);
  assert.ok(badge.svg.includes(badge.message));
});

test('writeBadge writes agentready-badge.svg with the svg content', () => {
  const root = makeRepo({ 'README.md': '# hi\n' });
  const badge = planBadge(root);
  const rel = writeBadge(root, badge.svg);
  assert.equal(rel, BADGE_FILENAME);
  const written = fs.readFileSync(path.join(root, BADGE_FILENAME), 'utf8');
  assert.equal(written, badge.svg);
});
