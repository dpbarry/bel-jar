/**
 * Theme / UI font / text-contrast prefs — injected into Persist.
 */
export function create(deps) {
    var THEME_STORAGE_KEY = deps.THEME_STORAGE_KEY;
    var UI_FONT_SIZE_KEY = deps.UI_FONT_SIZE_KEY;
    var UI_FONT_SCALES = deps.UI_FONT_SCALES;
    var UI_TEXT_CONTRAST_KEY = deps.UI_TEXT_CONTRAST_KEY;
    var UI_TEXT_CONTRAST_MULTIPLIERS = deps.UI_TEXT_CONTRAST_MULTIPLIERS;
    var backendLoad = deps.backendLoad;
    var backendSave = deps.backendSave;
    var backendRemove = deps.backendRemove;

    function readStoredTheme() {
      try {
        return backendLoad(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
      } catch (_) {
        return 'dark';
      }
    }

    function writeStoredTheme(mode) {
      if (mode === 'light') backendSave(THEME_STORAGE_KEY, 'light');
      else backendRemove(THEME_STORAGE_KEY);
    }

    function readStoredUiFontSize() {
      try {
        var v = backendLoad(UI_FONT_SIZE_KEY);
        if (v === 'sm' || v === 'lg' || v === 'xl') return v;
        return 'md';
      } catch (_) {
        return 'md';
      }
    }

    function writeStoredUiFontSize(size) {
      if (size === 'md') backendRemove(UI_FONT_SIZE_KEY);
      else if (size === 'sm' || size === 'lg' || size === 'xl') backendSave(UI_FONT_SIZE_KEY, size);
      else backendRemove(UI_FONT_SIZE_KEY);
    }

    function uiFontScaleForSize(size) {
      return UI_FONT_SCALES[size] || 1;
    }

    function applyStoredUiFontSize(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== 'undefined') root = document.documentElement;
      if (!root) return;
      root.style.setProperty('--ui-font-scale', String(uiFontScaleForSize(readStoredUiFontSize())));
    }

    function readStoredUiTextContrast() {
      try {
        var v = backendLoad(UI_TEXT_CONTRAST_KEY);
        if (v === 'low' || v === 'normal') return 'low';
        if (v === 'medium' || v === 'high' || v === 'maximum') return v;
        return 'medium';
      } catch (_) {
        return 'medium';
      }
    }

    function writeStoredUiTextContrast(contrast) {
      if (contrast === 'medium') backendRemove(UI_TEXT_CONTRAST_KEY);
      else if (contrast === 'low' || contrast === 'high' || contrast === 'maximum') {
        backendSave(UI_TEXT_CONTRAST_KEY, contrast);
      } else backendRemove(UI_TEXT_CONTRAST_KEY);
    }

    function uiTextContrastMultiplierForLevel(contrast) {
      return UI_TEXT_CONTRAST_MULTIPLIERS[contrast] || UI_TEXT_CONTRAST_MULTIPLIERS.medium;
    }

    function applyStoredUiTextContrast(doc) {
      var root = doc && doc.documentElement ? doc.documentElement : null;
      if (!root && typeof document !== 'undefined') root = document.documentElement;
      if (!root) return;
      root.style.setProperty('--ui-text-contrast', String(uiTextContrastMultiplierForLevel(readStoredUiTextContrast())));
    }

    return {
      readStoredTheme: readStoredTheme,
      writeStoredTheme: writeStoredTheme,
      readStoredUiFontSize: readStoredUiFontSize,
      writeStoredUiFontSize: writeStoredUiFontSize,
      uiFontScaleForSize: uiFontScaleForSize,
      applyStoredUiFontSize: applyStoredUiFontSize,
      readStoredUiTextContrast: readStoredUiTextContrast,
      writeStoredUiTextContrast: writeStoredUiTextContrast,
      uiTextContrastMultiplierForLevel: uiTextContrastMultiplierForLevel,
      applyStoredUiTextContrast: applyStoredUiTextContrast,
    };
  }
