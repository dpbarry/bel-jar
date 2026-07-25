// prover-bench.mjs — the STRATIFIED BENCH (§0.5 law 2): deterministic
// representatives of a residue class, run through the step-faithful native
// oracle in minutes. The slice's inner loop — decisions are made here; the
// differential/sweep runs only at slice-end.
//
//   node scripts/prover-bench.mjs [--class s1] [--max-steps 40] [--cap 12]
//                                 [--ledger results/corpus/library.jsonl]
//
// --class s1 (default): no-move targets whose REFERENCE proof is TINY
// (≤3 lines, direct term) or SMALL (≤8 lines) — the ctype-lemma composition
// class. One rep per distinct program (deterministic: first target in id
// order), capped. Prints per-rep verdict + summary.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assembleCfgProgram, enumerateDecls, maskByName } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { proveProgram, theoremUnderProof } from '../js/editor-src/prover/prover-orchestrator.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; }
const cls = arg('--class', 's1');
const maxSteps = Number(arg('--max-steps', '40')) || 40;
const cap = Number(arg('--cap', '12')) || 12;
const ledgerPath = arg('--ledger', path.join('results', 'corpus', 'library.jsonl'));
const exe = path.resolve(root, 'Beluga-W/_build/default/src/beluga/main.exe');

const rows = new Map();
for (const line of fs.readFileSync(path.resolve(root, ledgerPath), 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(line);
  rows.set(r.id, r);
}

const srcCache = new Map();
function programOf(prog) {
  if (srcCache.has(prog)) return srcCache.get(prog);
  let code = null;
  try {
    const abs = path.join(root, 'library', prog);
    if (prog.endsWith('.cfg')) {
      const dir = path.dirname(abs);
      code = assembleCfgProgram(fs.readFileSync(abs, 'utf8'), (n) => {
        const p = path.join(dir, n);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
      }).code;
    } else {
      code = fs.readFileSync(abs, 'utf8');
    }
  } catch { code = null; }
  srcCache.set(prog, code);
  return code;
}

function bodyOf(prog, name) {
  const code = programOf(prog);
  if (!code) return null;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()));
  const text = d ? d.text : (decls.find((x) => x && x.name === name) || {}).text;
  if (!text) return null;
  const eq = text.indexOf('=');
  return eq < 0 ? null : text.slice(eq + 1);
}

// S1 membership: no-move ∧ reference TINY/SMALL ∧ inductive fragment.
function inS1(r) {
  if (!(r.outcome === 'STUCK' && r.reason === 'no-move')) return false;
  const [prog, name] = r.id.split('#');
  const body = bodyOf(prog, name);
  if (body == null) return false;
  if (/(^|\s)fun\s/.test(body) || /\|\s*\([^)]*\.\s*/.test(body) || /\?/.test(body)) return false;
  const lines = body.split('\n').filter((l) => l.trim()).length;
  return lines <= 8;
}

// S1b: no-move, reference proof `case`s on a hypothesis whose DECLARED
// premise type is a bare ctype application (not an LF box) — the split-on-
// ctype sub-class named in the S1 postmortem (splitTextForBox returns null
// for a non-boxed scrutinee, so no split is ever offered).
function isCtypePremiseType(t) {
  const s = String(t || '').trim();
  if (!s || s[0] === '[' || s[0] === '(' || s[0] === '{') return false;
  return /^[\p{L}_]/u.test(s);
}
function inS1b(r) {
  if (!(r.outcome === 'STUCK' && r.reason === 'no-move')) return false;
  const [prog, name] = r.id.split('#');
  const code = programOf(prog);
  if (!code) return false;
  const decls = enumerateDecls(code);
  const d = decls.find((x) => x && x.name === name && /^(rec|proof)\b|\band\s+rec\b/.test(String(x.text || '').trim()));
  if (!d) return false;
  const text = d.text;
  const eq = text.indexOf('=');
  if (eq < 0) return false;
  const header = text.slice(0, eq + 1);
  const premMatch = header.match(/:\s*([\s\S]*?)=\s*$/);
  if (!premMatch) return false;
  const prems = premMatch[1].split('->').map((p) => p.trim()).filter(Boolean);
  prems.pop(); // drop the conclusion
  if (!prems.some(isCtypePremiseType)) return false;
  const body = text.slice(eq + 1);
  const lines = body.split('\n').filter((l) => l.trim()).length;
  return lines <= 12 && /\bcase\b/.test(body);
}

// S2: the no-totality-measure residue — after the 2026-07-21 comment-aware
// audit, ALL of it is author-omitted totality (the author-faithful recursion
// policy's box-premise half is the mechanism under test).
function inS2(r) {
  return r.outcome === 'STUCK' && r.reason === 'no-totality-measure';
}

// S3: the TIMEOUT residue — check-count mechanisms (E.10 trigger-indexed
// instantiation, fork-count caps), never wall-clock caps.
function inS3(r) {
  return r.outcome === 'TIMEOUT';
}

const classFns = { s1: inS1, s1b: inS1b, s2: inS2, s3: inS3 };
let members = [...rows.values()].filter(classFns[cls] || (() => false)).map((r) => r.id).sort();
// One rep per program, deterministic; spread across developments. --all
// disables the per-program dedupe (every individual theorem, for an honest
// full-class yield number — the dedup is for a FAST triage sample only).
const allMode = args.includes('--all');
let reps;
if (allMode) {
  reps = members.slice(0, cap);
} else {
  const seenProg = new Set();
  reps = [];
  for (const id of members) {
    const prog = id.split('#')[0];
    if (seenProg.has(prog)) continue;
    seenProg.add(prog);
    reps.push(id);
    if (reps.length >= cap) break;
  }
}
console.log(`class ${cls}: ${members.length} members, ${reps.length} bench reps (cap ${cap})\n`);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bel-bench-'));
let done = 0;
let complete = 0;
for (const id of reps) {
  const [prog, name] = id.split('#');
  const code = programOf(prog);
  const masked = code && maskByName(code, name);
  const thm = masked && theoremUnderProof(masked.declText);
  if (!thm || !thm.compType) { console.log(`SKIP   ${id} (unparseable theorem)`); continue; }
  let checks = 0;
  const oracle = async (src) => {
    checks += 1;
    fs.writeFileSync(path.join(tmpDir, 'h.bel'), src);
    let out = '';
    let ok = true;
    try {
      out = execFileSync(exe, ['h.bel'], { encoding: 'utf8', cwd: tmpDir, timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { ok = false; out = `${String(e.stdout || '')}\n${String(e.stderr || '')}`; }
    return { ok, output: out };
  };
  const t0 = Date.now();
  // eslint-disable-next-line no-await-in-loop
  const res = await proveProgram(masked.code, thm, oracle, { certifyTrim: false, maxSteps });
  done += 1;
  const verdict = res.complete ? 'COMPLETE' : `STUCK:${(res.stuck && res.stuck.reason) || '?'}`;
  if (res.complete) complete += 1;
  console.log(`${res.complete ? 'OK  ' : 'FAIL'}  ${id}  ${verdict} [${checks} checks, ${((Date.now() - t0) / 1000).toFixed(1)}s]`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nbench: ${complete}/${done} complete`);
