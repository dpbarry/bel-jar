import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const js = (...parts) => join(here, '..', 'js', ...parts);

/** Generated persist graph (authored persist/*.mjs → persist.js). */
export const PERSIST_BUNDLE = 'persist/persist.js';

export function persistStackSource() {
  return readFileSync(js(PERSIST_BUNDLE), 'utf8');
}

export function runPersistStackInContext(ctx) {
  vm.runInContext(persistStackSource(), ctx);
  return ctx.Persist;
}

export async function importPersistStack(g = globalThis) {
  const src = persistStackSource();
  // eslint-disable-next-line no-new-func
  new Function('window', src)(g);
  return g.Persist || globalThis.Persist;
}
