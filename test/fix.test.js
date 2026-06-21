import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { planFixes, applyFixes } from '../lib/fix.js';
import { audit } from '../lib/runner.js';

function repoWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentready-fix-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test('fix: bare repo gets instructions, README, contributing, and gitignore stubs', () => {
  const plan = planFixes(repoWith({ 'src/main.c': 'int main() {}' }));
  const paths = plan.map((p) => p.path);
  assert.ok(paths.includes('AGENTS.md'));
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('CONTRIBUTING.md'));
  assert.ok(paths.includes('.gitignore'));
});

test('fix: a well-equipped repo needs nothing', () => {
  const plan = planFixes(repoWith({
    'CLAUDE.md': 'Run npm test. Setup with npm ci. Structure: lib/. Conventions: standard.',
    'README.md': 'Install it, use it. Contributing welcome.',
    '.gitignore': 'node_modules/',
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'package-lock.json': '{}',
    '.nvmrc': '22',
    '.github/workflows/ci.yml': 'on: push',
  }));
  assert.deepEqual(plan, []);
});

test('fix: AGENTS.md stub embeds the detected test command and layout', () => {
  const plan = planFixes(repoWith({
    'package.json': JSON.stringify({ name: 'widget', scripts: { test: 'node --test' } }),
    'lib/widget.js': '',
  }));
  const agents = plan.find((p) => p.path === 'AGENTS.md');
  assert.match(agents.content, /npm test/);
  assert.match(agents.content, /`widget`/);
  assert.match(agents.content, /`lib\/`/);
  assert.match(agents.content, /TODO/);
});

test('fix: node repo with lockfile but no env pin gets .nvmrc and a CI workflow', () => {
  const plan = planFixes(repoWith({
    'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
    'package-lock.json': '{}',
  }));
  const paths = plan.map((p) => p.path);
  assert.ok(paths.includes('.nvmrc'));
  assert.ok(paths.includes('.github/workflows/test.yml'));
  const ci = plan.find((p) => p.path === '.github/workflows/test.yml');
  assert.match(ci.content, /npm ci/);
  assert.match(ci.content, /npm test/);
});

test('fix: no CI stub when the test command needs unknowable setup', () => {
  const plan = planFixes(repoWith({
    'Makefile': 'test:\n\ttrue\n',
    'tests/x_test.py': '',
  }));
  assert.ok(!plan.some((p) => p.path === '.github/workflows/test.yml'));
});

test('fix: gitignore stub matches the detected ecosystem', () => {
  const plan = planFixes(repoWith({ 'Cargo.toml': '[package]' }));
  const gitignore = plan.find((p) => p.path === '.gitignore');
  assert.match(gitignore.content, /target\//);
});

test('fix: apply creates the files, never overwrites, and raises the audit score', () => {
  const dir = repoWith({
    'package.json': JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }),
    'package-lock.json': '{}',
    'test/a.test.js': '',
  });
  const before = audit(dir).total;
  const plan = planFixes(dir);

  // A file that appears between plan and apply must be left untouched.
  fs.writeFileSync(path.join(dir, 'README.md'), 'hand-written');
  const { created, skipped } = applyFixes(dir, plan);

  assert.deepEqual(skipped, ['README.md']);
  assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), 'hand-written');
  for (const p of created) {
    assert.ok(fs.existsSync(path.join(dir, p)));
  }
  assert.ok(audit(dir).total > before);
  // Idempotent: a second apply creates nothing.
  assert.deepEqual(applyFixes(dir, planFixes(dir)).created.filter((p) => p !== 'README.md'), []);
});

test('fix: unfilled stubs raise the score but cannot reach an A', () => {
  const dir = repoWith({
    'package.json': JSON.stringify({ name: 'x', scripts: { test: 'node --test' } }),
    'package-lock.json': '{}',
    'test/a.test.js': '',
  });
  const before = audit(dir).total;
  applyFixes(dir, planFixes(dir));
  const after = audit(dir);
  assert.ok(after.total > before, `expected improvement, got ${before} -> ${after.total}`);
  assert.ok(after.total < 90, `scaffolding alone must not grade A, got ${after.total}`);
});

test('fix: an existing Readme.md (any casing) suppresses the README stub', () => {
  const plan = planFixes(repoWith({
    'Readme.md': '# proj\n\nWhat it is, how to install, how to use. Contributing notes live here too.',
  }));
  assert.ok(!plan.some((p) => p.path === 'README.md'), JSON.stringify(plan.map((p) => p.path)));
});
