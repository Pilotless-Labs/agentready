#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import { audit } from '../lib/runner.js';
import { renderTerminal, renderJson, renderFixPlan, renderBadge } from '../lib/report.js';
import { planFixes, applyFixes } from '../lib/fix.js';
import { planBadge, writeBadge } from '../lib/badge.js';
import { renderComment } from '../lib/comment.js';

const HELP = `agentready — audit a repository for AI-coding-agent readiness

Usage: agentready [path] [options]
       agentready fix [path] [--write]
       agentready badge [path] [--write]
       agentready comment [path]

Options:
  --json             machine-readable output
  --min-score <n>    exit 1 if the total score is below n (CI gate)
  --no-color         disable ANSI colors
  -h, --help         show this help

fix generates starter files for failed checks (AGENTS.md, README, .gitignore,
CI workflow...). Dry run by default; --write creates the files. It only ever
creates missing files — existing files are never modified.

badge prints your score; --write saves agentready-badge.svg (a self-contained
SVG, no hosting) to embed in your README; --json emits a Shields.io endpoint.

comment prints the score as a Markdown PR comment. The GitHub Action posts it
on pull requests for you (input comment: true) using the runner's own token.
`;

function parseArgs(argv) {
  const opts = { command: 'audit', path: '.', json: false, minScore: null, color: true, write: false };
  if (argv[0] === 'fix') {
    opts.command = 'fix';
    argv = argv.slice(1);
  } else if (argv[0] === 'badge') {
    opts.command = 'badge';
    argv = argv.slice(1);
  } else if (argv[0] === 'comment') {
    opts.command = 'comment';
    argv = argv.slice(1);
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--no-color') {
      opts.color = false;
    } else if (arg === '--write' && (opts.command === 'fix' || opts.command === 'badge')) {
      opts.write = true;
    } else if (arg === '--min-score' && opts.command === 'audit') {
      opts.minScore = Number(argv[++i]);
      if (!Number.isFinite(opts.minScore)) {
        throw new Error('--min-score requires a number');
      }
    } else if (!arg.startsWith('-')) {
      opts.path = arg;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return opts;
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`agentready: ${err.message}\n\n${HELP}`);
  process.exit(2);
}

if (opts.help) {
  console.log(HELP);
  process.exit(0);
}

const root = path.resolve(opts.path);
if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`agentready: not a directory: ${root}`);
  process.exit(2);
}

if (opts.command === 'fix') {
  const plan = planFixes(root);
  const applied = opts.write ? applyFixes(root, plan) : null;
  if (opts.json) {
    console.log(JSON.stringify({
      plan: plan.map(({ checkId, path: p, reason }) => ({ checkId, path: p, reason })),
      created: applied?.created ?? [],
      skipped: applied?.skipped ?? [],
    }, null, 2));
  } else {
    console.log(renderFixPlan(plan, applied, { color: opts.color && process.stdout.isTTY !== false }));
  }
  process.exit(0);
}

if (opts.command === 'badge') {
  const badge = planBadge(root);
  const written = opts.write ? writeBadge(root, badge.svg) : null;
  if (opts.json) {
    console.log(JSON.stringify(badge.endpoint, null, 2));
  } else {
    console.log(renderBadge(badge, { written, color: opts.color && process.stdout.isTTY !== false }));
  }
  process.exit(0);
}

if (opts.command === 'comment') {
  console.log(renderComment(audit(root)));
  process.exit(0);
}

const report = audit(root);

if (opts.json) {
  console.log(renderJson(report));
} else {
  console.log(renderTerminal(report, { color: opts.color && process.stdout.isTTY !== false }));
}

if (opts.minScore !== null && report.total < opts.minScore) {
  if (!opts.json) {
    console.error(`agentready: score ${report.total} is below --min-score ${opts.minScore}`);
  }
  process.exit(1);
}
