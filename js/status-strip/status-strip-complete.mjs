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
    // ⛔ The bang is GRAMMAR, not part of the name — `parseCommandLine` already
    // splits it off into `parsed.bang`. Ranking the raw token meant `:w!`, the
    // most-typed ex command there is, matched no command name, emptied the list
    // and turned the line red. Same failure as `:set ts=`, one slot to the left.
    const bang = !!parsed.bang && token.text.endsWith('!');
    const typed = bang ? token.text.slice(0, -1) : token.text;
    const items = rank(typed, all, 30);
    return {
      parsed,
      kind: 'command',
      items,
      // A completion cannot land after the `!` without eating it.
      ghost: bang ? '' : ghostFor(typed, items),
      token: bang ? { text: typed, from: token.from, to: token.to - 1 } : token,
    };
  }

  // Later slots: what the named command says it takes.
  const all = (src.commands && src.commands()) || [];
  const cmd = all.find((c) => c.value === parsed.name)
    || all.find((c) => Array.isArray(c.aliases) && c.aliases.indexOf(parsed.name) >= 0);
  const argKind = cmd && cmd.args && cmd.args[parsed.slot - 1] ? cmd.args[parsed.slot - 1].kind : null;
  // `known` is what the LINE is: a real command name, whatever the argument
  // after it looks like. `:set ts=` is a valid line being typed, and marking it
  // unknown because no OPTION is spelled `ts=` was the completer overruling the
  // parser about a grammar the parser already implements.
  const known = !!cmd;
  if (argKind === 'option') return { ...completeOption(parsed, token, src), known };
  // ⛔ `command` is the argument kind that makes VIM'S line reach all of BelJar.
  // Only ~20 BelJar commands have an ex alias, so on vim's `:` the other hundred
  // are reachable only through the `:BJ` catch-all — and a catch-all you have to
  // spell from memory is not reach, it is trivia. Completing its argument is
  // what turns it into the same line the other two styles have.
  let pool = [];
  if (argKind === 'file') pool = (src.files && src.files()) || [];
  else if (argKind === 'command') pool = (src.commandNames && src.commandNames()) || [];
  const items = rank(token.text, pool, 30);
  return { parsed, kind: argKind || 'none', items, ghost: ghostFor(token.text, items), token, known };
}

/**
 * `:set` takes a GRAMMAR, not a bare name.
 *
 * ⛔ `parseSet` has always understood `nu`, `nonu`, `nu!` and `ts=4`; the
 * completer only understood `nu`. So the moment you typed the `=` of `:set
 * ts=4` the candidate list emptied, the legend said "No matching command" and
 * the whole line went red — while the line was perfectly valid and Enter would
 * have run it. Two halves of one grammar, and only one of them knew it.
 *
 *   `ts=`   → complete the VALUE against that setting's own values
 *   `nu!`   → the `!` is "toggle", not part of the name being completed
 *   `nonu`  → handled by the pool, which carries the `no` forms
 *
 * The token that comes back is the span a completion REPLACES, which for a
 * value is only the part after the `=`.
 */
function completeOption(parsed, token, src) {
  const eq = token.text.indexOf('=');
  if (eq >= 0) {
    const name = token.text.slice(0, eq);
    const typed = token.text.slice(eq + 1);
    const pool = (src.optionValues && src.optionValues(name)) || [];
    const items = rank(typed, pool, 30);
    return {
      parsed,
      kind: 'option-value',
      option: name,
      items,
      ghost: ghostFor(typed, items),
      token: { text: typed, from: token.from + eq + 1, to: token.to },
    };
  }
  const bang = token.text.endsWith('!');
  const typed = bang ? token.text.slice(0, -1) : token.text;
  const pool = (src.options && src.options()) || [];
  const items = rank(typed, pool, 30);
  return {
    parsed,
    kind: 'option',
    items,
    // A completion cannot land after the `!` without eating it.
    ghost: bang ? '' : ghostFor(typed, items),
    token: bang ? { text: typed, from: token.from, to: token.to - 1 } : token,
  };
}

/** The tail of the best candidate, shown inline after the caret. */
export function ghostFor(typed, items) {
  const q = String(typed || '');
  if (!q || !items || !items.length) return '';
  const best = items[0].value || '';
  if (!best.toLowerCase().startsWith(q.toLowerCase())) return '';
  return best.slice(q.length);
}

/**
 * Apply a candidate to the line, returning the new text and caret.
 *
 * `token` is the span the completion replaces. Pass the one `complete()`
 * returned: for an option VALUE that is only the part after the `=`, and
 * re-deriving it here would put `4` where `ts=4` belongs.
 */
export function applyCompletion(raw, caret, value, token) {
  const text = String(raw == null ? '' : raw);
  const span = token || tokenAtCaret(parseCommandLine(raw, caret));
  const next = text.slice(0, span.from) + value + text.slice(span.to);
  return { text: next, caret: span.from + String(value).length };
}
