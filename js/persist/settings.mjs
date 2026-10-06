/**
 * Settings: one record in the store (`beljar/settings`), read through the
 * table in settings-schema.mjs and nowhere else.
 *
 * A table (table.mjs) plus what only preferences have: sections the dialog
 * resets one at a time, and export/import. Only values that differ from their
 * default are stored, so an export is exactly what the user changed.
 */
import { SETTINGS, SETTINGS_KEY, SECTIONS, settingRow, normalizeSetting, sameValue, defaultOf } from './settings-schema.mjs';
import { createTable, clone } from './table.mjs';

export const EXPORT_KIND = 'beljar-settings';

export function createSettings(store) {
  const table = createTable(store, {
    key: SETTINGS_KEY,
    rows: SETTINGS,
    unknown: (id) => `settings: no setting "${id}" (declare it in settings-schema.mjs)`,
  });

  return {
    SECTIONS,
    get: table.get,
    set: table.set,
    revision: table.revision,
    isDefault: table.isDefault,
    values: table.values,
    subscribe: table.subscribe,
    dispose: table.dispose,
    defaultOf,

    /** Back to defaults for one Settings category. */
    reset(section) {
      if (!SECTIONS.includes(section)) throw new Error(`settings: no section "${section}"`);
      return table.reset((row) => row.section === section && row.reset !== false);
    },

    resetAll() {
      return table.reset((row) => row.reset !== false);
    },

    /** Exactly what the user changed, in a file they can keep. */
    exportBundle(now = Date.now()) {
      return { kind: EXPORT_KIND, exportedAt: now, values: table.overrides() };
    },

    /**
     * Apply an exported bundle. Unknown ids and values a setting cannot hold are
     * skipped and named, never half-applied: what is valid lands in one write.
     */
    importBundle(bundle) {
      if (!bundle || bundle.kind !== EXPORT_KIND || !bundle.values || typeof bundle.values !== 'object') {
        return { ok: false, reason: 'not a BelJar settings file', applied: [], skipped: [] };
      }
      const next = table.overrides();
      const applied = [];
      const skipped = [];
      for (const [id, raw] of Object.entries(bundle.values)) {
        const row = settingRow(id);
        const v = row ? normalizeSetting(row, raw) : undefined;
        if (v === undefined) { skipped.push(id); continue; }
        if (sameValue(v, row.default)) delete next[id];
        else next[id] = clone(v);
        applied.push(id);
      }
      const res = table.commit(next);
      return { ok: res.ok, applied: res.ok ? applied : [], skipped };
    },
  };
}
