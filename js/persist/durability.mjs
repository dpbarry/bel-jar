/**
 * Keeping the work this browser holds (docs/PERSIST.md §5.9).
 *
 * Local storage is where BelJar's work lives, and a browser may clear it:
 * every browser under disk pressure (least recently used site first), and
 * Safari after 7 days of Safari use without a click, tap or key on the site
 * (WebKit's tracking prevention; Home Screen and Dock web apps are exempt).
 * Three answers:
 *
 *   - Once there is work to lose, ask the browser to keep it
 *     (`navigator.storage.persist()`). Chrome and Safari decide silently,
 *     from how the site is used, so asking again later can succeed where
 *     asking early did not. Firefox asks the person, so the request waits
 *     for their next click, a pause in typing, and waits 30 days before
 *     asking again.
 *   - Where the risk is Safari's 7 days, say so once, and what to do.
 *   - A whole project downloads in one step (the Project menu).
 *
 * Browser facts checked 2026-09-25 (webkit.org tracking prevention, WebKit's
 * storage policy post for Safari 17, MDN's storage quotas and eviction
 * criteria). They change: check them again when they matter.
 */

/** Non-blank characters, across the projects that live only here, that count as work to lose. */
export const WORK_TO_LOSE = 200;

/** How long before asking a browser that said no to keep the storage again. */
export const ASK_EVERY = 30 * 24 * 60 * 60 * 1000;

/** How long local work waits before being counted again. */
const RECOUNT_MS = 5000;

/**
 * How much work lives only on this device, in non-blank characters, counted up
 * to `limit`. A project that belongs to an account is on the server as well.
 */
export function countWork(work, limit) {
  let n = 0;
  for (const p of work.allProjects()) {
    if (p.owner !== null) continue;
    const snap = work.snapshotProject(p.id);
    if (!snap) continue;
    for (const f of snap.tree.files) {
      n += String(snap.texts[f.id]).replace(/\s+/g, '').length;
      if (n >= limit) return n;
    }
  }
  return n;
}

/**
 * @param {object} o
 * @param {object} o.store
 * @param {object} o.work          work.mjs
 * @param {object} o.device        the device table (persistAskedAt, durabilityWarnedAt)
 * @param {object | null} o.storage   navigator.storage, or null where there is none
 * @param {EventTarget | null} o.events   where the next click arrives (the window)
 * @param {boolean} o.sevenDayRule  this page is under Safari's 7-day rule (Safari, not a web app)
 * @param {() => void} o.warn      tell the person, once, that Safari may delete their work
 * @param {() => number} [o.now]
 * @param {{ set(fn, ms): any, clear(handle): void }} [o.timers]
 */
export function createDurability(o) {
  const now = o.now || (() => Date.now());
  const timers = o.timers || {
    set: (fn, ms) => globalThis.setTimeout(fn, ms),
    clear: (h) => globalThis.clearTimeout(h),
  };
  const state = { persisted: null, workToLose: false, asked: false, warned: false };
  let unsubscribe = null;
  let recount = null;
  let onClick = null;
  let disposed = false;

  function warnIfAtRisk() {
    if (!o.sevenDayRule || state.persisted || o.device.get('durabilityWarnedAt')) return;
    o.device.set('durabilityWarnedAt', now());
    state.warned = true;
    o.warn();
  }

  function settle(granted) {
    state.persisted = !!granted;
    if (!state.persisted) warnIfAtRisk();
  }

  /** The request waits for the next click: in Firefox it asks the person, and a click is a pause. */
  function askAtNextClick() {
    if (onClick || !o.events) return;
    onClick = () => {
      o.events.removeEventListener('pointerdown', onClick, true);
      onClick = null;
      // Another tab of this device may have asked since this one armed.
      if (disposed || askedLately()) return;
      o.device.set('persistAskedAt', now());
      state.asked = true;
      let answer;
      try {
        answer = o.storage.persist();
      } catch (err) {
        answer = Promise.reject(err);
      }
      Promise.resolve(answer).then(settle, () => settle(false));
    };
    o.events.addEventListener('pointerdown', onClick, true);
  }

  /** Asked on this device (from any tab) within the last ASK_EVERY. */
  function askedLately() {
    const last = o.device.get('persistAskedAt');
    return !!last && now() - last < ASK_EVERY;
  }

  function thereIsWork() {
    state.workToLose = true;
    const canAsk = !!(o.storage && typeof o.storage.persist === 'function');
    if (canAsk && !askedLately()) askAtNextClick();
    else warnIfAtRisk();
  }

  function count() {
    if (state.workToLose || disposed) return;
    if (countWork(o.work, WORK_TO_LOSE) < WORK_TO_LOSE) return;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    thereIsWork();
  }

  return {
    /** Learn whether the browser already keeps the storage; then wait for work to lose. */
    async start() {
      try {
        state.persisted = !!(o.storage && typeof o.storage.persisted === 'function' && await o.storage.persisted());
      } catch (_) {
        state.persisted = false;
      }
      // Kept already: nothing to ask, and no project needs reading.
      if (state.persisted || disposed) return;
      count();
      if (state.workToLose) return;
      // Any change to work may make work to lose; the count decides what is
      // only here (a project that belongs to an account is on the server too).
      unsubscribe = o.store.subscribe((e) => {
        if (e.cls !== 'work' || recount != null) return;
        recount = timers.set(() => {
          recount = null;
          count();
        }, RECOUNT_MS);
      });
    },

    /** { persisted: true | false | null (not known yet), workToLose, asked, warned } */
    /**
     * `atRisk`: Safari may delete what is here (its 7-day rule applies, there
     * is work to lose, and the browser has not agreed to keep the storage).
     * That is state, not news: home shows it for as long as it holds.
     */
    status() {
      return Object.assign({ atRisk: !!o.sevenDayRule && state.workToLose && !state.persisted }, state);
    },

    dispose() {
      disposed = true;
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      if (recount != null) { timers.clear(recount); recount = null; }
      if (onClick && o.events) o.events.removeEventListener('pointerdown', onClick, true);
      onClick = null;
    },
  };
}
