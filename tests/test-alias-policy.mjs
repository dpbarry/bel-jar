// Alias expansion policy.
//
//   GREEDY  always expand: every path, every panel, every source file kind (.elf included).
//   STRICT  never expand text that arrived unexpanded. Only manual typing expands.
//
// Greedy is the default. The typing path itself is pinned by test-aliases.mjs; this file pins
// every other seam that can be exercised without a browser: the stored default, which files
// storage expansion rewrites, proof formatting, Harpoon commit text, and the source renderer.
// Checker-produced types keep their own always-glyph display (test-turnstile-display.mjs).
import { create as createSettings } from '../js/persist/persist-settings.mjs';
import { readAliasActivationMode } from '../js/editor-src/aliases.mjs';
import { isSignaturePath } from '../js/editor-src/project-paths.mjs';
import { formatProofBody } from '../js/editor-src/format/proof-format.mjs';
import { committedMemberText, parseDecl } from '../js/editor-src/harpoon/harpoon-program.mjs';

let failures = 0;
function expect(cond, msg) {
  if (cond) return;
  failures += 1;
  console.error('FAIL:', msg);
}

// A fresh object each time, so aliases.mjs's identity-keyed mode cache re-reads.
function setMode(mode) {
  globalThis.Persist = mode ? { readStoredAliasActivation: () => mode } : undefined;
}
const prevPersist = globalThis.Persist;
const prevProjectSource = globalThis.ProjectSource;

// ── 1. Greedy is the default ──────────────────────────────────────────────────────────────
{
  const store = new Map();
  const settings = createSettings({
    backendLoad: (k) => (store.has(k) ? store.get(k) : null),
    backendSave: (k, v) => store.set(k, v),
    backendRemove: (k) => store.delete(k),
    tryParse: (s) => { try { return JSON.parse(s); } catch { return null; } },
  });
  expect(settings.readStoredAliasActivation() === 'greedy', 'nothing stored reads as greedy');
  settings.writeStoredAliasActivation('strict');
  expect(settings.readStoredAliasActivation() === 'strict', 'strict persists');
  settings.writeStoredAliasActivation('greedy');
  expect(settings.readStoredAliasActivation() === 'greedy' && store.size === 0, 'choosing greedy clears the key');
  store.set('beljar-alias-activation', 'eager');
  expect(settings.readStoredAliasActivation() === 'greedy', 'an unknown stored value reads as greedy');
  setMode(null);
  expect(readAliasActivationMode() === 'greedy', 'no Persist on the page reads as greedy');

  // ── 2. Storage expansion rewrites every source file kind, .elf included; never .cfg ─────
  const cases = { 'a.bel': true, 'grp/b.ELF': true, 'lemma': true, 'suite.cfg': false, 'notes.md': false };
  globalThis.ProjectSource = undefined;
  for (const [name, want] of Object.entries(cases)) {
    expect(settings.isAliasExpandablePath(name) === want, `fallback: ${name} expandable=${want}`);
  }
  globalThis.ProjectSource = { isSignaturePath };
  for (const [name, want] of Object.entries(cases)) {
    expect(settings.isAliasExpandablePath(name) === want, `with ProjectSource: ${name} expandable=${want}`);
  }
  globalThis.ProjectSource = prevProjectSource;
}

// ── 3. Proof formatting: same layout under both settings; glyphs only under greedy ────────
{
  const raw = [
    '',
    '/ total 1 /',
    'fn f => case f of',
    '  | [ |- D1] =>',
    '    [ |- D2]',
    '  | [ |- D3 X4 X5] =>',
    '    let [ |- R] = dual_sym [ |- X4] in',
    '  let [ |- R1] = dual_sym [ |- X5] in',
    '    [ |- D4 R R1]',
  ].join('\n');
  setMode('greedy');
  const greedy = formatProofBody(raw);
  setMode('strict');
  const strict = formatProofBody(raw);

  expect(greedy.includes('⊢') && !greedy.includes('|-'), 'greedy proof body is expanded');
  expect(strict.includes('|-') && strict.includes('=>'), 'strict proof body keeps |- and =>');
  expect(!/[⊢⇒→]/.test(strict), 'strict proof body gains no glyphs');
  const indents = (s) => s.split('\n').map((l) => (l.match(/^\s*/) || [''])[0].length);
  expect(JSON.stringify(indents(greedy)) === JSON.stringify(indents(strict)),
    'strict and greedy lay the proof out identically');
  const toks = (s) => (s.replace(/[⊢⇒→|[\]()=>-]/g, ' ').match(/[A-Za-z_][\w']*/g) || []).sort().join(' ');
  expect(toks(strict) === toks(raw), 'strict formatting preserves every token');
  expect(formatProofBody(strict) === strict, 'strict formatting is idempotent');
}

// ── 4. Harpoon commit: the declaration type and body follow the setting ───────────────────
{
  const decl = parseDecl('rec f : [ |- tp] -> [ |- tp] = ?');
  setMode('strict');
  const strict = committedMemberText(decl, 'fn x => [ |- z]', false);
  expect(strict.includes('[ |- tp] -> [ |- tp]'), `strict commit keeps the declared type as written: ${strict.split('\n')[0]}`);
  expect(!/[⊢⇒→]/.test(strict), 'strict commit writes no glyphs');
  setMode('greedy');
  const greedy = committedMemberText(decl, 'fn x => [ |- z]', false);
  expect(greedy.includes('⊢') && greedy.includes('→') && !greedy.includes('|-') && !greedy.includes('->'),
    `greedy commit is expanded: ${greedy.replace(/\n/g, ' / ')}`);
}

// ── 5. The shared source renderer (library preview, Harpoon panels) ───────────────────────
{
  const mk = () => ({ children: [], className: '', textContent: '', appendChild(c) { this.children.push(c); return c; } });
  const prevDocument = globalThis.document;
  globalThis.document = { createDocumentFragment: mk, createElement: mk, createTextNode: (t) => ({ text: String(t) }) };
  const textOf = (n) => (n.text != null ? n.text : (n.children.length ? n.children.map(textOf).join('') : n.textContent));
  const { highlightSourceFragment } = await import('../js/editor-src/format/source-render.mjs');
  const src = 'rec f : [ |- tp] -> [ |- tp] = fn x => x;';
  setMode('strict');
  expect(textOf(highlightSourceFragment(src)) === src, 'strict source preview shows the text exactly as written');
  setMode('greedy');
  const shown = textOf(highlightSourceFragment(src));
  expect(shown.includes('⊢') && !shown.includes('|-'), `greedy source preview is expanded: ${shown}`);
  globalThis.document = prevDocument;
}

globalThis.Persist = prevPersist;
if (failures) {
  console.error(`test-alias-policy: ${failures} failure(s)`);
  process.exit(1);
}
console.log('OK test-alias-policy (greedy default; greedy expands everywhere incl. .elf; strict never expands arrived text)');
