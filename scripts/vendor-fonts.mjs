import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'fonts');
mkdirSync(out, { recursive: true });

const copies = [
  ['node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2', 'inter-latin-400-normal.woff2'],
  ['node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2', 'inter-latin-500-normal.woff2'],
  ['node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2', 'inter-latin-600-normal.woff2'],
  [
    'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-400-normal.woff2',
  ],
  [
    'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2',
    'jetbrains-mono-latin-700-normal.woff2',
  ],
];

for (const [rel, name] of copies) {
  copyFileSync(join(root, rel), join(out, name));
}

console.log('Copied fonts to assets/fonts/');
