import { installEarlyBoot, registerServiceWorker } from './early-boot-core.mjs';

// Hands the browser's storage to the pure readers in js/persist: the store
// does not exist yet, and first paint cannot wait for it.
try {
  installEarlyBoot({ document, window, localStorage });
} catch (_) {}

registerServiceWorker(navigator, location);
