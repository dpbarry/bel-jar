# The UI contract

How BelJar's surfaces look and speak. [`COMMANDS.md`](COMMANDS.md) says what a surface may
offer (only what works, derived from one table); this says how it shows it. Read both before
building or changing a surface.

## 0. Two pages

**Home** (`/`) is the projects and the account. **The editor** (`/edit?p=ID`) is one project. A
thing belongs to the page where a person looks for it: which projects there are, and who is signed
in, on home; everything about the open project in the editor. The editor's brand goes home.

- Signed out, the editor has no account button: signing in is home's (and the palette's).
- Home says nothing it is not sure of. An empty list waits until it knows who is signed in and
  their first sync is back: "nothing here" (the keyboard on New project) is never a guess.
- A row's menu on home does what the Project menu does in the editor, by the same code.
- Leaving a page never asks and never loses: what was typed is saved before the page goes.
- Going from one to the other is one movement: the editor's working area grows out of the row
  that was opened, scaled evenly, and shrinks back onto it; the project's name travels between the
  row and the header; the rest cross-fades (`css/page-transition.css`). ⛔ The strip does not
  travel: it is the same on both pages, so what is the same in it stays where it is and only what
  differs fades. ⛔ Opening waits for the editor to be built (home stays as it was left, the row
  clicked washed), so it is the whole editor that grows, never an empty shell. One balanced curve
  for everything that moves; the row come back to is never washed, so nothing goes in one frame at
  the end. With motion held back it is a plain cut. The theme is never animated: both pages paint
  it before they are shown.
- Home has no status strip, so its news in passing (§3) is one quiet line in the column, for a
  moment (`Home.say`): a preference changed from the palette says what it is now.
- The palette is on both pages, and offers on each only what works there.

The mechanics (addresses, pinning, signing out across tabs) are [PERSIST §5.11](PERSIST.md).

### How home is composed

One column, at the left of a measure (`css/home.css`, `js/home/home.mjs`), read from the top. The
strip above it is the editor's, with the mark alone at the left and the person at the far right;
the name is the page's own.

| Part | What it holds |
|------|---------------|
| The name | The mark and **BelJar**, at a restrained size. Under it, signed out where a server answers, one line: **Sign in with GitHub** to keep your projects on every device |
| The ways to start | New project, Import folder, Browse examples: three flat tiles, a glyph above the words, boxed by a step in the ground and nothing else |
| **Projects** | Every project, the last one opened first: its **name** and **when** it was last touched. A marker only when files wait to be reviewed (§2). **Search** (with the chord that opens the palette in the editing style in use) at the heading's right |
| The foot | Beluga, Report an issue, GitHub |

- ⛔ **One column, two edges.** The name, the tiles and every row's words start at one left edge;
  every date ends at the tiles' right edge (`scripts/probe-kit.mjs`, `probe-home`). A row's wash
  reaches half a gutter past them, so the words never touch it.
- ⛔ **A row says its name and when, and nothing else.** No initials, no counts, no open file:
  what a person scans for is the name, and the date says which is which. Its menu (Open, Rename,
  Download, Delete) takes the date's place when the row is pointed at, and a right click or the
  context-menu key opens it too; on touch it stays after the date.
- The last project opened has the focus, so Enter resumes it, but nothing marks it until a key is
  pressed on the page (`data-keys`): a wash on it before anyone typed read as a row stuck
  selected.
- ⛔ One mechanism finds: the palette. Search opens it, and a letter typed on a row opens it with
  that letter; there is no second filter field for the list.
- A browser with **no project** is the same page without the list: the name, the ways to start,
  the foot. Nothing claims there is nothing here while projects may be on their way.
- **What comes later has a place already.** A second list (shared with you) is another heading
  and list under Projects; a line about usage or storage goes in the foot.
- Narrower than 34rem the tiles become three lines, the glyph before the words.

## 1. Menus hold actions; state lives in surfaces

A menu lists what you can do now. Where your work lives, whether it synced, how many holes are
left: that is state, and it lives in a surface that shows it all the time, such as the cloud beside
the project name, the status strip, or a badge on a row.

- ⛔ No status captions in menus. A section label names a group in a word or two ("Recent"),
  never a sentence. (The Project menu once said "SAVED IN THIS BROWSER AND YOUR ACCOUNT" in section
  type, and it read as a shout.)
- A popover that describes state uses the menu's `status` row (`js/ui/menu.mjs`): a title and one
  muted line, sentence case.

## 2. One indicator per fact

Each fact has one home. Where two surfaces could show it, one does and the other defers.

- The status strip is always there (no Off since 2026-09-30); the checker's dot lives in it, and
  nothing in the header repeats it.
- Sync's steady state is the cloud beside the project name. The strip speaks only when something
  needs you: offline, files that differ from the cloud, a failure.
- An icon beside text is centred on the text's capitals, not on its line box (the capitals sit
  above the middle of the line) and not with its base on the baseline (a shape taller than the
  capitals then stands high). `probe-account` measures the cloud against the name.

## 3. Silent by default

| What | Where | Example |
|------|-------|---------|
| Ambient state | the cloud, the strip, badges | Synced. Offline. |
| News in passing | a strip transient (`StatusStrip.setMessage`) | Back online. Everything is synced. |
| A failure | a notification, with the reason | Couldn’t sign in with GitHub, and why |
| A choice only a person can make | a window they open, or a dialog when data is at risk | Some changes haven’t reached the cloud yet |

- ⛔ No toast for something that went right, and no question the defaults already answer.
  Signing in adopts every project in the browser; nobody is asked which.
- ⛔ No modal that interrupts work for something that can wait. Files that differ from the cloud
  are marked, and reviewed when the person chooses.
- ⛔ No action that only makes sense to whoever built the system. What one person in a hundred
  needs is one setting, never a menu item, a pair of commands and a state of its own. A
  per-project "keep in this browser only" was built that way and removed the next day
  (2026-10-02); keeping projects after signing out is the one setting in Settings > Account.

### What earns the bell

The bell is for what happened where you could not see it. Four things earn it, all made in the
browser (plan v6 phase 04; notices the server makes wait for the marketplace). Each rule is a
pure module, tested where it is written, and each is wired and checked in Chrome.

| What | When | Says, and opens | Rule | Gates |
|------|------|-----------------|------|-------|
| A Run finished | it ends after you left its file, or the tab | Checked main.bel / Errors in main.bel; the first error | `js/beluga/run-notice.mjs` | `test-run-notice`, `probe-notices` |
| A suite changes colour | green to red or back, once per change | Suite nat has errors, main.bel has errors now; its first error | `js/app/suite-notice.mjs` | `test-suite-notice`, `probe-notices` |
| Orca finished or gave up | after 10 s, with Harpoon's panel or window closed, or the tab hidden | Orca proved plus_zero / Orca gave up on plus_zero; the hole | `js/harpoon/orca-notice.mjs` | `test-orca-notice`, `probe:holes` |
| Sync needs you | rounds failing for ten minutes; the round that goes through takes it away | Couldn’t sync for ten minutes, and why | `js/account/sync-watch.mjs` | `test-sync-watch`, `probe-sync-failing` |

- ⛔ Nothing you watched: a run whose REPL you saw, a suite turned by the file you are typing in
  (its dot already changed in front of you), a search in an open panel, a search you stopped.
  Offline is not failing: the strip says it, and nothing is wrong.
- One card per thing (`dedupeKey`): a suite's card turns green, it does not multiply.
- A suite's other files are checked again when a file opens, not while you type, so its card
  arrives when you move on (`probe-notices` goes to another file after the edit, as a person does).
- The probes lower two thresholds through page globals: `BELJAR_ORCA_NOTICE_MS` and
  `BELJAR_SYNC_FAILING_MS`. Nothing else reads them.

## 4. Reuse before inventing

The vocabulary:
- `Menu` (`js/ui/menu.mjs`), with its `section`, `separator` and `status` rows.
- `FloatingWindow`.
- The strip's segments (`js/status-strip/status-strip-segments.mjs`) and its message slot.
- `PromptDialog` and its `buildActions`.
- `.icon-btn`.
- The tokens in `css/tokens.css`: `--menu-*`, `--muted-*`, `--accent-*`, `--radius-*`, `--ease-out`.

A new component takes its values from those tokens and works in both themes from its first
version. A value retyped in a second place is a token that is missing.

⛔ The retyped values only go down (`tests/test-css-tokens.mjs`, plan v6 phase 02, u3): per CSS
file, the colours, radii and spacing written as literals, and the uppercase styling, are counted
against `tests/css-literals.json`. More fails; fewer fails too until it is recorded with
`node tests/test-css-tokens.mjs --write`, which refuses a higher count. A new file starts at
none. On 2026-10-05 the colours, radii and spacing went from 1172 to 1141: the radii typed as `3px` became
`--radius-sm`, and those typed as `999px` the new `--radius-pill` (the same pixels).

## 5. The voice

- **Sentence case** for labels, descriptions and prose ("Sign out", "Review differences").
- **Title Case** only for command titles in the palette ("Sign In with GitHub").
- **Terse:** a label is a noun phrase, a description one short sentence.
- ⛔ No em dashes in prose, no uppercase running text, no `·`-padded stat dumps, no internal
  slugs on screen.
- **One thing, one name:** "the cloud" for the account's copy, "this browser" for what lives only
  here.

⛔ Held by `tests/test-voice.mjs` (u4): every label, title, description, body and message in the
surface modules (settings, menus, dialogs, the account, home, notices) and every command title.
Names keep their capitals: products, keys, Vim's modes, a command named as it is ("Available
Keys has the measured list"), a setting's option ("With Kill ring"), a menu ("the Project menu").
Uppercase set by CSS is held where it is (47 places on 2026-10-06) by `test-css-tokens.mjs`;
the small section labels stay uppercase (Dean, 6 October 2026, §7).

## 6. Looking at it

A surface is not done until it has been looked at: a screenshot of every changed surface, in both
themes, at its real size.

⛔ **Where an icon sits against words is measured in painted pixels**, not layout boxes, at the
display scales people use. The cloud beside the project name was "centred on the capitals" by
every box measured, and drawn half a pixel high at every scale from 1x to 3x, its base on the
baseline: that is what people saw. `scratch/probes/probe-cloud.mjs` reads the screenshot.

**The kit page** (`dev/kit.html`, never uploaded) is every component on one page: both headers,
buttons, the cloud in each state, a menu, dialogs, home's column with projects and without, toasts. ⛔ Each
specimen is drawn by the app's own modules and stylesheets; the kit's stylesheet may frame and
place a specimen, never restyle one (`tests/test-kit.mjs`). `npm run probe:kit` writes
`scripts/.shots/kit-dark.png` and `kit-light.png`. A new component goes on it as it is built; the
ones that need an open project to draw themselves (the strip, explorer rows, panels, floating
windows, the palette, Settings) are not on it yet, and `node scratch/shot-audit.mjs` shoots them
in the editor (§7).

## 7. The audit (plan v6 phase 02, u1 and u2)

Each component class against this contract, on 5 October 2026, from the kit page and from the
editor's own surfaces (`node scratch/shot-audit.mjs` shoots both, in both themes, into
`scripts/.shots/audit/`). Dean read it on 6 October and kept every row but three; u2 fixed what
he kept the same day. "Rule" says which section a row breaks.

| Component | What the shots showed | Rule | Outcome |
|-----------|----------------------|------|---------|
| Header, signed out | The account button's slot stayed empty, so the bell and the theme stopped a button (27 px) short of where home's last icon stands, and the hidden cloud took 24 px beside the project name | §0, §4 | **Fixed**: `.icon-btn`'s `display` outranked the `hidden` attribute; `.icon-btn[hidden]` in `base.css`. The last icon now stands 11 px from the edge on both pages (`scratch/measure-header-end.mjs`) |
| Header, the name | A new project was called "Untitled Project" | §5 | **Fixed**: "Untitled project" (`work.mjs`, `edit.html`, the REPL). Names already stored stay; a placeholder named the old way is still one (`isBlankProject`) |
| Panel headers | INSPECTOR was centred between its icons; the other panels' labels sit left | §4 | **Fixed**: the label first, home, back, forward, search and follow at the end. Every header's label starts 12 px in, every header is 30 px, every last control ends 6 px in (`scratch/measure-panel-headers.mjs`); on the kit page as **Panel headers** |
| Section labels | Uppercase in 48 places: PROJECT, FUNDAMENTALS, CTRL, ANYWHERE, NOTIFICATIONS | §5 | **Kept** (Dean, 6 October: not convinced the uppercase is a problem). Their count is held where it is by `test-css-tokens` |
| Settings | APPEARANCE above the panel repeated the selected item beside it; the dialog opened with focus on its close button, drawn lit | §2, §4 | **Fixed**: focus starts on the selected category. With the title gone, the strip left holding only Reset was worse (Dean, 6 October): the panel's actions (Reset, Available Keys) now share one bar along the bottom with Reset all, under one hairline, and the panel's rows start at the top. The selected category fills the list from edge to edge, with the open file's wash and strip (`scratch/probes/probe-settings.mjs`) |
| The palette | Its footer is a `·`-strung line of modes | §5 | **Kept** (Dean: modes as rows needs deliberation). The palette is flagged for a design pass of its own: what its rows before typing are, and why |
| Ellipses | Three typed dots in the editor's placeholder, the inspector's search and the hover's "Recalculating" | §5 | **Fixed**, and held: `test-voice` fails on a word trailing off in three dots, in any module or page |
| The REPL | Its banner "Beluga 1.1.3 — help to see commands." had an em dash | §5 | **Fixed**: "Beluga 1.1.3. Type help to see commands." `test-voice` now reads `js/repl/`, and any string a surface module writes (two more dashes found and fixed, in the full-keyboard messages) |
| Notifications | A card is filled with its kind's colour; a toast marks its kind with an edge strip | §4 | **Kept** (Dean: an edge strip would not work on the card) |
| Dialogs | "Not everything is in the cloud yet." ended with a full stop; the layout reset asked two sentences in its title | §5 | **Fixed**: no closing full stop; "The page will reload." is the reset's note |
| The library tip | Stayed open over whichever side panel opened next, covering its first rows | §3 | **Fixed**: opening any side panel closes it (it counts as seen) |
| Library rows | The counts looked like the accent | §2 | **No change**: measured, they are `--base-high`, a grey with a blue tint, in both themes (`scratch/measure-library-count.mjs`) |
| Icons beside words | Only the cloud was measured | §6 | **Fixed**: `scratch/probes/probe-icon-text.mjs` measures four more in painted pixels at 1x and 2x, both themes. The strip's dot beside Checked was a pixel low and Settings' search icon half a pixel high; both now within 0.05 px. Available Keys' filter icon (0.17) and the notification count (0.33) were within 0.35 already |
| The kit | The strip, panels, floating windows, the palette, Settings, the name prompt and notifications were not on it | §6 | **In part**: the panel headers are on it now, read out of `edit.html`. The rest still draw themselves from an open project, and `scratch/shot-audit.mjs` shoots them in the editor |
