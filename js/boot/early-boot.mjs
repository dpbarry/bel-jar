import { installEarlyBoot, registerServiceWorker } from './early-boot-core.mjs';

const g = globalThis;

g.BELJAR_SPLIT_KEY = 'beljar-editor-split';
g.BELJAR_SPLIT_MIN = 0.18;
g.BELJAR_SPLIT_MAX = 0.82;
g.BELJAR_SPLIT_DEFAULT = 0.5;

try {
  installEarlyBoot({
    document,
    window,
    localStorage,
    navigator,
    location,
    splitKey: g.BELJAR_SPLIT_KEY,
    splitMin: g.BELJAR_SPLIT_MIN,
    splitMax: g.BELJAR_SPLIT_MAX,
    splitDefault: g.BELJAR_SPLIT_DEFAULT,
  });
} catch (_) {}

registerServiceWorker(navigator, location);
