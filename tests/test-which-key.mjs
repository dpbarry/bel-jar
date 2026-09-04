// Which-key: what the bar volunteers after a prefix, and what it refuses to.
//
// The hint is built from the same maps that define the bindings, so the thing
// to pin is that it never advertises a key that is not mapped, and never claims
// a prefix has continuations when the sequence is already complete.
//
// It renders as a LIST in the strip's popup, so there is no line to format and
// no label to abbreviate: `shortLabel`/`whichKeyLine` were deleted with the
// one-line message they served.
import { continuations, keyMaps } from '../js/editor-src/ide/modal/which-key.mjs';
import { _pure as vimMaps } from '../js/editor-src/ide/modal/vim-setup.mjs';
import { CATALOG } from '../js/commands/command-catalog.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const BACKSLASH = String.fromCharCode(92);
const maps = keyMaps(vimMaps.NORMAL_MAP, vimMaps.LEADER_MAP, BACKSLASH);

// ── continuations ────────────────────────────────────────────────────────────
const g = continuations('g', maps);
expect(g.length >= 4, `g has continuations (${g.length})`);
expect(g.every((r) => r.key.length === 1), 'each is the single key that follows');
expect(g.some((r) => r.key === 'd' && r.id === 'nav.definition'), 'gd is offered under g');

const bracket = continuations(']', maps);
expect(bracket.length === 4, `] offers four motions (${bracket.length})`);
expect(bracket.map((r) => r.key).sort().join('') === 'cdeh', 'the four bracket motions');

const lead = continuations(BACKSLASH, maps);
expect(lead.length === vimMaps.LEADER_MAP.length, 'the leader offers its whole map');

// A count is Vim's, not ours: `2g` is still the `g` prefix.
expect(continuations('2g', maps).length === g.length, 'a leading count is stripped');
expect(continuations('12]', maps).length === bracket.length, 'a multi-digit count too');

// A complete sequence has nothing left to wait for.
expect(continuations('gd', maps).length === 0, 'an exact match is not a continuation');
expect(continuations('', maps).length === 0, 'nothing typed, nothing to say');
expect(continuations('2', maps).length === 0, 'a bare count is not a prefix');
expect(continuations('zzz', maps).length === 0, 'an unmapped prefix offers nothing');
expect(continuations('g', []).length === 0, 'no maps, no hint');

// ── every row is renderable ──────────────────────────────────────────────────
// The popup shows `key` on the left and the command's title on the right, so a
// row is only worth offering if the registry can name it. A key with no title
// renders as a bare letter, which reads as a dead key.
const titleOf = new Map(CATALOG.map((c) => [c.id, c.title]));
for (const row of g.concat(bracket, continuations(BACKSLASH, maps))) {
  expect(typeof row.key === 'string' && row.key.length > 0, 'every row has a key to press');
  expect(titleOf.get(row.id), `${row.key} → ${row.id} has a title to show`);
}

// ── Emacs chains: same machinery, different spelling ─────────────────────────
const { emacsMaps } = await import('../js/editor-src/ide/modal/which-key.mjs');
const { _pure: emacsBindings } = await import('../js/editor-src/ide/modal/emacs-setup.mjs');
const eMaps = emacsMaps(emacsBindings.CX_MAP, emacsBindings.CC_MAP);

const cc = continuations('C-c', eMaps);
expect(cc.length === emacsBindings.CC_MAP.length, `C-c offers its whole map (${cc.length})`);
expect(cc.every((r) => r.key.indexOf(' ') < 0), 'each continuation is the second key alone');
expect(cc.some((r) => r.key === 'h' && r.id === 'prover.hole-intro'), 'C-c h is offered');

const cx = continuations('C-x', eMaps);
expect(cx.some((r) => r.key === 'C-f'), 'a chain whose second key is a chord keeps its spelling',
  JSON.stringify(cx.map((r) => r.key)));
expect(cx.some((r) => r.key === 'b'), 'and a plain second key stays plain');

// ⛔ The prefix must end at a boundary: `C-x` must not claim `C-c h`.
expect(continuations('C-x', eMaps).every((r) => !/hole/i.test(r.id)),
  'C-x does not swallow the C-c map');
expect(continuations('C-c h', eMaps).length === 0, 'a complete chain has nothing left to offer');
expect(continuations('C-z', eMaps).length === 0, 'an unmapped prefix offers nothing');

// The declined chords answer when pressed but are not capabilities, so a hint
// that lists what you CAN do leaves them out.
const declinedKeys = emacsBindings.DECLINED.map(([k]) => k);
for (const [keys] of eMaps) {
  expect(declinedKeys.indexOf(keys) < 0, `${keys} is declined and must not be in the hint map`);
}

// ── every mapped id is a real command ────────────────────────────────────────
// A hint whose command does not exist renders as nothing, which looks like a
// dead key. The maps and the catalogue must agree.
const ids = new Set(titleOf.keys());
for (const [keys, id] of maps.concat(eMaps)) {
  expect(ids.has(id), `${keys} maps to ${id}, which is not in the catalogue`);
}

console.log(`OK which-key (${maps.length} Vim + ${eMaps.length} Emacs sequences, counts stripped, every row nameable)`);
