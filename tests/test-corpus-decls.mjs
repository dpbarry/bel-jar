// Corpus decl primitives (editor-src/bel-corpus-decls.mjs) + a structural
// anti-overfit guard extended to the masking-harness files. The harness must
// never branch on a Beluga identifier/constructor name — it measures generality,
// so it can't be allowed to "help" a specific lemma pass.
import fs from 'node:fs';
import path from 'node:path';
import {
  parseCfgEntries,
  assembleCfgProgram,
  enumerateDecls,
  maskableTargets,
  maskByName,
  offsetToFileLine,
} from '../editor-src/bel-corpus-decls.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── cfg parsing ─────────────────────────────────────────────────────────────
{
  const entries = parseCfgEntries('% a comment\n\neq.bel\nbigstep-deterministic.bel\n');
  expect(entries.length === 2 && entries[0] === 'eq.bel', 'parseCfgEntries drops comments/blanks, keeps order');
}

// ── cfg assembly with a file span table ─────────────────────────────────────
{
  const fileMap = {
    'a.bel': 'tp : type.\nz : tp.\n',
    'b.bel': 'rec f : [ |- tp] = ? ;\n',
  };
  const { code, files, unresolved } = assembleCfgProgram('a.bel\nb.bel\n', (n) => fileMap[n] ?? null);
  expect(unresolved.length === 0, 'all cfg members resolved');
  expect(files.length === 2 && files[0].path === 'a.bel', 'file span table records members in order');
  expect(code.indexOf('tp : type.') < code.indexOf('rec f'), 'members concatenated in cfg order');
  // Offset inside b.bel maps back to b.bel.
  const off = code.indexOf('rec f');
  const loc = offsetToFileLine(files, code, off);
  expect(loc.path === 'b.bel' && loc.line === 1, 'offsetToFileLine maps into the right file');
}

// ── unresolved member is reported, not fatal ────────────────────────────────
{
  const { unresolved } = assembleCfgProgram('present.bel\nmissing.bel\n',
    (n) => (n === 'present.bel' ? 'x : type.\n' : null));
  expect(unresolved.length === 1 && unresolved[0] === 'missing.bel', 'missing member reported as unresolved');
}

// ── nested .cfg inlining ────────────────────────────────────────────────────
{
  const map = {
    'inner.cfg': 'base.bel\n',
    'base.bel': 'tp : type.\n',
    'main.bel': 'rec g : [ |- tp] = ? ;\n',
  };
  const { files } = assembleCfgProgram('inner.cfg\nmain.bel\n', (n) => map[n] ?? null);
  expect(files.map((f) => f.path).join(',') === 'base.bel,main.bel', 'nested cfg inlines members in order');
}

// ── top-level decl enumeration (comment- and bracket-aware) ─────────────────
{
  const code = [
    'tp : type.',
    '% a line comment ; with a semicolon that must NOT split',
    'arr : tp -> tp -> tp.',
    '%{ block comment ; still ignored }%',
    'schema ctx = some [A:tp] block x:tp, h:tp;',
    "rec f : [ |- tp] -> [ |- tp] = fn x => case x of | [ |- z] => [ |- z] ;",
  ].join('\n');
  const decls = enumerateDecls(code);
  const kinds = decls.map((d) => d.kind);
  expect(kinds.includes('schema'), 'schema decl recognised');
  expect(kinds.includes('rec'), 'rec decl recognised');
  // The `;` inside the line comment and block comment must not create extra decls.
  const recDecls = decls.filter((d) => d.kind === 'rec');
  expect(recDecls.length === 1 && recDecls[0].name === 'f', 'rec f enumerated once, named');
  // The `some […]` bracket and `block …;`… the schema `;` is top level; ensure
  // the rec's inner `case … of | … =>` (no stray top-level `;`) stays one decl.
  expect(/case x of/.test(recDecls[0].text), 'rec body kept intact (no mid-body split)');
}

// ── maskable targets: single rec/proof with a parseable type ────────────────
{
  const code = [
    'tp : type.',
    'z : tp.',
    'schema ctx = block x:tp;',
    "rec done : [ |- tp] = [ |- z] ;",
    "rec hole : [ |- tp] = ? ;",
  ].join('\n');
  const { targets, skips } = maskableTargets(code);
  const names = targets.map((t) => t.name);
  expect(names.includes('done'), 'a complete rec is a maskable target (we re-derive it)');
  expect(!names.includes('hole'), 'a rec already a `?` is skipped (nothing to re-derive)');
  expect(skips.some((s) => s.name === 'hole' && s.reason === 'already-hole'), 'already-hole skip recorded');
  const done = targets.find((t) => t.name === 'done');
  expect(done && done.thm && done.thm.name === 'done', 'target carries a parsed theorem (thm)');
  expect(typeof done.from === 'number' && done.to > done.from, 'target carries char offsets for masking');
}

// ── mutual `rec … and …` is skipped in v1 (buildProofProgram masks one decl) ─
{
  const code = [
    'tp : type.',
    "rec f : [ |- tp] = [ |- z]",
    "and g : [ |- tp] = [ |- z] ;",
  ].join('\n');
  const { targets } = maskableTargets(code);
  // Mutual members are now individual targets (masked one at a time; siblings
  // stay complete as the mutual IH pool).
  expect(targets.some((t) => t.name === 'f' && t.mutual), 'mutual member f is a target');
  expect(targets.some((t) => t.name === 'g' && t.mutual), 'mutual member g is a target');
}

// ── maskByName: in-place body masking, pragma- and comment-aware ────────────
{
  // (a) `/ total … /` measure is preserved verbatim (the prover's IH guard).
  const code = "tp : type.\nrec f : [ |- tp] -> [ |- tp] =\n/ total 1 /\nfn x => x\n;\n";
  const m = maskByName(code, 'f');
  expect(m && /\/ total 1 \/\s*\n\?/.test(m.code), 'masked body keeps the / total / measure before ?');
  expect(!/fn x => x/.test(m.code), 'original body removed');
  expect(/^rec f : /.test(m.declText) && /\/ total 1 \//.test(m.declText), 'declText carries the pragma');
}
{
  // (b) The real-corpus idiom `/ trust / % / total m (f …) /` — keep the REAL
  // `/ trust /`, never resurrect the commented-out (broken) measure.
  const code = 'tp : type.\nrec f : [ |- tp] -> [ |- tp] =\n'
    + '/ trust / % / total m (f _ _ _ m) /\nfn x => x\n;\n';
  const m = maskByName(code, 'f');
  expect(m && /\/ trust \/\s*\n\?/.test(m.code), 'the real / trust / pragma survives masking');
  expect(!/total/.test(m.code.slice(m.code.indexOf('rec f'))), 'a commented-out / total / is NOT resurrected');
}
{
  // (c) `/ trust /` alone (comment on the next line) is preserved — dropping it
  // breaks / total / siblings that call this decl.
  const code = 'tp : type.\nrec f : [ |- tp] -> [ |- tp] =\n'
    + '   / trust /\n  % totality checker cannot see exchange\n  fn x => x\n;\n';
  const m = maskByName(code, 'f');
  expect(m && /\/ trust \/\s*\n\?/.test(m.code), 'a bare / trust / pragma survives masking');
}
{
  // (d) A `;` inside a body comment must not truncate the mask early.
  const code = 'rec f : [ |- tp] -> [ |- tp] =\n% fake terminator ; here\nfn x => x\n;\nrec g : [ |- tp] = [ |- z] ;\n';
  const m = maskByName(code, 'f');
  expect(m && !/fn x => x/.test(m.code) && /rec g : /.test(m.code), 'comment `;` skipped; next decl intact');
}
{
  // (f) An identifier ENDING IN `=` (`pred=`) must not be mistaken for the
  // body `=` — the type is split at the first STANDALONE `=` token only.
  const code = "pred= : tm -> tm -> type.\nrec eq5 : [ |- pred= M N] -> [ |- conv M N] =\n/ total 1 /\nfn d => d\n;\n";
  const m = maskByName(code, 'eq5');
  expect(m && /rec eq5 : \[ \|- pred= M N\] -> \[ \|- conv M N\] =/.test(m.declText.replace(/\n/g, ' ')),
    'declText keeps the full type across a pred= identifier');
  expect(/pred= M N\] -> \[ \|- conv M N\] =\s*\n\/ total 1 \/\s*\n\?/.test(m.code),
    'masking replaces only the real body, not the type tail after pred=');
}
{
  // (e) Mutual member: masking g leaves f complete (the mutual IH pool).
  const code = 'rec f : [ |- tp] = [ |- z]\nand g : [ |- tp] =\n/ total /\n[ |- z] ;\n';
  const m = maskByName(code, 'g');
  expect(m && /rec f : \[ \|- tp\] = \[ \|- z\]/.test(m.code), 'sibling member f stays complete');
  expect(/and g : \[ \|- tp\] =\s*\n\/ total \/\s*\n\?/.test(m.code), 'member g masked in place with its pragma');
  expect(m.boundary === ';', 'g is the last member (terminates at ;)');
}

// ── STRUCTURAL anti-overfit guard on the harness files ──────────────────────
// Same rules as tests/test-prover-no-overfit.mjs, applied to the corpus harness
// so nobody can smuggle a per-lemma hint into the measurement apparatus.
{
  const HARNESS_FILES = [
    'editor-src/bel-corpus-decls.mjs',
    'scripts/corpus-plan.mjs',
    'scripts/corpus-harness.mjs',
    'scripts/corpus-report.mjs',
  ];
  const SYNTACTIC = new Set([
    'rec', 'proof', 'fn', 'mlam', 'let', 'in', 'case', 'of', 'type', 'block',
    'some', 'schema', 'total', 'trust', 'fun', 'and', 'impossible', 'LF',
    'inductive', 'coinductive', 'stratified', 'typedef', 'lf', 'pragma', 'other',
    'and-rec', 'and-inductive', 'mutual', 'unparseable-type', 'already-hole',
    'COMPLETE', 'STUCK', 'FAIL', 'TIMEOUT', 'PRECHECK_FAIL', 'SKIPPED',
  ]);
  const RULES = [
    { label: 'branch on object NAME', re: /\.\s*name\s*(===|!==|==|!=)\s*(['"])([A-Za-z_][\w']*)\2/g, capture: 3 },
    { label: 'compare against ident literal', re: /(===|!==|==|!=)\s*(['"])([A-Za-z_À-ɏͰ-Ͽ←-⯿][\w'À-ɏͰ-Ͽ←-⯿]*)\2/g, capture: 3 },
    { label: 'fixed parse slot vs Uppercase var', re: /\[\s*\d+\s*\]\s*(===|!==|==|!=)\s*(['"])([A-Z][\w']*)\2/g, capture: 3 },
    { label: 'unicode constructor literal', re: /(===|!==|==|!=)\s*(['"])([^'"]*[¡-￿][^'"]*)\2/g, capture: 3 },
  ];
  const violations = [];
  for (const rel of HARNESS_FILES) {
    const abs = path.join(process.cwd(), rel);
    if (!fs.existsSync(abs)) continue; // scripts not written yet — skip, not fail
    const lines = fs.readFileSync(abs, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const exempt = /\/\/\s*GENERAL:/.test(line);
      const codeLine = line.replace(/\/\/.*$/, '');
      if (exempt || !codeLine.trim()) return;
      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(codeLine))) {
          const tok = m[rule.capture];
          if (SYNTACTIC.has(tok)) continue;
          violations.push({ file: rel, line: i + 1, label: rule.label, tok });
        }
      }
    });
  }
  if (violations.length) {
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.label}] "${v.tok}"`);
    expect(false, 'harness must not branch on Beluga names (annotate genuine tokens with // GENERAL:)');
  }
}

console.log('OK test-corpus-decls (cfg assembly, decl enumeration, maskable targets, anti-overfit guard)');
