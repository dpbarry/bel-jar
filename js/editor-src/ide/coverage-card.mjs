// Beluga's coverage printer wraps a list of missing cases in hash banners.
// One splitter feeds both the case-fill patterns and the diagnostic card.

function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && c === sep) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function assumptionsOf(prefix) {
  const out = [];
  for (const clause of splitTopLevel(prefix, ';')) {
    for (const bit of splitTopLevel(clause, ',')) out.push(bit);
  }
  return out;
}

// The index of the top-level `|-`, or -1. Turnstiles nested in a type do not count.
function topLevelTurnstile(item) {
  let depth = 0;
  for (let i = 0; i < item.length - 1; i += 1) {
    const c = item[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (depth === 0 && c === '|' && item[i + 1] === '-') return i;
  }
  return -1;
}

/**
 * Numbered cases under `NOT COVERED`. Each item is
 * `{ prefix, pattern, assumptions }`: `prefix` is the text before the top-level
 * turnstile (case-fill reads a context variable out of it), `pattern` is the
 * text after it, `assumptions` is that prefix split into one binder per line.
 */
export function coverageCases(text) {
  const raw = String(text || '');
  const at = raw.indexOf('NOT COVERED');
  if (at < 0) return [];
  const end = raw.indexOf('\n##', at);
  const block = raw.slice(raw.indexOf('\n', at) + 1, end < 0 ? raw.length : end);
  const out = [];
  for (const item of block.split(/^\(\d+\)/m).map((s) => s.trim()).filter(Boolean)) {
    const turn = topLevelTurnstile(item);
    if (turn < 0) continue;
    const prefix = item.slice(0, turn);
    const pattern = item.slice(turn + 2).replace(/\s+/g, ' ').trim();
    out.push({ prefix, pattern, assumptions: assumptionsOf(prefix) });
  }
  return out;
}

function isCoverageText(text) {
  return /COVERAGE FAILURE|CASE\(S\) NOT COVERED|Cases didn't cover|CASES DID NOT COVER/i.test(text);
}

/**
 * The hover / REPL card, or null when `message` is not a coverage report.
 * Idempotent: a card already in this shape is returned unchanged.
 */
export function formatCoverageCard(message) {
  const text = String(message ?? '').trim();
  if (!text) return null;
  if (/^This case is not exhaustive\./.test(text)) return text;
  if (!isCoverageText(text)) return null;

  const cases = coverageCases(text);
  if (!cases.length) {
    const match = text.match(/Matching fails due to\s+([\s\S]+)/i);
    if (match) {
      const why = match[1].replace(/#/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
      return why
        ? `This case is not exhaustive.\n\nMatching fails due to ${why}.`
        : 'This case is not exhaustive.';
    }
    return 'This case is not exhaustive.';
  }

  const blocks = cases.map((c) => {
    const lines = [c.pattern || '(missing pattern)'];
    for (const a of c.assumptions) lines.push(`  ${a}`);
    return lines.join('\n');
  });
  return `This case is not exhaustive.\n\n${blocks.join('\n\n')}`;
}
