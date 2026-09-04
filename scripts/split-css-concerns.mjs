import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function splitFile(rel, parts) {
  const src = join(root, rel);
  const current = readFileSync(src, 'utf8');
  if (current.includes('import-only cascade')) {
    console.log(`skip ${rel} (already split)`);
    return;
  }
  const lines = current.split(/\r?\n/);
  const dir = dirname(src);
  const base = basename(src, '.css');
  for (const [name, start, end] of parts) {
    const chunk = lines.slice(start - 1, end).join('\n').trimEnd() + '\n';
    writeFileSync(join(dir, name), chunk);
  }
  const imports = parts.map(([name]) => `@import url('./${name}');`).join('\n');
  writeFileSync(src, `/* ${base} — import-only cascade. Rules live in sibling files. */\n${imports}\n`);
  console.log(`split ${rel}`);
}

const SPLITS = {
  'css/dialogs.css': [
    ['dialogs-base.css', 1, 196],
    ['dialogs-library-preview.css', 197, 556],
    ['dialogs-settings.css', 557, 981],
    ['dialogs-keybindings.css', 982, 1269],
    ['dialogs-aliases.css', 1270, 99999],
  ],
  'css/harpoon.css': [
    ['harpoon-panel.css', 1, 98],
    ['harpoon-lab.css', 99, 2055],
    ['harpoon-orca.css', 2056, 3160],
    ['harpoon-tree.css', 3161, 99999],
  ],
  'css/library.css': [
    ['library-panel.css', 1, 332],
    ['library-find.css', 333, 993],
    ['library-preview.css', 994, 99999],
  ],
  'css/repl.css': [
    ['repl-panel.css', 1, 151],
    ['repl-results.css', 152, 882],
    ['repl-stream.css', 883, 99999],
  ],
  'css/inspector.css': [
    ['inspector-panel.css', 1, 142],
    ['inspector-header.css', 143, 345],
    ['inspector-detail.css', 346, 682],
    ['inspector-overview.css', 683, 99999],
  ],
};

for (const [rel, parts] of Object.entries(SPLITS)) {
  if (!existsSync(join(root, rel))) {
    console.warn(`missing ${rel}`);
    continue;
  }
  splitFile(rel, parts);
}
