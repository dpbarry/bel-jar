import { restorePanelState, paintProjectName } from './panel-restore-core.mjs';

try {
  restorePanelState(document, localStorage);
} catch (_) {}
try {
  paintProjectName(document, localStorage, location);
} catch (_) {}
