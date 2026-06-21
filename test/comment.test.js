import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderComment, findAgentreadyComment, COMMENT_MARKER } from '../lib/comment.js';
import { upsertPrComment } from '../lib/pr-comment.js';

const sampleReport = {
  total: 72,
  grade: 'C',
  results: [
    { id: 'agent-instructions', title: 'Agent instructions', weight: 3, score: 1, details: 'CLAUDE.md present', fix: null },
    { id: 'tests', title: 'Test runnability', weight: 2, score: 0.6, details: 'tests found, command unclear', fix: 'Document the test command in README' },
    { id: 'hygiene', title: 'Repo hygiene', weight: 1, score: 0, details: 'no .gitignore', fix: 'Add a .gitignore' },
  ],
};

test('renderComment leads with the marker so it can be found and updated', () => {
  const md = renderComment(sampleReport);
  assert.ok(md.startsWith(COMMENT_MARKER), 'first line is the hidden marker');
  assert.equal((md.match(new RegExp(COMMENT_MARKER, 'g')) || []).length, 1, 'marker appears once');
});

test('renderComment shows the headline score, every check, and only real fixes', () => {
  const md = renderComment(sampleReport);
  assert.ok(md.includes('agentready: 72/100 (C)'), 'headline score + grade');
  for (const r of sampleReport.results) assert.ok(md.includes(r.title), `lists ${r.title}`);
  assert.ok(md.includes('60%') && md.includes('100%') && md.includes('0%'), 'per-check percentages');
  // fixes section: the two failing checks have fixes, the passing one does not
  assert.ok(md.includes('Suggested fixes'), 'has a fixes section when something failed');
  assert.ok(md.includes('Document the test command in README'));
  assert.ok(md.includes('Add a .gitignore'));
});

test('renderComment omits the fixes section for a perfect repo', () => {
  const perfect = { total: 100, grade: 'A', results: [{ id: 'x', title: 'X', weight: 1, score: 1, details: 'ok', fix: null }] };
  const md = renderComment(perfect);
  assert.ok(md.includes('100/100 (A)'));
  assert.ok(!md.includes('Suggested fixes'), 'no fixes block when nothing failed');
});

test('renderComment escapes pipes and newlines so the table stays intact', () => {
  const md = renderComment({
    total: 50, grade: 'F',
    results: [{ id: 'x', title: 'A | B', weight: 1, score: 0.5, details: 'line1\nline2', fix: null }],
  });
  assert.ok(md.includes('A \\| B'), 'pipe in a cell is escaped');
  assert.ok(md.includes('line1 line2'), 'newline in a cell becomes a space');
});

test('renderComment carries the honest "autonomous AI venture" label', () => {
  assert.ok(renderComment(sampleReport).includes('autonomous AI venture'));
});

test('findAgentreadyComment matches by marker, ignores others, tolerates junk', () => {
  const ours = { id: 7, body: `${COMMENT_MARKER}\n## agentready` };
  const comments = [{ id: 1, body: 'unrelated' }, { id: 2, body: null }, {}, ours];
  assert.equal(findAgentreadyComment(comments), ours);
  assert.equal(findAgentreadyComment([{ id: 1, body: 'nope' }]), null);
  assert.equal(findAgentreadyComment(null), null);
});

// --- upsertPrComment with an injected fake fetch (no real network) ---

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body });
    for (const [test, handler] of routes) {
      if (test(url, opts)) return handler(url, opts);
    }
    throw new Error(`no fake route for ${opts.method || 'GET'} ${url}`);
  };
  impl.calls = calls;
  return impl;
}
const ok = (data) => ({ ok: true, status: 200, json: async () => data });

test('upsertPrComment creates a new comment when none exists', async () => {
  const f = fakeFetch([
    [(u, o) => (o.method || 'GET') === 'GET', () => ok([{ id: 1, body: 'someone elses comment' }])],
    [(u, o) => o.method === 'POST', () => ok({ id: 99 })],
  ]);
  const res = await upsertPrComment({ token: 't', repo: 'o/r', prNumber: 5, body: 'hi', fetchImpl: f });
  assert.deepEqual(res, { action: 'created', id: 99 });
  const post = f.calls.find((c) => c.method === 'POST');
  assert.ok(post.url.endsWith('/repos/o/r/issues/5/comments'), 'posts to the PR comments endpoint');
  assert.equal(JSON.parse(post.body).body, 'hi');
});

test('upsertPrComment updates the existing agentready comment in place', async () => {
  const existing = { id: 42, body: `${COMMENT_MARKER}\nold score` };
  const f = fakeFetch([
    [(u, o) => (o.method || 'GET') === 'GET', () => ok([existing])],
    [(u, o) => o.method === 'PATCH', () => ok({ id: 42 })],
  ]);
  const res = await upsertPrComment({ token: 't', repo: 'o/r', prNumber: 5, body: 'new', fetchImpl: f });
  assert.deepEqual(res, { action: 'updated', id: 42 });
  const patch = f.calls.find((c) => c.method === 'PATCH');
  assert.ok(patch.url.endsWith('/repos/o/r/issues/comments/42'), 'patches the existing comment by id');
  assert.ok(!f.calls.some((c) => c.method === 'POST'), 'does not also create a duplicate');
});

test('upsertPrComment throws on an API error instead of silently passing', async () => {
  const f = fakeFetch([[() => true, () => ({ ok: false, status: 403, json: async () => ({}) })]]);
  await assert.rejects(
    upsertPrComment({ token: 't', repo: 'o/r', prNumber: 5, body: 'x', fetchImpl: f }),
    /HTTP 403/
  );
});

test('upsertPrComment sends auth + content-type headers (no token leaked into body)', async () => {
  let seenHeaders;
  const f = fakeFetch([
    [(u, o) => { if ((o.method || 'GET') === 'GET') { seenHeaders = o.headers; return true; } return false; }, () => ok([])],
    [(u, o) => o.method === 'POST', () => ok({ id: 1 })],
  ]);
  await upsertPrComment({ token: 'secret', repo: 'o/r', prNumber: 1, body: 'b', fetchImpl: f });
  assert.equal(seenHeaders.authorization, 'Bearer secret');
  assert.equal(seenHeaders.accept, 'application/vnd.github+json');
  const post = f.calls.find((c) => c.method === 'POST');
  assert.ok(!post.body.includes('secret'), 'token never ends up in a request body');
});
