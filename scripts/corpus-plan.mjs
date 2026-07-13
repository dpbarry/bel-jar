// corpus-plan.mjs — PURE (no browser). Walk a corpus root, assemble each
// `.cfg` program (plus `.bel` files referenced by NO cfg as one-program
// singletons), enumerate the maskable `rec`/`proof` targets, and emit a run
// manifest the live harness consumes. Fast; safe to re-run.
//
// A directory may carry several cfgs (upstream Beluga keeps `test.cfg`,
// `test-crec.cfg`, … variants); each becomes a program, ranked sources.cfg →
// test.cfg → alphabetical, and a theorem appearing in several assemblies is
// planned ONCE under the best-ranked one. Only cfg-less `.bel`s are singletons
// — a cfg member is NOT self-contained by construction (the 2026-07-12
// church-rosser lesson: planning members as singletons produced 84
// PRECHECK_FAILs for missing preludes).
//
//   node scripts/corpus-plan.mjs --corpus <root> [--out <file>]
//
// Defaults: --corpus tests/heldout-corpus, out results/corpus/<id>-plan.json.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  assembleCfgProgram,
  maskableTargets,
  offsetToFileLine,
} from '../editor-src/bel-corpus-decls.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const corpusRel = arg('--corpus', 'tests/heldout-corpus');
const corpusRoot = path.resolve(root, corpusRel);
const corpusId = corpusRel.replace(/[\\/]/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
const outFile = arg('--out', path.join('results', 'corpus', `${corpusId}-plan.json`));

function engineSha() {
  try { return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); }
  catch { return 'nogit'; }
}

// Recursively find every .cfg and every .bel under the corpus root.
function walk(dir, acc = { cfgs: [], bels: [] }) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('_') || ent.name === 'node_modules') continue; // GENERAL: filesystem skip (_rejected/, deps), not a Beluga name
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.name.toLowerCase().endsWith('.cfg')) acc.cfgs.push(p);
    else if (ent.name.endsWith('.bel')) acc.bels.push(p);
  }
  return acc;
}

// Rank cfgs within a directory: the curated name first, then upstream's
// conventional test.cfg, then alphabetical. Filename convention only.
function cfgRank(name) {
  if (name === 'sources.cfg') return 0; // GENERAL: cfg filename convention, not a Beluga name
  if (name === 'test.cfg') return 1; // GENERAL: cfg filename convention, not a Beluga name
  return 2;
}

// Uniform maxSteps by shape — NEVER per-name. More premises ⇒ more room.
function maxStepsFor(premiseCount) {
  const n = premiseCount || 0;
  return Math.max(40, Math.min(250, 40 + 20 * n));
}

function conclusionForm(concl) {
  const c = String(concl || '');
  const head = (c.replace(/^\s*\[[^\]]*\|-?/, '').match(/[A-Za-z_'][\w']*/) || [''])[0];
  return head || 'unknown';
}

function planProgram(programId, cfgAbs, assembled) {
  const { code, files, unresolved } = assembled;
  const targets = [];
  const skips = [];
  const mt = maskableTargets(code);
  for (const t of mt.targets) {
    const loc = offsetToFileLine(files, code, t.from);
    const premises = (t.thm.compType && t.thm.compType.premises) || [];
    const premiseCount = premises.length;
    const hasCtxSchema = premises.some((p) => p.kind === 'ctx') // GENERAL: 'ctx' is our premise-kind enum tag, not a program name
      || /\(\s*\w+\s*:\s*\w+\s*\)/.test((t.thm.compType && t.thm.compType.raw) || ''); // GENERAL: schema-binder syntax
    targets.push({
      id: `${programId}#${t.name}`,
      name: t.name,
      file: loc.path,
      line: loc.line,
      from: t.from,
      to: t.to,
      compTypeRaw: t.thm.compType ? t.thm.compType.raw : null,
      totality: t.thm.totality || null,
      premiseCount,
      hasCtxSchema,
      conclusionForm: conclusionForm(t.thm.compType && t.thm.compType.conclusion),
      maxSteps: maxStepsFor(premiseCount),
    });
  }
  for (const s of mt.skips) skips.push({ name: s.name, reason: s.reason });
  return {
    programId,
    cfg: cfgAbs ? path.relative(root, cfgAbs).replace(/\\/g, '/') : null,
    files: files.map((f) => f.path),
    unresolved,
    assembledSha: sha(code),
    targets,
    skips,
  };
}

function sha(text) {
  // Tiny stable non-crypto hash (djb2) — enough to key the resumable cache.
  let h = 5381;
  const s = String(text);
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const { cfgs, bels } = walk(corpusRoot);
cfgs.sort((a, b) => {
  const da = path.dirname(a);
  const db = path.dirname(b);
  if (da !== db) return da.localeCompare(db);
  return (cfgRank(path.basename(a)) - cfgRank(path.basename(b)))
    || path.basename(a).localeCompare(path.basename(b));
});
const programs = [];
const belsInCfg = new Set();

for (const cfgAbs of cfgs) {
  const dir = path.dirname(cfgAbs);
  const cfgText = fs.readFileSync(cfgAbs, 'utf8');
  const assembled = assembleCfgProgram(cfgText, (name) => {
    const p = path.join(dir, name);
    if (name.toLowerCase().endsWith('.cfg')) return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    if (fs.existsSync(p)) { belsInCfg.add(path.resolve(p)); return fs.readFileSync(p, 'utf8'); }
    return null;
  });
  const programId = path.relative(corpusRoot, cfgAbs).replace(/\\/g, '/');
  programs.push(planProgram(programId, cfgAbs, assembled));
}

// Cfg-less singleton .bel files each become their own one-file program.
// A .bel referenced by ANY cfg is a member, not self-contained — never a
// singleton (its prelude lives in the cfg order).
for (const belAbs of bels) {
  if (belsInCfg.has(path.resolve(belAbs))) continue;
  const name = path.basename(belAbs);
  const text = fs.readFileSync(belAbs, 'utf8');
  const assembled = assembleCfgProgram(name, (n) => (n === name ? text : null));
  const programId = path.relative(corpusRoot, belAbs).replace(/\\/g, '/');
  programs.push(planProgram(programId, null, assembled));
}

// A theorem often appears in several assemblies of one directory (test.cfg vs
// test-crec.cfg share members). Measure it ONCE, under the best-ranked
// assembly that contains it; drop programs left with no targets.
const seenTheorem = new Set();
for (const prog of programs) {
  const dir = prog.cfg ? path.dirname(path.resolve(root, prog.cfg)) : corpusRoot;
  prog.targets = prog.targets.filter((t) => {
    const fileAbs = prog.cfg ? path.resolve(dir, t.file || '') : path.resolve(corpusRoot, prog.programId);
    const key = `${fileAbs}#${t.name}`;
    if (seenTheorem.has(key)) return false;
    seenTheorem.add(key);
    return true;
  });
}
const planned = programs.filter((p) => p.targets.length);

const plan = {
  corpusId,
  corpusRoot: corpusRel.replace(/\\/g, '/'),
  engineGitSha: engineSha(),
  createdAt: new Date().toISOString(),
  programs: planned,
};

fs.mkdirSync(path.dirname(path.resolve(root, outFile)), { recursive: true });
fs.writeFileSync(path.resolve(root, outFile), JSON.stringify(plan, null, 2));

const nTargets = planned.reduce((a, p) => a + p.targets.length, 0);
const nSkips = planned.reduce((a, p) => a + p.skips.length, 0);
console.log(`plan: ${planned.length} program(s) (${programs.length - planned.length} empty after dedupe), ${nTargets} maskable target(s), ${nSkips} skip(s)`);
console.log(`wrote ${outFile}`);
