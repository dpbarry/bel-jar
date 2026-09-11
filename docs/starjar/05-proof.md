# Chunk 5 — Proof

*The interactive goal/tactic loop. The chunk with the biggest surprise in it.*

---

## 0. A size correction

`js/harpoon/harpoon-ui.js` (6,779 lines) is a **build bundle** of 12 modules, not source.
Real Harpoon surface source is ~8,050 LOC, not the 14,825 quoted in chunk 0's census.
The prover engine figure (`editor-src/prover/`, 18,122) stands.

---

## 1. The surprise: the shipped prover never uses a proof session

`prover-manual.mjs` is the manual reducer. Its two central functions:

```js
export function movesAt(state, thm) {
  const hole = focusHole(state);
  let moves = candidateMoves(hole, state.code, thm) || [];   // ← Orca's generator
  return moves.filter((mv) => movePrefilterOk(mv, hole, state.code, …));
}

export async function attemptMove(state, mv, oracle, thm) {
  let spliced = spliceAtHole(state.code, hole, mv.text);     // ← edit the SOURCE
  let res = await oracle(spliced);                            // ← re-check the FILE
  …
}
```

So the shipped Harpoon:

1. generates candidate moves **itself**, from BelJar's semantic model,
2. **splices move text into the source program**,
3. asks the backend to **check the whole file**,
4. treats a clean check as certification.

⭐ **The interactive prover runs entirely on Tier 0.** It needs `check()` and nothing else.
No `proofStart`, no `proofTactic`, no backend proof state. This is why `Beluga.ideProof*`
was never implemented and nothing broke: the surface never needed it.

---

## 2. Therefore Proof has two modes, and \*jar must support both

| | **Mode A — splice-and-check** | **Mode B — session verbs** |
|---|---|---|
| Provider requirement | Tier 0 `check()` | Tier 2, the six verbs |
| Move source | the shell (`candidateMoves`) | the backend (`tactics()`) |
| Proof state | shell-owned, text-based | backend-owned |
| Cost per step | **a full re-check of the program** | one tactic call |
| Who has to be smart | the shell | the backend |
| Porting cost | write a move generator (**hard**) | implement/adapt six verbs (**easy**) |
| Used by | Beluga, today | Rocq, Abella, Lean |

**This is the most consequential finding for RocqJar.** Rocq via coq-lsp offers Mode B
essentially for free — it already owns proof state, already has undo, already enumerates
tactics. RocqJar can have a working interactive prover in weeks, without anyone writing a
Rocq move generator.

Meanwhile Beluga is stuck in Mode A, because its session verbs were never built.

⚠️ The consequence is counter-intuitive and worth stating plainly: **RocqJar's interactive
prover is expected to be both easier to build and faster to use than BelJar's**, because
Mode A pays a whole-file re-check per step and Mode B does not.

### The surface renders identically over both

Both modes reduce to the same four operations: *show a goal*, *offer moves*, *apply one*,
*undo*. The reducer already models exactly that (`focusHole`, `movesAt`, `attemptMove`,
`undo`/`redo`, `absorbAuto`). The mode is a **provider capability**, not a second UI:

```js
capabilities: { proof: 'splice' }   // Beluga — needs a move generator
capabilities: { proof: 'session' }  // Rocq — needs the six verbs
```

---

## 3. The goal shape is already generic — and better than the plan's

`harpoon-model.mjs` line 8 states the normalized shape:

```
{ id, label, goal, ctx: [{name, type}], meta: [{name, type}] }
```

with binders tagged by band elsewhere in the file (`where: 'meta'`, `where: 'comp'`).

`PLATFORM.md` §3 proposed `{ id, hypotheses, target, meta: opaque }`, where `meta` was an
opaque escape-hatch blob. **The shipped code is better.** It does not need an opaque blob,
because a proof context is naturally a set of **named bands** of typed binders:

```js
Goal = {
  id, label, target,
  binders: [{ name, type, band }]     // band: 'meta' | 'comp' | …
  bands:   [{ id: 'meta', label: 'Meta-context' }, { id: 'comp', label: 'Context' }]
}
```

| Assistant | Bands |
|---|---|
| Beluga | meta (Δ), comp (Γ) |
| Rocq | one |
| Abella | nominal, hypotheses |
| Lean | one |

⭐ **Adopt the shipped shape; drop the opaque `meta` blob from `PLATFORM.md`.** Bands are
declared by the provider with display labels, and the goal renderer groups by band. This is
a real design improvement that came from reading the code rather than designing on paper.

---

## 4. The move vocabulary splits cleanly

Move kinds emitted by `candidateMoves`:

| Universal | Beluga-specific (LF / contextual) |
|---|---|
| `split` `intro` `fill` `lemma` `var` `impossible` `named` `decl` | `box` `pi` `ctx` `synth` `invert` `index` `obj` `bare` |

Roughly half the vocabulary is the ordinary tactic repertoire any assistant has; the other
half encodes LF boxes, contextual objects, parameter variables and inversion. That split is
the boundary between the generic search frame and `lang/beluga/moves.mjs`, and it matches
chunk 2's finding that Beluga carries a doubled vocabulary most targets will not.

⛔ `pruneOneBranch` — mandatory, per the engine invariants — is a **Beluga coverage-checker
workaround**: splits are emitted with every constructor's arm, and Beluga expects arms its
coverage checker infers impossible to be *omitted*, so the failing arm is dropped and the
move re-verified. Pure language-pack territory. Nothing like it belongs in the frame.

---

## 5. What Rocq's Proof layer must supply

| Piece | Content | Cost |
|---|---|---|
| the six verbs | adapter over coq-lsp's goal/tactic protocol | ~1 week |
| `tactics()` | `intro(s)` `apply` `exact` `destruct` `induction` `rewrite` `split` `auto` `reflexivity` … | ~1 day, data |
| band declaration | one band, label "Context" | trivial |
| move generator | **not needed** — Mode B | zero |

Compare Beluga, which needs no verbs but *does* need a 18k-LOC move generator it already
has. The two languages need almost disjoint work, which is exactly what a two-mode design
is for.

---

## 6. What chunk 5 changes about the plan

1. **`proof: 'splice' | 'session'` joins the capability set.** Second architectural capability
   after `haltsAtFirstError`, and again it decides which platform machinery runs at all.
2. **Mode A is a Tier-0 feature.** An assistant with nothing but a file checker can still get
   an interactive prover, given a move generator. That is a genuinely novel claim for the
   `PROVIDER.md` contract and worth stating loudly: *\*jar can give a proof surface to an
   assistant that has no proof API whatsoever.*
3. **The Goal gains bands and loses the opaque blob.** `PLATFORM.md` §3 is superseded.
4. **RocqJar's prover is re-classified from hard to easy**, and moves earlier in the
   schedule. It no longer depends on Orca work of any kind.
5. **Harpoon's real source is ~8k, not ~15k.** Chunk 0's census over-counted by a bundle.

---

## 7. Open questions carried forward

- `absorbAuto` merges an Orca run into the manual stack ("identical step shape"). Does that
  shape survive Mode B, where steps are backend-owned and not text splices? → chunk 6.
- `harpoon-anchor.mjs` (183 lines) ties a session to a source location. Under Mode B the
  backend owns position; does the anchor still hold? → chunk 6.
- `harpoon-lab-tree.mjs` / `-reel` / `-display` (~1,900 LOC) render proof history. Is that
  rendering over the step shape, or over Beluga text? → chunk 9.
- `spliceAtHole` needs to know how to write a hole into source. That is per-language syntax
  (`?u`, Rocq's `admit`/`shelve`). → chunk 9.
