// The two halves of an editor command must agree: the shell's catalogue holds
// the metadata, the editor holds the behaviour, and they meet only at the id.
// Nothing else stops one side from growing an id the other has never heard of.
import { EDITOR_COMMANDS, _pure, holeReport } from '../js/editor-src/ide/editor-commands.mjs';
import { CATALOG } from '../js/commands/command-catalog.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Both tables: the plain CodeMirror map and the custom ones (structure motions,
// the jump list, the proof-state reports). A custom id is exactly as capable of
// drifting from the catalogue as a mapped one.
const behaviour = Object.keys(EDITOR_COMMANDS).concat(_pure.CUSTOM_IDS);
const byId = new Map(CATALOG.map((c) => [c.id, c]));
expect(new Set(behaviour).size === behaviour.length, 'no id is attached twice');

for (const id of behaviour) {
  const cmd = byId.get(id);
  expect(cmd, `${id} has behaviour but no catalogue entry — it would be invisible`);
  expect(cmd.scope === 'editor', `${id} must be editor-scope`);
}
for (const id of Object.keys(EDITOR_COMMANDS)) {
  expect(typeof EDITOR_COMMANDS[id] === 'function', `${id} maps to a function`);
}

// The reverse: a motion or selection entry with no behaviour would sit in the
// Keybindings sheet accepting a chord that does nothing.
for (const cmd of CATALOG) {
  if (!/^(motion|select)\./.test(cmd.id)) continue;
  expect(behaviour.indexOf(cmd.id) >= 0, `${cmd.id} is catalogued but has no behaviour`);
}

// ── the shape motions must keep ───────────────────────────────────────────────
const motions = CATALOG.filter((c) => c.section === 'Motion');
expect(motions.length >= 30, `the motion set is worth having (${motions.length})`);
for (const m of motions) {
  // Nobody searches a command palette for "move left".
  expect(!m.palette, `${m.id} stays out of the palette`);
  expect(m.keybindable, `${m.id} is bindable — that is the whole point`);
  expect(!m.defaultSpec, `${m.id} ships unbound; CodeMirror already owns the arrows`);
  expect(m.styles && m.styles.vim === 'insert-only',
    `${m.id} must not fight Vim's own motions in Normal mode`);
  // …and off the command line too: `:motion-char-left` is not a thing anyone
  // types, and 31 of them would drown the line's completion.
  expect(m.cmdline === false, `${m.id} must stay out of the command line`);
}

// Every motion has its selection twin, or Shift+motion silently does nothing.
const ids = new Set(CATALOG.map((c) => c.id));
for (const m of motions) {
  if (!m.id.startsWith('motion.')) continue;
  const slug = m.id.slice('motion.'.length);
  if (['syntax-left', 'syntax-right'].indexOf(slug) >= 0) continue;
  expect(ids.has('select.' + slug), `motion.${slug} has no selection twin`);
}

const editVerbs = CATALOG.filter((c) => /^edit\./.test(c.id) && c.section === 'Edit');
expect(editVerbs.length >= 18, `the editing set grew (${editVerbs.length})`);
expect(ids.has('edit.delete-line') && ids.has('edit.move-line-up'), 'line surgery is available');

// ── the hole tally reads as a sentence ────────────────────────────────────────
expect(holeReport(0, 0, null) === 'No holes in this file.', 'nothing to report');
expect(holeReport(1, 0, null) === '1 hole in this file.', 'one hole, no declaration');
expect(holeReport(3, 0, 'maplus') === '3 holes in this file.',
  'a declaration with none of them is not worth naming');
expect(holeReport(3, 3, 'maplus') === '3 holes, all in maplus.', 'all in one place');
expect(holeReport(3, 1, 'maplus') === '3 holes, 1 in maplus.', 'split');
expect(holeReport(2, 2, 'maplus') === '2 holes, all in maplus.', 'plural agrees');

console.log(`OK editor commands (${behaviour.length} attached, ${motions.length} motions, both halves agree)`);
