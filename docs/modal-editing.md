# Modal editing — command layer, the status strip, Vim, Emacs

**CLOSED 2026-09-02**, reopened for the bottom-left rethink (§Q) and again for the
correctness pass (§T), both 2026-09-03.
One command registry, one status strip, faithful Vim, an honest Emacs.
Everything planned is built and measured; the two things still open are not code.

| | |
|---|---|
| **Commands** | **149**, every one runnable — 113 in the palette, 140 bindable **and every one of them live when bound** (§T.1), 118 nameable on the command line, 16 with a shipped chord, 25 `:ex` names |
| **Preferences as commands** | 29, generating 55 `:set` names from one table |
| **Style keys** | 41 — Vim's 16 normal + 10 leader maps, Emacs' 6 `C-x` + 9 `C-c`, all listed in Available macros (§T.4) |
| **Gates** | `npm test` 238/238 · `npm run probe:app` 114 checks · `npm run probe:keymap` 289 checks |
| **Still open** | macOS chord measurement — needs a Mac, two minutes (`scripts/chord-audit.html`) |

> ### ⭐ Adding or changing a command? Read [`COMMANDS.md`](COMMANDS.md) instead.
> That is the one-page working contract: the shape, the recipe, the invariant table and the
> four traps this layer keeps falling into. This file is the history behind it.

**Reopened 2026-09-03** for a correctness pass, which found four shipped lies and closed them.
They are recorded in §T and their rules are folded into §0.4:

| | |
|---|---|
| **62 of 74** bindable editor commands did nothing when bound | the projection now refuses to emit a runnerless entry |
| **2 of 3** Vim leaders offered had never worked, at all | BelJar takes the key from vim, as `mapleader` does |
| the settings panel named **2 unbindable** Emacs substitutes | derived from the measured table now |
| **41** style bindings were listed in no surface anywhere | Available macros leads with them |
| the two buttons the pass ADDED opened windows **under** the modal | §T.7 — the panel rethink that followed |
| the `shadowing` tag was about a COMMAND, not a chord | §T.8 — it fired where nothing collided and was silent where things did |
| the Reserved chords sheet was a table of em-dashes I read but never LOOKED at | §T.9 — deleted; folded into Available macros |
| "Available macros" listed `:names` and substitutes that do nothing in the active style | §T.10 — filtered by style: names, spelling and keys |
| and printed `w write wa wall` — four spellings of one answer | §T.10 — one name per row; aliases stay in the filter |
| the window spent a row explaining itself, and the block ended in two paragraphs | §T.11 — info circle in the chrome; the block closes in labelled rows |
| "Available macros" omitted the Emacs package's 62 bindings and grouped by whose keymap | §T.12 — grouped by key SHAPE, package keys read from the package |

**This document is now a record, not a worklist.** It is both the plan and the changelog of how
it was built, which is more history than anyone needs day to day. Read in this order:

1. **§0.4 — the rules that outlived the work.** The ⛔ laws, indexed. If you are about to change
   any of this, that list is the part that matters.
2. **§0.5 — what shipped**, with every dropped item and its reason.
3. Everything after §1 is the original design and the blow-by-blow of building it. Consult it for
   "why is it like this", not for "what should I do next".

Companion: [`CODEMAP.md`](CODEMAP.md), `.cursor/rules/beljar-css.mdc`,
`.cursor/rules/beljar-codemap.mdc`.

---

## 0. North star

> A proof engineer opens BelJar, sets **Vim**, and within ten seconds feels that BelJar was
> *built* for Vim rather than wearing it. The bottom line is quiet, tells the truth, and knows
> Beluga: it shows the goal at the caret, not just `Ln 12, Col 4`. `:` opens without the
> editor moving a pixel. Every action in the app has a name, a chord, and an `:ex` form, and
> the UI never claims a chord it cannot deliver.

Three properties, in priority order, that every decision below is measured against:

1. **Truthful** — the UI never advertises something the platform will eat.
2. **Quiet** — the bar says nothing when there is nothing to say; it blooms only on state.
3. **Continuous** — no mount/unmount flashes, no layout shift, no lost caret, no reflow when
   a digit changes. Smoothness here is *absence of jank*, not addition of animation.

---

## 0.4 The rules that outlived the work

Every one of these was bought with a bug, a rewrite, or someone being rightly angry. They are the
reason to read this file at all.

**Truthfulness**
- ⛔ **Full keyboard locks EVERY key, Escape included.** A tap of Escape must reach BelJar; only
  press-and-hold leaves fullscreen. Locking a subset hands Escape back to the browser and drops
  someone out of fullscreen mid-edit. (§N)
- ⛔ **Never advertise a chord the platform will not deliver.** The style policy, the shadowed
  rows and the reserved-chord sheet exist for this. Anything new that shows a chord goes through
  `describe()`. (§L found two violations that had shipped.)
- ⛔ **The reserved-chord table is MEASURED, not assumed** — `scripts/chord-audit.html`. Measuring
  it removed one entry, added two, and caught a substitute pointing at another reserved chord.
  macOS is still only documented, and the test says so. (§L)
- ⛔ **A substitute may never name a reserved chord.** Pinned by a test that walks every row.
- ⛔ **Do not claim a feature's name for a subset of it.** "Yank to system clipboard" is not
  `clipboard=unnamed`, and must never be called that. (§J)

**The keymap is audited by pressing it** (§S)
- ⛔ **Every substitute `BROWSER_RESERVED_PC` names must be BOUND.** `Alt+T` and `Ctrl+Q` were
  printed and dead; `Ctrl+W`'s both spellings are reserved, so kill-region was unreachable.
  `EMACS_SUBSTITUTES` is the one table, and `npm run probe:keymap` presses every entry.
- ⛔ **Read a dependency's key table, never recall it.** "`C-x h` is a no-op in this package" was
  wrong, and it told Emacs users Select All was unreachable.
- ⛔ **A liveness probe needs a control.** An unbound chord must read as dead, or every binding
  passes on background noise. Strip text, exclude the blinking caret, sample at rest.
- ⚠ **`Vim.defineEx` overwrites silently** — it throws only on a bad prefix. A new `ex` name that
  collides with a Vim builtin (`s`, `g`, `d`, `y`, `j`, `v`, `u`) would replace it without a word.

**A macro is not an editor feature** (§R)
- ⛔ **A chord means ONE thing wherever you press it.** Under Emacs, `M-x` opens the `M-x` line in
  the explorer and in settings, not the palette. `runCommandEntry()` resolves it once and both the
  global chord and `Commands.run()` go through it.
- ⛔ **Read `reserved-chords.mjs` before binding any chord.** `Ctrl+M` is BelJar's substitute for
  the undeliverable `Ctrl+N` — forward, not RET — and the editor has bound it that way all along.
  General knowledge of a convention is not knowledge of THIS keymap; the substitute table is
  precisely where the departures are recorded. A chord the sheet promises and nothing answers is
  the same lie as a chord the browser eats, and harder to spot.

**The strip is a row of layers, not a badge that changes its mind** (§Q)
- ⛔ **Keymap, mode and pending chord are THREE segments.** `Emacs` and `MARK` show side by side —
  the mark is a layer within Emacs, not a rival keymap — and a half-typed chord never rides the
  mode badge. Showing one *instead of* another was read as "they're combined".
- ⛔ **Bar is bar.** The command line and mid-chord echoes live in the `command` zone, in the row.
  Opening `:` must not blank the strip: where you are and what the checker thinks keep speaking.
- ⛔ **Nothing that owns focus may be re-parented on the repaint path.** `replaceChildren` on the
  segment row fires `blur` on the command line's input and closes it; the strip repaints on every
  caret move, so `:` shut itself the moment you moved.
- ⛔ **One popup surface.** Candidates and key hints render in the same box, styled from
  `completionChrome()`, sharing its bottom edge with the strip's top border — no gap, no second
  hairline. Which-key is a list, not a message crammed into the echo area.
- ⛔ **Every mode gets its own colour.** `is-insert` once resolved to the base rule's value, so
  NORMAL and INSERT differed only in spelling. Pinned by a test over every emittable tone.

**Showing a keymap — the north star is the CURRENT REALITY**
- ⛔ **Available Macros lists only what can be invoked right now.** A command the active style has
  taken, with nothing bound to replace it, does not appear — not with a dash, not greyed, not at
  all. Listing it was a list of what you *cannot* do in a window whose name promises the opposite.
  Rows earn their place by being callable; a `taken` tag can never appear there. (§P)
- ⛔⛔ **A TAG IS ABOUT A CHORD, NEVER ABOUT A COMMAND.** (§T.8) It exists for exactly one
  reason — **the chord on this row is claimed by something other than this row** — and it names
  the other claimant. `shadowed`: the style took this chord (*"Emacs uses Ctrl+F for
  forward-char."*). `shadowing`: this row's chord is the style's own and base gives it to someone
  else (*"In Standard, C-s is Save Now."*). `insert`: it works, but only while typing.
  ⛔ **Never "without Emacs, Redo is Ctrl+Y"** — a fact about a keymap you are not using, hung on
  a command rather than on a contested chord. It fired on rows where nothing collided while the
  seven chords Emacs really takes went unmarked. A surface says which chord it will display
  (`describe(id, { showing: 'style' })`) and gets the answer for that chord.
- ⛔ **A style chord must be NORMALIZED before it can be checked for collision.** `C-s`, `M-x`,
  `Ctrl+O` are not in the form the chord table is keyed by, and an unparsed chord reads as "no
  collision" — a silent false negative in the very case the tag is named for. A chain (`C-x h`)
  normalizes to '' on purpose: two keys cannot collide with one chord. (§T.8)
- ⛔ **Two BASE commands sharing a chord is a keybinding CONFLICT, not a style shadow.**
  `tools.palette` and `nav.anywhere` share Ctrl+K deliberately — they are the same action — and
  an ungated collision check accused Vim of taking it. (§T.8)
- ⛔ **A shadowed row wears a one-word TAG beside its name — never a second line.**
  A sentence under every other row reads louder than the rows themselves, and both the
  Keybindings sheet and Available Macros are lists to scan. `describe()` returns
  `shadow: { tag, tip, instead }`; there is **no bare sentence field left**, because every
  renderer that had one printed it as a stacked amber line. (§O)
- ⛔ **Show the chord that WORKS in the active style**, never the default greyed out. In Available
  macros, Find is `C-s` — that is what the row says. A greyed list is a list of what does not
  work, which is the least useful thing to hand someone who has just switched. (§O) ⚠ The
  Keybindings sheet is the exception and shows BelJar's OWN chord, because that is the one you
  rebind there — which is also why the `shadowed` tag lives on that sheet and not in Available
  macros. (§T.8)
- ⛔ **A style running the command itself is not a loss.** `M-x` *is* Run Command; the row must not
  imply it was taken away.
- ⚠ **`bindTooltips()` sweeps the document ONCE at boot and is not delegated.** A `data-tooltip`
  added later gives a help cursor and nothing else — dynamically created anchors must call
  `Tooltips.bind(el)`. (§O)

**The strip**
- ⛔ **Earn the row.** A segment must tell you something you cannot already see. This bars
  *redundancy*, not *content* — §6.2's "quiet by default" is REVERSED and must not come back.
- ⛔ **Only a real `:`/`/` input takes the strip over.** Not pending keys, not vim messages —
  `cm.state.dialog` is set for all three, and keying off it hid every segment behind a red div
  the moment you yanked. (§G, §J)
- ⛔ **A message never moves anything and never replaces the strip's content.**
- ⛔ **Which-key is STATE, not a transient.** It answers "what can follow the key you are holding",
  and that question is live for exactly as long as the prefix is pending — so it is set with
  `{ hold: true }` and taken down when the sequence resolves or is abandoned, never on a timer.
  Fading it out mid-read was the bug. (§P)

**The command line**
- ⛔ **Every candidate is rendered; moving the highlight never rebuilds the rows.** Rendering 12
  while cycling 30 walked the selection off the end of the DOM; rebuilding reset `scrollTop` so
  nothing could ever scroll into view. (§I)
- ⛔ **Nothing is preselected.** A highlight Enter would ignore is a lie about what Enter does.
- ⛔ **On the ex line, ↑/↓ stay Vim's.** They are its history; Tab and `C-n`/`C-p` walk the list.

**Modal editing**
- ⛔ **Never set `caret-color` in a keymap theme.** `drawSelection()` draws the caret and keeps the
  native one transparent; colouring it back in stacked two carets in the same place and read as a
  fatter cursor under Vim and Emacs while Standard looked right. Style `.cm-cursor` only. (§O)
- ⛔ **In Normal mode, no key may edit the document.** The vim package leaves unmatched keys
  *unhandled*, so they fall through to CodeMirror's editing keymap. (§G)
- ⛔ **A chain going nowhere must be swallowed.** The Emacs package's keydown handler is
  `return !!result`, so an unmatched second key reports "not handled" and reaches **Chrome** —
  `C-x C-g` opened the browser's find bar. Both packages have this hole; both are now guarded, and
  each guard fires **only** when a sequence was pending, because a bare unbound chord must still
  reach BelJar's own keymap. (§P)
- ⛔ **Second keys in a chain are plain letters, never control chords.**
- ⛔ **Relative line numbers are their own gutter.** The built-in never repaints on a selection
  change, so a `formatNumber` reading the caret goes silently stale. (§M)

**A surface may only offer what works** (§T, 2026-09-03 — four shipped lies, one root cause)
- ⛔⛔ **READING A FILE IS NOT LOOKING AT A SCREEN.** The Reserved chords sheet was read during the
  §T sweep, judged correct from its source, and never opened. It was a table where five of nine
  rows read `—  —`, in the app whose macro list has an explicit law against exactly that. Correct
  data rendered badly is still a bad surface. **Screenshot every surface you touch** —
  `scripts/.shots/` exists for this. (§T.9)
- ⛔⛔ **A surface promising what you can do RIGHT NOW must be filtered by the active style — the
  names, their SPELLING, and the keys they point at.** Available macros printed 25 `:names` under
  Standard where nothing opens the command line (`Alt+X` opens the palette there), printed a colon
  under Emacs where the `M-x` line takes bare names, and told Standard users to press `Ctrl+Q` —
  an `EmacsHandler` binding that does nothing outside Emacs. Three things, one mistake. (§T.10)
- ⛔ **A window explains itself in its CHROME, not in a row of its body.** "Everything else is in
  the command palette." was a sentence about the window, taking a row inside it, forever. An info
  circle in the title bar costs nothing when you are not asking. (§T.11)
- ⛔ **A block ends in ROWS, not in a paragraph.** Two chatty sentences around a list became two
  labelled rows in the same grid as everything else — that is the difference between "jammed in"
  and "finished". And when colour carries a pair (gone / works), ⛔ it must never carry it alone:
  the strikethrough and the arrow say the same thing. (§T.11)
- ⛔⛔ **"What can I do right now" means EVERYTHING that is bound, not everything in the tables we
  happen to own.** Available macros listed BelJar's chords and BelJar's own Vim/Emacs maps and
  called that available, while the Emacs package's 62 bindings — `Ctrl+P`, `Ctrl+K`, `Ctrl+Y` —
  were live and listed nowhere. Read the package's table. Where a package publishes none (vim
  does not), **say so on screen**: an unexplained absence reads as an oversight. (§T.12)
- ⛔ **Group by the SHAPE of the key, never by whose keymap it came from.** "BelJar keys" beside
  "Emacs C-x" drew a line that does not exist — those bindings change with the style too. A Ctrl
  chord is a Ctrl chord whoever bound it, and shape is how you look one up. (§T.12)
- ⛔ **ONE spelling per surface.** BelJar wrote `Ctrl+P`, our maps wrote `C-x C-f`, the package
  wrote `S-C-p`; grouping by shape turned that into blocks headed `C`, `C+S`, `D`, `E` and
  `Ctrl+x`. And ⛔ **a named key is not a sequence** — `Down` and `Esc` are not `gd`. (§T.12)
- ⛔ **ONE row per key, and the row naming a COMMAND wins.** A palette entry, a `:` name and a
  Keybindings row stand behind it; a package label has none of that. (§T.12)
- ⛔ **ONE name per row.** `Save Now` printed `w write wa wall`. A column that tells you what to
  type needs the name you would type; synonyms are a second copy of the same answer. Keep them in
  the filter, not on the row. (§T.10)
- ⛔ **A row whose answer is a dash is not a row.** Collapse them into one closing line. And when a
  list shows something you CANNOT press, it goes on the left as the row's subject — the keys
  column means "press this" and must stay pressable. (§T.9)
- ⚠ **`flex` is inert inside a `display: block` parent.** `.floating-window-body` is a block, so
  the macro list took its content height and the BODY scrolled, carrying the filter strip and
  closing line off the top — while a probe asserting `pinned` and `scrolled` passed, because the
  old geometry happened not to expose it. (§T.9)
- ⛔⛔ **A modal `<dialog>` is in the browser's TOP LAYER; no z-index beats it.** `FloatingWindow`
  tops out at 4000 *by design* ("below modal dialogs"), so a button in Settings that opened a
  floating window opened it UNDERNEATH Settings and read as a dead button. Anything that hands
  you a window to read must close Settings first (`leaveSettingsAnd()`). ⛔ And do not assert
  that it *opened* — "open" was true the whole time. Assert it is the **topmost element at its
  own coordinates**. (§T.7)
- ⛔ **A row with a button in the control column is not a setting.** Nothing about it is
  configured; it borrows the shape of a setting to be a link, and reads as a control whose value
  you forgot to set. "Go and look at this" belongs in the panel HEAD beside Reset. (§T.7)
- ⛔ **A style's options are SUBORDINATE to the style row, not a section beside it.** Under their
  own head they read as a standing part of the app that happens to be irrelevant; under Standard
  they were three dead rows advertising a mode you are not in. Nest and indent them under the row
  that causes them, and show exactly one group. An empty group is not a gap to fill. (§T.7)
- ⚠ **Never guess a `max-height`.** A 30rem cap clipped the style passage mid-sentence on an
  ordinary window — the scroll worked and simply read as truncated text. Bound it by the
  viewport, and assert `scrollHeight <= clientHeight`. (§T.7)
- ⛔⛔ **A PROJECTION must not drop half of what it projects.** `buildEditorKeymap` walked all
  74 editor-scope commands and looked each up in a table of TWELVE hand-written runners; the
  other 62 built a chord entry, found nothing, and returned false. Every motion, every
  selection twin, the line edits, the nav and prover verbs: bindable in the sheet, dead on the
  keyboard. The rule lives in the projection now — named runner, else `opts.fallback(id)`,
  else **no entry at all**, because an entry that returns false still shadows the key.
- ⛔⛔ **A green suite is not a green keymap.** That shipped at 236/236 for weeks. No test had
  ever *built* the keymap. If a layer has no test that exercises its output shape, its passing
  count is measuring something else.
- ⛔⛔ **Never retype a table into prose.** The settings panel's Emacs sentence was written
  beside the reserved-chord table; when the table was MEASURED the sentence stayed, naming
  `Ctrl+L` as reserved (it is not) and offering two substitutes that cannot be pressed. Derive
  it — `emacsFidelity()` already returned the correct words and nothing was calling it.
- ⛔⛔ **A leader that is itself a complete command can never be a prefix.** `matchCommand`
  takes `matches.full[0]` and never waits. `,` is `repeatLastCharacterSearch`, `<Space>` is
  `keyToKey`→`l`; both were offered and neither had ever worked. Take the key from vim and
  give it back when the leader moves — that is what `mapleader` does. And a literal space is
  spelled `<Space>` in a keymap: `' f'` matched no keypress that exists.
- ⛔ **Distinguish what is STORED from what is MAPPED.** Every surface read the stored leader
  and agreed with every other surface while the keymap held something else. `activeVimOptions()`
  reports the mapped one; that is the only read that can catch this class of bug.
- ⛔ **A binding nobody can list is barely a binding.** 41 style bindings appeared in no
  surface — which-key was the only way in, and which-key answers a prefix you already knew to
  press. `style-macros.mjs` exports the maps as data and Available macros leads with them.
- ⚠ **A probe that does not have EDITOR FOCUS measures nothing** — and a dead leader looks
  exactly like an unfocused probe. `page.click('.cm-content')` is not enough after a palette
  closes; focus the view and *assert* it. This cost an hour chasing a working fix.

**Architecture**
- ⛔ **The two halves of an editor command meet only at the id** — metadata in the shell
  catalogue, behaviour in `editor-commands.mjs`. No ES import crosses the bundle seam.
- ⛔ **`keymap-style.mjs` is an ASSEMBLER, not a home.** It was 700 lines holding four
  unrelated jobs. Style policy, the Vim runtime and the Emacs runtime live in `modal/`; that
  file maps a style name to extensions and re-exports the public surface. Put new modal work
  in `modal/`, not back in the assembler.
- ⛔ **One preference, one name, everywhere** — the settings panel's own label and value words,
  in the palette, `:set` and the strip. (§E)
- ⛔ **Reuse the component vocabulary before inventing one**, and **read the neighbouring text**
  before writing any. (§E)
- ⛔ **No legacy-key fallbacks for keys this thread invented** — none of it had shipped.

**Removed on purpose — do not rebuild**
- ⛔ The **shortcut teacher**, entirely. Which-key survives because it fires on a prefix you
  already pressed, never on a mouse click.
- ⛔ The **Vim cursor-shape setting**. One caret, BelJar's, in every mode.
- ⛔ **`file.save-all`**, **`tab.pick`**, **`bar.history`**, **`keys.show-chords`** — each was a
  second name for something that already existed. The reasons are in §0.5.

**Layout**
- ⛔ **One scrollport per settings panel.** The keybindings and alias units used to scroll inside
  the panel's own scroll, so you scrolled down into a box that then scrolled separately. (§O)

**Measuring**
- ⚠ **`Commands.list({ palette: true })` does NOT apply `when()`** — `available: true` does. An
  assertion without it passes vacuously.
- ⚠ **A probe that does not click into the editor measures nothing**, and
  `press(k, { shift: true })` does not send Shift+Tab. Both faked a pass here.
- ⚠ **Measure a delta, not a threshold.** The first relative-line-number check asserted `< 2ms`
  and passed at 1.97 — true, stable, and meaningless. (§M)
- ⚠⚠ **…and if the delta is smaller than the noise, do not measure time at all.** That check went
  on to fail intermittently, and one run read relative as *faster* than absolute. It now counts
  gutter repaints with a `MutationObserver` — 0 within a line, non-zero across one — which is the
  property that actually matters and is identical on every run. Blocked A/B sampling made it
  worse, not better: three of one then three of the other loaded the page enough that the second
  block ran 2× slower. (§O)
- ⚠ **Look at the screenshot.** `scripts/.shots/` — the available-macros rebuild happened because
  every number was green while the page was unusable. (§E)

---

## 0.5 What shipped

*Opened 2026-09-01 as the remaining-work list; closed 2026-09-02 with A, B and D complete and C
resolved. The tables are struck through rather than deleted — each row carries the reason a thing
was built the way it was, or dropped. §15 has the per-phase history.*

**Where it landed:** the command layer, the status strip, the command line, Vim depth, the
available-macros window, which-key, relative line numbers and the honest settings all ship.
**148 commands, every one runnable** — 112 in the palette, 139 bindable, 117 nameable on the
command line. `npm test` 235/235; `probe:keymap`, `probe:keymap` and `probe:harpoon` green.

**One thing remains, and it is not code:** measure the chord table on **macOS**.
`scripts/chord-audit.html`, two minutes, on a Mac. `BROWSER_RESERVED_MAC` is documented rather
than measured — the same footing the Windows table was on before measuring it found three
errors. (§L)

**The jump list** (`js/editor-src/ide/jump-list.mjs`) is new, not a rename of `jump-log.mjs` —
that only *logged* jumps for debugging. Every jump in the editor funnels through `moveTo()` in
`ide-actions.mjs`, so that is the one place that records where you came from. `]d` `[d` `]c` `[c`
and `Ctrl-O` / `Ctrl-I` are mapped in Vim.

⚠ **Two cursor bugs the probe caught, both classic:** the cursor must sit **one past the end**
after a jump, or the first step back skips over the position you just left (it landed two jumps
back). And the first step back must **append the current position**, or forward is a one-way
door with nothing to return to.

⚠ **The palette's empty-query list was capped at 50** and the catalogue quietly outgrew it —
the whole Tools section had fallen off the end. Raised to 300; it is a scrolling list.

**The `set.*` family** (A5) is generated from one table, `js/commands/command-settings.mjs`:
**28 preferences → 28 palette rows, 28 bindable chords and 52 `:set` names**, all from the same
28 lines of data. The palette row names the verb (*Toggle* Word Wrap, *Cycle* Font Size) because
a palette full of nouns you cannot press is a list, not a command surface.

- `:set` is ONE command, `settings.set` (`:set` / `:se`), with an `option` argument — so the bar
  completes over every preference name and vi abbreviation, and `Commands.list` still holds one
  entry per preference for the palette. Settings deliberately carry **no bare ex names**: `:nu`
  and `:list` mean something else entirely in vi, and stealing them would be the same overselling
  this whole plan exists to undo.
- Vim's `:set` is now a **four-line shim** onto `Commands.runSet`. It used to keep its own curated
  six; a second table is a second thing to drift.
- ⚠ **The one assertion that matters** is in `tests/test-command-settings.mjs`: every Persist
  accessor named in the table must exist in `js/persist/`. The names are irregular
  (`readStoredQuietWhileTyping`, `readStoredFormatOnSave`, `readStoredTrimTrailingWs`,
  `readStoredStickyDeclHeader`, `readStoredHoverSticky`, `readStoredDiagPresentation`) so they
  cannot be derived from the slug — and a typo produces a preference that appears in the palette,
  reports success, and does nothing. Nothing else catches that.
- ⚠ `:set nonsense` must NOT parse as `no` + `nsense`: the negation prefix only strips when a real
  option is behind it. Same for the reachability rule — the catalogue test now counts **three**
  doors (palette, chord, ex name on the line), because `settings.set` is behind only the third.

**Driving the lab** (A6) needed one thing the codebase did not have: *which lab is the user
looking at*. The panel holds one session and `floatSessions` holds the windows, and neither half
can answer alone. `harpoon-lab.mjs` now keeps **one `liveSessions` registry, tracked from the
`Session` CONSTRUCTOR** (not from `runSession`) so the invariant is "a Session exists ⇒ a command
can reach it", with `disposeSession` the single place it stops being true.
`Harpoon.activeSession()` returns the session holding DOM focus, else the newest — skipping any
with no `bodyEl`, which is a lab still being built.

- Seven commands drive it: `harpoon.next-goal` / `prev-goal` / `undo-move` / `redo-move` /
  `orca-start` / `orca-pause` / `orca-absorb`. Each resolves the session **per run** — a lab can be
  closed and reopened between two presses of the same chord.
- Their `when()` is the honest gate, not decoration: focus stepping appears only with **more than
  one open goal**, undo/redo only when `manualCanUndo`/`manualCanRedo` say so, pause and take-over
  only while `nativeAuto` exists. With no lab open all seven vanish from the palette.
- `harpoon.orca-absorb` is `backToManual()` — the exit that folds whatever Orca reached into the
  manual stack, whether it finished, stalled or was taken over.
- Two editor-side reports: `prover.count-holes` (`:holes`) and `prover.goal-at-cursor` (`:goal`).
  Both are **ungated** — "how many are left" is asked from anywhere in the file, not only from
  inside a hole — which is why the Prover header now survives in an empty workspace where before
  it disappeared entirely. `count-holes` counts from OUR semantic model, never by asking Beluga.
- ⚠ **`test-editor-commands.mjs` only checked `EDITOR_COMMANDS`** and never `CUSTOM_COMMANDS`, so
  every structure motion, the jump list and now these two had behaviour with nothing asserting they
  were catalogued. Both tables are checked now.
- ⚠ **`Commands.list({ palette: true })` does NOT apply `when()`** — `available: true` does. A probe
  assertion written without it passes whether or not a lab is open; the first version of the
  Harpoon-probe check had exactly that bug and was rewritten to assert the gate itself.

**Wave D** (A7) is the file and tab verbs a vi user reaches for first:

- **`file.save`** — `:w` `:write` `:wa` `:wall`. BelJar autosaves on a debounce, so `:w` means
  *flush it now*, which also runs the format-on-save and trim transforms that were still waiting.
  It reports the file it saved, because a save you cannot see is not a save you trust.
  ⛔ **`file.save-all` was deliberately NOT built**: there is one live buffer, every other open
  file is already persisted, so a second command would be a second name for one act — exactly the
  overselling this plan exists to undo. `:wa` is an alias, not a different thing.
- **`file.open`** — `:e util.bel`, exact name → basename → substring, with the bar completing over
  the project's files. `tab.pick` / `:b` was dropped for the same reason: opening a file that is
  already open just focuses its tab, so `:b` would be `:e` under another name.
- **`tab.close-others`** / **`tab.close-right`**, both through the existing `closeTabsForFiles`.
- **`suite.add-file`** / **`suite.remove-file`**, gated on the file's directory having **exactly one
  active suite**. With two the right answer is a question, and a command that guessed would be
  rewriting a `.cfg` on the user's behalf — see the no-silent-cfg-rewrite rule.

⚠ **The Vim ex bridge was dropping arguments.** `registerVimExCommands` passed `args` and `bang`
but not `argText`, so every command that reads `argText` — `:e`, and `:set` had Vim's own `runSet`
only by luck — arrived argument-less through `:` while working perfectly from the bar. Both paths
now pass the identical context shape. The probe caught it because it drives a REAL `:e` rather
than calling `Commands.run` directly.

**The available macros** (B1) is `js/ui/available-macros.mjs` — the reserved-chord sheet's floating window
with a different filter, every row generated from `describe()`. Four columns: what it does, its
chord, its typed names (`:ex` then `M-x`), and why it is shadowed if it is. **Shadowed rows are
greyed, never hidden** — "this chord exists but Vim owns it" is the answer someone came for, and
silence is not. A sticky filter matches title, chord, ex name and M-x name at once.

- `cmdline.repeat` is `@:`. `submit()` was split into `runLine(raw, closing)` so repeating is
  literally the same act as submitting minus the chrome, rather than a second copy that drifts.
- `bar.history` and `keys.show-chords` from the Wave G list were **folded in, not built**: ↑/↓
  already walk the persisted ring inside the line, and one sheet that answers "what can I press"
  beats two that answer half each.

⚠ **The available macros immediately found three commands that ship a CHORD with no behaviour** —
`edit.autocomplete`, `nav.anywhere`, `tools.commands`. Each chord worked (CodeMirror's keymap owns
Ctrl-Space; the palette owns Mod+K) but the command itself was unrunnable, so `M-x`, the palette
and the line could not reach the same act. All three are attached now, and the probe pins the rule:
**every command that ships a chord must have behaviour behind it** — a chord with nothing behind it
is worse than an unbound one, because it looks like a feature. All 147 commands are runnable.

**The gesture picker** (B3) is a settings row whose options are built from the registry, so it
cannot name a command that does not exist. `DoubleTap.targets()` is the shortlist —
**global-scope only**, because the gesture fires from anywhere including with no editor mounted,
and `]h` / `]e` already carry hole and problem navigation for anyone who wants those on a key. The
persisted key still accepts any id; the picker is a choice, not the limit. The probe drives the
whole path: retarget to `keys.macros`, tap twice, the available macros opens and the palette does
not.

⚠ **Two taps dispatched in the same millisecond do not fire** — `shouldFire` requires `gap > 0`,
which is deliberate (it rejects a synthetic double event). A probe that dispatched them back to
back therefore measured "the gesture is broken" when nothing was. Space synthetic taps ~40ms apart,
like a hand.

**The Keys panel** (B2) now carries `addSectionHead` groups — **Vim**, **Gestures**, **Learning** —
the same helper the Editor panel already used. This is not only layout: settings search reports a
row's section as its `meta` line, so a leader-key hit now reads "Vim" instead of "Keys".
⚠ The keybindings sheet reuses `bj-settings__section-head` for its own rows, so anything counting
the panel's groups must exclude `.bj-kb__section`.

**Which-key** (B5) is `js/editor-src/ide/modal/which-key.mjs`. Pause 400ms on a Vim prefix and the
bar names what the next key can be: `g` → `d Definition · r Find References · …`, the leader → its
whole map. Built from the same `NORMAL_MAP` / `LEADER_MAP` that define the bindings, so a hint
cannot advertise a key that is not mapped — and it covers **every** prefix (`g`, `]`, `[`, the
leader), not only the two the plan named.

- It rides the bar's transient-message slot, so it costs no new surface, and it is **capped**:
  when entries do not fit it **stops at the first that does not**, rather than skipping it for a
  shorter one later. A hint that reorders itself under you never becomes muscle memory.
- A leading count is Vim's, not ours — `2g` is still the `g` prefix, so it is stripped before
  matching. An exact match is not a continuation.
- It has no off switch. The "Teach me shortcuts" toggle it used to answer to went with the
  teacher; if which-key ever needs silencing, that is a new setting, not a revived one.
- ✅ **`C-c` and `C-x` got it too** (2026-09-02). It was declined at first for want of a hook into
  the package's pending prefix — then §I found one for the mode badge, and which-key simply had not
  been pointed at it. `continuations()` now handles both spellings: `]h` continues `]` with `h`,
  `C-x C-f` continues `C-x` with `C-f`. ⛔ The prefix must end at a **boundary**, or `C-x` would
  claim the `C-c` map. ⛔ The **declined** chords (`C-x 2` and friends) are left out — they answer
  when pressed, but a hint lists what you CAN do, which is the Available Macros rule.
- The probe drives it for real: `g` and the leader both produce a hint, `gd` typed fluently
  produces none.

⛔ **The two halves of an editor command meet only at the id** — metadata in the shell's
catalogue, behaviour in `editor-commands.mjs`. `tests/test-editor-commands.mjs` fails if either
side grows an id the other has never heard of, which is the only thing stopping a chord row that
does nothing.

### A. Do next — unblocked, high value

| # | Work | Why now | Size |
|---|------|---------|------|
| ~~A1~~ | ✅ **`js/editor-src/ide/editor-commands.mjs`** landed 2026-09-01 | One idempotent attach resolving the LIVE view per call, not per mount — a document switch rebuilds the editor and would strand per-mount closures | — |
| ~~A2~~ | ✅ **Wave A — 31 motions & selections** landed | `palette: false` (nobody searches a list for "move left"), bindable, **unbound** (CodeMirror already owns the arrows), and `vim: insert-only` so they never fight Vim's own motions | — |
| ~~A3~~ | ✅ **Wave C — 12 editing verbs** landed | delete/move/duplicate line, indent/dedent/reindent, transpose, split, blank line, trim whitespace | — |
| ~~A4~~ | ✅ **Wave B remainder** landed 2026-09-01 — structure motions + a real **jump list** | See below. `nav.hover` was **dropped**: CodeMirror's hover is pointer-driven with no programmatic trigger, and `nav.inspector` already answers "what is this" from the keyboard | — |
| ~~A5~~ | ✅ **Wave F — the generated `set.*` family** landed 2026-09-01 | See below | — |
| ~~A6~~ | ✅ **Wave E remainder** landed 2026-09-01 — 7 `harpoon.*` + 2 `prover.*` | See below | — |
| ~~A7~~ | ✅ **Wave D remainder** landed 2026-09-01 — `file.save`, `file.open`, `tab.close-others/right`, `suite.add-file/remove-file` | See below | — |

### B. Do after A — polish that needs the breadth first

| # | Work | Note | Size |
|---|------|------|------|
| ~~B1~~ | ✅ **Available macros** (§6.7) landed 2026-09-01 — `keys.macros`, `:help` | See below | — |
| ~~B2~~ | ✅ **Grouped layout in the Keys panel** (§11) landed 2026-09-01 — heads: Vim · Gestures · Learning | — |
| ~~B3~~ | ✅ **Command-target picker for the double-tap gesture** landed 2026-09-01 | See below | — |
| ~~B4~~ | ✅ **Wave G remainder** landed 2026-09-01 — `cmdline.repeat`; `bar.history` and `keys.show-chords` folded in, see below | — |
| ~~B5~~ | ✅ **Which-key hints** landed 2026-09-01 — Vim prefixes; `C-c` declined, see below | — |

### C. Blocked or deliberately deferred — each with the reason

| # | Work | Blocker |
|---|------|---------|
| ~~C1~~ | ✅ **MEASURED on Windows** 2026-09-02 (Chrome 152 / Win 11, `scripts/chord-audit.html`). Three corrections, one of them a shipped chord that never worked — see §L. ⏳ **macOS still unmeasured**: `BROWSER_RESERVED_MAC` is still an assertion, and the test says so. |
| ~~C2~~ | ✅ **Full keyboard** landed 2026-09-02. Measured by hand twice: under lock the ten reserved chords arrive **and their browser actions do not fire**. `keys.full-keyboard` / `:fullkeys`, offered from the reserved-chord sheet. See §N |
| ~~C3~~ | ✅ **Emacs prefix display** landed 2026-09-02 — `EmacsHandler.prototype.handleKeyboard` is wrapped to read `$data.keyChain`, guarded and pinned by a shape test. See §I |
| ~~C4~~ | ✅ **Relative line numbers** landed 2026-09-02 — own gutter, `lineMarkerChange` on line changes only. Measured at **~1.1ms per line change, 0 while typing**; ships opt-in. See §M |
| ~~C5~~ | ✅ **`ic`/`ac` case-branch text objects** landed 2026-09-02. The blocker was wrong: `CaseBranch` is a real node (`QuantifiedBinder* Pattern FatArrow Expression`), so `getCaseBranchSpan` resolves it directly. See §J |
| ~~C6~~ | ✅ **The honest subset** landed 2026-09-02 — "Yank to system clipboard", off by default. ⛔ Still NOT `clipboard=unnamed` and must never be called that. See §J |

### D. Debts and hygiene

- ✅ **The `bar` flag is now load-bearing.** Nothing had ever set it to `false`, so the filter was a
  no-op and the command line offered all 31 motions in its completion — `:motion-char-left` is not
  a thing anyone types. The Motion section is now `cmdline: false`, which is the flag's whole reason to
  exist; `tests/test-editor-commands.mjs` and the probe both pin it. ⛔ It is the ONLY section that
  turns the flag off, and anything else that wants to must earn the same argument.
- ⛔ **The shortcut teacher is GONE** (removed 2026-09-01 at the user's request: "we can't handle it
  right now"). The module, its two Persist keys, the "Teach me shortcuts" switch and the menu
  `commandId` hook that fed it are all deleted. ⛔ Do not rebuild it as a side effect of some other
  feature. Which-key survives because it is a modal-editing affordance, not a nag: it fires on a
  Vim prefix you already pressed, never on a mouse click.
- ✅ **A user-facing chord reference is not a document.** `keys.macros` generates it from
  `describe()`, so it cannot drift; writing a static one would be a second copy of the keymap.
  The Phase 8 split closed by indexing this file (§0.4) rather than splitting it — the ⛔ rules
  are what a reader needs, and they were scattered through 1900 lines of changelog.
- **`test-error-hook.mjs` flaked once** under the 8-job parallel runner and passes standalone. It
  has not recurred across the runs since. If it does, it is a shared-state bug in the runner, not
  the test.

### E. The polish pass (2026-09-01)

The first cut of these surfaces read as generic assistant output and was rejected on sight. What
changed, and what to keep true:

- ⛔ **The available macros was a worse copy of the Keybindings sheet.** 147 rows, a column of em-dashes
  for the 130 commands with no chord, and internal `beljar-*` M-x slugs wrapping onto second lines.
  It is now the *short* answer: **only rows you can actually press or type** (17 chords, 17 `:`
  names), in two blocks, `Keys` then `Command line`. Everything else is in the palette, and the
  panel says so in one closing line.
- ⛔ **Reuse the component vocabulary.** It now borrows the Keybindings filter strip (flush, icon,
  no box), a label-left/keys-right row grid, and aligns to `0.65rem` — where a floating window's own
  title sits. Read-only lists get **no per-row hairlines**; the block headings do the dividing.
- ⛔ **House voice, checked against the neighbours.** Settings labels are sentence-case noun phrases
  ("Double-tap command", not "Double-tap runs"); descriptions are one short sentence; tooltips are a
  short phrase saying what a click does, not a sentence about what the segment is. **No em dashes in
  prose** — a sweep removed every one from the new strings, including three settings descriptions
  this thread had added earlier.
- ⛔ **One preference, one name, everywhere.** The `set.*` family now uses the Editor panel's own
  labels and its own value words: the palette says "Toggle word wrap", `:set nowrap` reports
  "Word wrap off", and `:set ts=4` reports "Tab size: 4 spaces" — never the stored slug `4`, and
  never "Font size lg" where the panel says "Large".
- ⚠ **The numbers were green while the page looked awful.** The probe now measures what a screenshot
  would show — row wrapping, title/keys collisions, overflow, whether the filter and closing line
  stay pinned while the list scrolls, and whether rows align to the window title — and the PNG in
  `scripts/.shots/available-macros.png` gets read, not just written.

### F. Removals and the rename (2026-09-01)

Three instructions, carried out in full:

- ⛔ **The shortcut teacher is gone.** `status-strip-teacher.mjs`, its test, both Persist keys
  (`beljar-teach-shortcuts`, `beljar-teacher-seen`), the "Teach me shortcuts" switch, the menu
  `commandId` hook that fed it, and §6.6. **Which-key was kept** — it is a modal-editing
  affordance that fires on a Vim prefix you already pressed, not a nag on a mouse click — but it
  lost its off switch along with the toggle it answered to. The probe's transient-message checks
  survive: they now drive `setMessage` directly, because fade, no-layout-shift and
  leftmost-of-the-right-group are properties of the *message slot*, not of the teacher.
- ⛔ **The Vim cursor setting is gone.** See §7.6. One caret, BelJar's, in every mode.
- **"Command bar" is now "status strip", everywhere.** `js/status-strip/`, `status-strip-*.mjs`,
  `status-strip-feed.mjs`, `css/status-strip.css`, `window.StatusStrip`, `.bj-strip__*`,
  `--strip-*`, the settings row, the docs and the tests.
  - The **command line keeps its name**: it is a thing that opens *in* the strip. So the two
    commands became `cmdline.open` / `cmdline.repeat` (from `bar.*`), the history key became
    `beljar-command-line-history`, and the catalogue flag that means "nameable on the line" is
    now `cmdline:` rather than `bar:`.
  - ⛔ **No legacy-key fallbacks.** None of this has shipped, so there is no stored data to
    migrate and nothing reads an old key name. Do not add compatibility shims for keys this
    thread invented.

### G. Two Normal-mode faults (2026-09-01)

Both found by a new Vim user pressing `g` and waiting. Both were elementary, and neither existed
in any test until now.

- ⛔ **A pending sequence must never take the strip over.** `setVimLine` was called for
  `cm.state.dialog` **or** pending keys; the second case hid every segment and left a lone `g`
  where the command line lives, which reads as `:g`. Only a real `:` / `/` line takes the strip
  now. Pending keys ride the **mode badge** (`NORMAL 2d`) as the status they are, with the
  segments still on screen.
- ⛔ **In Normal mode, no key may edit the document.** `@replit/codemirror-vim` leaves an
  UNMATCHED key *unhandled* rather than swallowing it, so `g` then Backspace fell through to
  CodeMirror's plain editing keymap and deleted a character. `vimEditGuard()` is registered
  **after** `vim()` in the same precedence block, so vim keeps first refusal and the guard only
  sees what vim declined: it swallows `<BS>` and `<CR>` in any non-insert mode (they are motions
  and never edit), and `<Del>` only mid-sequence — a plain `<Del>` in Normal mode *is* `x` and
  must keep deleting.

⚠ **The pending check had to be snapshotted.** Reading `vim.status` inside the guard is a race:
vim has already handled the key and cleared it, so `g`+`Delete` passed on some runs and failed on
others. `vimPendingSnapshot()` is a keydown handler registered *ahead* of vim that records the
value and consumes nothing.

⚠ **A probe that does not click into the editor measures nothing.** The first sweep reported
`g`+Backspace as safe; it was safe because the editor had no focus and the key went nowhere. Every
key-driving check now clicks `.cm-content` first, and the regression checks assert both halves —
that the guarded keys do nothing mid-sequence, *and* that a plain `<BS>` still moves the caret, a
plain `<Del>` still deletes, and Insert mode is untouched.

### H. Vim polish (2026-09-01)

- **"Cheat sheet" is now "Available Macros"** — `keys.macros`, `:help` / `:macros`,
  `js/ui/available-macros.mjs`, `window.AvailableMacros`, `.bj-macros__*`.
- **A shadowed row wears a one-word tag, not a sentence.** `insert` / `taken` / `shared`, beside
  the name, with the explanation on hover. A line of amber under every second row was louder than
  the rows themselves. `Commands.describe()` now returns `shadow: { tag, tip }` alongside the
  older `shadowedBy` sentence, so the tag and the sentence cannot drift.
- ✅ **Vim's `:` line suggests, like `M-x` does.** ⛔ The package keeps its own input — that seam
  is why `:%s/a/b/g` and `:g/…` work at all — so the completion list is layered ON TOP of it
  (`StatusStrip.attachExCompletion`), never in place of it. Typing offers candidates, Tab
  completes into vim's own field, ↑/↓ walk the list, and closing the line clears it.
- ⚠ **A title may only match a CONTIGUOUS run.** Scoring titles with the same fuzzy subsequence
  as names made `:ru` offer *Format Document* — through the `r` of "Format" and the `u` of
  "Document". Names (ex alias, id, other aliases) keep the fuzzy score, because that is how the
  90 commands without an ex name are reachable; titles now need a real substring.

### I. The command line, made sturdy (2026-09-02)

The ex completion had been bolted onto the line instead of designed into it, and it showed:
suggestions outliving their input, a highlight that scrolled out of sight, an Enter that ran
something other than what was selected, and no word about a bad name until after you committed.
All three faces — our line, the search line, and Vim's ex line — now share **one** candidate
state machine in `status-strip-line-ui.mjs`. Instrument: **`npm run probe:keymap`**
(`scripts/probe-keymap.mjs`), which drives every key in every face.

**The visibility rule, in one place** (`renderList`):

| state | list |
|---|---|
| search face | never — it matches text, it does not name a command |
| nothing typed | nothing; a line that opens full of every command is noise |
| typed, no matches | one quiet row, *No matching command*, and the text tints |
| typed, matches | the ranked list, **all** of it, scrolling |

- ⛔ **Every candidate is rendered** (cap 30). Rendering 12 while `step()` cycled 30 is why
  arrowing walked off the end of the DOM: the highlight moved to a row that did not exist.
- ⛔ **Moving the highlight never rebuilds the rows.** A rebuild reset `scrollTop`, so nothing
  could ever scroll into view. `paintActive()` toggles classes in place and calls
  `scrollRowIntoView`, which **subtracts the list's padding** — without that, wrapping to the top
  left 5px of scroll and the first row sat flush against the edge.
- ⛔ **Nothing is preselected.** A highlight that Enter would ignore is a lie about what Enter
  does. `chosen` records that the user picked a row; Enter puts that row **on the line** before
  running, so choosing something and pressing Enter runs *that*.
- **Tab is a wildmenu.** First Tab writes the top candidate, each further Tab the next, Shift+Tab
  back. The candidate set is frozen when cycling starts so the list cannot re-rank under the
  insertion.
- ⛔ **On the ex line, ↑/↓ stay Vim's.** They are its ex history; Tab and `C-n`/`C-p` walk the
  list instead. Taking the arrows would have cost a real Vim feature to duplicate one we already
  had.
- **The list cannot outlive its input**: `refreshEx` detaches when the package's field leaves the
  DOM, blur hides it, Escape hides it, and a style change clears it.

**Emacs, brought level with Vim:**

- `M-x` prompts with **`M-x`**, not `:`.
- **M-x names match** — `beljar-run-file` finds Run File, alongside the ex name and the id.
- `C-g` aborts the line everywhere Escape does.
- `C-n` / `C-p` walk the candidates.
- **`C-x` mid-chain shows in the mode badge** (`EMACS C-x`), and so does a universal argument.
  ⛔ This reads `$data.keyChain`, a package internal with no public hook, by wrapping
  `EmacsHandler.prototype.handleKeyboard` — the least fragile way in, since the method is on the
  prototype. It is guarded so a version bump degrades to "no badge" rather than throwing, and
  `emacsChainShape()` is asserted in `tests/test-emacs-setup.mjs` so a bump **fails loudly**
  instead of silently going quiet. This closes C3.

⚠ **Two probe bugs of my own, both of which faked a pass:** `press('Tab', { shift: true })` does
not send Shift+Tab — the modifier has to be held — and a key sequence run without clicking into
the editor first measures nothing at all.

### J. C5 and C6 (2026-09-02)

**`ic` / `ac` — the case branch under the caret.** C5's recorded blocker was simply wrong:
`CaseBranch` is a real grammar node (`QuantifiedBinder* Pattern FatArrow Expression`), so
`CurrentEditor.getCaseBranchSpan(pos, { inner })` resolves it without going near `getDeclSpan`.

- `ac` is the whole branch **including the leading `|`** — the grammar puts the bar outside the
  node, so without that `dac` left a bar sitting alone on its line.
- `ic` is the branch **body**, the expression after the `=>`, so `cic` rewrites one branch's
  answer. It falls back to everything past the arrow when the body has not parsed yet.
- Verified by driving `dic` and `dac` in a real editor over a two-branch `case`, not by reading
  the tree.

**Yank to the system clipboard.** ⛔ This is **not** `clipboard=unnamed` and must never be called
that: Vim's option makes the clipboard *be* the unnamed register in both directions, and the read
direction is impossible here (`navigator.clipboard.readText` is async, a register read is
synchronous). The half that works ships under its own name.

- `Vim.getRegisterController()` is a **public, typed** part of the package API, so this wraps a
  documented method rather than an internal.
- ⛔ **Yank only.** A delete fills the unnamed register too, and mirroring that would let `dd`
  quietly replace whatever you had copied. The probe asserts a delete never writes.
- **Off by default.** Silently replacing someone's clipboard is not something to opt them into.

⚠ **The yank test immediately exposed a live bug.** Vim writes MESSAGES ("1 lines yanked",
"Pattern not found") into the very slot the `:` input mounts in, and `cm.state.dialog` is set for
both — so keying the takeover off `dialog` **hid every segment behind a red div the moment you
yanked**. The takeover now keys off whether the slot actually contains an `<input>`, and vim's
messages are forwarded to the echo area with every other transient: fading, right-aligned, moving
nothing.

### K. What is left needs a human — and the harness for it

`scripts/chord-audit.html` is a standalone page (no build, no server: open the file) that
closes **C1 and C2 together**.

- 37 chords: every `Ctrl+`letter, the `Ctrl+Shift+` ones, `Ctrl+1`/`9`, `Ctrl+Tab`, `Alt+`.
- Press them in any order. A chord that reaches the page turns green; whatever is still grey the
  browser took first. The page `preventDefault`s everything, because a chord BelJar can use is one
  it can suppress.
- ⚠ **Results are written to `localStorage` on every keypress.** Several of these deliberately open
  or close a tab — that is the finding — so losing the tab must not lose the data.
- If a chord arrives *and* the browser also acts, click the row to flag it. That case
  (`arrivedButBrowserAlsoActed`) is the one the table cannot infer.
- The **Fullscreen + Keyboard Lock** button re-runs the same list under `navigator.keyboard.lock()`
  and reports `reclaimedByKeyboardLock` — which is exactly the evidence C2 needs before any
  full-keyboard toggle can honestly ship.
- Copy results gives JSON: platform, UA, `reserved`, `arrivedButBrowserAlsoActed`,
  `reclaimedByKeyboardLock`.

⛔ Wanted on **Windows and macOS both** — the whole asymmetry the table encodes (Chromium reserves
`Ctrl` on Windows/Linux and `Cmd` on macOS) is the reason Emacs mode means two different things,
and it is currently asserted from documentation rather than measured.

**C4 (relative line numbers) is not waiting on anyone** — it is a Thread 2 decision. CodeMirror's
gutter does not re-render on selection change, so a correct version updates per caret move, which
is precisely the per-keystroke work Thread 2 exists to prevent. It needs a pass of its own, or a
decision not to have it.

### L. The chord table, measured at last (2026-09-02)

Chrome 152 / Windows 11, 37 chords pressed by hand through `scripts/chord-audit.html`. The table
had been asserted from documentation since the beginning; measuring it changed three things and
found a shipped chord that did nothing.

**Corrections to `BROWSER_RESERVED_PC`:**

| | |
|---|---|
| **`Ctrl+L` removed** | It reaches the page. It had been listed as reserved and given an `Alt+L` substitute that was never needed — Emacs `recenter` works as itself. |
| **`Ctrl+Shift+P` added** | Newly reserved in Chrome 152. |
| **`Ctrl+Shift+Tab` added** | Reserved alongside `Ctrl+Tab`. |

⛔ **`Ctrl+W`'s substitute was `Ctrl+Shift+W`, which is itself reserved** — a replacement nobody
could ever press, sitting in the sheet that exists specifically to be honest about this. It is
`Ctrl+Q` now, and `tests/test-emacs-setup.mjs` walks every substitute and fails if one names a
reserved chord.

⛔ **`tools.commands` shipped `Mod+Shift+P`** — which Chrome eats on Windows. Half our users had a
default chord for "Run Command…" that fired for nobody. It is **`Alt+X`** now (measured arriving,
and it reads as *execute a command* to anyone who has met `M-x`), with `emacs: 'off'` so Emacs'
own `M-x` keeps the chord.

⚠ **`Ctrl+9` arrived, and that is a trap.** It only reached the page because there was no ninth
tab to switch to; with nine or more open it goes to the last one. No `Ctrl+digit` is dependable,
so the whole `Ctrl+1…9` range stays listed. A test pins that reasoning so nobody "corrects" it
back from a single observation.

**Keyboard Lock (C2) works.** In fullscreen under `navigator.keyboard.lock()`, all ten reserved
chords reached the page. ⚠ The audit page reported this correctly in its JSON but *rendered*
those rows as still-blocked, so the run looked like a failure — a chord seen only while locked
kept its red "not seen yet". Fixed: those rows now read **reclaimed by Keyboard Lock** in blue,
and the count line says how many. Worth remembering as its own lesson — an instrument that
displays its result wrongly is worse than one that says nothing.

⚠ **Moving onto `Alt+X` exposed a gap in the policy system.** `shouldYieldGlobalForEmacs` only
stood aside for `yield`, never for `off` — no global had ever declared `off`, so the case had
never arisen, and the global fired straight over Emacs' `M-x`. Both policies now yield: they
differ in what the Keybindings sheet *says*, not in who gets the key.

⏳ **macOS: documented, not measured** (nobody here has a Mac). Chromium does not dispatch keydown
for its own UI chords, and on macOS those are the `Cmd` ones — so `BROWSER_RESERVED_MAC` now lists
`Cmd+N/T/W/Q` rather than being empty. ⚠ **`Ctrl+Tab` and `Ctrl+Shift+Tab` are reserved on BOTH
platforms**, which the old "macOS reserves nothing" shorthand hid.

The Emacs conclusion survives, but is now *derived* rather than asserted: `emacsFidelity` counts
rows whose `emacs` meaning is not `—`, and on macOS that count is zero, so the keymap is whole
there. The test checks the property ("nothing macOS reserves is an Emacs chord") instead of the
old shorthand ("macOS reserves nothing").

⚠ **`Alt+X` cannot carry to a Mac.** Alt is Option there and composes characters — Option+X types
`≈` — so `tools.commands` takes `macDefaultSpec: 'Mod+Shift+P'`, which is free on macOS
(Chrome's incognito chord is `Cmd+Shift+N`).

### M. Relative line numbers (C4, 2026-09-02)

Vim motions take counts — `5j`, `d3k`, `2dd` — and relative numbers are how you *read* the count
instead of eyeballing it. Three styles, in the Editor panel beside "Line numbers" and as
`:set rnu`: **Absolute**, **Relative** (0 on the caret line), **Relative + current** (the absolute
number there instead, what most vimrcs actually run).

⛔ **This is its own gutter, not `lineNumbers({ formatNumber })`.** The built-in declares
`lineMarkerChange: update => startState.facet(lineNumberConfig) != state.facet(lineNumberConfig)`
— it repaints when its CONFIG changes, on document and viewport changes, and **never on a
selection change**. A `formatNumber` that reads the caret is therefore right until you move and
silently wrong after, which is worse than absolute numbers because you would act on it. `gutter({
lineMarkerChange })` is the supported hook for "repaint when I say", and what we say is: only when
the caret's **line** changes.

**Measured, because that is why it sat deferred** (`npm run probe:keymap`, 63-row viewport, 400-line
file, delta against absolute over the same 200 caret moves):

| | |
|---|---|
| per caret **line** change | **~1.0–1.3 ms** |
| per caret move **within** a line | **0** — `lineMarkerChange` never fires |
| typing | **0** — same reason |

⚠ Measured as a **delta against absolute mode**, not against a bare threshold: a raw number is
mostly measuring how fast a CodeMirror dispatch is, which is not what this feature changed. The
first version of the check asserted `< 2ms` absolute and passed at 1.97 — true, stable, and
meaningless.

**Default stays Absolute.** ~1ms per line change is small but not nil, and held-`j` is exactly the
case Thread 2 watches. Vim users turn it on; it costs nothing until they do.

### N. Full keyboard (C2, 2026-09-02)

`js/ui/full-keyboard.mjs`. Fullscreen plus `navigator.keyboard.lock()` hands back every chord
Chrome normally eats: `keys.full-keyboard`, `:fullkeys`, and a button in the reserved-chord sheet —
which is where someone reading a list of taken chords wants to be told they can have them.

**Measured by hand, twice, because the first reading was wrong.** The audit page recorded all ten
chords arriving under lock, but *rendered* those rows as still-blocked, so the first run looked
like a failure and was reported as one. With the display fixed, a second pass confirmed both
halves: the chords **arrive**, and their **browser actions do not fire**. Both matter — a chord
that reaches the page and still opens a tab is not reclaimed, and the empty
`arrivedButBrowserAlsoActed` list could not prove that on its own, because in fullscreen you
cannot see a tab open behind you.

⛔ **The lock takes EVERY key, Escape included, and that is deliberate.** Escape is the most
important key a Vim user owns; locking it means a tap reaches BelJar and only press-and-hold
leaves fullscreen. Locking a subset would hand Escape back to the browser and drop someone out of
fullscreen mid-edit.

⛔ **Never leave someone in fullscreen with nothing to show for it.** If `lock()` rejects after
fullscreen was granted, `enter()` exits fullscreen again and says why. Leaving fullscreen by any
route — Esc, F11, the window manager — ends the mode, because the lock cannot outlive it.

⚠ **The lock itself is not in any probe.** It needs real fullscreen, which is precisely why S4 sat
open for weeks. `npm run probe:keymap` checks everything around it: that the API is present, that
the sheet offers the control, that it is off at rest, that the command is gated on support, and
that exiting when it never started is a no-op rather than a throw.

### O. Three fixes after using it (2026-09-02)

**`C-x C-g` opened Chrome's find bar.** The Emacs package's keydown handler is `return !!result`,
so an unmatched second key reports "not handled" and the browser gets it. `C-g` *is* bound to
`keyboardQuit`, but once `keyChain` is `C-x` the lookup becomes `C-x C-g`, which is not — so the
chord escaped the page entirely. This is the same hole as §G's Vim one, one layer further out:
there it fell through to CodeMirror's editing keymap, here to the browser.

`emacsChainGuard()` is registered **after** `emacs()`, so it only sees keys the handler declined,
and it fires **only when a chain was pending** — a bare unbound chord must still reach BelJar's
global keymap. ⚠ Reading the pre-state needs a snapshot taken inside the `handleKeyboard` wrapper
*before* delegating: the package clears `keyChain` while handling, so afterwards there is no way to
tell the keystroke was the second half of a chain. Measured as `defaultPrevented` on a listener
that runs after CodeMirror's.

⚠ My first version of that probe asserted `Ctrl+K` still opened the palette and failed — correctly.
Emacs owns `C-k` for `kill-line` and `nav.anywhere` yields it **by design**; the check now uses
`Ctrl+Shift+O`, which is BelJar's throughout.

**Which-key was fading out from under you.** It went through the echo area's ordinary transient
path, so it disappeared after 3.2s while the prefix was still pending and you were still reading
it. `setMessage(text, { hold: true })` keeps it up; the schedulers take it down the moment the
chain resolves or is abandoned, and only ever clear a hint they put there themselves. Both probes
now wait past the old hold window and assert it is still on screen, then assert Escape removes it.

**Available Macros was listing commands you could not call.** Under Emacs it showed
`Toggle Line Comment [taken] —`, `Select All [taken] —`, `Show Autocomplete [taken] —` — rows with
no way to invoke them, in a window called *Available Macros*. ⛔ The list now contains only what
can be invoked right now: a command the style has taken with nothing to replace it is **absent**,
and a `taken` tag can never appear there. `liveChord()` is the one function that decides, and the
probe asserts no row has an empty keys cell.

**The tag now describes the reality, not the loss.** `shadowing` on a row means *this binding is
the style's own, standing in for the general one* — "This is an Emacs macro. Without Emacs, Find…
is Ctrl+F." `insert` means *only while you are typing*. Both read forwards. `describe()` composes
the sentence, because it is the one formatter and the only place that knows the command's title
and its general chord; `shadowFor()` returns structure only.

**Both sheets showed a stacked amber sentence under every shadowed row** — the Keybindings sheet
kept doing it after Available Macros was fixed, because the two rendered independently. Both now
use the same one-word tag beside the name, with the explanation on hover, and the row is exactly as
tall as an untagged one. `shadowedBy` was deleted from `describe()` outright: leaving an unrendered
sentence field there is an invitation to print it under a row again.

⚠ **The two sheets differ in ONE way, deliberately.** Available Macros is a reference, so its keys
column shows the chord that works in the active style. The Keybindings sheet is an *editor* — that
column is the button you click to rebind — so it keeps BelJar's own binding and lets the tag carry
the rest.

**The shadowed rows were backwards.** Available Macros showed BelJar's default chord greyed out
with a `taken` tag — a list of what does *not* work, handed to the person who has just switched to
Emacs and needs to know what does. Flipped: the keys column shows the chord that works **in the
active style**, and the tag carries what took the default.

- `js/commands/command-shadows.mjs` holds the table, surfaced through `describe()` so it stays the
  one formatter. `runs` was read off `emacsKeys` in the package, not remembered.
- Under Emacs: **Find → `C-s`** ("Emacs uses C-f for forward-char. Here it is C-s."),
  **Show Autocomplete → `—`** ("Emacs uses C-Space for set-mark-command. There is no substitute.").
  Under Vim: **Undo → `Ctrl+Z`** ("Works while you are typing. In Normal mode, press u.")
- ⛔ **Only claim an `instead` BelJar actually binds.** `C-x h` is a no-op in this package, so
  select-all honestly has no Emacs substitute rather than a plausible-looking one.
- ⛔ **`M-x` running Run Command is not a loss** — the row says "Emacs runs this itself".
- ⚠ **The tooltip never appeared** because `bindTooltips()` sweeps the document once at boot and is
  not delegated. The tag had `data-tooltip` and a help cursor and nothing behind it. Anchors made
  later must call `Tooltips.bind(el)`. A test asserts every `off`/`yield` command appears in the
  shadow table, so a new one cannot quietly render as an unexplained `taken`.

**The settings panel scrolled inside itself.** The keybindings unit was a scrollport within the
panel's scrollport, so you scrolled down into a box that then scrolled separately. There is one
scrollport now — the panel — and the command filter is sticky so it stays reachable over 140 rows.
The probe asserts no descendant of the panel scrolls.

**The caret was doubled under Vim and Emacs.** Both keymap themes set
`caret-color: var(--accent-high) !important`, but `drawSelection()` draws its own caret and keeps
the native one transparent — so two carets sat in the same place and read as one fat one. Standard
looked right, which is why it went unnoticed. Measured in all three styles: native
`rgba(0, 0, 0, 0)`, exactly one drawn caret, 1px.

### Q. The bottom-left rethink (2026-09-03)

The left of the strip had grown by accretion and read as patchwork. Four specific faults, in the
user's words: it showed `Emacs`, then `MARK` *instead of* Emacs, "implying they're combined"; a
half-typed chord rendered as `Vim g` — "as if you have switched from key style Vim to key style
Vim g??"; the mode also had an edge strip at the far left of the window that you had to learn; and
opening `:` wiped the whole strip to show a bare prompt.

**The model is layers, not choices.** Three separate facts, three segments, always in this order:

| segment | says | colour |
|---|---|---|
| `keymap` | Standard / Vim / Emacs | plain base — no chip, no state colour |
| `mode` | Vim's NORMAL/INSERT/VISUAL/REPLACE, Emacs' MARK | the mode's own colour |
| `command` | the half-typed chord, or the command line | pending accent, mono |

`Emacs` and `MARK` now sit side by side, because the mark is a layer *within* Emacs; `Vim NORMAL g`
reads as what it is. The mode is a coloured word rather than a filled pill — the keymap beside it
is plain text, and the difference between the two facts is carried by colour alone. The far-left
edge wash is gone.

**⛔ Bar is bar.** The command line and mid-chord echoes both live in the `command` zone, spliced
into the row after the left-hand facts. Opening `:` no longer blanks the strip: where you are and
what the checker thinks keep speaking while you type. Two rules that used to hide the segment row
(`is-line-open` and `is-vim-line`) are gone; the second was actively harmful once Vim's own ex
field was mounted *inside* the zone, since it blanked the field along with the row.

⚠ **`replaceChildren` on the segment row closes the command line.** The strip repaints on every
caret move, and re-parenting a focused `<input>` fires `blur` — which closes the line. `paint()`
now inserts segments *around* a command host that never moves (`placeSegments`). Nothing that owns
focus may be re-parented on the repaint path.

**Which-key became a popup, not a message.** It was a one-line string in the echo area, competing
for width with everything else and abbreviated by a `whichKeyLine` helper that cut titles to fit.
It is now a list in the same box the command line completes into — `showKeyHints(rows)` /
`hideKeyHints()` — so it scrolls, it has room for real titles, and there is one surface for "here
are your options" instead of two. `whichKeyLine` and `shortLabel` were deleted with the line they
served. Hint rows are marked `is-legend`: no click handler, no hover wash, because there is nothing
to pick.

**`Ctrl+Space` asks for the list outright.** On an empty `:` or `M-x` line the quiet rule ("a line
that opens full of every command is noise") reads as broken — you have asked to see them. `forceList()`
shows the candidates for whatever is on the line, even nothing, and it is bound through
`Keybindings.matchesId(e, 'edit.autocomplete')`, so it is the same key here as in the editor.

**One popup, styled as the editor's own completion.** Surface tokens, scrollbar and row language
are lifted from `completionChrome()` rather than re-invented: `--search-drop-bg`, mono, `width: max-content`,
thin scrollbar. ⛔ It **shares its bottom edge with the strip's top border**: no bottom border, no
bottom corners, no gap, and the entry animation is an opacity fade rather than a translate, which
would part the seam for the length of it. It is anchored to the command zone — under the `:` you
are typing in, or under the `C-x` you can see — never to the window's left padding.

⚠ **Copying the editor's tokens is not copying its proportions.** The first cut took the tokens
literally and looked, in the user's words, tacky: `justify-content: space-between` in a
`max-content` box stretches every row to the width of the longest, so a three-word row wore a
hand's width of empty middle; `font-weight: 600` on every name turned a list you scan into a wall
of headings (the editor bolds only the *matched* substring); and `padding: 2px 0` on the list put a
visible band above the first row. Fixed by putting the description right after the name with a
`0.7rem` gap, dropping the weight, and taking the list padding to zero so the first and last rows
are flush. Metrics now: `0.72rem`, rows `0.24rem 0.6rem`, `max-height: 15rem`, top corners
`--radius-md` — a 2px radius on a box this size reads as a mistake rather than a choice.

⛔ **Whole rows only.** The bottom edge *is* the strip's border, so a row sliced in half by the
scrollport lands against that line and reads as a rendering fault rather than as "there is more
below" — a floating list gets away with it, one welded to a border does not. `fitWholeRows()`
measures the row and rounds the stylesheet's cap down to a multiple of it, so it holds at any font
size.

⚠ **`activeInput()` is not "is the line open".** Our `<input>` exists from boot and is 0×0 while
hidden, so anchoring to it silently pinned every popup to the far left. The test is `open`.

**Two faults found while measuring this**

- **`is-insert` resolved to the same colour as the base rule**, so NORMAL and INSERT — the one
  distinction a Vim user reads at a glance — were the same word in the same colour, differing only
  in spelling. Four modes now have four colours, and a test walks every mode the builder can emit,
  asserting each tone has its own rule and that no two share a value. Verified by breaking it.
- **Emacs' MARK never appeared.** The feed asked `selection.main.empty === false`, which is "is
  there a selection", not "is the mark set" — and `C-Space` sets the mark with nothing selected,
  which is exactly the state worth announcing. It now reads `$emacsMark` off the handler, pushed
  from the `handleKeyboard` wrapper: `C-Space` moves no caret and changes no document, so the
  editor's update listener returns before it could ever be read.

### R. A macro is not an editor feature (2026-09-03)

**`M-x` opened two different windows depending on where you were looking.** Inside the editor it
opened the `M-x` command line, via `EmacsHandler.prototype.showCommandLine`. Anywhere else — the
explorer, settings, a dialog — the Emacs keymap does not exist, so the chord fell through to the
global `tools.commands` and opened the **command palette**. `shouldYieldGlobalForEmacs` returns
false when the editor is not focused, which is correct for *who handles the key* and wrong for
*what the key means*.

⛔ **Under a modal keymap, the command line IS how you run a command by name**, so that is what the
chord opens — everywhere. `runCommandEntry()` in `js/ui/command-palette.mjs` resolves it once:
Emacs gets the `M-x` prompt, Vim gets `:`, Standard keeps the palette because there `Alt+X` is
BelJar's own chord and never was a keymap macro. ⚠ Both the global chord (`initGlobals`) and
`Commands.run('tools.commands')` (`app-command-palette.mjs`) go through it, so the two halves
cannot drift into opening different windows — the same discipline as `runDefault`.

**`C-m` walks the list forward, because `Ctrl+N` never arrives.** Chromium does not deliver
`Ctrl+N` to a page, so `BROWSER_RESERVED_PC` has named **`Ctrl+M, or Down`** as the substitute for
`next-line` since the table was written, and `EMACS_LINE_DOWN_KEY` has bound it that way in the
editor just as long. The command line shipped `C-n`/`C-p` only — so `C-p` went back and `C-m`, the
key the sheet promises, did nothing. `LIST_STEP = { n: 1, m: 1, p: -1 }` is the whole fix.

⛔ **This is the failure the reserved-chord law exists to stop, from the inside.** The law says
*only claim a substitute BelJar actually binds*; here BelJar claimed one, in its own table, and no
layer bound it. A chord the sheet promises and nothing answers is the same lie as a chord the
browser eats — and it is harder to spot, because the sheet reads correct.

⚠⚠ **The first attempt made it worse: I read `C-m` as RET** — true of terminals, false here — and
normalised it to Enter, so the documented next-line key ran the command instead. Two places in
this repo already said otherwise and neither was consulted. ⛔ **Before binding any chord, read
`reserved-chords.mjs` and `applyBeljarEmacsOverrides()`.** General knowledge of a convention is not
knowledge of *this* keymap, and a substitute table is exactly where a project records the places
its keymap must depart from the convention. The same pass had also bound `C-u` to kill-to-start,
a readline habit that contradicts the very same table's `Ctrl+U then digits` — both were removed.

The probe now walks `C-m` → `C-m` → `C-n` → `C-p` through the candidate list and asserts `C-m` does
**not** submit.

### S. The fidelity audit (2026-09-03)

Three questions, asked of the running app rather than of the tables: do the preset bindings do what
they say, are the vanilla Emacs/Vim keys present outside full-keyboard mode, and do the actions we
added actually land? **64 checks, `npm run probe:keymap`.** Four real defects, all of one shape.

⛔ **A substitute the sheet names and no layer binds is the same lie as advertising a chord the
browser eats — and harder to spot, because the sheet reads correct.** `BROWSER_RESERVED_PC` named
three substitutes. `C-m` was bound. **`Alt+T` (transpose-chars, for the reserved `Ctrl+T`) and
`Ctrl+Q` (kill-region, for `Ctrl+W`) were not** — printed in the Keybindings sheet for weeks,
answering to nothing. `Ctrl+W` matters most: the package binds kill-region to `C-w|C-S-w` and
**both spellings are browser-reserved**, so the single most-used Emacs edit was unreachable.
They are bound now, from one table (`EMACS_SUBSTITUTES`) that the probe presses.

⛔ **`C-x C-s` was missing** — the chord an Emacs user presses most. BelJar autosaves, but a keymap
that ignores `C-x C-s` reads as broken no matter what the app does in the background; the answer has
to be visible. Added, and it says "Saved main.bel". `C-x 1` and `C-x o` joined the DECLINED list on
the same principle: answering is the point.

⛔ **`command-shadows.mjs` told Emacs users Select All was unreachable, and a probe check pinned the
lie.** The comment read *"Emacs' own `C-x h` is a no-op in this package, so there is nothing to
offer"* — a claim about a dependency that was remembered, not read. The package binds
`C-x C-p|C-x h` to `selectAll`, and the probe measures it selecting the whole document. **Read the
package's key table; do not recall it.**

**Everything else held.** All the vanilla motions, kills, yanks, marks and search come through
intact (`C-a/C-e`, `C-b/C-f`, `M-f/M-b`, `M-d`, `C-k`, `C-y`, `C-Space`, `C-u` digit-argument), as
does the Vim core (`dd`, `u`, `C-r`, `yy p`, `gg/G`, `/`, `ciw`, `.`). All 40 bindings in
NORMAL_MAP / LEADER_MAP / CX_MAP / CC_MAP do something when pressed — **before this probe only
`]h` of the forty had ever been pressed by anything but a person.**

⚠ **`Vim.defineEx` overwrites silently.** `registerVimExCommands` carries the comment *"a name Vim
already owns stays Vim's"*, resting on the `try/catch`. It is false: `defineEx` throws only when the
short name is not a prefix of the name, and we always pass `(name, name)`. Today four catalogue
names collide with Vim builtins — `w`/`write` and `set`/`se` — and all four overrides are wanted. But
adding `ex: ['s']` to any command would silently kill `:s`. The probe now runs a substitution and
asserts it is still Vim's.

**Two notes for later, not fixed here:** Escape does not close a floating window (the graph stays up,
and §12's ladder does not cover them), and `Persist.getActiveFileId()` still names the file after the
last tab closes.

#### ⛔ How the probe stays honest

The liveness check is "pressing this changed something observable", which needs a broad signal — and
a broad signal can pass on noise. Two guards, both bought by getting it wrong first:

- **A CONTROL.** An unbound chord must read as DEAD. Raw `innerHTML.length` drifted 83 characters
  between two snapshots with no key pressed, which would have made all 40 bindings pass vacuously.
  The control caught it; without one, the section would have been a clean null that looked like a
  clean pass. (The house rule — *every census gets a control* — applies to liveness too.)
- **Structure only, and sampled at rest.** The signal strips text nodes and excludes the editor
  subtree, because the **caret blinks** — an attribute toggling twice a second. Snapshots are taken
  after the page stops moving on its own, so a checker result landing 300ms after an unrelated
  keystroke is not credited to it.

⚠ Two failures in the first run were the probe's own: the graph window stayed open across cases and
stole focus, so `C-x g` "did nothing"; and `C-x k` was measured by active-file-id, which is stale
after the last tab closes. Both read exactly like dead bindings. Diagnose before believing.

### T. The probes were 94% one thread (2026-09-03)

Counted after §S: four live probes, and `keys` + `line` + `keymap` were **167 of 178 seconds** —
~2,900 lines instrumenting the modal thread, each booting its own Chrome, while the editor,
explorer, autocomplete, persistence, settings, graph and inspector had none. Worse, there was no
*general* probe at all: an agent checking an unrelated change ran `keys:probe` (59s), half of which
was Vim and Emacs.

⛔ **The cause was mine, per-session.** `probe-command-layer` was already 1,900 lines, so each time
something broke I wrote a NEW probe instead of extending it. Three files was the cheap move each
time and the worst outcome cumulatively — the command line, which-key, the Vim maps and the Emacs
maps were each covered in two or three of them.

**Now:**

| | | |
|---|---|---|
| `npm run probe:app` | **24s, 110 checks** | ROUTINE. General surfaces only, one keymap style, **zero style switches**. Run after any change. |
| `npm run probe:keymap` | 144s, 258 checks | Deep, on demand. Three phases in ONE browser: modal · the command line's three faces · every substitute and all forty bindings pressed. |
| `npm run probe:harpoon` / `probe:holes` | 10s / 8s | Deep, on demand. |

`scripts/probe-harness.mjs` holds the boot all six were copying. ⛔ **Nothing keymap-specific may go
into `probe.mjs`** — that is the whole point of the split.

⚠ **Two bugs the merge exposed, both worth keeping in mind:**
- The modal checks had been silently inheriting a document the *general* half typed 300 lines
  earlier. Splitting broke it loudly; the phase now seeds what it needs.
- The first `finish()` printed **"ALL OK" for a probe that had thrown halfway through** — it ran
  from `finally`, saw an empty `fails`, and declared success over a corpse. It now takes the error
  and counts it as a failed check. A probe that cannot fail loudly is worse than no probe.

⚠ Remaining fat, measured and left: `probe:keymap` spends **55s of its 144s in literal sleeps** and
~25s in 19 keymap-style switches. Batching by style would reclaim most of it, but the phases test
style *transitions*, so the reordering is not free. It is off the routine path, which was the point.

⛔ **`npm test` was NOT split.** The two Beluga files own ~half its clock and splitting them would
halve the common loop — but they are the only thing verifying the WASM shim, and a green `npm test`
that no longer means "Beluga still type-checks" is a trap, not a saving. The probes were duplicated;
these are not.

### Two rules that outlived their phase — do not regress them

1. ⛔ **Earn the row.** A bar segment must tell you something you cannot already see. This is why the filename is not in the strip.
2. ⛔ **Never advertise a chord the platform will not deliver.** The style policy, the shadowed rows and the reserved-chord sheet all exist to keep this true; anything new that shows a chord must go through `describe()`.

---

## 1. What is wrong today

`Settings ▸ Keybindings ▸ Keymap style` offers *Default / Vim / Emacs* and each option quietly
means something different:

| Style | What it actually is today |
|-------|---------------------------|
| Default | 16 remappable chords ([`keybindings.mjs`](../js/ui/keybindings.mjs) `DEFAULTS`) |
| Vim | `@replit/codemirror-vim` at `Prec.highest` + a 6-line mode label panel; no leader, no `:` integration, no BelJar motions |
| Emacs | `@replit/codemirror-emacs` + a 5-command omit list + a C-m patch for the C-n the browser eats |

Three structural defects behind the symptom:

1. **Two registries, neither complete.** `Keybindings.DEFAULTS` (16 ids) and the palette's
   `register()` calls in [`app-command-palette.mjs`](../js/app/app-command-palette.mjs) (~24 ids)
   are independent lists that happen to share some ids. A thing can be bindable and not
   runnable, or runnable and not bindable. Nothing that moves the caret is either.
2. **No surface for typed commands.** The palette is an overlay with a fuzzy item list. It
   cannot express `:%s/foo/bar/g`, `:12`, `:e util.bel`, or an incremental search. Vim and
   Emacs are *typed-command* cultures; we gave them a picker.
3. **The UI lies about scope.** When `Mod+F` is silently dropped under Emacs
   (`EMACS_OMIT_COMMAND_IDS`), the Keybindings sheet still shows `Mod+F` bound to Find. The
   user is told they have a binding they do not have. That is the "oversells" complaint,
   precisely.

The fix is not more toggles. It is: **make the command layer real, give it a typed front-end,
and let the settings tell the truth about the platform.**

---

## 2. Ground truth (read from source today, not from memory)

### 2.1 What `@replit/codemirror-vim` 6.4.0 gives us

Verified in `node_modules/@replit/codemirror-vim/dist/index.js` and
`node_modules/@replit/codemirror-vim-core/vim.js`:

- **`Vim.defineEx(name, prefix, fn)`** — arbitrary ex commands with abbreviation prefixes.
- **`Vim.map / noremap / unmap(lhs, rhs, ctx)`** — key remapping per context
  (`normal`/`insert`/`visual`/`operatorPending`). This is how `jk`→`<Esc>` and a leader key
  get built.
- **`Vim.defineMotion / defineAction / defineOperator / defineOption / defineRegister`**.
- **`Vim.mapCommand(keys, type, name, args, extra)`** → `_mapCommand` does
  `defaultKeymap.unshift(command)` (vim.js:6717). **Our mappings take priority over the
  built-ins**, which is what makes custom `g`/`]`/text-object bindings possible.
- **`vim({status: true})`** renders `statusPanel` (index.js:1672) which sets
  `cm.state.statusbar = dom` and calls `vimPlugin.updateStatus()`. `updateStatus`
  (index.js:1414) **mounts `cm.state.dialog` — the live `:`/`/` input element — into that
  node**, otherwise renders `--MODE--` plus `cm.state.vim.status` (the pending-keys display,
  e.g. `2d`). Every show/hide fires `CodeMirror.signal(cm, "dialog")`.
  → **The `statusbar` is just a DOM node.** We can hand it a slot we own, anywhere in the
  document, and keep full control of the chrome while the package keeps its input.
- Text objects dispatch through a hardcoded switch in `textObjectManipulation` (vim.js:2585);
  there is **no** official hook for a new object character. Custom `id`/`ad` must come from
  `defineMotion` + `mapCommand` priority. → **Spike S3.**

### 2.2 What `@replit/codemirror-emacs` 6.1.0 gives us

- `M-x` is already bound to `focusCommandLine`, which calls
  **`handler.showCommandLine(arg)` — and that method is literally `console.error("TODO")`**
  (dist/index.js:476). It is a free, intended extension point. Implementing it *is* `M-x`.
- `EmacsHandler.bindKey` supports **key chains** (`C-x u`, `C-x r`), so a full `C-x` map is
  available, and `$data.keyChain` / `$data.count` are readable for a which-key display.
- Kill ring, mark ring, `C-u` universal argument, `M-g` gotoline, `C-l` recenter all exist.
- `getKey` reads `e.code` through a `specialKey` table where `Enter → 'Return'`
  (dist/index.js:281). **`C-m` and `Return` are therefore distinct chains** — BelJar's
  `C-m`→line-down override does *not* shadow Enter. Current behaviour is correct; do not
  "fix" it.

### 2.3 What the browser takes away — and the platform asymmetry

Chrome/Edge on **Windows/Linux** never deliver these to the page (no keydown at all;
`preventDefault` is irrelevant):

`Ctrl+N` `Ctrl+T` `Ctrl+W` `Ctrl+Shift+N` `Ctrl+Shift+T` `Ctrl+Shift+W`
`Ctrl+Tab` `Ctrl+Shift+Tab` `Ctrl+1`…`Ctrl+9` `Ctrl+L` `Alt+F4` (`Ctrl+Q` on Linux)

Chords that *do* arrive and are suppressible: `Ctrl+S` `Ctrl+P` `Ctrl+D` `Ctrl+O` `Ctrl+F`
`Ctrl+G` `Ctrl+J` `Ctrl+U` `Ctrl+K` `Ctrl+E`. (Treat this row as high-confidence but
**probe-verified**, not assumed — see Spike S1.)

**On macOS the browser reserves `Cmd`, not `Ctrl`.** `Ctrl+N/T/W/L` all reach the page.
**Emacs mode on macOS is close to full fidelity; on Windows/Linux it is structurally
compromised.** The settings UI must say this out loud, per platform, rather than offering one
flat "Emacs" option that means two different things.

Two honest escapes on Windows/Linux:

- **Keyboard Lock** (`navigator.keyboard.lock([...])`, Chromium desktop only) reclaims
  `Ctrl+N/T/W` and friends — **but only while the document is fullscreen**. Offered as an
  explicit *Full keyboard* mode, never silently.
- **Substitutions with a truth panel** — `C-m` for next-line etc., listed in the UI beside the
  chord they replace and the reason.

---

## 3. Five decisions

### D1 — One registry, two front-ends

A single command registry backs **keybindings, the palette, the bar, menus and gestures**. A
command registered once is instantly reachable from all of them.

| Surface | Role | Shape |
|---------|------|-------|
| **Command palette** (`Mod+K` / `Mod+Shift+P`) | *Launcher.* Modeless, mouse-friendly, fuzzy, no arguments. | Overlay + result list. Unchanged in spirit. |
| **The bar** (`:` / `M-x` / a bound key) | *Command line.* Inline, keeps the code visible, takes **arguments, ranges, counts, bangs**, has history, frecency and live preview. | Persistent strip under the editor. |

**Answering the open question directly: Emacs `M-x` goes to the bar, not to the palette with a
`>` prefix.** The difference that matters is not "more entries" — both read the same registry —
it is that the bar accepts *typed input with arguments and live effect*, sits where a modal
editor user's eyes already are, and does not black out the buffer they are editing. A palette
with a prefix cannot do `:%s/x/y/g` or incremental search, and covering the code with a modal
overlay is exactly the wrong reflex for `C-s`.

The corollary keeps the palette from bloating: **the registry holds everything; the palette
shows only verbs a human would search for.** Motions are registered and bindable but carry
`palette: false`.

### D2 — The bar is a BelJar surface, not a Vim/Emacs prop

It ships for **Standard** style too (status-only by default; the command line reachable by a
bound key). It is where the editor tells you what it knows: mode, position, **the goal at the
caret**, diagnostics, holes, checker state — and where editor-scoped messages go instead of
toasts. Vim and Emacs then *plug into* an existing surface rather than each dragging in their
own chrome.

Net effect on total UI surface: the bar **absorbs** the topbar status dot's tooltip content and
a class of toasts. This feature should make the app feel smaller, not bigger.

### D3 — Style is a policy, and the policy is visible

Every command declares what happens to it under each style (`always` / `insert-only` /
`yielded` / `off`). The Keybindings sheet renders that: a chord shadowed by the active style is
shown greyed with the reason. This generalises today's `EMACS_OMIT_COMMAND_IDS` /
`VIM_ALWAYS_COMMAND_IDS` and makes the "oversells" problem structurally impossible.

### D4 — Nothing gets invented that the platform cannot deliver

No fake splits, no fake terminal, no chord we cannot receive. Where Vim/Emacs users expect
something we cannot do, the bar answers with a one-line explanation, not silence.

### D5 — The bar is a **shell-owned strip**, not a CodeMirror panel

*(Reconsidered; this is the single biggest smoothness decision in the plan.)*

A `showPanel` panel is the obvious choice and it is wrong here:

| | CM panel | Shell strip (chosen) |
|---|---|---|
| Survives file switch | ✗ — `editor.destroy()` runs per document switch; the panel is rebuilt, so the bar **flickers on every tab click** | ✓ — outlives every editor instance |
| Layout shift | Changes the scroller height; every toggle reflows the code | ✓ — a flex sibling of `.editor-body`; height reserved once at mount |
| CM measure cycle | Panel DOM writes participate in CM's measure loop → risk of measure/reflow thrash on every status update | ✓ — completely outside it |
| Vim `:` input | Native | ✓ — `cm.state.statusbar` is *just a DOM node*; a shell element works (§2.1) |
| Visual role | Floats inside the editor border | ✓ — the exact bottom counterpart of `.editor-topbar`, matching existing chrome |
| Works with no file open | ✗ | ✓ |

So: `<div class="bj-strip">` as a sibling after `.editor-body` inside `.panel.editor-panel`
(both are flex children of a column panel; see [`workspace.css`](../css/workspace.css)). The
editor publishes to it across the existing seam (`beljar:*` events + `BelEditor` soft-calls);
no ES import crosses.

**Risk:** the vim ex `<input>` living outside `.cm-editor` may perturb CM focus handling
(`me.focus()` on dialog close, `EditorView.editable` blur paths). **Spike S2 covers exactly
this**, and the fallback — a CM panel that only mounts while the ex dialog is open, docked to
look identical to the strip — is cheap.

### Naming

BelJar names its subsystems when they have earned it — Harpoon is the proving surface, Orca is
the search. This one has not earned a name and does not need one: it is **the status strip in
the editor**, a common noun, and this document uses it as such. Identifiers follow the noun
(`js/status-strip/`, `bj-strip`, `--strip-*`, `window.StatusStrip` alongside the existing
`CommandPalette`), which keeps the code readable to someone who has never read this plan.

If it grows into something that wants a proper name later, renaming a prefix is a one-hour
change. Naming it early would be a claim we have not yet backed.

---

## 4. Layer 1 — the command registry

New domain `js/commands/` (shell side, published as `window.Commands`; editor-src contributes
by soft-call at mount, per the existing seam rule — no ES import across it).

```
js/commands/
  command-registry.mjs   register / unregister / get / list / run / describe → window.Commands
  command-catalog.mjs    the declarative shell-side catalogue
  command-context.mjs    which scope is focused; builds the ctx handed to run()
  command-names.mjs      id → M-x name, ex aliases, title, section ordering
  command-frecency.mjs   recency+frequency ranking store (persisted, capped)
```

### Descriptor

```js
{
  id: 'edit.format',                 // stable, dotted, domain-first
  title: 'Format Document',
  section: 'Edit',
  scope: 'editor',                   // global | editor | harpoon | repl | explorer
  when: (ctx) => boolean,            // availability; evaluated per surface-open, NOT per keystroke
  run: (ctx) => boolean,             // ctx: { view, editor, sel, count, args, bang, range }
  preview: (ctx) => revert | null,   // optional live preview; MUST return an exact undo

  defaultSpec: 'Alt+Shift+F',        // optional default chord (mac variant allowed)
  keybindable: true,                 // motions: true, but unbound by default
  palette: true,                     // motions: false — the palette must not bloat
  bar: true,                         // reachable by name in the status strip

  ex: ['fmt', 'format'],             // vim ex names (optional)
  mx: 'beljar-format-buffer',        // emacs M-x name (default: derived from id)
  args: [{ name: 'file', kind: 'file', optional: true }],   // typed args → drives completion
  count: 'repeat' | 'arg' | 'none',  // how a vim count / emacs C-u applies
  dangerous: false,                  // true ⇒ needs `!` or a y/n prompt in the bar

  styles: { vim: 'insert-only', emacs: 'yield' }            // D3 policy, default 'always'
}
```

### `describe(id)` — one function, four surfaces

Returns `{ title, section, chord, ex, mx, availableInStyle, shadowedBy }`. It is the **single**
source for: the palette's right rail, the Keybindings sheet row, `:help` / the available macros, and
and the available macros. Nothing else may format a chord.

### Consequences

- `Keybindings.DEFAULTS` becomes a **projection** — `registry.filter(c => c.defaultSpec)`.
  `js/ui/keybindings.mjs` keeps its name, public API and storage key (overrides are keyed by
  command id, so **existing user overrides survive untouched**).
- The palette's `register()` calls in `app-command-palette.mjs` collapse into
  `command-catalog.mjs` entries; `CommandPalette` reads `Commands.list({ palette: true })`.
  Its `setProvider` mechanism for files/symbols/search/problems/library stays as is — those are
  *item providers*, not commands.
- `command-context.mjs` replaces the ad-hoc `isEmacsEditorFocused` / `isVimNormalEditorFocused`
  probes scattered across `keymap-style.mjs` and `keybindings.mjs` with one resolver:
  `{ scope, style, vimMode, emacsChain, view, editor }`.

---

## 5. Layer 2 — the catalogue (this is the mass)

Today: 16 bindable, ~24 runnable. Target: **~150 commands**, added in waves.

### Wave A — motion & selection (`motion.*`, `select.*`) — ~30, all new

`char-left/right`, `word-left/right`, `line-up/down`, `line-start/end/first-non-blank`,
`doc-start/end`, `page-up/down`, `half-page-up/down`, `match-bracket`, `matching-delimiter`,
`center-cursor`, `top/bottom-of-view`, `scroll-line-up/down`, each with a `select.*` twin.
Thin wrappers over `@codemirror/commands` — cheap, and they are what makes "bind anything"
true.

### Wave B — semantic motion (`nav.*`) — ~16, mostly new. **This is BelJar's differentiator.**

| id | Meaning |
|----|---------|
| `nav.next-decl` / `nav.prev-decl` | next/previous top-level declaration |
| `nav.enclosing-decl` | jump to the head of the declaration containing the caret |
| `nav.next-hole` / `nav.prev-hole` | exists (`F8`/`Shift+F8`) |
| `nav.next-problem` / `nav.prev-problem` | `jumpToNextError` / `jumpToPrevError`, exists |
| `nav.next-error` / `nav.prev-error` | errors only (new; today's cycles include warnings) |
| `nav.next-case` / `nav.prev-case` | next/previous `case` branch |
| `nav.definition` / `nav.references` | exist |
| `nav.binder` | `revealBinder` — exists on the editor API, never bound |
| `nav.inspector` | `revealInInspector` — same |
| `nav.hover` | show the hover card at the caret (new; Vim `K`) |
| `nav.jump-back` / `nav.jump-forward` | jump list over `jump-log.mjs` (new) |

`nav.jump-back` deserves emphasis: `jump-log.mjs` already records jumps; exposing it as
`Ctrl-O`/`Ctrl-I` in Vim and on the `C-x` map in Emacs is nearly free and is the single most
missed feature when a modal user meets a web IDE.

### Wave C — editing (`edit.*`) — ~25

Existing: undo, redo, find, toggle-comment, format, rename, select-all, autocomplete.
New: `format-selection`, `join-lines`, `duplicate-line`, `move-line-up/down`,
`delete-line`, `indent`/`dedent`, `transpose-chars`, `insert-hole`, `wrap-in-case`,
`copy-goal-to-clipboard`, `paste-as-comment`.

### Wave D — files, tabs, suites (`file.*`, `tab.*`, `suite.*`) — ~20

Existing (palette-only): new/upload/download/import. New as *commands*: `file.open` (by path,
argument-taking), `file.save` (flush checkpoint + format-on-save), `file.save-all`,
`tab.next/prev/close/close-others/close-right`, `tab.pick`, `suite.run`, `suite.add-file`,
`suite.move-up/down`, `suite.make-active` — all of these exist as menu items in
[`app-menus.mjs`](../js/app/app-menus.mjs) and are currently unreachable from the keyboard.

### Wave E — run & prover (`run.*`, `prover.*`, `harpoon.*`) — ~18

Existing: `run.file/here/module/project/clear-output`. New: `prover.hole-intro`,
`prover.hole-split`, `prover.hole-fill`, `prover.open-in-harpoon`, `harpoon.orca-start`,
`harpoon.orca-pause`, `harpoon.absorb`, `harpoon.next-goal`, `harpoon.undo-move`,
`prover.count-holes`, `prover.goal-at-cursor`. The editor API already exposes
`runHoleIntro` / `runHoleSplit` / `runHoleFill` / `openHoleInHarpoon`; they are reachable only
by mouse today. **A Vim user typing `<leader>hi` to intro a hole is the single most
BelJar-specific delight in this whole plan.**

### Wave F — view, fold, settings (`view.*`, `fold.*`, `set.*`) — ~25

`view.theme/explorer/settings/graph/inspector/problems`, `view.maximize-editor`,
`view.toggle-output`, `fold.all/unfold-all/toggle/fold-decl/fold-level-N`, and a **generated
`set.*` family**: every boolean/enum editor preference in
[`editor-prefs.mjs`](../js/editor-src/editor-prefs.mjs) becomes a command
(`set.word-wrap`, `set.line-numbers`, `set.whitespace`, …) so `:set wrap` and
`M-x beljar-set-word-wrap` work without a bespoke bridge per option.

### Wave G — meta (`bar.*`, `keys.*`) — ~10

`cmdline.open` (open the command line — **the command the user asked for**), `bar.search`,
`bar.search-back`, `cmdline.repeat`, `bar.history`, `keys.show-chords`,
`keys.reserved-chords`, `keys.macros`, `keys.full-keyboard`.

---

## 6. Layer 3 — the status strip

```
js/status-strip/                → window.StatusStrip
  status-strip-model.mjs     pure state machine + reducer            (tested, DOM-free)
  status-strip-parse.mjs     pure: ranges, counts, bang, args        (tested)
  status-strip-complete.mjs  pure: candidates, ghost text, frecency  (tested)
  status-strip-history.mjs   per-kind ring, persisted
  status-strip-segments.mjs  pure: segment presentation + budget     (tested)
  status-strip-view.mjs      the strip; owns DOM + the vim slot
  which-key.mjs             prefix-hint table + timing
css/status-strip.css         new concern file, imported from css/style.css
```

The state machine is a **pure reducer**, following the shape already proven by
`prover-manual.mjs`. `status-strip-view.mjs` is a thin renderer over it. That is what makes the bar
testable without a DOM — and it is what lets the model survive editor teardown (D5).

### 6.1 States

| State | Entered by | Contents |
|-------|-----------|----------|
| `status` | default | see §6.2 |
| `command` | `:` (vim), `M-x` (emacs), `cmdline.open` | prompt glyph, input, ghost completion, candidate overlay |
| `search` | `/` `?` (vim), `C-s` `C-r` (emacs) | live incremental search, `3/17` counter, wrap indicator |
| `prompt` | `dangerous` commands (`:q` with unsaved work) | `y/n` inline — not a modal dialog |
| `message` | echo / errors | transient one-liner (`E486: pattern not found`) |
| `pending` | operator-pending, count, `C-x` chain | right-aligned pending keys + which-key hints |

### 6.2 Information architecture — quiet by default

The failure mode of every status bar ever shipped is a fixed row of eight always-on segments
that nobody reads. The bar is **state-driven**: a segment appears when it has something to
say, and stays absent otherwise.

| Segment | Shown when | Click |
|---------|-----------|-------|
| **Mode** | style ≠ Standard | Esc → Normal |
| **Position** `12:4` | always (Standard: always; Vim: always) | opens `command` pre-filled `:` |
| **Selection** `3 lines · 47 ch` | selection non-empty | — |
| **Goal** `⟨ ⊢ nat → nat ⟩` | caret is inside a hole | opens the hole in Harpoon |
| **Problems** `2✕ 1⚠` | count > 0 | jump to next problem |
| **Holes** `4?` | count > 0 **and** caret not in a hole | next hole |
| **Checker** dot | checking, or not clean | run / jump to first problem |
| **Suite** | file belongs to a non-default suite | reveal in explorer |
| **Style** | never (it is in the mode badge) | — |

**A clean, settled, unselected file in Standard style therefore shows exactly one thing:
`12:4`.** That restraint is the design.

**Budget (enforced in `status-strip-segments.mjs`, asserted in tests):** at most **five** segments
visible at once; one line; no icons except the checker dot and the goal brackets; no colour
except the `--ide-status-*` state family. When more than five qualify, drop by the priority
order above and fold the remainder into the checker dot's tooltip.

The **Goal** segment is the standout: an Agda/Lean-style infoview compressed to one line,
appearing only when you are standing in a hole. It reads from
`hole-goal-system` via the existing snapshot — no new computation (§13).

### 6.3 The command line — completion model

Three layers, in the order the user perceives them:

1. **Ghost text (primary).** The single best continuation renders inline in
   `--ui-fg-faint`; `Tab` accepts all, `→` at end-of-input accepts one word. Shell-grade
   completion, zero visual weight, no list needed for the 80% case.
2. **Candidate overlay (on demand).** `Tab` a second time, or `↓`, raises a list **upward** in
   an absolutely-positioned overlay — it must never push the bar or the editor (§7.3). Rows
   reuse `.bel-palette-item`'s exact visual language (row pill, active accent, shortcut rail)
   so the bar's list and the palette's list are visibly one family.
3. **Argument awareness.** Completion source switches on the descriptor's `args`: after `:e `
   it completes **file paths**; after `:b ` **open tabs**; after `:set ` **option names, then
   values**; after `:BJ ` **command titles**. The parser reports which arg slot the caret is
   in; `status-strip-complete.mjs` maps slot → source.

**Ranking** is the palette's existing `fuzzyScore`, then frecency, then registry order — so the
bar learns the three commands you actually use without ever reordering unpredictably (frecency
is a tiebreak, never a score override).

### 6.4 Live preview

Commands may declare `preview(ctx)` returning an exact revert. The bar calls it on a 90 ms
debounce while typing, reverting on every keystroke before re-previewing, and on abort.

- `:42` → scrolls line 42 into view **without moving the caret**; abort restores scroll.
- `:%s/x/y/g` → highlights matches live using the existing `highlightSelectionMatches`
  styling, and shows the replacement count in the bar. No document mutation until Enter.
- `/pattern` → the standard incremental search; abort restores the pre-search position
  (this is the behaviour Emacs users check first).

**Rule:** a preview may change *viewport and decorations only*. It may never dispatch a
document change, never push edit history, never trigger a check. Enforced by running previews
through a wrapper that asserts `!tr.docChanged`.

### 6.5 Failure speech

Never silent, never modal. Every refusal answers with the nearest available thing:

```
:sp        → BelJar has one editor pane — no splits.  Try :max to hide the side panels.
:set nnu   → Unknown option "nnu". Did you mean "nu"?            [Tab to accept]
:q         → 2 unsaved buffers. :q! to discard, :wq to save.     y / n
C-f (emacs)→ (silent: Emacs owns it — the Keybindings sheet says so, the bar does not nag)
```

### 6.7 Discoverability capstone — the available macros

`keys.macros` (and `:help`) opens the existing **floating window**
([`floating-window.mjs`](../js/ui/floating-window.mjs)) with a live table generated from
`describe()`: sections, chords, ex names, M-x names — **filtered to the active style and the
detected platform**, with shadowed rows greyed and annotated. Nothing is hand-maintained, so it
cannot drift. This is also what makes the reserved-chord truth panel (§8.4) cheap: it is the
same generator with a different filter.

### 6.8 The Vim integration seam

1. Keep `vim()` with `status: false` — we do **not** want the package's own panel.
2. After mount, set `cm.state.statusbar = <the bar's vim slot>` and call
   `cm.state.vimPlugin.updateStatus()`.
3. Subscribe with `CodeMirror.on(cm, 'dialog', …)`. When `cm.state.dialog` is present, the bar
   moves to `command`/`search` and reveals the slot — the package's own `<input>` is mounted
   there, so **it keeps ownership of focus, keyup handling and lifecycle** while we keep
   ownership of the chrome. When absent, the bar returns to `status` and hides the slot (the
   package may keep writing `--NORMAL--` into a hidden node; harmless).
4. Our mode badge reads `cm.state.vim` (`vimModeLabel`, already written in
   [`keymap-style.mjs`](../js/editor-src/ide/keymap-style.mjs)); `cm.state.vim.status` supplies
   the pending-key display.

Pin the package version and add a seam test (same pattern as today's bundle-string assertions
in `tests/test-keymap-style.mjs`) so a bump that renames `state.statusbar` fails loudly.

### 6.9 The Emacs integration seam

```js
EmacsHandler.prototype.showCommandLine = function (text) {
  StatusStrip.open({ kind: 'command', prefix: text, source: 'emacs', view: this.view });
};
```

That single override turns `M-x` from a `console.error` into a working
execute-extended-command over the registry, with fuzzy completion on `mx` names. `M-g` →
`command` pre-filled for goto-line; `C-s`/`C-r` → `search` (real incremental search over
`SearchCursor`, not the existing search *panel*); `C-g` → abort with position restore.

The bar.s `message` state **is** the Emacs echo area, which is why routing editor messages
there is a fidelity feature and not just tidying.

---

## 7. Presentation spec

This section is normative. "Smooth" is not a vibe here; it is these rules.

### 7.1 Geometry and tokens

New token family in `css/tokens.css`, following the existing `--menu-*` / `--search-*`
convention:

```css
--strip-h: 1.625rem;                     /* == --icon-btn; slimmer than --panel-header-h */
--strip-bg: var(--chrome-bg-panel);
--strip-fg: var(--ui-fg-muted);
--strip-fg-strong: var(--ui-fg);
--strip-border: var(--chrome-divider);
--strip-pad-x: var(--pad-inline);
--strip-gap: 0.75rem;
--strip-seg-fg: var(--ui-fg-faint);
--strip-mode-bg: light-dark(hsla(222, 40%, 50%, 0.1), hsla(222, 40%, 70%, 0.12));
--strip-tint: var(--accent-mid);         /* re-pointed per mode; see 7.5 */
```

Layout: `display:flex; height:var(--strip-h); flex:0 0 auto;
border-top:1px solid var(--strip-border); background:var(--strip-bg)` — the exact mirror of
`.editor-topbar`, which is what makes it read as native chrome rather than an add-on.

### 7.2 Typography

| Element | Font | Size | Notes |
|---------|------|------|-------|
| Segment labels | `--sans` | `0.68rem` | matches `.bel-palette-item-detail` |
| Mode badge | `--sans` 650 | `0.62rem`, `letter-spacing:.04em`, uppercase | **reuses `.bel-palette-mode` exactly** |
| Position / counts | `--mono` | `0.68rem` | `font-variant-numeric: tabular-nums` |
| Typed command input | `--mono` | `0.72rem` | matches `.bel-palette-item-title.is-mono` |
| Goal type | `--mono` | `0.68rem` | truncates with `TextSlide` on hover |

Reusing `.bel-palette-mode` for the mode badge is deliberate: the same chip that says
`Commands` in the palette says `NORMAL` in the status strip. One vocabulary.

### 7.3 The three nevers

1. **Never shift layout.** The bar's height is fixed and reserved at mount. `command` state must
   not change it — the input replaces segments *within* the same 1.625rem row, and the
   candidate list is `position:absolute; bottom:100%` in an overflow-visible wrapper. Toggling
   the bar off removes the node (no hidden updates), which is the only height change allowed and
   it happens on a settings write, never during editing.
2. **Never reflow on a digit.** `Ln/Col`, match counts and hole counts use tabular numerals
   **and** a `min-width` sized to their maximum plausible width (`ch` units). A caret sweeping
   from line 9 to line 1000 must not move a single neighbouring pixel. *This is the classic
   status-bar bug and the fastest way to make the whole app feel cheap.*
3. **Never steal the caret silently.** When the bar takes focus, the editor renders a **dimmed
   resting caret** (`opacity: .35`, no blink) so the user keeps their place; on abort, focus
   returns to the exact prior selection. CM drops the cursor layer on blur by default — a
   small `Prec.highest` theme rule restores it under `.bj-strip-focused`.

### 7.4 Motion table

Everything below degrades to *instant* under `html.bj-motion-reduce` (already global, via
[`base.css:155`](../css/base.css)) and under `@media (prefers-reduced-motion: reduce)`.

| Transition | Treatment | Duration / easing |
|---|---|---|
| `status` → `command` | **Morph, not mount.** Segments fade to 0 and the input's width animates from the position segment's box, so the `:` appears to grow out of `12:4`. | `--overlay-pop-ms-in` (190 ms) `--overlay-pop-ease-in` |
| `command` → `status` | reverse, faster | `--overlay-pop-ms-out` (125 ms) `--overlay-pop-ease-out` |
| Candidate overlay in | translateY(4px)+fade, reusing the `bel-search-in` shape | 140 ms `ease-out` |
| Mode change (NORMAL↔INSERT) | badge text **rolls** vertically (100% → 0) while the tint crossfades | `--transition-fast` (75 ms) |
| Segment appear/disappear | width+opacity, so neighbours slide rather than pop | `--transition` (150 ms) |
| Message in | fade only (no movement — movement at the bottom edge reads as a bug) | 120 ms `ease-out` |
| Message out | fade after the existing **toast-duration** setting | 200 ms `ease-in` |
| Error (bad ex command) | 1-frame edge-strip pulse in `--ide-error-squiggle`, **no shake** (shake is reserved for chord recording, `bj-kb-chord-shake`) | 220 ms |
| Checker activity | reuse `ide-status-shimmer`'s conic-gradient mask verbatim | 1.6 s linear ∞ |

Two deliberate omissions: no slide-up on first mount (the bar is there from first paint), and no
transition on the *typed text itself* — input must feel instantaneous.

### 7.5 Mode as peripheral colour

An `--edge-strip`-style `::before` on the bar's left edge (2.5 px, `--edge-strip-radius`),
tinted by mode:

| Mode | Tint |
|------|------|
| Normal | `--muted-high` (neutral — the resting state should not glow) |
| Insert | `--accent-mid` |
| Visual | `--repl-holes-accent` (the magenta already reserved for "selection-ish" emphasis) |
| Replace | `--ide-status-warning` |
| Emacs, mark set | `--accent-mid` |

You learn your mode from the corner of your eye without reading a word. This reuses the
documented edge-strip pattern rather than inventing a treatment.

### 7.6 Cursor shape — ⛔ settled: BelJar's caret, always

A mode-aware block cursor shipped here and was **removed on 2026-09-01** at the user's request:
Vim uses BelJar's ordinary caret in every mode, and there is no setting. The package draws a
block cursor of its own, so `vimChromeTheme()` hides `.cm-vimCursorLayer` and `.cm-fat-cursor`
unconditionally; the probe asserts the fat cursor never reaches the screen and the plain caret
does. Keep the `::selection` restoration rule; do **not** reintroduce a `color` on `::selection`
(see `.cursor/rules/beljar-css.mdc`).

⛔ Do not reopen this. The argument *for* a block cursor (it tells a Vim user their mode without
looking) is answered by the mode badge in the status strip, which is always visible.

### 7.7 Accessibility

- The **message region only** is `role="status" aria-live="polite"`. The position segment must
  *not* be live, or every caret move spams the screen reader.
- The command input is `role="combobox"` with `aria-expanded` / `aria-activedescendant`,
  mirroring the palette exactly.
- Focus ring uses `--focus-ring`; the mode badge is `aria-hidden` (the mode is announced via
  the message region on change, once).
- Every clickable segment is a real `<button>` with an `aria-label` and a native tooltip via
  the project's tooltip convention (`data-tooltip`, never HTML `title` — see
  `.cursor/rules/beljar-tooltips.mdc`).

### 7.8 Feel checklist (acceptance gate)

Ship only when all of these hold, checked by hand on a large file:

- [ ] Toggling tabs 20× produces **zero** status-strip flicker or height change.
- [ ] Holding `j` for 3 s: no dropped frames, no width jitter in `Ln/Col`.
- [ ] Typing `:` never moves the code by a pixel.
- [ ] Caret is visibly *parked* (dim, not gone) while the bar has focus; `Esc` restores the
      exact selection and scroll.
- [ ] Line 9 → line 1000 → line 9: neighbouring segments never move.
- [ ] Reduced motion on: everything still works, nothing animates.
- [ ] Light and dark both pass at `--ui-text-contrast` 1.0 and 2.0.
- [ ] With no file open, the bar shows a sensible resting state (not a broken one).

---

## 8. Layer 4 — Vim depth

Because Vim lives on plain keys rather than Ctrl chords, **we can be genuinely faithful here**.
Everything below is reachable with the package's public API.

### 8.1 Leader map

Leader configurable (`\` default, `,`, `Space`), built with `Vim.map`:

| Keys | Command |
|------|---------|
| `<leader>f` | Go to file (palette, anywhere) |
| `<leader>p` | Command palette |
| `<leader>/` | Search project |
| `<leader>h` | Hole menu (intro/split/fill at caret) |
| `<leader>H` | Open hole in Harpoon |
| `<leader>o` | Orca start/pause |
| `<leader>r` | Run file · `<leader>R` run suite |
| `<leader>g` | Dependency graph |
| `<leader>d` | Diagnostics list |
| `<leader>e` | Explorer |

Pressing `<leader>` alone raises the which-key hints in the bar's `pending` state after 400 ms —
so the leader map is self-teaching and needs no memorisation.

### 8.2 `g`, `]`/`[`, and `K`

`gd` definition · `gD` cross-file definition · `gr` references · `gh` hover ·
`gi` inspector · `gp` peek · `K` hover doc ·
`]d`/`[d` declaration · `]h`/`[h` hole · `]e`/`[e` problem · `]c`/`[c` case branch ·
`Ctrl-O`/`Ctrl-I` jump list.

### 8.3 AST text objects (the standout feature)

`id`/`ad` declaration · `ih`/`ah` hole · `ic`/`ac` case branch · `ib`/`ab` block.
Implemented as `Vim.defineMotion('belInnerDecl', …)` returning `{start, end}` from the Lezer
tree via `tree-helpers.mjs` / `getDeclSpan` (already on the editor API), registered with
`Vim.mapCommand` for `operatorPending` and `visual` contexts. `dad` deleting exactly one
Beluga declaration is the kind of thing that makes a Vim user adopt an editor. **Gated on
Spike S3**; fallback is `<leader>`-prefixed object commands, stated plainly.

### 8.4 Ex commands

Concrete: `:w` (flush checkpoint + format-on-save), `:wa`, `:q` / `:q!` (close tab),
`:qa`, `:e {file}` (fuzzy path), `:b {buf}`, `:bn` / `:bp`, `:ls`, `:noh`,
`:run` / `:runs` / `:runp`, `:check`, `:holes`, `:harpoon`, `:orca`, `:graph`, `:sym`,
`:problems`, `:help`. `:s` / `:g` / `:%s` come from the package.

Two bridges avoid inventing 150 ex names:

- **`:BJ {command}`** — fuzzy-run any registered command by title or id.
- **`:set {option}`** — mapped onto the generated `set.*` family, so `:set nu`, `:set nonu`,
  `:set wrap`, `:set list`, `:set ts=4`, `:set hls`, `:set ic` all move real BelJar
  preferences, with nearest-match help on a typo (§6.5).

`:holes` and `:problems` are worth calling out: they answer **into the bar's candidate overlay**
with goal types and messages, not into a new panel. The bar becomes a general-purpose result
surface for one-shot queries — more capability, zero new UI.

### 8.5 Vim options worth shipping

- **`jk` / `jj` insert-escape** (configurable, off by default) — `Vim.map('jk','<Esc>','insert')`.
- **Relative line numbers** — a real new editor pref (`off | absolute | relative | hybrid`) via
  `lineNumbers({ formatNumber })`. Cheap, and the first thing a Vim user reaches for.
- **`clipboard=unnamed`** — unnamed register backed by the system clipboard
  (`Vim.defineRegister`). In a browser this is the difference between usable and infuriating.
- `hlsearch` (reusing `highlightSelectionMatches`' styling so results look native),
  `incsearch`, `ignorecase`, `smartcase`.
- **"BelJar chords in Insert mode"** — today's implicit `vimAllowsRemap` behaviour, promoted to
  a visible toggle.

---

## 9. Layer 5 — Emacs depth (and honesty)

### 9.1 The `C-x` / `C-c` maps

`C-x C-f` find file · `C-x b` switch buffer · `C-x k` kill buffer (close tab) ·
`C-x C-s` save · `C-x s` save all · `C-x o` focus other pane · `C-x 1` maximise editor ·
`C-x C-c` **deliberately unbound**, with a bar message. `C-x 2` / `C-x 3` answer *"BelJar has
no window splits"* rather than doing something surprising. `C-c` is the BelJar prefix:
`C-c C-h` holes, `C-c C-r` run, `C-c C-o` Orca, `C-c C-p` Harpoon.

### 9.2 Real incremental search

Replace the current `C-s`/`C-r` → `openSearchPanel` shim with true isearch in the bar: type to
match live, `C-s`/`C-r` to step, `Enter` accept, `C-g` abort **restoring the original
position**, `M-%` query-replace. The largest single fidelity gain in Emacs mode.

### 9.3 Prefix and universal argument display

The status strip's `pending` state renders `C-x -` while a chain is open and `C-u 4` for a pending
argument, read from `EmacsHandler.$data.keyChain` / `$data.count`, with which-key hints after a
delay for **our** prefixes (`C-x`, `C-c`) — not a reimplementation of the package's tables.

### 9.4 The reserved-chord truth panel

Generated by the same `describe()` machinery as the available macros (§6.7), filtered to conflicts,
**per platform**:

| Chord | Emacs meaning | Status here | BelJar substitute |
|-------|---------------|-------------|-------------------|
| `C-n` | next-line | Taken by the browser (Win/Linux) | `C-m`, or `Down` |
| `C-w` | kill-region | Taken by the browser (Win/Linux) | `C-S-w` |
| `C-t` | transpose-chars | Taken by the browser (Win/Linux) | `M-t` |
| `C-l` | recenter | Taken by the browser (Win/Linux) | `M-l r` |

with a banner that reads, on macOS: *"All Emacs chords are available on this platform."* That
sentence is the entire answer to "the setting oversells what we can do" — we stop selling and
start reporting.

### 9.5 Full keyboard mode (opt-in)

`keys.full-keyboard` → `navigator.keyboard.lock(['KeyN','KeyT','KeyW','Escape','Tab', …])`
after entering fullscreen; released on exit. Feature-detected, Chromium-desktop only, never
automatic.

**`Escape` must be in the lock list** — otherwise Esc exits fullscreen instead of leaving
Insert mode, which would be catastrophic for Vim users. The consequence (the browser's
"hold Esc to exit fullscreen") is stated in the toggle's description, and the bar carries a
visible **Exit fullscreen** affordance plus a bound command while the lock is held.

---

## 10. Layer 6 — gestures

`js/ui/double-tap.mjs`, publishing `gesture.double-tap` into the registry.

Detection (the part that gets it wrong if done naively):

- Track the last keyup of the trigger modifier and whether any non-modifier key went down
  since.
- Fire on the **second keyup** when: no other key was pressed between the two, no other
  modifier was held, `e.repeat` was false, and the gap ≤ the configured window.
- Suppressed while a chord recorder is active (`.bj-kb__chord.is-recording`), during IME
  composition, and while a modal dialog owns focus.
- Shift-for-capitals is naturally excluded by the "no other key between" rule.

Settings: trigger `Off | Shift Shift | Ctrl Ctrl | Alt Alt`, target command (any registry
command; default *Go to File*), speed `Fast 250 ms | Normal 350 ms | Relaxed 500 ms`. If the
target surface is already open, the gesture toggles it closed.

---

## 11. Layer 7 — the settings family

Rename the panel **Keybindings → Keys**. Groups top to bottom, each revealed by relevance so
the panel is never longer than the style in use:

**1 · Editing style** — `Standard | Vim | Emacs` (rename "Default" → "Standard"; "Keymap
style" → "Editing style"). Each option carries a one-line capability note, **platform-aware**
for Emacs.

**2 · Status strip** — `Off | Status only | Status + command line`.
Default: *Status only* under Standard, *Status + command line* under Vim/Emacs.
Sub-settings: detail level (`Compact | Standard | Detailed` — a preset that sets the segment
budget, not a chip salad); *Messages in the status strip instead of toasts*
(§6.6); *Chord hints* + delay.

**3 · Vim** *(style = Vim)* — leader key · insert-escape sequence · cursor shape · relative
line numbers · system clipboard as unnamed register · `hlsearch` / `ignorecase` / `smartcase` ·
*BelJar chords in Insert mode*.

**4 · Emacs** *(style = Emacs)* — **Reserved chords** truth panel (link) ·
*Full keyboard (fullscreen)* · `C-c` prefix map on/off.

**5 · Gestures** — double-tap trigger, target, speed.

**6 · Keybindings sheet** — registry-driven and much longer, so it gains a filter, the ex and
M-x names beside each chord, and — the key change — a **"live in this style"** indicator: a row
shadowed by the active style renders greyed with an inline reason (*"Emacs owns C-f"*,
*"Vim: Insert mode only"*).

✅ **Filter landed 2026-08-31** (pulled forward, since wave A would cross the point where a flat
list stops being findable). One input matching title, chord text and section, plus a live
`N commands · M bound` count; matching hides rows rather than re-rendering, so an in-progress
chord recording survives it, and empty section headers hide with their rows. The settings-wide
search now routes through `revealCommand(id)`, which clears the filter first — otherwise a hit
would scroll to a hidden row and appear to do nothing.

*Its visual treatment is worth recording as precedent, because the first attempt was wrong.* A
bordered, rounded search field inset into the gap fought the panel: the settings panel's whole
language is **full-bleed bands with a single hairline**, and a floating pill doubled the rule
the setting row above it already drew. The shipped version is a flush transparent strip with one
bottom hairline, no magnifier, and the placeholder on the same 1.35rem line as the panel head,
the setting titles, the section heads and every row — an unbroken left edge worth more than a
redundant glyph. The affordance moved onto behaviour: a faint wash on hover, and on focus the
hairline goes accent and the caret appears. **A filter is chrome, not a widget** — the same
instinct the status strip's status state will need in Phase 3.

⚠️ **Correction to this plan's earlier claim.** It said the sheet needed *lazy-rendered collapsed
sections* because "150 chord buttons must not all mount". That was wrong on both counts: 150
divs in a modal is nothing, and the real cost was `findConflict` resolving the whole table **per
row** with a `localStorage` read per candidate — quadratic in catalogue size, and invisible
until the catalogue grew. That is fixed at the source (one overrides read per call). Collapse
and an *All / Bound / Modified* switcher remain optional polish, not requirements.

### Onboarding

Switching to Vim or Emacs emits **one** status-strip message, not a modal:

```
Vim mode.  :  commands   ·   \  leader   ·   :help  available macros
```

Once per style per profile. That is the entire onboarding, and it is enough because the leader
map and the prefixes are self-teaching (§8.1, §9.3).

---

## 12. Escape / `C-g` routing

One ladder, documented and tested, first match wins:

1. Bar in `command`/`search`/`prompt` → cancel, restore pre-search position **and scroll**.
2. Autocomplete open → close.
3. Rename widget active → cancel.
4. Sticky hover / tooltip → dismiss.
5. Vim Insert or Visual → Normal.
6. Emacs → `unsetTransientMark`.
7. Multiple selections → collapse to primary.
8. Otherwise → no-op (never steal Esc from the browser's fullscreen affordance).

`C-g` in Emacs runs the same ladder. This replaces the current "Esc still dismisses rename,
autocomplete, and sticky hover in every style" prose in `KEYMAP_STYLE_HELP` with something
verifiable.

---

## 13. Performance invariants (Thread 2 is live — do not regress typing)

0. **Chord dispatch is O(1) reads per keystroke.** The global keydown listener is capture-phase
   and fires for *every* key in the app, editor typing included, then walks every global-scope
   command. Growing the catalogue took that set from 4 to 19, and `resolve()` used to read
   stored keybindings — a `localStorage` hit plus `JSON.parse` — once per command, so a single
   keystroke cost ~40 reads. It now reads **once** and threads the map through, and bails before
   touching the tables at all when the event carries no modifier and is not a function key.
   Nothing is cached across calls: an override written by another tab or a settings import has
   to take effect on the next keystroke. Pinned by `tests/test-keybindings-dispatch.mjs`
   (0 reads while typing, 1 per chord).
1. **No doc-scale work in the status strip.** `Ln/Col` from `doc.lineAt(head)` (O(log n)); never
   `doc.toString()`, never a re-parse, never a symbol walk.
2. **rAF-coalesced updates.** One `updateListener` that early-returns unless
   `selectionSet || docChanged || focusChanged`, writes to a scratch object, and flushes to the
   DOM once per frame. The bar is outside CM's measure cycle by construction (D5), so a DOM write
   cannot trigger a CM re-measure.
3. **Derived state is subscribed, never recomputed.** Diagnostics, hole counts and the goal at
   the caret come from the existing engine snapshot on settlement ticks
   (`buildIdeStatusPresentation` in [`ide-status.mjs`](../js/editor-src/ide/ide-status.mjs) and
   `hole-goal-system`). The bar owns no analysis.
4. **`when()` is snapshotted, not polled.** Availability predicates run once per palette/bar
   open against a frozen ctx — never per keystroke over 150 commands.
5. **Completion is capped and lazy.** Candidates built only in `command` state, capped at 60,
   ranked with the palette's existing `fuzzyScore`.
6. **Previews are debounced (90 ms) and revert-exact**, and asserted non-mutating (§6.4).
7. **Timers die with the surface.** Which-key, message and preview timers cleared on blur,
   style change, editor teardown and panel destroy.
8. **Status strip `Off` removes the node.** No hidden element receiving updates.
9. **Frecency writes are batched** (idle callback, capped map), never per command run.

Measure the way the memory says to: a full Chrome CPU profile parsed offline, STARTUP and
SETTLED separately. `BelJarPerf.report()` is not ground truth.

---

## 14. Tests (`npm test`, one invocation)

| Test | Asserts |
|------|---------|
| `test-command-registry.mjs` | register/override/`when`/scope resolution; id uniqueness; every `defaultSpec` normalises; `describe()` shape |
| `test-command-catalog.mjs` | no duplicate ids, ex names or `mx` names; every command has section + title; palette/keybindable flags coherent |
| `test-keybindings.mjs` *(extend)* | DEFAULTS-as-projection matches the old 16 ids exactly; stored overrides still resolve |
| `test-status-strip-parse.mjs` | `:12`, `:%s/a/b/g`, `:e path`, `:w!`, counts, bangs, ranges, garbage; arg-slot reporting |
| `test-status-strip-model.mjs` | state transitions incl. abort-restores-position-and-scroll; history ring; survives an editor teardown/rebuild cycle |
| `test-status-strip-complete.mjs` | ghost text; arg-kind switching; frecency as tiebreak only; unknown-option nearest match |
| `test-status-strip-segments.mjs` | **the five-segment budget**, priority drop order, quiet resting state = position only |
| `test-status-strip-preview.mjs` | a preview transaction is never `docChanged`; revert restores exactly |
| `test-keymap-style.mjs` *(extend)* | package seams: `state.statusbar`, `dialog` signal, `showCommandLine` overridable, `_mapCommand` priority |
| `test-vim-textobjects.mjs` | AST ranges for `id`/`ad`/`ih`/`ah` over fixtures |
| `test-reserved-chords.mjs` | platform table: macOS reports no reserved Ctrl chords; Win/Linux reports the documented set |
| `test-double-tap.mjs` | fires on Shift-Shift; **not** on Shift+letter, on repeat, or across an intervening keydown |
| `test-esc-ladder.mjs` | pure ladder resolution for every state combination |

Existing `test-command-palette.mjs` and `test-keymap-collisions.mjs` must keep passing
unchanged where they encode real behaviour, and be updated deliberately where policy tables
move.

---

## 15. Phasing

*All eight phases are complete. What follows is how each was scoped and what actually happened.*

**Phase 0 — spikes** (half a day; each answers a yes/no that changes the design). **All five
answered:** S1 measured (§L, Windows; macOS outstanding), S2 and S3 confirmed by driving a real
`:` and a real `dad`, S4 measured and positive (§L), S5 shipped as `showCommandLine`.

- **S1 — reserved-chord probe.** A `scratch/probes/` page that logs every keydown it receives
  and whether `preventDefault` suppressed the browser action, on Chrome Win + Chrome mac.
  Produces the §2.3 table as *measured* data. Do not ship the table unmeasured.
- **S2 — the shell-strip seam (D5).** Point `cm.state.statusbar` at a node **outside**
  `.cm-editor`; confirm the `:` input mounts, takes focus, handles keys, and returns focus
  cleanly on close. This is the load-bearing spike; the fallback is a CM panel styled
  identically.
- **S3 — custom text objects.** `defineMotion` + `mapCommand('id','motion',…)` in
  `operatorPending` — confirm it beats the built-in `i<register>` wildcard.
- **S4 — Keyboard Lock.** `lock()` incl. `Escape` in fullscreen; confirm reclaim and clean
  release.
- **S5 — Emacs `showCommandLine`.** Prototype override survives the bundler (the package's
  `bindKey` calls are `@__PURE__`-annotated and were dropped once by esbuild minify — see
  `ensureEmacsKeys`; assume nothing).

**Phase 1 — registry. ✅ LANDED 2026-08-31.** `js/commands/` (registry, catalogue, context,
names) published as `window.Commands`; `Keybindings.DEFAULTS` and the palette's command list are
now projections of it, and `app-command-palette.mjs` attaches behaviour to ids instead of
restating titles. 33 commands catalogued, the shipped 16 chords and the 24 palette rows
byte-identical. New: `tests/test-command-registry.mjs`, `tests/test-command-catalog.mjs` — the
latter pins the palette's shipped order, asserts the style-policy tables agree with
`keymap-style.mjs`, and asserts `shell.js` bundles exactly one registry instance.
**No visible change.** `npm test` 214/215 (`test-project-chaos.mjs` fails identically on a
stashed baseline — pre-existing, unrelated).

Two deliberate carry-overs into Phase 2: `keybindable` stays limited to the shipped 16 (widening
it changes the Keybindings sheet, which is a UI change, not a refactor), and `keymap-style.mjs`
still owns its own policy arrays — the new catalogue test is what keeps the two honest until the
editor side reads `Commands.idsWithStyle()` directly.

**Phase 2 — catalogue waves A–G. ✅ COMPLETE 2026-09-01: 147 commands, every one runnable.**
All seven waves shipped — A (motions), B (structure motions + jump list), C (editing verbs),
D (file/tab/suite), E (Harpoon + proof reports), F (the generated `set.*` family), G (meta).
111 in the palette, 138 bindable, 116 nameable on the command line (the 31 motions are
deliberately off it). Ships value through the *existing* palette and keybindings sheet as well as
the bar. **The per-wave detail is in §0.5, which is the live list; the paragraphs below are how it
looked mid-flight.**

*Landed:* 46 palette entries (was 24), 42 bindable (was 16). Tabs (`tab.next/prev/close`),
`edit.rename` / `edit.select-all` now palette-reachable, semantic navigation
(`nav.enclosing-decl`, `nav.binder`, `nav.inspector`, `nav.next/prev-problem`, plus
definition / references / holes reachable from the palette for the first time), the four
Prover hole moves gated on a hole under the caret, `fold.all` / `fold.unfold-all`,
`view.library` / `view.harpoon`. Editor-scope commands reach the editor through
`window.CurrentEditor` across the existing seam — no ES import crosses, and no new editor-src
module was needed because the editor API already exposed almost all of it.

*Two rules established here, both worth keeping:*
- **New commands arrive unbound.** `keybindable: true` with no `defaultSpec`: bindable, listed
  in the sheet as `—`, reachable from the palette meanwhile. Only the shipped 16 carry default
  chords, and `test-command-registry.mjs` pins that set. Inventing chords is how a keymap ends
  up fighting the user's own.
- **`when()` is the has-a-file gate.** Editor commands disappear from the palette when nothing
  is open, and the Prover moves appear only when the caret is standing in a hole.

*D3 landed early:* `keymap-style.mjs` now reads the catalogue at runtime via `policyIds()`
(memoized on the registry version, since `vimAllowsRemap` is on the keystroke path). Its arrays
survive as an offline fallback, and `test-command-catalog.mjs` pins them as a faithful subset —
the cross-check test caught this drift the moment the new commands declared `vim: 'always'`,
which is exactly what it was written for.

*Remaining:* wave A (motions, ~30) and wave C (editing verbs, ~25) — both need a new
`js/editor-src/ide/editor-commands.mjs` attaching CodeMirror commands at mount, since the shell
cannot import `@codemirror/commands`. Wave B's AST-dependent half (`nav.next/prev-decl`,
`nav.next/prev-case`, `nav.hover`, and a real `nav.jump-back/forward` jump list over
`jump-log.mjs`). Wave D's `file.save` / `suite.*`. Wave E's Orca/Harpoon session commands.
Wave F's generated `set.*` family. Wave G waits on the bar.

*Also landed (2026-08-31, second pass):*
- **The sheet filter** (§11 · 6), pulled forward ahead of wave A.
- **Chord-dispatch cost** (§13 · 0) — growing the global command set from 4 to 19 had made every
  keystroke in the app do ~40 `localStorage` reads on a capture-phase listener. Found by reading
  the code the catalogue growth touched, not by a profile; fixed and pinned by a test.
- **`npm run probe:keymap`** — a committed browser probe (`scripts/probe-keymap.mjs`)
  that boots the real app in headless Chrome and checks what unit tests cannot see: registry
  identity on the page, palette row/section rendering, `when()` gating, the sheet's rows,
  headers, filter and empty state, and a clean console. It caught nothing broken but four wrong
  assumptions of mine — most usefully that the palette shows **38 of 46** commands in an empty
  workspace, because `when()` correctly hides the 4 Prover moves, both suite Run commands, and
  both tab-step commands. This is the instrument §7.8's feel checklist will need.

**Phase 3 — the status strip. ✅ COMPLETE** (landed 2026-08-31 after a design reversal; see §E–§J for the corrections that followed).
`js/status-strip/` (pure `status-strip-segments.mjs` + `status-strip-view.mjs` → `window.StatusStrip`),
`js/editor-src/ide/status-strip-feed.mjs`, `css/status-strip.css`, a
`Status strip: Standard | Compact | Detailed | Off` setting, and `beljar-status-strip` in Persist.
The relic in-editor `vimModePanel` is deleted — the mode now lives in the bar, once.

⛔ **§6.2's "quiet by default" is REVERSED. Do not restore it.** That section argued a status bar
should say almost nothing, and a clean file should show only `12:4`. Shipped, it was obviously
wrong: *a bar that costs a row of vertical space and shows one number makes users angry it exists
at all.* The rule that replaced it:

> **Earn the row.** A segment belongs if it tells you something you cannot already see. The tab
> strip shows filenames and the explorer shows the tree, so neither is in the bar. What is
> nowhere else — and therefore is: **the goal at the caret**, **holes left**, problems in words,
> what the checker is doing, declaration count, and whether Orca is searching.

The goal and hole count are the point. A proof assistant's status line should answer *how far am
I from done*, and BelJar surfaced that nowhere without opening a panel. Verbosity is the user's
call (Compact 3 / Standard 4-9 / Detailed +decls), never a hidden cap.

**It is full-width**, the last in-flow child of `<body>`, not a per-pane strip: it reports on the
session — checker, Orca, problems — not on one editor. **On by default for every style**, because
it is not a modal-editing accessory. `Off` removes the node entirely.

Right-aligned via a `spacer` segment: proof state left, checker right. Every segment is
clickable — position → go-to-line, holes → next hole, goal → Harpoon, problems → next problem,
checker → run. (A `Ctrl+Shift+P Commands` affordance was tried and cut: the bar is for state you
cannot otherwise see, and a keyboard hint is not state.)

**Orca is watchable from the bar.** Harpoon's `pulseLabel` mirrors each search pulse into
`StatusStrip.setOrca()`, so the search is visible without the panel open. The segment is
**self-expiring** — Orca pulses while it works, so six seconds of silence means finished,
cancelled or dead. Deriving the end from silence beats hunting every exit path in the lab and
leaving the bar stuck on "searching…" when one is missed.

**Mode tint (§7.5) landed**: a flush `::before` edge strip on the bar, tinted per Vim mode
(insert/visual/replace/normal), using the documented edge-strip treatment. You read your mode
from the corner of your eye without looking down.

**Perf held through the redesign** (§13): the feed still early-returns unless selection/doc/focus
moved and coalesces to one rAF; the goal read reuses the same `holeAtCursor` the palette already
gates on; holes/decls/parse% are read **only** on settlement ticks (`beljar:file-lint`,
`beljar:hole-goals-updated`), never on the typing path; the view skips any repaint whose segment
signature is unchanged.

Verified in the real app by `npm run probe:keymap` — full width, on the window's bottom edge, 26px,
zero relic vim panels, and a typed `rec f : [ |- nat] = ?;` producing a live `1 hole`.

**Status parity with the topbar dot (2026-09-01).** The bar's checker segment hosts a *real*
`.ide-status-dot` — same class, so `data-live-state`, the conic checking shimmer and the rich
lint tooltip all come from the existing `ide.css` rules instead of a lookalike. `editor.mjs` now
drives **every** `.ide-status-dot` on the page from one place (`statusDots()`), so the two can
never disagree. The node is created once and reused across repaints; re-creating it per paint
would restart the spinner mid-spin.

Exactly one dot is on screen: while the bar is up it sets `html.bj-strip-owns-status` and the
topbar dot is hidden; turn the bar off and the topbar dot comes back unchanged.

Click semantics match the split the topbar dot and the Run button already make between them:
**broken → go to the next problem; clean → run**. "Run" means `run.default`, which is the Run
button's own resolution (a suite member runs the suite *up to and including* itself, an isolated
file runs alone) — and `btn-load` now calls that same command, so the button and the bar cannot
drift apart.

**Orca now reports truthfully (2026-09-01).** The six-second silence expiry is gone. Harpoon
pushes from `nativeAuto.phase` — its own authority on whether a search is live — via one
`pushOrca()` helper called on every search pulse, on stop, and in the promise chain's `finally`.
Paused searches say `paused` rather than freezing on a stale label. Inferring the end from
silence made the bar lie whenever a search went quiet while still running.

**The goal renders as real Beluga (2026-09-01).** It is syntax-highlighted through the same
`renderTypeInto` the inspector, hover and Harpoon use, sitting in the hole-identity *wash*
(`--ide-hole-bg`) rather than being tinted flat — a single accent colour throws away the
structure that makes a type readable at a glance. The turnstile is a separate marker, so the
type itself reaches the renderer clean.

⛔ **`normalizeType` runs in the bar as well as in the editor's feed.** Beluga's output is ASCII
(`|-`, `->`, `=>`); `normalizeType()` in `format/type-render.mjs` is the *only* place those become
`⊢ → ⇒`, and it is opt-in — which is why raw `|-` keeps resurfacing across the app. The bar
normalizes at the render site so it cannot depend on every future producer remembering.
`tests/test-turnstile-display.mjs` enforces the rule repo-wide: any goal or type interpolated
into prose must pass through the normalizer, with an allowlist for code that emits Beluga
*source* (where ASCII is correct).

**Nothing that looks pressable may be a no-op.** The mode badge was a button whose action was
`focus-editor` — which does nothing whenever the editor already has focus, i.e. nearly always.
It is a plain label now. A test pins the rule.

*Still open:* the goal segment is exercised through the hole count in the probe, not yet with a
settled goal type; and the suite segment (which development a file belongs to) remains.

**Phase 4 — the command line. ✅ COMPLETE** (core 2026-09-01; rebuilt as one state machine across all three faces 2026-09-02, §I). Pure grammar
(`status-strip-parse.mjs`), argument-aware completion (`status-strip-complete.mjs`) and the
inline UI (`status-strip-line-ui.mjs`), reached by the `cmdline.open` command.

*What works:* line addresses (`42`, `42:8`), commands by ex alias / id / title, the bang
(`w!`), arguments, **ghost text** completing inline, a candidate list that rises above the bar,
Tab/→ to accept, ↑↓ to walk candidates, a session history ring, and an **echo area** — an
unknown command answers `Unknown command "fmtt". Did you mean "fmt"?` in the bar rather than a
dialog. Completion is argument-aware: the parser reports which slot the caret is in, so `e `
switches from command names to file paths before a character is typed.

The line takes the whole bar while open (two competing rows would halve both) and the bar's
height never changes — the candidate list is out of flow.

⚠ **CSS lesson, paid for in probe runs:** the list was anchored with `bottom: calc(100% + …)`
and landed *inside* the bar. Percentage `bottom` resolves against whichever ancestor happens to
be positioned, and three plausible ancestors here differ by a few pixels. It is now anchored
from the bar's measured rect in JS (`anchorList()`). Do not "simplify" it back to a percentage.

### ✅ Spike S2 holds — Vim's `:` lives in the bar (2026-09-01)

`cm.state.statusbar` points at a slot inside the status strip, so **Vim mounts its own `:` and
`/` inputs there**: the package keeps its input, focus handling and ex parsing, the bar keeps
the chrome. Verified in the real app by driving an actual `:` keystroke, not an API call —
input present, focused, bar in its vim-line state, and **zero** stray `cm-vim-panel` below the
editor. That was the load-bearing risk in D5 and it is now measured, not assumed.

The slot only becomes visible while a dialog is open: the package writes `--NORMAL--` into that
node on every mode change, which the bar's own badge already says.

**BelJar commands are real ex commands.** `registerVimExCommands()` walks the catalogue and
`Vim.defineEx`s every command carrying an ex alias (9 today), plus **`:BJ <name>`** as the
catch-all so the other ~40 are reachable without inventing a name each. Vim keeps `:s`, `:g`,
`:%s` — reimplementing those would be strictly worse than what the package already does.
The probe asserts `:BJ Toggle Theme` actually flips the theme *through vim's own dispatcher*.

**Emacs `M-x` opens our command line.** `EmacsHandler.prototype.showCommandLine` shipped as
`console.error("TODO")`; implementing it is M-x. Emacs has no ex language to defer to, so it
gets the bar's own line — with ghost completion over the registry.

### ✅ Phase 4 complete (2026-09-01)

**Live preview**, to the §6.4 contract — viewport and decorations only, never the document.
Typing `:180` scrolls line 180 into view on a 90 ms debounce **without moving the caret**;
aborting puts the scroll back. The restore has to run again on the next frame: a preview's
`scrollIntoView` effect lands on CodeMirror's *next* measure, so a synchronous restore alone is
silently overwritten.

**History persists** (`beljar-command-line-history`, capped at 50). ↑/↓ walk the ring when the
line is empty and the candidates when it is not — keyed off the text, not the candidate count,
because an empty line lists every command and the count is never zero.

**Real incremental search.** `ed.searchFrom(query, from, forward)` is the editor-side primitive;
the bar drives it per keystroke, selecting the live match — which lights up the others through
the editor's existing selection-match highlighting rather than a second mechanism. `n/m` counter,
`no match` in the error colour, `C-s`/`C-r` (or ↑/↓) to step, Enter to accept, **Escape restores
the caret AND the viewport**. That last part is the half of Emacs `C-s` a find panel cannot
imitate, and it is why `C-s`/`C-r` no longer open the search panel.

Vim keeps its own `/` — the package's search is real vi search, mounted in our slot.

**Phase 5 — Vim depth. ✅ COMPLETE 2026-09-02** — text objects incl. `ic`/`ac` (§J), relative line numbers (§M), yank-to-clipboard (§J), which-key (§I). `js/editor-src/ide/modal/vim-setup.mjs`.

*Landed, all through the package's public API and all verified by driving real keystrokes in
headless Chrome — not by calling an API:*

- **`g` and bracket motions.** `gd` definition · `gr` references · `gD` enclosing declaration ·
  `gh` binder · `gi` / `K` inspector · `]h` `[h` holes · `]e` `[e` problems. The probe presses
  `]h` and asserts the caret actually moves to the hole.
- **A leader map** (`\` by default): `` palette, `\p` command line, `\/` project search,
  `\s` symbols, `\h` intro at hole, `\H` open in Harpoon, `
` run, `\g` graph, `\e`
  explorer, `\d` next problem. Probed by pressing `` and asserting the palette opens.
- **`:set` onto real preferences** — `nu`/`nonu`, `wrap`, `list`, `ts=2|4`, `spe`, `cul`, with vi
  abbreviations. A typo answers *`Unknown option "numbr". Did you mean "number"?`* (longest
  shared prefix, so it suggests the full name rather than the two-letter alias that happens to
  match first). Probed end to end: `:set nowrap` through vim's own ex line flips the stored
  preference and the bar confirms it.
- **`jk` / `jj` insert-escape**, off unless configured.

**Every binding is a command id.** `defineKey` maps keys to `Commands.run(id)`, so a Vim binding
can never do something the palette and the Keybindings sheet do not also know about — and an
unavailable command answers in the bar instead of doing nothing.

### ✅ Spike S3 resolved — AST text objects work (2026-09-01)

`Vim.defineMotion` + `Vim.mapCommand` **does** outrank the built-in `a<register>` / `i<register>`
wildcards, because `_mapCommand` unshifts onto `defaultKeymap`. So `id` / `ad` are real Vim text
objects backed by the Beluga AST: **`dad` deletes exactly one declaration**, `yad` yanks one,
`cid` changes its body. Verified by driving `dad` in a real editor over a two-declaration file
and asserting the other declaration survives untouched — not by reading the package source.

**Cursor shape** was reworked here and then removed entirely — see §7.6. The one lesson worth
keeping from it: two `!important` theme rules at the same precedence resolve by StyleModule
insertion order, which is *not* the extension-array order and is not something to rely on. Emit
rules conditionally rather than overriding them.

**Settings landed** for the Vim options that had no UI: leader key (`\` / `,` / Space) and the
Insert-escape sequence.

*Remaining in Phase 5:* `ic`/`ac` (case branch) text objects — they need a case-branch span the
editor does not expose yet. **`ih`/`ah` was dropped on purpose**: a hole is a single `?`, so a
hole text object is `x` with extra steps. **Relative line numbers are deferred, not forgotten** —
CodeMirror's line-number gutter re-renders on doc and viewport changes but *not* on selection
changes, so a correct implementation needs a gutter that updates per caret move, which is
exactly the kind of per-keystroke work Thread 2 exists to prevent. It deserves its own pass, not
a rushed one. **`clipboard=unnamed` is not faithfully possible**: `navigator.clipboard.readText`
is async and a Vim register read is synchronous, so a register backed by the system clipboard
would lie. The honest version — yank also writes to the clipboard, paste stays on the OS chord —
is worth doing but is not what `set clipboard=unnamed` means, so it should not claim the name.

**Phase 6 — Emacs depth. ✅ COMPLETE 2026-09-02** — `M-x` with its own prompt and M-x names, `C-g`, `C-n`/`C-p`, and the `C-x` prefix in the badge (§I).
`js/editor-src/ide/modal/emacs-setup.mjs` + `reserved-chords.mjs`.

*Landed:*
- **The `C-x` map** — `C-x C-f` / `C-x b` find file, `C-x k` kill buffer, `C-x g` graph,
  `C-x p` symbols.
- **`C-c` as the BelJar prefix** — `C-c h` intro, `C-c s` split, `C-c f` fill, `C-c p` Harpoon,
  `C-c r` run, `C-c e` next problem, `C-c n` next hole, `C-c d` definition, `C-c g` graph.
- **Declines answer.** `C-x C-c` → *"BelJar runs in a tab — there is nothing to quit."*;
  `C-x 2` / `C-x 3` → *"BelJar has one editor pane; there are no window splits."* Silence reads
  as a broken keymap, and inventing an analogue for something the app cannot do is worse.
- **The settings copy is platform-aware at last** — the answer to the original complaint. Emacs
  now reads *"On this platform every Emacs chord reaches BelJar: macOS browsers reserve Command,
  not Control"* or names exactly which four chords Chromium keeps and what BelJar binds instead.
  One option no longer means two different things in silence.

⛔ **Second keys in a chain are plain letters, never control chords.** `C-c C-n` would be
unreachable on Windows/Linux — pressing it opens a browser window *mid-chord*. The rule and its
reason live in `reserved-chords.mjs`.

⚠ **Two stale-state bugs found while measuring the bar, both real:** `is-vim-line` (the class
that hands the bar to Vim's own `:` line) stuck after a completed command, hiding the segment row
permanently. `vim.status` outlives the sequence that set it, so it is now read **only while the
editor has focus** — pending keys cannot exist while the palette owns the keyboard — and
`vim-command-done` clears the takeover outright rather than re-deriving it from status.

⚠ **The handler names keys from `e.code`**, stripping only `Key`/`Numpad` — so a digit arrives as
`Digit2`, not `2`. `bindKey('C-x 2')` alone silently never fires; `chordVariants()` binds both
spellings. The probe caught this by pressing the real chord and finding a stale message.

*Remaining in Phase 6:* which-key / prefix display in the bar's `pending` state, the reserved-chord
panel as a settings sheet (the data and the copy exist; only the sheet is missing), and
full-keyboard mode via Keyboard Lock (spike S4).

**Phase 7 — settings family + gestures. ✅ COMPLETE 2026-09-01.**

### ✅ "Live in this style" — D3 pays off (the original complaint, answered)

The Keybindings sheet now tells the truth about the **active** editing style. A chord the style
has taken away renders greyed with the reason beside it — *"Emacs owns this chord"*,
*"Vim: Insert mode only"* — instead of sitting there implying it works. Six rows are marked
under Emacs, six under Vim, none under Standard. The notes come from `Commands.describe()`, so
the sheet cannot drift from the keymap, and the sheet rebuilds on every open because the notes
are only correct for the style in force at render time.

This is the defect the whole effort started from: *"the current setting oversells what we can
actually do."* It is now structurally impossible for the sheet to advertise a binding the editor
has claimed.

⚠ **Bug worth remembering:** the first version read Persist through `p0`, a local of the settings
*builder*, from `buildRow` — a different scope. The `try/catch` swallowed the ReferenceError and
every style silently reported as Standard. A catch that turns a bug into a plausible default is
worse than no catch; the probe found it only because it asserted counts per style rather than
"does it render".

### ✅ Double-tap gesture (§9)

`js/ui/double-tap.mjs` — Shift Shift (or Ctrl / Alt) to run a command, off by default, with a
speed preset. Detection is the whole job, and the rules are pinned by `tests/test-double-tap.mjs`
plus a real-DOM probe: it fires on a clean pair, and **not** when a key falls between the taps
(which is what makes typing capitals safe), not on auto-repeat, not with another modifier held,
and not while a chord recorder has focus.

### ✅ The echo area: in the gap, so a message costs zero layout shift

⛔ **A message never moves anything.** It renders **immediately after the spacer** — leftmost of
the right-hand group — so the spacer gives up the width and neither the position segment nor the
checker shifts by a pixel. Appending it to the end of the bar (the first version) pushed the
checker left every time something spoke. It is `flex: 0 1 auto; min-width: 0` with a 46% cap, so
it ellipsises rather than shoving when the gap runs out. The probe measures the left edge of both
groups before and after, and separately asserts the segment row is actually laid out first —
otherwise "nothing moved" is trivially true against a collapsed bar, which is exactly the trap it
fell into.

### ✅ The echo area is transient, right-aligned, and animated

⛔ **A message never replaces the bar's content.** It rides the right edge behind a hairline while
the position, holes and checker keep speaking — a status bar that blanks itself to say one thing
has stopped being a status bar. It **fades in and out** (160 ms, translate-and-opacity, honouring
reduced motion) and holds for **3.2 s**: something that appears and vanishes without motion reads
as a glitch, and something that lingers becomes furniture. The probe measures the fade mid-flight
(opacity 0.50 → 1 → 0) rather than trusting that a class was applied.

### ✅ Relabels

The panel is **Keys**; the setting is **Editing style**; the neutral option is **Standard**, not
"Default" — it is a real choice, not an absence of one.

*Remaining in Phase 7:* the grouped layout inside the Keys panel (the rows exist but are still a
flat list), a command-target picker for the double-tap gesture, and the generated available macros
(§6.7) — which is the reserved-chord sheet's shape with a different filter, so it is mostly
assembled already.

**Phase 8 — docs. ✅ COMPLETE 2026-09-02.** This file closed and indexed (§0.4, §0.5). ⛔ The user-facing chord reference is NOT a document: `keys.macros` generates it from `describe()`, so it cannot drift. Writing a static one would be a second copy of the keymap.

Phases 1–3 are independently shippable and each leaves the product better than it found it.
If the work is ever cut short, **cut from the tail** — a shipped Phase 3 with nothing after it
is a genuinely better editor; a half-built Phase 4 is not.

---

## 16. Risks

| Risk | Mitigation |
|------|-----------|
| Vim ex input misbehaves outside `.cm-editor` (D5) | Spike S2 first; CM-panel fallback is pre-designed |
| Package internals shift on a version bump | Version pinned; seam assertions in `test-keymap-style.mjs` fail loudly |
| Registry refactor destabilises the palette | Phase 1 ships with **zero** behaviour change and the existing palette tests as the gate |
| 150 chord rows make the settings sheet heavy | Lazy section rendering; motions collapsed by default |
| The status strip drifts into a segment dumping ground | The five-segment budget is enforced in `status-strip-segments.mjs` and asserted in tests, not left to discipline |
| Status updates regress typing | §13; profile STARTUP and SETTLED separately before and after Phase 3 |

---

## 17. Explicitly not doing

- **Window splits** (`:sp`, `C-x 2`). BelJar has one editor pane. The status strip says so.
- **`:!` shell / `:term`.** No shell exists in the browser.
- **Registers/macros across files**, `:mksession`, `.vimrc` / `init.el` parsing.
- **A second command list.** If it is not in the registry it does not exist; no surface may
  register its own private commands.
- **Claiming chords the browser owns.** No binding is offered that cannot fire, in any UI.
- **Style-specific *default* rebinding of the 16 existing chords.** Users' stored overrides are
  sacred; style policy may shadow a chord, and must then say so.
- **A settings switch per segment.** Detail-level presets only — the budget is the design, and
  handing it to the user is how status bars become junk drawers.

---

## T. The correctness pass — 2026-09-03

*Reopened on the question "is this actually working, and can it be supported without me?"
Four things had shipped that a surface promised and the code did not deliver. All four share a
root cause — **a fact stated in two places instead of derived from one** — and all four were
invisible to a suite sitting at 236/236.*

### T.1 62 of 74 bindable editor commands were dead keys

`buildEditorKeymap` walked every `scope: 'editor'` catalogue entry, built a CodeMirror entry
for each resolved chord, and looked the id up in a table of twelve hand-written runners in
`editor.mjs`. The other 62 — the 31 motions, their selection twins, the line edits, the nav
verbs, the prover verbs, the fold commands — found nothing and returned `false`.

The Keybindings sheet offered them. `setBinding` accepted the chord. The settings panel
displayed it. The key did nothing, and no surface said so. This is exactly the failure mode
§0.4 already had three separate laws against, arrived at from a direction none of them
covered: not a chord the browser eats, not a chord a style takes, but a chord **BelJar itself**
accepted and never wired.

`test-editor-commands.mjs` even carried the comment *"a motion or selection entry with no
behaviour would sit in the Keybindings sheet accepting a chord that does nothing"* — it
checked the **registry**, which was complete, and never the **keymap**, which was not.

**Fix.** The rule moved into the projection, so the bug becomes unrepresentable: a named
runner wins, else `opts.fallback(id)`, else the entry is **skipped**. `editor.mjs` passes a
fallback that goes through `Commands.run(id)`. The style gate still applies, so under Vim these
stay `insert-only` and Normal mode is still Vim's. Skipping rather than emitting matters: an
entry returning `false` still shadows the key for lower-precedence keymaps.

**Held by** `tests/test-editor-chords.mjs` — binds all 74, runs all 74, asserts each fired;
asserts a named runner still wins; asserts that no runner and no fallback emits nothing — plus
one browser check in `probe:keymap` that binds `motion.line-up` and watches the caret move.

### T.2 Two of the three Vim leaders had never worked

The dropdown offered Backslash, Comma and Space. Only Backslash did anything, ever.

`commandDispatcher.matchCommand` takes `matches.full[0]` — **a full match wins outright and
never waits for a partial one.** So a leader that is itself a complete vim command can never be
a prefix: `,` is `repeatLastCharacterSearch` and `<Space>` is a `keyToKey` alias for `l`. Press
either, vim runs it, and the second key arrives to a cleared buffer. Space had a second bug on
top: a literal space is spelled `<Space>` in a vim keymap, so a leader sequence built from
`' '` was a sequence no keypress could ever produce.

And underneath both, the leader was only mapped once per page: `installVimBindings` had an
`installed` guard, so changing the dropdown wrote a preference nothing read until reload —
while which-key, which reads the *stored* value, began advertising the new leader immediately.
The setting and the keymap disagreed and every surface sided with the setting.

**Fix.** `applyLeader()` unmaps the old sequences and maps the new ones on every call;
`leaderKeys()` gives vim its spelling and `leaderLabel()` gives the reader theirs; and
`LEADER_TAKES` takes the key off vim when vim already owns it, handing it back when the leader
moves away. That is what real vim's `mapleader` does, and it is why `,` and `<Space>` are the
two most common real-world leaders. `applyModalPrefs()` is called from the settings rows.

Two package details worth keeping: `Vim.unmap(keys, ctx)` matches on `command.context === ctx`
and a **builtin carries no context**, so passing `'normal'` silently matched nothing; and it
removes only the first match and reports whether it found one, so the call is drained in a loop.

**Held by** `probe:keymap`, which now types all three leaders, asserts each leaves a *pending
prefix* — proving it is a prefix and not a command — and asserts the palette opens, each with a
focus CONTROL, because an unfocused probe and a dead leader are indistinguishable.

### T.3 The settings panel named substitutes that cannot be pressed

`emacsPlatformNote()` was a hand-written sentence sitting beside `reserved-chords.mjs`. When
that table was **measured** on Chrome 152 (§L), the sentence was not updated. It went on:

- naming **Ctrl+L** as reserved — it is not; `recenter` works and needs no substitute;
- offering **Alt+L** as its substitute — nothing binds Alt+L;
- offering **Ctrl+Shift+W** for kill-region — itself reserved, so unpressable; the measured
  answer is Ctrl+Q;
- omitting Ctrl+Shift+P and the whole Ctrl+digit range.

`emacsFidelity()` had been computing the correct sentence from the measured table the whole
time, and the Reserved chords sheet had been rendering it correctly. Nothing called it here.

**Fix.** Derived from `reservedChordFacts().fidelity`, read lazily — the help object is built at
module load, long before `BelEditor` exists, so `paragraphs` is a function now. The Vim and
Emacs paragraphs also stopped enumerating keys: the leader is configurable, so a sentence
naming a backslash sequence is wrong for anyone who picked comma, and Available macros lists
the live maps anyway.

### T.4 41 style bindings were listed nowhere

Vim's 16 normal maps, its 10 leader maps and Emacs' 15 chains are real, invocable bindings on
ordinary command ids — and they appeared in **no listing in the app**. The Keybindings sheet
projects `Keybindings`, which has never heard of them. The palette lists commands, not keys.
Available macros asked `Commands.describe()`, which only knows BelJar's own chord table. The
only way to find `]h` was to hold `]` for 400ms and read which-key — a discovery path that
requires already knowing the key exists.

**Fix.** `modal/style-macros.mjs` exports the maps as data, with the leader expanded and titles
resolved through the registry, so a row cannot name a key that is not mapped. Available macros
leads with them: *Vim keys · Vim leader · BelJar keys · Command line*. `readableKeys()` turns
vim's `<C-o>` config syntax into `Ctrl+O` — the other rows read `gd`, the neighbouring block
reads `Ctrl+K`, and `<C-o>` was the one row nobody could act on without knowing the notation.

### T.5 Two structural cleanups

- **`keymap-style.mjs` was 700 lines holding four unrelated jobs.** Split into
  `modal/style-policy.mjs`, `modal/vim-runtime.mjs`, `modal/emacs-runtime.mjs`,
  `modal/which-key-hint.mjs` and `modal/undo-route.mjs`. What remains is a 106-line assembler
  that re-exports the whole previous surface, so nothing else changed. `probe:keymap` presses
  every binding, which is what makes a refactor this size safe.
- **The vim package's bottom mode PANEL was dead code**, superseded by the status strip —
  builder, theme rule, and a duplicate `vimModeLabel`. Both `probe.mjs` and `probe-keymap.mjs`
  already asserted `.cm-vim-panel` count is zero, which is how it was found.

### T.6 Settings symmetry

Vim had three options under its own heading and Emacs had none, which read as "Emacs is the
afterthought". Emacs has no preference worth inventing — what it has is a platform cost, and
this panel is where someone about to choose it is standing. It gets a head and one action row
whose description is the **measured** fidelity headline, with a View button onto the Reserved
chords sheet. A third head, *Every style*, opens Available macros. The panel now reads
Vim · Emacs · Every style · Gestures.

### What this pass says about the layer

The architecture was right and the discipline was real — 149 commands, one registry, one chord
formatter, a measured chord table, laws written down. Every failure above sat at a **seam
between the model and a surface**, where a fact was stated a second time instead of derived.
The counter-rule is the first line of [`COMMANDS.md`](COMMANDS.md), and the invariant table
there names the test that holds each one.

### T.7 The Keys panel rethink — and a button that did nothing

The §T.6 attempt to make the panel symmetric produced two rows with View/Open buttons. Both
were wrong, in different ways.

**The buttons did not work.** A modal `<dialog>` lives in the browser's **top layer**, which no
`z-index` can beat, and `floating-window.mjs` opens at `zTop = 4000` with the comment *"above
menus/tooltips, below modal dialogs"*. So both buttons opened their window **underneath
Settings**. They read as dead. The window was genuinely open the whole time, which is why
"does it open" is the wrong thing to assert — `probe.mjs` now checks that the window is the
**topmost element at its own coordinates**, via `elementFromPoint`. `leaveSettingsAnd()` closes
Settings, waits out the transition, then runs.

**A row with a button is not a setting.** Nothing about "Reserved chords · View" is configured;
it borrows the shape of a setting to be a link. It reads as a control whose value you forgot to
set. So:

- **Available macros** moved into the panel HEAD, beside Reset — the panel's action strip
  already existed and Reset had established the vocabulary. `addPanelHeadAction()`.
- **Reserved chords** stopped being a row at all. What it said belongs in the ⓘ passage next to
  Editing style, which is where someone stands *before* choosing Emacs.

**And the style sections were the wrong shape.** Vim's three options had their own section head,
as though they were a peer part of the panel; under Standard they sat there as three dead rows
advertising a mode you are not in. They are not a section — they are the **consequences of one
choice**. `addSubordinateGroup()` nests them under the Editing style row, indented on an accent
rail; `paintStyleRows()` shows exactly one group, and nothing at all under Standard. Emacs shows
none, because Emacs has no preference worth inventing and an empty group is not a gap to fill.

```
KEYS                                    Available macros   Reset
─────────────────────────────────────────────────────────────────
Editing style  ⓘ                                        [ Vim  ▾ ]
   │ Leader key                                 [ Backslash    ▾ ]
   │ Yank to system clipboard                              (   ●)
   │ Leave Insert with                          [ Escape only  ▾ ]
Status strip                                        [ Standard ▾ ]
GESTURES …
```

⛔ Settings search indexes a nested row under its owning style — "Leader key" reports as *Vim*,
not as *Keys* — and **only while that group is showing**. A search result you cannot act on is
worse than no result. The owning style must not leak past the group either: `section` is the
running head and a grouped row overrides it for itself only, or the Status strip row that
follows would report as Vim.

**The passage was rewritten to carry what the rows carried**, in six headed sections: what each
style is, what this browser takes, how to get it back, and what holds whichever you pick. Every
chord and substitute in it is derived from `reservedChordFacts()`; `probe:keymap` walks the
measured rows and asserts each `chord → substitute` pair appears verbatim. Paragraphs may now be
`{ head, body }` — six unbroken paragraphs read as a wall, and the same six under short heads
read as a reference you can scan.

⚠ The popover's `max-height` was first a guessed `30rem`, which clipped the passage mid-sentence
on an ordinary window. The scroll was working and it just read as truncated. It is bounded by
the **viewport** now, and the probe asserts `scrollHeight <= clientHeight`.

### T.8 The tag meant the wrong thing — corrected 2026-09-04

The `shadowing` tag was keyed by COMMAND, and it said:

> *"This is an Emacs macro. Without Emacs, Redo is Ctrl+Y."*

Two things wrong with that, and the second is the one that mattered.

**It described a keymap you are not using.** "Without Emacs, Redo is Ctrl+Y" is a fact about
Standard, delivered to someone in Emacs. It answers a question nobody asked.

**It fired where nothing was contested, and stayed silent where something was.** The tag appeared
on `Redo — C-S-z` and `Find… — C-s` in Available macros. Neither of those chords collides with
anything: BelJar binds no Ctrl+S, and Ctrl+Shift+Z is free on Windows. Meanwhile the seven chords
Emacs genuinely takes — Ctrl+F, Ctrl+A, Ctrl+Space, Ctrl+Y, Ctrl+/, Ctrl+K, Alt+X — carried no
tag at all on the sheet that lists them. The tag was on the wrong axis entirely.

**⛔ THE RULE.** A tag exists for exactly one reason: **the chord on this row is claimed by
something other than this row**, and it names the other claimant. It is computed from the CHORD,
not from the command, so a surface says which chord it is about to display and gets the answer
for that chord.

Three kinds, and only three:

| kind | when | says |
|---|---|---|
| `shadowed` | the chord on this row is taken by the style | *"Emacs uses Ctrl+F for forward-char."* |
| `shadowing` | this row's chord is the STYLE's own, and base gives it to another command | *"Emacs uses C-s here. In Standard, C-s is Save Now."* |
| `insert` | the chord works, but only while you are typing | *"Only while you are typing. In Normal mode, press u."* |

`insert` survives unchanged because it is already a caveat on the chord shown: Ctrl+Z works, and
the caveat is which mode you must be in.

**What each surface gets now.** The Keybindings sheet shows BelJar's own chord — it is where you
rebind — so `Find… [shadowed] Ctrl+F` reports that Ctrl+F is taken. Available macros shows the
chord that WORKS, and every chord it shows is free, so under Emacs it wears **no tags at all**.
`describe(id, { showing: 'style' })` is how a surface asks for the second reading.

**Three things this turned up.**

- ⛔ `specFromStyleKey()` had to exist or `shadowing` could never fire: a style chord (`C-s`,
  `M-x`, `Ctrl+O`) is not in the form the chord table is keyed by, and an unparsed chord reads as
  "no collision" — a silent false negative in the one case the tag is named for. It handles both
  spellings, because the style writes `C-s` and a readable list renders `Ctrl+O`.
- ⛔ A chain (`C-x h`) normalizes to `''` deliberately: two keys cannot collide with one chord,
  and pretending otherwise would tag `C-x C-f` against whatever owns Ctrl+X.
- ⛔ `shadowing` requires `fromStyle`. Without that gate it fired on `tools.palette`, which shares
  Ctrl+K with `nav.anywhere` **on purpose** — they are the same action — and the row read *"Vim
  uses Ctrl+K here. In Standard, Ctrl+K is Go to File…"* under a style that had done nothing at
  all. Two BASE commands sharing a chord is a keybinding conflict, which has its own indicator.

The `SHADOWS` table keyed by command id is gone. `STYLE_TAKES` is a list of CHORDS a style takes
and what it runs with each; `STYLE_CHORDS` is the chord a style binds for a BelJar command;
`INSERT_ALTERNATIVE` is the Normal-mode key for an Insert-only chord. Matching on the chord SPEC
rather than the command id also means the collision follows a rebind: move Find… off Ctrl+F and
the tag moves to whatever now sits there.

### T.9 The Reserved chords sheet — deleted, folded into Available macros

Found by the user, not by me. I read `reserved-chords-sheet.mjs` during the §T sweep, judged it
"correct" from its source, and **never opened it**. It was not correct. It was a three-column
table in which **five of nine rows read `—  —`**, under an orange headline, in a floating box that
began scrolling at nine rows, reachable only from the palette — in the same app whose macro list
carries an explicit ⛔ law that *no row may be a dash*. Reading a file is not looking at a screen.

It is gone. No sheet, no `keys.reserved-chords` command, no `:chords` alias, no `.bj-chords` CSS,
no `ReservedChordsSheet` global. "Which of my chords does this browser eat, and what do I press
instead" is the same question as "what can I press", so it is a block of **Available macros**,
last, after everything you *can* do:

```
TAKEN BY THE BROWSER
These never reach the page. Press the substitute instead, or turn on Full keyboard
(:fullkeys) to reclaim them while BelJar is fullscreen.

  C̶t̶r̶l̶+̶N̶      next-line                     →  Ctrl+M, or Down
  C̶t̶r̶l̶+̶T̶      transpose-chars               →  Alt+T
  C̶t̶r̶l̶+̶W̶      kill-region                   →  Ctrl+Q
  C̶t̶r̶l̶+̶S̶h̶i̶f̶t̶+̶P̶  Run Command…              →  Alt+X
  C̶t̶r̶l̶+̶1̶…̶9̶    digit-argument                →  Ctrl+U then digits

Ctrl+Shift+N, Ctrl+Shift+T, Ctrl+Shift+W, Ctrl+Tab and Ctrl+Shift+Tab are taken
too, with nothing to put in their place.
```

Four rules made it fit:

- ⛔ **The window's grammar is kept: the right-hand column is always what to PRESS.** So the dead
  chord is the row's SUBJECT and sits on the left, struck through, where every other row puts its
  name. A struck-through chord may never appear in the keys column.
- ⛔⛔ **A surface promising what you can do RIGHT NOW must be filtered by the active style — the
  names, their SPELLING, and the keys they point at.** Available macros printed 25 `:names` under
  Standard where nothing opens the command line (`Alt+X` opens the palette there), printed a colon
  under Emacs where the `M-x` line takes bare names, and told Standard users to press `Ctrl+Q` —
  an `EmacsHandler` binding that does nothing outside Emacs. Three things, one mistake. (§T.10)
- ⛔ **A window explains itself in its CHROME, not in a row of its body.** "Everything else is in
  the command palette." was a sentence about the window, taking a row inside it, forever. An info
  circle in the title bar costs nothing when you are not asking. (§T.11)
- ⛔ **A block ends in ROWS, not in a paragraph.** Two chatty sentences around a list became two
  labelled rows in the same grid as everything else — that is the difference between "jammed in"
  and "finished". And when colour carries a pair (gone / works), ⛔ it must never carry it alone:
  the strikethrough and the arrow say the same thing. (§T.11)
- ⛔⛔ **"What can I do right now" means EVERYTHING that is bound, not everything in the tables we
  happen to own.** Available macros listed BelJar's chords and BelJar's own Vim/Emacs maps and
  called that available, while the Emacs package's 62 bindings — `Ctrl+P`, `Ctrl+K`, `Ctrl+Y` —
  were live and listed nowhere. Read the package's table. Where a package publishes none (vim
  does not), **say so on screen**: an unexplained absence reads as an oversight. (§T.12)
- ⛔ **Group by the SHAPE of the key, never by whose keymap it came from.** "BelJar keys" beside
  "Emacs C-x" drew a line that does not exist — those bindings change with the style too. A Ctrl
  chord is a Ctrl chord whoever bound it, and shape is how you look one up. (§T.12)
- ⛔ **ONE spelling per surface.** BelJar wrote `Ctrl+P`, our maps wrote `C-x C-f`, the package
  wrote `S-C-p`; grouping by shape turned that into blocks headed `C`, `C+S`, `D`, `E` and
  `Ctrl+x`. And ⛔ **a named key is not a sequence** — `Down` and `Esc` are not `gd`. (§T.12)
- ⛔ **ONE row per key, and the row naming a COMMAND wins.** A palette entry, a `:` name and a
  Keybindings row stand behind it; a package label has none of that. (§T.12)
- ⛔ **ONE name per row.** `Save Now` printed `w write wa wall`. A column that tells you what to
  type needs the name you would type; synonyms are a second copy of the same answer. Keep them in
  the filter, not on the row. (§T.10)
- ⛔ **A row whose answer is a dash is not a row.** The five chords with no substitute are one
  closing line. That is the same rule that governs the rest of the window, applied to the block
  that used to break it.
- ⛔ **The lead names no chord.** `fidelity.detail` spells out which chords are taken; printed
  above rows that already say so, that is the same table twice, and the prose copy is the one
  that rots.
- **Every row gets a gloss, derived.** `Ctrl+Shift+P` has no Emacs meaning, so it is glossed by
  the BelJar command its substitute reaches — *Run Command…* — rather than left blank.

**And a real layout bug fell out of it.** `.floating-window-body` is `display: block` with its own
`overflow-y: auto`, so `.bj-macros`'s `flex: 1 1 auto` was **inert**: the list took its full
content height and the BODY scrolled instead, carrying the filter strip and the closing line off
the top. `probe:keymap` had been asserting `pinned` and `scrolled` and passing, because at the old
560px height with fewer rows the geometry happened not to expose it. Making
`.floating-window--macros .floating-window-body` a flex column hands the bounded height down and
the list becomes the single scrollport, which is what the ⛔ one-scrollport rule wanted all along.

⚠ **The lesson, and it is the same one as §T.3 from the other side:** I checked that this file's
DATA was derived and correct, and never checked what it LOOKED like. Correct data rendered badly
is still a bad surface. `scripts/.shots/` exists precisely for this and I did not open it.

### T.10 "Available" has to mean available — the `:` block, and the substitutes

The user asked the obvious question I had not: *"shouldn't available macros indicate available
macros? there's no `:cmd` section when in Emacs or Standard, and verbiage like `:fullkeys` in the
reserved section."* Both halves were right, and the answer went one level deeper than the question.

**What actually opens the command line.**

| style | opens it | names are typed |
|---|---|---|
| Vim | `:` in Normal mode, and `Alt+X` | `:fmt` — with the colon |
| Emacs | `M-x` | `fmt` — **without** a colon; `:fmt` on the M-x line resolves to nothing |
| Standard | **nothing by default** — `Alt+X` opens the PALETTE here, not the line | `:fmt`, once a chord is bound |

So the block was wrong in two of three styles: it printed 25 `:names` under Standard that nothing
could type, and printed a colon under Emacs that would have made every one of them fail.

`commandLineAccess(style, chord)` answers all three from one place. No access, no block — and it
returns the moment a chord is bound to Command Line, with an aside naming that chord. The `lead`
says how to open it; the rows carry the style's prefix.

**And the same bug, one level deeper: the substitutes.** `Ctrl+M`, `Alt+T`, `Ctrl+Q` and `Ctrl+U`
are bound on `EmacsHandler` **and nowhere else**. Under Standard the block was saying *"Ctrl+W is
taken — press Ctrl+Q"* for a chord that does nothing, for a command (`kill-region`) that does not
exist in that style. That is the same lie as advertising a chord the browser eats, arrived at from
inside our own code.

`subStyle` on the measured table records which keymap a substitute belongs to. ⚠ It is **not part
of the measurement** — which chords the browser eats is untouched. A substitute is offered only in
the style that binds it; the chord is still taken, so it joins the closing line. Under Standard the
block is now one row — `Ctrl+Shift+P → Alt+X`, the one substitute BelJar itself binds — and the
Emacs meaning is dropped too, because `kill-region` names nothing a Standard user has.

⛔ **The rule, stated once:** *a surface promising what you can do right now must be filtered by
the style you are in — the names, their spelling, and the keys they point at.* Three separate
things were wrong here and all three were the same mistake.

**And a fourth, found the same way: ONE name per row.** `Save Now` was printing
`w write wa wall` — four spellings of a single answer, in the column whose entire job is to say
what to type. `Set Option` printed `set se`; `Open File` printed `e edit`. A row needs the name
you would type; the aliases are muscle-memory conveniences that work whether or not a list
mentions them. They stay in the FILTER — searching "write" still finds Save Now — and leave the
row. The column is one word per line now and can be scanned.

⚠ Under Emacs the name shown is still the ex alias (`M-x w`), not the `beljar-file-save` M-x name,
because that is what the line's own completion offers. If the completion ever leads with `mx`
names, this must follow it — the two are the same promise.

### T.11 The window explains itself, and the block gets finished

**The closing row is gone.** *"Everything else is in the command palette."* was a sentence about
the window, occupying a row inside the window, on every open forever. A window explains itself in
its **chrome**; its body is for its content. It is an info circle in the title bar now, with a
two-paragraph rich tooltip: what the window shows (your chords, the style's keys, the command
line's names) and what it deliberately does not (commands with nothing bound — there is no key to
show, and the palette has them all).

`FloatingWindow` grew one field for this: an action with a `tooltip` function is hover-only —
a rich tooltip and nothing to press. Any window can now explain itself without spending a row.

**The reserved block was two chatty paragraphs around a list.** Now it is a designed unit:

```
TAKEN BY THE BROWSER
The browser handles these before BelJar sees them.

  C̶t̶r̶l̶+̶N̶        next-line                    →  Ctrl+M, or Down
  C̶t̶r̶l̶+̶T̶        transpose-chars              →  Alt+T
  C̶t̶r̶l̶+̶W̶        kill-region                  →  Ctrl+Q
  C̶t̶r̶l̶+̶S̶h̶i̶f̶t̶+̶P̶  Run Command…                →  Alt+X
  C̶t̶r̶l̶+̶1̶…̶9̶      digit-argument               →  Ctrl+U then digits

  Also taken          C̶t̶r̶l̶+̶S̶h̶i̶f̶t̶+̶N̶ C̶t̶r̶l̶+̶S̶h̶i̶f̶t̶+̶T̶ C̶t̶r̶l̶+̶S̶h̶i̶f̶t̶+̶W̶ C̶t̶r̶l̶+̶T̶a̶b̶ C̶t̶r̶l̶+̶S̶h̶i̶f̶t̶+̶T̶a̶b̶
  Reclaim them all    Full keyboard, in fullscreen   fullkeys
```

- **Both paragraphs became labelled ROWS**, in the same left-label / right-value grid every other
  row uses. A block that ends in a sentence reads as bolted on; a block whose last two lines are
  rows reads as finished. The lead is one short line and names no chord.
- **Colour carries the pair.** Soft red for what is gone, green for what answers — muted well
  below the status dot's saturation, because this is a reference list and not an alarm. ⛔ The
  strikethrough went with it: red already says "gone", and striking it too is the same fact twice
  on the one word you most need to *recognise*. Colour is not the only signal — the arrow points
  away from the dead chord and the heading says what the block is.
- ⛔ **These rows FLOW, they do not justify.** Every other row here is `label ……… key`, because the
  key is the answer and the eye goes to the right edge for it. A reserved row is not that shape —
  it is one sentence, *this chord, that meaning, press this instead* — and pushing its tail to the
  right edge tore a void through the middle of it that dwarfed the small arrow trying to span it.
  Three parts, one even gap between each, right edge left ragged.
- **The closing chips are quieter than the rows above them.** Those chords have no answer, so they
  are the least actionable thing in the block; at full strength five of them shouted over the five
  pairs that actually tell you what to press.
- The arrow sits between the two in neither colour, with air on both sides. It used to be jammed
  against the substitute and read as part of it.

⚠ **Four probe measurements had to change with the design, every one of them in a convenient
direction.** The closing rows carry extra top padding on purpose, so "every row is one
line tall" measured them as wrapped — they are measured apart now, with their own bound. And under
Standard the list no longer overflows at all (the command-line block is gone where nothing opens
the line), so "did it scroll" was about to pass as vacuously true; the probe **shrinks the window
to 320px first**, which is a thing users do and the only way to measure what that check is for.
Then the closing rows started wrapping — Standard names NINE taken chords, because the Emacs-only
substitutes are not offered there — so "one line tall" and "title runs into keys" both fired on a
row that is a label with a deliberately wrapping value. Bounded at three lines, and excluded from
the collision check, which is a question you cannot ask of a wrapping row.

### T.12 "Available macros" was neither available nor all of them

Three complaints, one root cause: the window was built from **the tables BelJar happens to own**,
not from **what is bound**. The user's own framing is the correct spec, and it should have been the
spec from the start:

> Available macros is the keybindings sheet, filtered to the ones that are bound.

**1. The blocks were named for whose keymap a binding came from.** "Vim keys", "Emacs C-x" — and
then **"BelJar keys"**, which is nonsense: those bindings change when you switch style too. The
line it drew does not exist. Blocks are named for the **key's shape** now — `Ctrl+X`, `Ctrl+C`,
`g`, `]`, the leader, then `Ctrl`, `Ctrl+Shift`, `Alt`, `Function keys`, `Single keys` — because a
Ctrl chord is a Ctrl chord whoever bound it, and shape is how you look one up.

**2. It was missing most of the macros.** `Ctrl+P`. `Ctrl+E`. `Ctrl+K`. `Ctrl+Y`. Forty more. The
Emacs package binds 62 specs and **not one of them was listed** — the single largest source of
bindings in the style, absent from the window that promises them. `modal/emacs-keys.mjs` reads
`emacsKeys` (the package's own table, never recalled) and supplies the words;
`tests/test-emacs-keys.mjs` fails if the package grows, drops or renames one spec, so the table
cannot go quietly stale or quietly incomplete.

⚠ **Vim has no equivalent and that is the package's fact, not a choice.**
`@replit/codemirror-vim` exports `map`, `unmap`, `defineAction`, `findKey` — nothing that
ENUMERATES its keymap. Writing vi's motions from memory is the one thing the ⛔ read-the-table law
forbids. So the window **says so**, in a closing line under the Vim blocks. An unexplained absence
in a window called "available macros" reads as an oversight, which is precisely how it read.

**3. A substituted key was only in the footnote.** `Ctrl+M` is next-line — a working macro — and it
appeared nowhere in the key list, only in the taken-by-the-browser block explaining why it exists.
It is in the `Ctrl` block now with a `*`, and the block that explains the mark carries the same `*`
in its heading. You find the key where you look for keys, and the explanation stays where
explanations go.

**Four things fell out of doing it.**

- ⛔ **Three spellings were coexisting** — BelJar wrote `Ctrl+P`, our Emacs maps wrote `C-x C-f`,
  the package wrote `S-C-p`. Grouping by shape turned that straight into nonsense: blocks headed
  `C`, `C+S`, `D`, `E`, `M` and `Ctrl+x`, each holding whichever rows happened to be written that
  way. **A window that sorts by what you press needs one way of writing it.** Everything speaks
  `Ctrl+X Ctrl+F` now, including `readableStyleChord()` on the shell side of the seam.
- ⛔ **A named key is not a sequence.** `Down`, `Esc`, `PageUp` have no modifier and more than one
  character, exactly like `gd` — so they were grouped by first letter into blocks headed `D` and
  `E` holding one row each.
- ⛔ **One row per key, and the row that names a COMMAND wins.** `Ctrl+S` is both the package's
  "search forward" and BelJar's Find…; Find… is the answer, because a palette entry, a `:` name and
  a Keybindings row stand behind it. And `nav.anywhere` and `tools.palette` both ship `Ctrl+K`, so
  that is now one row rather than two — the window lists keys.
- ⛔ **A key read from the style's own keymap is live by construction.** `liveChord()` blanks a
  BelJar command whose chord the style took; applied to a package row it emptied `Alt+X`, because
  that chord is one Emacs takes *from* `tools.commands`. Only a BelJar command can lose its chord.

**And the `shadowing` tag fired for the first time.** §T.8 built it and shipped it dead: the tag
means "this row's key is the style's own, and the base keymap gives that key to another command",
and the keys that do that — the Emacs package's — were not listed. Now `Ctrl+F` reads
*"Emacs uses Ctrl+F here. In Standard, Ctrl+F is Find…."*, on five rows. A mechanism with no data
is indistinguishable from one that does not work, and this one sat that way for two sessions.
