// SHAPE-CLASS COVERAGE MATRIX + GRAMMAR ANCHOR (docs/archive/prover-completeness.md §6).
//
// The theorem this test exploits: candidate generation is SYNTAX-DIRECTED and
// name-independent (test-prover-no-overfit enforces the latter structurally),
// so completeness over the infinite inductive fragment reduces to completeness
// over FINITELY MANY hole-state shape classes. Each row below constructs one
// representative state per class (invented names — never corpus/held-out
// lemmas) and asserts the spec-mandated candidate is generated. A coverage gap
// is then a RED ROW found by construction — never something a blind corpus has
// to stumble on first. Adding syntax dimensions (new binder sorts, new
// hypothesis kinds) REQUIRES adding rows here.
//
// bel-synth's own obligations (fact inversion, pass-through args, DFS fairness,
// bound honesty) are pinned in test-prover-completeness.mjs; this matrix covers
// the candidateMoves surface.
import fs from 'node:fs';
import { candidateMoves, recurseTexts, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── The matrix ───────────────────────────────────────────────────────────────
// Shared invented signature pieces per row keep classes independent.
const ROWS = [
  {
    name: 'intro: Greek / unicode letter Pi binders ($σ, Γ, φ)',
    spec: '§2 intro (Phase B letter-ident class)',
    code: 'tm9 : type.\nff9 : tm9 -> type.\nschema sc9 = block (x:tm9, u:ff9 x);',
    thm: 'rec tgreek : {Γ:sc9}{$σ:$[ |- Γ]}{φ:[|- tm9]} [Γ |- ff9 M[..]] -> [ |- ff9 φ] =\n/ total d (tgreek g s p m d) /\n?\n;',
    hole: {
      goal: '{Γ:sc9}{$σ:$[ |- Γ]}{φ:[|- tm9]} [Γ |- ff9 M[..]] -> [ |- ff9 φ]',
      ctx: [],
      meta: [],
    },
    want: (ms) => ms.some((m) => m.kind === 'intro'
      && /mlam Γ => mlam \$σ => mlam φ => fn \w+ => \?/.test(m.text)),
  },
  {
    name: 'synth facts: Greek meta names admitted',
    spec: '§2 fill/synth (Phase B pushFact letter class)',
    code: 'qq9 : type.\nr9 : qq9 -> type.\nc9 : r9 Z.',
    thm: 'rec tpsi : [ |- r9 A] -> [ |- r9 A] =\n/ total 1 /\n?\n;',
    hole: {
      goal: '[ |- r9 A]',
      ctx: [],
      meta: [{ name: 'ψ', type: '( |- r9 A)' }],
    },
    want: (ms) => ms.some((m) => (m.kind === 'fill' || m.kind === 'synth')
      && /ψ/.test(m.text)),
  },
  {
    name: 'synth: ctype hypothesis admitted as fact (Phase C)',
    spec: '§2 synth (ctype facts)',
    code: [
      'tmC : type.',
      'inductive RelC : [ |- tmC] -> [ |- tmC] -> ctype =',
      '| RelC0 : RelC [ |- X] [ |- X];',
      'uC : type.',
      'unitC : uC.',
    ].join('\n'),
    thm: 'rec tctype : RelC [ |- A] [ |- B] -> [ |- uC] =\n/ total 1 /\n?\n;',
    hole: {
      goal: '[ |- uC]',
      ctx: [{ name: 'r1', type: 'RelC [ |- A] [ |- B]' }],
      meta: [],
    },
    want: (ms) => ms.some((m) => /r1|unitC|synth|fill/.test(m.kind + m.text)),
  },
  {
    // The DECLARATION-FIXITY dimension (2026-07-12, found live on real corpora):
    // a family declared `--infix` is illegal in prefix position, so split-arm
    // ANNOTATIONS (the ctor's result type respelled) must render it infix.
    name: 'split: infix-declared family — arm annotations render infix',
    spec: '§2 split (fixity-preserving emission)',
    code: [
      'tn : type.',
      'tz : tn.',
      'ts : tn -> tn.',
      'ee : tn -> tn -> type.',
      '--infix ee 5 none.',
      'e_z : tz ee tz.',
      'e_s : (X ee Y) -> (ts X) ee (ts Y).',
    ].join('\n'),
    thm: 'rec t0f : [ |- A ee B] -> [ |- A ee B] =\n/ total 1 /\n?\n;',
    hole: { goal: '[ |- A ee B]', ctx: [{ name: 'd', type: '[ |- A ee B]' }], meta: [] },
    want: (ms) => {
      const splits = ms.filter((m) => m.kind === 'split' && /case d of/.test(m.text));
      if (!splits.length) return false;
      // Some split variant must carry an ANNOTATED e_s arm spelled infix, and
      // no variant may ever spell the family in prefix position.
      const annotated = splits.some((m) => / : \[ \|-[^\]]*\bts \w+\) ee \(ts /.test(m.text));
      const neverPrefix = splits.every((m) => !/\|-\s*ee[\s\]]/.test(m.text));
      return annotated && neverPrefix;
    },
  },
  {
    name: 'intro: arrow telescope',
    spec: '§2 intro',
    code: 'qq : tp2 -> type.\nrr : tp2 -> type.',
    thm: 'rec t1 : [ |- qq A] -> [ |- rr A] =\n/ total 1 /\n?\n;',
    hole: { goal: '[ |- qq A] -> [ |- rr A]', ctx: [], meta: [] },
    want: (ms) => ms.some((m) => m.kind === 'intro' && /^fn \w+ => \?$/.test(m.text)),
  },
  {
    name: 'intro: full mixed telescope (ctx + ctx + subst Pi)',
    spec: '§2 intro (every binder sort)',
    code: 'tm2 : type.\nff : tm2 -> type.\nschema sc1 = block (x:tm2, u:ff x);',
    thm: 'rec t2 : {g:sc1}{h:sc1}{$S:$[h |- g]} [g |- ff M[..]] -> [h |- ff M[$S]] =\n/ total d (t2 g h s m d) /\n?\n;',
    hole: { goal: '{g:sc1}{h:sc1}{$S:$[h |- g]} [g |- ff M[..]] -> [h |- ff M[$S]]', ctx: [], meta: [] },
    want: (ms) => ms.some((m) => m.kind === 'intro'
      && /^mlam g => mlam h => mlam \$S => fn \w+ => \?$/.test(m.text)),
  },
  {
    name: 'split: comp hypothesis of box type',
    spec: '§2 split (Γc)',
    code: 'dd : type.\nk1 : dd.\nk2 : dd.\npp : dd -> type.\nj1 : pp k1.\nj2 : pp k2.',
    thm: 'rec t3 : [ |- pp D] -> [ |- pp D] =\n/ total 1 /\n?\n;',
    hole: { goal: '[ |- pp D]', ctx: [{ name: 'v1', type: '[ |- pp D]' }], meta: [] },
    want: (ms) => ms.some((m) => m.kind === 'split' && m.scrutinee === 'v1'),
  },
  {
    name: 'split: cD metavariable, multi-constructor family (D6)',
    spec: '§2 split (Δ)',
    code: 'dd : type.\nk1 : dd.\nk2 : dd.\npp : dd -> type.\nj1 : pp k1.\nj2 : pp k2.',
    thm: 'rec t4 : [ |- pp D] -> [ |- pp D] =\n/ total 1 /\n?\n;',
    hole: { goal: '[ |- pp k1]', ctx: [], meta: [{ name: 'X7', type: '( |- pp D)' }] },
    want: (ms) => ms.some((m) => m.kind === 'split' && /X7/.test(m.scrutinee || '')),
  },
  {
    name: 'invert: unique-constructor hypothesis',
    spec: '§2 invert',
    code: 'nn : type.\nz2 : nn.\ns2 : nn -> nn.\nww : nn -> type.\nwz : ww z2.\nws : ww N -> ww (s2 N).',
    thm: 'rec t5 : [ |- ww (s2 N)] -> [ |- ww N] =\n/ total 1 /\n?\n;',
    hole: { goal: '[ |- ww N]', ctx: [{ name: 'v2', type: '[ |- ww (s2 N)]' }], meta: [] },
    want: (ms) => ms.some((m) => m.kind === 'invert' && /let /.test(m.text) && /v2/.test(m.text)),
  },
  {
    name: 'impossible: uninhabitable hypothesis (0-arm case)',
    spec: '§2 split (impossible)',
    code: 'mm : type.\nc3 : mm.\nvv : mm -> type.\nvc : vv c3.\nimposs2 : type.',
    thm: 'rec t6 : [ |- vv D] -> [ |- imposs2] =\n/ total 1 /\n?\n;',
    // No constructor of `vv` unifies with `vv q9` (q9 undeclared index shape).
    hole: { goal: '[ |- imposs2]', ctx: [{ name: 'v3', type: '[ |- uu d9]' }], meta: [] },
    codeExtra: 'uu : mm -> type.\nd9 : mm.',
    want: (ms) => ms.some((m) => m.kind === 'impossible' && /v3/.test(m.text)),
  },
  {
    name: 'fill: bare comp variable of exactly the goal type',
    spec: '§2 fill (Γc bare)',
    code: 'ee : type.\ne1 : ee.\ngg : ee -> type.\nge : gg e1.',
    thm: 'rec t7 : [ |- gg E] -> [ |- gg E] =\n/ total 1 /\n?\n;',
    hole: { goal: '[ |- gg E]', ctx: [{ name: 'v4', type: '[ |- gg E]' }], meta: [] },
    want: (ms) => ms.some((m) => m.kind === 'fill' && m.text === 'v4'),
  },
  {
    name: 'fill: parameter projection, identity substitution',
    spec: '§2 fill (param, [..])',
    code: 'tm3 : type.\nhh : tm3 -> type.\nschema sc2 = block (x:tm3, u:hh x);',
    thm: 'rec t8 : (g:sc2) [g |- hh X[..]] -> [g |- hh X[..]] =\n/ total 1 /\n?\n;',
    hole: {
      goal: '[g |- hh X[..]]',
      ctx: [],
      meta: [{ name: 'g', type: 'sc2' }, { name: '#p', type: '#(g |- block (x:tm3, u:hh x))' }],
    },
    want: (ms) => ms.some((m) => m.kind === 'fill' && /#p\.u\[\.\.\]/.test(m.text)),
  },
  {
    name: 'fill: parameter projection UNDER a substitution variable (D5)',
    spec: '§2 fill (param, [$S])',
    code: 'tm3 : type.\nhh : tm3 -> type.\nschema sc2 = block (x:tm3, u:hh x);',
    thm: 'rec t9 : {g:sc2}{h:sc2}{$S:$[h |- g]} [g |- hh X[..]] -> [h |- hh X[$S]] =\n/ total d (t9 g h s x d) /\n?\n;',
    hole: {
      goal: '[h |- hh (#p.1[$S[..]])]',
      ctx: [],
      meta: [
        { name: 'g', type: 'sc2' }, { name: 'h', type: 'sc2' },
        { name: '$S', type: '$[h |- g]' },
        { name: '#p', type: '#(g |- block (x:tm3, u:hh x))' },
      ],
    },
    want: (ms) => ms.some((m) => m.kind === 'fill' && (/#p\.u\[\$S\]/.test(m.text) || /#p\.2\[\$S\]/.test(m.text))),
  },
];

for (const row of ROWS) {
  const code = `${row.code}\n${row.codeExtra || ''}\n${row.thm}\n`;
  const thm = theoremUnderProof(row.thm);
  expect(thm, `${row.name}: theorem parses`);
  const moves = candidateMoves(row.hole, code, thm);
  expect(row.want(moves), `${row.name} [${row.spec}] — mandated candidate missing.\n  got: `
    + moves.map((m) => `${m.kind}:${(m.text || '').split('\n')[0].slice(0, 60)}`).join('\n       '));
}

// ── batch-2-revealed classes (each STUCK target owed a row — spec §6) ───────
{
  // Named context-entry variable arms (the exchange shape): the split's arm set
  // must include `| [g, u:…, v:… |- u]` / `… |- v` — #p covers only the schema part.
  const code = ['gm2 : type.', 'op3 : gm2.', 'wd2 : gm2 -> gm2 -> gm2.',
    'pr2 : gm2 -> type.', 'po : pr2 op3.', 'pw : pr2 M -> pr2 N -> pr2 (wd2 M N).',
    'schema pc3 = some [x:gm2] pr2 x;'].join('\n');
  const thmText = 'rec t13 : (g:pc3) [g, u:pr2 A[..], v:pr2 B[..] |- pr2 M[..]] -> [g, v:pr2 B[..], u:pr2 A[..] |- pr2 M[..]] =\n/ total d (t13 g a b m d) /\n?\n;';
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[g, v:pr2 B[..], u:pr2 A[..] |- pr2 M[..]]',
    ctx: [{ name: 'd', type: '[g, u:pr2 A[..], v:pr2 B[..] |- pr2 M[..]]' }],
    meta: [{ name: 'g', type: 'pc3' }],
  };
  const ms = candidateMoves(hole, `${code}\n${thmText}`, thm);
  const sp = ms.find((m) => m.kind === 'split' && m.scrutinee === 'd');
  expect(sp && /\|-\s*u\]\s*=>/.test(sp.text) && /\|-\s*v\]\s*=>/.test(sp.text),
    'split: named context-entry variable arms present [§2 split]\n  got: ' + (sp ? sp.text : 'no split'));
}
{
  // Object-Pi pass-through in IH calls (the congruence shape):
  // `{N:[ |- tm]} [ |- q M M'] -> [ |- q (op M N) (op M' N)]` recursion passes N through.
  const code = 'tm5 : type.\nop5 : tm5 -> tm5 -> tm5.\nq5 : tm5 -> tm5 -> type.\nqr : q5 M M.';
  const thmText = "rec t14 : {N : [ |- tm5]} [ |- q5 M M'] -> [ |- q5 (op5 M N) (op5 M' N)] =\n/ total d (t14 m m' n d) /\n?\n;";
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: "[ |- q5 (op5 M1 N) (op5 M1' N)]",
    ctx: [],
    meta: [{ name: 'N', type: '( |- tm5)' }, { name: 'Xd', type: "( |- q5 M1 M1')" }],
  };
  const ts = recurseTexts(hole, thm, `${code}\n${thmText}`);
  expect(ts.some((t) => /t14 \[\s*\|-\s*N\] \[\s*\|-\s*Xd\]/.test(t)),
    'recurse: object-Pi binder passed through (`t14 [ |- N] [ |- Xd]`) [§2 rec]\n  got: ' + ts.join('\n       '));
}
{
  // Comp variable as a LEMMA-call argument, bare variant (the soundness shape).
  const code = 'nn6 : type.\npl6 : nn6 -> nn6 -> type.\nqq6 : nn6 -> type.\nrec lem6 : [ |- pl6 A B] -> [ |- qq6 A] -> [ |- qq6 B] =\n/ total 1 /\n?\n;';
  const thmText = 'rec t15 : [ |- pl6 A B] -> [ |- qq6 A] -> [ |- qq6 B] =\n/ total 1 /\n?\n;';
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[ |- qq6 B]',
    ctx: [{ name: 'cq', type: '[ |- qq6 A]' }],
    meta: [{ name: 'Pd', type: '( |- pl6 A B)' }],
  };
  const ms = candidateMoves(hole, `${code}\n${thmText}`, thm);
  expect(ms.some((m) => m.kind === 'lemma' && /lem6 \[\s*\|-\s*Pd\] cq\b/.test(m.text)),
    'lemma call: comp hypothesis bare-argument variant proposed [§2 rec/lemma / D3]\n  got: '
    + ms.filter((m) => m.kind === 'lemma').map((m) => m.text.split('\n')[0]).join('\n       '));
}

// ── session-3 classes (each live-fixed mechanism owes its row — spec §6) ─────
{
  // Named-entry variable FILL: the goal-context entry itself is the derivation.
  const code = 'gm8 : type.\npr8 : gm8 -> type.\nschema pc8 = some [x:gm8] pr8 x;';
  const thmText = 'rec t17 : (g:pc8) [g, u:pr8 A[..], v:pr8 B[..] |- pr8 M[..]] -> [g, v:pr8 B[..], u:pr8 A[..] |- pr8 M[..]] =\n/ total d (t17 g a b m d) /\n?\n;';
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[g, v:pr8 B[..], u:pr8 A[..] |- pr8 (A[..])]',
    ctx: [],
    meta: [{ name: 'g', type: 'pc8' }, { name: 'A', type: '(g |- gm8)' }, { name: 'B', type: '(g |- gm8)' }],
  };
  const ms = candidateMoves(hole, `${code}\n${thmText}`, thm);
  expect(ms.some((m) => m.kind === 'fill' && /\|-\s*u\]$/.test(m.text.trim())),
    'fill: named goal-context entry as the derivation [§2 fill]\n  got: '
    + ms.filter((m) => m.kind === 'fill').map((m) => m.text).join(' ; '));
}
{
  // Bare-parameter fill from the checker's `#(g |- fam X)` spelling.
  const code = 'gm9 : type.\npr9 : gm9 -> type.\nschema pc9 = some [x:gm9] pr9 x;';
  const thmText = 'rec t18 : (g:pc9) [g |- pr9 M[..]] -> [g |- pr9 M[..]] =\n/ total 1 /\n?\n;';
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[g |- pr9 (X[..])]',
    ctx: [],
    meta: [{ name: 'g', type: 'pc9' }, { name: '#p', type: '#(g |- pr9 X)' }],
  };
  const ms = candidateMoves(hole, `${code}\n${thmText}`, thm);
  expect(ms.some((m) => m.kind === 'fill' && /#p\[\.\.\]/.test(m.text)),
    'fill: bare parameter from the reported #(g |- …) spelling [§2 fill]\n  got: '
    + ms.filter((m) => m.kind === 'fill').map((m) => m.text).join(' ; '));
}
{
  // Ctype-constructor fills: bare comp premise + recently let-bound component.
  const code = ['nn9 : type.\nzz9 : nn9.\nss9 : nn9 -> nn9.',
    'ql9 : nn9 -> nn9 -> type.\nqz9 : ql9 zz9 zz9.\nqs9 : ql9 M N -> ql9 (ss9 M) (ss9 N).',
    'inductive Pair9 : [ |- nn9] -> [ |- nn9] -> ctype =',
    '| Mk9 : [ |- ql9 A B] -> [ |- ql9 B A] -> Pair9 [ |- A] [ |- B];'].join('\n');
  const thmText = 'rec t19 : [ |- ql9 A B] -> Pair9 [ |- A] [ |- B] =\n/ total 1 /\n?\n;';
  const full = [code, thmText.replace('?', [
    'fn q => case q of',
    '  | [ |- qs9 X] =>',
    '    let Mk9 [ |- R] [ |- R1] = t19 [ |- X] in',
    '  ?',
  ].join('\n'))].join('\n');
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: 'Pair9 [ |- ss9 M1] [ |- ss9 N1]',
    line: full.split('\n').findIndex((l) => l.trim() === '?') + 1,
    col: 3,
    ctx: [{ name: 'q', type: '[ |- ql9 A B]' }],
    meta: [{ name: 'M1', type: '( |- nn9)' }, { name: 'N1', type: '( |- nn9)' }],
  };
  const ms = candidateMoves(hole, full, thm);
  const fills = ms.filter((m) => m.kind === 'fill').map((m) => m.text);
  expect(fills.some((t) => /^Mk9 q /.test(t) || / q$/.test(t) || / q /.test(t)),
    'ctype fill: bare comp premise as an argument [§2 fill / D3]\n  got: ' + fills.slice(0, 8).join(' ; '));
  expect(fills.some((t) => /\[\s*\|-\s*R\]/.test(t)),
    'ctype fill: recently let-bound component as an argument [§2 fill]\n  got: ' + fills.slice(0, 8).join(' ; '));
}

// ── DECL SCOPING: branch detection must never leak across declarations ──────
// A top-level hole in a theorem that FOLLOWS a case-bearing sibling must still
// generate its primary split — an unclamped upward arm-scan reads the sibling's
// arms, fakes a mid-branch state, and the introduced-premise guard then blocks
// the split (the ceq-congruence regress's true root).
{
  const code = [
    'tt0 : type.\nc0 : tt0.\nqq0 : tt0 -> tt0 -> type.\nq0 : qq0 c0 c0.',
    'rec first0 : [ |- qq0 A B] -> [ |- qq0 A B] =',
    '/ total 1 /',
    'fn x => case x of',
    '  | [ |- q0] => [ |- q0]',
    ';',
    "rec second0 : [ |- qq0 A B] -> [ |- qq0 B A] =",
    '/ total 1 /',
    '?',
    ';',
  ].join('\n');
  const thm = theoremUnderProof("rec second0 : [ |- qq0 A B] -> [ |- qq0 B A] =\n/ total 1 /\n?\n;");
  const hole = {
    goal: '[ |- qq0 B A]',
    line: code.split('\n').findIndex((l, i) => i > 6 && l.trim() === '?') + 1,
    col: 1,
    ctx: [{ name: 'd0', type: '[ |- qq0 A B]' }],
    meta: [],
  };
  const ms = candidateMoves(hole, code, thm);
  expect(ms.some((m) => m.kind === 'split' && m.scrutinee === 'd0'),
    'primary split generated at a top-level hole AFTER a case-bearing sibling [decl scoping]\n  got kinds: '
    + ms.map((m) => m.kind).join(','));
}

// ── DECLARATION-STYLE dimension: LF-block form must behave like old-style ───
// (The live corpus uses `LF fam : K = | c : T ;` blocks; ctor→family resolution
// through familyOfConstructorName must work for BOTH forms, or every pattern-
// meta-driven candidate silently degrades — the batch-2 exch/eva class.)
{
  const code = ['LF gm7 : type =', '| oo7 : gm7', '| ww7 : gm7 -> gm7 -> gm7;',
    'LF pr7 : gm7 -> type =', '| po7 : pr7 oo7', '| pw7 : pr7 M -> pr7 N -> pr7 (ww7 M N);',
    'schema pc7 = some [x:gm7] pr7 x;'].join('\n');
  const thmText = 'rec t16 : (g:pc7) [g, u:pr7 A[..], v:pr7 B[..] |- pr7 M[..]] -> [g, v:pr7 B[..], u:pr7 A[..] |- pr7 M[..]] =\n/ total d (t16 g a b m d) /\n?\n;';
  const full = [code, thmText.replace('?', [
    'fn d => case d of',
    '  | [g, u:pr7 A[..], v:pr7 B[..] |- pw7 X X1] =>',
    '    let [g, v:pr7 B[..], u:pr7 A[..] |- R] = t16 [g, u:pr7 A[..], v:pr7 B[..] |- X1] in',
    '  ?',
  ].join('\n'))].join('\n');
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[g, v:pr7 B[..], u:pr7 A[..] |- pr7 (ww7 M1[] M2[])]', line: full.split('\n').length - 2, col: 3,
    ctx: [{ name: 'd', type: '[g, u:pr7 A[..], v:pr7 B[..] |- pr7 M[..]]' }],
    meta: [{ name: 'g', type: 'pc7' }, { name: 'A', type: '(g |- gm7)' }, { name: 'B', type: '(g |- gm7)' }],
  };
  const ts = recurseTexts(hole, thm, full);
  expect(ts.some((t) => /\|-\s*X\]\s*in/.test(t)),
    'recurse under LF-block decls: BOTH pattern sub-derivations are dec candidates (X too) [§2 rec]\n  got: '
    + ts.map((t) => t.split('\n')[0]).join('\n       '));
}

// ── recurseTexts rows (IH-call shape classes) ───────────────────────────────
{
  // Named measure, 2 premises, decreasing = #2, pass-through comp premise (D1+D3).
  const code = 'rl2 : tp9 -> tp9 -> type.\nsg2 : tp9 -> tp9 -> type.\next2 : rl2 X Y -> sg2 Y Z -> rl2 X Z.';
  const thmText = 'rec t10 : [ |- rl2 A B] -> [ |- rl2 B C] -> [ |- rl2 A C] =\n/ total x2 (t10 _ _ _ x1 x2) /\n?\n;';
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[ |- rl2 A C]',
    ctx: [{ name: 'cf2', type: '[ |- rl2 A B]' }],
    meta: [{ name: 'Sd', type: '( |- rl2 B W2)' }],
  };
  const ts = recurseTexts(hole, thm, `${code}\n${thmText}`);
  expect(ts.some((t) => /t10 cf2 \[\s*\|-\s*Sd\]/.test(t)),
    'recurse: pass-through comp premise in slot 1, dec meta in slot 2 [§2 rec / D1+D3]\n  got: ' + ts.join('\n       '));
}
{
  // Explicit-Pi prefix with substitution pass-through (D5): wk-shaped, same-ctx dec.
  const code = 'tm4 : type.\nff4 : tm4 -> type.\nschema sc4 = block (x:tm4, u:ff4 x);';
  const thmText = 'rec t11 : {g:sc4}{h:sc4}{$W:$[h |- g]} [g |- ff4 M[..]] -> [h |- ff4 M[$W]] =\n/ total d (t11 g h w m d) /\n?\n;';
  const thm = theoremUnderProof(thmText);
  const hole = {
    goal: '[h |- ff4 M0[$W]]',
    ctx: [],
    meta: [
      { name: 'g', type: 'sc4' }, { name: 'h', type: 'sc4' },
      { name: '$W', type: '$[h |- g]' },
      { name: 'X9', type: '(g |- ff4 M0[..])' },
    ],
  };
  const ts = recurseTexts(hole, thm, `${code}\n${thmText}`);
  expect(ts.some((t) => /t11 \[g\] \[h\] \$\[h \|- \$W\]/.test(t)),
    'recurse: explicit-Pi prefix `[g] [h] $[h |- $W]` pass-through [§2 rec / D5]\n  got: ' + ts.join('\n       '));
}

// ── GRAMMAR ANCHOR: the fragment boundary pinned to ground truth ────────────
// The completeness argument is anchored to Beluga's actual expression grammar
// (comp_parser.ml). If upstream adds/removes a former, this FAILS — forcing a
// conscious re-audit of the closure table + spec instead of silent drift.
{
  const src = fs.readFileSync('Beluga-W/src/parser/comp_parser.ml', 'utf8');
  const found = new Set((src.match(/Raw_[a-z_]+/g) || []));
  const EXPECTED = [
    // expression formers (the closure table's subject)
    'Raw_identifier', 'Raw_qualified_identifier', 'Raw_box', 'Raw_hole',
    'Raw_box_hole', 'Raw_tuple', 'Raw_application', 'Raw_fn', 'Raw_mlam',
    'Raw_let', 'Raw_case', 'Raw_impossible', 'Raw_fun', 'Raw_observation',
    // type-level / auxiliary constructors the same file mentions
    'Raw_annotated', 'Raw_meta_annotated', 'Raw_arrow', 'Raw_cross',
    'Raw_ctype', 'Raw_pi', 'Raw_pattern', 'Raw_wildcard',
  ];
  const missing = EXPECTED.filter((e) => !found.has(e));
  const extra = [...found].filter((f) => !EXPECTED.includes(f));
  expect(!missing.length && !extra.length,
    `grammar anchor drift — the Beluga expression grammar changed; re-audit the closure table `
    + `and docs/archive/prover-completeness.md before trusting coverage. missing=[${missing}] new=[${extra}]`);
}

console.log('OK test-prover-coverage-matrix (shape classes covered by construction; grammar anchored)');
