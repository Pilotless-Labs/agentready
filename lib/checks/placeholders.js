// Generated scaffolding (including our own `agentready fix` stubs) is full of
// TODO/FIXME/TBD lines. Content on those lines is a promise, not information,
// so the content-quality checks discount it — a repo of unfilled stubs must
// not score as agent-ready.
//
// A line counts as a placeholder when the marker starts the line (allowing
// list/quote/comment prefixes) or appears in `MARKER:` form anywhere in it.
// Mid-sentence prose mentions ("everything else says TODO") don't count.
const MARKER_COLON = /\b(TODO|FIXME|TBD|XXX)\s*:/;
const MARKER_LEADING = /^\s*(?:[-*>+]\s*)?(?:<!--\s*)?(?:#+\s*)?(TODO|FIXME|TBD|XXX)\b/;

function isPlaceholderLine(line) {
  return MARKER_COLON.test(line) || MARKER_LEADING.test(line);
}

/**
 * @returns {{ markers: number, ratio: number, stripped: string }}
 *   markers: placeholder line count; ratio: placeholder share of non-empty
 *   lines; stripped: the content with placeholder lines removed, for
 *   topic/section analysis (a topic only claimed by a TODO is not covered).
 */
export function analyzePlaceholders(content) {
  const lines = content.split('\n');
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  const markers = nonEmpty.filter(isPlaceholderLine).length;
  return {
    markers,
    ratio: nonEmpty.length === 0 ? 0 : markers / nonEmpty.length,
    stripped: lines.filter((l) => !isPlaceholderLine(l)).join('\n'),
  };
}
