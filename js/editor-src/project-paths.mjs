// Beluga source paths: .cfg stays distinct; extensionless files are implicit .bel.

export function fileBase(name) {
  const s = String(name || '');
  return s.slice(s.lastIndexOf('/') + 1);
}

export function isExtensionless(name) {
  return !fileBase(name).includes('.');
}

export function isCfgPath(name) {
  return String(name || '').toLowerCase().endsWith('.cfg');
}

export function isElfPath(name) {
  return String(name || '').toLowerCase().endsWith('.elf');
}

export function isBelPath(name) {
  const low = String(name || '').toLowerCase();
  if (isCfgPath(name) || isElfPath(name)) return false;
  if (low.endsWith('.bel')) return true;
  return isExtensionless(name);
}

export function isSignaturePath(name) {
  return isBelPath(name) || isElfPath(name);
}

export function isProjectSourcePath(name) {
  return isSignaturePath(name) || isCfgPath(name);
}

export function isCfgEntryToken(text) {
  const t = String(text || '').trim();
  if (!t || t.charAt(0) === '%') return false;
  const low = t.toLowerCase();
  if (low.endsWith('.cfg') || low.endsWith('.elf') || low.endsWith('.bel')) return true;
  const base = t.includes('/') ? t.slice(t.lastIndexOf('/') + 1) : t;
  return !base.includes('.');
}

export function isCfgSourceEntry(text) {
  return isCfgEntryToken(text) && !String(text || '').trim().toLowerCase().endsWith('.cfg');
}
