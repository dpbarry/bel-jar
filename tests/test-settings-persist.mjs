// Settings as the real Persist bundle stands them up: one store and one Settings
// for the page, published beside Persist and Device, a clean slate on first
// boot, device records following the settings that say where they live, and
// device state surviving a settings reset.
// Every setting's own values and defaults are pinned by test-settings.mjs.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { runPersistStackInContext } from './persist-stack.mjs';
import { TOAST_DURATION_MS, CHECK_DELAY_SCALE, prefersReducedMotion } from '../js/persist/settings-apply.mjs';

function makeStorage(maxChars = Infinity) {
  const m = new Map();
  const used = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      v = String(v);
      if (used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length > maxChars) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      m.set(k, v);
    },
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

// Values made inside the Persist sandbox carry that realm's prototypes; strict
// deepEqual compares prototypes, so copy them into this realm before comparing.
const here = (v) => JSON.parse(JSON.stringify(v));

function freshPersist(seed = {}, opts = {}) {
  const ls = makeStorage(opts.maxChars);
  const ss = makeStorage();
  for (const [k, v] of Object.entries(seed)) ls.setItem(k, v);
  const ctx = vm.createContext({ clearTimeout, setTimeout, TextEncoder, localStorage: ls, sessionStorage: ss });
  ctx.globalThis = ctx;
  runPersistStackInContext(ctx);
  return { P: ctx.Persist, S: ctx.Settings, D: ctx.Device, ls, ss };
}

// ── one Settings, published beside Persist, over a clean slate ───────────────
{
  const { P, S, D, ls } = freshPersist({ 'beljar-theme': 'light', 'beljar-state-v2': '{}', 'other-app': 'x' });
  assert.ok(P && S && D, 'the bundle publishes Persist, Settings and Device');
  assert.equal(typeof P.readStoredTheme, 'undefined', 'Persist no longer answers for settings');
  assert.equal(ls.getItem('beljar-theme'), null, 'first boot wipes the old settings keys');
  assert.equal(ls.getItem('beljar-state-v2'), null, 'and every other old BelJar key');
  assert.equal(ls.getItem('other-app'), 'x', "another app's key on the origin survives");
  assert.equal(S.get('theme'), 'dark', 'so nothing old leaks into a setting');
  S.set('theme', 'light');
  assert.equal(JSON.parse(ls.getItem('beljar/settings')).data.values.theme, 'light', 'a setting lands in the one record');
}

// ── the REPL history follows its setting, wherever the setting changes ──────
{
  const { P, S, ls, ss } = freshPersist();
  const T = 'beljar/repl/transcript';
  assert.equal(S.get('replHistoryPersist'), 'local');
  assert.equal(P.readReplTranscript(), null);
  P.writeReplTranscript({ html: '<div>local</div>', scrollTop: 12, savedAt: 99 });
  P.writeReplCommands(['types', 'help']);
  assert.deepEqual(here(P.readReplTranscript()), { html: '<div>local</div>', scrollTop: 12, savedAt: 99 });
  assert.ok(ls.getItem(T) && !ss.getItem(T), 'local mode keeps it on this device');

  S.set('replHistoryPersist', 'session');
  assert.ok(ss.getItem(T), 'switching to session MOVES the transcript to the tab store');
  assert.equal(ls.getItem(T), null, 'and off the device');
  assert.deepEqual(here(P.readReplCommands()), ['types', 'help'], 'with the command history');
  assert.equal(P.readReplTranscript().html, '<div>local</div>');

  S.set('replHistoryPersist', 'none');
  assert.equal(P.readReplTranscript(), null, "'none' clears it");
  assert.deepEqual(here(P.readReplCommands()), []);
  assert.equal(ls.getItem(T), null);
  assert.equal(ss.getItem(T), null);
  P.writeReplTranscript({ html: '<div>ignored</div>', scrollTop: 0, savedAt: 2 });
  P.writeReplCommands(['ignored']);
  assert.equal(P.readReplTranscript(), null, "and nothing is kept while it is 'none'");

  S.set('replHistoryPersist', 'local');
  S.set('replHistoryCap', 100);
  P.writeReplCommands(Array.from({ length: 150 }, (_, i) => 'c' + i));
  const kept = P.readReplCommands();
  assert.equal(kept.length, 100, 'history is capped by its setting');
  assert.equal(kept[99], 'c149', 'keeping the newest');

  S.set('replEcho', false);
  S.set('replHistoryCap', 1000);
  const before = here(P.readReplCommands());
  assert.equal(before.length, 100, 'the capped history is what is kept');
  S.reset('repl');
  assert.equal(S.get('replEcho'), true, 'resetting the REPL section restores its settings');
  assert.deepEqual(here(P.readReplCommands()), before,
    'history is data, not a setting: a reset does not throw it away');
}

// ── device state is untouched by settings resets, and has its own ───────────
{
  const { P, S, D, ls } = freshPersist();
  D.set('editorSplit', 0.42);
  D.set('explorerWidth', 300);
  D.set('harpoonHeight', 220);
  D.set('commandLineHistory', ['fmt', 'w']);
  P.writeWorkspace({ activeSidePanel: 'library' });
  S.resetAll();
  assert.equal(D.get('editorSplit'), 0.42, 'Reset all settings keeps the layout');
  assert.equal(D.get('explorerWidth'), 300);
  assert.equal(P.readWorkspace().activeSidePanel, 'library', 'and the workspace');
  assert.deepEqual(here(D.get('commandLineHistory')), ['fmt', 'w'], 'and the command-line history');
  assert.ok(!('commandLineHistory' in S.exportBundle().values), 'which is device state, never exported');
  assert.deepEqual(Object.keys(JSON.parse(ls.getItem('beljar/device')).data.values).sort(),
    ['activeProject', 'commandLineHistory', 'editorSplit', 'explorerWidth', 'harpoonHeight'],
    'device state is one record, holding only what differs from the defaults');

  D.reset((row) => row.group === 'layout');
  assert.equal(D.get('editorSplit'), 0.5, 'Reset panel layout puts the split back');
  assert.equal(D.get('explorerWidth'), 250);
  assert.equal(D.get('harpoonHeight'), 190);
  assert.deepEqual(here(D.get('commandLineHistory')), ['fmt', 'w'], 'and nothing that is not layout');
}

// ── a full disk is reported through Persist's own save-blocked state ─────────
{
  const { P, S } = freshPersist({}, { maxChars: 200 });
  assert.equal(P.isSaveBlocked(), false);
  assert.equal(S.set('keybindings', { 'nav.anywhere': 'x'.repeat(400) }), false, 'a setting that cannot fit is refused');
  assert.equal(P.isSaveBlocked(), true, 'and the page knows saving is blocked');
  assert.equal(S.set('theme', 'light'), true, 'a write that fits goes through');
  assert.equal(P.isSaveBlocked(), false, 'and clears the block');
}

// ── the helpers that derive from settings ────────────────────────────────────
assert.deepEqual(TOAST_DURATION_MS, { short: 2000, normal: 3500, long: 5000 });
assert.deepEqual(CHECK_DELAY_SCALE, { responsive: 0.7, balanced: 1, thorough: 1.45 });
assert.equal(prefersReducedMotion('reduce'), true);
assert.equal(prefersReducedMotion('full'), false);

console.log('OK settings persist (one Settings and one Device per page, clean first boot, REPL history follows its setting, device state survives resets, full disk reported)');
