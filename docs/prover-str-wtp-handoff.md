# Prover handoff: `str_wtp` and cp-suite context lemmas

> **Last updated:** 2026-06-30 — **`str_wtp` probe COMPLETE** (all nine `wtp` branches)  
> **Audience:** Next agent on cp-suite lemmas (`str_step`, full automation, UI).

---

## 0. One paragraph

BelJar's native prover (`proveProgram` in `bel-prover-bridge.mjs`) generates moves from our type/schema model; Beluga certifies each step. **`str_hyp`**, **`str_lin`**, and **`str_wtp`** are **engine-complete** in `scripts/prover-probes.mjs` (no longer `optional`). `str_wtp` finishes in **~28 steps** via intro → split → per-branch chains (`str_hyp` / block `str_wtp` / `str_lin` / `branchWtpCloseFill`). Tests: **151/151** green. Next backlog: **`str_step`**, full cp-suite, P2 auto-solve UI.

---

## 1. Where the other docs live

| Path | What it is |
|------|------------|
| [`AGENTS.md`](../AGENTS.md) | Top-level agent context |
| [`.cursor/rules/beljar-prover.mdc`](../.cursor/rules/beljar-prover.mdc) | Prover rule (gotchas, anti-overfit) |
| **This file** | `str_wtp` architecture + landed fixes |
| [`scripts/prover-probes.mjs`](../scripts/prover-probes.mjs) | Live gates (Puppeteer + Chrome + Beluga worker) |
| [`library/.../cp_lemmas.bel`](../library/data/case-studies/classical-processes/cp_lemmas.bel) | Ground truth (`str_wtp` L245+, `str_lin` L185+) |

---

## 2. Speed discipline

| Command | Typical wall time | When to run |
|---------|-------------------|-------------|
| `node tests/test-hole-split.mjs` | **<1 s** | Split/fill/synthesis edits |
| `node tests/test-prover-bridge.mjs` | **<1 s** | Bridge / IH / lemma edits |
| `npm test` | **~90–120 s** | Milestone / before handoff |
| `node scripts/run-str-wtp-only.mjs` | **~40–100 s** | One lemma after `build-editor` |
| `npm run prover:probe` | **~2–10 min** | Full gate suite |

Rebuild before browser probes: `node scripts/build-editor.mjs`.

---

## 3. Probe status (2026-06-30)

| Probe | Status |
|-------|--------|
| `dual_sym`, `dl_uniq`, `tp_uniq`, `str_hyp` | COMPLETE |
| `str_lin` | COMPLETE |
| **`str_wtp`** | **COMPLETE** (~28 steps, all branches) |

```bash
node scripts/build-editor.mjs
node scripts/run-str-wtp-only.mjs   # expect: COMPLETE
npm run prover:probe                # full suite
```

---

## 4. `str_wtp` branch status

| Branch | Chain | Status |
|--------|-------|--------|
| `wtp_fwd` | fill (`D[]`, dual/linear `[]`) | ✅ |
| `wtp_close`, `wtp_wait` | fill / recurse + fill | ✅ |
| `wtp_out` | `str_hyp` → 2× block `str_wtp` → `str_lin` → close | ✅ |
| `wtp_inp` | `str_hyp` → dual-block `str_wtp` → HO `str_lin` → close | ✅ |
| `wtp_inl`, `wtp_inr`, `wtp_choice` | `str_hyp` → block `str_wtp` → close | ✅ |
| `wtp_pcomp` | 2× block `str_wtp` → 2× `str_lin` → close | ✅ |

Reference: [`cp_lemmas.bel`](../library/data/case-studies/classical-processes/cp_lemmas.bel) L245–301.

---

## 5. Key engine pieces (don't revert)

### Dual / linear `[]` weakening (`wtp_fwd`)

Split uses `D[]`; `fillTermForHyp` appends `[]` when context weakens from branch to `[g |- …]`.

### Helper lemmas (`str_hyp` / `str_lin`)

`helperLemmaTexts` — conclusion head may differ from goal; context `g` must match.

### Block IH (`recurseTexts`)

Block-extended `str_wtp` on HO subderivations; dual-block path for `wtp_inp` (one IH call, two blocks).

### Branch pattern metas

`branchPatternBox`, `branchPatternMetas`, `blockProjectionHyps` — recover metas Beluga omits from hole reports.

### Wtp branch close (`branchWtpCloseFill`)

Pattern-driven constructor close after let-chain. Per-head readiness in `branchWtpCloseReady`.

### HO linear `str_lin` (`wtp_inp`)

- Split: `ctxNameBinderNames` — HO linear projects **name slots only** (`[.., x, z]`, not hyp `h`).
- Call: `str_lin [g, x:name, z:name |- X14]` (bare meta); result `[g, x:name |- X14']`.
- `isHoLinearStrLinHyp` — detect HO linear when meta already in hole report.

### Hyp-channel detection (`needsHyp`)

Only real channel hyps: `x[..] hx` or `hx (` before a lambda — **not** `\hx.` binder names inside HO patterns. Fixes `wtp_pcomp` false `str_hyp` gate.

### Chain phase (`wtpBranchChainPhase`)

`hyp` → `recurse` → `lin` → `fill`. `wtp_inp` counts one HO linear meta; `wtp_pcomp` needs two `str_lin` + two HO recurses.

---

## 6. Architecture (files)

```
editor-src/bel-prover.mjs          — parseCompType, totality, IH matcher
editor-src/bel-hole-split.mjs      — split, fill, branchWtpCloseFill, constructorTerm
editor-src/bel-prover-bridge.mjs   — proveProgram, candidateMoves, recurseTexts,
                                     helperLemmaTexts, wtpBranchChainPhase
tests/test-hole-split.mjs          — split patterns, close fills (wtp_out/inp/pcomp)
tests/test-prover-bridge.mjs       — block IH, helper lemmas, HO str_lin
scripts/prover-probes.mjs          — live gates
scripts/run-str-wtp-only.mjs       — single-lemma runner
scripts/debug-wtp-*.mjs            — ad-hoc instrumentation (optional)
```

### Move order in `candidateMoves`

fill → IH direct → helperLemma → invert → recurse → supportLemma → intro → split

---

## 7. Gotchas

1. Meta vs comp context — scan both in `expandedHypsOf`.
2. HO split patterns need explicit binders: `(\y. \hy. X1[.., …])`.
3. Beluga hole report may omit pattern metas — use `branchPatternMetas`.
4. Beluga pretty-prints name metas as `"i1` — normal, not corruption.
5. **Anti-overfit:** no `if (theorem === 'str_wtp')`. Generalize from type/schema.

---

## 8. Next backlog

| Item | Reference |
|------|-----------|
| **`str_step` / `str_step'`** | `cp_lemmas.bel` — intro + infix `⇛` split + `branchResultCloseFill` for nullary branches land; HO (`β∥1/2`) + `str_step'` chain still open |
| Full cp-suite automation | After `str_step` |
| `tp_uniq` / `t_lam` | Recursion under binder — `unique.bel` |
| P2 auto-solve button | After engine robust on cp lemmas |

### Landed 2026-06-30 (post-`str_wtp`)

- **Ctx-param intro:** `buildIntroSkeleton` handles `(g:ctx) [box] -> …` (`dependent` + arrows).
- **Infix / Unicode heads:** `typeFamilyHead` (`P[..] ⇛ Q` → `⇛`); `headOfConclusion` accepts `βfwd`-style identifiers.
- **`branchResultCloseFill`:** nullary step branches close `Result` via `Res [g |- _] [g, x:name |- refl_proc] [g |- <ctor>]`.

---

*BelJar drives; Beluga certifies. Do not regress into a tactic REPL wrapper.*
