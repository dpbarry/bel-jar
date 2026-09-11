# Chunk 3 — Meaning

*Which tree nodes are named entities, of what kind, in what scope. Computed entirely in
JavaScript. No backend.*

---

## 1. The architecture

```
walkTree(tree, doc)                        ← lazy, cached per tree
  ├── computeLintBlocks(tree, doc)         → blocks, blockAt      (the check unit)
  ├── get parseDiags  → collectParseDiagnostics(...)              (chunk 4)
  └── getNames() → doNamesWalk(tree, doc, blockAt)
                     → { definedNames, defMap, uses }
```

Separately, `createSymbolStore()` maintains the incremental, project-wide index that the
IDE surfaces actually query.

Both are pure JS over the lezer tree. **Meaning never calls the backend**, which is the
second half of the theory's load-bearing claim and the reason a new language gets
navigation before it gets a provider.

---

## 2. The central finding: Meaning is three roles plus extractors

`doNamesWalk` is a single `tree.iterate` with a `switch` on node name. Every case does
exactly one of three things:

| Role | What it does | Example nodes |
|---|---|---|
| **BINDER** | push a scope carrying bound names | `LFLambda`, `FnExpression`, `MLamExpression`, `ContextualType` |
| **DEFINER** | record a global definition | `LFDatatypeDeclaration`, `SchemaDeclaration`, `RecBody`, … |
| **REFERENCE** | record an identifier occurrence | `LowerIdentifier`, `UpperIdentifier` |

That is the whole model. Three roles, and the dispatch around them is generic machinery
(scope stack, `defMap`, `uses`, block attribution).

⭐ **But roles alone are not sufficient, and this is the important part.** Each binder node
needs its own *extractor* to get the bound names out:

```js
case 'LFLambda':       firstChildNamed(node, 'LFLambdaBinder') → LowerIdentifier
case 'FnExpression':   fnParams(node, doc)
case 'MLamExpression': mlamParams(node, doc)
```

The **dispatch** generalizes to data. The **extractors** do not — they are small functions
that know a node's internal shape. This is precisely the escape hatch chunk 2 predicted the
pilot would find, located here without needing the pilot.

### So Meaning's language pack is a module, not a table

```js
// lang/<x>/meaning.mjs
export const binders = {
  LFLambda:       (node, doc) => [...],
  FnExpression:   fnParams,
  MLamExpression: mlamParams,
};
export const definers = {
  LFDatatypeDeclaration: multiHead,      // see §3
  '*':                   firstIdentChild,
};
export const namespaceOf = { LFDatatypeDeclaration: 'lf-type-family', … };
```

Platform code becomes a generic driver over those three tables. Roughly 970 platform-side
node-name sites collapse onto this. That is the chunk 2 number, resolved.

---

## 3. Multi-head definers are universal, not a Beluga quirk

`addDefMapEntry` carries a special case with a comment:

> A mutual LF block (`LF n … and a … and p …`) is ONE `LFDatatypeDeclaration` with several
> type-family heads. Each head must be navigable, not just the first.

This has always been filed as a Beluga gotcha. It is not. Rocq has exactly the same shape:

```coq
Inductive even : nat -> Prop := … with odd : nat -> Prop := …
Fixpoint f … with g …
```

⭐ **`definers` must return a list of heads, never a single identifier.** Designing this in
from the start costs nothing; discovering it in November costs a rewrite of the definition
index. Beluga's quirk turns out to be the general case.

---

## 4. Lint blocks are the check unit, and they are portable

```
gatherRawDecls → clusterDeclarations → finalizeBlock → coalesceSameLineBlocks
```

A block is a top-level declaration, with mutual siblings clustered together and same-line
declarations coalesced. Blocks drive the check granularity, diagnostic attribution, health
dots, and the incremental index.

The concept maps directly: for Rocq a block is a vernacular sentence, with
`Proof … Qed` spanning as one unit and `with`-joined mutuals clustered. Only
`gatherRawDecls` is language-specific; the clustering and coalescing stages are generic.

---

## 5. The incremental index is a free win for every language

`createSymbolStore` keeps a **bucket per top-level declaration** and reuses every bucket the
ChangeSet did not touch. It carries a written soundness argument (prefix closure over
interface changes), a bail-to-full-rebuild path for anything unusual, statistics
(`full / incremental / identical / bails`), and an equivalence test
(`tests/test-symbolstore-incremental-equivalence.mjs`).

The mechanism is **language-neutral**. Its only language dependency is what counts as a
top-level declaration bucket, which §4 already answers.

⭐ **Rocq inherits incremental project-wide symbol indexing the moment its grammar defines
declarations.** This is the vision working exactly as advertised: real infrastructure falling
out of a grammar plus a small manifest.

---

## 6. `NAMESPACE` is three different things wearing one hat

The 12-constant enum is consumed in three distinct ways:

| Use | Example | Generalizes as |
|---|---|---|
| **Semantic predicates** | `namespace === LF_CONSTRUCTOR \|\| COMP_CONSTRUCTOR \|\| COMP_DESTRUCTOR \|\| LF_CONSTANT` | **traits** |
| **Ordering / priority** | a 10-entry precedence list for resolution | a per-namespace `order` |
| **Display labels** | `'LF type family'`, `'schema'`, `'typedef'` | **language-pack strings** |

So the namespace table is:

```js
'lf-constructor': { label: 'LF constructor', traits: ['constructor', 'global'], order: 3 }
```

and platform code asks `hasTrait(sym.namespace, 'constructor')` instead of listing four
constants. ⛔ The display labels are Beluga vocabulary and must never leak into platform
code — Rocq says "inductive type", "constructor", "definition", "lemma".

---

## 7. Correction to chunk 2's classification

Chunk 2 listed `name-resolve.mjs` (140 node-name sites) as Meaning. **That was wrong.** Its
exports are:

```
collectUndefinedApplicationDiags  referenceKind  signatureBinderType  slotExpectedType
applicationExprType  resolveHoverDoc  projectHoverType  hasTypeProjection
resolveHover  isHoverableIdent
```

One of ten (`referenceKind`) is Meaning. The rest is hover resolution and type-directed
diagnostics — **Judgment and Presentation**. Those 140 sites belong to chunks 4 and 9, not
chunk 3.

Net effect: Meaning's true platform-side surface is smaller than chunk 2 implied. This is
what chunked analysis is for.

---

## 8. What Rocq's Meaning layer must supply

| Piece | Rocq content | Size |
|---|---|---|
| `definers` | `Definition`, `Fixpoint`/`CoFixpoint` (multi-head), `Inductive`/`CoInductive` (multi-head, plus constructor heads), `Lemma`/`Theorem`/`Corollary`, `Ltac`, `Notation` | ~12 entries |
| `binders` | `fun`, `forall`, `match` branch patterns, `let … in`, section variables | ~6 extractors |
| `namespaces` | inductive type, constructor, definition, lemma, module, section, notation, local | ~8 entries |
| `gatherRawDecls` | vernacular sentence boundaries; `Proof … Qed` as one unit | one function |

Everything else — scope stack, `defMap`, `uses`, block clustering, the incremental index,
go-to-definition, find-references, rename, outline, the name-level graph — is inherited.

---

## 9. What chunk 3 changes about the plan

1. **Meaning's language pack is a module, not a manifest entry.** Binder extractors are
   irreducible small functions. Budget them as code, not data.
2. **`definers` returns a list of heads from day one.** Mutual declarations are the general
   case, not a Beluga edge.
3. **Namespaces carry traits, ordering and labels separately.** Platform code queries traits;
   labels are language-pack strings and must not leak.
4. **The incremental index is free per language** and should be a headline claim in the
   `PROVIDER.md` contract.
5. **Chunk 2's 970-site platform figure shrinks** by roughly 130 sites reclassified to
   Judgment and Presentation.

---

## 10. Open questions carried forward

- `collectParseDiagnostics` shares `walkTree`'s cache and blocks. How much of parse-error
  recovery is Beluga-shaped? → chunk 4.
- `infix.mjs` (62 sites): Beluga declares operators via pragmas, Rocq via `Notation`. Both
  change how identifiers *parse*, which makes this Shape driven by Meaning — a genuine
  circularity to resolve. → chunk 4.
- `expectedNamespacesAt` / `predictedContextAt` drive completion from cursor context. Is the
  context prediction generic over roles? → chunk 9.
- `walkTree` is still a whole-file rebuild while the symbol store is incremental. Does the
  generalization make that worse? → chunk 4.
