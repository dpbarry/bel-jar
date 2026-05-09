// Wadler/Leijen-style pretty-print documents + greedy width-fit renderer.
// Consumed by format/printer.mjs; `render` is also used by the format driver.

const TEXT = 0;
const LINE = 1;
const HARDLINE = 2;
const SOFTLINE = 3;
const NEST = 4;
const ALIGN = 5;
const GROUP = 6;
const CONCAT = 7;
const BLANKLINE = 8;

export const text = (s) => ({ k: TEXT, s });
export const line = { k: LINE };
export const hardline = { k: HARDLINE };
export const blankline = { k: BLANKLINE };
export const softline = { k: SOFTLINE };
export const nest = (n, d) => ({ k: NEST, n, d });
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

function fits(width, used, frame) {
  let w = width - used;
  const local = [frame];
  while (local.length) {
    if (w < 0) return false;
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
        return true;
      case NEST:
        local.push([d.d, ind + d.n, mode]);
        break;
      case ALIGN:
        local.push([d.d, ind, mode]);
        break;
      case GROUP:
        local.push([d.d, ind, FLAT]);
        break;
      case CONCAT:
        for (let i = d.ds.length - 1; i >= 0; i--) local.push([d.ds[i], ind, mode]);
        break;
    }
  }
  return w >= 0;
}

export function render(doc, width = 80) {
  const out = [];
  const stack = [[doc, 0, BREAK]];
  let col = 0;

  while (stack.length) {
    const [d, ind, mode] = stack.pop();
    switch (d.k) {
      case TEXT:
        out.push(d.s);
        col += d.s.length;
        break;
      case LINE:
        if (mode === FLAT) {
          out.push(' ');
          col += 1;
        } else {
          out.push('\n', ' '.repeat(ind));
          col = ind;
        }
        break;
      case SOFTLINE:
        if (mode === BREAK) {
          out.push('\n', ' '.repeat(ind));
          col = ind;
        }
        break;
      case HARDLINE:
        out.push('\n', ' '.repeat(ind));
        col = ind;
        break;
      case BLANKLINE:
        out.push('\n\n', ' '.repeat(ind));
        col = ind;
        break;
      case NEST:
        stack.push([d.d, ind + d.n, mode]);
        break;
      case ALIGN:
        stack.push([d.d, col, mode]);
        break;
      case GROUP:
        if (fits(width, col, [d.d, ind, FLAT])) stack.push([d.d, ind, FLAT]);
        else stack.push([d.d, ind, BREAK]);
        break;
      case CONCAT:
        for (let i = d.ds.length - 1; i >= 0; i--) stack.push([d.ds[i], ind, mode]);
        break;
    }
  }
  return out.join('');
}
