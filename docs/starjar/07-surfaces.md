# Chunk 7 — Surfaces

*Commands, palette, keybindings, status strip, explorer — and where capability gating
actually attaches. The best-prepared layer in the codebase.*

---

## 1. The gating machinery already exists

`command-catalog.mjs` opens with the architecture, stated by its own author:

> This is DATA only: no `run`, no DOM, no deps. Behaviour is attached later by whoever owns
> it (`Commands.attach(id, { run, when })`), which is what lets `Keybindings` project its
> chord table at load time — long before `app.js` exists — while the palette shows only
> commands that can actually run.

So a command has **two independent halves**:

| Half | Where | Meaning |
|---|---|---|
| declaration | `CATALOG` | id, title, section, scope, chords, `palette` / `keybindable` / `bar` / `ex` / `mx` |
| behaviour | `Commands.attach(id, { run, when })` | what it does, and when it may do it |

And `Commands.list(filter)` narrows by exactly the axes gating needs:

```js
Commands.list({ palette: true, runnable: true, available: true })
//                             ↑ has a run       ↑ when() passes
```

⭐ **A command that nothing attached is automatically absent from every surface.** That is
capability gating in embryo, already load-bearing, already shipped.

---

## 2. Every surface genuinely derives

Measured consumers of the registry:

| Surface | Derives via |
|---|---|
| command palette | `list({ palette, runnable, available })` |
| keybindings sheet | `Commands.defaults()`, `Commands.styleFor()` |
| settings panel | `Commands.get()`, `Commands.describe()` |
| Vim `:ex` commands | `list({ cmdline: true })`, `list({ cmdline, runnable, available })` |
| Emacs `M-x` / macros | `Commands.describe()` |
| status strip | reports `"…" is not available right now.` from the same lookup |

Nothing retypes. The §T correctness pass — which found four shipped lies while the suite was
236/236 green — left behind a real derive-not-retype architecture.

⭐ **\*jar inherits working capability plumbing.** This is the layer that needed the most
design in `PLATFORM.md` and turns out to need the least.

---

## 3. Language coupling in the surfaces

⚠️ **Re-measured 2026-09-10 by importing the catalogue instead of grepping it. The original
figures were wrong and are corrected here.**

| Surface | Coupling |
|---|---|
| catalog | **24 of 156** commands need capability gating (was reported as "7 of 119") |
| status strip (7 files) | **3 lines**, all in `status-strip-view.mjs` |
| explorer (6 files, 2,994 LOC) | **0** |
| library (4,155 LOC) | **0** |

The grep behind the first figure only matched entries whose `id` and `title` sat on one
line, and the catalogue has since grown. The real list, by capability:

| Requires | Commands |
|---|---|
| `proof` | `prover.hole-intro` `prover.hole-split` `prover.hole-fill` `prover.open-in-harpoon` `prover.count-holes` `prover.goal-at-cursor` `harpoon.next-goal` `harpoon.prev-goal` `harpoon.undo-move` `harpoon.redo-move` `view.harpoon` `nav.next-hole` `nav.prev-hole` `set.hole-gutter` `set.hole-emphasis` |
| `proof` + `moveCandidates` | `harpoon.orca-start` `harpoon.orca-pause` `harpoon.orca-absorb` |
| `check` | `run.default` `run.file` `run.here` `run.module` `run.project` `run.clear-output` |

(`edit.split-line` matched the pattern and is plain text editing.)

⭐ **This is better news than the smaller number was**, because the 24 partition cleanly into
three capability groups with no leftovers. `requires` is a mechanical annotation, not a
judgement call. `CATALOG` currently carries **`requires` on 0 of 156** entries — the field
does not exist yet.

And the operations are still not Beluga-specific: "run the project", "split this hole",
"next goal" are universal. Only availability varies.

---

## 4. The gating design

Add one field to the catalog and one filter to `list()`:

```js
{ id: 'run.project', …, requires: ['check'] }
{ id: 'view.harpoon', …, requires: ['proof'] }
{ id: 'harpoon.orca',  …, requires: ['proof', 'moveCandidates'] }
```

```js
Commands.list({ palette: true, runnable: true, available: true, capable: true })
```

Two reasons to prefer an explicit `requires` over simply not attaching:

1. **It explains absence.** The status strip can say *"not available with this assistant"*
   rather than the command silently vanishing. Silence is right for the palette; the
   keybindings sheet should show it disabled with a reason, because a user who reads a
   keymap and finds a gap will assume a bug.
2. **It is checkable.** A declaration can be tested against the provider's capabilities;
   an omission cannot.

⛔ Per "earn the row": `requires` never becomes a visible badge on every row. It surfaces
only where a user would otherwise be confused by an absence.

---

## 5. The gate that must exist

⛔⛔ **A surface may only offer what WORKS** was bought at the cost of four shipped lies
found at 236/236 green: 62 of 74 bindable editor commands were dead keys, two of three Vim
leaders had never worked, the settings panel named two unpressable substitutes, and 41 style
bindings were listed nowhere.

That failure mode does not go away under \*jar — it multiplies, because now the truth varies
per provider. **The projection must be tested, not the model.**

Concrete deliverable, to be built alongside `MockProvider` in week 3:

> **The capability-projection probe.** Given a provider declaring capability set *C*, drive
> the app and assert that no surface — palette, keybindings sheet, settings panel, `:ex`
> table, `M-x` list, status strip, menus — offers any command requiring a capability outside
> *C*, and that every command requiring only capabilities in *C* is reachable from at least
> one surface.

Run it against three synthetic providers: Tier 0 only, Tier 0+2, and full. Three runs catch
every gating bug the architecture can produce.

---

## 6. Two carried questions, closed cheaply

**Parse-error wording is two strings.** `lineSyntaxMessage` in `lint-units.mjs` is:

```js
if (BAD_DOUBLE_DASH_LINE.test(t) && !GAP_PRAGMA_LINE.test(t)) return 'Unknown pragma';
return 'Syntax error';
```

'Unknown pragma' is the only Beluga vocabulary, and Rocq has the analogous concept in
attributes and `Set` options. A two-entry language-pack table. (Chunk 4)

**`prover-captions.mjs` is Orca-adjacent and moves with the pack.** It parses Beluga move
text (`let … = … in`) to build step captions. Since chunk 6 keeps Orca Beluga-only through
December, this relocates to `lang/beluga/` untouched. (Chunk 6)

---

## 7. What chunk 7 changes about the plan

1. **Track B shrinks substantially.** "Capability-gate the registry" was budgeted as weeks
   2–5 of shell delamination. The machinery exists; the work is one catalog field, one
   `list()` filter, and **24 annotations** that partition cleanly into three capability
   groups.
2. **The capability-projection probe replaces it as the real deliverable** and moves to week
   3, beside `MockProvider`. It is the gate that keeps the platform honest.
3. **The explorer, library and status strip need no work.** Zero and three-line coupling
   respectively.
4. **`requires` is declarative and testable** — chosen over silent non-attachment precisely
   so it can be checked.
5. ⚠️ **Measure the catalogue by importing it, never by grepping it.** The first pass reported
   7 of 119; importing `CATALOG` gives 24 of 156. A grep that assumed `id` and `title` shared
   a line silently dropped two thirds of the language-adjacent commands.

---

## 8. Open questions carried forward

- `command-shadows.mjs` (232 lines) arbitrates contested chords between styles. Does adding
  a per-provider dimension disturb the shadow rules? → chunk 10.
- The `bar` flag makes a command reachable by name from the status strip. Is the strip's
  name index derived from the catalog, or built separately? → chunk 8, with persistence.
- `app-menus.mjs` and the context menu: do they derive from the registry, or hand-build
  their items? The audit above found no registry calls from either. **This is the most
  likely place for a shipped lie to survive.** → chunk 8.
