// The corpus the runtime benchmark and the differential run on: the bundled
// library, as units the app would check. A folder with a .cfg is ONE unit, its
// primary cfg assembled the way the corpus tools assemble it (assembleCfgProgram:
// CRLF to LF, nested cfgs inlined); every .bel no suite claims is a unit alone.
// Members are not also checked alone: most only make sense after their prelude.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primarySuiteCfgName } from '../../tests/_library-cfg.mjs';
import { assembleCfgProgram } from '../../js/editor-src/prover/prover-corpus-decls.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(root, 'library', 'data');

function walkDirs(dir, out = []) {
  out.push(dir);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walkDirs(join(dir, e.name), out);
  }
  return out;
}

function rel(p) {
  return relative(DATA, p).split('\\').join('/');
}

// [{ name, kind: 'suite'|'file', code, bytes }], in a stable order.
export function libraryUnits() {
  const units = [];
  const claimed = new Set();
  for (const dir of walkDirs(DATA)) {
    const cfg = primarySuiteCfgName(dir);
    if (!cfg) continue;
    const readFile = (name) => {
      const p = join(dir, name);
      if (!existsSync(p)) return null;
      claimed.add(p.toLowerCase());
      return readFileSync(p, 'utf8');
    };
    const { code, unresolved } = assembleCfgProgram(readFileSync(join(dir, cfg), 'utf8'), readFile);
    if (!code.trim()) continue;
    units.push({ name: rel(dir) + ' [' + cfg + ']', kind: 'suite', code, unresolved });
  }
  for (const dir of walkDirs(DATA)) {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (!/\.bel$/i.test(f) || claimed.has(p.toLowerCase())) continue;
      units.push({ name: rel(p), kind: 'file', code: readFileSync(p, 'utf8').replace(/\r\n?/g, '\n') });
    }
  }
  units.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const u of units) u.bytes = Buffer.byteLength(u.code, 'utf8');
  return units;
}

// Inputs whose checking recursion grows with n, for "how deep before it
// overflows". Each is valid Beluga at every n (checked at small n before a
// search trusts it), so the first n that fails is the stack, not the input.
export const DEPTH_FAMILIES = {
  // s (s (... z)): nesting in the parser, reconstruction, normalisation, printing.
  term(n) {
    return 'LF nat : type =\n| z : nat\n| s : nat -> nat\n;\n\nlet x : [ |- nat] = [ |- '
      + 's ('.repeat(n) + 'z' + ')'.repeat(n) + '];\n';
  },
  // nat -> nat -> ... -> type: a kind n arrows long.
  arrows(n) {
    return 'LF nat : type =\n| z : nat\n| s : nat -> nat\n;\n\nLF big : '
      + 'nat -> '.repeat(n) + 'type =\n;\n';
  },
  // let y1 = x in let y2 = y1 in ...: a computation n lets deep.
  lets(n) {
    let body = 'y' + n;
    for (let i = n; i >= 1; i--) body = 'let y' + i + ' = ' + (i === 1 ? 'x' : 'y' + (i - 1)) + ' in\n' + body;
    return 'LF nat : type =\n| z : nat\n| s : nat -> nat\n;\n\nrec f : [ |- nat] -> [ |- nat] =\nfn x =>\n' + body + '\n;\n';
  },
  // n declarations, each using the one before: a long signature.
  decls(n) {
    let out = 'LF nat : type =\n| z : nat\n| s : nat -> nat\n;\n\nrec f0 : [ |- nat] -> [ |- nat] = fn x => x;\n';
    for (let i = 1; i <= n; i++) out += 'rec f' + i + ' : [ |- nat] -> [ |- nat] = fn x => f' + (i - 1) + ' x;\n';
    return out;
  },
};

export const OVERFLOW_RE = /stack.?overflow|maximum call stack|too much recursion/i;

// posix.join keeps names readable in the JSON on Windows too.
export const unitKey = (u) => posix.normalize(u.name);
