/**
 * "Back online: Ask me first" (Settings > Account, docs/PERSIST.md §5.7).
 *
 * When the connection goes while this device has work the cloud lacks, the
 * runner is held: nothing more goes up until the person has seen it
 * (js/ui/review-offline.mjs) and chosen Upload, or taken the cloud's version.
 *
 * The hold is the device's, not the tab's. It is kept in the device table
 * (`syncHeldFor`, the account it holds for), so it outlives a reload, and
 * whichever tab syncs takes it up: the tab that held it may close, and the
 * next one to sync must not upload what the person has not seen.
 *
 * Released by the person (Upload, from any tab), by the setting going back to
 * "Upload them", or by finding nothing waiting once back online.
 */
export const HELD_ROW = 'syncHeldFor';

/**
 * @param {object} o
 * @param {object} o.runner    runner.mjs: status(), subscribe(fn), hold(), release()
 * @param {{ localChanges(): Promise<object[]> }} o.engine
 * @param {{ get(id), set(id, v), reset(pick) }} o.device
 * @param {{ get(id) }} o.settings
 * @param {string} o.account
 * @param {() => boolean} [o.online]   the browser thinks it is online
 */
export function createHoldPolicy(o) {
  const online = o.online || (() => true);
  let wasHeld = false;
  let checking = null;
  let stopped = false;

  const asking = () => o.settings.get('syncReconnect') === 'ask';
  const heldHere = () => o.device.get(HELD_ROW) === String(o.account);
  const offline = (st) => st.state === 'offline' || !online();

  function hold() {
    // The row first: the runner's update comes back through onStatus.
    o.device.set(HELD_ROW, String(o.account));
    o.runner.hold();
  }

  /** Does this device have work the cloud lacks? Reads local records only. */
  function waiting() {
    if (!checking) {
      checking = Promise.resolve()
        .then(() => o.engine.localChanges())
        .then((list) => list.length > 0, () => true) // unreadable: hold rather than send unseen
        .finally(() => { checking = null; });
    }
    return checking;
  }

  function onStatus(st) {
    if (stopped) return;
    if (wasHeld && !st.held && heldHere()) o.device.reset((row) => row.id === HELD_ROW);
    wasHeld = !!st.held;
    if (!st.leader) return;
    if (st.held) {
      // The setting went back to "Upload them": they go.
      if (!asking()) {
        o.runner.release();
        return;
      }
      if (offline(st)) return;
      // Back online to nothing to show (the edits were undone, or the cloud's
      // version taken): nothing to ask about.
      waiting().then((any) => {
        const now = o.runner.status();
        if (!stopped && !any && now.held && !offline(now)) o.runner.release();
      });
      return;
    }
    if (heldHere()) {
      o.runner.hold();
      return;
    }
    if (!asking() || !offline(st)) return;
    if (st.pending) {
      hold();
      return;
    }
    // Offline from the start (a reload with the connection gone): the edits
    // are in storage, not in anything this tab heard.
    waiting().then((any) => {
      const now = o.runner.status();
      if (!stopped && any && now.leader && !now.held && asking() && offline(now) && !heldHere()) hold();
    });
  }

  const unsubscribe = o.runner.subscribe(onStatus);
  onStatus(o.runner.status());

  return {
    /** Look again: the network or the setting changed. */
    check: () => onStatus(o.runner.status()),
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}
