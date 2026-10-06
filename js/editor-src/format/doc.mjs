const TEXT = 0;
const LINE = 1;
const HARDLINE = 2;
const SOFTLINE = 3;
const NEST = 4;
const ALIGN = 5;
const GROUP = 6;
const CONCAT = 7;
const BLANKLINE = 8;
const FRESHLINE = 9;
const LINE_SUFFIX = 10;
const LNEST = 11;

export const text = (s) => ({ k: TEXT, s });
export const line = { k: LINE };
export const hardline = { k: HARDLINE };
export const blankline = { k: BLANKLINE };
export const softline = { k: SOFTLINE };
/** A newline only when the current line already has content. */
export const freshline = { k: FRESHLINE };
/** Text held back until just before the next newline: a trailing line comment can never swallow code. */
export const lineSuffix = (s) => ({ k: LINE_SUFFIX, s });
export const nest = (n, d) => ({ k: NEST, n, d });
/** Indents by `n` past the indentation of the line it starts on, not past the enclosing nest. */
export const lnest = (n, d) => ({ k: LNEST, n, d });
export const align = (d) => ({ k: ALIGN, d });
export const group = (d) => ({ k: GROUP, d });

function flat(arr) {
  const out = [];
  for (const x of arr) {
    if (x == null || x === '') continue;
    if (Array.isArray(x)) out.push(...flat(x));
    else if (typeof x === 'string') out.push(text(x));
    else out.push(x);
  }
  return out;
}

export const concat = (...ds) => ({ k: CONCAT, ds: flat(ds) });
export const empty = text('');
export const space = text(' ');

export function join(sep, parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) out.push(sep);
    out.push(parts[i]);
  }
  return concat(...out);
}

const FLAT = 0;
const BREAK = 1;

// Does the group fit flat, together with whatever follows it up to the next possible break?
function fits(width, used, frame, rest) {
  let w = width - used;
  const local = [frame];
  let r = rest.length;
  for (;;) {
    if (w < 0) return false;
    if (!local.length) {
      if (r === 0) return true;
      local.push(rest[--r]);
      continue;
    }
    const [d, ind, mode] = local.pop();
    switch (d.k) {
      case TEXT:
        w -= d.s.length;
        break;
      case LINE:
        if (mode === FLAT) w -= 1;
        else return true;
        break;
      case SOFTLINE:
        if (mode === BREAK) return true;
        break;
      case HARDLINE:
      case BLANKLINE:
      case FRESHLINE:
        return true;
      case NEST:
      case LNEST:
        local.push([d.d, ind + d.n, mode]);
        break;
      case ALIGN:
        local.push([d.d, ind, mode]);
        break;
      case GROUP:
        local.push([d.d, ind, mode]);
        break;
      case CONCAT:
        for (let i = d.ds.length - 1; i >= 0; i--) local.push([d.ds[i], ind, mode]);
        break;
    }
  }
}

export function render(doc, width = 80) {
  const out = [];
  const stack = [[doc, 0, BREAK]];
  let col = 0;
  let lineInd = 0;
  let bol = true;
  let suffix = [];

  const newline = (ind, blank = false) => {
    if (suffix.length) {
      out.push(...suffix);
      suffix = [];
    }
    out.push(blank ? '\n\n' : '\n', ' '.repeat(ind));
    col = ind;
    lineInd = ind;
    bol = true;
  };

  while (stack.length) {
    const [d, ind, mode] = stack.pop();
    switch (d.k) {
      case TEXT:
        if (!d.s) break;
        out.push(d.s);
        col += d.s.length;
        bol = false;
        break;
      case LINE:
        if (mode === FLAT) {
          out.push(' ');
          col += 1;
        } else newline(ind);
        break;
      case SOFTLINE:
        if (mode === BREAK) newline(ind);
        break;
      case HARDLINE:
        newline(ind);
        break;
      case BLANKLINE:
        newline(ind, true);
        break;
      case FRESHLINE:
        if (!bol) newline(ind);
        break;
      case LINE_SUFFIX:
        suffix.push(d.s);
        break;
      case NEST:
        stack.push([d.d, ind + d.n, mode]);
        break;
      case LNEST:
        stack.push([d.d, lineInd + d.n, mode]);
        break;
      case ALIGN:
        stack.push([d.d, col, mode]);
        break;
      case GROUP:
        stack.push([d.d, ind, fits(width, col, [d.d, ind, FLAT], stack) ? FLAT : BREAK]);
        break;
      case CONCAT:
        for (let i = d.ds.length - 1; i >= 0; i--) stack.push([d.ds[i], ind, mode]);
        break;
    }
  }
  out.push(...suffix);
  return out.join('');
}
