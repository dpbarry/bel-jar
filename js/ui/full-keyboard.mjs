/**
 * Full keyboard — the chords Chrome normally eats, handed back.
 *
 * `navigator.keyboard.lock()` only works in real fullscreen, which is why this
 * could not be verified headlessly and sat as an open spike for weeks. It was
 * measured by hand on 2026-09-02 (Chrome 152 / Windows 11): under lock, all ten
 * chords `scripts/chord-audit.html` had recorded as reserved reached the page,
 * **and their browser actions did not fire**. Both halves matter — a chord that
 * arrives and still opens a tab is not reclaimed.
 *
 * ⛔ The lock takes EVERY key, Escape included, and that is deliberate. Escape is
 * the most important key a Vim user owns; locking it means a tap reaches BelJar
 * and only press-and-hold leaves fullscreen. Locking a subset would hand Escape
 * back to the browser and drop the user out of fullscreen mid-edit.
 */
const global = globalThis;

let active = false;
let listening = false;

function strip() {
  const B = global.StatusStrip;
  return B && typeof B.setMessage === 'function' ? B : null;
}

function say(text) {
  const B = strip();
  if (B) B.setMessage(text);
}

export function isSupported() {
  const nav = global.navigator;
  return !!(nav && nav.keyboard && typeof nav.keyboard.lock === 'function');
}

export function isActive() {
  return active && !!(global.document && global.document.fullscreenElement);
}

/** Leaving fullscreen by any route ends the mode; the lock cannot outlive it. */
function watchFullscreen() {
  if (listening || !global.document) return;
  listening = true;
  global.document.addEventListener('fullscreenchange', () => {
    if (global.document.fullscreenElement || !active) return;
    active = false;
    releaseLock();
    say('Full keyboard off.');
  });
}

function releaseLock() {
  const nav = global.navigator;
  if (nav && nav.keyboard && typeof nav.keyboard.unlock === 'function') {
    try { nav.keyboard.unlock(); } catch (_) { /* already gone */ }
  }
}

export async function enter() {
  if (!isSupported()) {
    say('This browser has no Keyboard Lock, so the reserved chords stay reserved.');
    return false;
  }
  const el = global.document && global.document.documentElement;
  if (!el || typeof el.requestFullscreen !== 'function') {
    say('Full keyboard needs fullscreen, which this browser will not give.');
    return false;
  }
  watchFullscreen();
  try {
    if (!global.document.fullscreenElement) await el.requestFullscreen();
    await global.navigator.keyboard.lock();
  } catch (err) {
    // ⛔ Never leave someone in fullscreen with nothing to show for it.
    if (global.document.fullscreenElement && global.document.exitFullscreen) {
      try { await global.document.exitFullscreen(); } catch (_) { /* nothing to undo */ }
    }
    releaseLock();
    active = false;
    say('Full keyboard could not start: ' + ((err && err.message) || 'the browser refused.'));
    return false;
  }
  active = true;
  say('Full keyboard on — Ctrl+N, Ctrl+T, Ctrl+W and the rest are yours. Hold Esc to leave.');
  return true;
}

export async function exit() {
  if (!active) return false;
  active = false;
  releaseLock();
  if (global.document && global.document.fullscreenElement && global.document.exitFullscreen) {
    try { await global.document.exitFullscreen(); } catch (_) { /* already out */ }
  }
  say('Full keyboard off.');
  return true;
}

export function toggle() {
  return isActive() ? exit() : enter();
}

global.FullKeyboard = { isSupported, isActive, enter, exit, toggle };
