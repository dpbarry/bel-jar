import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Load generated workspace graph (includes ProjectSource) into `g`. */
export function loadProjectSource(g = globalThis) {
  const src = readFileSync(join(root, 'js', 'workspace', 'workspace.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', src)(g);
  return g.ProjectSource;
}

export function projectSourceStackSource() {
  return readFileSync(join(root, 'js', 'workspace', 'workspace.js'), 'utf8');
}

/** Same artifact — also publishes ExplorerSuiteLayout / workspace chrome. */
export function loadWorkspace(g = globalThis) {
  loadProjectSource(g);
  return g;
}
