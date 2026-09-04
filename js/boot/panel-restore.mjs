import { restorePanelState } from './panel-restore-core.mjs';

try {
  restorePanelState(document, localStorage);
} catch (_) {}
