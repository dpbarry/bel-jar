# Held-out corpus — blind generality evidence for the Harpoon prover

These `.bel` files are the **anti-overfit gold** for measuring BelJar's native prover.
Each was authored by an independent, Beluga-expert subagent that was **deliberately
kept oblivious** to Harpoon/BelJar: the authoring prompts named no move vocabulary
(intro/split/recurse/invert/lemma/fill), no `?` holes, no orchestration, and gave no
steer toward "prover-friendly" shapes. So none of these theorems could have been
fitted to what the engine happens to do well.

## How they're used

1. **Author-check (before masking):** every file must type-check CLEAN as written
   (0 errors, a `/ total … /` measure, no `/ trust /`, no `--not`). If it doesn't, it
   is quarantined to `_rejected/` and never scored. A passing file has `provable: true`
   in its batch `manifest.json` — a full checking proof was supplied, so a later STUCK
   is a real engine miss, never "the theorem was false".
2. **Mask & re-derive:** `scripts/corpus-plan.mjs` + `scripts/corpus-harness.mjs`
   (via `npm run heldout:run`) blank each `rec`/`proof` body to `?` and ask the prover
   to re-derive it against the live checker. `scripts/corpus-report.mjs` prints the
   solve-rate — **this held-out number is the deliverable**, reported separately from
   the tuned corpora.

## The one rule that keeps the number honest

**No feedback loop.** A file the harness can't currently solve STAYS in the set as an
honest miss. Never edit a held-out file, and never fold harness outcomes back into a
future authoring prompt, to make the number go up. New batches are authored blind and
appended; the metric only strengthens as the set grows.

See also the project memories `feedback-prover-overfit-postmortem` and
`project-beljar-prover`.
