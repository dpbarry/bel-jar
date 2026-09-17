# Calf — a paper-proximate proof language over Beluga

**Status:** research kickoff. Nothing is built. This doc is the reasoning substrate for the agents
who build it — it decides the things that must be decided once, and marks what is deliberately open.
Working name **Calf** (a young beluga; see §Naming). Provisional file extension `.calf`.
**Fall target is Calf only.** §10 holds related professor asks and a winter instructional-environment
vision that Calf is the load-bearing ingredient of — recorded so they are not forgotten, and so
fall work does not paint us into a corner. They are not this semester's work.

**One sentence:** a formal language whose surface is as close as a formal language can get to how
PL-metatheory proofs are written on paper, elaborated deterministically into Beluga concrete syntax
and checked step-by-step through BelJar's existing settlement/hole machinery — for students who
should not have to learn Beluga first, and as a cheap, local-repair target for autoformalization.

**Ancestry:** `Beluga-W/sasybel/` (2011–12, Marie-Andree B. Langlois) — a SASyLF-syntax → Beluga
translator, dead since 2014. We revive the *idea*, not the code. The old tree is a specification
asset: `transform.ml` catalogs the translation rules and (via its `"Sorry, not implemented yet"`
branches) exactly where they get hard; `examples/translation.tex` is a differential oracle of
expected Beluga outputs; the four `.sbel` examples are the seed corpus. SASyLF itself is alive
(v1.5.2a2, 2025) — comparison system, portable corpus, and a differentiator: its automation
(`by solve`) is deprecated, ours (Orca) is shipped.

---

## 1. Research position (why this stands up in 2026)

The 2026 autoformalization systems (Visored, Trellis, LeanMarathon) converged on one architecture:
a **declarative, paper-like intermediate language** between prose and kernel, LLM above it,
deterministic machinery below it. All of them target Lean and mainstream mathematics, and all of
them spend most of their engineering recovering one property: **local repair** — a failed step must
not corrupt distant work.

Calf's claim to novelty is threefold:

1. **Domain.** Nobody has built this for PL metatheory / logical frameworks — the domain where
   paper syntax diverges *most* from formal syntax (binding, contexts, substitution), and the one
   domain where the underlying assistant (Beluga) makes those exact things free.
2. **Locality by construction.** In Calf every proof line is a named fact with an explicit
   justification — an independently checkable obligation. The property the Lean harnesses
   engineer at great cost is a syntactic invariant here. BelJar's settlement + hole system already
   checks fragments locally; Calf rides that.
3. **Checked redundancy.** Paper proofs restate ("so E = z and V = z"). Calf admits restatements
   and *verifies* them against the unifier instead of trusting or forbidding them. Redundancy
   becomes signal — for readers, graders, and LLM-repair loops alike.

The paper's two legs, neither of which is an LLM:
- **A rules-first elaborator.** The elaboration semantics is written as inference rules (the paper
  figure); the implementation transcribes them. Every construct elaborates by a stated rule or
  fails with a stated reason.
- **A checkable oracle.** Every output is Beluga-checked; corpus pass-rates against the legacy
  `.sbel` examples, `translation.tex`, and ported SASyLF course proofs are results independent of
  any AI. The LLM study (prose → Calf, check + Orca repair) sits *on top* of the deterministic
  artifact, never inside it.

Venue ladder: LFMTP (natural home, Beluga community) → CPP/ITP tool track if corpus numbers are
strong. Classroom claims are motivation, not evaluated claims — a user study needs a semester we
do not have.

---

## 2. Decisions already made (do not relitigate without new evidence)

| Decision | Reasoning |
|---|---|
| **Emit Beluga concrete syntax (`.bel` text + source map), never Beluga internal AST** | The 2011 version died chasing `Syntax.Ext` churn. Text decouples us from Beluga internals entirely; the worker checker consumes text anyway; the security boundary (never touch Beluga OCaml) is upheld by construction. |
| **Elaborator is pure `.mjs` in a new `js/editor-src/calf/` domain** | Codemap law: new modules in domain folders. A pure function `calfAst → {belText, sourceMap} \| {decline, span, reason}` needs no second toolchain; OCaml→js_of_ocaml would buy pattern matching at the cost of a build system. Functional paradigm, no classes, minimal comments. |
| **Grammar via Lezer (`calf.grammar` beside `beluga.grammar`)** | Reuses the entire parser/highlight/lint substrate; `.calf` becomes a first-class BelJar file type for free. |
| **Freeze the proof fragment to one syllabus** | The fragment that covers `sum.sbel` + `vsound.sbel` + `unique.sbel`: authored inductions, `case rule`, `by rule … on …`, induction hypothesis, inversion, case analysis, variable/assumption cases under a single context-schema pattern. Everything outside = honest decline. SASyLF parity is explicitly a non-goal. |
| **Automation is elaboration-assistance, not language semantics** | `by search` (Orca) may *find* a justification, but the found justification is materialized back into the source as an explicit `by rule … on …`. The checked document is always fully declarative. This keeps determinism, reproducibility, and the graph projection intact. Analogical remainder (§10.1) is the same discipline applied to *copying a human-authored case*, not to search — out of the v1 language, in of the DAG shape. |
| **LaTeX is an export, never an IR** | The working artifacts are Calf source and its Gentzen projection (§4 / §10.2). `bussproofs`/`ebproof` dump is a button. A `.tex` file is not a second source of truth and not a round-trip IR. |
| **Same theorems (ideal), not a relex (§3.0)** | Finished Calf should prove what Beluga proves (metatheory), and vice versa. Fall v1 is a fragment — Calf→Beluga only. Never leak encoding to fake the equivalence by making the files look the same. |

---

## 3. The language

### 3.0 Same theorems, not the same documents

Two different questions. The ideal answers both "yes" for *theorems*, and "no" for *files*.

**Anything Calf-provable is Beluga-provable?** Yes, always, by construction: elaboration is
sound. If Calf accepts it, the generated `.bel` checks, and that *is* the proof.

**Anything Beluga-provable is Calf-provable?** Ideal: **yes** — same metatheoretic theorems,
some Calf proof of that spec, not a pretty-print of that particular `.bel`. Fall v1: **no** —
the syllabus fragment (§2 / §3.4) cannot say mutual induction, lex measures, modules, or
Beluga that isn't a proof of an LF judgment (plain computational `rec`s). Growing Calf toward
the ideal is later language work, not a reason to relex.

"Same theorems" is not a relex. A relex is 1–1 documents (`|Calf| ≈ |Beluga|` everywhere, leak
`..` so the student still writes the encoding). Equi-expressive languages routinely have
different succinctness: Calf shorter on paper contexts and binding; Beluga shorter once you
are fluent in boxes and write a compact `rec` with implicit arguments; Calf *longer* where it
makes you name facts and restate (`so V = suc E2`) what Beluga's unifier stays silent about.
That inequality *is* the reconception.

What we still refuse as a bijection of files: elaboration picks one canonical `.bel`; many
Calf documents (unicode, noise words, extra `so`) may share it. Inverse via the source map,
not by parsing Beluga. If pretty-printing `.bel` recovered `.calf`, we would not need a
source map — that would mean we had built a relex.

Length is not universally equivalent, and not even universally Calf-shorter:

| Calf carries, Beluga inserts (Calf *compresses*) | Calf carries, Beluga erases (Calf *expands*) |
|---|---|
| Paper contexts `Γ ⊢ E : T` — elaborator adds context variables, schemas, identity substitutions `..`, boxes | Named facts and citation edges — Beluga inlines them into `case`/`rec` terms |
| `lam x. E[x]` — elaborator adds HOAS | Drawn inference rules as first-class syntax |
| `if D : E ⇓ V then V value` — elaborator adds `mlam` / computational Π | Checked restatements (`so V = suc E2`) — Beluga's unifier already knows; Calf makes the student say it |

The left column is why Calf is paper-proximate. The right column is why it is a *reconception*,
not a pretty-printer: Calf's extra structure (the named DAG) is exactly what Gentzen projections,
analogical remainder, and local repair talk about, and exactly what Beluga compilation destroys.
That is also why those features sit on Calf, not on the pane.

**Agent test:** if a proposed Calf construct exists only to match a Beluga construct 1–1, decline
it. If a proposed elaboration leaks a Beluga token onto the Calf surface to keep the files the
same length or the same shape, that is the 2011 failure mode — decline it.

### 3.1 Design principles

1. **Every fact has a name; every justification cites names.** No "by the previous step", no
   positional references. This is simultaneously the pedagogy (students must know *what* they are
   using), the graph invariant (§4), and the LLM-repair invariant (edges are explicit).
2. **Declared notation, not fixed notation.** Judgments are mixfix templates declared by example
   (`judgment typing: Γ ⊢ exp : tp`). The language has almost no reserved mathematical symbols;
   the author's paper notation *is* the notation. Unicode and ASCII forms are interchangeable
   (`⊢`/`|-`, `⇓`/`=>>`, `·`/`empty`) and the editor normalizes.
3. **Inference rules are drawn, not encoded.** Premises above a `----- name` line, conclusion
   below — the single most recognizable artifact of the field, kept verbatim from SASyLF/Sasybel.
4. **Binding looks like paper.** `lam x. E[x]` — declared variables + the `E[x]` "x may occur in
   E" convention. The elaborator produces the HOAS encoding; the student never sees it unless they
   open the pane (§5).
5. **Contexts look like paper.** `Γ ⊢ E : T` and `Γ, x:exp ⊢ …` directly. The elaborator inserts
   Beluga's context variables, schemas, and identity substitutions (`..`). This is the largest
   single naturalness win over 2011 Sasybel (which leaked `| g |- M ..` to the surface) and the
   hardest elaboration problem (§6). It is worth it.
6. **Restatement is checked.** `where E = z` / `so V = suc E2` clauses inside cases are verified
   against what unification actually established. Never trusted, never forbidden.
7. **Noise words are a closed set.** Optional connectives (`so`, `hence`, `then`, `we have`) are
   fixed lexer-level aliases that carry zero semantics. Prose feel at zero ambiguity cost. The set
   is closed and documented; agents must never grow it ad hoc.

### 3.2 Shape, by worked example

Value soundness (compare `Beluga-W/sasybel/examples/vsound.sbel` for the 2011 ancestor):

```
%{ Value soundness }%

syntax
  exp ::= z | suc exp | lam x. exp[x] | app exp exp
  variables x y : exp

judgment value: exp value

  ---------- val-z
  z value

  E value
  ---------------- val-suc
  (suc E) value

  ------------------------ val-lam
  (lam x. E[x]) value

judgment eval: exp ⇓ exp

  ------- ev-z
  z ⇓ z

  E1 ⇓ E2
  ------------------- ev-suc
  (suc E1) ⇓ (suc E2)

  ------------------------------------ ev-lam
  (lam x. E[x]) ⇓ (lam x. E[x])

  D1 : E1 ⇓ (lam x. E[x])
  D2 : E2 ⇓ V2
  D3 : E[V2] ⇓ V
  ------------------------- ev-app
  (app E1 E2) ⇓ V

theorem value-soundness:
  if D : E ⇓ V then V value.

proof by induction on D.

  case rule ev-z, so V = z:
    V value                     by rule val-z.

  case rule ev-suc, with I : E1 ⇓ E2, so V = suc E2:
    H : E2 value                by induction hypothesis on I.
    V value                     by rule val-suc on H.

  case rule ev-lam:
    V value                     by rule val-lam.

  case rule ev-app, with D3 : E[V2] ⇓ V:
    V value                     by induction hypothesis on D3.

qed
```

With contexts (type uniqueness, ancestor `unique.sbel`):

```
context Γ ::= · | Γ, x:exp with x oft T

theorem unique:
  if D : Γ ⊢ E oft T and F : Γ ⊢ E oft T' then T = T'.

proof by induction on D.

  case rule t-app, with D1 : Γ ⊢ E1 oft (T2 → T), D2 : Γ ⊢ E2 oft T2:
    F1 : Γ ⊢ E1 oft (T2' → T')  by inversion on F.
    EQ : (T2 → T) = (T2' → T')  by induction hypothesis on D1, F1.
    T = T'                       by rule eq-arr-out on EQ.

  case assumption x, with (x oft T) in Γ:
    T = T'                       by uniqueness of assumptions on F.

  ...
qed
```

### 3.3 The justification forms (closed set — this *is* the proof calculus)

| Form | Meaning | Beluga target |
|---|---|---|
| `by rule R on F1, …` | apply inference rule `R` | constructor application |
| `by induction hypothesis on F, …` | recursive call; structurally smaller **checked at elaboration**, not just deferred to Beluga | `rec` self-call |
| `by inversion on F` | the derivation of `F` has exactly one applicable rule; extract its premises | single-branch `case` (coverage certifies uniqueness) |
| `by case analysis on F: case … end` | split on a derivation or term | `case` |
| `by theorem T on F1, …` / `by lemma T on …` | cite a proved theorem | call to its `rec` |
| `by assumption` / `by uniqueness of assumptions on F` | variable/context cases | parameter-variable branch |
| `by search` | **assistant, not semantics**: Orca finds a justification, which is written back into the source as one of the forms above | n/a (materialized) |
| `?` | open hole; hands off to Harpoon | Beluga hole |

A later assistant form, **not in v1**, is analogical remainder (`and similarly` / `by analogy with
case C` — §10.1). It is omitted from this table on purpose: agents must not grow the calculus to
accommodate it. The v1 shape (named facts, cited justifications, exhaustive `case rule`) is what
makes it *possible* later.

Statement shape: `if <named facts> then <fact>.` elaborates to Π over the premise derivations
producing the conclusion derivation — prose-shaped where SASyLF's `forall … exists …` is
quantifier-shaped. Accept `forall`/`exists` as aliases for corpus portability.

Open surface decisions (record the resolution in this doc when made): statement terminator
(`.` reads as prose but must be disambiguated from binder dots and projections — recommendation:
`.` with `;` accepted); whether `case rule` premise names may be rebound or must be fresh;
concrete `context`-membership syntax for the variable case.

### 3.4 What is deliberately out (v1)

Mutual induction; lexicographic measures; user-declared totality; substitution *lemmas* (Beluga
gives substitution for free — the tutorial must teach that, not the language re-prove it);
schema alternation beyond one declared context per judgment family; modules; any Beluga passthrough
escape hatch (a `%beluga { … }` block would be convenient and would instantly destroy the
"errors speak Calf" guarantee — declined).

---

## 4. The graph invariant (natural-deduction output)

**The proof source is a serialized DAG; every graph view is a projection, never an analysis.**

Because facts are named and justifications cite names (§3.1.1), each theorem is a DAG the moment it
parses: nodes = facts (with their judgment instances), edges = justification citations, clusters =
cases, subclusters = nested case analyses. Rule declarations are themselves ND figures. Two
renderings, both pure projections living in `js/editor-src/graph/` beside the existing dependency
graph views:

- **Derivation tree** — per fact, premises above the inference line, the classic ND tree. Finite
  and exact because inversion/IH edges are explicit.
- **Proof flow** — per theorem, the case-structured DAG; the view a grader scans.

Design consequence to uphold everywhere: **no language feature may introduce an anonymous
dependency** (this is the second reason `by search` materializes its result — a search-justified
step would otherwise be a node with invisible in-edges). Provenance triple-links every node:
`.calf` span ↔ generated `.bel` span ↔ graph node. Node identity is stable (fact name + span):
projections must not be render-only dead ends, because a later workspace may write back through
them (§10.2).

---

## 5. BelJar integration (main feature, not a lab)

| Surface | Behaviour |
|---|---|
| **File type** | `.calf` first-class: explorer, persist, library. Lezer grammar → highlighting, folds, structure. |
| **Live checking** | Same worker-only pipeline as `.bel` (checker NEVER on main thread). Elaborate → check fragments → map diagnostics back through the source map. Calf diagnostics join `project-diagnostics` as a layer; the status strip and lint gutter work unmodified. |
| **The pane** (the teaching feature) | Side-by-side `.calf` ↔ generated `.bel`, read-only, hover-linked both directions via the source map. The student *graduates* to Beluga by watching the encoding of their own proof. This is the product argument for Calf living in BelJar rather than as a batch tool. |
| **Holes** | `?` steps surface in the Harpoon holes panel; Orca proposals come back as materialized Calf justifications (never as Beluga text pasted into a Calf buffer). |
| **Graph** | §4 views, reachable from the editor context menu like existing graph views. |
| **Seam** | Editor-side owns everything semantic (`js/editor-src/calf/`); shell touches only file-type registration and panes, via the existing window-global seam. No new globals without a system noun. |
| **Tests** | `tests/test-calf-*.mjs` in the one `npm test` suite; a probe (`probe:calf`) only when the pane exists. Differential fixtures: the three legacy `.sbel` proofs, expected `.bel` from `translation.tex`, ported SASyLF examples. |

---

## 6. Where the actual difficulty lives (budget honestly)

1. **Contexts and strengthening.** Surfacing `Γ, x:exp ⊢ …` while inferring Beluga's schemas,
   context variables, identity substitutions, and block cases is *the* semantic content of the
   work. The `unique.sbel` lambda case in `translation.tex` shows the target's hairiness. If one
   thing slips, it is this — the fallback is shipping the closed-terms fragment with context
   support characterized as future work, which is weaker but coherent.
2. **Error translation.** Beluga reconstruction errors arrive in Beluga vocabulary against
   generated text. Mapping spans back is mechanical (source map); mapping *vocabulary* back
   (unification failure → "these two facts claim different types for E") is a design task per
   error class. Build the taxonomy early; measure coverage of it (this is a paper table).
3. **Inversion.** `by inversion` must verify uniqueness of the applicable rule, not assume it —
   elaborate to a case and let coverage certify, but report failure as "inversion is ambiguous
   here: rules R1, R2 both apply", in Calf vocabulary.
4. **Termination.** Measures come only from authored `by induction on` — never invented
   (⛔ standing trap: an invented `/ total /` can disable Beluga's termination check and bank a
   circular proof). The IH-smallness check at elaboration time is a feature (better error,
   earlier), not a replacement for Beluga's check.

---

## 7. Mandates (for every agent on this thread)

⛔ **Rules-first.** No elaboration behaviour that is not written as a rule in the spec section of
this doc (grow §3.3 / a future §spec as you build). If you cannot state the rule, you may not
implement the case. AI-written code is fine; AI-shaped semantics is not.

⛔ **Honest decline.** Unsupported construct → doc untouched, precise error at a precise span,
teaching-backlog note. Never partial output, never whole-file blanking, never "best effort".
(Instance of the architecture cascade: our model first, surgical Beluga second, decline third.)

⛔ **Errors speak Calf.** No Beluga vocabulary, no generated-code spans, no raw checker text in
any user-facing message. If you cannot translate an error class yet, decline it explicitly
("Beluga rejected this step for a reason Calf cannot yet explain — [raw]" is acceptable; silent
passthrough is not).

⛔ **Determinism.** Elaboration is a pure function; `by search` materializes; graphs are
projections. Same input, same output, byte-for-byte, forever.

⛔ **Try hard, then stop honestly.** No stub cases that accept and mistranslate. A branch you
cannot finish is a decline with a named limitation, a failing-by-design test, and a line in this
doc — that list *is* the future-work section of the paper.

⛔ **The seam and the boundary hold.** Never touch Beluga OCaml. Checker on the worker. Shell/editor
cross-talk via globals only. Scratch stays out of the product tree.

---

## 8. Naming

The product noun should join the family (Beluga → BelJar, Harpoon, Orca) and say what it is.

| Candidate | Case |
|---|---|
| **Calf** ⭐ | A young beluga: the language you speak before you speak Beluga, and the one that grows into it (the pane in §5 is literally the growing-up mechanism). Short, unclaimed in the space, `.calf` reads well. |
| **Song** | Belugas are "sea canaries"; their song = the natural language of the whale. Poetic, slightly opaque. |
| **Vellum** | Proofs on paper. Evocative, off-family. |
| Sasybel (keep) | Heritage/citation continuity, but ties us to SASyLF-the-system and to a dead codebase's reputation. Cite it; don't wear it. |

Recommendation: **Calf**, with Sasybel cited as ancestry in the paper. Rename this doc only if the
decision changes.

---

## 9. Kickoff pointers

Read first: this doc → `Beluga-W/sasybel/README` + the four `.sbel` examples →
`translation.tex` (the oracle) → `transform.ml` *skim*, specifically every `raise (Error` site
(the hard-case catalog) → `docs/CODEMAP.md` §domains, `docs/ORCA.md`, `docs/HARPOON.md`.

Gates, in order (each is a merge boundary, not a step list):

- **G1 — the still fragment.** `calf.grammar` + elaborator for `syntax`/`variables`/`judgment`/
  `context` (no proofs). Gate: the three legacy examples' declaration halves elaborate to `.bel`
  that the worker checks clean, differential-matched against `translation.tex` up to naming.
- **G2 — proofs, locally.** Theorem fragment of §3.3 with provenance and error translation.
  Gate: `sum`/`vsound`/`unique` check end-to-end; every seeded error lands on a `.calf` span in
  Calf vocabulary (build the seeded-error fixture set *first*).
- **G3 — the corpus + the graph.** SASyLF examples ported; §4 projections rendering; Orca as
  materializing repair. Gate: the coverage table (the paper table) and with/without-repair
  ablation.
- **G4 — the study.** Prose → Calf via LLM, deterministic check + repair loop, on the corpus's
  prose statements. Gate: pass-rate table + failure taxonomy.

The paper is G1–G3's spec + G3's table + G4's study. Write §spec entries as you go — retrofitting
the rules figure from code is how the formality mandate dies.

Do **not** start §10 work during G1–G4. The only fall obligation those items impose is already in
the table in §2 and in §4's stable node identity: keep the DAG a thing a later analogical
instantiator and a later tree-workspace could write back through. If a G3 graph implementation
would make nodes render-only dead ends, that is a regression against this doc, not a shortcut.

---

## 10. Orbit — not the target

Three professor asks, not said in the same breath as Calf, that slot *onto* it. They are recorded
here so they survive until winter, and so fall Calf is compatible with them. **They are not the
fall paper. Agents must not start them.** Classroom claims remain motivation (§1); a user study
still needs a semester we are not running this fall.

Calf is nonetheless the parent-ingredient of the instructional-environment vision (§10.3): you
cannot post a Beluga homework to a first type-theory class; you can post a Calf homework, render
it as the tree they saw on the board, and (later) let a lecture's "and the other cases are the
same" actually finish the proof.

### 10.1 Analogical remainder — lecture "and similarly" that actually checks

The lecturing move: work two of five cases on the board, wave at the rest. The ask is that when
the author does this in Calf, the remaining cases get *accomplished* — not left as holes, not
handed to an LLM.

This is easy to mishear as autoformalization (LLM completes the proof) or as Orca-after-a-split
(search each uncovered hole independently). Both are the wrong algorithm, and the LLM reading is
the one to steer the conversation away from: not because it is useless, but because it is the
expensive, ownership-destroying version of something coverage + substitution already know how to
do. A prof who does not live in this tooling will assume any AI-complete-the-cases feature is
nonsense they cannot defend; analogical remainder is defensible in one sentence at a whiteboard.

**The algorithm (when it is built):** the induction/case principle plus the judgment's rule set
give an exhaustive constructor covering — the same covering `case rule` already demands. The
author writes one or more cases in full. Each remaining constructor is filled by *instantiating
an authored case's justification DAG* under a renaming that makes its conclusion unify with the
remaining case's conclusion (and its `so`/`where` restatements with the unifier). Success
materializes as ordinary `case rule …` blocks in the source — same discipline as `by search`
(§2). Failure is an honest decline naming the mismatch ("case `ev-app` is not an instance of
`ev-suc`: the IH is used on a different premise"). No silent "best effort" fill.

That is the opposite of Orca: Orca synthesizes a justification from axioms at a hole; analogy
*copies a human-authored proof pattern* onto uncovered constructors. Orca remains available as
the fallback when analogy declines (materializing `by search` / `?`), but it is not how "the
other cases are the same" is implemented — because "the same" is a claim about the *author's
argument*, and only substitution can check that claim.

Calf is what makes this tractable. Named facts + cited justifications mean a case *is* a DAG
pattern. Doing the same to a Beluga `rec`/`case` term is reconstructing an argument from a
compiled encoding; that is why this feature sits on Calf, not on the pane.

Surface (later, not v1): something like `and similarly.` or `by analogy with case ev-suc.` after
the authored cases. Out of §3.3 until the instantiator exists; in of the DAG shape now.

Fall constraint: do not add a justification form that lets a case split be *partial* in the
checked document. v1 proofs are exhaustive or they are holes. Analogy, when it lands, is an
editor action that *writes the missing cases*; the file that checks is still fully written.

### 10.2 Gentzen as a workspace, LaTeX as a dump

The conversation was "Beluga code ↔ LaTeX visualization, either direction." The right BelJar
reading is: **Calf is already the code of the Gentzen tree.** §4's derivation-tree projection
*is* that visualization. `bussproofs`/`ebproof` is an export of the projection, a button for
slides and homework writeups — never a language, never an IR, never a thing we parse.

The interesting reverse is not "parse LaTeX into Beluga." It is a **tree workspace**: the student
(or the lecturer building a handout) draws or edits a Gentzen tree, and the system writes Calf
— or, as the cheap student-helper mode, dumps LaTeX of the tree they drew.

Tree and Calf are the same formal object. A workspace tree carries the DAG §4 already has:
named facts, a rule (or other justification) on each bar, cited premises. Calf is that DAG
serialized as text; the tree is that DAG laid out. Workspace → Calf is the inverse of the
projection — a pure function, no search, no LLM. If a bar has no rule, or a node has no name,
that is a well-formedness error in the workspace, the same class as a Calf parse error, not a
prompt. AI was wrongly licensed on this path in an earlier draft of this section; it does not
belong.

A *different* reverse — photograph of the board, unlabeled `bussproofs`, a tree missing names —
is reconstruction from an incomplete projection. That may use an LLM, and it is the
autoformalization study (G4), not the workspace. Do not fold it into the editor.

This is why §4 forbids render-only dead ends. Node identity (fact name + span) has to survive a
round trip: projection → user edits a bar or a premise in the tree → patch the corresponding
Calf facts/justifications → re-elaborate. If G3's graph is a picture generator, the workspace
cannot be built later without throwing it away. The workspace itself is winter; the identity
discipline is fall.

Direction of truth, always: Calf source is canonical. Trees are projections that may write
*through* the source map. LaTeX is a one-way dump of a projection. Beluga is an elaboration.

### 10.3 Parent vision — BelJar as a class surface (winter)

Thrown-out, but the thing Calf is *for* if the research continues past a language paper.

LearnOCaml-shaped: a course hosts artifacts students open in a BelJar (or a BelJar-copy) and
work interactively — posted lecture examples, homework with holes, maybe autograde against a
hidden Calf spec. A colleague across the Atlantic is already interested in using BelJar in a
class that would close with an experience report (the LearnOCaml move: ship the tool into a
real course, write what happened). What that report would track is not decided; plausible
axes are time-to-first-checked-proof, error-message comprehension, whether students ever open
the Calf↔Beluga pane, whether the Gentzen view is how they read their own proofs. That is a
paper of a different kind (JERIC / education workshops / a systems-and-experience slot), and
it needs the class, not just the language.

Why this sits under Calf rather than under "BelJar but nicer":
- The posted artifact has to be in a language the class already speaks. That is Calf, or it is
  a Gentzen tree that *is* Calf (§10.2). Posting `.bel` is posting the encoding.
- Analogical remainder (§10.1) is the lecture-to-file gesture: the board proof with two cases
  written and the rest waved at becomes a checked file.
- Local errors in Calf vocabulary are what a student can act on at 1am without a TA who
  speaks Beluga. The error-translation taxonomy (§6.2) is the autograder's comment language.
- The pane (§5) is the off-ramp for the student who wants the encoding — optional, not the
  homework's surface.

Fall does not build an LMS, a "post to class" button, a BelJar-copy deploy, or the experience-
report instrumentation. What fall *does* build for this parent: a language a class could be
given, errors that class could read, a tree a class could be shown, and a DAG a later "finish
the other cases" and a later "draw this on the board" can write back through.

If winter happens, this section is the kickoff substrate of that project, and this file's
Calf is the dependency it does not get to redo.
