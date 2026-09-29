// A real Settings for tests: the actual table and store over memory, never a
// hand-made stub that could accept a value the real thing refuses.
import { createStore, createMemoryStorage } from '../js/persist/store.mjs';
import { createSettings } from '../js/persist/settings.mjs';

export function makeSettings(values = {}) {
  const settings = createSettings(createStore({ storage: createMemoryStorage() }));
  for (const [id, v] of Object.entries(values)) {
    if (!settings.set(id, v)) throw new Error(`test setup: ${id} cannot hold ${JSON.stringify(v)}`);
  }
  return settings;
}

/** Run `fn` with a real Settings holding `values` installed as globalThis.Settings. */
export function withSettings(values, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Settings');
  const prev = globalThis.Settings;
  globalThis.Settings = makeSettings(values);
  try {
    return fn(globalThis.Settings);
  } finally {
    if (had) globalThis.Settings = prev;
    else delete globalThis.Settings;
  }
}
