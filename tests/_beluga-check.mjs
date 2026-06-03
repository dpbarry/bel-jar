import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadBeluga() {
  const code = readFileSync(join(root, 'beluga_web.bc.js'), 'utf8');
  const ctx = { console, TextDecoder, TextEncoder, setTimeout, clearTimeout, globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.Beluga;
}

export function checkBel(source) {
  const Beluga = loadBeluga();
  return Beluga.checkFromString(source);
}

export function checkFile(relPath) {
  const src = readFileSync(join(root, relPath), 'utf8');
  return checkBel(src);
}

if (process.argv[2]) {
  const r = checkFile(process.argv[2]);
  console.log('ok:', r.ok);
  if (!r.ok) console.log(String(r.output));
  process.exit(r.ok ? 0 : 1);
}
