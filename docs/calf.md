# Calf — a paper-proximate proof language over Beluga

**Status:** design. Nothing built. Target: a working language by **31 December 2026**.

**One sentence.** Calf is a language for writing PL metatheory the way it is written on paper —
drawn rules, named facts, paper contexts — elaborated into Beluga and checked by Beluga, so
that the reader never learns an encoding and the kernel never trusts a shortcut.

**Working name** Calf (a young beluga: what you write before you write Beluga). Extension
`.calf`. **Sasybel** (2011–12, McGill) is the ancestor; cite it, do not ship under it.

**How to read this file.** Part I is the language and is the point. Part II is how it reaches
the kernel. Part III is delivery. Part IV is reference — settled facts, reading, assets, and
stretch goals. §2 is the exhibit; reconstruct it yourself before proposing syntax.

**How to change this file.** Record a constraint or an elaboration rule when it is *decided*.
Do not record progress, arguments, or measurements-in-flight; §16 holds results, not lab notes.

---

# PART I — THE LANGUAGE

## 1. What Calf is

Beluga is the kernel. Calf is how you write a proof when the encoding is not the point.

The wall in a graduate metatheory course, and in a researcher's first week with any LF-based
system, is not the mathematics. It is the distance between the proof you have and the proof
the machine will accept. Calf's whole design is aimed at closing that distance without
weakening the kernel — you write the paper proof, including its contexts, and an elaborator
turns it into Beluga that Beluga checks.

**The precedent, and the difference.** SASyLF (2008, still maintained) established that a
paper-proximate surface for metatheory is possible and teachable. It has paper contexts
(`Gamma ::= * | Gamma, x : tau`, `assumes Gamma`) and justifications named after what
mathematicians say. Calf inherits that thesis wholesale.

What Calf changes is underneath. SASyLF's contexts are built into a bespoke checker, and its
own retrospective (Boyland, *Evolution of SASyLF 2008–2021*) records the cost: a soundness
violation in context pattern matching patched by a "relaxation" stopgap; one context
nonterminal per judgment; derivations in different contexts that cannot be combined; contexts
that cannot be first-class syntax; and substitution, weakening and exchange as *trusted
built-ins of the implementation*.

Beluga has principled answers to each — parameter variables that range over any position of a
schema, context variables as ordinary meta-variables, schemas with alternation, and
substitution as a checked object rather than an axiom. So:

> **Calf's surface must be at least as good as SASyLF's. Calf's kernel must be Beluga.**

The work is entirely in between, and §2 is what that work consists of.

## 2. The encoding tax — the exhibit

Everything Calf has to do is visible in one eleven-line Beluga proof. Learn this section
before anything else.

**On paper**, type uniqueness is:

> **Theorem.** If `Γ ⊢ E : T` and `Γ ⊢ E : T′` then `T = T′`.
>
> *Proof.* By induction on `D :: Γ ⊢ E : T`.
>
> *Case* `D` ends in **t-app**, with `D₁ :: Γ ⊢ E₁ : T₂ → T`. Inversion on `F` gives
> `F₁ :: Γ ⊢ E₁ : T₂′ → T′`. By IH on `D₁, F₁`, `T₂ → T = T₂′ → T′`, so `T = T′`.
>
> *Case* `D` ends in **t-lam**, with `D₁ :: Γ, x:T₁ ⊢ E[x] : T₂`. Inversion on `F` gives `F₁`
> likewise. By IH on `D₁, F₁` in the extended context, `T₂ = T₂′`, so `T = T′`.
>
> *Case* `D` is the assumption `x:T ∈ Γ`. Then `F` is that same assumption, so `T = T′`. ∎

**In Beluga** (`Beluga-W/examples/unique/unique-standard.bel`, verbatim):

```beluga
schema tctx = some [t:tp] block (x:term, _t:hastype x t);

rec unique : (g:tctx)[g |- hastype E T[]] -> [g |- hastype E T'[]]
             ->  [ |- eq T T'] =
/ total d (unique _ _ _ _ d) /
fn d => fn f => case d of
| [g |- t_app D1 D2] =>
  let [g |- t_app F1 F2] = f in
  let [ |- refl]  = unique  [g |- D1] [g |- F1] in
    [ |- refl]

| [g |- t_lam \x.\u. D] =>
  let [g |- t_lam \x.\u. F] = f in
  let [ |- refl] = unique [g, b:block x:term, u:hastype x _ |- D[.., b.1, b.2]]
                          [g, b |- F[.., b.1, b.2]] in
   [ |- refl]

| [g |- #q.2] =>
  let [g |- #r.2] = f  in
    [ |- refl]
;
```

Same theorem. Everything in the second that is not in the first is **encoding tax**:

| # | Tax | Paper says | Beluga demands |
|---|---|---|---|
| T1 | **Schema** | `Γ ::= · \| Γ, x:T` | one paper entry becomes a *block* of two LF entries under a `some` telescope |
| T2 | **Context variable** | nothing; `Γ` is just there | `(g:tctx)`, and every judgment boxed `[g \|- …]` |
| T3 | **Strengthening** | "T is a type" | `T[]` — an assertion that `T` does not mention `g`. Omit it and the theorem stops type-checking. The most alien token in the file, and invisible on paper |
| T4 | **Block extension + reassociating substitution** | "by IH on `D₁`" | `[g, b:block x:term, u:hastype x _ \|- D[.., b.1, b.2]]` |
| T5 | **Parameter-variable case** | "`D` is the assumption `x:T ∈ Γ`" | a case `[g \|- #q.2]`; matching `f` at `[g \|- #r.2]` forces `#r = #q` by unification, and *that* is the argument. No rule named "uniqueness of assumptions" exists |
| T6 | **Inversion as a `let` on a box pattern** | "inversion on `F`" | `let [g \|- t_app F1 F2] = f in`; non-uniqueness surfaces much later as a coverage failure |
| T7 | **Equality is an LF type; restatement is load-bearing** | "so `T = T′`" | declare `eq` with `refl`, then `let [ \|- refl] = … in` — the match is what propagates the equation |
| T8 | **Totality** | "by induction on `D`" | `/ total d (unique _ _ _ _ d) /` |
| T9 | **Implicit-argument arity** | nothing | you must know how many implicits reconstruction inserted |

Nine taxes, eleven lines. Every one is a place where Calf either does the work or leaks.

**How the ancestor failed, precisely.** Not at translation — Sasybel's output for these theorems
was near-identical to hand-written Beluga. At the surface. This is a *user-written* line from
`unique.sbel`:

```
eq_ref by induction hypothesis on | g, b:(x:exp) x oft _ |- D .. b.1 b.2 ,
                                   | g,b |- F .. b.1 b.2 ;
```

T4 typed by the author. T2 and T3 likewise, in the theorem statement. **Never write `..`, a
box, `mlam`, `#p`, a block, or a schema on the Calf surface to make elaboration easier.** If
you are about to, the elaborator is under-built, and that is the work.

**What it should look like** (illustrative, not frozen):

```calf
context Γ ::= · | Γ, x:T

theorem unique:
  if D : Γ ⊢ E : T and F : Γ ⊢ E : T' then T = T'.

proof by induction on D.

  case rule t-lam, with D1 : Γ, x:T1 ⊢ E[x] : T2:
    F1 : Γ, x:T1 ⊢ E[x] : T2'   by inversion on F.
    T2 = T2'                    by induction hypothesis on D1, F1.
    so T = T'.

  case assumption x:T in Γ:
    T = T'                      by uniqueness of assumptions on D, F.
qed
```

On paper, `Γ, x:T` binds one variable and records one assumption. The two-component block is
T1 and is the elaborator's business. SASyLF already writes `Gamma ::= * | Gamma, x : tau`, so:
**if Calf's context surface is worse than SASyLF's, stop and fix that before writing another
elaboration rule.**

## 3. The core

⚠️ **Proposal, awaiting ratification.** This is a design for the language's basis, not a settled
fact. Semantics are decided deliberately (§13); accept or reject each unification below on its
merits, then record the outcome here and delete this notice.

Calf should be **small**. A language with six forms that compose is more expressive than one
with twenty that overlap, and it is the only kind that can be made reliable. What follows is a
proposed basis: two concepts, four declaration notations, two proof forms, one justification.

### 3.1 Two concepts

**Concept A — an inductively defined family.** Paper draws four different-looking things.
Underneath they are one, and the elaborator should have one path:

| Surface notation | Paper form | Declares |
|---|---|---|
| `syntax` BNF | `exp ::= z \| suc exp \| lam x. exp[x]` | a family with no indices |
| `judgment` + drawn rules | `Γ ⊢ e : T`, then rules | a family indexed by other families; **the rules are its constructors** |
| `context` BNF | `Γ ::= · \| Γ, x:T` | a family of lists whose entries bind |
| `theorem` + proof | `if … then …` | a family whose constructors are **derived** rather than postulated |

Four notations because paper has four; one semantics because mathematics has one.

**Concept B — a proof is facts and splits.**

- **fact** — `name : statement   by justification.`
- **split** — a scrutinee and a list of branches, each branch a proof.

That is the entire proof language. Everything else is a justification, not a construct.

### 3.2 Four unifications

Each removes a construct *and* states something true.

**U1 — rules and theorems are cited identically.** `by R on f₁, …` where `R` may be postulated
or proved. Whether a fact was granted or earned is not the citer's business; this is Gentzen's
admissibility, and it is the thing the ancestor could never do at all (§16).
*The restriction that keeps it sound:* **citing** is uniform, **splitting** is not. A split needs
a known covering, so only postulated families may be split. One sentence, checkable, no special
cases.

**U2 — the induction hypothesis is a name, not a keyword.** `proof by induction on D` binds `IH`
to the theorem-as-rule. Then `by IH on …` is ordinary citation under U1, and the smaller-than
check is a side condition attached to that one name rather than a second justification form.

**U3 — case analysis, inversion and impossibility are one construct with a branch count.**
*n* branches is case analysis; exactly 1 is inversion, with uniqueness checked; 0 is
impossibility. The kernel agrees — Harpoon's `split` / `invert` / `impossible` are the same
tactic with a count check — which is confirmation from the other side rather than a coincidence.

**U4 — `by assumption` is citation of the context's entry rule.** A context declaration derives
a rule for its own entries, so the variable case stops being a special form and T5 becomes an
elaboration problem rather than a surface one.

**Result:** the justification grammar is **one production**, `by <name> on <facts>`, plus `?` for
a hole and an unjustified restatement (`so …`). The restatement is the single place where the
surface asks the kernel to agree rather than telling it how, and that is exactly where T7 says
it belongs.

### 3.3 What falls out with no new syntax

The test of a basis is what it gives you for nothing:

- **Schema alternation** — a context BNF with more than one extension alternative.
  `Γ ::= · \| Γ, x:T \| Γ, a:tp` is precisely Beluga's `+`. This is the construct SASyLF could
  not reach; here it is a second line in a grammar.
- **Using an existential or a disjunction** — a split.
- **Lexicographic measure** — a tuple in `by induction on`.
- **Several contexts in one theorem** — several context declarations, mentioned in statements.

Four Complete-tier rows arriving free is the evidence that the basis is right. If a charter row
needs a new construct, suspect the basis before adding one.

### 3.4 What must be added deliberately

Two things, and only two, for the rest of the Complete tier:

- **statement grammar** — `and`, `or`, `there is … such that`
- **declaration grouping** — `theorem A … and B …` for mutual induction

### 3.5 Crystal rules

Invariants that may never be traded for convenience. A violation is a language bug regardless
of what it buys.

| | |
|---|---|
| **R1** | **Notation is uniquely decodable, checked at declaration.** Ambiguity is an error where the notation was declared, never a parse failure where it was used |
| **R2** | **One meaning per form.** No construct behaves differently depending on where it appears |
| **R3** | **Total elaboration.** Every well-formed document elaborates completely or declines at a precise span. No partial emission, ever |
| **R4** | **Deterministic.** Same source, same bytes out |
| **R5** | **No construct ships that cannot be stated as an elaboration rule on a board** |
| **R6** | **No kernel vocabulary on the surface** — §2 |
| **R7** | **Every form has a paper counterpart.** If you cannot point at where a mathematician writes it, it does not belong in Calf |

R7 is the one that keeps the language small. Most feature creep in proof languages is the kernel
asking for accommodation; R7 is the standing refusal.

## 4. Expressive charter

Calf is meant to be a **language**, not a demonstration. This table defines "fully formed"; §14
stages it, and §3 is the basis it must all fit into.

**Core** — without these there is no language. **Complete** — without these it is a teaching
toy. **Stretch** — designed for, deferred without apology (§19).

### Systems

| Construct | Tier | Note |
|---|---|---|
| Object syntax with binding (`lam x. e[x]`) | Core | HOAS is elaboration; never surface |
| Judgments with author notation (mixfix `Γ ⊢ e : T`, `e ⇓ v`) | Core | R1 governs |
| Inference rules, drawn | Core | the constructors of a judgment |
| A single context per judgment | Core | T1–T5 |
| **Several contexts in one theorem** | Complete | free under §3.3 |
| **Schema alternation** | Complete | free under §3.3 |
| Context relations / subsumption between schemas | Complete | needed for anything comparing two contexts |
| Parametric systems, modules | Stretch | |

### Statements

| Construct | Tier | Note |
|---|---|---|
| `if … then …` over judgments | Core | |
| Equality of objects | Core | |
| Conjunction, disjunction | Complete | statement grammar (§3.4) |
| Existentials | Complete | statement grammar; *using* one is a split |
| Impossibility / contradiction | Complete | a split with zero branches (U3) |

### Arguments

| Construct | Tier | Note |
|---|---|---|
| Induction on a derivation | Core | the authored measure; T8 |
| Case analysis on a derivation | Core | U3 |
| Inversion, uniqueness checked | Core | U3 with one branch; ambiguity is a Calf error |
| Citing a proved theorem or lemma | **Core** | U1. ⛔ the ancestor never implemented this at all (§16) |
| Checked restatement (`so`, `where`) | Core | T7 |
| Holes | Core | route to Harpoon |
| Structural induction on a term | Complete | as distinct from on a derivation |
| **Mutual induction** | Complete | declaration grouping (§3.4) |
| **Lexicographic / measure induction** | Complete | free under §3.3 |
| Substitution, weakening, exchange | Core-by-inheritance | free from Beluga; Calf must not make the author invoke by name what the kernel already has |
| **Logical relations** | Stretch | Beluga's flagship results live here. A Calf that cannot reach them is a teaching language — an acceptable first destination, but choose it deliberately |
| Coinduction | Stretch | |

**Two rules about this table.** A construct enters the language only with an elaboration rule
you can write on a board (R5) — never to fill a cell. Anything outside the delivered tier is an
**honest decline at a precise span** (R3), never a partial translation.

The one permanent exclusion: **no `%beluga { … }` escape hatch.** It destroys "errors speak
Calf" the moment anyone uses it, and it violates R6. The pane is the escape hatch — read-only,
always visible, and you leave by taking the generated file, not by embedding the kernel in your
source.

## 5. Principles

Structure is §3; this is feel.

1. **Cite by name.** Facts you will use have names; justifications cite them. No "by the
   previous line." The names make the DAG explicit (§7) and are what the elaborator reasons over.
2. **The author's notation is the notation.** Mixfix templates, e.g. `judgment oft: Γ ⊢ exp : tp`.
   Unicode and ASCII are spellings of one token (`⊢`/`|-`, `⇓`/`=>>`, `·`/`empty`); the editor
   may normalise. R1 keeps this from becoming ambiguity.
3. **Rules are drawn** — premises, bar, name, conclusion.
4. **Binding looks like paper** — `lam x. exp[x]`. HOAS is elaboration.
5. **Contexts look like paper** — `Γ ⊢ E : T`, `Γ, x:T ⊢ …`. The expensive principle, and the
   one that justifies the project.
6. **Restatement is checked** — `so` / `where` are neither trusted nor forbidden. T7 shows they
   are load-bearing: a restatement is how an equation reaches the unifier.
7. **Noise words** (`so`, `hence`, `then`, `we have`) are a closed, documented alias set with no
   semantics. Do not grow it ad hoc.
8. **Uneven succinctness is correct.** Calf is shorter on contexts and binding (T1–T5, T8, T9
   vanish) and *longer* where it names facts and restates what the unifier already knew. That
   extra structure is the Gentzen view and local repair, and Beluga compilation destroys it.
   **If pretty-printing the `.bel` recovered the `.calf`, we would have built a relex.**

Completions speak Calf: the rules of *this* judgment, the constructors not yet covered. If
finishing a Calf line requires reading generated Beluga, the surface has failed.

## 6. Surface

Not frozen. Record each choice here when it is made.

```calf
syntax
  exp ::= z | suc exp | lam x. exp[x] | app exp exp
  variables x y : exp

judgment value: exp value

  E value
  ---------------- val-suc
  (suc E) value

judgment eval: exp ⇓ exp

  D1 : E1 ⇓ (lam x. E[x])
  D2 : E2 ⇓ V2
  D3 : E[V2] ⇓ V
  ------------------------- ev-app
  (app E1 E2) ⇓ V

theorem value-soundness:
  if D : E ⇓ V then V value.

proof by induction on D.

  case rule ev-suc, with I : E1 ⇓ E2, so V = suc E2:
    H : E2 value   by induction hypothesis on I.
    V value        by rule val-suc on H.

qed
```

**Justification spellings.** All of these are the one production of §3.2. The words are for the
reader; the elaborator sees `by <name> on <facts>`.

| Spelling | Cites | Note |
|---|---|---|
| `by rule R on …` | a postulated rule | |
| `by theorem T` / `by lemma T` | a derived rule | U1: same production |
| `by induction hypothesis on …` | the name bound by `by induction on` | U2 |
| `by assumption` / `by uniqueness of assumptions` | the context's entry rule | U4 |
| `by inversion on F` | — | U3, one branch, uniqueness checked |
| `by case analysis on F` | — | U3, *n* branches |
| `so …` / `where …` | — | restatement; the kernel agrees rather than being told |
| `?` | — | hole, routed to Harpoon |

`by search` is an **editor action**, not a justification: search proposes, and the buffer gains
an ordinary Calf line.

**Open surface questions**, to resolve here when the corpus forces them: the statement
terminator; freshness of names bound by a split; how membership in `Γ` is spelled; whether
unused conclusions must be named; how a judgment declares which contexts it lives over.

## 7. One proof, three readings

Named facts plus cited justifications **are** a derivation DAG, at parse time, with no analysis.
That object — not any file — is what a Calf document is.

Which means there are not three artifacts to keep in sync. There is **one derivation and three
readings of it**, and they sit at three different levels of abstraction:

| Reading | Shows | Status |
|---|---|---|
| **Tree** | what the proof *is* — the derivation, with `Γ` drawn at every node | editable; patches Calf through node identity |
| **Calf** | what you *say* — the argument, named and cited | **canonical** |
| **Beluga** | what it *costs* — the encoding | generated, read-only |

**The third reading is the unusual one.** Every proof assistant shows a goal panel: a snapshot
of the state at a cursor, which vanishes when you move. None of them shows the *encoding* as a
persistent view. That is the reading that makes §2 legible — put the cursor on a Calf line and
see the tokens it cost, itemised, in the place they appear.

**Truth order.** Calf is canonical. The tree projects from it and may patch it back. Beluga is
output and never an input. A *labeled* tree — names and a justification on every bar — is a pure
inverse of the projection, so missing labels are parse errors, not prompts; an unlabeled tree is
a different problem and not part of this.

**Requirements this places on everything else.** Stable node identity (fact name + span), so a
tree workspace is a projection rather than a rewrite. A source map at value granularity (§9), so
the Beluga reading can be pointed at line by line. And no feature may introduce an anonymous
dependency — that is why assistants materialise ordinary Calf instead of acting invisibly.

# PART II — THE MACHINE

## 8. Elaboration target

**Decided: emit `rec` / `case` / `let`.** Not Harpoon `proof` scripts. Three reasons:

1. BelJar's grammar consumes a proof script **opaquely** (`beluga.grammar:489–493, 641`), so
   holes, hover, rename and search cannot reach inside one. The pane would show text our own
   IDE cannot model.
2. A saved proof script re-prints the entire meta-context at every block — noisier than the
   `rec`, which defeats the three-column test (§15).
3. `suffices by` accepts only `lemma`, so a backward step from an induction hypothesis has no
   proof-script form.

Proof scripts remain a named fallback, not the trunk.

**Constraints on elaboration**, not to be relitigated without new evidence:

| Constraint | Why |
|---|---|
| **Emit `.bel` text plus a source map**, never Beluga's internal AST | the ancestor died on `Syntax.Ext` churn; the worker consumes text; text survives upstream versions |
| **Sound elaboration** | if Calf accepts, the emitted Beluga *is* the proof |
| **Elaboration is a pure function of the source** | assistants that search still *write* Calf |
| **No invented totality** | ⛔ measures come only from an authored `by induction on`; an invented `/ total /` can disable Beluga's termination check |
| **Never leak the encoding** | §2 |

## 9. Diagnostics and the source map

**Beluga localises well.** Measured on a 110-line proof: locally-detectable faults are reported
on the exact offending line, at every depth. The fear that a whole `rec` yields one useless
diagnostic was wrong.

**The real problem is attribution.** A fault whose contradiction appears later is reported at
the *first line that uses* the bad binding — four or five lines downstream of the cause, in
both a twelve-line and a 110-line proof, so the gap is set by proof structure rather than
length.

Two mechanisms, in order:

1. **Calf-side pre-check — primary.** Unknown rule name, cited fact that does not exist,
   ambiguous inversion, induction hypothesis applied to something not smaller, and **every
   coverage question** (Calf knows the judgment's rules, so it knows the covering) are decidable
   in the elaborator before Beluga runs. These must never reach the kernel. This is where the
   good messages live.
2. **The DAG recovers the cause.** When Beluga complains at a *use*, Calf already knows from
   its citation graph which earlier line established the value complained about. "Line 12 fails
   because the fact `F1` it cites was established wrongly at line 5" is a graph lookup, not a
   search.

⛔ **Ascribing every step buys nothing.** Bare and ascribed encodings produce byte-identical
diagnostics at every depth. Closed question.

**The source map** has three consumers: diagnostics (Beluga `File "input.bel", line L, column C`
→ `.calf` span, parsed by `js/editor-src/ide/beluga-diag.mjs`), the teaching pane, and the DAG.
It must relate the **value** Beluga names in a complaint to the Calf fact that established it —
not merely a line to a line. Build it at that granularity from day one; retrofitting a source
map is how a project like this acquires an unfixable diagnostics story.

**Errors speak Calf.** Judgment, rule and fact names, `.calf` spans. Silent Beluga passthrough
is a defect. "We cannot explain this Beluga error yet" plus the raw text is acceptable;
pretending the error was on the generated line is not.

## 10. Where this lives — BelJar

BelJar is a browser IDE for Beluga: two runtimes glued by `window` globals. Atlas:
[`CODEMAP.md`](CODEMAP.md). Rules: [`AGENTS.md`](../AGENTS.md) and [`.cursor/rules/`](../.cursor/rules/).

- **BelJar is the intelligence.** Do not wrap Beluga's printer. Cascade: our model → surgical
  Beluga → honest decline.
- **Never edit** `Beluga-W/src/core/` or other semantic OCaml without explicit permission; the
  shim is `Beluga-W/src/web/beluga_web.ml`, rebuilt by `_rebuild/rebuild.ps1`.
- **The checker is always on a web worker** (`js/beluga/`).
- **New modules go in a domain folder** — for Calf, `js/editor-src/calf/`. Root `editor-src/*`
  is substrate and barrel only.
- **Seam:** the shell does not ES-import `editor-src`. Glue is system-noun globals and
  `beljar:*` events.
- **Grammar:** a sibling Lezer `calf.grammar` beside [`beluga.grammar`](../beluga.grammar) is
  the default; a second parser stack needs a reason.
- **Checking, holes, search:** [`semantic-engine.mjs`](../js/editor-src/semantic/semantic-engine.mjs),
  [`settlement.mjs`](../js/editor-src/semantic/settlement.mjs),
  [`hole-goal-system.mjs`](../js/editor-src/prover/hole-goal-system.mjs), [`ORCA.md`](ORCA.md),
  [`HARPOON.md`](HARPOON.md).
- **Tests:** one `npm test`; `tests/test-calf-*.mjs` inside it. Editor changes need
  `node scripts/build-editor.mjs`.
- **`Beluga-W/` is a git submodule** — workspace search tools often miss it.

Calf is a **main-line file type**, not a lab: explorer, persistence, library, live elaborate →
worker → `project-diagnostics`, gutter and status strip intact. The `.calf` / `.bel` pane,
linked by the source map, is the teaching feature and the reason this is not a CLI.

Calf **incubates here** and must be fully usable here. Do not extract it to its own repo while
it still needs the pane, the holes and settlement.

## 11. The correspondence surface

Beside the language itself, this is the deliverable: the three readings of §7, **interlinked and
live**. BelJar is the battle-tested substrate and stays that way; this surface is the
experimental part, and it is fine for it to be fresh.

### 11.1 What interlinked means

One object, three readings, one selection:

- Put the cursor on a Calf line → its node highlights in the tree, and the region it emitted
  highlights in the Beluga reading.
- Click a tree node → the cursor moves to the Calf line that made it.
- Select a Beluga region → it resolves back to the Calf fact that caused it, never to a line
  number.

**Editing.** Calf is canonical and always editable. The tree is editable and patches Calf back
through node identity (§7). The Beluga reading is never an input.

The tree is where you work when you do not yet know what to write; the text is where you work
when you do. Neither is a mode.

### 11.2 It must work on broken proofs

The single requirement that decides whether any of this gets used, and the one such surfaces
usually fail: **you need the tree most when you are stuck.** A view that renders only complete,
checking proofs is a demo.

- A proof with holes has a tree, with open goals drawn as open leaves.
- A proof that does not fully parse has the tree of the part that did.
- The Beluga reading shows the last successful elaboration, **marked stale**, rather than going
  blank on every keystroke.

**This does not weaken R3.** R3 governs what is handed to the kernel: complete, or declined at a
span, never partial. The *display* may show the last good elaboration with a staleness marker.
Emission and display are different acts, and keeping that distinction explicit is what stops the
live pane and R3 from appearing to contradict each other.

### 11.3 What it needs from the rest of the system

- **Stable node identity** (§7) — fact name plus span, surviving edits. Without it the tree is a
  render-only dead end and the correspondence cannot be bidirectional.
- **A value-granular source map** (§9) — relating the value Beluga names to the Calf fact that
  established it, not a line to a line.
- **Incremental elaboration** — re-elaborating a whole document per keystroke will not hold up.
  Reuse BelJar's existing incremental discipline rather than inventing a second one.
- **The checker stays on the worker.** Nothing about a live three-way view changes that.

### 11.4 Tutorials, not coursework

⛔ **No assignment surface, no grading, no submission, no LMS.** BelJar as it stands is what a
class needs; coursework is not a requirement on this project and must not become one.

The educative angle worth anything is **tutorials**: a guided `.calf` document for a student who
wants to try it, walking the same three readings — what a derivation is, how you write the
argument, what it costs in the kernel. Optional, additive, and written as content rather than
built as a product surface.

### 11.5 The pitch

> **Every proof assistant shows you a goal. This shows you the proof.**
>
> One derivation, three readings: the tree is what it is, the text is what you say, the Beluga
> is what it costs. Work in whichever one you think in — they are the same object.

## 12. The hard problems

1. **Contexts and strengthening** (T1–T5). A first cut without T4 and T5 is a warm-up, not a
   language.
2. **Attributing a fault to its cause** (§9). The residual work is correspondence, not search:
   the source map must relate values, not lines.
3. **Error translation**, per class, not one regex.
4. **Inversion uniqueness**, checked in the elaborator rather than deferred to a coverage
   failure.
5. **Termination.** Only authored measures. Elaborator-side smallness checking is a *better
   error*, never a replacement for Beluga's check.
6. **Several contexts in one theorem** — the Complete-tier item where SASyLF's design gave out,
   and the clearest evidence that the kernel choice was the right one.

---

# PART III — THE ROUTE

## 13. Working requirements

**Semantics are designed, never discovered.** Every elaboration rule is stated as a rule — on a
board, in this file — *before* it is implemented. A construct that cannot be stated that way
does not ship, however green the tests are. A rule that exists only inside the elaborator's
code is not a rule; it is an accident that happens to pass.

| Designed deliberately, written down here | Built to serve it |
|---|---|
| Every elaboration rule | Grammar, AST, emitter plumbing, tests, source-map machinery |
| The surface: what a paper proof looks like in Calf | Parser, completions, the pane, the file type, persistence |
| The fragment boundary: what declines honestly | The decline mechanism and its spans |
| What counts as evidence | The harness that measures it |

Implementation may be generated, assisted or mechanical. Semantics may not. §2 is nine things a
machine must get exactly right, and none can be settled by seeing whether the output happens to
check.

**Measurement is separate from design.** Instrumentation produces numbers a decision can stand
on; it never makes the decision. Where this file records a measurement it records the method
and the caveats with it.

## 14. Delivery to 31 December 2026

Targets, not commitments. **Each phase closes a property of the language, not a feature list** —
a phase is over when its property holds, and features are whatever it took. The structure is
**vertical**: staging as "all the syntax, then all the proofs, then the IDE" defers T4 and T5
until there is no time to act on what they teach, so the first slice goes through the hardest
case.

| Phase | Dates | The property it closes |
|---|---|---|
| 0 | 22 Sep – 5 Oct | **The tax is owned.** §2's table is yours, not read |
| 1 | 6 Oct – 2 Nov | **The basis is real.** §3 is ratified by surviving the hardest case |
| 2 | 3 Nov – 30 Nov | **The Core tier is total.** Every Core row elaborates or declines at a span |
| 3 | 1 Dec – 21 Dec | **It is a language, in an IDE, and the basis stretches.** Complete-tier rows arrive without new constructs |
| 4 | 22 Dec – 31 Dec | **The boundary is honest.** Every charter row is marked delivered, designed, or out |

**Two deliverables, not one.** The language (§3–§6) and the correspondence surface (§11) are
both the project. The surface is scheduled inside Phase 3 rather than bolted on afterwards,
because §11.3's requirements — node identity, a value-granular source map, incremental
elaboration — are cheap to build into the elaborator and expensive to retrofit.

⛔ **BelJar itself is not in scope here.** It is the battle-tested substrate and stays stable;
Calf and the surface are the experimental layer on top, and it is fine for them to be fresh.
Nothing in this plan may destabilise the shipping IDE to make room for the research.

**Phase 0 — own the tax.** Hand-write the seed corpus three ways: on paper, in imagined Calf,
and in Beluga by hand (`scratch/`, throwaway). Ladder: `sum` (closed terms) → `vsound` (HOAS) →
`copy` (context variable and parameter variable, *no blocks* —
`examples/copy/copy-simple-explicit.bel`, 19 lines) → `unique` (blocks, strengthening). Each rung
adds exactly one tax family. Read `translation.tex` only after predicting the Beluga unaided.
**Closed when:** §2's table is confirmed or corrected here, §6's open questions are answered for
`unique`, and §3's four unifications have been accepted or rejected **in writing** — they are
cheap to change now and structural later.

**Phase 1 — the basis is real.** `unique` end to end: syntax, judgments, drawn rules, context
declaration, three proof cases, elaborated to a `.bel` the worker accepts, with a source map at
value granularity (§9). Must include T4 and T5. **Closed when:** a differential against
`unique-standard.bel` agrees up to naming, as a test in `npm test`, **and R4 holds** (same source,
same bytes). If the surface acquired a `..`, a block or a `#p` to get there, the phase has failed
and is not over — that is R6, and it is the whole point of going through `unique` first.

**Phase 2 — the Core tier is total.** Every Core row of §4, over `sum`, `vsound`, `copy` and two
or three more from `Beluga-W/examples/`. Diagnostics on `.calf` spans in Calf words; §9's two
mechanisms built. **Seeded errors before golden-path polish** — write the wrong proofs first and
judge what the tool says. **Closed when R3 holds:** no input produces partial output. Every
document either elaborates completely or declines at a precise span, including malformed ones.
Total behaviour is a property you verify, not a habit you maintain.

**Phase 3 — the three readings, and the basis stretches.** Two gates, both falsifiable.

*The surface.* File type, persistence, library, holes routed to Harpoon, and §11 working:
selection shared across Calf, tree and Beluga; the tree editable and patching source; **and
§11.2 holding — all three readings usable on a proof that is broken, incomplete, or mid-edit.**
That last clause is the gate. A correspondence surface that only renders finished proofs is a
screenshot, and it is the failure mode these things usually have.

*The language.* **§3.3 predicts that schema alternation, several contexts, lexicographic
measures and existential *use* need no new constructs.** Delivering them is the experiment that
tests the basis. **Closed when** those four land with only the two additions §3.4 allows. If any
of them demands a fifth construct, stop and revisit §3 — the basis was wrong, and finding that
out in December is the cheapest it will ever be.

**Phase 4 — the boundary is honest.** §15's tables. Every charter row marked delivered,
designed-but-deferred, or out, with what each deferral costs. A named limitation is a result; a
silent one is a defect.

**The standing test, applicable in any phase.** If a charter row seems to need a new construct,
the basis is wrong before the charter is. Adding a seventh form to cover a case is how a small
language becomes a large one, and it happens one reasonable exception at a time.

## 15. Evidence

Decide the measurements before building what produces them.

1. **The three-column test.** Paper, Calf, generated Beluga, side by side. Calf should read as
   the paper with names filled in; Beluga should read as a compilation. If those two distances
   are not obvious at a glance, the surface is not done.
2. **Encoding tax, measured honestly.** ⛔ Not token counts — a documented failure mode of
   overstating by factors of 4, 10 and 24. Measure **distinct encoding concepts a reader must
   already know**: for `unique`, Beluga needs nine; Calf should need zero.
3. **Expressive coverage** — §4's charter with each row marked delivered, designed, or out, and
   the seed corpus mapped onto it.
4. **Against SASyLF's documented walls** — several contexts per judgment, context-varying
   conjunction, permutable assumptions, contexts as data. Show what each becomes in Calf, or
   name which it does not reach. Honest "not yet" rows are worth more than silence.
5. **Error-translation coverage.** Beluga's core declares **106 distinct error variants**, 49 of
   them in reconstruction and elaboration — precisely where the taxes live. Report the fraction
   Calf renders in its own vocabulary at a correct span, over the variants a Calf file can
   actually reach, with the raw-passthrough residue as a number.
6. **Localisation.** For seeded single-line errors, how often does the diagnostic land on the
   line at fault? This decides whether a student can work alone.

---

# PART IV — REFERENCE

## 16. Settled — do not re-derive

Measured 22 September 2026. Probes in `scratch/` are local to one machine; the results are here
because that is what survives.

**Diagnostics.** Beluga reports locally-detectable faults on the exact line, at every depth of a
110-line proof. Non-local faults land at the first *use* of the bad binding, +4 or +5 lines,
independent of proof length. ⛔ Type-ascribing every binding changes nothing — identical
diagnostics — and is a closed question.

**A Beluga defect, found and patched.** Annotating a `let` whose right-hand side is a box of a
pattern-bound meta-variable raised an internal `Match_failure` from `reconstruct.ml:916` rather
than checking. Cause: `unifyScrutinee` matched `IndexObj` only for `PatMetaObj` or a `PatAnn`
wrapping one, with no catch-all, so a variable pattern fell through. Patch looks through
`PatAnn`, returns `()` for variable patterns (they refine no index, exactly as the `DataObj`
arm above), and throws `PatternMobj` otherwise. Verified: builds, repro fixed, `npm test`
259/259, and a 412-file corpus re-check identical to the pre-patch baseline. **Uncommitted, in
this tree's fork; not proposed upstream.**

**The corpus.** 412 `.bel` paths across `Beluga-W/examples/` and `library/`, but only **217
distinct contents** — `library/` is very largely a byte-identical mirror, so ⛔ **it cannot serve
as a held-out evaluation set.** 140 check standalone; the rest are members of `.cfg`-driven
multi-file developments and check when assembled (verified on `church-rosser/ord.cfg`), so
assembly is the constraint, not health. 97 files are metatheorem-shaped; **46 are first-cut
candidates**, 31 of them using contexts.

**What the ancestor never built.** `transform.ml` has 79 `raise (Error …)` sites: 56 are user
diagnostics, ten are named unimplemented constructs, eight are internal panics. Two facts
matter. **`PTheorem` was never implemented — Sasybel could not cite a previously proved theorem
at all**, so multi-lemma developments were impossible and its one-theorem corpus is not evidence
that the approach scaled. And the panics cluster on `VAltOft`/`VAltOftBlock` — the context entry
carrying a typing assumption, i.e. exactly what becomes a block — which panics in three of the
four traversals. `translation.tex` shows `unique` translating, so **one path handled the hard
case and three did not.**

**The API rot is disjoint from that.** No `raise` site is rot. The rot is structural: Camlp4,
`ulex`, `Pervasives`, and an `Ext.Comp` that no longer exists (`MetaObjAnn`, `BoxVal`,
`PatMetaObj` are absent from today's external syntax, which moved to `Beluga-W/src/syntax/` with
a menhir parser). This is the evidence behind "emit text".

**Case completion is a separate track.** Completing missing proof cases from authored ones is
being built against Beluga / Harpoon / Orca, not inside Calf — most of the machinery is
reachable natively there, and at partial efficacy it was bending Calf's justification around an
automation. Calf keeps one step: the engine takes a *schema* as a first-class input, and Calf
supplies **authored** schemas where the Beluga path infers them. See the case-completion track
for the interface constraints. **Calf must be justified without this feature.**

## 17. Research map

### The kernel

| Asset | Extract |
|---|---|
| `Beluga-W/README.md` | what Beluga is: HOAS plus first-class contexts |
| `Beluga-W/harpoon.md` | the tactic vocabulary and the proof-script form |
| `examples/unique/unique-standard.bel` | **the exhibit**; read beside `sasybel/examples/unique.sbel` |
| `examples/literate_beluga/0Beginner/` | Pientka's narrated walkthroughs, `.bel` interleaved with prose — including `Type_Uniqueness`. The best local teaching resource, and an answer key: open it after your own attempt |
| `examples/copy/`, `examples/count-var/`, `examples/free-vars/` | small context developments; the Phase 0 ladder |
| [`beluga.grammar`](../beluga.grammar) | what our parser already knows; Calf elaborates *into* this |

Papers: Nanevski, Pfenning & Pientka, **Contextual Modal Type Theory** (TOCL 2008) — read the
day `T[]` stops making sense. Pientka & Cave, **Inductive Beluga: Programming Proofs** (CADE
2015) — why a proof is a total recursive function. Errington, Jang & Pientka, **Harpoon** (CADE
2021) — proof scripts as an assertion-level IR, the closest existing thing to Calf and
machine-written rather than authored.

### The ancestor

Aldrich, Simmons & Shin, **SASyLF** (FDPE 2008) — the thesis Calf inherits. ⭐ Boyland,
**Evolution of SASyLF 2008–2021** (arXiv 2202.03568) — the single most useful document for this
project: thirteen years of what students got wrong, what was added, and a candid account of
where the design ran out of road. Code: <https://github.com/boyland/sasylf> — write one small
proof in it, an afternoon, to calibrate what "paper-proximate" feels like.

### Cousins — know them so you do not clone them

**Holbert** (<https://arxiv.org/abs/2210.11411>) — browser-based, educational, natural deduction,
proof trees, no tactics. Closest to Calf's UI ambition; different logic, own kernel, no
contextual types. **Isabelle/Isar** and **Mizar** — structured declarative proof in another
kernel; Calf's `by` vocabulary is in this tradition. **Lean Verbose** (Massot) — controlled
natural language over Lean; the honest version of the education claim. **Ott** — paper-like
specification compiled to several provers, no proofs. **ORBI / The Next 700 Challenge Problems**
(Felty, Momigliano, Pientka) — benchmark problems across Twelf, Beluga, Abella and Hybrid; a
genuinely unseen corpus, which §16 says we need. **Abella**, **Twelf**, **Hybrid** — the
comparison a reviewer will ask for.

## 18. On-disk Sasybel assets

`Beluga-W/sasybel/` — not in Beluga's dune build, not runnable. A spec dump, not code to revive.

```
sasybel/
  examples/
    sum.sbel          # nats, + — Phase 0 rung 1
    vsound.sbel       # eval / value soundness — rung 2
    unique.sbel       # typing uniqueness — rung 4, the exhibit
    alg-equal.sbel    # α-equality; theorem commented out
    tutorial.tex      # the 2011 student tutorial
    translation.tex   # lab notebook: .sbel → reconstructed Beluga, 2011 dialect
  src/
    ast.ml(i)         # section / rule / proof AST — the shape of the language
    transform.ml(i)   # the translation; see §16
```

`translation.tex` is 2011 Beluga (`{N :: n[]}`, `FN g =>`, trailing `..`) and will not compile.
Read it for *structure*; never paste it. **Do not port this compiler.**

## 19. Stretch goals

Compatible with §7's DAG. None of this is in Phases 0–4, and none of it is Calf's justification.

**Analogical remainder.** "The other cases are similar" as a checked object: instantiate an
authored case's DAG onto a missing constructor, inserting ordinary Calf. Now built as a separate
Beluga-side track (§16); Calf's remaining contribution is authored schemas and completions
reviewed in paper form.

**LaTeX export.** `bussproofs` output from a tree is a dump, one-way, never an IR. The tree
*reading* itself is no longer a stretch goal — it is §7 and §11, and it is scheduled.

**A tree from an unlabeled source.** A photograph of a board, or LaTeX without justifications,
is a recognition problem rather than a projection. Out.

**Beyond the Complete tier.** Logical relations, coinduction, parametric modules. Each is
something SASyLF's design could not reach and Beluga can; each is also a place where the paper
surface is genuinely unsettled — nobody has agreed what `Γ ⊢ …` should look like when there are
three of them.

**Class wrapper.** Assignment hosting, autograding and deployment are a **sibling** project that
bundles this IDE. It does not redo Calf and does not push LMS features into this tree.

## 20. Naming and house laws

| Name | Note |
|---|---|
| **Calf** | Working name. `.calf`. The pane is "growing up" |
| Song | Belugas as sea canaries |
| Vellum | Paper; off-family |
| Sasybel | Cite; do not ship under it |

House laws that apply unchanged: honest decline through the architecture cascade; errors speak
Calf; elaboration is a pure function of the source; assistants that search still *write* Calf;
no Beluga OCaml without explicit permission; the checker stays on the worker; ⛔ no invented
`/ total /`; scratch stays out of the product tree. Try hard, then stop honestly — a named
limitation beats a lying elaborator.
