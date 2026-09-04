/**
 * Which chords the browser takes before the page ever sees them, and what
 * BelJar offers instead. Pure: no DOM, no globals — the platform is a parameter.
 *
 * This exists because the original complaint about BelJar's keymap setting was
 * that it *oversold*: it offered "Emacs" and then silently lost half of it. The
 * fix is not to pretend, it is to report. Everything here is stated as a fact
 * about a platform, and the UI renders it rather than deciding it.
 *
 * The asymmetry that matters: **Chrome reserves `Cmd` on macOS and `Ctrl` on
 * Windows and Linux.** Emacs lives on `Ctrl`. So Emacs mode is close to whole on
 * a Mac and structurally compromised everywhere else — one option that means two
 * different things, which is exactly what the settings UI must stop doing.
 */

/**
 * Chords Chromium never delivers to a page on Windows / Linux.
 *
 * ⛔ MEASURED, not read off a docs page: `scripts/chord-audit.html` on
 * Chrome 152 / Windows 11, all 37 chords pressed by hand. Three corrections came
 * out of it and are called out below. Re-measure rather than edit from memory.
 */
// ⚠ `subStyle` is NOT part of the measurement — the measurement is which chords
// the browser eats, and that is untouched. It records WHICH KEYMAP a substitute
// belongs to, because `Ctrl+M`, `Alt+T`, `Ctrl+Q` and `Ctrl+U` are bound on
// `EmacsHandler` and nowhere else: under Standard or Vim they do nothing at all.
// A surface offering them in those styles is telling you to press a dead key.
export const BROWSER_RESERVED_PC = [
  { chord: 'Ctrl+N', emacs: 'next-line', substitute: 'Ctrl+M, or Down', subStyle: 'emacs' },
  { chord: 'Ctrl+T', emacs: 'transpose-chars', substitute: 'Alt+T', subStyle: 'emacs' },
  // ⚠ The old substitute here was Ctrl+Shift+W, which is itself reserved — a
  // replacement that could never be pressed. Ctrl+Q was measured as arriving.
  { chord: 'Ctrl+W', emacs: 'kill-region', substitute: 'Ctrl+Q', subStyle: 'emacs' },
  { chord: 'Ctrl+Shift+N', emacs: '—', substitute: '—' },
  { chord: 'Ctrl+Shift+T', emacs: '—', substitute: '—' },
  { chord: 'Ctrl+Shift+W', emacs: '—', substitute: '—' },
  // ⚠ Newly measured. BelJar shipped `Mod+Shift+P` as the Run Command chord and
  // it never reached the page on Windows; it is `Alt+X` now.
  { chord: 'Ctrl+Shift+P', emacs: '—', substitute: 'Alt+X' },
  { chord: 'Ctrl+Tab', emacs: '—', substitute: '—' },
  { chord: 'Ctrl+Shift+Tab', emacs: '—', substitute: '—' },
  // ⚠ Ctrl+9 *arrived* during the audit only because there was no ninth tab to
  // switch to. With nine or more open it goes to the last one, so no Ctrl+digit
  // is dependable and the whole range is listed.
  // `C-u` is Emacs' universal argument; there is no such thing in the others.
  { chord: 'Ctrl+1…9', emacs: 'digit-argument', substitute: 'Ctrl+U then digits', subStyle: 'emacs' },
];

/**
 * macOS reserves the Command key instead, so Emacs' Ctrl chords all arrive.
 *
 * ⚠ DOCUMENTED, not measured — nobody here has a Mac. Chromium does not dispatch
 * keydown for its own UI chords, and on macOS those are the Cmd ones; `Ctrl+Tab`
 * and `Ctrl+Shift+Tab` are reserved on BOTH platforms. Run
 * `scripts/chord-audit.html` on a Mac to promote this from a claim to a fact —
 * the Windows table was a claim too, and measuring it found three errors.
 */
export const BROWSER_RESERVED_MAC = [
  { chord: 'Cmd+N', emacs: '—', substitute: '—' },
  { chord: 'Cmd+T', emacs: '—', substitute: '—' },
  { chord: 'Cmd+W', emacs: '—', substitute: '—' },
  { chord: 'Cmd+Q', emacs: '—', substitute: '—' },
  { chord: 'Ctrl+Tab', emacs: '—', substitute: '—' },
  { chord: 'Ctrl+Shift+Tab', emacs: '—', substitute: '—' },
];

export function isMacPlatform(nav) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  if (!n) return false;
  const s = String(n.platform || n.userAgent || '');
  return /Mac|iPhone|iPad/.test(s);
}

/** The reserved list for a platform. */
export function reservedChords(isMac) {
  return isMac ? BROWSER_RESERVED_MAC.slice() : BROWSER_RESERVED_PC.slice();
}

/**
 * One honest sentence about what Emacs mode is on this machine. The settings UI
 * shows this instead of a flat "Emacs" that means different things per platform.
 */
export function emacsFidelity(isMac) {
  if (isMac) {
    // Counted from the table rather than asserted as 0: what macOS reserves is
    // Cmd, and none of it is an Emacs chord — but that is a fact the table
    // should be made to prove, not a sentence written beside it.
    const takenMac = BROWSER_RESERVED_MAC.filter((r) => r.emacs !== '—').length;
    return {
      level: takenMac ? 'partial' : 'full',
      headline: takenMac
        ? `${takenMac} Emacs chords are taken by the browser on this platform.`
        : 'All Emacs chords reach BelJar on this platform.',
      detail: 'macOS browsers reserve Command, not Control, so Emacs keeps every chord it '
        + 'uses. The tab-switching chords are still the browser’s on both platforms.',
      taken: takenMac,
    };
  }
  const taken = BROWSER_RESERVED_PC.filter((r) => r.emacs !== '—').length;
  return {
    level: 'partial',
    headline: `${taken} Emacs chords are taken by the browser on this platform.`,
    // ⚠ Ctrl+L used to be listed here and is NOT reserved: it was measured
    // reaching the page, so `recenter` works and needed no substitute.
    detail: 'Chromium handles Ctrl+N, Ctrl+T, Ctrl+W and the Ctrl+digit range before the '
      + 'page sees them. BelJar binds substitutes; Keyboard Lock reclaims all of them, '
      + 'but only in fullscreen.',
    taken,
  };
}

/**
 * Why BelJar's own Emacs prefix uses plain second keys (`C-c h`) rather than
 * doubled control chords (`C-c C-h`): a chain whose second key is reserved is
 * unreachable, and worse, it opens a browser window mid-chord.
 */
export const PREFIX_RULE =
  'BelJar binds C-c followed by a plain letter. A chain whose second key is itself a '
  + 'reserved chord cannot be reached: it opens a browser window mid-sequence.';
