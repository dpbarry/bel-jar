# scratch/

**Everything local and ephemeral lives here.** Gitignored except this README. Nothing under `scratch/` is imported by the IDE, tests, or product build.

| Subfolder | Purpose |
|-----------|---------|
| [`probes/`](probes/) | Prover research: A/B harnesses, census scripts, `.jsonl` logs, one-off `.bel` fixtures (formerly `scratchpad/`) |
| [`machine-transfer/`](machine-transfer/) | Export/import bel-jar + Cursor/Claude context between machines (`export.ps1`, `import.ps1`) |

Loose files at the root (samples, audit JSON, PDFs) are fine too.

## Where things do **not** go

| Path | Role |
|------|------|
| [`scripts/`](../scripts/) | **Committed** npm-wired tools (`npm run build`, `npm test`, `prover:*`, `corpus:*`). Not scratch. |
| [`tests/`](../tests/) | **Committed** suite (`test-*.mjs`, `fixtures/`, `heldout-corpus/`). Ephemeral test scratch → `tests/_scratch-*.mjs` (gitignored) or here. |
| [`results/corpus/`](../results/corpus/) | Corpus harness run outputs (gitignored). |

Legacy one-off debug scripts may still appear under `scripts/debug-*.mjs` (gitignored); new probes belong in `scratch/probes/`.

See [`docs/CODEMAP.md`](../docs/CODEMAP.md). Research instruments index: [`docs/archive/orca-research/instruments.md`](../docs/archive/orca-research/instruments.md).
