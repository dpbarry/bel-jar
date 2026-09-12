# Phase 0 — instrumentation and truth

*Execution record. Started 2026-09-10.*

| # | Item | Status |
|---|---|---|
| 1 | Purity lint | ✅ **done** — `tests/test-starjar-purity.mjs` |
| 2 | The role pilot | ✅ **done** — result below; the hypothesis is falsified |
| 3 | Shell differential | ✅ **done** — `scripts/shell-differential.mjs`, `npm run diff:shell` |
| 4 | Fix the menus | + **done** — the context menu derives; `app-menus` needed nothing |
| 5 | The prefix decision (F25) | ✅ **done** — `bel-` and `bj-` → `jar-`, 1,796 sites |

---

## 1. The purity lint — the ratchet

`tests/test-starjar-purity.mjs`, auto-discovered by `run-all.mjs`, runs in 0.1s.

Four dimensions, each may only go **down**:

```
node=1416  ident=568  css=177  ext=100
```

⭐ **Verified to fire.** A fake `'LFDatatypeDeclaration'` added to `quiet-typing.mjs` failed
the gate at 1417 and named the three densest files; removing it restored 1416. (Per the law:
a component that never fires cannot be told from one that is worthless.)

⚠️ Two baselines differ from the ad-hoc greps in `FILES.md`, and **the gate is authoritative**:

| Dimension | FILES.md | Gate | Why |
|---|---:|---:|---|
| identifiers | 600 | **568** | the gate requires a character after "Beluga", so a bare mention in prose is not an identifier |
| extensions | 79 | **100** | the gate also counts `'.elf'` |

This is the third time a hand-rolled grep and a written-down instrument have disagreed
(F6, F11, F21). **The gate owns the definition from here.**

⛔ It measures **structural** coupling only (F17) and is near-blind on `prover/`, where
26,680 LOC of Beluga generation carries 73 node sites. A low number never means
language-neutral.

---

## 2. The role pilot — `ide/sticky-decl.mjs`

62 node sites, 351 LOC, no semantic subtlety, clean in git, covered by
`test-format-let-sticky.mjs`, `test-sticky-ws-prefs.mjs` and `probe.mjs`.

### What the sites actually are

| Bucket | Sites | Reduces to |
|---|---:|---|
| `BREADCRUMB_NODES` membership | 24 | ✅ a role — `crumb` |
| identifier / keyword checks in helpers | 2 | ✅ roles — `identifier`, `keyword` |
| `crumbSpan` dispatch arms | 24 | ⚠️ a **strategy table**, not a role |
| `REDUNDANT_WHEN_CHILD` pairs | 6 | ❌ a **pairwise relation** between node names |
| token-name arguments | 6 | ❌ concrete tokens: `FatArrow`, `CaseKeyword`, `FunKeyword`, `InKeyword` |

### The verdict

| Reduction | Sites | Share |
|---|---:|---:|
| to a pure role | 26 | **42%** |
| to a role *or* a pack strategy table | 50 | **81%** |
| irreducible per-language data | 12 | 19% |

⛔ **Chunk 2's threshold was 80% clean reduction to roles. The pure-role hypothesis reaches
42%. It is falsified — in week 1, exactly as the pilot was designed to do.**

### The three escape hatches

**E1 — Pairwise node relations.** `REDUNDANT_WHEN_CHILD` says *drop `RecDeclaration` when
`RecBody` is also on the path*. That is a relation between two names; no per-node role can
express it. Six pairs, pure language-pack data.

**E2 — Per-node extraction strategies.** The 24 `crumbSpan` arms are not 24 behaviours —
they are **six strategies** applied to different nodes:

```
beforeToken('FatArrow')             CaseBranch, CofunctionBranch, FnExpression, MLamExpression
beforeAnyToken(['=', 'InKeyword'])  LetExpression
keywordLabel('CaseKeyword','case')  CaseExpression
keywordLabel('FunKeyword','fun')    CofunctionExpression
identChild                          LFConstructor, CompConstructor, CompDestructor
headIdent                           14 declaration nodes
```

**E3 — Concrete token names** as strategy arguments (`FatArrow`, `InKeyword`, …). Roles do
not reach into a node's children; the strategy has to name what it looks for.

### What the pilot settles

⭐ **The escape hatches are the same shape chunk 3 found independently in `doNamesWalk`.**
There, the dispatch generalized and the *binder extractors* did not. Here, membership
generalizes and the *crumb strategies* do not. Two unrelated files, same answer:

> **The language pack is a module of tables — roles, strategies, and relations — not a flat
> `nodeName → role` map.** `PLATFORM.md` §5 already describes it that way; §6 does not, and
> §6 is what needs correcting.

The good news is that E2's strategies are a **small closed set**, and a strategy is
parameterised data rather than arbitrary code — `beforeToken('FatArrow')` ports to Rocq as
`beforeToken('Dot')` with no platform change. The 81% figure is the one that matters for
scheduling: four in five sites become pack data, and the remaining fifth is six pairs and
four token names.

### What was not done

The file was **not rewritten**. The pilot's question — does the role abstraction reach, and
what breaks it — is answered by classifying every site against its actual code path, which is
contact with the code rather than a text census. A conversion would additionally prove the
rewritten form compiles and passes its three tests; it would not change the design decision,
which is now settled. The conversion is Phase 1 work.

---

## 3. The shell differential — the gate

`scripts/shell-differential.mjs` · `npm run diff:shell` · `npm run diff:shell:record`

Digests five stages per corpus file and compares against a committed golden:

```
parse  →  blocks  →  definitions  →  uses  →  local diagnostics
```

| | |
|---|---|
| corpus | `library/data` — **265 files**, in-repo and stable |
| runtime | **~2s** |
| golden | `tests/golden/shell-differential.json`, 76K |
| baseline | 759,471 nodes · 3,574 blocks · 5,516 defs · 115,450 uses · 273 parse-errors |

⛔ **Not `Beluga-W`.** It carries 581 `.bel` files but it is a submodule whose pin moves —
it was repinned in the last commit — so a golden keyed to it would invalidate on every bump.
`--corpus <dir>` points elsewhere when wanted.

⭐ **Verified to fire.** Appending four lines to `builtins/nd-first-order.bel` produced:

```
  1 file(s) drifted. By stage:
    parse 1   blocks 1   defs 1   uses 1
    builtins/nd-first-order.bel  [parse,blocks,defs,uses]  nodes 911→942 defs 25→26 uses 170→174
```

— and correctly left `diags` unmoved, because the added code parses cleanly. Restoring the
file returned all 265 to identical.

⭐ **The stage breakdown is the whole point.** A 1,416-site conversion that reports "N tests
failed" tells you nothing; this says *which file* and *which stage*, and the earliest moved
stage is where the regression is — everything after it is downstream noise.

Deliberately **not** in `npm test`: it must fail loudly during legitimate grammar work rather
than block every iteration. Run it before and after each delamination step, the way
`prover:diff` was used.

---

## Next

(Item 4 is done — see SS4 below.)

---

## 4. The menus

### `context-menu.mjs` — now derives

Added one gate, `offerableIds()`, as the single place deciding whether the menu may OFFER a
command: rows declare `commandId`, and a row whose command the registry does not know, has no
`run` attached, or whose `when()` says no is **dropped, not disabled**. `keepOfferable()` then
tidies the separators the drops strand, so a gated-away group leaves no visible seam.

⭐ Under \*jar this is where capability gating lands: a provider without proof support leaves
every `prover.*` command unattached and the Prove group is simply not offered.

**Eleven labels were retyped duplicates of catalogue titles** and now derive:
`Undo` `Redo` `Cut` `Copy` `Paste` `Select All` `Find...` `Go to Definition` `Find References`
`Rename Symbol` `Format Document`.

⚠ **Four labels deliberately differ and were kept**, with the reason in the code:
`Open in Harpoon...` `Introduce` `Split on N` `Fill`. Right-click already names the hole, so
the catalogue's palette-oriented wording (`Open Hole in Harpoon`, `Intro at Hole`) would
repeat it. **The id gates the row; the wording is contextual.** Deriving these would have been
the wrong kind of consistency.

### `app-menus.mjs` — needed nothing, and chunk 8 over-claimed

Chunk 8 reported that it "likewise hand-builds its menu ids with no `Commands.list`". True,
but the consequence drawn from it was wrong: **it has zero capability-gated rows.** Its 49
labels are parameterised file and project operations (`Download "foo.bel"`,
`Delete 3 files...`, `Close 2 tabs`) which are not command fronts at all, plus six `run.*`
rows -- and `run.*` needs only `check`, which is Tier 0 and mandatory for every provider.

⛔ The dead-affordance risk was entirely in `context-menu.mjs`. Deriving app-menus' labels
from the catalogue would be *wrong*, not merely unnecessary, because their text is genuinely
contextual.

### Known gap, deliberately not closed

Three context-menu rows front no registry command at all: **Reveal Binder**, **Inspect**,
**Show Dependency Graph**. They are therefore unreachable from the palette, the keymap and
`M-x`. That is a real derive-not-retype gap, but closing it means *adding catalogue entries* —
a product decision about what belongs in the command layer, not a Phase 0 instrumentation fix.
Logged here rather than silently widened.

### Verification

`npm run lint` clean, `npm run diff:shell` 265 identical, `npm test` **250/250**,
`npm run probe:app` **ALL OK** (127 checks).
(Item 5 is done — see §5 below.)

---

## 5. The prefix migration — `bel-` and `bj-` → `jar-`

**Decision:** finish the half-migration, but not to `bj-`. "BelJar" means *Beluga jar*, so
`bj-` encodes the language exactly as `bel-` does and would bake it into the platform's CSS
namespace permanently. Both go to **`jar-`**: one namespace, language-neutral, done once.

This is the standing rule in `PLATFORM.md` applied to a concrete choice — where an option
makes today easier but ∗jar narrower, the platform wins.

### Scope

| Area | sites |
|---|---:|
| `css/` | 924 |
| `js/` (sources) | 512 |
| `scripts/` | 313 |
| `tests/` | 47 |
| **total** | **1,796 across 101 files** |

370 distinct stems (160 `bel-`, 210 `bj-`). ⭐ **Zero collisions** — the two namespaces were
disjoint, so merging them could not silently fuse two different classes.

### Three hazards, all caught before applying

1. **`bel-jar`** — 17 occurrences of the repo name, used as a log tag (`[bel-jar:jump]`).
   Excluded with a lookahead; 5 remain in sources, untouched.
2. **Word boundaries** — `label-foo` contains "bel-foo". Every pattern is ``-anchored.
   The purity gate briefly lost its boundaries to a shell-escaping slip and had to be
   rewritten; it now carries a comment saying why they are there.
3. **Filenames** — the rename rewrote *import paths* but not the files they point at.
   `npm run build:shell` failed on `./ui/jar-toggle.mjs`, and `js/ui/bj-dropdown.mjs` and
   `bj-toggle.mjs` were renamed to match. ⭐ **The build caught what grep could not.**

Build outputs were excluded from the rewrite and **regenerated** (`build:editor`,
`build:shell`) rather than edited, so the bundles are a real build of the new sources.

### Verification

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run diff:shell` | **265 files identical** |
| `check-build-stale` | up to date |
| `npm test` | **250/250** in 99.9s |
| `npm run probe:app` | **ALL OK**, 127 checks |
| `npm run probe:harpoon` | ALL OK |
| `npm run probe:holes` | ALL OK |

⭐ The differential staying identical is the expected result, not a weak one: a CSS-class
rename must not move parse, blocks, defs, uses or diagnostics. **The probes are what actually
verified this**, because they query the live DOM by class — which is exactly why a class
rename needs a Chrome gate and not just a unit suite.

### The ratchet moved

`cssClasses` drops from 177 to **0**, and its pattern now matches *both* legacy prefixes, so
reintroducing either fails the build. Verified by adding `'bj-oops'` and watching it fire.

```
starjar purity: node=1416 ident=568 css=0 ext=100
```
