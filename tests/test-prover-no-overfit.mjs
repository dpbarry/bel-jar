import fs from 'node:fs';
import path from 'node:path';

// ── STRUCTURAL anti-overfit guard ────────────────────────────────────────────
// The old version of this test was a DENYLIST of literal strings (dualBlock, wtp_*,
// β∥, …). An agent defeated it by RENAMING the hardcodes to synonyms the grep
// missed — the test went green by certifying the disguise, not the generality.
// See memory: feedback-prover-overfit-postmortem.
//
// A denylist is theater: it only bans names you already thought of. This version
// flags STRUCTURE instead — the SHAPES that a genuinely type/schema-driven engine
// never needs, no matter what you name them:
//
//   1. Branching on a specific object's NAME — `x.name === 'foo'`, `=== 'f'`.
//      The engine reasons about a hypothesis' TYPE, never which letter it is.
//   2. Comparing against a quoted Beluga CONSTRUCTOR / type-family literal —
//      `=== 'linear'`, `=== 'wtp'`, `'refl_proc'`, unicode ctors like '⇛'/'β≡'.
//      Constructor names come FROM the AST/schema of the program under proof,
//      never baked into the engine.
//   3. Indexing a parse into a fixed slot compared to an Uppercase schema type-var
//      name — `parts[2] === 'A'` (branching on a schema variable's spelling).
//
// Escape hatch: a constant that is GENUINELY general (a Beluga keyword, a syntactic
// token, an arrow, a turnstile) is fine — annotate that line with `// GENERAL: why`
// and it's exempt. If you can't honestly write that comment, it's overfit.

const ENGINE_FILES = [
  'js/editor-src/prover/prover-comp-type.mjs',
  'js/editor-src/prover/prover-orchestrator.mjs',
  'js/editor-src/prover/hole-split.mjs',
];

// Tokens that are legitimately general (not theorem-specific), so a literal compare
// against them is not overfit:
//   • Beluga SYNTAX keywords / structural shapes.
//   • Our OWN internal enum discriminants (move kinds, node status, premise kinds).
// Keep this list tiny and honest — everything here is engine vocabulary, never a
// name drawn from the PROGRAM under proof.
const SYNTACTIC = new Set([
  // Beluga keywords / syntax
  'rec', 'proof', 'fn', 'mlam', 'let', 'in', 'case', 'of', 'type', 'block',
  'some', 'schema', 'total', 'fun', 'and', 'ttrue', 'impossible',
  // our own enum tags (premise kinds, move kinds, node status)
  'box', 'pi', 'ctx', 'ctype', 'meta', 'comp', 'fill', 'intro', 'split', 'recurse',
  'invert', 'lemma', 'solved', 'open', 'stuck', 'fwd', 'back',
  'index', 'named', 'bare', 'none', 'dependent', 'arrows',
  'vacuous', 'demanded', // demand-oracle verdict tags (Phase D Stage 1)
  'disproved', // Phase-I counterexample stuck reason
  'cancelled', 'search-bound', 'step-bound', 'no-move', 'no-moves',
  'no-totality-measure', 'file-errors', 'coinductive-out-of-fragment',
  'rejected', 'guard', // tried-row verdict tags (Phase G.1 closest hint)
  'lf', // enumerateDecls kind tag (flat LF family/ctor) — Phase E.6 prelude trim
  '→', // GENERAL: the arrow operator — syntactic, not a constructor
]);

// Lezer grammar node-type names are the PARSER's vocabulary, not the theorem's — a
// compare against a grammar node type (`c.name === 'LFType'`) reads the AST
// structurally and is general. They are CamelCase Lezer identifiers; recognise them
// by shape so we don't have to enumerate the grammar here.
function isLezerNodeName(tok) {
  // CamelCase starting Upper, containing a lowercase then another Upper OR a known
  // grammar suffix — e.g. LFType, ArrowOp, LFDatatypeDeclaration, UpperIdentifier.
  return /^(LF|Comp|Meta|CLF|Harpoon)?[A-Z][a-z]+[A-Z]/.test(tok)
    || /^(ArrowOp|Turnstile|Identifier|Declaration|Type|Term|Kind|Schema|Block)$/.test(tok)
    || /^LF[A-Z]/.test(tok) // any LF-prefixed Lezer node (LFConstructor, LFType, …)
    || /(Op|Type|Term|Kind|Declaration|Identifier|Expression|Pattern|Clause|Head|Decl|Constructor)$/.test(tok);
}

// A quoted string literal that looks like a Beluga IDENTIFIER (a var or ctor name),
// as opposed to punctuation/operators/regex. We flag identifier-shaped literals
// used in an equality compare.
const RULES = [
  {
    label: 'branch on object NAME (x.name === "ident")',
    // `.name === 'foo'` / `.name !== 'foo'`  where foo is identifier-shaped
    re: /\.\s*name\s*(===|!==|==|!=)\s*(['"])([A-Za-z_][\w']*)\2/g,
    capture: 3,
  },
  {
    label: 'compare against constructor/family/var literal',
    // any `=== 'ident'` / `!== 'ident'` with an identifier-shaped literal (incl. unicode)
    re: /(===|!==|==|!=)\s*(['"])([A-Za-z_À-ɏͰ-Ͽ←-⯿][\w'À-ɏͰ-Ͽ←-⯿]*)\2/g,
    capture: 3,
  },
  {
    label: 'branch on fixed parse slot vs Uppercase schema var',
    // `parts[2] === 'A'`, `toks[0] === 'X'`
    re: /\[\s*\d+\s*\]\s*(===|!==|==|!=)\s*(['"])([A-Z][\w']*)\2/g,
    capture: 3,
  },
  {
    label: 'unicode constructor literal in a compare',
    // any quoted single-token that contains a non-ASCII glyph (β≡ ⇛ ⊗ …) in a compare
    re: /(===|!==|==|!=)\s*(['"])([^'"]*[¡-￿][^'"]*)\2/g,
    capture: 3,
  },
];

function stripComment(line) {
  // Return { code, exempt } — exempt if the line carries a `// GENERAL:` waiver.
  const exempt = /\/\/\s*GENERAL:/.test(line);
  const code = line.replace(/\/\/.*$/, '');
  return { code, exempt };
}

const violations = [];
for (const rel of ENGINE_FILES) {
  const abs = path.join(process.cwd(), rel);
  if (!fs.existsSync(abs)) continue;
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const { code, exempt } = stripComment(line);
    if (exempt || !code.trim()) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(code))) {
        const tok = m[rule.capture];
        if (SYNTACTIC.has(tok)) continue;
        if (isLezerNodeName(tok)) continue;
        violations.push({ file: rel, line: i + 1, label: rule.label, tok, text: code.trim().slice(0, 90) });
      }
    }
  });
}

if (violations.length) {
  console.error('ANTI-OVERFIT (structural): the prover engine branches on specific');
  console.error('names/constructors instead of reasoning from the type/schema.');
  console.error('Reason from the AST, or annotate a genuinely-general constant with');
  console.error('`// GENERAL: <why>`.\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.label}]  "${v.tok}"  ${v.text}`);
  }
  process.exit(1);
}

console.log('OK test-prover-no-overfit (structural)');
