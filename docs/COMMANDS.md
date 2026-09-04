# Commands and keys — the working contract

**This is the page to read when you are adding or changing a command.**
[`modal-editing.md`](modal-editing.md) is the 2,300-line *record* of how the layer was built;
this is the short answer to "what do I do."

One rule underneath everything:

> **A surface may only offer what actually works.** Every list, sheet, dropdown and help
> sentence in this layer is DERIVED from a table, never retyped beside one. Every bug this
> layer has ever had was a place where something was retyped.

---

## The shape

```
js/commands/
  command-catalog.mjs    METADATA for all 148 commands. Data only: no run, no DOM, no deps.
  command-registry.mjs   define() + attach(); `window.Commands`. Everything else projects it.
  command-settings.mjs   29 preferences as commands → 55 `:set` names, one table.
  command-names.mjs      id → M-x name, ex aliases, fallback title.
  command-shadows.mjs    what a style takes, and what to press instead.
  command-context.mjs    which surface owns the keyboard right now.

js/ui/keybindings.mjs    chord table. A PROJECTION of `keybindable: true` entries.
js/ui/command-palette.mjs · available-macros.mjs
js/status-strip/         the strip, and the command line inside it.

js/editor-src/ide/
  editor-commands.mjs    BEHAVIOUR for editor-scope commands (motions, edits, nav).
  keymap-style.mjs       the assembler: style name → CodeMirror extensions.
  modal/
    style-policy.mjs     which style owns which chord; which style has focus. Memoized.
    vim-runtime.mjs      what makes Vim work: guards, chrome, the `:` seam, `:` names.
    emacs-runtime.mjs    what makes Emacs work: substitutes, chain badge, guards, chrome.
    vim-setup.mjs        the Vim maps (`gd`, `]h`, the leader) + text objects.
    emacs-setup.mjs      the Emacs maps (`C-x`, `C-c`) and the declined chords.
    style-macros.mjs     those maps as DATA, so a surface can list them.
    which-key.mjs        pure: what can follow a pending prefix.
    which-key-hint.mjs   the same, named through the registry.
    reserved-chords.mjs  the MEASURED table of what the browser takes.
    undo-route.mjs       undo/redo through BelJar's history first.
```

---

## Adding a command

**1. Metadata → `js/commands/command-catalog.mjs`.**

```js
{ id: 'nav.next-lemma', title: 'Go to Next Lemma', section: 'Navigate',
  scope: 'editor', palette: true, keybindable: true, ex: ['lnext'] }
```

| field | what it buys you |
|---|---|
| `id` | stable, dotted, domain-first. The **only** thing the two halves share. |
| `scope` | `global` (window keydown listener) or `editor` (CodeMirror keymap). |
| `palette` | appears in the palette's `>` list. Motions set this `false` — nobody searches a palette for "move left". |
| `keybindable` | appears in the Keybindings sheet and can take a chord. |
| `cmdline` | default `true`; set `false` to stay off the `:` line. |
| `ex` | `:` aliases. `mx` is derived (`nav.next-lemma` → `beljar-nav-next-lemma`). |
| `defaultSpec` | ship one **only where a real convention exists**. Inventing chords is how a keymap ends up fighting the user's own. |
| `styles` | per-style policy: `always` · `yield` · `insert-only` · `off`. |

**2. Behaviour → wherever the action lives.**

- Shell-side: `js/app/app-command-palette.mjs`, via `on(id, run, when)`.
- Editor-side: `js/editor-src/ide/editor-commands.mjs` — add to `EDITOR_COMMANDS` (a plain
  CodeMirror command) or `CUSTOM_COMMANDS` (anything needing the semantic model).

**3. That is all.** You now automatically have:

- a palette row · a Keybindings row that can take any chord · a `:` name and `:BJ` fallback
  · an `M-x` name · a which-key row if it is behind a prefix · a place in Available macros
  · correct shadow text under Vim and Emacs.

**4. If it should have a Vim or Emacs key**, add one line to `NORMAL_MAP` / `LEADER_MAP` in
`vim-setup.mjs` or `CX_MAP` / `CC_MAP` in `emacs-setup.mjs`. Those are `[keys, id]` pairs, so
which-key and Available macros pick it up with no further work.

---

## The invariants, and the test that holds each one

| invariant | held by |
|---|---|
| Every catalogue id has behaviour, and every behaviour has a catalogue entry | `test-editor-commands.mjs` |
| **Every bindable editor command RUNS when bound** | `test-editor-chords.mjs` + `probe:keymap` |
| A chord with no runner is skipped, never emitted dead | `test-editor-chords.mjs` |
| Style policy in the catalogue matches the live keymap | `test-command-catalog.mjs` |
| Every `:set` name maps to a real Persist accessor | `test-command-settings.mjs` |
| Every substitute the reserved-chord sheet names is actually bound | `probe:keymap` |
| Every Vim/Emacs map fires when pressed (with a dead-chord CONTROL) | `probe:keymap` |
| **Every leader the settings panel offers actually works** | `probe:keymap` |
| Style maps are listed, with the live leader | `test-style-macros.mjs` + `probe:keymap` |
| A shadowed row wears a one-word tag, never a second line | `probe:keymap` |
| **A tag means the CHORD is contested, and names the other claimant** | `test-command-shadows.mjs` + `probe:keymap` |
| No row in Available macros is a dash | `probe:keymap` |
| Style options are nested under Editing style, and hidden otherwise | `probe:keymap` + `probe:app` |
| Every substitute the style passage names comes from the measured table | `probe:keymap` |
| A window opened from Settings is actually on top | `probe:app` |

Gates: `npm test` (Node, ~90s) · `npm run probe:app` (routine, ~25s) ·
`npm run probe:keymap` (this layer, deep).

---

## ⛔ The four traps this layer keeps falling into

**1. A list that is retyped instead of derived.**
The settings panel's Emacs help sentence was hand-written beside the measured chord table.
When the table was measured, the sentence stayed: it went on naming `Ctrl+L` as reserved (it
is not), offered `Alt+L` as a substitute (nothing binds it), and offered `Ctrl+Shift+W` for
kill-region — a chord that is itself reserved and can never be pressed. Two of the three
substitutes the panel promised were wrong, in the one place a user reads before choosing
Emacs. It is derived from `emacsFidelity()` now. **Do not retype a table into prose.**

**2. A projection that drops half of what it projects.**
`buildEditorKeymap` walked all 74 editor-scope commands, built a keymap entry for each bound
chord, then looked the id up in a table of *twelve* hand-written runners. The other 62 —
every motion, every selection twin, the line edits, the nav and prover verbs — found nothing
and returned false. The sheet accepted the chord, the panel displayed it, and the key did
nothing. `npm test` was green at 236/236 the whole time, because no test had ever built the
keymap. The rule lives in the projection now: named runner, else `opts.fallback(id)`, else
**no entry at all**.

**3. A preference the keymap never reads.**
The Vim leader dropdown wrote a preference and nothing re-mapped until reload — while
which-key immediately began advertising the new leader. The setting and the keymap
disagreed, silently. Worse, **two of the three leaders offered had never worked at all**:
`matchCommand` takes `matches.full[0]` and never waits, so a leader that is itself a complete
vim command can never be a prefix, and `,` is `repeatLastCharacterSearch` while `<Space>` is
`keyToKey`→`l`. (A literal space is also spelled `<Space>` in a vim keymap, so `' f'` matched
no keypress that exists.) BelJar takes the key from vim now and hands it back when the leader
moves off it — which is what real vim's `mapleader` does. `activeVimOptions()` reports what is
**mapped**, as distinct from what is stored; that distinction is what made the bug invisible.

**4. A binding nobody can discover.**
Vim's 16 normal maps, its 10 leader maps and Emacs' 15 chains were real and invocable and
appeared in **no listing anywhere** — not the Keybindings sheet (it projects `Keybindings`,
which has never heard of them), not the palette (it lists commands, not keys), not Available
macros. Which-key was the only way in, and which-key answers a prefix you already knew to
press. `style-macros.mjs` exports them as data; Available macros leads with them.

---

## ⛔ What a tag means

A tag beside a command's name exists for **exactly one reason**:

> **The chord on this row is claimed by something other than this row** — and the tag names the
> other claimant.

It is computed from the CHORD, never from the command. Three kinds, and only three:

| kind | when | says |
|---|---|---|
| `shadowed` | the chord on this row is taken by the style | *"Emacs uses Ctrl+F for forward-char."* |
| `shadowing` | this row's chord is the STYLE's own, and base gives it to another command | *"Emacs uses C-s here. In Standard, C-s is Save Now."* |
| `insert` | the chord works, but only while you are typing | *"Only while you are typing. In Normal mode, press u."* |

⛔ **Never a sentence about a keymap you are not using.** The tag used to be keyed by command and
say *"This is an Emacs macro. Without Emacs, Redo is Ctrl+Y."* It appeared on `Redo — C-S-z` and
`Find… — C-s`, neither of which collides with anything, and said nothing on the seven chords Emacs
genuinely takes.

Each surface says which chord it is about to display and gets the answer for that one:

- **Keybindings sheet** shows BelJar's own chord — it is where you rebind — so `Find… [shadowed]
  Ctrl+F` reports that Ctrl+F is taken.
- **Available macros** shows the chord that WORKS. Every chord it prints is free, so under Emacs
  it wears no tags at all. Ask for this reading with `describe(id, { showing: 'style' })`.

The tables live in `command-shadows.mjs`: `STYLE_TAKES` (chords a style takes, and what it runs
with each), `STYLE_CHORDS` (the chord a style binds for a BelJar command), `INSERT_ALTERNATIVE`
(the Normal-mode key for an Insert-only chord). Matching is on the chord SPEC, so a collision
follows a rebind — move Find… off Ctrl+F and the tag moves to whatever now sits there.

⚠ `specFromStyleKey()` must parse both spellings (`C-s` and `Ctrl+O`); an unparsed chord reads as
"no collision", which is a silent false negative in the case the tag is named for. A chain
(`C-x h`) returns '' on purpose. And `shadowing` requires `fromStyle` — two BASE commands sharing
a chord is a keybinding conflict, not a style shadow.

---

## ⛔ The Keys settings panel — the shape and why

```
KEYS                                    Available macros   Reset
─────────────────────────────────────────────────────────────────
Editing style  ⓘ                                        [ Vim  ▾ ]
   │ Leader key                                 [ Backslash \  ▾ ]
   │ Yank to system clipboard                              (   ●)
   │ Leave Insert with                          [ Escape only ▾ ]
Status strip                                        [ Standard ▾ ]
GESTURES
Double-tap a modifier · command · speed
[ the keybindings sheet ]
```

Three rules hold this together, and each replaced something that read wrong:

**1. An action that opens a window belongs in the panel HEAD, beside Reset.**
Not in a settings row with a button in the control column — nothing about it is configured, so
a row makes it read as a setting whose control happens to be a button. The head is already the
panel's action strip.

**2. ⛔ A window opened from Settings must leave Settings first.**
A modal `<dialog>` lives in the browser's **top layer**, which no `z-index` can beat, and
`FloatingWindow` tops out at 4000 *"below modal dialogs"* by design. A button in Settings that
opened a floating window opened it **underneath Settings** — it looked like a dead button, and
it shipped that way. `leaveSettingsAnd()` closes the dialog, waits out the transition, then
runs. The probe does not check that the window *opened*; it checks the window is the topmost
element at its own coordinates, because "open" was always true.

**3. ⛔ A style's options are SUBORDINATE to the style row, not a section beside it.**
They exist only because Editing style says Vim. Under their own section head they read as a
standing part of the app that happens to be irrelevant, and under Standard they were three dead
rows advertising a mode you are not in. `addSubordinateGroup()` nests and indents them under
the row that causes them; `paintStyleRows()` shows exactly one group and nothing under Standard.
Emacs has **no** preference worth inventing, and an empty group is not a gap to fill — Emacs is
modeless by design.

Settings search indexes a nested row under its owning style ("Leader key" reads as *Vim*) and
**only while that group is showing** — a search result you cannot act on is worse than none.

**What the ⓘ passage carries.** It absorbed two rows that had no business being rows: the
reserved-chord table and Full keyboard. "The browser takes four of your chords" is not something
you configure — it is something to know *before* you pick Emacs, which is exactly where the
passage is. Every chord and substitute in it is **derived from the measured table**, and
`probe:keymap` walks `reservedChordFacts().rows` asserting each pair appears verbatim.

---

## Where each surface gets its answer

| surface | source | shows |
|---|---|---|
| Command palette | `Commands.list({ palette, runnable })` | commands by name |
| Keybindings sheet | `Keybindings.list()` — a projection | every bindable command, rebindable |
| Available macros | `Commands.describe()` **+** `BelEditor.styleMacros()` **+** `reservedChordFacts()` | only what you can press *right now*, closing with what the browser took |
| Command line | `Commands.list({ cmdline, runnable, available })` | `:` names, ids, `M-x` names, `:set` |
| Which-key | `NORMAL_MAP` / `LEADER_MAP` / `CX_MAP` / `CC_MAP` | what can follow the pending prefix |
| Status strip | pushed state only | keymap · position · mode · pending · goal · holes · problems · checker |

`Commands.describe()` is the **one** chord formatter. Nothing else may format a chord.

---

## Still open

- **macOS chord measurement.** `BROWSER_RESERVED_MAC` is documented, not measured. Open
  `scripts/chord-audit.html` on a Mac and press the table; it is two minutes, and measuring
  the Windows table found three errors.
