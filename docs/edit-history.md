# Edit history (undo / redo)

BelJar owns undo/redo through **EditHistory** — a session-scoped, atomic edit stack. CodeMirror `history()` is used only for typing coalescing; **Ctrl+Z always walks EditHistory**, not CM directly.

## Contract

1. **Invertible:** `apply → undo` restores exact pre-edit state; `undo → redo` is a no-op relative to the starting point.
2. **Stack order:** Undo/redo respects LIFO; redo branch clears on any new edit.
3. **Atomic:** One entry reverts **all** files and structural changes it touched — never partial.
4. **Precondition gate:** Undo/redo refuses (toast, stack unchanged) if the workspace no longer matches the expected side of the entry.
5. **Scope:** Settings, panel open/close, inspector navigation, folds, and Harpoon proof-session undo are **not** on this stack. Pure scroll / viewport moves do **not** push entries.
6. **Caret + scroll on apply:** When an entry is undone or redone, EditHistory restores the caret (`beforeSel` / `afterSel`) and viewport (`beforeLocal` / `afterLocal`) for the edited buffer so the edit stays on screen. Missing snapshots fall back to EOF + `scrollIntoView`.

## For feature authors

All undoable mutations must go through EditHistory:

| API | Use |
|-----|-----|
| `EditHistory.transact(kind, fn)` | Whole-workspace diff (file delete, batch upload) |
| `dispatchEdit(view, spec, { fileId, kind, ... })` | Single-buffer CM edit (hole fill, proof commit, format, library insert) |
| `beginEntry` / `touchFile` / `commitEntry` | Multi-step edits (rename commit + cross-file propagate) |

Selection and viewport are captured centrally on these paths — feature authors do not need to pass them unless overriding.

Non-undoable loads (`setValue`, file switch, conflict replace) must call `markNonUndoable()` and use `Transaction.addToHistory.of(false)`.

## Persistence

Session only: `sessionStorage` key `beljar-edit-history-v1:<projectId>`. Survives reload within the browser session; cleared when the session ends.

## Key files

- [`js/editor-src/edit-history.mjs`](../js/editor-src/edit-history.mjs) — core stack, validate/apply/rollback
- [`js/persist/install-edit-history.mjs`](../js/persist/install-edit-history.mjs) — Persist-backed `EditHistoryInstall`
- [`tests/test-edit-history.mjs`](../tests/test-edit-history.mjs) — invariant tests
