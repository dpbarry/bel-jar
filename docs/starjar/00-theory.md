# \*jar — the theory

*The frame every chunk of the analysis hangs on. Deliberately small.*

---

## The Four Needs

A proof-assistant IDE needs exactly four things from its language. Everything BelJar does is
a projection of one of them.

| # | Need | Question it answers | Where it comes from today |
|---|---|---|---|
| 1 | **Shape** | How does source text become a tree? | `beluga.grammar` (lezer), in-browser |
| 2 | **Meaning** | Which tree nodes are named entities, what kind, what scope? | JS symbol store, in-browser |
| 3 | **Judgment** | Is this correct, and if not, where and why? | the Beluga backend |
| 4 | **Proof** | What are the open goals, and what may I do to them? | the Beluga backend |

Every feature is downstream of these:

- Shape gives highlighting, folding, structural motion, formatting primitives.
- Shape + Meaning give outline, go-to-definition, find-references, rename, the name-level
  dependency graph, completion candidates, the explorer.
- Judgment gives diagnostics, gutter marks, health dots, the settlement, check scheduling.
- Proof gives Harpoon, and Proof + a move generator gives Orca.

**A capability tier is just a statement about which Needs a provider can serve.**

---

## The load-bearing consequence

**Needs 1 and 2 do not touch the backend.** BelJar computes shape and meaning entirely in
JavaScript, from the grammar. It never asks Beluga what the symbols are. This is the
"BelJar is the intelligence, not a wrapper" law made concrete and measurable.

Two things follow, and both matter for the December deadline:

1. **A new language's Shape + Meaning layer can be built before its backend exists at all.**
   Grammar work and backend work are fully parallel, with zero dependency between them.
   RocqJar can have navigation, outline, rename, the explorer and the dependency graph
   working against real `.v` files while the Rocq provider is still a stub.

2. **The provider interface only ever has to serve Needs 3 and 4.** That is why it comes out
   as small as it does. Shape and Meaning are language-pack data, not provider calls.

---

## The chunk sequence

Analysis proceeds one chunk per pass. No chunk starts before the previous is written down.

| # | Chunk | Covers |
|---|---|---|
| 1 | **The boundary** | every channel between shell and assistant |
| 2 | **Shape** | grammar, tokens, the parser seam, what a Rocq grammar must supply |
| 3 | **Meaning** | NAMESPACE, node→kind mapping, scope rules, the incremental store |
| 4 | **Judgment** | diagnostics, the prose channel, settlement, scheduling, health |
| 5 | **Proof** | the Harpoon surface, the six verbs, tactic vocabulary |
| 6 | **Search** | Orca frame vs per-language move generators |
| 7 | **Surfaces** | commands, palette, status strip, explorer, capability gating |
| 8 | **Workspace** | projects, `.cfg`, multi-file, persistence |
| 9 | **Presentation** | `format/`, `graph/`, hover, inspector |
| 10 | **Distribution** | bundling, provider loading, OSS packaging |

---

## The compensation principle

*Added after chunk 8, which made the pattern unmistakable.*

Three architectural capabilities emerged from three consecutive chunks:

| Capability | The machinery compensates for | Chunk |
|---|---|---|
| `haltsAtFirstError` | the checker reports only one error per run | 4 |
| `proof: 'splice'` | the backend has no proof API at all | 5 |
| `project: 'concatenative'` | the backend cannot resolve imports | 8 |

> **\*jar's platform machinery is largely a library of compensations for weak backends.**
> Settlement's 8-pass divide-and-conquer, the splice-and-check prover, and the concatenative
> prelude are elaborate workarounds BelJar built because Beluga could not do something. A
> capable backend turns each of them off.

Consequences:

1. **The platform gets easier as backends get stronger.** RocqJar is not "BelJar plus work" —
   it is BelJar with several of its hardest subsystems switched off.
2. **BelJar is near the worst case in the family**, which is the right place to generalize
   from. Every compensation already exists and is already tested.
3. **The compensations are the platform's real intellectual property.** An assistant with a
   weak backend still gets a full IDE, because \*jar carries the workarounds. That is a far
   stronger claim than "we support many languages."
