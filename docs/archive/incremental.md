# Syntax intelligence and edit cost

**Closed.** Name environment, incremental symbols/graph/lint, and frontier-sized settlement trigger are shipped. Do not reopen this as a plan. Settlement: [`checking.md`](checking.md). Phase 0 diary: [`input-path.md`](input-path.md).

BelJar-native syntax intelligence. Edit cost is the dirty frontier — not file or prelude size. Hover, lint, tint, completion, go-to-def, and rename agree on what a name is.

---

## What shipped

| Piece | Where |
|-------|--------|
| In-file incremental symbol store | `symbol-store.mjs` `tryIncrementalUpdate`; engine passes coalesced `ChangeSet`. Equivalence: `tests/test-symbolstore-incremental-equivalence.mjs` |
| Unified name environment | `semantic/name-env.mjs`. Lint + hover globals/locals + bound tint. Parity: `test-namelint-env-parity.mjs`, `test-hover-env-parity.mjs` |
| Walk split | Lint blocks eager (O(#decls)). Parse diags lazy; last-block remap in the syntax store. Names pass lazy (settlement masking / fallback only) |
| Prelude group caches | `groupLookup` / `groupDefinedNames` / `groupCtorNames` by sibling text identity |
| Graph incremental | Reuse clean nodes/edges when id spine + `signatureHash` match; body-dirty owners only. Bail on interface/id shuffle. `test-graph-incremental-equivalence.mjs` |
| Last-decl parse + undef-app lint | ChangeSet on the last lint block remaps earlier diags. `test-edit-cost-frontier.mjs` |
| Settlement trigger | Block spine (comment-stripped). No whole-doc fingerprint on the engine path when `blocks` exist |
| Editor syntax lint | CM linter reads `syntax.syntaxDiagnostics` when the engine tree matches. `syntaxLintTree` remains the standalone/test walk |
| Sync coalescing | One `requestAnimationFrame` per burst; selection flushes immediately |

Pattern binders skip prelude constructor/constant names (`groupCtorNames`), so boxed heads like `≡comm` are globals. Hover bound/unbound and local source types query the env.

---

## Laws (still hold)

- Never reduce intelligence for speed.
- Sound bail: fast path only when equivalence is cheaply provable; else full rebuild.
- Do not emit a `/ total /` the author did not write.
- `syntaxLintTree` is the test/standalone walk. Live squiggles come from the engine snapshot.
- `belugaCheckFingerprint` is the no-`blocks` fallback (tests that pass `{tree,doc}`). The editor path uses lint blocks.
- Implicit-binder *slot* types still infer from the application/infix they sit in. That is hover typing, not a second name model.

---

## Files

| Area | Path |
|------|------|
| Incremental symbols | `js/editor-src/semantic/symbol-store.mjs` |
| Name environment | `semantic/name-env.mjs` |
| Graph | `semantic/semantic-graph.mjs` |
| Syntax snapshot + lint | `semantic/syntax-store.mjs`, `ide/syntax-lint.mjs` |
| Parse diags / binder walk | `tree-walk.mjs` |
| Hover + undefined-app | `name-resolve.mjs`, `ide/hover.mjs` |
| Scope tint | `ide/scope-highlight.mjs` |
| Prelude / development index | `semantic/project-prelude.mjs`, `workspace-index.mjs` |
| Sync | `editor.mjs` (`scheduleSemanticSync`) |
| Fingerprint | `semantic/check-gate.mjs` |
| Equivalence | `tests/test-symbolstore-incremental-equivalence.mjs`, `test-graph-incremental-equivalence.mjs`, `test-edit-cost-frontier.mjs`, `test-namelint-env-parity.mjs`, `test-hover-env-parity.mjs` |
