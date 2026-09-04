/**
 * What the command line offers as you type. Pure: sources are injected, so this
 * is testable without a registry, a document or a DOM.
 *
 * Two layers, in the order the user perceives them:
 *   1. GHOST TEXT — the single best continuation, inline and weightless. This is
 *      the 80% case and needs no list at all.
 *   2. CANDIDATES — the ranked rest, for when the ghost is not what you meant.
 *
 * Completion is argument-aware: after `e ` the source switches from command
 * names to file paths, because the parser says the caret is in slot 1.
 */
import { parseCommandLine, tokenAtCaret } from './status-strip-parse.mjs';

/** Subsequence score; higher is better. Word starts and prefixes win. */
export function score(query, text) {
  const q = String(query || '').toLowerCase();
  const t = String(text || '');
  const tl = t.toLowerCase();
  if (!q) return 0;
  if (q.length > tl.length) return -1;
  let s = 0;
  let prev = -2;
  let from = 0;
  for (let i = 0; i < q.length; i += 1) {
    const idx = tl.indexOf(q[i], from);
    if (idx < 0) return -1;
    let step = 1;
    if (idx === prev + 1) step += 4;
    const before = idx > 0 ? t[idx - 1] : '';
    if (idx === 0 || before === ' ' || before === '-' || before === '.' || before === '/') step += 6;
    s += step;
    prev = idx;
    from = idx + 1;
  }
  if (tl.startsWith(q)) s += 8;
  return s;
}

/**
 * A title matches only on a CONTIGUOUS run, never as a scattered subsequence.
 *
 * A command line is where you type a name, not a description. Scoring titles
 * the same loose way as names made `:ru` offer Format Document, through the `r`
 * of "Format" and the `u` of "Document" — and there is no reading of `:ru` that
 * means that.
 */
function labelScore(query, label) {
  const t = String(label || '').toLowerCase();
  const at = t.indexOf(String(query || '').toLowerCase());
  if (at < 0) return -1;
  const before = at > 0 ? t[at - 1] : '';
  return at === 0 ? 6 : (before === ' ' || before === '-' ? 4 : 1);
}

function rank(query, entries, limit) {
  if (!query) return entries.slice(0, limit || 30);
  const scored = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    // Names — the ex alias, the id, and every other alias — take the fuzzy
    // score; titles take the strict one.
    let best = score(query, e.value);
    for (const alias of e.aliases || []) best = Math.max(best, score(query, alias));
    best = Math.max(best, labelScore(query, e.label));
    if (best >= 0) scored.push({ e, best, i });
  }
  scored.sort((a, b) => b.best - a.best || a.i - b.i);
  return scored.slice(0, limit || 30).map((x) => x.e);
}

/**
 * `sources` supplies what the caret's slot needs:
 *   commands() → [{ value, label, detail, args }]   value is the ex name typed
 *   files()    → [{ value, label }]
 *   options()  → [{ value, label }]
 */
export function complete(raw, caret, sources) {
  const src = sources || {};
  const parsed = parseCommandLine(raw, caret);
  const token = tokenAtCaret(parsed);

  if (parsed.kind === 'line') {
    return { parsed, kind: 'line', items: [], ghost: '', token };
  }

  // Slot 0 (or an empty line): the user is naming a command.
  if (parsed.kind === 'empty' || parsed.slot === 0) {
    const all = (src.commands && src.commands()) || [];
    const items = rank(token.text, all, 30);
    return { parsed, kind: 'command', items, ghost: ghostFor(token.text, items), token };
  }

  // Later slots: what the named command says it takes.
  const all = (src.commands && src.commands()) || [];
  const cmd = all.find((c) => c.value === parsed.name)
    || all.find((c) => Array.isArray(c.aliases) && c.aliases.indexOf(parsed.name) >= 0);
  const argKind = cmd && cmd.args && cmd.args[parsed.slot - 1] ? cmd.args[parsed.slot - 1].kind : null;
  const pool = argKind === 'file' ? (src.files && src.files()) || []
    : argKind === 'option' ? (src.options && src.options()) || []
      : [];
  const items = rank(token.text, pool, 30);
  return { parsed, kind: argKind || 'none', items, ghost: ghostFor(token.text, items), token };
}

/** The tail of the best candidate, shown inline after the caret. */
export function ghostFor(typed, items) {
  const q = String(typed || '');
  if (!q || !items || !items.length) return '';
  const best = items[0].value || '';
  if (!best.toLowerCase().startsWith(q.toLowerCase())) return '';
  return best.slice(q.length);
}

/** Apply a candidate to the line, returning the new text and caret. */
export function applyCompletion(raw, caret, value) {
  const parsed = parseCommandLine(raw, caret);
  const token = tokenAtCaret(parsed);
  const text = String(raw == null ? '' : raw);
  const next = text.slice(0, token.from) + value + text.slice(token.to);
  return { text: next, caret: token.from + value.length };
}
