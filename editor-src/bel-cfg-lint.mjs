// Validate a .cfg's load order against the project. Every entry must resolve to
// an existing sibling file; a dangling or misspelled entry is otherwise silently
// dropped by resolveCfgOrder's pathSet filter (development.mjs), so a broken cfg
// looks identical to a correct one. This surfaces the problem on the bad line.
import { linter } from '@codemirror/lint';
import { dirOf, joinPath } from './development.mjs';
import { lintLinterOptions } from './bel-lint-presentation.mjs';

function projectFileNames() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function') return null; // headless/tests: skip
  try {
    const set = new Set();
    for (const f of P.listFiles()) set.add(String(f.name));
    return set;
  } catch (_) {
    return null;
  }
}

// File ids are stable (`workspace://…`) but `name` changes on rename/move — lint
// against the live registry path, not the path baked into the id at creation.
export function resolveCfgDocumentPath(documentId) {
  const raw = String(documentId || '');
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (P && typeof P.getFileById === 'function') {
    const f = P.getFileById(raw);
    if (f && f.name) return String(f.name);
  }
  return raw.replace(/^workspace:\/\//, '');
}

// Pure: diagnostics for a cfg document at `cfgPath` given the set of project file
// names. Exported for tests; the linter wrapper supplies the live registry.
export function cfgDiagnosticsFor(text, cfgPath, names) {
  if (!names) return [];
  const cfgDir = dirOf(String(cfgPath || ''));
  const diags = [];
  let pos = 0;
  for (const rawLine of String(text).split('\n')) {
    const lineStart = pos;
    pos += rawLine.length + 1; // + newline
    const t = rawLine.trim();
    if (!t || t.charAt(0) === '%') continue;
    const low = t.toLowerCase();
    const isEntry = low.endsWith('.bel') || low.endsWith('.elf') || low.endsWith('.cfg');
    const from = lineStart + rawLine.indexOf(t);
    const to = from + t.length;
    if (!isEntry) {
      diags.push({ from, to, severity: 'warning', source: 'cfg',
        message: `"${t}" is not a .bel, .elf, or .cfg entry.` });
      continue;
    }
    const full = cfgDir ? joinPath(cfgDir, t) : t;
    if (!names.has(full)) {
      diags.push({ from, to, severity: 'error', source: 'cfg',
        message: `No file "${full}" in this project. This entry is ignored.` });
    }
  }
  return diags;
}

export function cfgDiagnostics(doc, documentId) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  return cfgDiagnosticsFor(doc.toString(), cfgPath, projectFileNames());
}

export function cfgLinter(documentId) {
  return linter(
    (view) => cfgDiagnostics(view.state.doc, documentId),
    lintLinterOptions({ delay: 120 }),
  );
}
