// Role tooltips for Beluga's built-in symbols — keywords, operators, pragmas.
// Keyed by BOTH the Lezer node name (when resolveInner lands on the wrapping
// rule) and the literal token text (when it lands on the leaf). `label` is the
// uppercase role chip; `desc` is one accurate sentence. Descriptions are
// grounded in Beluga-W's lexer/parser and reference guide; a Unicode glyph IS
// its ASCII spelling, so the two share a description.

export const BUILTIN_TOOLTIPS = new Map([

  // ── Keywords: LF level ─────────────────────────────────────────────────────
  ['LFKeyword',         { label: 'LF DECLARATION',     desc: 'Declares an LF type family and its constructors.' }],
  ['DatatypeKeyword',   { label: 'LF DATATYPE',        desc: 'Legacy datatype-style LF declaration (prefer LF).' }],
  ['TypeKeyword',       { label: 'LF KIND',            desc: 'The kind `type`, classifying LF type families.' }],
  ['SchemaKeyword',     { label: 'SCHEMA',             desc: 'Declares a context schema (which contexts are allowed).' }],
  ['SomeKeyword',       { label: 'SCHEMA QUANTIFIER',  desc: 'Existentially quantifies a schema block’s parameters (`some [..]`).' }],
  ['BlockKeyword',      { label: 'BLOCK TYPE',         desc: 'A block (Sigma) type: a dependent record of LF assumptions.' }],

  // ── Keywords: computation declarations ──────────────────────────────────────
  ['RecKeyword',        { label: 'REC DECLARATION',    desc: 'Declares a (mutually) recursive computation-level function.' }],
  ['LetKeyword',        { label: 'LET BINDING',        desc: 'Binds a value at top level or within an expression.' }],
  ['TypedefKeyword',    { label: 'TYPE ALIAS',         desc: 'Defines a computation-level type abbreviation.' }],
  ['TotalKeyword',      { label: 'TOTALITY',           desc: 'Gives the termination measure proving a function total.' }],
  ['AndKeyword',        { label: 'MUTUAL GROUP',       desc: 'Continues a mutually recursive group of definitions.' }],

  // ── Keywords: indexed / coinductive datatypes ──────────────────────────────
  ['InductiveKeyword',  { label: 'INDUCTIVE TYPE',     desc: 'Declares an inductive computation-level (indexed) datatype.' }],
  ['StratifiedKeyword', { label: 'STRATIFIED TYPE',    desc: 'Datatype defined by recursion on a decreasing index (allows negative occurrences).' }],
  ['CoinductiveKeyword',{ label: 'COINDUCTIVE TYPE',   desc: 'Declares a coinductive (codata) type, defined by its observations.' }],
  ['CTypeKeyword',      { label: 'COMPUTATION KIND',   desc: 'The kind `ctype`, classifying computation-level types.' }],
  ['PropKeyword',       { label: 'PROPOSITION KIND',   desc: 'The kind `prop`, classifying computation-level propositions.' }],

  // ── Keywords: expressions ──────────────────────────────────────────────────
  ['FnKeyword',         { label: 'FN ABSTRACTION',     desc: 'Computation-level function abstraction (`fn x => e`).' }],
  ['FunKeyword',        { label: 'FUN (COFUNCTION)',   desc: 'Pattern- and copattern-matching function with branches (`fun .obs p => e | …`).' }],
  ['FNKeyword',         { label: 'META FUNCTION',      desc: 'Legacy uppercase meta-abstraction (alias for mlam).' }],
  ['MLamKeyword',       { label: 'MLAM ABSTRACTION',   desc: 'Abstracts over contexts, meta-variables, and substitutions (`mlam X => e`).' }],
  ['CaseKeyword',       { label: 'CASE',               desc: 'Analyses a value by pattern matching (`case e of …`).' }],
  ['OfKeyword',         { label: 'CASE BRANCHES',      desc: 'Introduces the branches of a case expression.' }],
  ['InKeyword',         { label: 'LET BODY',           desc: 'Introduces the body of a `let … in` expression.' }],
  ['IfKeyword',         { label: 'CONDITIONAL',        desc: 'Boolean conditional (`if … then … else …`).' }],
  ['ThenKeyword',       { label: 'THEN BRANCH',        desc: 'The true branch of an `if`.' }],
  ['ElseKeyword',       { label: 'ELSE BRANCH',        desc: 'The false branch of an `if`.' }],
  ['ImpossibleKeyword', { label: 'IMPOSSIBLE',         desc: 'Discharges an uninhabited scrutinee (`impossible e`); coverage-checked.' }],

  // ── Keywords: modules ──────────────────────────────────────────────────────
  ['ModuleKeyword',     { label: 'MODULE',             desc: 'Declares a module grouping definitions under a namespace.' }],
  ['StructKeyword',     { label: 'MODULE BODY',        desc: 'Begins a module body (`= struct … end`).' }],
  ['EndKeyword',        { label: 'MODULE END',         desc: 'Closes a module body opened with `struct`.' }],

  // ── Keywords: operator fixity (soft keywords in --infix / --assoc) ──────────
  ['NoneKeyword',       { label: 'NON-ASSOCIATIVE',    desc: 'Non-associative operator; use parentheses to group.' }],
  ['LeftKeyword',       { label: 'LEFT ASSOCIATIVE',   desc: 'Operator associativity: groups to the left.' }],
  ['RightKeyword',      { label: 'RIGHT ASSOCIATIVE',  desc: 'Operator associativity: groups to the right.' }],

  // ── Keywords: Harpoon proofs ───────────────────────────────────────────────
  ['ProofKeyword',      { label: 'PROOF',              desc: 'Declares a Harpoon proof (`proof name : type = …`).' }],
  ['ByKeyword',         { label: 'PROOF JUSTIFICATION',desc: 'Justifies a proof step by a tactic or term (`… by …`).' }],
  ['AsKeyword',         { label: 'STEP BINDING',       desc: 'Names the result of a proof step (`… as x`).' }],
  ['SufficesKeyword',   { label: 'SUFFICES',           desc: 'Reduces the goal to a list of sufficient subgoals.' }],
  ['ToshowKeyword',     { label: 'SUBGOAL',            desc: 'Introduces a subgoal to show within `suffices`.' }],
  ['TrustKeyword',      { label: 'TRUST',              desc: 'Admits the current subgoal without proof.' }],

  // ── Named operator / structural nodes ──────────────────────────────────────
  ['ArrowOp',           { label: 'FUNCTION ARROW',     desc: 'Function-type arrow.' }],
  ['FatArrow',          { label: 'DOUBLE ARROW',       desc: 'Separates binders or patterns from the body (`fn`, `mlam`, `fun`, case branches).' }],
  ['TurnstileHash',     { label: 'RENAMING TURNSTILE', desc: 'Turnstile of a renaming substitution type (`$[Γ ⊢# Δ]`).' }],
  ['Hole',              { label: 'HOLE',               desc: 'A hole `?` (optionally named `?n`); Beluga reports its expected type.' }],
  ['UnderscoreHole',    { label: 'WILDCARD',           desc: 'Wildcard `_`: an inferred term or an ignored binder.' }],
  ['SubstHead',         { label: 'SUBSTITUTION HEAD',  desc: 'Leads a substitution: `..` is the identity, `^` the empty substitution.' }],
  ['Tuple',             { label: 'TUPLE',              desc: 'A Sigma (block) tuple `<M1; …; Mn>`.' }],
  ['Observation',       { label: 'OBSERVATION',        desc: 'A codata destructor (`.obs`), in a copattern or applied to a value.' }],
  ['ProofScript',       { label: 'PROOF SCRIPT',       desc: 'The body of a Harpoon proof.' }],
  ['LFLambdaBinder',    { label: 'LF LAMBDA',          desc: 'LF-level lambda binder (`\\x. M`).' }],

  // ── Literal operator tokens ────────────────────────────────────────────────
  ['->',   { label: 'FUNCTION ARROW',       desc: 'Function-type arrow.' }],
  ['→',    { label: 'FUNCTION ARROW',       desc: 'Function-type arrow.' }],
  ['<-',   { label: 'REVERSE ARROW',        desc: 'Reverse function arrow: `A <- B` means `B -> A`.' }],
  ['←',    { label: 'REVERSE ARROW',        desc: 'Reverse function arrow: `A ← B` means `B → A`.' }],
  ['=>',   { label: 'DOUBLE ARROW',         desc: 'Separates binders or patterns from the body (`fn`, `mlam`, `fun`, case branches).' }],
  ['⇒',    { label: 'DOUBLE ARROW',         desc: 'Separates binders or patterns from the body (`fn`, `mlam`, `fun`, case branches).' }],
  ['::',   { label: 'META-TYPE ASCRIPTION', desc: 'Ascribes a meta-type to a binder (`X :: [Γ ⊢ A]`).' }],
  ['|-',   { label: 'TURNSTILE',            desc: 'Separates a context from its conclusion in `[Γ ⊢ M]`.' }],
  ['⊢',    { label: 'TURNSTILE',            desc: 'Separates a context from its conclusion in `[Γ ⊢ M]`.' }],
  ['|-#',  { label: 'RENAMING TURNSTILE',   desc: 'Turnstile of a renaming substitution type (`$[Γ ⊢# Δ]`).' }],
  ['⊢#',   { label: 'RENAMING TURNSTILE',   desc: 'Turnstile of a renaming substitution type (`$[Γ ⊢# Δ]`).' }],
  ['\\',   { label: 'LF LAMBDA',            desc: 'LF-level lambda binder (`\\x. M`).' }],
  ['..',   { label: 'IDENTITY SUBSTITUTION',desc: 'The identity substitution for the context variable.' }],
  ['…',    { label: 'IDENTITY SUBSTITUTION',desc: 'The identity substitution for the context variable.' }],
  ['^',    { label: 'EMPTY SUBSTITUTION',   desc: 'The empty substitution (weakening from the empty context).' }],
  ['_',    { label: 'WILDCARD',             desc: 'Wildcard `_`: an inferred term or an ignored binder.' }],
  ['*',    { label: 'PRODUCT TYPE',         desc: 'Computation-level product (pair) type (`T1 * T2`).' }],
  ['+',    { label: 'SCHEMA ALTERNATION',   desc: 'Alternative schema elements (`block … + block …`).' }],

  // ── Pragma tokens ──────────────────────────────────────────────────────────
  ['--name',         { label: 'PRAGMA', desc: 'Sets the preferred name for variables generated for a constant’s type.' }],
  ['--infix',        { label: 'PRAGMA', desc: 'Makes a two-argument constant infix, with associativity and precedence.' }],
  ['--prefix',       { label: 'PRAGMA', desc: 'Makes a constant prefix, with an optional precedence.' }],
  ['--assoc',        { label: 'PRAGMA', desc: 'Sets the default operator associativity for following declarations.' }],
  ['--abbrev',       { label: 'PRAGMA', desc: 'Abbreviates a module’s qualified name.' }],
  ['--not',          { label: 'PRAGMA', desc: 'Guards the following declaration from type-checking.' }],
  ['--open',         { label: 'PRAGMA', desc: 'Opens a module so its names are available unqualified.' }],
  ['--query',        { label: 'PRAGMA', desc: 'Runs a logic-programming query against the LF signature.' }],
  ['--opaque',       { label: 'PRAGMA', desc: 'Keeps a function’s definition from being unfolded during coverage checking.' }],
  ['--coverage',     { label: 'PRAGMA', desc: 'Enables coverage (exhaustiveness) checking.' }],
  ['--warncoverage', { label: 'PRAGMA', desc: 'Reports missing cases as warnings instead of errors.' }],
  ['--nostrengthen', { label: 'PRAGMA', desc: 'Disables automatic meta-variable strengthening.' }],
]);

// Longest builtin token text in the map — used to bound the slice we take when
// matching a node by its literal text (keeps us from slicing a huge rule span).
const MAX_TOKEN_LEN = 14;

// Resolve the built-in role tooltip for the token at `pos`, or null. Matches the
// Lezer node name FIRST (when resolveInner lands on the wrapping rule, e.g.
// `CaseKeyword`, `ArrowOp`), then the literal token text (when it lands on the
// leaf, e.g. `->`, `--infix`). Tries both lex biases and walks a few parents so
// the cursor sitting just before/after the glyph still resolves. The map only
// holds specific token/operator node names, so walking up can't false-match a
// big enclosing rule. Returns `{ label, desc, token }` or null.
export function builtinTooltipAt(tree, doc, pos) {
  if (!tree || !doc) return null;
  const seen = new Set();
  for (const bias of [-1, 1]) {
    let node = tree.resolveInner(pos, bias);
    for (let depth = 0; node && depth < 3; depth += 1, node = node.parent) {
      const key = node.name + '@' + node.from + ':' + node.to;
      if (seen.has(key)) continue;
      seen.add(key);
      const byName = BUILTIN_TOOLTIPS.get(node.name);
      if (byName) return { ...byName, token: tokenText(doc, node) };
      const span = node.to - node.from;
      if (span > 0 && span <= MAX_TOKEN_LEN) {
        const text = doc.sliceString(node.from, node.to);
        const byText = BUILTIN_TOOLTIPS.get(text);
        if (byText) return { ...byText, token: text };
      }
    }
  }
  return null;
}

function tokenText(doc, node) {
  const span = node.to - node.from;
  if (span <= 0 || span > MAX_TOKEN_LEN) return node.name;
  return doc.sliceString(node.from, node.to);
}
