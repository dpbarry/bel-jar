// Merge a source declaration signature with Beluga's reconstructed type.
// Source keeps every explicit leading binder the user wrote; reconstruction
// adds inferred binders (e.g. (N : nat) on vcons) and supplies the elaborated body.

export function declSignatureAnnotation(symbol, resolved) {
  const parts = [
    symbol?.sourceText,
    resolved?.sourceType,
    resolved?.sourceText,
  ].filter((t) => t != null && String(t).trim());
  if (!parts.length) return null;
  return parts.reduce((a, b) => (String(a).length >= String(b).length ? a : b));
}

export function peelLeadingBinders(typeStr) {
  const binders = [];
  let rest = String(typeStr ?? '').trim();
  while (rest.length) {
    const open = rest[0];
    if (open !== '(' && open !== '{') break;
    const close = open === '(' ? ')' : '}';
    let i = 1;
    let depth = 1;
    while (i < rest.length && depth > 0) {
      const ch = rest[i];
      if (ch === open) depth += 1;
      else if (ch === close) depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const text = rest.slice(0, i);
    const inner = rest.slice(1, i - 1).trim();
    const colon = inner.search(/^\s*[^\s:{}()]+\s*:/);
    if (colon < 0) break;
    const nameMatch = inner.match(/^([^\s:{}()]+)\s*:\s*(.*)$/s);
    if (!nameMatch) break;
    binders.push({
      text,
      name: nameMatch[1],
      type: nameMatch[2].trim(),
    });
    rest = rest.slice(i).trim();
  }
  return { binders, rest };
}

export function mergeDeclSignatures(source, reconstructed) {
  if (!reconstructed) return source ?? null;
  if (!source) return reconstructed;
  const s = peelLeadingBinders(source);
  const r = peelLeadingBinders(reconstructed);
  const seen = new Set(s.binders.map((b) => b.name));
  const prefix = [...s.binders.map((b) => b.text)];
  for (const b of r.binders) {
    if (!seen.has(b.name)) {
      prefix.push(b.text);
      seen.add(b.name);
    }
  }
  const body = (r.rest && r.rest.trim()) ? r.rest : s.rest;
  if (!prefix.length) return body || reconstructed;
  if (!body) return prefix.join(' ');
  return `${prefix.join(' ')} ${body}`.trim();
}
