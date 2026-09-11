# Chunk 8 — Workspace

*Projects, `.cfg`, multi-file checking, persistence. Contains the biggest structural
mismatch in the whole analysis, and the insight that reframes the platform.*

---

## 0. A significant size correction

Chunk 0's census counted `.mjs` sources **and** their built `.js` duplicates. Excluding every
bundle and every `.js` that has a `.mjs` sibling:

| | LOC |
|---|---|
| previously quoted | 134,638 |
| **true hand-written source** | **~102,900** |

~31,700 lines of built duplicates were counted as source. **Every estimate in these documents
shrinks by roughly 23%**, including the refactor scope in `PLATFORM.md` and the per-chunk
budgets. `persist/` is 5,576 not 10,308; `workspace/` is 1,564 not 3,165.

---

## 1. The project model: concatenation

`assembleCheckerCode(fileCode, prelude)` is the heart of it. BelJar checks a file by:

1. `orderBelPaths(belPaths, cfgByDir)` — the `.cfg` supplies a **linear load order**,
2. `preludeFilesFor(files, activeId, …)` — the prelude is **every preceding file**,
3. concatenating prelude ++ file into **one text blob**,
4. hoisting global pragmas to the very top (Beluga only honours them there),
5. checking that blob,
6. mapping diagnostics back through `fileOffset` / `offsetLines` bookkeeping.

The comments show what this cost to get right: blanking pragmas *in place* rather than
deleting them, so "an error on the schema" stops landing "on the blank line below it."

This is a **whole-program-text** model. It exists because Beluga has no separate compilation
and no import resolution — the only way to give a file its context is to paste the context in
front of it.

---

## 2. Rocq does not work this way, at all

| | Beluga | Rocq |
|---|---|---|
| dependency declaration | `.cfg` file order | `Require Import Foo.Bar` |
| dependency structure | **linear list** | **name-resolved graph** |
| artifacts | none | `.vo` compiled files |
| how a file gets its context | shell concatenates the prelude | **backend resolves the load path** |
| what the shell sends | prelude ++ file, plus offset math | the file |

⭐ **This is the single biggest structural mismatch found in the analysis.**
`assembleCheckerCode`, `preludeFilesFor`, `orderBelPaths`, the pragma hoisting, the offset
bookkeeping, and `compress-development.mjs` are all Beluga's answer to a problem Rocq does
not have.

So the third architectural capability:

```js
capabilities: { project: 'concatenative' }  // Beluga — the shell assembles the text
capabilities: { project: 'resolved' }       // Rocq   — the backend resolves imports
```

Under `'resolved'`, the entire prelude machinery is **skipped**, along with its offset
mathematics and its interaction with settlement's `MAX_PASSES_PRELUDE_FLOOR`.

---

## 3. ⭐ The insight this reveals

Three architectural capabilities have now emerged, one per chunk:

| Capability | What the machinery compensates for | Chunk |
|---|---|---|
| `haltsAtFirstError` | the checker reports only one error per run | 4 |
| `proof: 'splice'` | the backend has **no proof API at all** | 5 |
| `project: 'concatenative'` | the backend cannot resolve imports | 8 |

The pattern is not a coincidence.

> **\*jar's platform machinery is largely a library of compensations for weak backends.**
> Settlement's 8-pass divide-and-conquer, the splice-and-check prover, and the concatenative
> prelude are all elaborate workarounds BelJar built because Beluga could not do something.
> A capable backend **turns each of them off**.

Three consequences, and they are the most important strategic findings so far:

1. **The platform gets easier as backends get stronger.** Rocq is expected to disable all
   three. RocqJar is therefore not "BelJar with more work" — it is BelJar with several of
   its hardest subsystems switched off.
2. **BelJar is close to the worst case in the family**, which is the correct direction to
   generalize from. Every compensation already exists and is already tested.
3. **The compensations are the platform's real intellectual property.** A future assistant
   with a weak backend gets a full IDE anyway, because \*jar carries the workarounds. That is
   a much stronger product claim than "we support many languages."

This belongs in the theory document, not just here.

---

## 4. Two different cross-file problems

The prelude answers *check-time* context. It does **not** answer *navigation-time* context,
which is a separate mechanism: `findProjectDefinition(files, activeId, name, getText, …)`,
`usesOf`, `defsOf`, `groupFilesFor`, `referenceGroupFilesFor`.

| Problem | Beluga | Rocq | Generalizes as |
|---|---|---|---|
| check-time context | concatenate prelude | backend resolves | **capability** |
| navigation-time resolution | scan project files by text | resolve `Require Import` + qualified names | **language pack: an `imports` function** |

⚠️ Under `project: 'resolved'` the shell still needs its own import model for go-to-definition
across files, because the backend is not consulted for navigation (chunk 3: Meaning never
calls the backend). Rocq's module qualification (`Nat.add`, `Import` aliasing) makes this
non-trivial and it is **not** covered by the capability switch.

This is the one place where `'resolved'` costs work rather than saving it.

---

## 5. The shipped lie, located

Chunk 7 flagged menus as the likely surviving derive-not-retype violation. Confirmed:

`js/editor-src/ide/context-menu.mjs` **hand-builds every item** — `label: 'Undo'`,
`'Redo'`, `'Cut'`, `'Copy'`, `'Paste'`, `'Select All'`, `'Find…'`, and
**`'Open in Harpoon…'`**. No registry calls. `app-menus.mjs` likewise hand-builds its menu
ids with no `Commands.list`.

⛔ `'Open in Harpoon…'` is exactly a capability-gated item. Under a provider with no proof
support it would present a dead affordance — the precise failure mode
[feedback-surfaces-must-derive-not-retype] exists to prevent, surviving in the one surface
the §T pass did not reach.

**Fix before delamination, not during.** The context menu and the app menus must derive from
the registry, and the capability-projection probe (chunk 7 §5) must cover both.

### Update 2026-09-10 — half fixed

`context-menu.mjs` now resolves its *shortcut labels* through the registry
(`Commands.liveChord(id)`, with a ⛔ note that `labelFor` answers a different question). The
**item list is still hand-built**, and it has gained another language-specific entry,
`'Introduce'` (`runIntro`, i.e. `%:intro`), alongside `'Open in Harpoon…'`.

⭐ The distinction is worth keeping: **what a menu SAYS about a chord now derives; what a menu
OFFERS still does not.** Only the second one produces dead affordances under a provider
without `proof`, so the remaining half is the half that matters.

---

## 6. Persistence is language-neutral

`persist/` (5,576 LOC) covers files, projects, layout, open tabs, settings, UI prefs, graph
prefs and edit history. Chunk 0 measured 42 language-adjacent hits across it, and the
`.cfg`-specific handling is isolated in `app-suite-cfg.mjs` (256), `cfg-editor.mjs` (346) and
`cfg-lint.mjs` (129) — 731 lines total.

⛔ The existing law stands and generalizes unchanged: a within-suite-dir file operation keeps
the project manifest in sync; a **cross-directory move must never touch it**. For Rocq the
manifest is `_CoqProject` rather than a `.cfg`, but the rule is identical.

The project-manifest layer is therefore a ~731-line language pack artifact, and everything
else in `persist/` is inherited.

---

## 7. What chunk 8 changes about the plan

1. **All size estimates drop ~23%.** True source is ~103k LOC.
2. **`project: 'concatenative' | 'resolved'` joins the capability set** — the third and
   largest architectural switch.
3. **The compensation-library framing goes into `00-theory.md`.** It reframes the product
   claim and the porting cost model.
4. **A language pack needs an `imports` function** for cross-file navigation, independent of
   the project capability. This is new scope not in `PLATFORM.md`.
5. **Menus must be brought onto the registry before Track B**, and the projection probe must
   cover them.

---

## 8. Open questions carried forward

- `compress-development.mjs` builds a compressed checker code for large projects. Is it a
  latency optimisation only, or does correctness depend on it? → chunk 9.
- `prover-corpus-decls.mjs` (471) indexes the corpus for lemma suggestions. Under
  `project: 'resolved'`, is the equivalent a provider `Search` call? → chunk 9.
- `belugaCheckFingerprint` / `blockSpineEqual` decide when a re-check is needed. Do they
  survive `project: 'resolved'`, where the prelude is not part of the checked text? → chunk 9.
