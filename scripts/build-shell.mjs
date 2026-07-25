/**
 * Shell ESM → classic IIFE shipping.
 * Leaf entries remain for focused tests; `shell.mjs` is the product boot assembly.
 * Edit `.mjs` sources; run `npm run build:shell` (also part of `npm run build`).
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsRoot = join(root, 'js');

/** Authored ESM path → same path with .js (generated). */
const SHELL_ENTRIES = [
  'ui/tooltips.mjs',
  'ui/dialogs.mjs',
  'workspace/workspace.mjs',
  'persist/persist.mjs',
  'explorer/explorer.mjs',
  'library/library.mjs',
  'beluga/beluga-text.mjs',
  'beluga/beluga-run-boot.mjs',
  'harpoon/harpoon-ui.mjs',
  'app/app.mjs',
  // Focused UI/repl leaves still loaded by unit tests:
  'ui/keybindings.mjs',
  'ui/command-palette.mjs',
  'ui/scroll-fade.mjs',
  'ui/toasts.mjs',
  'ui/name-conflicts.mjs',
  'repl/repl-output.mjs',
  // Product boot (index.html):
  'shell.mjs',
];

const entryPoints = SHELL_ENTRIES.map((rel) => join(jsRoot, rel));

await esbuild.build({
  entryPoints,
  bundle: true,
  format: 'iife',
  outdir: jsRoot,
  outbase: jsRoot,
  platform: 'browser',
  legalComments: 'none',
});

for (const rel of SHELL_ENTRIES) {
  console.log(`Wrote js/${rel.replace(/\.mjs$/, '.js')}`);
}
