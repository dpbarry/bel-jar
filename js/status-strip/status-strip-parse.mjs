/**
 * The command line's grammar. Pure: no DOM, no registry, no globals.
 *
 * This is what makes the bar a *command line* rather than a second palette: a
 * palette picks an item, this takes arguments, a bang, and a line address.
 *
 *   42        42:8        jump to a line (and column)
 *   fmt       format      a command by its ex alias, id or title
 *   w!                    the bang: "do it anyway"
 *   e util.bel            a command with an argument
 *   set nu                a command with an option argument
 *
 * `slot` is which argument the caret sits in, which is how completion knows to
 * offer file paths after `e ` instead of more command names.
 */

const LINE_RE = /^(\d+)(?::(\d+))?$/;

/** Split on runs of spaces, keeping the offset each token started at. */
function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) out.push({ text: m[0], from: m.index, to: m.index + m[0].length });
  return out;
}

/**
 * @param {string} raw   the whole line, without its leading `:` or `M-x `
 * @param {number} caret caret offset within `raw`; defaults to the end
 */
export function parseCommandLine(raw, caret) {
  const text = String(raw == null ? '' : raw);
  const at = Number.isFinite(caret) ? Math.max(0, Math.min(caret, text.length)) : text.length;
  const tokens = tokenize(text);
  const base = { raw: text, caret: at, tokens, bang: false, name: '', args: [], argText: '' };

  if (!tokens.length) return { ...base, kind: 'empty', slot: 0 };

  const head = tokens[0].text;
  const lineHit = LINE_RE.exec(head);
  if (lineHit && tokens.length === 1) {
    const line = parseInt(lineHit[1], 10);
    const col = lineHit[2] != null ? parseInt(lineHit[2], 10) : 1;
    return { ...base, kind: 'line', line, col: Number.isFinite(col) && col > 0 ? col : 1, slot: 0 };
  }

  const bang = head.endsWith('!') && head.length > 1;
  const name = bang ? head.slice(0, -1) : head;
  const args = tokens.slice(1).map((t) => t.text);
  const argText = tokens.length > 1 ? text.slice(tokens[1].from) : '';

  // Which token the caret is in or immediately after. Typing `e ` with the caret
  // past the space is already slot 1, so file completion starts before the first
  // character of the path is typed.
  let slot = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (at >= tokens[i].from) slot = i;
  }
  if (at > tokens[tokens.length - 1].to) slot = tokens.length;

  return { ...base, kind: 'command', bang, name, args, argText, slot };
}

/** The word the caret is inside, and where it starts — what a completion replaces. */
export function tokenAtCaret(parsed) {
  const { tokens, caret } = parsed;
  for (const t of tokens) {
    if (caret >= t.from && caret <= t.to) return t;
  }
  return { text: '', from: caret, to: caret };
}

/** A line address as an editor jump, or null. */
export function lineTarget(parsed) {
  if (!parsed || parsed.kind !== 'line') return null;
  return { line: parsed.line, col: parsed.col };
}
