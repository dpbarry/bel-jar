// The committed-proof pretty-printer: canonical glyphs + structural re-indent.
// A layout/glyph transform only — must never change the proof's TOKENS (verified
// live in the prover probes; here we pin the pure text contract).
import { formatProofBody } from '../editor-src/bel-proof-format.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── 1. Canonical glyphs: |- → ⊢, -> → →, => → ⇒ (matching the corpus house style)
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
const out = formatProofBody(raw);
expect(!out.includes('|-'), 'no ASCII turnstile survives');
expect(out.includes('⊢'), 'turnstile canonicalized to ⊢');
expect(out.includes('⇒'), 'case arrows canonicalized to ⇒');
expect(!/=>/.test(out), 'no ASCII => survives');

// ── 2. Sibling `let`s ALIGN (the mis-indent the raw splicer produced) ─────────
const letLines = out.split('\n').filter((l) => /\blet\b/.test(l));
expect(letLines.length === 2, 'two let lines present');
const indentOf = (l) => (l.match(/^(\s*)/) || ['', ''])[1].length;
expect(indentOf(letLines[0]) === indentOf(letLines[1]),
  `sibling lets align (got ${indentOf(letLines[0])} vs ${indentOf(letLines[1])})`);

// ── 3. Arm bars align under the case ─────────────────────────────────────────
const barLines = out.split('\n').filter((l) => /^\s*\|/.test(l));
expect(barLines.length === 2, 'two arm bars present');
expect(indentOf(barLines[0]) === indentOf(barLines[1]), 'arm bars align');

// ── 4. No token loss: every constructor/var name from the raw survives ────────
const toks = (s) => (s.replace(/[⊢⇒→|[\]()]/g, ' ').match(/[A-Za-z_][\w']*/g) || []).sort();
expect(JSON.stringify(toks(raw)) === JSON.stringify(toks(out)),
  'formatting preserves the token multiset (no drops, no additions)');

// ── 5. Totality annotation kept, alone at the top ────────────────────────────
expect(/^\/\s*total 1 \//.test(out.split('\n').find((l) => l.trim().length) || ''),
  'totality annotation leads');

// ── 6. Idempotent (formatting a formatted body is a no-op) ────────────────────
expect(formatProofBody(out) === out, 'formatter is idempotent');

console.log('OK test-proof-format (canonical glyphs + aligned re-indent, token-preserving)');
