// corpus-report.mjs — PURE scorecard from a harness JSONL run. Measures
// GENERALITY, never lemma identity: an overall solve-rate, per-SHAPE buckets, a
// move-kind histogram over solved proofs, and an honest, name-free failure
// ledger (a CLASS of gap, never "make lemma X pass"). Prints to console and
// writes a .md beside the JSONL.
//
//   node scripts/corpus-report.mjs [--in <jsonl>] [--corpus <root>] [--against <prev.jsonl>]
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const corpusRel = arg('--corpus', 'tests/heldout-corpus');
const corpusId = corpusRel.replace(/[\\/]/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
const inFile = arg('--in', path.join('results', 'corpus', `${corpusId}.jsonl`));
const against = arg('--against', null);

function readJsonl(file) {
  const abs = path.resolve(root, file);
  if (!fs.existsSync(abs)) return [];
  return fs.readFileSync(abs, 'utf8').split('\n').filter((l) => l.trim()).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

const rows = readJsonl(inFile);
if (!rows.length) { console.error(`no results in ${inFile}`); process.exit(1); }

// Latest row per id (a re-run appends; last wins).
const byId = new Map();
for (const r of rows) byId.set(r.id, r);
const latest = [...byId.values()];

const SCORED = new Set(['COMPLETE', 'STUCK', 'FAIL', 'TIMEOUT']); // PRECHECK_FAIL/SKIPPED excluded
const scored = latest.filter((r) => SCORED.has(r.outcome));
const complete = scored.filter((r) => r.outcome === 'COMPLETE');
const rate = scored.length ? (100 * complete.length / scored.length) : 0;

function pct(n, d) { return d ? (100 * n / d).toFixed(0) + '%' : '—'; }

const lines = [];
function out(s = '') { lines.push(s); console.log(s); }

out(`# Corpus scorecard — ${corpusId}`);
out('');
out(`**Solved ${complete.length}/${scored.length} (${rate.toFixed(0)}%)** re-derived from the type by the prover.`);
// Out-of-fragment declines are ANSWERS (the decision procedure classifying the
// goal outside its move space), not misses — report the in-fragment rate too,
// while keeping the headline denominator honest over ALL targets.
const outOfFragment = scored.filter((r) => r.outcome === 'STUCK' && /out-of-fragment/.test(r.reason || ''));
if (outOfFragment.length) {
  const inFrag = scored.length - outOfFragment.length;
  out(`${outOfFragment.length} decline(s) are classified out-of-fragment (coinductive goals — copattern formers `
    + `are deliberately outside the move space); in-fragment solve rate: ${complete.length}/${inFrag} (${pct(complete.length, inFrag)}).`);
}
const excluded = latest.filter((r) => !SCORED.has(r.outcome));
if (excluded.length) {
  const pf = excluded.filter((r) => r.outcome === 'PRECHECK_FAIL').length;
  const sk = excluded.filter((r) => r.outcome === 'SKIPPED').length;
  out(`Excluded from denominator: ${pf} precheck-fail, ${sk} skipped (corpus issues, not prover misses).`);
}
out('');

// ── Per-shape buckets (generalization across shapes, not names) ─────────────
out('## By shape');
out('');
out('| premises | ctx-schema | conclusion | solved | rate |');
out('|---|---|---|---|---|');
const buckets = new Map();
for (const r of scored) {
  const key = `${r.premiseCount || 0}|${r.hasCtxSchema ? 'yes' : 'no'}|${r.conclusionForm || '?'}`;
  if (!buckets.has(key)) buckets.set(key, { total: 0, solved: 0 });
  const b = buckets.get(key);
  b.total += 1;
  if (r.outcome === 'COMPLETE') b.solved += 1;
}
for (const [key, b] of [...buckets.entries()].sort()) {
  const [pc, cs, cf] = key.split('|');
  out(`| ${pc} | ${cs} | ${cf} | ${b.solved}/${b.total} | ${pct(b.solved, b.total)} |`);
}
out('');

// ── Move-kind histogram over SOLVED proofs (the general vocabulary at work) ──
out('## Moves used (across solved proofs)');
out('');
const moveHist = new Map();
for (const r of complete) for (const m of (r.moveKinds || [])) moveHist.set(m, (moveHist.get(m) || 0) + 1);
if (moveHist.size) {
  for (const [m, n] of [...moveHist.entries()].sort((a, b) => b[1] - a[1])) out(`- ${m}: ${n}`);
} else out('(none)');
out('');

// ── Honest failure ledger (a CLASS of gap, grouped by verbatim reason) ──────
const failures = scored.filter((r) => r.outcome !== 'COMPLETE');
out('## Failure ledger');
out('');
if (!failures.length) out('None — every scored target was re-derived.');
else {
  const groups = new Map();
  for (const r of failures) {
    const reason = r.outcome === 'STUCK' ? (r.reason || 'no move')
      : r.outcome === 'TIMEOUT' ? 'timeout'
        : (r.error || 'error');
    const key = `${r.outcome}: ${reason}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [key, rs] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    out(`- **${rs.length}× ${key}**  — shapes: `
      + [...new Set(rs.map((r) => `${r.premiseCount || 0}p/${r.hasCtxSchema ? 'ctx' : 'flat'}/${r.conclusionForm}`))].join(', '));
  }
}
out('');

// ── Per-target drill-down ───────────────────────────────────────────────────
out('## Targets');
out('');
out('| target | outcome | steps | checks | ms |');
out('|---|---|---|---|---|');
for (const r of latest.sort((a, b) => a.id.localeCompare(b.id))) {
  out(`| ${r.id} | ${r.outcome}${r.reason ? ' (' + r.reason + ')' : ''} | ${r.steps ?? '—'} | ${r.checks ?? '—'} | ${r.ms ?? '—'} |`);
}
out('');

// ── Optional regression gate (regression-direction only) ────────────────────
if (against) {
  const prev = new Map();
  for (const r of readJsonl(against)) prev.set(r.id, r); // last wins
  const regressed = [];
  for (const r of latest) {
    const p = prev.get(r.id);
    if (p && p.outcome === 'COMPLETE' && r.outcome !== 'COMPLETE') regressed.push(r.id);
  }
  out('## Regression check');
  out('');
  if (regressed.length) {
    out(`**REGRESSION: ${regressed.length} previously-solved target(s) no longer solve:**`);
    for (const id of regressed) out(`- ${id}`);
    process.exitCode = 1;
  } else out('No regression — nothing previously solved went red.');
  out('');
}

const mdFile = path.resolve(root, inFile).replace(/\.jsonl$/, '.md');
fs.writeFileSync(mdFile, lines.join('\n'));
console.log(`\nwrote ${path.relative(root, mdFile)}`);
