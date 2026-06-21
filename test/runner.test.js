import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit, grade } from '../lib/runner.js';

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentready-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test('empty repo scores near zero with a fix for every check', () => {
  const report = audit(makeRepo({}));
  assert.ok(report.total < 30, `expected <30, got ${report.total}`);
  assert.equal(report.grade, 'F');
  for (const r of report.results) {
    assert.ok(r.score < 1, `${r.id} should not pass on an empty repo`);
    assert.ok(r.fix, `${r.id} should offer a fix`);
  }
});

test('well-prepared repo scores an A with no fixes', () => {
  const report = audit(makeRepo({
    'CLAUDE.md': [
      '# Project guide',
      'Run tests with `npm test`. Build with `npm run build`.',
      'Setup: `npm install`. Directory structure: lib/ holds modules, test/ holds tests.',
      'Conventions: ESM, no default exports, prettier formatting style.',
    ].join('\n'),
    'README.md': [
      '# widget',
      'A widget library for building, composing, and rendering widgets of every',
      'shape. Ships with zero dependencies and a stable, documented public API.',
      '## Install',
      '```\nnpm install widget\n```',
      '## Usage',
      '```js\nimport { w } from "widget";\nconsole.log(w());\n```',
      '## Contributing',
      'PRs welcome — run npm test first and keep changes small.',
    ].join('\n'),
    'package.json': JSON.stringify({ name: 'widget', scripts: { test: 'node --test', build: 'node build.js' } }),
    'package-lock.json': '{}',
    '.nvmrc': '22',
    '.gitignore': 'node_modules/',
    'test/widget.test.js': 'import { test } from "node:test"; test("x", () => {});',
    '.github/workflows/ci.yml': 'on: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n',
  }));
  assert.ok(report.total >= 90, `expected >=90, got ${report.total}: ${JSON.stringify(report.results, null, 2)}`);
  assert.equal(report.grade, 'A');
  for (const r of report.results) {
    assert.equal(r.fix, null, `${r.id} should not suggest a fix on a clean repo`);
  }
});

test('total is weighted, bounded, and grades map correctly', () => {
  const report = audit(makeRepo({ 'README.md': '# hi' }));
  assert.ok(report.total >= 0 && report.total <= 100);
  assert.equal(grade(95), 'A');
  assert.equal(grade(85), 'B');
  assert.equal(grade(75), 'C');
  assert.equal(grade(65), 'D');
  assert.equal(grade(10), 'F');
});

test('a crashing check is reported as score 0, not a crash', () => {
  const boom = { id: 'boom', title: 'Boom', weight: 10, run() { throw new Error('nope'); } };
  const report = audit(makeRepo({}), [boom]);
  assert.equal(report.results[0].score, 0);
  assert.match(report.results[0].details, /check crashed/);
});
