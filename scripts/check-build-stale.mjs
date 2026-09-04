import { statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsRoot = join(root, 'js');

const SHELL_PAIRS = [
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
  'commands/command-registry.mjs',
  'ui/double-tap.mjs',
  'status-strip/status-strip-view.mjs',
  'ui/keybindings.mjs',
  'ui/command-palette.mjs',
  'ui/scroll-fade.mjs',
  'ui/toasts.mjs',
  'ui/name-conflicts.mjs',
  'repl/repl-output.mjs',
  'boot/early-boot.mjs',
  'boot/panel-restore.mjs',
  'boot/error-hook.mjs',
  'shell.mjs',
];

const EDITOR_BUNDLE = join(jsRoot, 'editor-cm.bundle.js');
const EDITOR_ENTRY = join(root, 'scripts', 'build-editor.mjs');

function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

function newestMtime(dir, ext) {
  let newest = 0;
  for (const rel of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!rel.isFile() || !rel.name.endsWith(ext)) continue;
    const full = join(rel.parentPath || rel.path, rel.name);
    const t = mtime(full);
    if (t != null && t > newest) newest = t;
  }
  return newest;
}

const stale = [];

for (const rel of SHELL_PAIRS) {
  const mjs = join(jsRoot, rel);
  const js = join(jsRoot, rel.replace(/\.mjs$/, '.js'));
  const srcT = mtime(mjs);
  const outT = mtime(js);
  if (srcT == null) {
    stale.push(`missing source: js/${rel}`);
    continue;
  }
  if (outT == null) {
    stale.push(`missing build output: js/${rel.replace(/\.mjs$/, '.js')}`);
    continue;
  }
  if (srcT > outT) stale.push(`stale: js/${rel.replace(/\.mjs$/, '.js')} (run npm run build:shell)`);
}

const editorSrcNewest = newestMtime(join(jsRoot, 'editor-src'), '.mjs');
const editorBundleT = mtime(EDITOR_BUNDLE);
const editorBuildT = mtime(EDITOR_ENTRY);
const editorDriver = Math.max(editorSrcNewest, editorBuildT || 0);
if (editorBundleT == null) {
  stale.push('missing build output: js/editor-cm.bundle.js (run npm run build:editor)');
} else if (editorDriver > editorBundleT) {
  stale.push('stale: js/editor-cm.bundle.js (run npm run build:editor)');
}

if (stale.length) {
  console.error('Build outputs are older than their sources:\n');
  for (const line of stale) console.error(`  ${line}`);
  process.exit(1);
}

console.log('OK build outputs are up to date');
