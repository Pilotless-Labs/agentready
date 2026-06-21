import { createContext } from './context.js';
import { allChecks } from './checks/index.js';

/**
 * Run every check against the repo at `root`.
 *
 * Each check returns { score: 0..1, details?, fix? }; the runner attaches the
 * check's id/title/weight and rolls everything up into a weighted 0-100 total.
 */
export function audit(root, checks = allChecks) {
  const ctx = createContext(root);
  const results = checks.map((check) => {
    let outcome;
    try {
      outcome = check.run(ctx);
    } catch (err) {
      outcome = { score: 0, details: `check crashed: ${err.message}`, fix: null };
    }
    return {
      id: check.id,
      title: check.title,
      weight: check.weight,
      score: clamp01(outcome.score),
      details: outcome.details ?? null,
      fix: outcome.score >= 1 ? null : (outcome.fix ?? null),
    };
  });

  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const weighted = results.reduce((sum, r) => sum + r.weight * r.score, 0);
  const total = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);

  return { total, grade: grade(total), results };
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function grade(total) {
  if (total >= 90) return 'A';
  if (total >= 80) return 'B';
  if (total >= 70) return 'C';
  if (total >= 60) return 'D';
  return 'F';
}
