import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [join(root, 'editor-src', 'bel-editor.mjs')],
  bundle: true,
  format: 'iife',
  globalName: 'BelJarEditor',
  outfile: join(root, 'js', 'editor-cm.bundle.js'),
  platform: 'browser',
  legalComments: 'none',
  minify: true,
});

console.log('Wrote js/editor-cm.bundle.js');
