// Pure fuzzy ranker (same scoring as the command palette). Duplicated here so
// the editor bundle does not cross the shell runtime seam.

export function fuzzyScore(query, text) {
  if (!query) return { score: 0, positions: [] };
  const t = String(text || '');
  const q = query.toLowerCase();
  const tl = t.toLowerCase();
  if (q.length > tl.length) return null;
  let score = 0;
  let prev = -2;
  let from = 0;
  const positions = [];
  for (let qi = 0; qi < q.length; qi++) {
    const idx = tl.indexOf(q[qi], from);
    if (idx < 0) return null;
    let s = 1;
    if (idx === prev + 1) s += 4;
    const before = idx > 0 ? t[idx - 1] : '';
    const isWordStart = idx === 0 || before === ' ' || before === '-' || before === '_'
      || before === '.' || before === '/' || before === ':';
    const isHump = t[idx] >= 'A' && t[idx] <= 'Z' && before >= 'a' && before <= 'z';
    if (isWordStart || isHump) s += 6;
    score += s;
    positions.push(idx);
    prev = idx;
    from = idx + 1;
  }
  const spread = positions[positions.length - 1] - positions[0] - (q.length - 1);
  score -= Math.floor(spread * 0.5);
  if (positions[0] === 0) score += 3;
  return { score, positions };
}
