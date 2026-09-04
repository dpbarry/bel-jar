export const SPLIT_STACK_MQ = '(max-width: 48rem)';

export const UI_FONT_SCALES = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 };

export const UI_TEXT_CONTRAST = { normal: 1, low: 1, medium: 1.6, high: 2.4, maximum: 4.5 };

export function clampSplit(n, min, max, fallback) {
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function applySplitVars(rootStyle, ratio, stackMq, matchMedia) {
  const a = Math.round(ratio * 1e6) / 1e6;
  const b = Math.round((1 - ratio) * 1e6) / 1e6;
  if (matchMedia(stackMq).matches) {
    rootStyle.removeProperty('--workspace-split-cols');
    rootStyle.setProperty('--workspace-split-rows', `${a}fr ${b}fr`);
  } else {
    rootStyle.removeProperty('--workspace-split-rows');
    rootStyle.setProperty('--workspace-split-cols', `${a}fr ${b}fr`);
  }
}

export function applyStoredPanelPx(rootStyle, storage, key, cssVar) {
  const n = parseFloat(storage.getItem(key));
  if (Number.isFinite(n) && n > 0) rootStyle.setProperty(cssVar, `${n}px`);
}

export function applyDocumentPrefs(docEl, storage) {
  if (storage.getItem('beljar-theme') === 'light') {
    docEl.classList.add('light');
  }

  const uiFontStored = storage.getItem('beljar-ui-font-size');
  docEl.style.setProperty('--ui-font-scale', String(UI_FONT_SCALES[uiFontStored] || 1));

  const uiTextContrastStored = storage.getItem('beljar-ui-text-contrast');
  docEl.style.setProperty(
    '--ui-text-contrast',
    String(UI_TEXT_CONTRAST[uiTextContrastStored] || UI_TEXT_CONTRAST.medium),
  );

  const motion = storage.getItem('beljar-motion-pref');
  docEl.classList.toggle('bj-motion-reduce', motion === 'reduce');
  docEl.classList.toggle('bj-motion-full', motion === 'full');

  const editorFont = storage.getItem('beljar-editor-font-family');
  docEl.style.setProperty(
    '--editor-mono',
    editorFont === 'system'
      ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      : "'JetBrains Mono', monospace",
  );
  docEl.style.setProperty(
    '--editor-ligatures',
    storage.getItem('beljar-editor-ligatures') === 'off' ? 'none' : 'common-ligatures',
  );

  const holeEmph = storage.getItem('beljar-editor-hole-emphasis');
  docEl.classList.toggle('bj-hole-subtle', holeEmph === 'subtle');
  docEl.classList.toggle('bj-hole-loud', holeEmph === 'loud');
}

export function applyPanelDimensionPrefs(rootStyle, storage) {
  applyStoredPanelPx(rootStyle, storage, 'beljar-explorer-w', '--explorer-w');
  applyStoredPanelPx(rootStyle, storage, 'beljar-inspector-w', '--inspector-w');
  applyStoredPanelPx(rootStyle, storage, 'beljar-library-w', '--library-w');
  applyStoredPanelPx(rootStyle, storage, 'beljar-harpoon-w', '--harpoon-w');
  applyStoredPanelPx(rootStyle, storage, 'beljar-explorer-h', '--explorer-h');
  applyStoredPanelPx(rootStyle, storage, 'beljar-inspector-h', '--inspector-h');
  applyStoredPanelPx(rootStyle, storage, 'beljar-library-h', '--library-h');
  applyStoredPanelPx(rootStyle, storage, 'beljar-harpoon-h', '--harpoon-h');
}

export function readSplitRatio(storage, splitKey, min, max, fallback) {
  return clampSplit(parseFloat(storage.getItem(splitKey)), min, max, fallback);
}

export function installEarlyBoot(env) {
  const {
    document,
    window,
    localStorage,
    splitKey,
    splitMin,
    splitMax,
    splitDefault,
  } = env;

  applyDocumentPrefs(document.documentElement, localStorage);
  applyPanelDimensionPrefs(document.documentElement.style, localStorage);
  applySplitVars(
    document.documentElement.style,
    readSplitRatio(localStorage, splitKey, splitMin, splitMax, splitDefault),
    SPLIT_STACK_MQ,
    window.matchMedia.bind(window),
  );
}

export function registerServiceWorker(nav, loc) {
  if (!('serviceWorker' in nav)) return;
  const host = loc.hostname;
  const isLocalDev = host === 'localhost' || host === '127.0.0.1';
  if (isLocalDev) {
    nav.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => { r.unregister(); });
    });
    return;
  }
  nav.serviceWorker.register('sw.js');
}
