# Edit history (undo / redo)

BelJar owns undo/redo through **EditHistory** — a session-scoped, atomic edit stack. CodeMirror `history()` is used only for typing coalescing; **Ctrl+Z always walks EditHistory**, not CM directly.

## Contract

1. **Invertible:** `apply → undo` restores exact pre-edit state; `undo → redo` is a no-op relative to the starting point.
2. **Stack order:** Undo/redo respects LIFO; redo branch clears on any new edit.
3. **Atomic:** One entry reverts **all** files and structural changes it touched — never partial.
4. **Precondition gate:** Undo/redo refuses (toast, stack unchanged) if the workspace no longer matches the expected side of the entry.
5. **Structural sides are TARGETS, and undo's target is `before`.** ⛔ `openFileIds`,
   `activeFileId`, `emptyFolders` and the cfg patch all follow the same polarity as the
   file text. Inverted — and `openFileIds`/`activeFileId`/`cfgTarget` all were — undoing a
   delete restored the file to the explorer but left its tab closed, and the tab came back
   on **redo** instead. The `cfgTarget`/`cfgExpect` pair are OPPOSITE sides: written the
   same way, a cfg patch applies as a no-op that validates perfectly, because it is checked
   against the side it is about to write.
6. **⛔ A RENAME IS A STEP, and it needs its own field.** A rename keeps the file's id and
   changes only its name, so nothing else in an entry can see it: the text is identical and
   the id is in both file lists. `diffWorkspace` therefore recorded **nothing at all** — and
   the Ctrl+Z a user presses to take a rename back reached *past* it and silently reverted
   their last **edit**, while the rename stood. Measured in the browser, through the real
   context menu, before it was fixed.

   **A step that cannot be represented is worse than one that is refused: it makes the key
   next to it lie.** `structural.renamed` (`[{ id, before, after }]`) carries it, and it is
   applied **before** any text is written — `Persist.renameFile` rewrites every `.cfg` that
   mentions the old path, and those cfgs ride in the same entry as ordinary text diffs, so
   renaming first lets the recorded text win. It is deliberately **not** a delete plus a
   create: the id survives, so the file keeps its tab, its viewport and its place in the
   suite. Validation gates on the file EXISTING and never on its current name — renaming
   twice and undoing once is ordinary, and refusing there would be the "project changed
   since that edit" dead end again, for an operation that only sets a string.

   ⚠ The engine is half the fix. Three call sites renamed files with no entry at all and
   each had to be wrapped: the explorer's inline rename, `renameFolderPrefix` (one step for
   the whole folder), and `applyMovePlan` (one step for a whole drag).
7. **Scope:** Settings, panel open/close, inspector navigation, folds, and Harpoon proof-session undo are **not** on this stack. Pure scroll / viewport moves do **not** push entries.
8. **Caret + scroll on apply:** When an entry is undone or redone, EditHistory restores the caret (`beforeSel` / `afterSel`) and viewport (`beforeLocal` / `afterLocal`) for the edited buffer so the edit stays on screen. Missing snapshots fall back to EOF + `scrollIntoView`.

## For feature authors

All undoable mutations must go through EditHistory:

| API | Use |
|-----|-----|
| `EditHistory.transact(kind, fn)` | Whole-workspace diff (file delete, rename, move, batch upload) |
| `dispatchEdit(view, spec, { fileId, kind, ... })` | Single-buffer CM edit (hole fill, proof commit, format, library insert) |
| `beginEntry` / `touchFile` / `commitEntry` | Multi-step edits (rename commit + cross-file propagate) |

⛔ **An open entry MUST be closed on every exit path.** While one is open the recorder
deliberately ignores document changes — `commitEntry` is going to snapshot the workspace
itself — so a throw between `beginEntry` and `commitEntry` does not merely lose that edit:
it leaves the entry open, and every keystroke after it goes unrecorded until something else
happens to call `beginEntry`. Undo stops working, in silence, for the rest of the session.
Wrap the body in `try { … } finally { if (!closed) H.cancelEntry(); }` — `rename.mjs` is the
worked example.

Selection and viewport are captured centrally on these paths — feature authors do not need to pass them unless overriding.

Non-undoable loads (`setValue`, file switch, conflict replace) must call `markNonUndoable()` and use `Transaction.addToHistory.of(false)`.

## Persistence

Session only: `sessionStorage` key `beljar-edit-history-v1:<projectId>`. Survives reload within the browser session; cleared when the session ends.

⛔ **An entry holds WHOLE document snapshots, so the entry cap is not a cap.** 100 typing
bursts in a 30 KB file is ~6 MB of live strings, over Chrome's ~5 MB origin quota — so
`setItem` threw, the throw was swallowed as "quota", and session history silently stopped
persisting partway through the first serious editing session. A `format project` entry gets
there on its own. Two budgets now bound it, both counted in characters of snapshot text
(`.length` is O(1), so measuring is free):

| constant | bounds |
|---|---|
| `EDIT_HISTORY_CAP` (100) | entries kept in memory |
| `EDIT_HISTORY_BYTE_CAP` (8 MB) | text kept in memory, never below `EDIT_HISTORY_MIN_ENTRIES` |
| `SESSION_BYTE_CAP` (1.5 MB) | what is handed to sessionStorage, newest-first |

Over budget, the OLDEST steps are not persisted rather than none of them. `persistStack()`
also trails the typing burst by `PERSIST_DEBOUNCE_MS` (leading edge, so the first write of a
quiet period is immediate) — serialising megabytes after every 150 ms burst is a measurable
stall on the input path. `flushPersist()` lands the trailing write; `install-edit-history`
calls it on `pagehide`, `beforeunload` **and `visibilitychange` → hidden**, which is the only
transition a discarded or backgrounded tab is guaranteed to make.

## Key files

- [`js/editor-src/edit-history.mjs`](../js/editor-src/edit-history.mjs) — core stack, validate/apply/rollback
- [`js/persist/install-edit-history.mjs`](../js/persist/install-edit-history.mjs) — Persist-backed `EditHistoryInstall`
- [`tests/test-edit-history.mjs`](../tests/test-edit-history.mjs) — invariant tests
