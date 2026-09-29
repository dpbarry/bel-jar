/**
 * The page-level look of the settings: the theme class, the UI scale and
 * contrast variables, motion, the editor font and hole emphasis.
 *
 * ONE function, used both by early boot (before first paint, from raw storage)
 * and by every live change afterwards. There used to be two copies of these
 * rules, one in early-boot-core.mjs and one spread across Persist, and a
 * setting that painted one way at boot could re-paint another way on change.
 */

export const UI_FONT_SCALES = { sm: 0.875, md: 1, lg: 1.125, xl: 1.25 };

export const UI_TEXT_CONTRAST = { low: 1, medium: 1.6, high: 2.4, maximum: 4.5 };

export const EDITOR_MONO = {
  jetbrains: "'JetBrains Mono', monospace",
  system: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
};

/** How long a toast stays up, per the toastDuration setting. */
export const TOAST_DURATION_MS = { short: 2000, normal: 3500, long: 5000 };

/** How much the settle delay stretches, per the checkAggressiveness setting. */
export const CHECK_DELAY_SCALE = { responsive: 0.7, balanced: 1, thorough: 1.45 };

/** Whether to hold motion back: the setting decides, and 'system' asks the OS. */
export function prefersReducedMotion(motionPref) {
  if (motionPref === 'reduce') return true;
  if (motionPref === 'full') return false;
  try {
    return typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/** @param {HTMLElement} docEl  document.documentElement */
export function applyDocumentSettings(docEl, values) {
  if (!docEl || !values) return;
  docEl.classList.toggle('light', values.theme === 'light');
  docEl.style.setProperty('--ui-font-scale', String(UI_FONT_SCALES[values.uiFontSize] || 1));
  docEl.style.setProperty('--ui-text-contrast', String(UI_TEXT_CONTRAST[values.uiTextContrast] || UI_TEXT_CONTRAST.medium));
  docEl.classList.toggle('jar-motion-reduce', values.motionPref === 'reduce');
  docEl.classList.toggle('jar-motion-full', values.motionPref === 'full');
  docEl.style.setProperty('--editor-mono', EDITOR_MONO[values.editorFontFamily] || EDITOR_MONO.jetbrains);
  docEl.style.setProperty('--editor-ligatures', 'none');
  docEl.classList.toggle('jar-hole-subtle', values.editorHoleEmphasis === 'subtle');
  docEl.classList.toggle('jar-hole-loud', values.editorHoleEmphasis === 'loud');
}
