const listeners = new Set();

const DEFAULT = Object.freeze({
  layout: 'force',
  impl: 'show',
  depth: 1,
  labelDensity: 3,
  sidebarCollapsed: false,
});

function persistApi() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.BelJarPersist;
}

export function loadGraphPrefs() {
  const p = persistApi();
  if (p?.readStoredGraphPrefs) return p.readStoredGraphPrefs();
  return { ...DEFAULT };
}

export function saveGraphPrefs(partial) {
  const p = persistApi();
  const next = p?.writeStoredGraphPrefs
    ? p.writeStoredGraphPrefs(partial)
    : { ...loadGraphPrefs(), ...partial };
  for (const fn of listeners) fn(next);
  return next;
}

export function onGraphPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
