# Persistence

*Where everything BelJar remembers lives, and the one way to reach it. Read this before storing
anything. Status: built in stages (§6). **Stages 1–7 landed 2026-09-23 to 25**: the store, every
setting on it, the work model (projects, files, sessions), all device state, the concurrency
foundations (a change underneath an open file is merged, never overwritten), the sync engine with
its reference server (§5), and durability (§5.9). Nothing in BelJar touches browser storage except
the store. What sync still needs is outside this module: the real server, sign-in, and a status in
the UI (§5.10).*

---

## 1. The one rule

**The browser's own storage is the only thing the app ever reads or writes.** Every read is
synchronous and local, every write lands locally first, and nothing in the product ever waits on a
network. Online sync is a *replica* attached to the same store: it watches what changed, pushes it,
and applies what it pulls through the same doors the app uses. Signed out, offline, or with sync
off, BelJar behaves identically; sync only ever adds.

"Unified" means exactly this: there is **one store**, and the online layer is a subscriber to it, not a
second place things are saved.

## 2. What was wrong (measured 2026-09-23)

| Problem | Evidence | Consequence |
|---|---|---|
| **Two files could share one storage key** | ids were paths, flattened by `slugify` (`/`, space, `λ` → `_`): `proofs/nat.bel` and `proofs_nat.bel` both became `beljar-file:workspace___proofs_nat.bel` | saving one silently overwrote the other's text |
| **Every setting typed by hand in ~6 places** | 134 `readStored*`/`writeStored*` methods on a 222-method `Persist`; separate hand lists for export and for each reset group; defaults repeated in `settings-ui.mjs` and `early-boot-core.mjs` | drift: *Reset editor* never reset line-number mode, which it shows and exports |
| **The user's work shared a record with a cache** | one `state` record per file held the text, the cursor and the semantic checkpoint | a growing cache could push the text out on a full disk; a sync layer could not tell work from cache |
| **Back-compatibility for data that has no users** | the "default" project on legacy flat keys, `v1`/`v2` readers, a semantic-types migration, and `healKnownCorruptEditorText` rewriting user text on load | two key schemes, dead migrations, and a load path that edits what you wrote |
| **13 modules outside `js/persist/` touch storage directly** | notifications, folds, keybindings, jump log, boot, edit history, … | no single place knows what BelJar stores, so nothing can wipe, sync or bound it |
| **A change underneath an open file was overwritten** (2026-09-24) | tab B added a line at the end; tab A fixed a typo at the top and saved: B's line was gone. The save compared the buffer with storage, so it could not tell "I edited" from "someone else edited" | two tabs lost work silently; a sync pull would have been undone by the next autosave and pushed back as the new truth |
| **A version mismatch wiped in both directions** (2026-09-24) | the store wiped whenever the stored version was not its own, older or newer | an old tab loading after a newer one destroyed the newer data; a tab left open across a deploy kept writing the old format |
| **Ids too small to be global** (2026-09-24) | 8 base-36 characters (~41 bits, biased by `% 36`) | fine on one device; thin as server keys and URL segments shared across accounts |
| **One record shared by every project** (2026-09-24) | the project list was a single array each tab read, changed and wrote back | two tabs creating or renaming projects at once could drop one |

## 3. The model

### 3.1 One keyspace, one schema

Every key starts with `beljar/`. `beljar/schema` holds the format version (now 5).

- **Older** than the code: each migration runs in order (`js/persist/migrations.mjs`: `MIGRATIONS[n]`
  turns format n into n + 1, in place). ⛔ **Older data is migrated or left alone, never deleted**
  (2026-10-01): the app opens its store with `onMissingMigration: 'refuse'`, so with no step for the
  gap, or a step that throws, nothing in the browser is touched. The page cannot run on records it
  does not understand, so it runs on memory, as it does where the browser refuses storage: it
  works, it says once that nothing is being saved, and the older data waits for a BelJar that
  reads it. That is a release nobody can use, so it must not ship: **bumping `SCHEMA` means adding
  the step in the same change**, and `tests/test-migrations.mjs` fails until every format the live
  site has stored (`FIRST_LIVE_SCHEMA`, 4) has its step to the next. The store's own default is
  still `wipe`, for a store of conveniences (the tab store: undo, REPL history).
  **The steps run in one place**, `store.mjs migrateStorage`: every step must exist before any
  runs (a gap left half-migrated data before 2026-10-05), and the new format is stamped only once
  all of them have. ⛔ **Early boot migrates before it reads anything** (plan v6 c12): read in the
  older format, every setting was the default for the first paint after a format change (a light
  theme painted dark, then light). The store then finds the format current.
  **Rehearsed in Chrome** (`npm run probe:migration`, part of `npm run probe`, kept for the next
  format change): a profile with work in it in format 5, an old tab left open, and the next BelJar
  (this one served with format 6 and a step from 5 that does nothing) loaded beside it. The new
  tab's first paint shows the person's settings, it carries every project, file and setting
  forward, and saves; the old tab goes read-only, says so, and saves nothing over the new format;
  the old BelJar loaded again opens it read-only and leaves it exactly as it was.
  ⛔ The wipe happened once on the live site: the first deploy of this store (2026-09-29) found the
  old `beljar-*` keys with no `beljar/schema` (the old code never wrote one), took the storage for
  fresh, and deleted them in every browser that opened it. Storage with no version on it is still
  cleared (nothing unversioned is readable by any BelJar since); storage with one never is.
- **Newer** than the code: the data belongs to a newer BelJar (another tab updated). **Nothing is
  touched**; the page is read-only and asks to be reloaded.
- A running tab that sees another tab stamp a newer version goes read-only at once, so it can never
  write the old format into upgraded storage.

`tests/test-store.mjs` pins each rule.

### 3.2 Every record has a class, decided by its key

The class decides what the online layer does with it, so it is **derived from the key pattern in one
table** (`store.mjs`), never passed by callers who could mislabel it.

| Class | What | Syncs | Under quota pressure |
|---|---|---|---|
| `work` | projects, the file tree, file text | the account's projects, once signed in (a device's own join it at sign-in, an empty one at its first character) | never dropped; a failed write is reported |
| `settings` | preferences, keybindings | by default, once signed in; the user can turn it off | never dropped |
| `device` | layout, panel sizes, open tabs, cursor and scroll, REPL transcript, notifications | never: syncing a laptop's panel sizes to a 4K monitor is hostile | never dropped |
| `cache` | semantic checkpoints: anything that can be recomputed | never | evicted first, oldest first, so a write that matters can land |

### 3.3 Layout

```
beljar/schema                     5
beljar/settings                   settings   { values: { <setting id>: value } }         the settings table
beljar/device                     device     { values: { <device id>: value } }          the device table (§4.3)
beljar/notifications              device     [notification]
beljar/tabs/ping|pong|bye         device     the tab guard's handshake (a channel, not state)
beljar/tombstones                 device     { pid: { version, owner, pending, at } }   synced projects deleted here, until the server knows (§5)
beljar/settings-sync              device     { account, version, values, pending }   the settings as last synced (§5.6)
beljar/p/<pid>/meta               work       { name, createdAt, owner }   one per project; the list is every meta
beljar/p/<pid>/tree               work       { files: [{ id: fid, name: path }], folders: [path], suites: { dir: [cfg path] } }
beljar/p/<pid>/f/<fid>            work       { text, via }   via: 'sync' when another device's version was written last
beljar/p/<pid>/session            device     { open: [fid], active: fid, views: { fid: view }, workspace, panel, explorerFolds }
beljar/p/<pid>/repl               device     { html, scrollTop, savedAt, commands }   this project's REPL; the store replHistoryPersist picks
beljar/p/<pid>/folds              device     { fid: [fold key] }            in the store editorFoldPersist picks
beljar/p/<pid>/undo               device     { undo, redo }                 the tab store, always
beljar/p/<pid>/conflict/<fid>     device     { base, mine, theirs, at, source }   both sides, until a person chooses; source 'tab' | 'device'
beljar/p/<pid>/cache/<fid>        cache      semantic checkpoint
beljar/p/<pid>/sync               device     { version, manifest, pending }   the version this device last synced, and its manifest (§5.2)
```

Two stores hold these, with one class table: **the store** over `localStorage` (survives the browser
closing) and **the tab store** over `sessionStorage` (survives a reload, dies with the tab). A setting
that reads "this device | this tab | nowhere" picks between them.

Every stored value is an envelope `{ at, data }`: `at` is when it was last written locally, for
display and for evicting the oldest cache first. What changed is decided by content, never by this
clock (§5). Key builders live in `js/persist/keys.mjs`, which is pure so early boot can read a
session without loading the app.

A file's `name` is its project-relative path (`proofs/nat.bel`); `files` is ordered because the
order is the user's. `suites` is which `.cfg` is active in each directory: a property of the
project (it changes what gets checked), so it is work and it syncs.

### 3.4 Ids are opaque

Projects and files get ids when they are created: `p_` or `f_` and 26 lowercase Crockford base32
characters, 128 bits in the shape of a ULID (48 bits of millisecond time, 80 random). **A path is
data, never a key.** Two different paths can never meet in storage, and a rename or a move never
relocates the text.

They are global (server keys, URL segments like `/edit/:id`, forks), and they sort in the order they
were made, even within one millisecond: a file's creation order survives a merge, which matters
because a folder run without a `.cfg` runs its files in registry order. `tests/test-ids.mjs`.

### 3.5 Settings are declared once

Each setting is one row in `settings-schema.mjs`: id, default, allowed values or type, the Settings
section it resets with, and whether early boot needs it before first paint. Reading, writing,
resetting a section, exporting, importing and every default in the Settings dialog **derive from that
table**. The module is tiny and pure so `early-boot-core.mjs` can import it: first paint parses one
record instead of eight separate keys, and can never disagree with the dialog about a default.

## 4. The store (`js/persist/store.mjs`)

```js
const store = createStore({ storage, now });
store.get(key)                 // data, or undefined; never throws
store.set(key, data)           // { ok } | { ok: false, error }; stamps `at`
store.update(key, fn)          // read-modify-write in one call
store.remove(key)
store.keys(prefix)             // every key under a prefix
store.classOf(key)             // work | settings | device | cache
store.subscribe(fn)            // fn({ key, cls, origin: 'local' | 'remote' | 'tab' })
store.applyRemote(key, data, at)   // the online layer's only way in
```

⛔ **Only the store touches browser storage.** Everything else asks Persist, Settings or Device.
`tests/test-store-ownership.mjs` fails when any other module names `localStorage` or
`sessionStorage` or calls the storage API. The exceptions are listed, and each is checked to still
need its exemption: Persist (which hands the areas to the stores), early boot (which hands them to
pure readers because first paint cannot wait), and those readers.

⛔ **Every name the app asks for exists.** `tests/test-persist-api-use.mjs` reads every script the
page can load and holds each `Persist.<name>` to the real Persist, and each literal id given to
`Settings`, `readSetting`/`writeSetting` and `Device` to its table. `js/beluga/beluga-client.js`, a
plain script outside the build, kept calling two preference readers the rebuild removed, and Run
threw on every file until `probe:live` ran a check (2026-09-28); `probe:app` now runs a file too.

⛔ **The store needs a real Storage.** It lists keys (the schema wipe, whole-project deletes,
eviction, the project list), so a stand-in without `key()` and `length` is refused at creation
rather than silently finding nothing.

⛔ **A write that matters is never dropped silently.** On a full disk the store evicts `cache` records
and retries once; if a `work`, `settings` or `device` write still fails it is reported to the user
(once, not per keystroke) and the call returns `{ ok: false }`.

⛔ **Another tab's write is an event, not a surprise.** The store turns the browser's `storage` event
into `subscribe` notifications with `origin: 'tab'`, which is how the second-tab guard and any open view
stay honest.

### 4.1 Settings (stage 2)

```js
Settings.get(id)               // the effective value, from memory; never touches storage
Settings.set(id, value)        // false when the value is not one the setting can hold
Settings.reset(section)        // one Settings-dialog category; resetAll() for everything
Settings.exportBundle() / importBundle(bundle)   // exactly what the user changed
Settings.subscribe(fn)         // fn({ ids, origin }) on any change, from anywhere
Settings.revision(id)          // bumps on every change to id: what a hot-path cache keys on
readSetting(id)                // for editor code that must also run without the shell (Node tests)
```

One `Settings` per page, created with the store inside `persist.mjs` and published as a global beside
`Persist`. `Persist` no longer answers for any setting.

⛔ **A setting is declared once, in `settings-schema.mjs`.** Nothing else may hold its default, its
allowed values, or its section. `command-settings.mjs` names the setting it drives and takes kind and
values from the table. `tests/test-settings-usage.mjs` fails on an id the table does not declare and
on a declared setting nothing uses.

⛔ **Nothing applies settings to the page by hand.** The frame subscribes to `Settings` and repaints
the page-level look (`applyDocumentSettings`) on any change: the dialog, `:set`, a reset, an import,
another tab, the online layer. Early boot paints the same function from `readBootSettings()`, so boot
and a live change cannot disagree.

⛔ **A cache keyed on a setting keys on `Settings.revision(id)`**, never on a list of events that might
change it. Keybindings and alias pairs do; the event list they replaced had already missed imports.

⛔ **A setting that must move data when it changes reacts to the change**, not to a write. Changing
where the REPL history or the editor folds are kept moves them (`device-records.mjs`), whoever
changed the setting.

### 4.2 The work model (stage 3)

Three modules, one direction of dependency:

| Module | Owns |
|---|---|
| `work.mjs` | the records: the project registry, the page's project, each project's tree, file text, session and cache; read caches kept coherent by the store's events |
| `work-files.mjs` | what the app does with files: create, rename, move, delete, restore, import, folders, `.cfg` membership, open tabs, alias expansion on write. `Persist`'s file API is this module |
| `document.mjs` | the open document: `createPersist({ documentId })` loads text, view and semantic checkpoint, and saves each to its own record |

⛔ **No record is shared by every project.** Each project is its own `meta` record
(`{ name, createdAt, owner }`), and the project list is every meta record, oldest first. A create
writes the tree, then the session, then the meta record, each only if the last landed, and removes
what it wrote when one is refused: nothing is listed half-made. A delete removes the meta record
first. `owner` is the account a project belongs to, or null for one that lives only on this device.

⛔ **A browser shows its own projects and the signed-in account's, never another account's.** One
lab computer serves many students. The account is the device row `account` (an opaque id, never a
credential); signed in, a new project belongs to the account and syncs, signed out it belongs to the
device. `claimProject` gives a device's project to the account: signed in, every project here with
something in it is claimed, silently (§5.7); `removeAccountProjects` takes an account's projects off
the device, with their sync bookkeeping (what signing out does). Changing the account reloads the
page.

⛔ **A page is pinned to its project.** The project a page works on is decided when it loads and
changes only when the page itself switches (and then reloads). `beljar/device.activeProject` is
which project to open *next time*. Before, every call re-read a key that every tab shares, so a
second tab switching projects silently redirected this tab's saves into the other project.

⛔ **A save writes only what changed.** The document compares the editor's text with the stored text
and writes the file record only when they differ; the same for the view and the semantic
checkpoint. Every write is an event that other tabs and the sync runner act on, so a save that
changes nothing must not make one.

⛔ **A save never resurrects a deleted file.** A debounced save that fires after its file was deleted
(or after another tab deleted it) writes nothing.

⛔ **Text is written exactly as the user wrote it**, except that greedy alias expansion applies to
text arriving from outside the editor (`setFileText`, import, restore). Nothing on the load path
edits text.

The read caches (the tree, and each file's text) are keyed by record and dropped on any store event
for that record, from this tab, another tab or the online layer. A returned tree or file list is a
copy: a caller that mutates it changes nothing.

### 4.3 Device state (stage 4)

What belongs to this browser and never syncs. Two shapes:

**The device table** (`device-schema.mjs`): small values, declared once, like the settings (both are
tables, `table.mjs`). `Device.get(id)` / `Device.set(id, v)` / `Device.reset(pick)`, one record,
only non-defaults stored. It holds the active project, the signed-in account, when the browser was last asked to keep BelJar's storage and when Safari's 7 days were said (§5.9), the editor split and every panel size, the
Harpoon details rail, the graph panel's preferences, the hints dismissed before they followed the
account, the command-line history, the run-time estimator's model and the jump-log flag.
⛔ **A tip seen on one computer is seen on all of them** (Dean, 2026-10-06; `js/ui/hint-seen.mjs`):
each tip that shows once has a synced setting of its own (`hintSeen*`, `reset: false` so no Reset
brings it back), one row per tip because settings sync merges a setting at a time and two computers
that each saw a different tip would fight over one list. The device's old `dismissedHints` still
counts and is carried into the rows at boot. A tip is seen the moment it is shown: the
countdown only takes the box down, and a refresh before it ends does not show the tip again.
Signed in on a computer whose first round has not
landed, a tip waits for that round however long it takes, and one showing closes when a round says
it was seen (`tests/test-hint-seen.mjs`, `scratch/probes/probe-hints.mjs`: two computers, the
second held offline for 25 s). Numbers are clamped to their row's range on the
way in, so a drag past the edge stores the edge. Rows with `group: 'layout'` are what *Reset panel
layout* puts back; rows with a `cssVar` are painted by early boot before first paint
(`readBootDevice`). Editor code that also runs under Node reads through `readDevice` /
`writeDevice`, which fall back to the row's default without the shell.

**Device records** (`device-records.mjs`): what is too large or too structured for a row: the REPL
transcript and commands, one record per project, editor folds, notifications, the undo stack, the
tab guard's handshake, and this project's workspace, side panel and explorer folds (in its session).

⛔ **A device value is declared once.** `tests/test-device-usage.mjs` fails on an id no row declares
and on a row nothing uses.

⛔ **The undo stack lives in the tab.** A reload keeps it; a second tab starts empty (it would
otherwise undo edits it never saw). It sheds its oldest steps when the tab store refuses it.

⛔ **The tab guard talks through the store.** `Persist.postTabMessage` / `onTabMessage` ride the
store's cross-tab events, which carry the value the other tab wrote: by the time a tab handles an
event, the key may already hold a newer message, and the handshake needs every one.

Found on the way: the run-time estimator saved only `lines` and `ms` of what it learned, dropping
its rate and sample count, so every estimate was "the last run, one sample" and it never learned.
Its `runModel` row keeps the whole model (`tests/test-run-model.mjs`).

### 4.4 Concurrency (stage 5)

Two copies of the same file changing at once: two tabs today, two devices once sync exists. One
mechanism serves both, because a pull is just another change underneath.

**The merge** (`merge.mjs`): `merge3(base, mine, theirs)` is diff3 as Khanna, Kunal and Pierce
define it. Edits that do not touch combine; edits that overlap **or touch** are a conflict, never
guessed (the same rule as git). `textChanges(a, b)` turns a text change into editor changes that
touch only the lines that differ. `tests/test-merge.mjs` checks its laws over ~8000 seeded cases.

⛔ **A change underneath an open file is never overwritten.** The document (`document.mjs`) remembers
its **base**, the text it last read from or wrote to storage. When its file changes underneath it
(another tab, a pull, a `.cfg` rewrite) it compares three texts, on the next tick and again before
every save:

| The editor… | Then |
|---|---|
| has nothing unsaved | take theirs, shown in the editor |
| has edits that do not touch theirs | merge; show the result; save it |
| has edits that touch theirs | **conflict**: keep both, write neither over the other, ask |

A conflict keeps mine in `beljar/p/<pid>/conflict/<fid>` (and goes on saving it there) while
storage keeps theirs, so the other tab sees no change until a person chooses: **Keep mine**,
**Take theirs**, or **Keep both** (theirs saved as `name (conflicted copy).ext` beside the file).
The record says where theirs came from, and the dialog says it: another tab, or another device
(the file's last text came through sync: `via: 'sync'`). A conflict the sync engine found (§5.3)
is written before the text it concerns, so an open document takes it up as its own, with the
editor's text, unsaved typing included, as mine.
Every write that keeps something lands before the record that held it goes. The conflict survives
a reload, and the file asks again when it opens. An editor that cannot display a change from
elsewhere (`applyExternalText`) is never told it has one: that becomes a conflict too, so its next
save cannot put the old text back.

⛔ **Someone else's change is not your step.** It enters the editor marked `externalChange`: a burst
being typed ends at the text it had before the change, and nothing is recorded for the change
itself. When undo meets text that has changed since the step, it first takes back only the step's
own change (a merge of what the step left, what is there now, and what it started from) and keeps
theirs; only when the two touch does it fold the drift into the step as before. Undo still never
refuses.

`tests/test-document.mjs`, `tests/test-edit-history.mjs`, and `scratch/probes/probe-concurrency.mjs`
(two real tabs: a live change, a merge, the dialog, a read-only upgrade).

## 5. The online layer (decided 2026-09-24; built in stage 6)

The online layer is a subscriber, not a store. Local stays the only thing the app reads; the cloud
is a replica. Because the app only ever talks to the store, adding, removing or breaking the online
layer can never lose local work. Code: `js/persist/sync/`.

### 5.1 What syncs: versions of a project

The unit on the server is a project **version**: a manifest and the file texts it names, stored once
per content hash (SHA-256). A manifest is small: the project's name, its files in the user's order
(**id**, path, hash), its empty folders and its active suites. Files are matched by id, so a rename
is a rename and never a delete plus an add. A version is committed by moving the project's head
with a compare-and-swap: the head moves only if it is still the version this device last synced.

- a one-line edit uploads one small file, not the project;
- retries are safe (the same content has the same hash);
- history, share links, forks and the verification input come with it;
- storage grows with changed files, not with a full copy every push.

Zip stays the format for people (download, upload), not the wire format.

**The wire** (`sync/protocol.mjs`): `heads`, `head`, `blobs`, `missing`, `putBlobs`, `commit`,
`remove`, `settings`, `commitSettings`, every one async; a transport that cannot reach the server
throws, which is never an answer. A `commit` may carry the texts it names (`texts`): **a push is
one request** (plan v6 c2, 2026-10-03). The server checks each against its hash, keeps only those
the manifest names, and answers `missing` with what it still lacks. `versions` and `version` read
the history back (plan v6 c6): a page of summaries newest first (D1 reads them with its JSON
functions, no manifest travels), and one version whole; its texts come from `blobs`, since a text,
once kept, is never removed while the account lasts. **`sync/memory-server.mjs` is the reference server**: every rule
a real one must follow, pinned one by one in `tests/test-sync-protocol.mjs` (§5.7).

### 5.2 What a device keeps

`beljar/p/<pid>/sync` (device class, never synced): the version this device last synced and that
version's manifest. **A project is dirty when its contents hash differently**: exact (an edit
undone is not dirty) and free of clocks. The texts a merge needs from the base are fetched by hash
when a merge happens; nothing is stored twice.

⛔ **A commit is recorded as pending before it is sent.** A response that never arrives is settled
next time by sending the same commit again: the server answers a commit id it has seen with the
version it made, so nothing is committed twice, and the device never merges against its own work
(which would ask a person to choose between their edit and itself).

A synced project deleted here leaves a tombstone (`beljar/tombstones`) until the server has been
told. It remembers the version deleted and any unanswered commit, so the device's own last commit
is not mistaken for another device's change.

### 5.3 One pass over one project (`sync/engine.mjs`)

| The server… | Then |
|---|---|
| is where this device left it | push, if anything here hashes differently |
| moved on | merge file by file against the synced version, apply, then push the result |
| deleted it | forget it here, unless it changed here: then it goes back up over the deletion |
| has it, and this device does not | download it |
| has it, and it was deleted here | delete it there, unless another device changed it since: then it comes back |

⛔ **A commit is never sent for a project deleted while its texts were going up**: `push` checks
right before it records the commit as pending. A commit landing after the tombstone was written
reads, next round, as another device's edit, which beats the deletion: the project would come back.
(A push carries its texts in the commit itself, after it is recorded, so this only arises for one
too big to carry them, whose texts go up ahead in batches; deleted while the commit is in flight,
the tombstone names it and the deletion stands.)

**A push is one request.** The commit carries the texts its last synced version did not have (the
ones the server most likely lacks), up to 200 texts and 512 KB; more go up ahead in batches. When
the round's list already says the server is where this device left it, no head is asked for: the
commit's compare-and-swap is the check. A round that sends one edit is `heads`, `commit` (and
`settings`), where it was six requests in a row.

⛔ **At most one commit of a project is in flight, and it is sent again exactly as it went.** The
texts a commit carries are kept with it in the sync record. Sent again bare, after the first had
been given up on and while it was still on its way, it came back "missing", the record let it go,
the first landed after, and the device was asked to choose against its own commit (seed 8 of the
simulator, 2026-10-03). A pass that finds a commit pending settles it first; `push` re-reads the
record right before it records its own and stands back if one appeared (the page hid while it
hashed).

**What you typed is in the cloud when the tab closes** (`engine.flush`). As the page goes (a tab
closed fires `pagehide` first, then goes out of sight; a tab switched away from or a phone switching
apps only goes out of sight), the tab that syncs sends every project changed since its last round
at once, each in one request sent with `keepalive`, which the browser finishes after the page has
gone (`http-transport.mjs` `commitOnHide`). ⛔ Synchronously up to the send: a closing page may get
no later turn, so the hash is computed in JavaScript (`sha256Sync`, the same value as Web Crypto's).
What was typed in the last moment is written to storage first (`document.mjs` `flushPending`). Each
commit is recorded as pending before it is sent, so one that never lands is sent again at the next
open. The browser lets a closing page's keepalive requests carry 64 KB between them: what does not
fit (the open project goes first) waits for the next round, as before. Nothing is sent offline, by a
tab that does not hold the lock, or while rounds are held for the person (Back online: Ask me
first). A project with a commit already in flight is left alone. The quiet spell is unchanged.

Per file (`sync/merge-project.mjs`):

| | Then |
|---|---|
| changed on one side | that side |
| changed on both | `merge3` of the texts (§4.4); lines that collide are a **conflict**: storage takes theirs, mine waits in the conflict record, a person chooses |
| deleted on one side only | gone |
| deleted on one side, changed on the other | **kept**, and a person is told: an edit is never lost to a delete |
| renamed on both | mine (the rename just made here); the project's name and each directory's suites merge the same way |
| two files at one path | the server's keeps it; the other becomes `name (conflicted copy).ext` |
| a conflict on a file still waiting for a person | this device's text is kept as a conflicted copy beside it, so no side is lost |

Empty folders merge as a set. Different files, and different lines of one file, never ask.

⛔ **Never apply a merge to a project that moved while the engine waited.** Every change lands
synchronously, right after checking that the project is exactly as it was when its manifest was
taken; if not, the pass starts again. Conflict records land before the texts they concern, then
texts, then the tree, then the meta record, and only then do dropped files go. Remote text enters
through `applyRemote`, and an open editor takes it as it takes another tab's (§4.4).

### 5.4 What a person hears

Everything sync did that a person should know goes to the notifications (`source: 'sync'`): a
conflict (and the file asks when it is open), a file kept or brought back over a delete, a file
renamed because another took its path, a project deleted, kept or brought back. A page whose
project is deleted elsewhere says so and offers another; it never goes on taking edits that can
no longer be saved. A new tree from elsewhere reaches the explorer and the tabs as a change made
here does.

### 5.5 One tab syncs (`sync/runner.mjs`)

The Web Locks API elects one tab per browser, and hands the lock to another the moment its holder
closes. Without Web Locks nothing syncs: two tabs syncing at once is not a risk worth taking. A
round runs 5 s after work or settings change (never on a keystroke), within 30 s however busy the
typing, every 60 s for other devices' changes, and at once on an explicit save, on coming back
online, and when the tab comes back into view. A round that cannot reach the server backs off
(5 s, 15 s, 60 s, then 5 min). Rounds never overlap. Changing projects reloads the page, and the
next page syncs as it starts.

What counts as a change is what the person did. ⛔ What the engine writes itself settling a round
(a project forgotten, a deletion settled) does not: the engine marks those writes with `own`, and
`persist.mjs` tells the runner to `ignore` them. Heard as changes, they left the cloud saying
"waiting" after every such round. ⛔ A change heard
*during* a round keeps its own quiet-spell timer: the round used to put the 60 s poll in its place
when it finished, so the change, and the cloud saying "waiting", sat for a minute (2026-10-01).

**What a round costs someone typing** (measured 2026-10-01, real Chrome, the real Worker, an
account of 6 projects, 180 files, 1.09 M characters; `scratch/probes/measure-sync-typing.mjs`). A
round with nothing to send takes 29 ms and holds the main thread about 11 ms in all, never more
than 8 ms at once; with one file edited, 97 ms and about 50 ms in all, never more than 13 ms at
once: under a frame. Typing with a round forced every 0.7 s (some forty times the real rate)
against the same typing with none: frame gaps p95 18 to 24 ms and p99 24 to 36 ms on both sides,
no long task from sync, and the long frames that do occur (4 with rounds, 5 without, over a
minute of typing each) are the editor's own measure and mutation passes, the same either way.
Every round reads and hashes every project of the account, so the cost grows with the account,
not with the open file: measure again if accounts grow tenfold.
⛔ Compare the main thread (timer gaps, frame gaps, long tasks, handler time), never Event
Timing's `duration` in headless Chrome: it runs to the next *presented* frame, headless presents
on its own schedule, and the number followed whether anything on the page was animating (hiding
the cloud's animation made it ten times worse with the main thread unchanged; a control whose
cloud happened to animate looked fast).

`Persist.startSync({ transport })` starts it for the signed-in account and returns the runner:
`status()`, `subscribe(fn)`, `syncNow()`, `stop()`.

### 5.6 Settings

Settings sync by default; `syncSettings` turns it off on a device. They merge per setting against
the last-synced copy (`beljar/settings-sync`, per account), so different settings changed on two
devices never disagree, and one setting changed on both takes the later change. Rows that only make
sense on one device carry `sync: false` and never leave it: `belugaMode` (a phone and a
workstation download different builds), `replHistoryPersist` and `editorFoldPersist` (where this
browser keeps history), and `syncSettings` itself. Arriving values are checked against the table
like any stored value. Device state never syncs.

### 5.7 Server rules

- A commit moves the head only over its `base`; versions count up by one, so history is a line.
  Deleting is a version too, and a commit over a deletion brings the project back.
- A commit id seen before answers with the version it made.
- A manifest may only name texts the server has; every text is checked against its hash on the way in.
- A project belongs to the account that first committed it; no other account can read it, write it
  or learn that it exists.
- Texts are pooled per account, never across accounts: a shared pool would tell one account that
  another holds the same file.
- Keep every version a device may still hold as its base (all of them, until there is a reason
  not to): a merge fetches the base's texts by hash.
- Sessions are cookies the page cannot read; no credential ever enters the store.

**The server** (`server/`, step 1 of going online, 2026-09-28): a Worker answering
`POST /api/sync/<method>` with `{ args }` → `{ result }` (`worker.mjs`), the rules above on D1 and
R2 (`sync-store.mjs`, schema in `migrations/`), and the client's side,
`js/persist/sync/http-transport.mjs`. ⛔ Every call there has a time limit (30 s; 120 s for the two
that carry texts), body included: rounds never overlap, so one request that never answered (a
connection that stalls without closing) held its round open and every round after it, and sync
stopped with nothing to say so until the page reloaded (2026-10-01). A call that runs out ends its
round as offline, and the runner backs off and tries again; a commit sent twice is answered as the
version it already made. ⛔ **A refused request is not offline** (plan v6 c9, 2026-10-05): one the
server answered with a status that is not an answer (429 busy, a 5xx, 413 too large) stops the
round like a network failure (`err.stopsRound`: it does not go on project by project against a
busy server), but the summary says `error`, with `reason` `status-<code>`, and the cloud says
"Couldn’t sync" and why (`sync-ui.mjs failureWords`): "BelJar’s server is busy (429). It tries
again on its own; nothing here is lost." A project the server refused on its own (`refused-<code>`,
a quota) says so too. Read as offline, a 429 put a person's edits in "Changes made offline" when
the setting asks first, though the network was fine. Only a request that never reached the server
is offline. `tests/test-sync-refused.mjs`: the page's own Persist against a server answering 429,
both tabs saying why, nothing lost, everything pushed after. A head moves in one D1 transaction: the UPDATE moves it only
where it is still `base`, and the version row goes in only if that UPDATE changed a row; the key on
(project, version) is a second, independent guard. Texts are checked against their hash, stored in
R2 under `t/<account>/<hash>`, and indexed in D1 only once R2 holds them. Same-site JSON posts
only.

**Sign-in** (step 2, 2026-09-28; `server/auth.mjs`, schema `migrations/0002_accounts.sql`): GitHub
OAuth with no scopes. `/api/auth/github/start` puts a one-time state in a short-lived cookie;
the callback checks it, exchanges the code server to server, reads the profile once and **stores no
GitHub token anywhere**. An account (`u_…`) has many identities (GitHub today) and a handle. A
session is a random token in an HttpOnly, SameSite=Lax cookie (`__Host-` over https); D1 keeps only
its hash, for 90 days, and signing out deletes the row. The sync API's account is the session's.
For tests and local development only, where the config sets `DEV_ACCOUNT_HEADER = "yes"`, the
`X-BelJar-Account` header names the account instead; anywhere else it means nothing. That config
is `server/wrangler.jsonc`, local only.

**Deployed** (step 3, 2026-09-28): `wrangler.jsonc` at the root is what Cloudflare's Git build
deploys (before it existed, the build generated one: `bel-jar`, compatibility 2026-09-21, logs on,
the root as the site; the file keeps all four). The Worker `bel-jar` serves the site's files as
before and answers `/api/*` only, bound to the D1 database `beljar-sync` and the R2 bucket
`beljar-texts` (private: only the Worker reads it). It lists no routes: the domain stays attached in
the dashboard, and a listed route would switch workers.dev off. The live GitHub app's id is a var;
its secret is set with `npx wrangler secret put GITHUB_CLIENT_SECRET --name bel-jar` (any folder;
it prompts) and is in no file; without it, sign-in answers 503 at the start. Tables:
`npx wrangler d1 migrations apply DB --remote`, from the repository (applied 2026-09-28).
`npm run probe:live` checks all of it on the real site, the secret included: GitHub checks an app's
credentials before the code, so a made-up code must come back as `bad_verification_code`, never
`incorrect_client_credentials`.
`tests/test-deploy-config.mjs` holds the config (no dev switch, no secret var, /api/* only, the
bindings the code reads) and the upload, listed as wrangler lists it: nothing private goes up, and
everything the page loads does. ⛔ wrangler skips no file on its own; until this step the live site
served `/.git/`.

**In the page: sign in and forget it** (2026-09-29, replacing the claim flow; the contract for how
it looks is [`docs/UI.md`](UI.md)).

- **Signing in** (`js/account/account.mjs`) is the whole setup. Every project in this browser that
  belongs to no account and has something in it joins the account, on every load while signed in,
  and syncs; nobody is asked, and nothing says it went well. An empty project waits for its first
  character (every browser starts with one, and the account would collect them); a write to it
  claims it then. The avatar sits at the header's right, round; its popover says who, then Settings
  and Sign out, and a picture that cannot load (a blocker, a deleted avatar) becomes the initial,
  never an empty circle. Where the site has no server (a 404: local static serving, the probes)
  the button stays hidden. ⛔ On a deployed host (`BELJAR_DEPLOYED`, set by `index.html` from the
  same host list as the runtime's) a server is always there, so a failure to ask it is never taken
  for "no server": the button stays, in the warning colour, its popover says why ("the network, or
  a browser extension, stopped it", or the status) with Try again, and a notification keeps the
  reason. `/api/auth/me` is asked twice before that. A blocked request once made the whole account
  vanish with no trace.
- **Signing out** asks the syncing tab for one last round (`Persist.confirmSynced`, from any tab)
  and, when it says everything is on the server, removes the account's projects from the browser,
  with sync stopped and its last round finished first. The only question it ever asks is when that
  cannot be confirmed: "Not everything is in the cloud yet", Stay signed in or Sign out anyway.
  With "Projects in this browser: Keep them" nothing leaves, so nothing is asked: the account's
  projects stay, usable signed out (device `keptAccounts`, `work.mjs` `isVisible`), never adopted by
  another account, and syncing again, with what was done meanwhile, when the same account signs in.
  ⛔ The page is still live while the projects go, and reading the project list creates a project
  when none is visible (`ensureProjects`), for whoever is signed in. Removing while still signed in
  made an empty project FOR THE ACCOUNT on every sign-out (the adoption listener read the list on
  the removals' file events), and the next sign-in uploaded it. So `signOut` adopts nothing from
  then on, and orders the two steps: removing, sign out first (a read makes this browser's own
  placeholder); keeping, keep first (the list is never empty).
- **Signing in again, back to the work.** Removing leaves the browser a blank placeholder (no
  account, the default name, one empty file: `work.isBlankProject`), and a page that stayed on it
  after signing in looked as if the work was gone. Signing out remembers the account's project that
  was open (device `resumeAccount`, `resumeProject`; a fresh sign-in on a new device remembers
  none). Once the account's work is here (the first round brings it), a page still on the blank
  placeholder opens that project, else the account's newest, and drops the placeholder
  (`account.mjs` `resumeAfterSignIn`, `resumeTarget`; `App.resumeProject` switches through the
  flush-safe path and re-checks blankness after the flush, so a keystroke in flight keeps the page
  where it is). Once per sign-in: a page where the person is already at work stays.
- **Settings > Account** (`settings-schema.mjs`, section `account`, with its own Reset):
  - *Sync settings* (`syncSettings`, this device only).
  - *Changed in two places* (`syncBothChanged`): a file edited here and in the cloud since they
    last synced. `merge` ("Merge them", the default), or `ask` ("Ask me"): nothing merges by
    itself (`merge-project.mjs` `askAll`), and every such file waits in Review differences,
    unless both sides made the very same change.
  - *Where edits overlap* (`syncOverlap`), nested under it and shown only when merging: `ask`
    (the review), or `mine` / `cloud`, settled to that side as they appear (`sync-ui.mjs`).
  - *Back online* (`syncReconnect`): `upload` ("Upload them", the default), or `ask` ("Ask me
    first"): see "held" below.
  - *Say when you go offline* (`syncNotices`): the strip's "Offline" and "Back online". The cloud
    says it either way.
  - *Projects in this browser*, under Signing out (`signOutKeep`, this device only): `remove` or
    `keep`.
  ⛔ Each choice is short enough for its control (11rem): the probe measures every trigger.
- **Held: "Back online: Ask me first"** (`js/persist/sync/hold.mjs`). When the connection
  goes (the browser says so, or a round cannot reach the server) while this device has work the
  cloud lacks, the runner is held (`runner.hold`): no round runs, in either direction, until the
  person decides. Back online, the summary says `held`, the strip "Changes made offline", and
  the review (`js/ui/review-offline.mjs`) lists each project with what changed (edited with a
  compact diff against the cloud's text, new, renamed, deleted; a project made offline, a project
  deleted offline, and one the cloud deleted meanwhile), then Upload (releases, from any tab:
  `Persist.releaseSync`) or "Use the cloud’s" (`engine.useCloud`: the head's texts, tree and name,
  a deletion here undone, a deletion there taken, files waiting for review settled). ⛔ The hold is
  the device's, not the tab's: the device row `syncHeldFor` names the account it holds for, so a
  reload keeps it and whichever tab syncs next takes it up; a hold with nothing left to show
  (undone, or the cloud's taken) lets go by itself once back online, and so does the setting going
  back to "Upload them". ⛔ `runner.release` reports the release together with the round it starts:
  released-and-still-offline in between would be held again before the round could try.
- **One summary, every tab** (`js/persist/sync/sync-status.mjs`): signed in, the state (`differs`,
  `offline`, `held`, `error`, `syncing`, `pending`, `synced`, in that order of what needs you;
  held while the browser is offline reads `offline`, since nothing can be done yet), the last
  sync, and the files changed in two places. Only the tab holding the lock runs rounds; it posts
  its runner's status as a tab message, a tab that opens asks for it, and every tab builds the same
  summary (`Persist.syncSummary`, `Persist.onSyncSummary`).
- **Where it shows** (`js/account/sync-ui.mjs`): a cloud beside the project name, signed in only
  (synced, syncing, offline, couldn't sync, files to review), whose popover says the state and
  offers Sync now and Review differences; a strip segment only when something needs you (files to
  review, offline, a failing round, changes made offline) and "Back online. Everything is synced."
  in passing; the explorer marks files changed in two places. Nothing toasts. The cloud
  (`cloud-glyphs.mjs`, 2026-09-30) is quiet grey; colour goes only on the mark inside and only while
  it says something: the checker's blue while a round is in flight (waiting for the quiet spell,
  `pending`, the arrow rests), its green as a round lands (the check draws itself in, then settles),
  amber or red when something needs the person. `tests/test-account-marks.mjs`,
  `scratch/shot-header.mjs` (both themes, 4x).
- **The same lines changed in two places** interrupt nothing: both versions are kept (§4.4), and
  Review differences (`js/ui/review-differences.mjs`, opened from the strip or the cloud) shows each
  file's compact diff with Keep mine or Use cloud. The open file is settled through its document
  (`App.resolveOpenConflict`), any other through storage (`Persist.resolveStoredConflict`). Settings
  > Account > "Changed in two places" can settle what comes from the cloud as it appears.
- While a menu is open, toasts fade back and let clicks through: they live in the top layer, and
  one sat over the account menu.

**A failed sign-in says why.** The server sends the page back to
`/?signin=failed&why=<step>&detail=<GitHub's answer>`: `config` (no secret: refused before GitHub),
`state` (`no-cookie`, `mismatch`: another tab's sign-in, `no-state`), `denied` (cancelled, not a
failure), `code`, `exchange` (GitHub's word: `incorrect_client_credentials` is the server's secret,
`bad_verification_code` an expired or used code), `profile`, `github` (unreachable). Workers Logs keep
the same two words, never a code, token or secret. The page shows a toast and puts the reason in
the notifications (`signInFailure`; `tests/test-account.mjs` reads every step out of
`server/auth.mjs` and holds that each has its own sentence).

**Where you are signed in, and deleting the account** (plan v6 c3, 2026-10-04; schema
`migrations/0003_sessions_and_deletions.sql`, additive).

- **Devices.** A session keeps a coarse name for its browser, read from the User-Agent at sign-in
  ("Chrome on Windows", `auth.mjs deviceOf`; the header itself is never kept), and when it was last
  used, moved at most once an hour (one write an hour for a session in use; a session from before
  names itself then). Settings > Account > Devices lists them, this browser first, each other one
  with Sign out (`GET /api/auth/sessions`, `POST /api/auth/sessions/end`). ⛔ Not this browser's own:
  Sign out ends that one, once its work is in the cloud.
- **A session that ends without its browser signing out** (Sign out there, Delete account, or
  time): `ended_sessions` keeps why ('elsewhere', 'deleted') by the session's hash alone, until
  the session would have expired, and `/api/auth/me` answers it (`ended`). The browser follows
  when it next asks: as a page loads, or at its next round, whose 401 the transport tells the page
  (`http-transport.mjs onSignedOut`, `account.mjs followEndedSession`). ⛔ Deleted, the account's
  projects stay as the browser's own (`work.releaseAccount`: no owner, and no sync record, tombstone
  or mark left; a record still naming the deleted account's versions would read, at a later
  sign-in, as the cloud having deleted them). Otherwise as the browser's own sign-out would (Projects
  in this browser), except that nothing the cloud lacks leaves: `Persist.unsyncedProjects` reads,
  from this browser alone, the projects with work since their last round or a commit still on its
  way, and `leaveAccount(uid, keep)` keeps those for the account (they sync when it signs in again).
  The page that loads next says why, once (device `signedOutNote`). A session is read beside its
  account: one whose account is gone is nobody's.
- **Delete account** (`POST /api/auth/delete`, `server/deletion.mjs`). Asked once (the dialog
  names the account, what goes and what stays); sync stops first, so nothing this browser sends
  lands after. One transaction removes every row that names the account and every session (each
  browser to hear 'deleted'), and records the deletion; then the stored texts go a thousand at a
  time while the request lasts (carried on with `waitUntil` if the page goes). ⛔ What names an
  account is listed once (`ACCOUNT_ROWS`): `tests/test-account-deletion.mjs` fails for a table the
  migrations make that is neither listed nor said to name none. ⛔ The session cookie stays: if the
  answer is lost, the page asks `me`, hears 'deleted', and goes on as if it had come. The **daily
  job** (cron 07:00 UTC, the Worker's `scheduled`) finishes the texts a closed tab left, sweeps up
  what a request already under way wrote after the account went, and lets the record go once an
  hour has passed; it also lets go of sessions past their time and the reasons kept for them.
  Projects in the browser that deleted stay, as its own.
- **What BelJar keeps** (`privacy.html` at `/privacy`, `Routes.privacyUrl`; plan v6 c4): one page,
  linked from home's foot (Privacy): what is stored,
  where (Cloudflare D1 and R2, eastern North America), who can read it, logs and backups, and how
  to delete it. ⛔ It says what the code does: `tests/test-privacy-page.mjs` fails for a table the
  migrations make that the page does not name, for a number the page gives that the code does not
  have (90 days, to the hour, within a day), and for a Delete account that removes less than the
  page says. The page is not home: `Routes.pageOf` says 'privacy', so a start page of "Last
  project" never sends it on, and the transition is a plain cut both ways (it does not opt in).
  The words are Dean's to approve.
- **Backups** (plan v6 c5). D1 Time Travel restores the database to any minute of the last 7 days
  (30 on the paid plan). Outside Cloudflare, once a week: `npm run backup:export` (the live
  database, only read, to `~/beljar-backups`, the newest four kept) and `npm run backup:restore`
  (the newest restored into a scratch local D1 and checked table by table against the rows in the
  file; first run 2026-10-04, 55 rows in 9 tables). ⛔ **The texts are in it too** (Dean,
  2026-10-06): until then they were left out because each is named by its content and never
  overwritten, but that guards against overwriting, not loss. R2 has no Time Travel, and a
  database restored without its texts is projects and versions whose files say nothing (a bug in
  the deletion sweep, a mistyped command or a deleted bucket would have lost them for good).
  The export reads the texts it lists (every `texts` row, counted, or it stops) and fetches the
  ones `~/beljar-backups/texts/<account>/<hash>` lacks, each checked against its SHA-256 name
  before it is kept; a text goes once none of the four kept exports lists it, so a deleted
  account's texts leave the backups within the privacy page's 30 days. The restore check finds
  every listed text there and intact. First run 2026-10-06: 13 texts, then 0 to fetch the week
  after. Each fetch is a wrangler of its own (about 3 s, six at once): a class adding a few
  thousand texts a week is most of an hour; R2's S3 API with a read-only token is the way past
  that. Putting texts back in a disaster is `wrangler r2 object put beljar-texts/t/<account>/<hash>
  --remote --file …` for each, not scripted yet.
  `tests/test-d1-backup.mjs` holds the count, the four kept, the texts with them, and that the
  live database and texts are only ever read.
- **What sync costs, measured** (plan v6 c7, `tests/test-sync-budget.mjs`, which prints these and
  holds them as ceilings: a change that makes sync dearer fails there). Requests, through the real
  runner and engine on a fake clock: an hour of typing (a keystroke saved every 2 s) is 121 rounds
  (one every 30 s, the longest a change waits) and 241 requests; an hour idle is 60 rounds and 60
  requests; an hour with the page hidden, none. Rows written, as D1 itself counts them on a real
  local database: an edit 5, a new project 8, a setting 4, an idle round 0 (an edit's five: its
  text, its version, the version's commit id, the head, and the account's count for the quota).
  A lab of 25 typing for two hours is then about 6,000 rounds and 30,000 rows, under a third of
  the free plan's 100,000 rows a day.
- **Waste less, wait no longer** (plan v6 c8, 2026-10-05). Before: typing 362 requests an hour,
  idle 120, an edit 6 rows, a new project 9, a setting 6. Three changes, none to when a change
  syncs: (1) the settings' version rides with the project list (`heads({ settings: true })`), and
  the settings pass asks nothing more when it is this device's own and nothing changed here: an
  idle round is ONE request; (2) a tab nobody can see does not poll (`createSyncRunner` `visible`:
  a change still goes up, and so does a retry; a tab seen again asks for a round at once, and a
  seen tab that does not hold sync asks the one that does for the minute's round, so polling
  lasts as long as any tab of the browser is in view); (3) migration 0004 stores the tables by
  their key (`WITHOUT ROWID`), so a row is written once and not again in its key's index.
  `tests/test-migration-0004.mjs` runs it on data: every row survives, every key refuses what it
  did. Applied to the live database 2026-10-05, after `npm run backup:rehearse` kept every row of
  a fresh export of it.
- **Watching it grow** (plan v6 c11, `npm run usage`, `scripts/usage.mjs`, read only): accounts,
  versions, the database's size beside D1's limit (500 MB free, 10 GB paid; `BELJAR_PLAN=paid`),
  and the text stored beside R2's free 10 GB, with the last day's rows read and written. Old
  versions are not pruned, and pruning is not built, until the database or the text reaches half
  its limit: the script says "past half: build pruning" then. On 2026-10-05: 1 account, 23
  versions, 120 kB, 3.9 kB of text. ⛔ What must hold before anything is ever pruned, and does
  now: a merge whose base text the server no longer has keeps both versions for a person to
  choose (`merge-project.mjs`, a base read as `null`), where it used to stop the project with an
  error on every round. A text the server's own head names is still required: missing, that is
  damage, not pruning. `tests/test-sync-growth.mjs`.
- **What an account may hold** (plan v6 c10, migration 0005, `protocol.mjs QUOTA`): 1,000 projects
  that are not deleted, and 1 GB of stored text. Counted in one row per account (`usage`): the
  project count moves in the same transaction as the head that makes, deletes or brings back a
  project; the text count with every text the account did not hold (a text sent again is neither
  stored nor counted twice). Past either limit the server refuses, and says which
  ('quota-projects': deleting projects frees room; 'quota-texts': far past what a class writes,
  so it means something went wrong). The page says it in the cloud, and once in the
  notifications (`sync-ui.mjs noteRefusal`). ⛔ The count is not trusted to stay exact: the daily
  job recounts every account from what it holds (`deletion.mjs RECOUNT_SQL`), so writes by a
  Worker from before the count, or two requests at once, are right again by the next day. Held on
  both servers by `quotaRules` in the protocol suite (small limits), on the page by
  `tests/test-sync-refused.mjs`; 0005's count of what was already there by
  `tests/test-server-migrations.mjs`.
- **Version history and restore** (plan v6 c6, `js/ui/version-history.mjs`; Project > Version
  history, and the palette, signed in on one of the account's projects only). A floating window:
  the versions down the left, newest first, a page of 50 at a time; the one before the current
  open, set beside the project as it is now (what restoring would change, file by file); Restore
  this version. Restoring deletes nothing and asks nothing: `engine.restoreVersion` writes the
  version's contents as sync writes them (an open editor follows), and the tab that syncs is asked
  for a round at once (`Persist.restoreVersion`), which commits it over the head like any edit:
  other devices merge it, and an edit made meanwhile on another device beats the restore's
  deletion of that file. ⛔ Only when this browser has nothing the cloud lacks and nothing waits in
  Review differences: the window syncs first, and the engine refuses otherwise ('unsynced',
  'review'), or what was not sent would be gone from everywhere. Tests:
  `tests/test-sync-history.mjs` (a restore reaching the other device, a file coming back and one
  going, concurrent edits, the refusals), `tests/test-version-history.mjs` (the window's words),
  the protocol suite on both servers, and `scratch/probes/probe-history.mjs` (two devices in
  Chrome: three drafts, the window, Restore, the other device's open editor following).

Locally: `npm run dev` (`scripts/dev-server.mjs`: migrations, then wrangler dev) and open
`http://127.0.0.1:8787` (127.0.0.1, not localhost: the local GitHub app's callback is registered
there). ⛔ The local database lives outside the repository (`~/.beljar-dev`): wrangler dev watches
the repository it serves, so state written inside it reloads the server forever. The GitHub client id and
secret come from `server/.dev.vars` (never committed). Everything works there, Beluga checks too
(2026-10-01): the runtime's two files are not assets (`.assetsignore`; live they come from R2), so
the dev server serves them from the working tree on 127.0.0.1:8788 and the dev Worker passes them on
(`DEV_RUNTIME_ORIGIN`, set only in `server/wrangler.jsonc`: `tests/test-dev-runtime.mjs`,
`tests/test-deploy-config.mjs`). A static server (Live Server, the probes) has no /api, so sign-in
and sync stay off there, silently; on 127.0.0.1 or localhost the console says where they are.
Two devices locally: a normal and a private window (or two browser profiles), each its own
storage and cookies. Offline: DevTools, Network, Offline. A fresh start: delete `~/.beljar-dev`
and clear the site's data.

### 5.8 Tests before the server exists

- `tests/test-sync-protocol.mjs`: the wire's data, and every server rule
  (`tests/_sync-protocol-suite.mjs`) against the reference server.
- `tests/test-auth-worker.mjs`: sign-in against a stand-in GitHub (`tests/_fake-github.mjs`):
  the state, the exchange, sessions as accounts, forged and replayed callbacks, handles, signing
  out on the server. `tests/test-account.mjs`: the page's decisions (what sign-in adopts, when
  removal is safe, every failure explained). `tests/test-sync-status.mjs`: the summary's order,
  every tab told the same, a non-syncing tab confirming through the syncing one, the time limit,
  the runner's `pending` and `safe`, held and released from any tab, and the messages stored at
  all. `tests/test-sync-hold.mjs`: "Ask me first" on the real runner: never by default,
  held at an offline edit, Upload, still unreachable, a reload, opened offline, the next tab taking
  it up, nothing waiting, the setting. `tests/test-sync-engine.mjs` §12–14: ask about every file,
  kept on sign-out, and what the offline review reads and takes. `tests/test-review-differences.mjs`:
  a real two-device conflict listed, both sides read, Use cloud, Keep mine reaching the other
  device, the diff, the strip segment, the cloud's words. `scratch/probes/probe-account.mjs`: the
  whole thing in Chrome, two devices: sign-in asking nothing, the empty project joining at its
  first character, offline and back, the same lines changed on both and reviewed, sign-out quiet
  and then asking, a failed sign-in explained; every new surface shot in both themes.
  Tests never read a developer's `.dev.vars` (`tests/_worker-env.mjs` refuses to run if they do).
- `tests/test-sync-worker.mjs`: the same rules against the Worker, run by `wrangler dev` on a
  fresh local D1 and R2 over HTTP; its gate (accounts, same-site, JSON, known methods); commits
  racing over one base, over HTTP and forced inside the transaction on a real local D1; three
  devices' engines syncing through it; and, restarted without the dev flag, 401 for everyone.
  Every guard was broken on purpose and seen to fail (2026-09-28): 9 of 9.
- `tests/test-sync-merge.mjs`: each merge rule, and 600 random three-way merges against its laws.
- `tests/test-sync-engine.mjs`: devices against the reference server, scenario by scenario: merges,
  conflicts, deletes both ways, owners, lost answers, damaged texts, a local save landing while the
  engine waits, an open editor taking a conflict, settings.
- `tests/test-sync-simulator.mjs`: 300 seeded runs of several devices under a hostile schedule
  (local work of every kind, dropped requests, lost and repeated answers, overtaking, offline
  spells). After each, every device holds exactly what the server holds, every edit survives
  unless someone deleted it knowingly, history is a line, nothing is left pending, and no device
  was ever asked to choose against its own commit. Each hard path has a floor on how often the
  schedule reached it, so a schedule that stopped reaching them fails.
- `tests/test-sync-runner.mjs`: one tab, the quiet spell, the longest wait, the poll, backoff, no
  overlap, a change heard mid-round, what the runner is told to ignore.
- `tests/test-sync-round-writes.mjs`: no commit for a project deleted mid-push, the engine's own
  writes marked, and the page's own Persist (the built bundle) telling its runner.
- `tests/test-auth-worker.mjs` (c3): Devices, Sign out there, and Delete account in the Worker as
  it runs; then, with wrangler dev stopped, every D1 table read and the whole R2 bucket listed:
  nothing names the account, its old session is refused, late writes are swept by the daily job.
  `tests/test-account-deletion.mjs`: every table accounted for, texts a thousand at a time, a
  closed tab's deletion finished. `tests/test-account-ended.mjs`: on the page's own Persist, a
  deleted account's projects kept as the browser's own (and going up whole to a later account),
  only what the cloud has leaving with a session ended elsewhere. `scratch/probes/probe-devices.mjs`:
  three devices in Chrome, the list, Sign out there followed by an open editor, Delete account.
- `tests/test-sync-flush.mjs` (c2): a push is one request; the page going out of sight sends at
  once, the commit recorded as pending before it is sent and settled once; a commit in flight left
  to go on; the closing page's budget; a flush in the middle of a round, and while a round hashes;
  a commit given up on and delivered late; only the tab that syncs, never held or offline; and the
  built page bundle sending when hidden. The simulator's pages go out of sight too (2048 hide-time
  pushes over 300 seeds, under the same hostile network).
  `tests/test-http-transport.mjs`: every call's time limit, and a stalled round ending so sync
  goes on. Every guard broken on purpose and seen to fail (2026-10-02).
- `scratch/probes/probe-sync.mjs`: two devices in real Chrome (two browser contexts, one with two
  tabs) and the reference server in Node: the lock, a live edit, the conflict dialog naming another
  device, a new file in the other explorer, a setting, a hand-over, a deleted project. And a third
  device speaking real HTTP to the probe's own server: it types, its tab is closed 50 ms after the
  last key (the editor's own save timer still holding the text), and the other device has the text.
  The probe's server answers that commit only after 700 ms and drops it if the client has gone, as a
  Worker is cancelled when its client hangs up: only a request sent with `keepalive` survives.

Every guard was broken on purpose and seen to fail its test (2026-09-24): 23 in Node, 2 in Chrome.
The one-request push and the hide-time flush (2026-10-03): 14 in Node, 3 in Chrome.
Devices, Sign out there and Delete account (2026-10-04): 20 in Node, 3 in Chrome. The privacy page
and the backups: 10 in Node.

### 5.9 Durability (stage 7)

A browser may clear what BelJar keeps: every browser under disk pressure (least recently used site
first), and Safari after 7 days of Safari use without a click, tap or key on the site (WebKit's
tracking prevention; Home Screen and Dock web apps are exempt). Checked 2026-09-25 against
webkit.org's tracking prevention page, WebKit's storage policy post for Safari 17 and MDN's storage
quotas and eviction criteria; check again when it matters. `durability.mjs`:

- **Work to lose** is 200 non-blank characters in projects that belong to no account (a project that
  does is on the server too). It is counted once the page is idle, and again a quiet moment after
  work changes; never on the way to first paint.
- **The browser is asked to keep the storage** (`navigator.storage.persist()`) at the next click once
  there is work to lose. Chrome and Safari decide silently, from how the site is used, so asking
  again later can succeed where asking early did not; Firefox asks the person, and a click is a
  pause in typing. At most once a month per device (`persistAskedAt`), whichever tab asks. Storage
  the browser already keeps is left alone and costs nothing: no project is read.
- **Safari's 7 days are said once** per device (`durabilityWarnedAt`) when the browser will not keep
  the storage: a toast that stays until closed and says what to do, and the same in the
  notifications. Safari is recognised by `navigator.vendor` (every browser on iOS is WebKit, and
  there is no feature to detect), and not in a Home Screen or Dock web app.
- **Export is one step away:** Project > Download project, or *Download Project* in the palette.
  One zip holds every file and empty folder under a folder named after the project (in a form every
  filesystem takes), so unzipping it and choosing *Import folder as new project* gives the project
  back.

Not done, on purpose: making BelJar installable. A Home Screen or Dock web app is the one thing
Safari exempts, but its storage is separate from Safari's (only cookies are copied when it is made),
so a person would move their projects by downloading and importing them. BelJar has no web app
manifest, and its service worker caches only the Beluga runtime. Decide it as its own step.

Tests: `tests/test-durability.mjs`, `tests/test-project-archive.mjs`, and
`scratch/probes/probe-durability.mjs` (the menu and the zip it downloads, the palette's command
run, the request at the next click, and Safari faked by its vendor). Every guard was broken on
purpose and seen to fail its test (2026-09-25): 13 in Node, 3 in Chrome.

### 5.10 Not built yet

- **Not built, on purpose** (2026-10-02): a per-project "keep in this browser only". It was built
  and removed the next day: an action in the Project menu that only made sense to whoever wrote
  the sync engine. Keeping work in the browser after signing out is one setting, Settings >
  Account > Projects in this browser, and that is all of it.
- **An installable BelJar**, if Safari's exemption is wanted (§5.9).

Known limits: another tab's write in the very instant the syncing tab applies a merge is the one
window left (the tab guard warns about two tabs on one project); one file open in two tabs while it
is in conflict has two editors writing one record.

### 5.11 Home and the editor: two pages (built 2026-10-02)

BelJar is two documents. `index.html` is **home**: the list of projects, and where a person signs
in. `edit.html` is **the editor**, on one project. Home loads `js/home.js`, its own bundle (about
520 KB with the palette and the command registry, a sixth of the editor's): no editor, no Beluga
worker. `tests/test-home.mjs` walks its import
graph and fails when anything of the editor gets in.

- **One owner of every address:** `js/frame/routes.mjs` (`homeUrl`, `editUrl(id)`, `signInUrl`,
  `go`). The short forms (`/`, `/edit?p=ID`) where a server maps them (the deployed site, or a page
  itself served at `/edit`, as `npm run dev` does); the files (`index.html`, `edit.html?p=ID`) on a
  static server. Nothing else assigns `location` or opens a window: `tests/test-routes.mjs` scans
  every module.
- ⛔ **The editor's address names its project.** `persist.mjs` pins the page to `?p=` before anything
  asks which project this is (`work.pinProject`). A project this browser cannot show (deleted,
  another account's, not here yet) is never replaced by another one under that address: the page
  runs on a memory store, touches nothing, and goes to home with `?open=ID`. Signed in, home asks
  for a round now, from whichever tab syncs (`confirmSynced`), and waits for that one (8 s at
  most): the summary's "a round has finished" is true at once in a tab that does not sync itself,
  and read off it home gave up on a project that was one round away. Then it opens the project, or
  says "That project isn't in this browser." A bare `/edit` opens the last project opened and
  writes its id into the address.
- **Switching is navigating.** Switch, New project, import, deleting the open project and coming
  back after sign-in all end in `Routes.go(editUrl(id))`. The device row `activeProject` now means
  only "the last project opened": home lists it first, a bare `/edit` opens it, and a tab coming to
  the front claims it (`projectInUse`). Two tabs on two projects each survive a reload.
- **Home makes nothing.** It reads `Persist.projects()`, never `listProjects()` (which makes a first
  project when none is visible), and may delete the last project (`removeProject`). It follows
  storage (`onProjectsChange`: this tab, another tab, sync), the sync summary and the account, and
  draws the list again only when what it says has changed: a redraw takes the focus off a row. On
  a timer, not an animation frame: a tab in the background gets no frames.
- **An empty list waits to be sure** (`listArriving`, `homeMode`). "Nothing here" (the keyboard
  on New project) is not said until the page knows who is signed in (2.5 s at most) and, signed
  in, until the first round is back (8 s at most). Said early, it was wrong for a moment at every
  sign-in, and its Browse examples made a project just before the real ones arrived.
- **What home shows** is set out in `docs/UI.md` §0: one column with the name, the ways to start,
  and every project as its name and when it was last touched (`projectStats().editedAt`).
- ⛔ **The browser's back/forward cache**, both measured. A page brought back from it heard no
  storage events while frozen, so every record it has cached may be stale: it reloads (`pageshow`
  with `persisted`). A page going into it kept the sync lock, and Chrome did not hand the lock to
  a tab already waiting for it: with two tabs open, going from the editor to home left no tab
  syncing. A page that is left stops sync as it goes (`pagehide`).
- **Signing in** is in the account menu on both pages, in one line under home's name, and in the palette.
  `/api/auth/github/start?return=PATH` brings the person back to the page they were on
  (`server/auth.mjs` `safeReturn`: a same-site path and nothing else, kept in a cookie for the
  trip). The account menu offers it on both pages (Dean, 2026-10-06: the button is always there,
  and says where the account stands).
- **Signing out lands on home.** ⛔ The account's projects leave this browser as the NEXT page
  loads, not under the page that signed out (`work.leaveAccount`, `finishSignOut`, device row
  `leftAccount`). That page is live until the browser has left it, and anything in it that read the
  project list with none visible made a blank project, which home then listed. Sync stops holding
  its lock (`stopSync({ hold: true })`): let go at once, the lock went to another tab, which began
  a round for a session that was ending.
- **Signing in or out is for the browser, not for a tab** (`Persist.onAccountElsewhere`,
  `account.mjs` `follow`). Another tab asks again who is signed in and becomes that, where it is. An
  editor on one of the account's projects goes home with it (`work.ownerLeft`), and is never told
  its project was "deleted".

Tests: `tests/test-routes.mjs` (the forms, the scan, pinning, leaving, signing out),
`tests/test-home.mjs` (the rules as pure functions, and the bundle), `tests/test-auth-worker.mjs`
(the return path), `tests/test-sync-round-writes.mjs` and `tests/test-sync-runner.mjs` (a page that
is left, and stopping while holding the lock), `tests/test-deploy-config.mjs` and
`tests/test-canonical-redirect.mjs` (both documents). In Chrome: `scratch/probes/probe-home.mjs`
(a static server: keyboard only from the site to typing, rename, download, delete, two tabs, Back,
an unknown id) and `scratch/probes/probe-account.mjs` (the Worker: sign in on home and from the
editor, a project made on another device appearing on home, a link to a project not here yet,
deleting from home, sign out, two tabs following each other). `npm run check:build` holds
`js/home.js` against every module it is built from. Every guard was broken on purpose and seen to
fail its test (2026-10-02): 32 in Node, 9 in Chrome; four were silent at first and got the test
they lacked.

**The start page** (Settings > Workspace, `startPage`: Home, or Last project). With Last project a
plain arrival at BelJar goes straight to the project last opened, as an IDE reopens its last
window. Early boot decides (`early-boot-core.mjs` `startTarget`), before first paint, by REPLACING
the address: home is never shown, and Back does not return to a page that would send you forward
again. Only a bare home address is a plain arrival, and only a fresh navigation (a reload or Back
shows the page that was there); only to a project this browser can show. ⛔ While the setting is
on, every link to home says so (`Routes.homeUrl()` gives `/?home`): the brand, signing out, a
deleted project. Without it the way home would lead straight back to the editor.

**The palette is on both pages**, from the one registry (`docs/COMMANDS.md`). Every command says
where it runs (`pages`: editor, home or both; the catalogue's `HOME_TOO` names the ones home runs,
and a generated preference says so on its row). ⛔ The registry keeps no behaviour for a command on
a page it does not declare, so an editor command wired on home is not a row or a chord that does
nothing: it is not there. What both pages run is attached by one module
(`js/commands/shared-commands.mjs`). On home the palette goes to a project where the editor goes
to a file, and a mode nothing answers (symbols, project search, a line) is not listed, not hinted
at, and its prefix is only text. The six sync preferences and the start page are commands
(`set.sync-reconnect` and the rest), reachable by name on both pages and by `:set`; ⛔ the sync
ones only where a server answers, as their panel is only there in Settings.

**The navigation is animated by the browser** (cross-document view transitions;
`css/page-transition.css`, `js/boot/page-transition-core.mjs`). A project's name on home becomes
the name in the editor's header, the editor's working area grows out of its row (and shrinks back
onto it), the strip stays where it is, and the rest cross-fades. Nothing depends on it: a browser
without the feature navigates as before. ⛔ Everything here was measured in CHROME'S OWN FRAMES as
it played (`scratch/film-live.mjs`, the screencast): a paused film stepped by hand
(`scratch/film-transition.mjs`) lets Chrome draw every frame sharp and hides what a person sees.
Each of these is ⛔:
- **The strip does not travel** (filmed frame by frame, `scratch/film-transition.mjs`). It was the
  editor's "band", grown out of the clicked row: the strip that was already on screen left its
  place and came back, and home's words and the editor's menus crossed in it on the way. It is one
  named picture on both pages (`app-header`) whose box is not animated.
- **Nothing is stretched.** A box moved by transform scales what is in it. The working area was
  once squeezed to the row's shape: laid out about 530 by 32 and scaled back up to the screen, its
  lines came out as wavy bands on a real screen. It is scaled EVENLY, by the row's width
  (`zoomFrames`), and its group paints nothing of its own (no corner to stretch).
- **Nothing is blank.** A plain surface that grew and took the editor's picture half way was a
  flash; the working area is itself what grows, seen from the first third.
- **Opening waits for the editor to be built** (`holdUntil`). The editor is shown as soon as its
  header has the name and builds from its scripts a moment later; with them not cached (a first
  visit, a click before they were fetched ahead) the whole zoom played on an empty shell and the
  code arrived after. Every animation of the transition waits on its first frame until the frame
  is mounted with an editor in it (1.2 s at most), then runs whole. probe-home slows the scripts by
  400 ms and measures how far the zoom had played when the editor was built: 0 ms.
- **One balanced curve** (`--ease-in-out`, 300 ms). The house's sharp ease-out did nine tenths of
  the way in the first third and crept the rest: it read as shuddering to a halt.
- **Nothing pops at the end.** The row come back to carries the names as `data-landing`, which is
  not washed; as `data-opening` its wash stayed to the end and went in one frame.
- **Closing goes while it moves; it is not the mirror of opening.** Fading over the last two thirds,
  the shrunk editor was still a third there when the curve had all but stopped it: a still picture
  of the editor over the row, then gone. It holds while it sets off, fades through the fast part of
  the curve and is gone by 55% of the time (83% of the way); the row fades in under it, and the name
  lands in 0.8 of the time (at the full length it crept onto its row across the heading above it).
- **The opt-in is in each document's head.** In the stylesheet, reached through `@import`, the
  editor's was not seen in time and the transition was refused, with no error.
- **The two travelling boxes move by transform alone.** The browser's own animation of a named
  element changes its width and height, which only the main thread can do, and the editor's
  scripts hold the main thread as it starts: the page cross-faded while the name and the band
  (as it then was) stood still at the row, then jumped (frame by frame).
  `compositeGroups` rewrites those two animations as a move and a scale when the transition is
  ready.
- **The first frame is a true one.** Each document holds its first paint (`rel="expect"`) until
  home has drawn its list, and the editor has the project's name in its header
  (`panel-restore-core.mjs` `paintProjectName`: the document ships a placeholder there, and every
  load used to show it first).
- **Held-back motion is a plain cut**, by the system's preference (the stylesheet) and by BelJar's
  own setting (the script skips the transition, and answers the promises a skipped one rejects:
  unanswered, each reached the error hook). A page nobody saw (home passing through to the last
  project, an editor leaving because its project is not here) animates nothing.

**The editor arrives fast.** Measured on this machine, a static server, a 180-line file
(`scratch/probes/measure-open.mjs`, median of 9, 2026-10-02): from the click on home the editor is
mounted at about 190 ms and takes a keystroke at about 230 ms, against a target of 400 ms. Its
start is its own scripts, 3 MB of them, so home, once idle, asks the browser to fetch them ahead
(`js/home/preload-editor.mjs`, `rel="prefetch"`; the addresses are read out of the editor's own
document, so no list of them can fall behind): the first open in a browser cost 3 KB of network
instead of 3 MB. ⛔ Fetched, never run: this is a preload and not a prerender, because a
prerendered editor would start workers, take the sync lock and write, for a page nobody may look
at. With the scripts in the cache the editor runs before it paints, so for that fifth of a second
home is still on screen: the row says it is being opened at the click. The transition costs
nothing measurable there (with the scripts coming over the network it cost about 50 ms of the
time to the first keystroke). The live site's number is to be taken after the deploy:
`BELJAR_URL=https://beljar.deanbarry.com/ node scratch/probes/measure-open.mjs`.

Tests for these: `tests/test-early-boot.mjs` (the start page), `tests/test-page-commands.mjs` and
`tests/test-command-catalog.mjs` (pages), `tests/test-page-transition.mjs`, `tests/test-home.mjs`
(the preload), and in Chrome `scratch/probes/probe-home.mjs`. Every guard was broken on purpose and seen to
fail its test (2026-10-02): 33 in Node, 9 in Chrome; one was silent at first (home wiring a command
the catalogue does not declare, which the registry drops without a word) and got its test.

Not built: the Settings dialog on home (it opens from the editor; on home the preferences that are
not about an open file are in the palette).

## 6. Stages

Each stage lands with `npm test` and `npm run probe` green, and resets stored data when the format
changes (allowed: no users until winter 2027).

| # | Stage | Replaces |
|---|---|---|
| 1 ✅ | **Store core**: keyspace, schema reset, classes, envelopes, quota policy, subscribe, tab events, `applyRemote`; its tests | nothing yet: built beside the old code |
| 2 ✅ | **Settings table**: one row per setting; generic get/set/reset/export/import; early boot and the Settings dialog read the table | `persist-settings.mjs`, `persist-ui-prefs.mjs`, 179 Persist members |
| 3 ✅ | **Work model**: projects, tree and file text on opaque ids; text, session and cache split into their own records | the `state` record, `persist-projects.mjs`, `persist-file-registry.mjs`, `persist-open-tabs.mjs`, slug keys, the default-project special case, the per-project layout keys; also the graph-prefs legacy migration and the write-only panel-open flags |
| 4 ✅ | **Device state**: layout, panels, tabs, REPL, folds, notifications, jump log, graph prefs go through the store; the tab store; the ownership test | `persist-unmigrated.mjs`, `persist-layout.mjs`, `persist-graph-prefs.mjs`, every direct storage user outside the store, ~40 hand-written layout methods |
| 5 ✅ | **Concurrency foundations**: the three-way merge; documents that remember their base and merge a change underneath or keep it as a conflict; undo that keeps someone else's change; versions that never wipe newer data; 128-bit time-ordered ids; one meta record per project | the lost update, the two-way wipe, 41-bit ids, the shared project list, `moveFile` |
| 6 ✅ | **Sync engine** (§5): versions as manifests of content hashes; the file-by-file project merge; the engine with pending commits and tombstones; one syncing tab; settings sync; owners and accounts; conflicts that name their source; a reference server, the simulator, a two-device Chrome probe | the `createAsyncPersistLayer` stub |
| 7 ✅ | **Durability** (§5.9): the browser asked to keep the storage once there is work to lose; Safari's 7 days said once; the whole project in one download; the Project menu says where the work lives | nothing: the gap was a silent loss |
