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
  command-catalog.mjs    METADATA for all 149 commands. Data only: no run, no DOM, no deps.
  command-registry.mjs   define() + attach(); `window.Commands`. Everything else projects it.
  command-settings.mjs   29 preferences as commands → 55 `:set` names, one table.
  command-names.mjs      id → M-x name, ex aliases, fallback title.
  command-shadows.mjs    what a style takes, and what to press instead.
  command-context.mjs    which surface owns the keyboard right now.

js/ui/keybindings.mjs    chord table. A PROJECTION of `keybindable: true` entries.
js/ui/command-palette.mjs · available-macros.mjs
js/status-strip/         the strip, the command line inside it, and the edit-history
                         panel behind the `⟲` widget (`view.edit-history`).

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
  · an `M-x` name · a which-key row if it is behind a prefix · a place in Available Keys
  · correct shadow text under Vim and Emacs.

**4. If it should have a Vim or Emacs key**, add one line to `NORMAL_MAP` / `LEADER_MAP` in
`vim-setup.mjs` or `CX_MAP` / `CC_MAP` in `emacs-setup.mjs`. Those are `[keys, id]` pairs, so
which-key and Available Keys pick it up with no further work.

---

## The invariants, and the test that holds each one

| invariant | held by |
|---|---|
| Every catalogue id has behaviour, and every behaviour has a catalogue entry | `test-editor-commands.mjs` |
| **Every bindable editor command RUNS when bound** | `test-editor-chords.mjs` + `probe:keymap` |
| **Every bindable GLOBAL command RUNS when bound** | `test-global-chords.mjs` + `probe:keymap` |
| **The three styles reach the same surfaces** | `probe:keymap` (the `[parity]` phase) |
| The command line owns the keyboard while focused | `probe:keymap` (`C-g` aborts `M-x`) |
| A chord with no runner is skipped, never emitted dead | `test-editor-chords.mjs` |
| Style policy in the catalogue matches the live keymap | `test-command-catalog.mjs` |
| **A style policy agrees with the STYLE'S OWN PACKAGE keymap** | `test-style-chord-claims.mjs` |
| **A chord a style took is either named or answered, on every surface** | `test-style-chord-claims.mjs` |
| Only BelJar's history is ever driven by a key or a `:` name | `probe:undo` + `probe:keymap` |
| Every `:set` name maps to a real Persist accessor | `test-command-settings.mjs` |
| An option only VIM owns still reaches vim, with a control | `probe:keymap` |
| Every substitute the reserved-chord sheet names is actually bound | `probe:keymap` |
| Every Vim/Emacs map fires when pressed (with a dead-chord CONTROL) | `probe:keymap` |
| **Every leader the settings panel offers actually works** | `probe:keymap` |
| Style maps are listed, with the live leader | `test-style-macros.mjs` + `probe:keymap` |
| A shadowed row wears a one-word tag, never a second line | `probe:keymap` |
| **A tag means the CHORD is contested, and names the other claimant** | `test-command-shadows.mjs` + `probe:keymap` |
| No row in Available Keys is a dash | `probe:keymap` |
| Style options are nested under Editing style, and hidden otherwise | `probe:keymap` + `probe:app` |
| Every substitute the style passage names comes from the measured table | `probe:keymap` |
| A window opened from Settings is actually on top | `probe:app` |
| The `⟲` widget counts the live stack and its panel travels through the real undo | `test-status-strip-history.mjs` + `probe:undo` |

Gates: `npm test` (Node, ~90s) · `npm run probe:app` (routine, ~25s) ·
`npm run probe:keymap` (this layer, deep) · `npm run probe:undo` (undo/redo + the
history panel).

---

## ⛔ The traps this layer keeps falling into

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

⛔ **And then it happened again on the other half.** `initGlobals` was handed a hand-written
map of FOUR handlers — the palette's modes — while the catalogue declares **67** bindable
global commands, and its dispatch loop ended `if (typeof handler !== 'function') continue;`.
So 63 global commands accepted a chord in the Keybindings sheet and did nothing when pressed:
bind Toggle Theme to `Ctrl+Alt+J`, press it, nothing. `test-editor-chords.mjs` had held the
editor half since the day it was written and said nothing about this one, because it was
about the editor keymap. `initGlobals` takes the same `opts.fallback(id)` now, and
`test-global-chords.mjs` is its twin.

⚠ Making all 67 live exposed a second thing: a global chord fires on `window` at CAPTURE, so
it also fires **while you are typing in the command line**. That line is a modal surface with
its own key language (`C-g` and `Escape` abort, `C-s`/`C-r` step the search, `C-n`/`C-p`/`C-m`
walk the list), and it had never collided because only four globals existed. `Ctrl+G` collided
the moment Go to Line shipped — hijacking the one chord an Emacs user presses to get out of
`M-x`. `isCommandLineFocused()` in `command-context.mjs` is the stand-aside.

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

**4. A policy stated from memory instead of read from the package.**
`styles: { vim: 'always' }` is not a preference — it is a claim that the vim package
leaves that chord alone. Cut, Copy and Paste shipped declared `always`, beside a comment
asserting that *"neither this vim package nor real vim binds Ctrl+X/Ctrl+V to anything"*.
The package's own keymap binds all three: `<C-x>` **decrements the number under the
caret**, `<C-v>` is blockwise visual mode, `<C-c>` is `<Esc>`. Vim runs at `Prec.highest`
and preventDefaults whatever it matched, so the chord never reached BelJar — the sheet
offered Cut on Ctrl+X, Available Keys printed it as pressable, and pressing it edited
the document instead. `test-style-chord-claims.mjs` reads both packages' keymaps now: an
`always` chord must be one vim does not bind, an `off` chord must be named by
`STYLE_TAKES` or answered by a `STYLE_CHORDS` substitute, and an editor chord Emacs binds
must be declared `off` (or carry `sameCommand`, as `C-z` does for Undo).

⛔ The same read caught `edit.format`: `Alt+Shift+F` is `S-M-f`, which Emacs binds to
forward-word-selecting. Format Document had been a dead key under Emacs since the chord
shipped. It is `off` there now, with `C-c q` as the substitute.

**5. A reduction that lives in one surface when three of them need it.**
"What chord do I press for this command" is not `describe().chord` — that is BelJar's own
binding, which the style may have taken. Available Keys reduced it correctly, the
editor's context menu printed BelJar's chord whatever the style, and the header's Edit
menu printed **no chord at all** on any of its eight rows. One resolver now:
`Commands.liveChord(id)`, over `chordInStyle()` in `command-shadows.mjs`.

**6. A binding nobody can discover.**
Vim's 16 normal maps, its 10 leader maps and Emacs' 15 chains were real and invocable and
appeared in **no listing anywhere** — not the Keybindings sheet (it projects `Keybindings`,
which has never heard of them), not the palette (it lists commands, not keys), not Available
macros. Which-key was the only way in, and which-key answers a prefix you already knew to
press. `style-macros.mjs` exports them as data; Available Keys leads with them.

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
- **Available Keys** shows the chord that WORKS. Every chord it prints is free, so under Emacs
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
KEYS                                    Available Keys   Reset
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

## ⛔ The command line: one grammar, not two

`status-strip-parse.mjs` + `command-settings.mjs` define what a line MEANS.
`status-strip-complete.mjs` defines what it OFFERS. They are two halves of one
grammar, and every bug this line has had was the second half not knowing what the
first half already did:

| you type | the parser has always understood | the completer used to see |
|---|---|---|
| `:set ts=4` | `ts` = 4 | no option named `ts=4` |
| `:set nonu` | `line-numbers` = false | no option named `nonu` |
| `:set nu!` | toggle `line-numbers` | no option named `nu!` |
| `:w!` | `file.save`, bang | no command named `w!` |

⛔ **And an empty candidate list is what tints the line red.** The list is
SLOT-scoped; the tint covers the whole line. So the moment you typed the `=` of
`:set ts=4` the list emptied, the legend said *"No matching command"* and the
line went red — for a line that is valid and that Enter would have run.

Three rules hold it together now:

1. **The completer splits the same way the parser does** — the `=`, the `no`, the
   `!`. `optionCandidates()` carries the `no` forms; `optionValueCandidates(name)`
   supplies what `<name>=` will accept.
2. **"Unknown" is about the command NAME, never an argument.** Past slot 0 the
   name has already resolved or not, and that is the only question a red line can
   honestly answer. A missing file does not make `:e` unknown.
3. **The legend names what it is empty OF** — option, value, file — not "command".

⚠ A completion replaces the span `complete()` returned, not one re-derived at
apply time: for `:set ts=` that is only the part after the `=`, and re-deriving
it puts `4` where `ts=4` belongs.

## ⛔ The command line must LOOK like one

Both faces share the strip, so they must share a shape. Two things were off, both
reported from a screenshot and then measured:

- **Vim's `:` floated above its own text.** Not ours: the package builds the ex
  line as `span(display:flex) > [ ":" , input ]`, and a bare text node in a flex
  container is an **anonymous flex item** — with no `align-items` it stretches to
  the row height and paints the glyph at the top, while the input centres its
  own. Measured 3px out. ⚠ The fix is a DESCENDANT selector: the CM5 `openDialog`
  shim adds a wrapper, so the flex span is three levels down and a `>` chain
  matched nothing.
- **BelJar's own `:` sat 0.4rem off the text, one step larger.** A sigil is part
  of the line — vim writes `:set ts=4` and `/pattern` with nothing between them.
  A WORD prompt (`M-x`, `Go to line`) is a label and keeps its gap;
  `setPrompt()` is the single writer so the text and the spacing cannot disagree.

A second pass, from a second screenshot, found the first fix had aimed at the wrong
quantity:

- ⛔ **Centring the BOXES is not aligning the TEXT.** An `<input>` centres its
  inner text in its content box; a bare text node sits on the line box's
  baseline. Centre both boxes and the glyphs still differ by however much those
  two rules disagree — measured at 1px, colon high, *while the box-centre check
  passed at ≤ 2px*. Both faces align on `baseline` now, which lines up the thing
  that is actually seen, at every zoom, rather than arranging boxes and hoping.
- ⛔ **`makePrompt` writes `font-family: monospace` INLINE**, so vim's sigil came
  out in the browser's generic monospace beside an input in JetBrains Mono: two
  fonts, two sets of metrics, one line. Nothing but an `!important` author rule
  outranks an inline declaration — the one place in `status-strip.css` that
  earns one. Vim's `:` also takes the same accent as BelJar's own: one slot, one
  `:`, not two features that look different depending on the keymap.

⚠ **The lesson, not the pixels.** Every geometry the DOM hands back is a BOX, and
this whole class of bug lives in the gap between a box and the glyph painted
inside it. `probe:keymap` `[shape]` now screenshots the strip and measures the
INK — the top and bottom row of lit pixels per glyph run — because that is the
only quantity that corresponds to the complaint.

Gates: `test-status-strip-line.mjs` (the grammar) · `test-command-settings.mjs`
(the candidates) · `probe:keymap` `[shape]` (the fonts, and the ink, measured).

## ⛔ The goal chip has THREE states, and a tone is a promise

Being IN a hole and KNOWING that hole's goal are different facts. They were one string
(`goal`, `''` for both), and the cost was that **a hole whose goal the checker had not
produced yet reported as no hole at all** — you put the caret on a fresh `?` and the bar said
nothing, with no way for it to say the honest thing.

| caret | goal | chip |
|---|---|---|
| not in a hole | — | nothing |
| in a hole, goal known | `[⊢ nat]` | the type, syntax-highlighted, opens Harpoon |
| in a hole, goal not yet | — | `⊢ Computing…` — same chip, same hole wash, italic and faint |
| in a hole, settled without one | — | `⊢ No goal` |

- The placeholder keeps the wash and the turnstile so the chip does not appear and JUMP when
  the real goal lands; only its text changes. It is **not a button** — an action that cannot
  work yet is worse than no action.
- ⛔ **`Computing…` turns on `goalMayStillArrive`, the engine's settle state**, not on the
  bar's `checking` flag. That flag is `belugaChecking || parse incomplete`, a near-miss that
  would have the chip promising a goal after the check had finished without one. The predicate
  lives in `hole-goal-display.mjs` with the rest of the goal vocabulary. A spinner that never
  resolves is a lie told slowly.
- The hole COUNT keys on `inHole` too. Keyed on the goal text it read `2 holes` beside a chip
  saying `Computing…` — counting the very hole the caret was in.

Two bugs fell out of writing this down, both older than the placeholder:

- ⚠ **`refreshProofState` never read the goal.** It runs on `beljar:hole-goals-updated` — the
  moment the goals exist — and set holes and symbols while leaving `goal` alone. A hole you
  were already standing in when its goal arrived stayed blank until you moved off it and back.
- ⚠ **`setEditorState` is a silent allowlist.** A field not named in it is dropped without a
  word, which is what happened to `inHole` first: the feed sent it, the builder read it, and
  the bar showed nothing. New editor state must be added in *both* places.

### ⛔ A tone is a claim on a stylesheet

`REC` declared `tone: 'error'` while `is-error` had rules under `--problems` and `--checker`
only, so the one chip you must not miss rendered in the resting grey; `is-pending` on the
half-typed chord had no rule at all. **Naming a tone nobody honours is the same as naming
none.** `test-status-strip-segments.mjs` now sweeps every state, collects every `(segment,
tone)` a builder can emit, and fails on any that is styled nowhere — an allowlist names the
handful that deliberately ride the segment's base colour.

⚠ And REC is **not red**. Red, amber and green are spoken for on this bar — errors, warnings,
a clean check — and a recording is none of those: it is a state you are IN, not a verdict on
your file. Violet was the first answer and was wrong for a reason only visible in place: REC's
permanent right-hand neighbour is the magenta hole count. Cyan is what is left, and it was
chosen by rendering the candidates in the real bar beside both neighbours, in both themes.

## ⛔ The command line is the LAST item of the left group

Everything the strip says about where you are comes first; the line you are typing sits at the
end of them, against the spacer. It used to be placed after the last of a NAMED list of
left-hand facts — so a segment outside that list landed to its RIGHT, and because the line
grows (`flex: 1 1 auto`) it was thrown to the far edge of the bar. Start a macro with no chord
half-typed and `REC`, the one piece of state you must not lose track of, flew across the window
and docked next to the checker. `paint()` anchors to the spacer instead, which states the rule
the eye already reads. Gate: `probe:keymap` `[macro]`.

## ⛔ The candidate list must name the namespace that will RUN

There are two `:` faces and **they do not share a dispatcher.** BelJar's own line runs through
`Commands.run`, which knows ids, ex aliases and `M-x` names. Vim's line is the package's input,
and Enter goes to the package's `exCommandDispatcher`, which knows vim's own ex commands plus
whatever `registerVimExCommands` handed it — every BelJar command **with an ex alias**, and
nothing else. Ids were never registered and cannot be: vim parses a command name as `\w+`, so
a dot ends it. `:BJ <id>` is their way in.

One source fed both faces, which broke the *"a surface may only offer what WORKS"* law in both
directions at once. Both measured in the browser, not reasoned about:

| typed on vim's `:` | the list said | Enter did |
|---|---|---|
| `:nohlsearch` | **No matching command** | ran it |
| `:sort` | three unrelated `set.*` rows | sorted the buffer |
| `:occurrence` + Tab | `set.occurrence-highlight` | `Not an editor command` |

So `commandSources(face)` takes the face. Under `vim` it offers BelJar's ex-aliased commands
(and matches only on those aliases — an id must not even be *matchable* there), plus vim's own
table, plus `:BJ` **with a completable argument**, which is what turns the catch-all from
trivia you had to know into the same reach the other two styles have: `:BJ theme` → Tab →
`:BJ view.theme` → Enter.

⛔ **Vim's table is a MIRROR, gated against the package.** `defaultExCommandMap` is a
module-local array and `exCommandDispatcher` a module-local closure; `Vim` exposes `defineEx`,
`handleEx`, `map`, `unmap` — every one of them ACTS, none ANSWERS. There is no runtime question
to ask, so [`vim-ex-names.mjs`](../js/editor-src/ide/modal/vim-ex-names.mjs) mirrors the 37
entries and `test-vim-ex-names.mjs` re-reads `vim.js` on every run, failing if one is added,
dropped or renamed. Same arrangement as `emacs-keys.mjs`, same reason.

⚠ **Found on the way, older than any of it: Tab then Enter ran a mangled name.** Tab writes
`el.value` directly, so no `input` event fires and nothing recomputed `lastToken` — it still
described the STEM. Enter applies the highlighted candidate before running, and spliced the
full value over those characters: `:gra` + Tab → `graph`, Enter → **`Unknown command
"graphph"`**, in both faces, on the most ordinary interaction a command line has. `tabCycle`
keeps the span in step now; the fix is the state being true, not a guard at the one caller that
noticed.

## ⛔ The caret is a CARET, even in Vim's Normal mode

BelJar has never drawn vim's block cursor: `vimChromeTheme()` hides `.cm-fat-cursor` and
`.cm-vimCursorLayer` so every mode shows the same thin caret as the rest of the editor —
*"Vim looks like the rest of the editor instead of like a second editor."*

**That decision was only ever half made.** The motion still behaved as though the block were
there: `l` / `→` stopped **on** the last character (a block covers a cell, and there is no cell
after the last one) and neither `h` nor `l` ever crossed a line boundary. A thin caret that
cannot reach the end of its own line is not a style choice, it is two designs disagreeing on
screen. [`vim-caret.mjs`](../js/editor-src/ide/modal/vim-caret.mjs) finishes it.

⛔ **It cannot be a vim option, and that is a fact about the package.** Real vi has exactly the
two knobs — `virtualedit=onemore` and `whichwrap` — and `@replit/codemirror-vim` ships
neither; its whole option table is `filetype`, `textwidth`, `langmap`, `pcre` and
`insertModeEscKeysTimeout`. The rule lives in `clipCursorToContent`, module-local, applied to
the result of **every bare motion**:

```js
var includeLineBreak = vim.insertMode || vim.visualMode;
var maxCh = text.length - 1 + Number(!!includeLineBreak);
```

Insert and Visual get the extra cell; Normal does not, and the line is clipped to itself so
nothing wraps. `defineMotion` does not help — the clamp runs on whatever a motion returns. So
the key is taken **before vim sees it**, by a `domEventHandlers` keydown registered ahead of
`vim()` in the same precedence block: the seam `vimPendingSnapshot` already uses.

⛔ **And only when vim has NOTHING pending.** `h` and `l` are operator motions too — `dl`,
`2l`, `c3l`, `"al` all reach these keys, and taking one mid-command destroys the command being
built. `vimIsMidCommand` checks every field that can mean that: operator, prefix count, motion
count, key buffer, register, pending status. Anything with a count or an operator in front of
it goes to vi untouched, which is exactly the case vim would **not** have clamped.

⚠ **Macro replay shares the layer.** `Vim.handleKey` skips every DOM listener, so
`macro-engine.mjs` offers each replayed key to `handleVimCaretKey` first — without that seam a
recorded `l` at the end of a line would wrap when you pressed it and clamp when the macro
replayed it.

### Where the line is drawn

⛔ **Moving the caret moves a real caret — one press or with a count, letters or arrows, plus
`End`. Vi's TARGET vocabulary keeps vi's meaning.**

| | behaviour |
|---|---|
| `h` `l` `←` `→` in Normal, alone or with a count | **BelJar's**: one past the end, wraps across lines. `3l` lands exactly where `lll` lands |
| `End` | **BelJar's**: past the last character (`Home` already agreed) |
| an operator — `dl`, `d2l`, `d<End>`, `c3l` | **vi's**, untouched |
| `$` `0` `w` `b` `e` | **vi's** |
| Visual mode | **vi's** — and `<S-Arrow>` there already wraps on its own |
| `x` with the caret one past the end | measured: deletes nothing, the line break survives |

The `$` line is the interesting one, and it is not squeamishness. With `dl` there is pending
state saying a command is being built, so this layer stands aside and vi gets the key. **With
`$x` there is none** — the two commands run separately, so nothing can tell "go to the last
character, then delete it" apart from a caret move. A key whose vi meaning cannot be
distinguished from a caret move is left to vi; `End` has no such idiom, so it follows the rule.

⚠ **Counts live in the KEY BUFFER, not in `prefixRepeat`.** `pushRepeatDigit` does not run
until the whole command resolves, so at the moment the layer is asked, pressing `3` has left
`keyBuffer: ['3']` and `prefixRepeat: []`. Measured in the browser — reading the documented-
looking field alone silently did nothing. The count is then **consumed** (`inputState` rebuilt
from its own constructor, plus a `vim-command-done` signal, mirroring the package's
`clearInputState`) or a `3` stays armed for the next key.

⚠ **Visual is left to vi, and that is a measurement rather than a shrug.** The plain-editor
path there is already normal: `<S-Right>` is not in vim's keymap at all, so it falls through to
CodeMirror and extends across line boundaries — driven in a real editor, `b` → `bc` → `bcd` →
over the boundary. What stops is `v` then `l`, and vi's visual selection is INCLUSIVE by
construction. Wrapping only the motion would produce a third behaviour belonging to neither;
changing the model would change what every visual operator deletes.

Gates: `test-vim-caret.mjs` (which keys, `End` vs `$`, counts, every way vim can be
mid-command) · `probe:keymap` `[modal]` (the motions, the counts, the operators and the `x`
edge, driven by real keys).

## ⛔ The three styles are meant to be equally reachable

Standard is not "the one without a keymap". It is a style like the other two, and anything
one style can reach the others must be able to reach as well — through their own idiom.

| capability | Standard | Vim | Emacs |
|---|---|---|---|
| Run a command by name | `Alt+X` → the command line, or `Mod+K` `>` | `:` (vim's ex, our candidates on top) | `M-x` |
| `:set`, `:e`, a bang, an argument, a line address, line history | the command line | `:` | `M-x` |
| Reach EVERY command by name | the command line (ids, aliases, `M-x` names) | `:` for the ex aliases, `:BJ <id>` for the rest — both completable | `M-x` |
| Go to line | `Ctrl+G` | `Ctrl+G`, `:42`, `G` | `M-g g` / `M-g M-g` |
| Repeat the last command | `cmdline.repeat` (unbound; bindable) | `.` for the last edit | `C-x z` |
| Reload the page | `app.reload`, `:reload` / `:refresh` (no default chord: `Ctrl+R` is free in the browser but is Vim's redo and Emacs' reverse-search) | same | same |
| Which-key on a pending prefix | no prefixes exist | `g`, `]`, `[`, the leader | `C-x`, `C-c`, `M-g` |
| The style's own keys, listed | the Keybindings sheet | ⚠ not listable — the package publishes no keymap | Available Keys reads the package's 62 |
| **Keyboard macros** | ✔ bindable `macro.record` / `macro.replay` | ✔ `q{reg}` / `@{reg}` / `@@` | ✔ `C-x (` `C-x )` `C-x e` |

⛔ **Three of those rows used to be blank for Standard and two for Emacs**, and every one was
a defect rather than a decision:

- Standard had **no command line at all**. `cmdline.open` ships no chord, the double-tap
  gesture is off by default, and `tools.commands` routed Standard to the palette — so
  `settings.set` and `file.open`, which exist ONLY on that line, were unreachable by keyboard.
- `M-g` under Emacs was bound **by the package** to a `gotoline` command the package does not
  ship. Measured by pressing it, not inferred: `gotoline` appears exactly once in the
  package's source, in the key table.
- `C-x (` and `C-x z` answered with nothing. `emacsChainGuard` swallows an unmatched chain, so
  they were not even a browser fall-through — they were silence, which reads as a broken
  keymap rather than a missing feature.

## ⛔ Keyboard macros have exactly one owner

The same sentence as undo, and for the same reason. Macros are a cross-cutting FACILITY, not
part of any one style's editing model — so BelJar owns the engine
([`macro-engine.mjs`](../js/editor-src/ide/macro-engine.mjs)) and each style's own keys are
re-pointed at it, exactly as `ensureVimUndoBridge` re-points `u` and `:undo`.

Before this, macros existed only in Vim **because only Vim's package shipped them**. Emacs'
`C-x (` was swallowed in silence; Standard had nothing. Writing a second implementation for
the other two would have left the app with two macro systems that behaved differently — the
thing the one-owner rule exists to prevent.

**Why keystrokes, and why at the DOM.** A macro replays what you TYPED: the `w` of `dw` is an
operator argument and the characters of an insert are not commands, so nothing in the registry
can stand in for them. The vim package records at the VIM KEY level, which is why it needs a
second channel (`insertModeChanges`) glued alongside — insert-mode typing never reaches its
`handleKey`. Recording at the DOM removes that problem: insert-mode text is just more keydowns.

Replay offers each key to the loaded style through that style's own public entry point, and
inserts it ourselves only if nothing claimed it:

| style | fed through | printable key |
|---|---|---|
| vim | `Vim.vimKeyFromEvent` → `Vim.handleKey(cm, key, 'macro')` | unhandled in Insert → we insert |
| emacs | `EmacsHandler.handleKeyboard(event)` | claimed as `insertstring` → do NOT insert again |
| standard | `runScopeHandlers(view, event, 'editor')` | unhandled → we insert |

⛔ **A macro carries the keymap it was recorded in, and replay refuses across styles.** `j` in
Vim's Normal mode is a motion and the letter j anywhere else; replaying into the wrong keymap
types gibberish and calls it a macro.

⛔ **`q` alone is a real mapping, armed only while recording.** The package intercepts a bare
`q` inside its own `handleKey` before command matching; ours never goes through that, and
`q<register>` is only a partial match — so `q` sat waiting for a register that never came.

⛔ **`dropTrailing` is derived, never stated.** The recorder sits on capture, so the chord that
ENDS a recording has already been seen: vim's `q` is one keystroke, Emacs' `C-x )` is two.
Each caller computes it from its own key sequence.

⛔ **A command that ran and DECLINED returns `true`.** `false` means "I could not run", and
every caller reports that as *"…is not available right now"* — which overwrote the engine's
real reason ("That macro was recorded in Standard") with a wrong one.

⚠ What the package's version had and this does not: replay of the SEARCH QUERIES issued inside
a macro. Ours re-runs the keystrokes of the search instead. Registers, counts and `@@` are
carried. A replayed key that starts ASYNC work is not awaited — the same limitation vim's own
macro had.

### ⛔ The way OUT of a recording is part of the feature

A user with `REC` on the bar asked, out loud, **how do you stop recording?** — and there was no
answer anywhere on screen. Every key existed; none of them was ever said. The keys live in
[`macro-keys.mjs`](../js/editor-src/ide/modal/macro-keys.mjs) now, one table, read by the code
that BINDS them and by every surface that NAMES them:

| | record | stop | replay |
|---|---|---|---|
| Vim | `q{reg}` | `q` | `@{reg}`, `@@`, `3@a` |
| Emacs | `C-x (` | `C-x )` | `C-x e` |
| Standard | bindable `macro.record` | the same chord again, **or click REC** | bindable `macro.replay` |

Three things follow, and each of them was a hole:

- **The message that starts a recording says how it ends** — `recording @a, press q to stop`.
- **The REC chip is a button**, and its tooltip names the live style's key. Under Vim it says
  *Esc then q* whenever you are not in Normal mode, because `q` there types the letter q: a
  correct answer that still leaves you stuck is not an answer. Standard ships **no default
  chord** on purpose, so with nothing bound the chip offers the click rather than naming a key
  nobody has — and clicking is the only way out that works from inside any mode.
- **Vim's `q` and `@` are listed in Available Keys.** BelJar binds them itself, so they are as
  much "a key BelJar adds under Vim" as `gd` is, and they were the only ones missing.

⚠ `REC` declared `tone: 'error'` for weeks while `is-error` had rules under `--problems` and
`--checker` only — so the one chip that must not be missed rendered in the resting grey. **A
tone is a claim on a stylesheet; naming one nobody honours is the same as naming none.**

Gates: `test-macro-store.mjs` (registers, per-style keys, what replay may insert) ·
`test-style-macros.mjs` (the keys are listed, and every sentence reads the one table) ·
`test-status-strip-segments.mjs` (the chip's tone is styled, and its instruction tracks the
vim mode) · `probe:keymap` `[macro]` (record, replay, stop and click-to-stop driven by real
keystrokes in all three styles).

⚠ **Vocabulary.** "Available Keys…" was called "Available Macros…" until the engine existed —
*macro* already means a recorded keystroke sequence in both Vim and Emacs, and the strip prints
`REC @a` beside it. The command ID stays `keys.macros` and `:macros` stays an alias: ids are the
stable contract, because a user's stored keybindings are keyed by them.

## Where each surface gets its answer

| surface | source | shows |
|---|---|---|
| Command palette | `Commands.list({ palette, runnable })` | commands by name |
| Keybindings sheet | `Keybindings.list()` — a projection | every bindable command, rebindable |
| Available Keys | `Commands.describe()` **+** `BelEditor.styleMacros()` **+** `reservedChordFacts()` | only what you can press *right now*, closing with what the browser took |
| Command line | `Commands.list({ cmdline, runnable, available })` | `:` names, ids, `M-x` names, `:set` |
| Header + context menus | `Commands.liveChord(id)` | the chord that WORKS, or none |
| Which-key | `NORMAL_MAP` / `LEADER_MAP` / `CX_MAP` / `CC_MAP` | what can follow the pending prefix |
| Status strip | pushed state only | keymap · position · mode · REC · pending · goal · holes · problems · checker |

`Commands.describe()` is the **one** chord formatter. Nothing else may format a chord, and
`Commands.liveChord(id)` is the **one** reducer from "BelJar's chord" to "the chord that
works right now in this style". A surface that prints a key beside a name owes both.

⛔ **A style must not swallow what it replaces.** BelJar's `:set` overwrites Vim's
outright (`Vim.defineEx('set', …)` replaces the package's entry), which took Vim's own
five options with it — `pcre`, `langmap`, `insertModeEscKeysTimeout`, `filetype`,
`textwidth` — each answered *"Unknown option"*. `runSet` in `vim-setup.mjs` now hands an
unowned name back through `Vim.setOption`, parsing the line ONCE with
`Commands.settings.parse` rather than growing a second grammar. ⚠ `Vim.getOption` and
`Vim.setOption` **return** an `Error`; they do not throw one — a `try` around them
catches nothing.

⛔ **Undo and redo have exactly one owner.** CodeMirror's `history()` is still installed,
but nothing may reach it by key or by name: `historyKeymap` is NOT in the editor's keymaps
(its five chords include `Mod-u`/`Alt-u`, which drove a parallel stack BelJar never saw),
and vim's `:undo`/`:redo` are re-pointed in `ensureVimUndoBridge` because the package's ex
table captured `CM.commands.undo` at module load, before the bridge exists. Two histories
on one document is the corruption this layer exists to prevent.

---

## Still open

- **macOS chord measurement.** `BROWSER_RESERVED_MAC` is documented, not measured. Open
  `scripts/chord-audit.html` on a Mac and press the table; it is two minutes, and measuring
  the Windows table found three errors.
