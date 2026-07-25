// Shared Beluga display glyphs for Harpoon surfaces (tree, lab, panel).
// Prefer BelEditor.normalizeType when the editor bundle is loaded; fall back
// to the same ASCII→glyph map the editor uses so `|-` never leaks in the UI.
'use strict';

const global = globalThis;
function fallbackNormalize(text) {
    return String(text == null ? '' : text)
      .replace(/\|-#/g, '⊢#')
      .replace(/\|-/g, '⊢')
      .replace(/=>/g, '⇒')
      .replace(/->/g, '→')
      .replace(/([[({])[ \t]+/g, '$1')
      .replace(/[ \t]+([\])}])/g, '$1');
  }

  function displayBeluga(text) {
    var ed = global.BelEditor || null;
    if (ed && typeof ed.normalizeType === 'function') return ed.normalizeType(text);
    return fallbackNormalize(text);
  }

  // Compact chip label for a type box / arm pattern: ⊢ plus the conclusion head.
  function compactTypeLabel(box) {
    var s = String(box == null ? '' : box).replace(/\s+/g, ' ').trim();
    var m = /(?:\|-|⊢)\s*([\s\S]*?)\]?$/.exec(s);
    if (m) return displayBeluga('|- ' + m[1].replace(/\]$/, '').trim());
    return displayBeluga(s);
  }

  function looksLikeBeluga(s) {
    return /(\|-|⊢|\[|=>|->)/.test(String(s || ''));
  }

  global.HarpoonGlyphs = {
    displayBeluga: displayBeluga,
    compactTypeLabel: compactTypeLabel,
    looksLikeBeluga: looksLikeBeluga,
    fallbackNormalize: fallbackNormalize,
  };
