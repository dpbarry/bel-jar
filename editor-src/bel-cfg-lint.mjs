// Validate a .cfg's load order against the project. Every entry must resolve to
// an existing sibling file; a dangling or misspelled entry is otherwise silently
// dropped by resolveCfgOrder's pathSet filter (development.mjs), so a broken cfg
// looks identical to a correct one. This surfaces the problem on the bad line.
import { linter } from '@codemirror/lint';
import { dirOf, joinPath } from './development.mjs';
import { analyzeSuite, findingMessage } from './bel-suite-lint.mjs';
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

// Resolve a suite entry's stored text by full project path. Suite files load in
// cfg order, so cross-file lints need to read EARLIER entries' source — not just
// know their names. Returns '' when content is unavailable (headless/tests pass
// their own getText; live editor supplies one over the persist registry).
function makeRegistryGetText() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const P = g.BelJarPersist;
  if (!P || typeof P.listFiles !== 'function' || typeof P.getFileText !== 'function') return null;
  let byName = null;
  return (fullPath) => {
    if (!byName) {
      byName = new Map();
      try {
        for (const f of P.listFiles()) byName.set(String(f.name), f.id);
      } catch (_) { return ''; }
    }
    const id = byName.get(String(fullPath));
    if (!id) return '';
    try { return String(P.getFileText(id) ?? ''); } catch (_) { return ''; }
  };
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

// Cross-file suite-composition lints, anchored on the CFG entry lines. Delegates
// the analysis to the shared `analyzeSuite` (also used by the settlement to show
// the same findings inside the offending .bel file). Needs the earlier entries'
// source, so runs only when a `getText(fullPath)` resolver is supplied.
function suiteCompositionDiagnostics(entries, getText) {
  if (typeof getText !== 'function' || entries.length < 2) return [];
  const byKey = new Map(entries.map((e) => [e.full, e]));
  const name = (key) => (byKey.get(key)?.name ?? key);
  const findings = analyzeSuite(entries.map((e) => ({ key: e.full, text: getText(e.full) })));
  return findings.map((f) => {
    const anchor = byKey.get(f.at);
    return {
      from: anchor.from, to: anchor.to, severity: f.severity, source: 'cfg',
      message: findingMessage(f, name),
    };
  });
}

// Pure: diagnostics for a cfg document at `cfgPath` given the set of project file
// names. `getText(fullPath)` (optional) enables cross-file suite-composition
// lints. Exported for tests; the linter wrapper supplies the live registry.
export function cfgDiagnosticsFor(text, cfgPath, names, getText = null) {
  if (!names) return [];
  const cfgDir = dirOf(String(cfgPath || ''));
  const diags = [];
  const entries = [];
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
      continue;
    }
    // Source entries feed the cross-file checks; nested .cfg includes don't.
    if (!low.endsWith('.cfg')) entries.push({ name: t, full, from, to });
  }
  for (const d of suiteCompositionDiagnostics(entries, getText)) diags.push(d);
  return diags;
}

export function cfgDiagnostics(doc, documentId) {
  const cfgPath = resolveCfgDocumentPath(documentId);
  return cfgDiagnosticsFor(doc.toString(), cfgPath, projectFileNames(), makeRegistryGetText());
}

export function cfgLinter(documentId) {
  return linter(
    (view) => cfgDiagnostics(view.state.doc, documentId),
    lintLinterOptions({ delay: 120 }),
  );
}
