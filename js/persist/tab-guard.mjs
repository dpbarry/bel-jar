/**
 * Tell the user when a second BelJar tab has the same project open.
 *
 * ⛔ Two tabs on one project silently destroy work. Each holds its own editor
 * buffer and its own debounced autosave against the SAME storage keys, so
 * whichever saves last wins — and the loser finds out on reload, with no way to
 * get the text back. Nothing in the app said a word about it.
 *
 * This does not try to synchronise the two tabs; it says the true thing. The
 * detection has NO heartbeat and NO staleness guessing. A background tab's
 * timers are throttled to a wakeup a minute, so "we have not heard from it
 * lately" accuses a tab that is perfectly alive — and silence after a crash
 * is not evidence the other tab left.
 *
 * Instead it is a handshake over the store's cross-tab events (the browser's
 * `storage` event, which fires in the OTHER tabs of an origin and only on a
 * real write): `Persist.postTabMessage` / `Persist.onTabMessage`.
 *
 *   1. A tab announces itself on boot by writing a nonce to the ping key.
 *   2. Any tab that sees a ping for the project IT has open answers, records
 *      that nonce, and warns.
 *   3. The announcing tab hears the answer, records who answered, and warns too.
 *   4. On `pagehide` the leaving tab writes a goodbye. Whoever had recorded
 *      its nonce drops it, and when nobody is left the strip warning comes down.
 *
 * A warning can therefore only be raised by a live tab that answered. A crash
 * or a discarded tab never says goodbye, so the warning stays. A reload says
 * goodbye and announces again once the new document is up; during that gap the
 * other tab really is not open, so the chip follows it.
 */
const global = globalThis;

const DEDUPE = 'workspace.multi-tab';

const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
const companions = new Set();
let warned = false;
let departed = false;
let announcedProject = '';

function projectId() {
  const P = global.Persist;
  if (!P) return '';
  try {
    return String(P.getActiveProjectId?.() || P.getProjectName?.() || '');
  } catch (_) {
    return '';
  }
}

function write(kind, value) {
  const P = global.Persist;
  if (P && typeof P.postTabMessage === 'function') P.postTabMessage(kind, value);
}

/**
 * The strip carries it (leftmost of the right-hand group). Not a notification
 * and not a toast: those are events you can miss or dismiss while the other
 * tab is still writing. It stays up while any recorded companion is open, and
 * comes down when the last one says goodbye.
 */
function paint(on) {
  warned = !!on;
  if (global.StatusStrip && typeof global.StatusStrip.setTabConflict === 'function') {
    global.StatusStrip.setTabConflict(warned);
  }
}

function noteCompanion(id) {
  if (!id || id === nonce) return;
  companions.add(id);
  if (!warned) paint(true);
}

function forgetCompanion(id) {
  if (!id || !companions.delete(id)) return;
  if (companions.size === 0) paint(false);
}

/** Drop any inbox card the old path banked — it is a standing strip warning now. */
function forgetInboxRecord() {
  const N = global.Notifications;
  if (!N || typeof N.list !== 'function' || typeof N.dismiss !== 'function') return;
  const ids = N.list().filter((r) => r && r.dedupeKey === DEDUPE).map((r) => r.id);
  for (const id of ids) N.dismiss(id);
}

function onMessage(kind, msg) {
  if (departed || !msg || typeof msg !== 'object') return;
  const mine = projectId();
  if (!mine || msg.p !== mine) return;
  if (kind === 'ping') {
    if (msg.n === nonce) return;
    noteCompanion(msg.n);
    write('pong', { n: msg.n, from: nonce, p: mine, at: Date.now() });
    return;
  }
  if (kind === 'pong') {
    if (msg.n !== nonce) return;
    noteCompanion(msg.from);
    return;
  }
  if (kind === 'bye') {
    if (msg.n === nonce) return;
    forgetCompanion(msg.n);
  }
}

export function announce() {
  // pagehide can beat the boot frame. A ping after goodbye puts the chip back
  // up with no second pagehide to take it down.
  if (departed) return;
  const p = projectId();
  if (!p) return;
  announcedProject = p;
  write('ping', { n: nonce, p, at: Date.now() });
}

/** `pagehide`. A crashed tab never reaches here, so it cannot clear anyone. */
export function depart() {
  if (departed) return;
  const p = projectId() || announcedProject;
  if (!p) return;
  departed = true;
  write('bye', { n: nonce, p, at: Date.now() });
}

/**
 * Back from the back-forward cache. Everything said while we were frozen was
 * missed, including a goodbye, so learn company again from a fresh handshake.
 */
function onPageShow(e) {
  if (!e || !e.persisted) return;
  departed = false;
  companions.clear();
  if (warned) paint(false);
  announce();
}

export function initTabGuard() {
  const P = global.Persist;
  if (!global.addEventListener || !P || typeof P.onTabMessage !== 'function') return;
  P.onTabMessage(onMessage);
  global.addEventListener('pagehide', () => depart());
  global.addEventListener('pageshow', onPageShow);
  // After boot, so Persist knows which project is active and the strip
  // exists to receive the warning.
  const afterBoot = () => {
    forgetInboxRecord();
    announce();
  };
  if (global.requestAnimationFrame) global.requestAnimationFrame(afterBoot);
  else setTimeout(afterBoot, 0);
}

global.TabGuard = { init: initTabGuard, announce, depart, _nonce: () => nonce };

initTabGuard();
