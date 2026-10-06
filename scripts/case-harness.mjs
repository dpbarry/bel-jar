// case-harness.mjs — leave-one-out measurement for case completion.
//
// QUESTION. Take a finished proof, hide one case, and hand the machine the others.
// Can it put a case back that Beluga accepts? Asked of every case of every totalied
// proof, that is the completion rate the track rests on.
//
// A number from this file means nothing until its CONTROLS hold, so every arm
// carries both, and an arm that fails either is excluded from scoring and counted:
//
//   NEGATIVE  the proof with the arm removed must be REJECTED, for coverage. If
//             Beluga does not miss the case, "accepted" tells us nothing about a
//             candidate we put there.
//   POSITIVE  the author's own body, spliced back through the same path every
//             candidate takes (regenerated arm, parenthesised body), must be
//             ACCEPTED. If it is not, the splice is broken, not the candidate.
//
// ⛔ TOTALIED PROOFS ONLY. Beluga gates coverage checking per declaration on that
// declaration's own totality declaration, so on an untotalied proof a missing case
// is simply not noticed and both controls are meaningless.
// ⛔ Nothing here writes a `/ total /`. The author's is left exactly where it is.
//
// STRATEGIES are the pluggable part: `(maskedArm, siblings) -> candidate bodies`.
// The one built in, `verbatim`, is a FLOOR and is labelled as one: a sibling's body,
// unchanged, under the hidden case's own pattern. It knows no constructor
// correspondence and renames nothing. A real assignment rule should beat it.
//
//   node scripts/case-harness.mjs                       # controls only, whole corpus
//   node scripts/case-harness.mjs --strategy verbatim   # + the floor
//   node scripts/case-harness.mjs --file x.bel          # one file, rows to stdout
//   node scripts/case-harness.mjs --cfg d/sources.cfg   # one assembled development
//   node scripts/case-harness.mjs --report <rows.jsonl> # re-report a finished run
//   node scripts/case-harness.mjs --annotate <rows.jsonl> [--out f]  # backfill result classes
//   node scripts/case-harness.mjs --redo-skipped <rows.jsonl> [--reason unreadable-arm]
//        [--fill-why failed-re-check,theorem-unreadable] [--crashed]
//                                                       # re-measure only what a run skipped, what a
//                                                       # filler failed on, or units that crashed,
//                                                       # and write the merged ledger
//   … [--root dir] [--limit N] [--min-arms N] [--jobs N] [--out rows.jsonl] [--recs a|b]

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { TextDecoder, TextEncoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { recsWithArms, maskArm, replaceArm } from './case-read-arms.mjs';
import { resultClassOf, slicesFor } from './case-harness-lib.mjs';
import { assembleCfgProgram, enumerateDecls } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { authoredPieces, armRuleHead, splitArm } from '../js/editor-src/prover/case-pieces.mjs';
import { PARK, keyOfPattern, planCase, fillRow } from '../js/editor-src/prover/case-fill.mjs';
import { signatureIndex } from '../js/editor-src/prover/case-lookup.mjs';
import {
  VERDICTS, STRENGTH, strengthOf, buildTable, recordVerdict, reassign, validate,
} from '../js/editor-src/prover/case-assignment.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };

// ── the oracle ───────────────────────────────────────────────────────────────
let Beluga = null;
let reloads = 0;
function loadBeluga() {
  const code = fs.readFileSync(path.join(root, 'beluga_web.bc.js'), 'utf8');
  const ctx = { console, TextDecoder, TextEncoder, setTimeout, clearTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  Beluga = ctx.Beluga;
}
let checks = 0;
function check(code) {
  if (!Beluga) loadBeluga();
  checks += 1;
  try {
    const r = Beluga.checkFromString(code);
    return { ok: !!r.ok, out: String(r.output || '') };
  } catch (e) {
    return { ok: false, out: 'THREW: ' + (e && e.message ? e.message : String(e)) };
  }
}

// ── arms ─────────────────────────────────────────────────────────────────────
// Every candidate, the author's own body included, goes through this one spelling.
// The body is parenthesised because an unparenthesised nested `case` in a non-final
// arm swallows the arms after it; the close paren sits on its own line because a
// body may end in a `%` comment.
function armWith(pattern, body) {
  return `${pattern} =>\n(${body}\n)`;
}

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

// A small deterministic generator: the chance control must be reproducible.
function seeded(seedText) {
  let h = 2166136261;
  for (const ch of seedText) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e9) / 1e9; };
}

// ── strategies ───────────────────────────────────────────────────────────────
// (masked arm, sibling arms) -> ordered candidate bodies, each tagged with its donor.
const STRATEGIES = {
  // FLOOR. Each distinct sibling body, unchanged. No renaming, no correspondence.
  verbatim(masked, siblings) {
    const seen = new Set();
    const out = [];
    for (const s of siblings) {
      const key = squash(s.body);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ donor: s.index, donorHead: s.head, body: s.body, identical: key === squash(masked.body) });
    }
    return out;
  },
};

// FILLERS do not propose sibling bodies: they are handed the hidden case as a hole and
// fill it themselves, through `fillRow` (js/editor-src/prover/case-fill.mjs), the code
// the editor runs. Its acceptance rules (a move was made, nothing outside the case
// changed, an independent re-check with no hole left) are the product's, not the
// harness's.
const asyncCheck = async (s) => { const c = check(s); return { ok: c.ok, output: c.out }; };
const fillBudget = { maxSteps: undefined, deadlineMs: undefined };
const FILLERS = {
  // PARITY. Orca alone, under the author's own pattern: what the 2026-10-02 ledger
  // measured, so this must reproduce it.
  async orca(prog, masked, recStart) {
    const hole = `${PARK}0`;
    const arm = `${masked.pattern} =>\n?${hole}`;
    const plan = {
      code: replaceArm(prog, masked, arm),
      rows: [{ rule: masked.head, key: keyOfPattern(masked.pattern), pattern: masked.pattern, from: masked.from, to: masked.from + arm.length, hole }],
    };
    return fillRow(plan, 0, asyncCheck, { recStart, noLookup: true, ...fillBudget });
  },
  // WHAT SHIPS. The hidden case and `--hide k − 1` siblings are deleted, the cases are
  // planned from the model (generated patterns, parked holes), and the hidden one is
  // filled: the lookup first, then Orca focused on it.
  async fill(prog, masked, recStart, env) {
    const others = env.parts.filter((p) => p.index !== masked.index);
    const rnd = seeded(`hide#${env.label}#${masked.index}`);
    const partners = [];
    // At least one case stays written: the feature never starts from an empty case, so
    // a two-case proof under `--hide 2` is measured with one hidden, not both.
    while (partners.length < Math.min(HIDE - 1, others.length - 1)) {
      const pick = others.splice(Math.floor(rnd() * others.length), 1)[0];
      partners.push(pick);
    }
    let code = prog;
    for (const a of [masked, ...partners].sort((x, y) => y.from - x.from)) code = maskArm(code, a);
    const rec = recsWithArms(code).find((r) => r.from === recStart);
    if (!rec) return { ok: false, why: 'not-planned: rec lost' };
    const plan = await planCase(code, rec, asyncCheck);
    if (plan.unbuilt) return { ok: false, why: `not-planned: ${plan.why}` };
    const want = keyOfPattern(masked.pattern);
    let k = plan.rows.findIndex((r) => r.key === want);
    // A parameter case is spelled by field number by authors (`#p.2`) and by field name
    // by the model (`#p.u[..]`): the same case under two keys. Match it as a parameter row.
    if (k < 0 && want.includes('#')) k = plan.rows.findIndex((r) => r.key.includes('#'));
    if (k < 0) return { ok: false, why: `not-planned: ${plan.why || 'row missing'}` };
    const authored = rec.arms.map((a) => ({ text: a.text, head: armRuleHead(a.text) }));
    return fillRow(plan, k, asyncCheck, { recStart, authored, index: signatureIndex(code), ...fillBudget });
  },
};
const ORCA_STEPS = Number(process.argv.includes('--orca-steps') ? process.argv[process.argv.indexOf('--orca-steps') + 1] : 15);
const ORCA_CASE_MS = 1000 * Number(process.argv.includes('--orca-secs') ? process.argv[process.argv.indexOf('--orca-secs') + 1] : 60);
const HIDE = Math.max(1, Number(process.argv.includes('--hide') ? process.argv[process.argv.indexOf('--hide') + 1] : 1));
fillBudget.maxSteps = ORCA_STEPS;
fillBudget.deadlineMs = ORCA_CASE_MS;

// ── one program ──────────────────────────────────────────────────────────────
async function measureProgram(code, unit, { minArms, strategyName, unitKind = 'file', fileOf = null, onlyRecs = null }) {
  const rows = [];
  // `fileOf` maps a rec to the member file it sits in, or null when that member is
  // not this unit's to measure (it already checked on its own).
  let label = unit;
  const emit = (row) => rows.push({ unit, file: label, ...row });

  const base = check(code);
  if (!base.ok) { emit({ kind: 'unit', unitKind, status: 'does-not-check', error: base.out.slice(0, 300) }); return rows; }
  emit({ kind: 'unit', unitKind, status: 'checks' });

  const strategy = strategyName ? STRATEGIES[strategyName] : null;
  const filler = strategyName ? FILLERS[strategyName] : null;
  const decls = enumerateDecls(code);

  for (const rec of recsWithArms(code)) {
    if (onlyRecs && !onlyRecs.has(rec.name)) continue;
    if (fileOf) { const f = fileOf(rec); if (!f) continue; label = f; }
    if (rec.arms.length < minArms) continue;
    // Scored at full strength only. Under a bare `--coverage` Beluga would notice
    // the missing case and still accept a circular candidate, so an "accepted"
    // there is not a proof and must not be counted as one.
    const strength = strengthOf(code.slice(rec.from, rec.to), code);
    if (strength !== STRENGTH.total) {
      emit({ kind: 'rec', rec: rec.name, arms: rec.arms.length, skipped: strength === STRENGTH.covering ? 'coverage-only' : 'untotalied' });
      continue;
    }
    const readArms = rec.arms.map((a, index) => {
      const sp = splitArm(a.text);
      return sp ? { ...a, index, head: armRuleHead(a.text), ...sp } : null;
    });
    if (readArms.some((p) => !p)) {
      emit({ kind: 'rec', rec: rec.name, arms: rec.arms.length, skipped: 'unreadable-arm' });
      continue;
    }
    // The smallest program this proof checks in. The whole program is known good, so
    // the search always ends; a slice whose arm offsets do not line up is not used.
    let prog = code;
    let parts = readArms;
    let sliced = 'full';
    let recStart = rec.from;
    for (const sl of slicesFor(code, decls, rec)) {
      if (sl.how === 'full') break;
      const moved = readArms.map((p) => ({ ...p, from: p.from + sl.shift, to: p.to + sl.shift }));
      if (!moved.every((p) => sl.prog.slice(p.from, p.to) === p.text)) continue;
      if (!check(sl.prog).ok) continue;
      prog = sl.prog; parts = moved; sliced = sl.how; recStart = rec.from + sl.shift;
      break;
    }
    const { judgment } = authoredPieces(code, rec.arms.map((a) => a.text));
    const heads = parts.map((p) => p.head);
    // When the outermost heads are not distinct rules of one judgment, the outer case
    // is not the induction (a pair, a nested pattern). Measured, but bucketed apart:
    // "rule" is the wrong word for those arms.
    const uniqueHeads = heads.every(Boolean) && new Set(heads).size === heads.length;
    const cls = resultClassOf(code, rec);
    emit({ kind: 'rec', rec: rec.name, arms: parts.length, judgment, uniqueHeads, sliced, progChars: prog.length, fullChars: code.length, ...cls });

    for (const masked of parts) {
      const row = {
        kind: 'arm', rec: rec.name, arm: masked.index, head: masked.head,
        nArms: parts.length, judgment, uniqueHeads, ...cls,
      };
      const before = checks;

      // NEGATIVE control.
      const neg = check(maskArm(prog, masked));
      row.neg = neg.ok ? 'undetected' : (/COVERAGE|cover/i.test(neg.out) ? 'coverage' : 'other-error');
      row.negNamesHead = !neg.ok && !!masked.head && neg.out.includes(masked.head);

      // POSITIVE control, through the candidate path. A failure straight after a
      // rejected check may be the checker's own state, so it gets one fresh instance
      // before it is believed.
      const own = replaceArm(prog, masked, armWith(masked.pattern, masked.body));
      let pos = check(own);
      if (!pos.ok) {
        loadBeluga(); reloads += 1;
        pos = check(own);
        row.posNeededReload = pos.ok;
      }
      row.pos = pos.ok;

      const scorable = row.neg === 'coverage' && row.pos;
      row.scorable = scorable;

      if (scorable && filler) {
        const t0 = Date.now();
        const f = await filler(prog, masked, recStart, { parts, label: `${label}#${rec.name}` });
        // Unmeasured is not "not filled": the row keeps no verdict, so it leaves the
        // denominator instead of lowering the rate.
        if (!f.unmeasured) row.reachable = f.ok;
        row.fillSecs = (Date.now() - t0) / 1000;
        if (f.ok) {
          row.fillSteps = f.steps;
          row.fillSource = f.source;
          if (f.donor) row.fillDonor = f.donor;
          row.fillSameAsAuthor = squash(splitArm(f.text) ? splitArm(f.text).body : f.text) === squash(masked.body);
        } else {
          row.fillWhy = f.why;
          if (f.detail) row.fillDetail = f.detail;
          if (f.text) row.fillText = f.text;
        }
      }

      if (scorable && strategy) {
        const siblings = parts.filter((p) => p.index !== masked.index);
        const cands = strategy(masked, siblings);
        // Chance control: one candidate, drawn first, reproducibly.
        const rnd = seeded(`${label}#${rec.name}#${masked.index}`);
        if (cands.length > 1) {
          const k = Math.floor(rnd() * cands.length);
          cands.unshift(cands.splice(k, 1)[0]);
        }
        row.candidates = cands.length;
        row.chance = false;
        row.reachable = false;

        // The table rides along on proofs where "rule" means what it says, so the
        // structure the surface will show is exercised by real data here.
        let table = null;
        if (uniqueHeads && judgment && cands.length) {
          table = buildTable({
            judgment,
            rules: parts.map((p) => ({ name: p.head })),
            pieces: siblings.map((s) => ({ id: `the ${s.head} case`, rule: s.head })),
            assign: (rule) => (rule.name === masked.head
              ? { pieceId: `the ${cands[0].donorHead} case` }
              : null),
            strength,
          });
        }

        for (let c = 0; c < cands.length; c += 1) {
          const cand = cands[c];
          const r = check(replaceArm(prog, masked, armWith(masked.pattern, cand.body)));
          if (table) {
            if (c > 0) table = reassign(table, masked.head, `the ${cand.donorHead} case`);
            table = recordVerdict(table, masked.head, { ok: r.ok, error: r.out.slice(0, 200) });
          }
          if (c === 0) row.chance = r.ok;
          if (r.ok) {
            row.reachable = true;
            row.winner = cand.donor;
            row.winnerHead = cand.donorHead;
            row.winnerIdentical = cand.identical;
            break;
          }
        }
        if (table) {
          const mine = table.rows.find((t) => t.rule === masked.head);
          row.tableProblems = validate(table).length;
          row.tableAgrees = (mine.verdict === VERDICTS.checked) === row.reachable;
        }
      }
      row.checks = checks - before;
      emit(row);
    }
  }
  return rows;
}

// ── report ───────────────────────────────────────────────────────────────────
function pct(n, d) { return d ? `${n}/${d} = ${(100 * n / d).toFixed(1)}%` : `${n}/0`; }

function report(rows, strategyName) {
  const units = rows.filter((r) => r.kind === 'unit');
  const recs = rows.filter((r) => r.kind === 'rec');
  const arms = rows.filter((r) => r.kind === 'arm');
  const L = [];
  const alone = units.filter((u) => u.unitKind === 'file');
  const cfgs = units.filter((u) => u.unitKind === 'cfg');
  const tally = (set) => `${set.length}  (check: ${set.filter((u) => u.status === 'checks').length}, do not: ${set.filter((u) => u.status === 'does-not-check').length}, timed out or crashed: ${set.filter((u) => u.status === 'timeout' || u.status === 'crashed').length})`;
  L.push(`files alone      : ${tally(alone)}`);
  L.push(`cfg developments : ${tally(cfgs)}`);
  L.push(`files with arms  : ${new Set(arms.map((a) => a.file)).size}`);
  const skip = (why) => recs.filter((r) => r.skipped === why).length;
  L.push(`recs considered  : ${recs.length}  (skipped — untotalied: ${skip('untotalied')}; coverage pragma only: ${skip('coverage-only')}; unreadable arm: ${skip('unreadable-arm')})`);
  const measured = recs.filter((r) => !r.skipped);
  const by = (how) => measured.filter((r) => r.sliced === how).length;
  L.push(`checked against  : pruned slice ${by('pruned')}, plain prefix ${by('prefix')}, whole program ${by('full')}`);
  L.push(`arms measured    : ${arms.length}`);
  L.push('');
  L.push('--- controls ---');
  const cov = arms.filter((a) => a.neg === 'coverage');
  L.push(`NEGATIVE  masked proof rejected for coverage : ${pct(cov.length, arms.length)}`);
  L.push(`          rejected for something else        : ${arms.filter((a) => a.neg === 'other-error').length}`);
  L.push(`          NOT rejected (case not missed)     : ${arms.filter((a) => a.neg === 'undetected').length}`);
  L.push(`          coverage error names the head      : ${pct(cov.filter((a) => a.negNamesHead).length, cov.length)}`);
  L.push(`POSITIVE  author's body accepted via splice  : ${pct(arms.filter((a) => a.pos).length, arms.length)}`);
  L.push(`          …only after a fresh checker        : ${arms.filter((a) => a.posNeededReload).length}`);
  const scorable = arms.filter((a) => a.scorable);
  L.push(`SCORABLE  both controls hold                 : ${pct(scorable.length, arms.length)}`);

  const scored = scorable.filter((a) => typeof a.reachable === 'boolean');
  if (scored.length) {
    L.push('');
    L.push(`--- strategy: ${strategyName || '?'} ---`);
    // A filler (Orca) has no sibling to draw at random and no donor; it reports a fill
    // rate and what the fills cost instead.
    const filled = scored.some((a) => typeof a.fillSecs === 'number');
    const median = (xs) => (xs.length ? xs.slice().sort((x, y) => x - y)[Math.floor(xs.length / 2)] : 0);
    const line = (label, set) => {
      const reach = set.filter((a) => a.reachable).length;
      if (filled) {
        const secs = set.filter((a) => a.reachable).map((a) => a.fillSecs);
        L.push(`${label.padEnd(26)} arms ${String(set.length).padStart(5)}   filled ${pct(reach, set.length).padEnd(18)} median ${median(secs).toFixed(1)} s per filled case`);
        return;
      }
      const chance = set.filter((a) => a.chance).length;
      L.push(`${label.padEnd(26)} arms ${String(set.length).padStart(5)}   any sibling ${pct(reach, set.length).padEnd(18)} one at random ${pct(chance, set.length)}`);
    };
    const verbatimShare = (set) => {
      const wins = set.filter((a) => a.reachable);
      return pct(wins.filter((a) => (filled ? a.fillSameAsAuthor : a.winnerIdentical)).length, wins.length);
    };
    // ⛔ THE HEADLINE IS THE THEOREMS. "Accepted" is evidence of a correct case only
    // where the type pins the answer; for a program it is not, and blending the two
    // reports the checker's permissiveness as the machine's skill.
    const classed = scored.some((a) => a.result);
    if (classed) {
      const CLASSES = [
        ['indexed', 'THEOREMS  result is a derivation of an indexed family'],
        ['comp', 'result is a computation-level type'],
        ['data', 'PROGRAMS  result is a term of an unindexed type'],
        ['unresolved', 'result family not resolved'],
      ];
      for (const [key, title] of CLASSES) {
        const set = scored.filter((a) => a.result === key);
        if (!set.length) continue;
        L.push(`${title}  (${new Set(set.map((a) => `${a.unit}#${a.rec}`)).size} proofs)`);
        line('  all arms', set);
        line('  proofs with >=6 arms', set.filter((a) => a.nArms >= 6));
        L.push(`  wins that are the hidden body verbatim: ${verbatimShare(set)}`);
        if (key === 'data') L.push('  ⚠ not a completion rate: the type accepts wrong bodies here, so a win need not be the right case');
      }
      L.push('');
      L.push('blend of every class (do not quote on its own):');
    }
    line('all scorable arms', scored);
    line('  outer case is the rules', scored.filter((a) => a.uniqueHeads));
    line('  nested / paired patterns', scored.filter((a) => !a.uniqueHeads));
    L.push('by proof size (arms):');
    for (const [lo, hi, name] of [[2, 3, '2-3'], [4, 5, '4-5'], [6, 9, '6-9'], [10, 1e9, '10+']]) {
      line(`  ${name}`, scored.filter((a) => a.nArms >= lo && a.nArms <= hi));
    }
    line('  >=6', scored.filter((a) => a.nArms >= 6));
    L.push(`winning body textually identical to the hidden one: ${verbatimShare(scored)}`);
    if (filled) {
      const why = {};
      for (const a of scored.filter((x) => !x.reachable)) why[a.fillWhy || '?'] = (why[a.fillWhy || '?'] || 0) + 1;
      L.push(`not filled, by reason: ${Object.entries(why).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      const unmeasured = scorable.filter((a) => typeof a.reachable !== 'boolean' && a.fillWhy);
      if (unmeasured.length) L.push(`NOT MEASURED (left out of every rate above): ${unmeasured.length}  ${[...new Set(unmeasured.map((a) => a.fillWhy))].join(', ')}`);
      const all = scored.map((a) => a.fillSecs);
      L.push(`time per case attempted: median ${median(all).toFixed(1)} s, max ${Math.max(...all).toFixed(0)} s`);
    }
    const tabled = scored.filter((a) => typeof a.tableAgrees === 'boolean');
    L.push(`assignment table agrees with the arm-level verdict: ${pct(tabled.filter((a) => a.tableAgrees).length, tabled.length)}  (structural problems: ${tabled.reduce((n, a) => n + (a.tableProblems || 0), 0)})`);
  }
  L.push('');
  L.push(`checks: ${arms.reduce((n, a) => n + (a.checks || 0), 0)}`);
  return L.join('\n');
}

// ── entry ────────────────────────────────────────────────────────────────────
function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const rel = (abs) => path.relative(root, abs).replace(/\\/g, '/');
const minArms = Number(opt('--min-arms', '2')) || 2;
const onlyRecs = opt('--recs', null) ? new Set(opt('--recs').split('|').filter(Boolean)) : null;
const strategyName = opt('--strategy', null);
if (strategyName && !STRATEGIES[strategyName] && !FILLERS[strategyName]) {
  console.error(`unknown strategy ${strategyName}; have: ${Object.keys(STRATEGIES).join(', ')}`);
  process.exit(2);
}

if (opt('--report', null)) {
  const rows = fs.readFileSync(opt('--report'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  console.log(report(rows, strategyName));
} else if (opt('--annotate', null)) {
  // Backfill the result class onto a ledger written before rows carried it. Reads
  // sources only; no check is run and no verdict changes.
  const src = path.resolve(root, opt('--annotate'));
  const rows = fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const kindOf = new Map(rows.filter((r) => r.kind === 'unit').map((r) => [r.unit, r.unitKind]));
  const programs = new Map();
  const programOf = (unit) => {
    if (!programs.has(unit)) {
      const abs = path.resolve(root, unit);
      const code = kindOf.get(unit) === 'cfg'
        ? assembleCfgProgram(fs.readFileSync(abs, 'utf8'), (entry) => {
          try { return fs.readFileSync(path.join(path.dirname(abs), entry), 'utf8'); } catch (_) { return null; }
        }).code
        : fs.readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n');
      programs.set(unit, { code, recs: recsWithArms(code) });
    }
    return programs.get(unit);
  };
  let filled = 0;
  for (const r of rows) {
    if ((r.kind !== 'rec' && r.kind !== 'arm') || r.skipped) continue;
    const { code, recs } = programOf(r.unit);
    // A development can declare one name twice in different members; the arm count
    // tells them apart well enough for a label.
    const named = recs.filter((x) => x.name === r.rec);
    const rec = named.find((x) => x.arms.length === (r.arms || r.nArms)) || named[0];
    if (!rec) continue;
    Object.assign(r, resultClassOf(code, rec));
    filled += 1;
  }
  const dest = path.resolve(root, opt('--out', opt('--annotate')));
  fs.writeFileSync(dest, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(report(rows, strategyName));
  console.log(`annotated ${filled} rows -> ${rel(dest)}`);
} else if (opt('--cfg', null)) {
  // Worker: one assembled development. Only recs inside the listed members are
  // measured; the rest of the development is there to make them check.
  const cfg = path.resolve(opt('--cfg'));
  const dir = path.dirname(cfg);
  const asm = assembleCfgProgram(fs.readFileSync(cfg, 'utf8'), (entry) => {
    try { return fs.readFileSync(path.join(dir, entry), 'utf8'); } catch (_) { return null; }
  });
  const wanted = new Set(String(opt('--members', '')).split('|').filter(Boolean));
  const fileOf = (rec) => {
    const span = asm.files.find((f) => rec.from >= f.start && rec.from < f.end);
    if (!span) return null;
    const member = rel(path.join(dir, span.path));
    return !wanted.size || wanted.has(member) ? member : null;
  };
  const rows = await measureProgram(asm.code, rel(cfg), { minArms, strategyName, unitKind: 'cfg', fileOf, onlyRecs });
  for (const r of rows) process.stdout.write(JSON.stringify(r) + '\n');
  if (!flag('--quiet')) console.error(`${report(rows, strategyName)}\nchecker reloads: ${reloads}; unresolved members: ${asm.unresolved.length}`);
} else if (opt('--file', null)) {
  // Worker: one program, rows to stdout.
  const f = opt('--file');
  const code = fs.readFileSync(f, 'utf8').replace(/\r\n?/g, '\n');
  const rows = await measureProgram(code, rel(path.resolve(f)), { minArms, strategyName, onlyRecs });
  for (const r of rows) process.stdout.write(JSON.stringify(r) + '\n');
  if (!flag('--quiet')) console.error(report(rows, strategyName) + `\nchecker reloads: ${reloads}`);
} else {
  // Parent: one process per unit. A candidate may send the checker into a loop, and
  // an in-process call cannot be timed out; a child can be killed.
  const scanRoot = path.resolve(root, opt('--root', 'Beluga-W/examples'));
  const seen = new Set();
  let files = walk(scanRoot, '.bel').sort().filter((f) => {
    const h = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });
  const limit = Number(opt('--limit', '0')) || 0;
  if (limit) files = files.slice(0, limit);
  const jobs = Number(opt('--jobs', '4')) || 4;
  const unitTimeoutMs = (Number(opt('--unit-timeout', '1800')) || 1800) * 1000;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outPath = path.resolve(root, opt('--out', `results/corpus/case-loo-${strategyName || 'controls'}-${stamp}.jsonl`));
  const redoFrom = opt('--redo-skipped', null);
  const redoRows = redoFrom
    ? fs.readFileSync(path.resolve(root, redoFrom), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : null;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, '');

  const all = [];
  const started = Date.now();
  const secs = () => ((Date.now() - started) / 1000).toFixed(0);

  // unit: { label, unitKind, args }
  const runUnit = (unit) => new Promise((resolve) => {
    const childArgs = [fileURLToPath(import.meta.url), ...unit.args, '--quiet', '--min-arms', String(minArms)];
    if (strategyName) childArgs.push('--strategy', strategyName);
    // Every knob reaches the workers, or a child silently measures the defaults.
    for (const knob of ['--hide', '--orca-steps', '--orca-secs']) if (opt(knob, null)) childArgs.push(knob, opt(knob));
    const child = spawn(process.execPath, childArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let err = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill(); }, unitTimeoutMs);
    child.on('close', (codeNum, signal) => {
      clearTimeout(timer);
      const rows = [];
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue;
        try { rows.push(JSON.parse(line)); } catch (_) { /* a torn last line from a killed child */ }
      }
      if (signal || codeNum) {
        // The unit row a killed child did emit says "checks"; what happened after is
        // recorded as its own row so neither fact is lost.
        rows.push({
          unit: unit.label, file: unit.label, kind: 'unit', unitKind: unit.unitKind,
          status: signal ? 'timeout' : 'crashed', detail: err.slice(-300),
        });
      }
      fs.appendFileSync(outPath, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
      all.push(...rows);
      resolve();
    });
  });
  const runAll = async (units, what) => {
    let next = 0;
    let done = 0;
    const pump = async () => {
      while (next < units.length) {
        const u = units[next]; next += 1;
        await runUnit(u);
        done += 1;
        if (done % 20 === 0 || done === units.length) console.error(`  ${what}: ${done}/${units.length}  (${secs()}s)`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(jobs, units.length) }, pump));
  };

  // Redo: re-measure only the proofs an earlier run skipped for one reason, and write
  // the merged ledger. A fix to the reader should not cost a whole corpus run.
  if (redoRows) {
    // What to redo, by any of three selectors (default: proofs skipped as unreadable):
    //   --reason <skip>       proofs a run skipped for that reason
    //   --fill-why <a,b>      proofs with any case whose filler failed for one of those reasons
    //   --crashed             whole units whose worker crashed or timed out
    const reason = opt('--reason', null);
    const fillWhys = opt('--fill-why', null) ? new Set(opt('--fill-why').split(',')) : null;
    const crashed = flag('--crashed');
    const skipReason = !reason && !fillWhys && !crashed ? 'unreadable-arm' : reason;
    const recKey = (r) => `${r.unit}|${r.file}|${r.rec}`;
    const chosen = new Map();
    for (const r of redoRows) {
      const hit = (skipReason && r.kind === 'rec' && r.skipped === skipReason)
        || (fillWhys && r.kind === 'arm' && fillWhys.has(r.fillWhy));
      if (hit) chosen.set(recKey(r), r);
    }
    const deadUnits = new Set(crashed
      ? redoRows.filter((r) => r.kind === 'unit' && (r.status === 'crashed' || r.status === 'timeout')).map((r) => r.unit)
      : []);
    const kindOf = new Map(redoRows.filter((r) => r.kind === 'unit').map((r) => [r.unit, r.unitKind]));
    const byUnit = new Map();
    for (const r of chosen.values()) {
      if (deadUnits.has(r.unit)) continue;
      if (!byUnit.has(r.unit)) byUnit.set(r.unit, { recs: new Set(), files: new Set() });
      byUnit.get(r.unit).recs.add(r.rec);
      byUnit.get(r.unit).files.add(r.file);
    }
    for (const u of deadUnits) byUnit.set(u, null);
    const units = [...byUnit].map(([label, u]) => {
      const abs = path.resolve(root, label);
      const recs = u ? ['--recs', [...u.recs].join('|')] : [];
      const members = u ? ['--members', [...u.files].join('|')] : [];
      return kindOf.get(label) === 'cfg'
        ? { label, unitKind: 'cfg', args: ['--cfg', abs, ...members, ...recs] }
        : { label, unitKind: 'file', args: ['--file', abs, ...recs] };
    });
    console.error(`redo: ${chosen.size} proofs and ${deadUnits.size} whole units, in ${units.length} runs`);
    await runAll(units, 'redo');
    const replaced = (r) => deadUnits.has(r.unit) || ((r.kind === 'rec' || r.kind === 'arm') && chosen.has(recKey(r)));
    const merged = redoRows
      .filter((r) => !replaced(r))
      .concat(all.filter((r) => deadUnits.has(r.unit) || r.kind !== 'unit' || r.status === 'timeout' || r.status === 'crashed'));
    fs.writeFileSync(outPath, merged.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(report(merged, strategyName));
    console.log(`redone: ${chosen.size} proofs, ${deadUnits.size} whole units`);
    console.log(`rows: ${rel(outPath)}   wall: ${secs()}s`);
    process.exit(0);
  }

  // Phase 1: every file on its own.
  await runAll(files.map((f) => ({ label: rel(f), unitKind: 'file', args: ['--file', f] })), 'files');

  // Phase 2: a file that does not check alone is usually a member of a development.
  // Each such file is claimed by ONE cfg (sources.cfg first), and that cfg measures
  // only the members it claimed, so no proof is counted twice.
  const failing = new Set(all
    .filter((r) => r.kind === 'unit' && r.unitKind === 'file' && r.status === 'does-not-check')
    .map((r) => r.unit));
  const cfgFiles = walk(scanRoot, '.cfg').sort((a, b) => {
    const pa = path.basename(a) === 'sources.cfg' ? 0 : 1;
    const pb = path.basename(b) === 'sources.cfg' ? 0 : 1;
    return pa - pb || a.localeCompare(b);
  });
  const cfgUnits = [];
  for (const cfg of cfgFiles) {
    const dir = path.dirname(cfg);
    const asm = assembleCfgProgram(fs.readFileSync(cfg, 'utf8'), (entry) => {
      try { return fs.readFileSync(path.join(dir, entry), 'utf8'); } catch (_) { return null; }
    });
    const claim = asm.files.map((f) => rel(path.join(dir, f.path))).filter((m) => failing.has(m));
    if (!claim.length) continue;
    for (const m of claim) failing.delete(m);
    cfgUnits.push({ label: rel(cfg), unitKind: 'cfg', args: ['--cfg', cfg, '--members', claim.join('|')] });
  }
  if (cfgUnits.length) await runAll(cfgUnits, 'cfg developments');

  console.log(report(all, strategyName));
  console.log(`files that check neither alone nor in any cfg: ${failing.size}`);
  const bad = all.filter((r) => r.kind === 'unit' && (r.status === 'timeout' || r.status === 'crashed'));
  console.log(`units timed out or crashed: ${bad.length}${bad.length ? '  ' + bad.map((b) => `${b.unit} (${b.status})`).slice(0, 8).join(', ') : ''}`);
  console.log(`rows: ${rel(outPath)}   wall: ${secs()}s`);
}
