// Sync needs you, kept findable (plan v6 phase 04, n4; js/account/sync-watch.mjs,
// js/account/sync-ui.mjs). Done when: "forty failing rounds make one notice,
// and a round that succeeds clears it".
import { createFailureWatch, FAILING_MS } from '../js/account/sync-watch.mjs';
import { noteFailing } from '../js/account/sync-ui.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

let t = 0;
const watch = createFailureWatch({ now: () => t });
const failing = { state: 'error', reason: 'status-503' };
const said = [];
// Forty failing rounds, sixteen seconds apart: over ten minutes in all.
for (let i = 0; i < 40; i++) {
  const r = watch.observe(failing);
  if (r) said.push(r);
  t += 16_000;
}
expect(FAILING_MS === 10 * 60 * 1000 && said.length === 1 && said[0] === 'emit', `forty failing rounds over ten minutes make one notice (${said.join(',')})`);
expect(watch.observe(failing) === null, 'and the next failing one nothing more');
expect(watch.observe({ state: 'offline' }) === null && watch.observe({ state: 'syncing' }) === null, 'offline or syncing says nothing either way');
expect(watch.observe({ state: 'synced' }) === 'clear', 'a round that goes through clears it');
expect(watch.observe({ state: 'synced' }) === null && watch.since() === null, 'once');

const quick = createFailureWatch({ now: () => t });
const brief = [];
for (let i = 0; i < 20; i++) { const r = quick.observe(failing); if (r) brief.push(r); t += 15_000; }
expect(brief.length === 0, 'failing for five minutes says nothing: the cloud already shows it');
expect(quick.observe({ state: 'synced' }) === null, 'and recovering then says nothing either');
const offline = createFailureWatch({ now: () => t });
for (let i = 0; i < 100; i++) { expect(offline.observe({ state: 'offline' }) === null, 'offline is not failing'); t += 15_000; }

// What reaches the notifications: one card, by its key, with the reason; gone when it is over.
// A stand-in for the notifications: one card per key, as the store keeps them.
const cards = new Map();
const N = {
  emit: (x) => { cards.set(x.dedupeKey, Object.assign({ id: 'card-' + x.dedupeKey }, x)); },
  list: () => [...cards.values()],
  dismiss: (id) => { for (const [k, c] of [...cards]) if (c.id === id) cards.delete(k); },
};
noteFailing('emit', failing, N);
noteFailing('emit', failing, N);
const card = cards.get('sync.failing');
expect(cards.size === 1 && card && card.kind === 'error' && /busy|problem/.test(card.body) && /\(503\)/.test(card.body),
  `the notice says why, and stays one card (${JSON.stringify(card)})`);
noteFailing('clear', { state: 'synced' }, N);
expect(cards.size === 0, 'and a round that went through takes it away');

console.log(`OK sync watch (${n} checks: ten minutes of failing rounds make one notice with the reason, success takes it away, offline and brief trouble say nothing)`);
