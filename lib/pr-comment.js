// PR-comment upsert — posts (or updates) the agentready score as a single
// rolling comment on a pull request, using the GitHub Actions runner's own
// GITHUB_TOKEN. This is the only file in agentready that touches the network,
// and it runs ONLY inside the Action (the plain CLI stays offline and hostless).
// Zero dependencies: Node 18+ global `fetch`.

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { audit } from './runner.js';
import { renderComment, findAgentreadyComment } from './comment.js';

/**
 * Find any existing agentready comment on the PR and PATCH it, else POST a new
 * one. `fetchImpl` and `apiUrl` are injectable for testing. Returns
 * `{ action: 'updated'|'created', id }`.
 */
export async function upsertPrComment({
  token,
  repo,
  prNumber,
  body,
  fetchImpl = fetch,
  apiUrl = 'https://api.github.com',
}) {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'agentready',
    'x-github-api-version': '2022-11-28',
  };

  // Page through existing comments to find ours (bounded — large PRs are rare).
  const comments = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetchImpl(
      `${apiUrl}/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) throw new Error(`listing PR comments failed (HTTP ${res.status})`);
    const batch = await res.json();
    comments.push(...batch);
    if (batch.length < 100) break;
  }

  const existing = findAgentreadyComment(comments);
  if (existing) {
    const res = await fetchImpl(`${apiUrl}/repos/${repo}/issues/comments/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`updating PR comment failed (HTTP ${res.status})`);
    return { action: 'updated', id: existing.id };
  }

  const res = await fetchImpl(`${apiUrl}/repos/${repo}/issues/${prNumber}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`creating PR comment failed (HTTP ${res.status})`);
  const created = await res.json();
  return { action: 'created', id: created.id };
}

// Entry point for the Action step. Reads everything from the environment the
// runner already provides; never prints the token.
async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.AR_PR_NUMBER;
  const root = path.resolve(process.env.AR_PATH || '.');
  if (!token || !repo || !prNumber) {
    throw new Error(
      'pr-comment needs GITHUB_TOKEN, GITHUB_REPOSITORY and AR_PR_NUMBER (set by the Action on pull_request events)'
    );
  }
  const body = renderComment(audit(root));
  const result = await upsertPrComment({ token, repo, prNumber, body });
  console.log(`agentready: ${result.action} PR comment (id ${result.id})`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`agentready: ${err.message}`);
    process.exit(1);
  });
}
