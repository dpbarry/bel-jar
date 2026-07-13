# Edit history (undo / redo)

BelJar owns undo/redo through **EditHistory** — a session-scoped, atomic edit stack. CodeMirror `history()` is used only for typing coalescing; **Ctrl+Z always walks EditHistory**, not CM directly.

See [`docs/edit-history.md`](docs/edit-history.md) for the edit-action contract.

## Contract

1. **Invertible:** `apply → undo` restores exact pre-edit state; `undo → redo` is a no-op relative to the starting point.
2. **Stack order:** Undo/redo respects LIFO; redo branch clears on any new edit.
3. **Atomic:** One entry reverts **all** files and structural changes it touched — never partial.
4. **Precondition gate:** Undo/redo refuses (toast, stack unchanged) if the workspace no longer matches the expected side of the entry.
5. **Scope:** Settings, panel open/close, inspector navigation, viewport, folds, and Harpoon proof-session undo are **not** on this stack.

## For feature authors

All undoable mutations must go through EditHistory:

| API | Use |
|-----|-----|
| `BelJarEditHistory.transact(kind, fn)` | Whole-workspace diff (file delete, batch upload) |
| `dispatchEdit(view, spec, { fileId, kind, ... })` | Single-buffer CM edit (hole fill, proof commit, format, library insert) |
| `beginEntry` / `touchFile` / `commitEntry` | Multi-step edits (rename commit + cross-file propagate) |

Non-undoable loads (`setValue`, file switch, conflict replace) must call `markNonUndoable()` and use `Transaction.addToHistory.of(false)`.

## Persistence

Session only: `sessionStorage` key `beljar-edit-history-v1:<projectId>`. Survives reload within the browser session; cleared when the session ends.

## Key files

- [`editor-src/bel-edit-history.mjs`](../editor-src/bel-edit-history.mjs) — core stack, validate/apply/rollback
- [`js/edit-history.js`](../js/edit-history.js) — app bridge (persist + editor adapters)
- [`tests/test-edit-history.mjs`](../tests/test-edit-history.mjs) — invariant tests
