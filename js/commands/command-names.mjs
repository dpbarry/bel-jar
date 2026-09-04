/**
 * Command naming derivations — the one place that turns a command id into the
 * names other surfaces show it by. Pure: no DOM, no globals, no registry.
 */

const MX_PREFIX = 'beljar-';

/**
 * Emacs `M-x` name. Derived from the id (`edit.format` → `beljar-edit-format`)
 * unless the descriptor states one explicitly.
 */
export function mxNameFor(id, explicit) {
  if (explicit) return String(explicit);
  const slug = String(id == null ? '' : id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? MX_PREFIX + slug : '';
}

/** Vim ex aliases as a deduped array. Accepts a string, an array, or nothing. */
export function exNamesFor(ex) {
  const raw = ex == null ? [] : (Array.isArray(ex) ? ex : [ex]);
  const out = [];
  for (const name of raw) {
    const clean = String(name == null ? '' : name).trim().replace(/^:+/, '');
    if (clean && out.indexOf(clean) < 0) out.push(clean);
  }
  return out;
}

/** Sentence-ish title from an id, for descriptors that omit one. */
export function titleFor(id, explicit) {
  if (explicit) return String(explicit);
  const tail = String(id == null ? '' : id).split('.').pop() || '';
  const words = tail.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(id || '');
}
