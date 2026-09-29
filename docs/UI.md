# The UI contract

How BelJar's surfaces look and speak. [`COMMANDS.md`](COMMANDS.md) says what a surface may
offer (only what works, derived from one table); this says how it shows it. Read both before
building or changing a surface.

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

- The checker dot hides while the strip is on.
- Sync's steady state is the cloud beside the project name. The strip speaks only when something
  needs you: offline, files that differ from the cloud, a failure.

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

## 5. The voice

- **Sentence case** for labels, descriptions and prose ("Sign out", "Review differences").
- **Title Case** only for command titles in the palette ("Sign In with GitHub").
- **Terse:** a label is a noun phrase, a description one short sentence.
- ⛔ No em dashes in prose, no uppercase running text, no `·`-padded stat dumps, no internal
  slugs on screen.
- **One thing, one name:** "the cloud" for the account's copy, "this browser" for what lives only
  here.

## 6. Looking at it

A surface is not done until it has been looked at: a screenshot of every changed surface, in both
themes, at its real size.
