// Pure health helpers for the project diagnostics index.
// Publishing/reading lives in project-diagnostics.mjs — never persist to disk.

import { firstSyntaxErrorInText, isSuitePreludeBannerDiag } from './suite-prelude-banner.mjs';

export { isSuitePreludeBannerDiag };

function cloneItems(items) {
  return (items || []).map((d) => ({ ...d }));
}

export function healthFromDiagnostics(diags) {
  let errors = 0;
  let warnings = 0;
  const items = [];
  for (const d of diags || []) {
    const kind = d.severity === 'error' ? 'error' : 'warning';
    if (kind === 'error') errors += 1;
    else warnings += 1;
    items.push({
      line: d.line,
      msg: d.message || '',
      kind,
    });
  }
  return { errors, warnings, items };
}

export function syntaxHealthForText(text) {
  const hit = firstSyntaxErrorInText(text);
  if (!hit || hit.severity !== 'error') {
    return { errors: 0, warnings: 0, items: [] };
  }
  return {
    errors: 1,
    warnings: 0,
    items: [{ line: hit.line, msg: hit.message || 'Syntax error', kind: 'error' }],
  };
}

export function healthForMember(m, memberDiagnostics, getText, inDocDiags = []) {
  const diags = [...(memberDiagnostics?.[m.name] || []), ...inDocDiags];
  const fromBeluga = healthFromDiagnostics(diags);
  if (fromBeluga.errors > 0 || fromBeluga.warnings > 0) return fromBeluga;
  const t = typeof getText === 'function' ? getText(m.id) : m.text;
  return syntaxHealthForText(t);
}

export function belugaDiagsToFileHealth(diags, doc) {
  if (!doc) return healthFromDiagnostics([]);
  const rows = [];
  for (const d of diags || []) {
    if (isSuitePreludeBannerDiag(d)) continue;
    rows.push({
      line: doc.lineAt(Math.min(Math.max(0, d.from), doc.length)).number,
      message: d.message || '',
      severity: d.severity || 'error',
    });
  }
  return healthFromDiagnostics(rows);
}

/** Own-file rows for explorer/tab dots: drop suite-prelude banner. */
export function ownDiagRowsFromDiagnostics(diags, doc) {
  if (!doc) return [];
  const rows = [];
  for (const d of diags || []) {
    if (isSuitePreludeBannerDiag(d)) continue;
    const from = Math.min(Math.max(0, d.from || 0), doc.length);
    rows.push({
      line: doc.lineAt(from).number,
      message: d.message || '',
      severity: d.severity || 'error',
    });
  }
  return rows;
}

/** Prefer live-then-persisted dev-check cache so sibling dots stay stable while typing. */
export function devCheckCacheLookup(dc, liveMembers, persistedMembers) {
  if (!dc) return null;
  const live = Array.isArray(liveMembers) ? liveMembers : [];
  const persisted = Array.isArray(persistedMembers) ? persistedMembers : [];
  return dc.cachedFor(live) || (persisted.length ? dc.cachedFor(persisted) : null);
}

export function resolveExplorerFileHealth({
  file,
  text,
  memberDiagnostics,
  devCheckCached,
  activeBelugaHealth,
  isActiveFile,
}) {
  if (!file?.name) return { errors: 0, warnings: 0, items: [] };
  const src = text ?? '';

  const syntax = syntaxHealthForText(src);
  if (syntax.errors) return syntax;

  if (isActiveFile && activeBelugaHealth && (activeBelugaHealth.errors || activeBelugaHealth.warnings)) {
    return activeBelugaHealth;
  }

  if (devCheckCached) {
    const list = memberDiagnostics?.[file.name];
    if (list?.length) return healthFromDiagnostics(list);
    return { errors: 0, warnings: 0, items: [] };
  }

  if (isActiveFile && activeBelugaHealth) return activeBelugaHealth;

  return { errors: 0, warnings: 0, items: [] };
}

let notifyPending = false;

export function notifyExplorerHealthChanged() {
  if (notifyPending) return;
  notifyPending = true;
  queueMicrotask(() => {
    notifyPending = false;
    const g = typeof window !== 'undefined' ? window : globalThis;
    if (typeof g.dispatchEvent === 'function') {
      g.dispatchEvent(new CustomEvent('beljar:explorer-health-changed'));
    }
  });
}
