# Chunk 2 — Shape

*How source text becomes a tree, and what a new language must supply to get one.*

---

## 1. The machinery

```
beluga.grammar  (751 lines, lezer)
      │  npm run build:grammar   →   lezer-generator
      ▼
js/editor-src/beluga-parser.js  (generated)
js/editor-src/beluga-parser.terms.js  (generated, 163 lines)
js/editor-src/beluga-tokens.mjs (94 lines, 4 hand-written external tokenizers)
```

One build command, no backend, no network. **Shape is entirely local.** This confirms the
theory's load-bearing claim: a new language's tree exists before its provider does.

The grammar is not a toy. It declares **205 node names**, is commented against Beluga's real
parser sources (`clf_parser.ml`, `meta_parser.ml`, `signature_parser.ml`), and reaches 99.1%
clean on the corpus. Grammar authoring is the genuine per-language cost, and this is the
evidence for the 2-week budget rather than a guess.

---

## 2. The measurement that matters

Every place the shell hardcodes a grammar node name is a Shape coupling site.

| | |
|---|---|
| node names declared in the grammar | **205** |
| distinct node names referenced from JS | **162** |
| total reference sites | **1,416** |
| files carrying them | ~20 |

⚠️ **This is the largest coupling number in the project**, and it dwarfs the 12-constant
`NAMESPACE` figure quoted in `PLATFORM.md`. That figure was scoped to Meaning (chunk 3)
only. The full Shape surface is two orders of magnitude larger, and the plan's estimates
must reflect it.

### Concentration

| Sites | File | Class |
|---|---|---|
| 234 | `editor-src/format/printer.mjs` | language pack by nature |
| 219 | `editor-src/semantic/symbol-store.mjs` | → role-driven |
| 140 | `editor-src/name-resolve.mjs` | → role-driven |
| 116 | `editor-src/tree-walk.mjs` | → role-driven |
| 113 | `editor-src/ide/completion/classify.mjs` | → role-driven |
| 106 | `editor-src/ide/completion/snippets.mjs` | language pack by nature |
| 71 | `editor-src/ide/completion/type-expect.mjs` | → role-driven |
| 62 | `editor-src/infix.mjs` | → role-driven |
| 62 | `editor-src/ide/sticky-decl.mjs` | → role-driven |
| 57 | `editor-src/prover/hole-split.mjs` | language pack by nature (Orca) |
| 49 | `editor-src/ide/builtins.mjs` | language pack by nature (data) |
| ~180 | 9 smaller files | mixed |

**~446 sites (31%) are language-pack artifacts by nature** — pretty-printing, snippets,
builtin tables, Orca's splitter. These do not need generalizing; they need *relocating* into
`lang/beluga/`.

**~970 sites (69%) are platform code that currently knows Beluga's node names.** This is the
real work of chunks 2–3.

---

## 3. The design: names → roles

162 distinct names across 1,416 sites means each name is used about nine times. The
generalization is therefore **not** "replace 1,416 strings." It is:

> Define a small vocabulary of **roles**. Platform code switches on role. Each language pack
> ships one table mapping its node names to roles.

A first-cut role vocabulary, stated as a **hypothesis to be tested, not a design**:

```
lexical     identifier · comment · literal · keyword · operator
structural  program · declaration · declarationBody · module · block
binding     binder · binderGroup · boundName · reference
term        application · abstraction · annotation · atom · grouping
matching    caseExpression · branch · pattern · patternApplication
typing      typeExpression · kindExpression
proof       proofScript (opaque) · tacticCall
```

~25 roles. The mapping is many-to-one, and **strongly so for Beluga**, because Beluga has
two parallel term languages — LF and computation — that Rocq does not:

```
LFType / CompType          LFKind / CompKind
LFAtomicType / CompAtomicType    LFConstructor / CompConstructor
LFAppType / LFAppTerm / AppExpression / AppPattern
LFTerm / Expression        LFLambda / FnExpression / MLamExpression
```

Those pairs collapse onto single roles. So the 162 names are not 162 concepts; Beluga is
carrying a doubled vocabulary that most target languages will not have.

⭐ **Consequence: Rocq's grammar is expected to be materially simpler than Beluga's**, and it
maps a smaller name set onto the same roles. Beluga is close to the hardest case in the
family, which is a good position to generalize from.

---

## 4. Method warning before any of this is believed

⛔ Counting node-name sites tells us what is *coupled*. It does not tell us what a role
abstraction actually *reaches*. This is the project's own "size classes by toggle, not by
counting" law, and it has overstated estimates by 4×, 24×, 3.5× and 10× before.

**Therefore the first work item is a pilot, not a design.**

Take one mid-sized file — `ide/sticky-decl.mjs` (62 sites) is the right size and has no
semantic subtlety — and convert it to roles for real. Then measure:

- how many sites reduced cleanly to a role,
- how many needed an escape hatch,
- what the escape hatches had in common.

The escape hatches are the finding. The role vocabulary must be *discovered* from them, not
designed in advance. If the clean-reduction rate is below roughly 80%, the role abstraction
is wrong and we learn it in week 1 rather than week 9.

---

## 5. What a Rocq grammar must supply

### The declaration layer (vernacular)

`Definition` · `Fixpoint` / `CoFixpoint` · `Inductive` / `CoInductive` ·
`Lemma` / `Theorem` / `Corollary` / `Proposition` · `Proof` … `Qed` / `Defined` / `Admitted` ·
`Require` / `Import` / `Export` · `Module` / `Section` · `Notation` · `Hint` · `Ltac`

### The term layer (Gallina)

application · `fun` · `forall` · `match … with … end` · `let … in` · `if/then/else` ·
records · implicit-argument brackets.

### Two precedents already solved in `beluga.grammar`

**(a) The opaque proof body.** `ProofDeclaration` parses its header precisely so the type
resolves on hover, then hands the entire script to the `proofScript` external tokenizer,
which consumes it opaquely to the terminator.

⭐ This is exactly what Rocq needs. Ltac is enormous and parsing it would sink the schedule.
`Proof … Qed` becomes one opaque `ProofScript` node, the header is parsed precisely, and the
tactic layer is served by the provider at Tier 2 rather than by the grammar. **The pattern is
already in the tree and already proven.**

**(b) The `.` disambiguation problem.** Beluga's grammar already fights this: `ProjectionTail`
and `NamedProjection` are *contextual* external tokens, emitted only where a projection can
be shifted, "so it never steals a lambda binder's `.` or a declaration-terminating `.`."

Rocq is `.`-terminated vernacular with qualified names (`Nat.add`) and record projections —
the same class of problem. There is a working solution to study rather than a blank page.

### The machinery available

Four hand-written `ExternalTokenizer`s already exist (`namedProjection`, `blockComment`,
`parameterSubst`, `proofScript`). Lezer's external-tokenizer escape hatch is proven in this
codebase for exactly the cases a declarative grammar cannot express.

---

## 6. What chunk 2 changes about the plan

1. **Shape is the dominant refactor, not Meaning.** 1,416 sites vs `NAMESPACE`'s 12. The
   week 4–8 "language pack extraction" track is under-budgeted as written and must absorb
   the role conversion.
2. **Roles, not names, are the abstraction** — and the vocabulary gets discovered by a pilot
   in week 1, not designed now.
3. **~31% of Shape coupling needs relocating, not generalizing.** Printer, snippets,
   builtins and `hole-split` move to `lang/beluga/` unchanged. That is cheap work that
   should be done first because it makes the remaining number honest.
4. **Rocq grammar work starts immediately.** It has no backend dependency, and the two
   hardest problems in it — opaque tactic bodies and `.` disambiguation — have worked
   precedents in `beluga.grammar`.
5. **Beluga's doubled LF/computation vocabulary means we are generalizing from near the
   hardest case in the family.** Most targets map a smaller name set onto the same roles.

---

## 7. Open questions carried forward

- `tree-walk.mjs` (116 sites): is it a generic traversal that happens to know Beluga node
  names, or is the traversal order itself Beluga-shaped? → chunk 3.
- `infix.mjs` (62 sites): Beluga has user-declared operators via pragmas. Rocq has
  `Notation`. Is operator handling Shape or Meaning? → chunk 3.
- Does the grammar's 99.1% corpus-clean metric have a reusable harness, or is it bespoke?
  → chunk 10.
- `type-expect.mjs` drives type-directed completion from node names *and* backend types.
  Which half dominates? → chunk 4.
