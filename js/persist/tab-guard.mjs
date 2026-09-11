/**
 * Tell the user when a second BelJar tab has the same project open.
 *
 * ⛔ Two tabs on one project silently destroy work. Each holds its own editor
 * buffer and its own debounced autosave against the SAME storage keys, so
 * whichever saves last wins — and the loser finds out on reload, with no way to
 * get the text back. Nothing in the app said a word about it.
 *
 * This does not try to synchronise the two tabs; it says the true thing. The
 * detection has NO heartbeat, NO timestamps and NO staleness guessing, because
 * every one of those produces false alarms — a background tab's timers are
 * throttled to a wakeup a minute, so any "we have not heard from it lately"
 * rule accuses a tab that is perfectly alive, and a tab that crashed leaves a
 * claim behind that accuses nobody at all.
 *
 * Instead it is a handshake over the `storage` event, which fires in the OTHER
 * tabs of an origin and only on a real write:
 *
 *   1. A tab announces itself on boot by writing a nonce to the ping key.
 *   2. Any tab that sees a ping for the project IT has open answers with that
 *      nonce, and warns — it has just learned it has company.
 *   3. The announcing tab hears the answer and warns too.
 *
 * A warning can therefore only be caused by a live tab that answered. False
 * positives are impossible by construction; a tab too throttled to answer in
 * time is a false negative, which is exactly today's behaviour and no worse.
 */
const global = globalThis;

const PING_KEY = 'beljar-tab-ping';
const PONG_KEY = 'beljar-tab-pong';
const DEDUPE = 'workspace.multi-tab';

const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
let warned = false;

function projectId() {
  const P = global.Persist;
  if (!P) return '';
  try {
    return String(P.getActiveProjectId?.() || P.getProjectName?.() || '');
  } catch (_) {
    return '';
  }
}

function write(key, value) {
  try {
    global.localStorage?.setItem(key, JSON.stringify(value));
  } catch (_) { /* quota, or storage disabled — nothing to guard then */ }
}

function parse(raw) {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : null;
  } catch (_) {
    return null;
  }
}

/**
 * Said once per session. A second tab is a standing condition, not an event —
 * repeating it every time the two tabs notice each other would be noise, and
 * the notification centre keeps the record either way.
 */
function warnOnce() {
  if (warned) return;
  warned = true;
  const title = 'This project is open in another tab';
  const body = 'Both tabs save to the same place, so whichever writes last wins and'
    + ' the other tab’s edits are lost. Work in one tab at a time.';
  if (global.Notifications?.emit) {
    global.Notifications.emit({
      kind: 'warn',
      category: 'ops',
      origin: 'local',
      title,
      body,
      source: DEDUPE,
      dedupeKey: DEDUPE,
    });
  }
  if (global.Toasts?.warn) {
    global.Toasts.warn(title, { duration: 'long', closable: true });
  }
}

function onStorage(e) {
  if (!e || !e.newValue) return;
  const mine = projectId();
  if (e.key === PING_KEY) {
    const msg = parse(e.newValue);
    // A ping from another tab about the project this one has open.
    if (!msg || msg.n === nonce || msg.p !== mine) return;
    write(PONG_KEY, { n: msg.n, p: mine, at: Date.now() });
    warnOnce();
    return;
  }
  if (e.key === PONG_KEY) {
    const msg = parse(e.newValue);
    if (!msg || msg.n !== nonce) return;
    warnOnce();
  }
}

export function announce() {
  const p = projectId();
  if (!p) return;
  write(PING_KEY, { n: nonce, p, at: Date.now() });
}

export function initTabGuard() {
  if (!global.addEventListener || !global.localStorage) return;
  global.addEventListener('storage', onStorage);
  // After boot, so Persist knows which project is active and the notification
  // surfaces exist to receive the warning.
  if (global.requestAnimationFrame) global.requestAnimationFrame(() => announce());
  else setTimeout(announce, 0);
}

global.TabGuard = { init: initTabGuard, announce, _nonce: () => nonce };

initTabGuard();
