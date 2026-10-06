// case-fill.mjs — case completion's engine room. Pure: the checker is injected as
// `check(code) -> Promise<{ ok, output }>`, so the same code runs in the editor's worker
// and in the harness (scripts/case-harness.mjs), and what is measured is what ships.
//
//   eligibility(code, rec)   who is filled without being asked
//   planCase(code, rec, check)   every missing case as a parked hole `?cf_k`
//   fillRow(plan, k, check, opts)   one row: the signature lookup, then Orca focused on it
//   slicesFor / resultClassOf   the smallest program a proof checks in; what it returns
//
// ⛔ A candidate is never trusted, only checked; ⛔ nothing here writes a `/ total /`.

import { parseCompType } from './prover-comp-type.mjs';
import { decomposeContextual, headOfConclusion, familyIndexSorts } from './hole-split.mjs';
import { stripLfComments } from './prover-certify.mjs';
import { armRuleHead, splitArm } from './case-pieces.mjs';
import { strengthOf, STRENGTH } from './case-assignment.mjs';
import { parseHoles } from './hole-report.mjs';
import { belJarSplit } from './split-skeleton.mjs';
import { transportArm } from './case-lookup.mjs';
import { proveProgram } from './prover-orchestrator.mjs';
import { theoremUnderProof } from './prover-hyp.mjs';

// ── what a `checked` is evidence OF ──────────────────────────────────────────
// "Beluga accepts it" certifies a case only when the declared type pins the answer.
// For a theorem it does: any derivation of the stated judgment is a proof. For a
// program it does not: `copy : [g |- tm] -> [g |- tm]` accepts `copy (app U V) =
// suc (copy U)`, which is well-typed, covering, terminating, and wrong. Measured
// 2026-10-01: the floor "recovers" 54% of cases in such programs and only a quarter
// of those are what the author wrote.
//
// ⚠ A PROXY, not a decision procedure. It reads the result type:
//   data     a boxed term of an UNINDEXED family            -> a program
//   indexed  a boxed derivation of an INDEXED family        -> usually a theorem, but
//            intrinsically typed data (`exp T`) lands here too
//   comp     a computation-level type (`Red [g |- M]`, `Option`)
// Rows carry it so every number can be read per class; no class is hidden in a blend.
export function typeTextOf(recText) {
  const s = stripLfComments(recText);
  const colon = s.indexOf(':');
  if (colon < 0) return '';
  let depth = 0;
  for (let i = colon + 1; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (depth === 0 && c === '=' && s[i + 1] !== '>') return s.slice(colon + 1, i);
  }
  return '';
}
export function resultClassOf(code, rec) {
  const ct = parseCompType(typeTextOf(code.slice(rec.from, rec.to)));
  const concl = ct && ct.conclusion ? String(ct.conclusion).trim() : '';
  const dc = concl ? decomposeContextual(concl) : null;
  if (!dc || !dc.boxed) return { result: 'comp', resultFamily: null };
  const fam = headOfConclusion(dc.concl);
  const sorts = familyIndexSorts(code, fam);
  if (sorts === null) return { result: 'unresolved', resultFamily: fam };
  return { result: sorts.length ? 'indexed' : 'data', resultFamily: fam };
}

// ── slicing ──────────────────────────────────────────────────────────────────
// Every candidate costs a check of the whole program, and a development spends most
// of that on proofs that have nothing to do with the one under test. Beluga's
// signature is sequential, so a proof needs only what precedes it; and of the proofs
// that precede it, only the ones it names, transitively. Everything that is not a
// proof (the signature, schemas, pragmas) is kept verbatim.
//
// ⛔ A slice is a guess until it CHECKS. Each is tried in turn (pruned, then the
// plain prefix, then the whole program) and the first that checks is used; the
// per-arm controls then run on that slice, so a wrong slice cannot score an arm.
const tokensOf = (text) => new Set(String(text).split(/[\s()[\]{}.,;:|\\]+/).filter(Boolean));
const isProofDecl = (d) => d.kind === 'rec' || d.kind === 'proof';
function definedNames(d) {
  const names = d.name ? [d.name] : [];
  for (const m of d.text.matchAll(/\band\s+(?:rec\s+|proof\s+)?([^\s:]+)\s*:/g)) names.push(m[1]);
  return names;
}
export function slicesFor(code, decls, rec) {
  const whole = { prog: code, shift: 0, how: 'full' };
  const di = decls.findIndex((d) => rec.from >= d.from && rec.from < d.to);
  if (di < 0) return [whole];
  const target = decls[di];
  // ⛔ A proof's calls to ITSELF are not references to an earlier proof of the same
  // name. A development can declare a name twice (shadowing: `vsound` in two files of
  // one cfg), and keeping the earlier one because the target recurses put two
  // declarations of one name in the slice; Orca then worked on the wrong one.
  const own = new Set(definedNames(target));
  const need = new Set([...tokensOf(target.text)].filter((t) => !own.has(t)));
  const kept = [];
  // Nearest first: a kept proof can only name proofs before it, which this pass has
  // not reached yet.
  for (let i = di - 1; i >= 0; i -= 1) {
    const d = decls[i];
    if (isProofDecl(d)) {
      if (!definedNames(d).some((n) => need.has(n))) continue;
      for (const t of tokensOf(d.text)) need.add(t);
    }
    kept.unshift(d.text);
  }
  const prefix = kept.length ? kept.join('\n') + '\n' : '';
  return [
    { prog: prefix + target.text + '\n', shift: prefix.length - target.from, how: 'pruned' },
    { prog: code.slice(0, target.to) + '\n', shift: 0, how: 'prefix' },
    whole,
  ];
}

// ── who is filled automatically ──────────────────────────────────────────────
// Only where a `Checked` means a proof: the declaration is `total` (Beluga checks
// coverage and termination), its result is a derivation of an indexed family (the
// theorem proxy above), and its outer case is a split on rules (distinct heads; a
// repeated head is a nested pattern, where "rule" is the wrong word). Everything else
// is filled only when asked, and says what was not checked.
export function eligibility(code, rec) {
  const strength = strengthOf(code.slice(rec.from, rec.to), code);
  const { result } = resultClassOf(code, rec);
  const heads = (rec.arms || []).map((a) => armRuleHead(a.text)).filter(Boolean);
  const distinctHeads = heads.length > 0 && new Set(heads).size === heads.length;
  const auto = strength === STRENGTH.total && result === 'indexed' && distinctHeads;
  return { auto, strength, specification: result, distinctHeads };
}

// ── planning: every missing case, parked ─────────────────────────────────────
// Missing cases go into the program as `pattern => ?cf_k`, NAMED holes. Holes satisfy
// coverage, so the planned program checks, and a run focused on one row ignores the
// others by name (`ignoreHolePrefix` in proveProgram).
export const PARK = 'cf_';

const lineColOf = (code, offset) => {
  const before = code.slice(0, offset);
  const line = (before.match(/\n/g) || []).length + 1;
  return { line, col: offset - before.lastIndexOf('\n') };
};

// The arms of a split skeleton (`case x of\n| pat =>\n  ?\n| …`), in order.
function skeletonPatterns(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/^[ \t]*\| (.*) (?:=>|⇒)$/gm)) out.push(m[1].trim());
  return out;
}

// What a pattern covers: its rule; for a parameter variable, its projection with the
// variable's own name and any substitution left out (`#p.2` and `#u.2[..]` are one case);
// else its own text (a named context entry, a context shape).
export function keyOfPattern(pattern) {
  // One key whichever turnstile the text uses: Beluga and the split print `|-`, a file
  // typed in BelJar reads `⊢`.
  const p = String(pattern || '').replace(/⊢/g, '|-');
  if (/#/.test(p)) return p.replace(/#[\p{L}\p{N}_']*/gu, '#').replace(/\[\.\.\]/g, '').replace(/\s+/g, '');
  return armRuleHead(`${p} => ?`) || p.replace(/\s+/g, ' ');
}

// First error line in checker output (a location header followed by an error).
function firstErrorLine(output) {
  const lines = String(output || '').split('\n');
  for (let i = 0; i < lines.length - 1; i += 1) {
    const m = /File\s+"[^"]*",\s*line\s+(\d+)/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j += 1) {
      if (/^\s*error\b/i.test(lines[j])) return Number(m[1]);
      if (/File\s+"[^"]*",\s*line\s+\d+/.test(lines[j])) break;
    }
  }
  return null;
}

// Only a top-level `case` takes the arms after it: an arm appended after a body that ends
// in a bare `case` would be read as one of ITS arms. `let`, `fn` and `mlam` take none.
export function bodyIsClosed(armText) {
  const sp = splitArm(armText);
  if (!sp) return false;
  let depth = 0; let flat = '';
  for (const c of sp.body) {
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (depth === 0) flat += c;
  }
  return !/\bcase\b/.test(flat);
}

/**
 * The cases a coverage failure lists as not covered, as patterns that can be written:
 * the text after each item's top-level turnstile (there is one; turnstiles inside a type are
 * nested), with the `_` Beluga prints for the context variable replaced by the proof's
 * own (`ctxVar`). A pattern carrying an internal name (`"i`) cannot be written and is
 * left out.
 */
export function coverageMissing(output, ctxVar) {
  const text = String(output || '');
  const at = text.indexOf('NOT COVERED');
  if (at < 0) return [];
  const end = text.indexOf('\n##', at);
  const block = text.slice(text.indexOf('\n', at) + 1, end < 0 ? text.length : end);
  const out = [];
  for (const item of block.split(/^\(\d+\)/m).map((s) => s.trim()).filter(Boolean)) {
    let depth = 0; let cut = -1;
    for (let i = 0; i < item.length - 1; i += 1) {
      const c = item[i];
      if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') depth -= 1;
      else if (depth === 0 && c === '|' && item[i + 1] === '-') cut = i + 2;
    }
    if (cut < 0) continue;
    let pat = item.slice(cut).replace(/\s+/g, ' ').trim();
    if (!pat || pat.includes('"')) continue;
    const cv = ctxVar || itemContextVar(item.slice(0, cut - 2));
    if (cv) pat = pat.replace(/^\[\s*_(?=\s*(?:,|\|-))/, `[${cv}`);
    out.push(pat);
  }
  return out;
}

// The context variable an item's own contexts name, for when no authored arm does (a
// proof whose other arms all have empty contexts): a parameter item says `#(g |- …)`, a
// context split declares `g : sctx`.
function itemContextVar(prefix) {
  const block = /#\(\s*(\p{Ll}[\p{L}\p{N}_']*)\s*(?:,|\|-)/u.exec(prefix);
  if (block) return block[1];
  const decl = /(?:^|[\s,;])(\p{Ll}[\p{L}\p{N}_']*)\s*:\s*\p{Ll}[\p{L}\p{N}_']*\s*(?=[,;]|$)/u.exec(prefix);
  return decl ? decl[1] : null;
}

// The other spelling of a parameter projection: with or without the substitution.
function paramVariant(p) {
  const v = p.replace(/(#[\p{L}\p{N}_']*\.[\p{L}\p{N}_']+)(?!\[)/u, '$1[..]');
  return v;
}

// 1. The model's split: the cases the editor's own Split command would write, minus the
// authored ones. Only for a case on a variable; everything else is left to step 2.
async function modelRows(code, oc, check, have) {
  const none = (why) => ({ rows: [], order: new Map(), why });
  if (!oc.scrutinee || !/^[\p{L}_][\p{L}\p{N}_']*$/u.test(oc.scrutinee)) return none('scrutinee-not-a-variable');
  // Beluga's own view of the scrutinee: hole the whole case and read its context.
  const holedCase = code.slice(0, oc.from) + '?' + code.slice(oc.to);
  const at = lineColOf(holedCase, oc.from);
  const probe = await check(holedCase);
  const hole = parseHoles(probe.output || '').find((h) => h.line === at.line && h.col === at.col);
  if (!hole) return none('no-goal-at-case');
  const note = {};
  const annotated = skeletonPatterns(belJarSplit(holedCase, hole, oc.scrutinee, note));
  const bare = skeletonPatterns(belJarSplit(holedCase, hole, oc.scrutinee, {}, { annotate: false }));
  if (!annotated.length) return none(note.reason || 'no-split');
  const order = new Map(annotated.map((p, i) => [keyOfPattern(p), i]));
  // Authored proofs project parameter variables by field NUMBER (`#p.2`), the model by
  // field NAME (`#p.h[..]`): when the author wrote any, the parameter cases still missing
  // are left to the coverage list, which names them exactly.
  const authorHasParam = [...have].some((k) => k.includes('#'));
  const rows = annotated
    .map((pattern, i) => ({ pattern, bare: bare[i] || pattern, key: keyOfPattern(pattern), index: i }))
    .filter((r) => !have.has(r.key) && !(authorHasParam && r.key.includes('#')));
  return { rows, order, why: null };
}

// Lay the rows out in the ORIGINAL program: each before the next authored arm in
// signature order, else after the last arm if its body is closed, else before it. With
// `catchAll`, a parked `_ => ?cf_rest` goes last (its body's `case` parenthesised if the
// last arm's is open), so cases nobody could build do not stop the others being filled.
function layout(code, authored, specs, order, catchAll) {
  const barBefore = (arm) => {
    let i = arm.from - 1;
    while (i >= 0 && /\s/.test(code[i])) i -= 1;
    return code[i] === '|' ? i : null;
  };
  const lineStart = (pos) => code.lastIndexOf('\n', pos - 1) + 1;
  const firstBar = authored.map(barBefore).find((b) => b != null);
  const indent = firstBar != null ? code.slice(lineStart(firstBar), firstBar).replace(/\S/g, ' ') : '';
  const last = authored[authored.length - 1];
  const lastOpen = !bodyIsClosed(last.text);
  const rank = (key) => (order.has(key) ? order.get(key) : -1);
  const inserts = [];
  specs.forEach((s, n) => {
    const armText = `${s.pattern} =>\n${indent}  ?${s.hole}`;
    const nextArm = Number.isFinite(s.index) ? authored.find((a) => a.key && rank(a.key) > s.index) : null;
    const target = nextArm || (lastOpen ? last : null);
    if (target) {
      const bar = barBefore(target);
      if (bar != null) inserts.push({ at: bar, seq: n, text: `| ${armText}\n${indent}`, lead: 2, spec: s, armText });
      else inserts.push({ at: target.from, seq: n, text: `${armText}\n${indent}| `, lead: 0, spec: s, armText });
    } else {
      inserts.push({ at: last.to, seq: n, text: `\n${indent}| ${armText}`, lead: 1 + indent.length + 2, spec: s, armText });
    }
  });
  if (catchAll) {
    if (lastOpen) {
      const sp = splitArm(last.text);
      inserts.push({ at: last.to - sp.body.length, seq: -1, text: '(' });
      inserts.push({ at: last.to, seq: 1e9, text: '\n)' });
    }
    inserts.push({ at: last.to, seq: 1e9 + 1, text: `\n${indent}| _ =>\n${indent}  ?${PARK}rest` });
  }
  inserts.sort((a, b) => a.at - b.at || a.seq - b.seq);
  let out = ''; let prev = 0; const rows = [];
  for (const ins of inserts) {
    out += code.slice(prev, ins.at);
    if (ins.spec) {
      const from = out.length + ins.lead;
      rows.push({
        key: ins.spec.key, rule: armRuleHead(`${ins.spec.pattern} => ?`), pattern: ins.spec.pattern,
        from, to: from + ins.armText.length, hole: ins.spec.hole, source: ins.spec.source,
      });
    }
    out += ins.text;
    prev = ins.at;
  }
  out += code.slice(prev);
  return { code: out, rows };
}

/**
 * Plan the missing cases of `rec` (a `recsWithArms` entry of `code`).
 * `check(code) -> Promise<{ ok, output }>`.
 * Returns { code, rows: [{ key, rule, pattern, from, to, hole, source }], dropped,
 *           partial, unbuilt, why }. `from`/`to` span a row's arm text (no bar).
 *
 * The cascade (beljar-architecture.mdc): the model's split first; then, for whatever
 * coverage still reports missing, Beluga's own list of the cases, transformed into
 * patterns and checked like everything else; then, for anything neither could build, a
 * parked catch-all so the rest can still be filled (`partial`). A row whose own pattern
 * fails is tried in its other spelling, then dropped; a dropped row whose absence leaves
 * a program that checks was an impossible case, and goes silently.
 */
export async function planCase(code, rec, check) {
  const oc = rec && rec.outerCase;
  if (!oc) return { code, rows: [], why: 'no-outer-case' };
  const authored = rec.arms.map((a) => {
    const sp = splitArm(a.text);
    return { ...a, key: sp ? keyOfPattern(sp.pattern) : null, pattern: sp ? sp.pattern : '' };
  });
  if (!authored.length) return { code, rows: [], why: 'no-arms' };
  const have = new Set(authored.map((a) => a.key).filter(Boolean));
  const ctxVar = authored
    .map((a) => (/^\[\s*(\p{Ll}[\p{L}\p{N}_']*)\s*(?:,|\|-|⊢)/u.exec(a.pattern) || [])[1])
    .find(Boolean) || null;

  const model = await modelRows(code, oc, check, have);
  let nextId = 0;
  const specs = model.rows.map((r) => ({ ...r, hole: `${PARK}${nextId++}`, source: 'model' }));
  const tried = new Set(specs.map((s) => s.key));
  const dropped = [];
  let planned = null;
  let res = null;
  for (let round = 0; round < 4; round += 1) {
    for (let guard = 0; guard < specs.length * 2 + 2; guard += 1) {
      planned = layout(code, authored, specs, model.order, false);
      res = await check(planned.code);
      if (res.ok) break;
      const errLine = firstErrorLine(res.output);
      const bad = planned.rows.find((r) => errLine != null
        && errLine >= lineColOf(planned.code, r.from).line && errLine <= lineColOf(planned.code, r.to).line);
      if (!bad) break;
      const i = specs.findIndex((s) => s.hole === bad.hole);
      const s = specs[i];
      if (!s.triedBare && s.bare && s.bare !== s.pattern) { s.pattern = s.bare; s.triedBare = true; } else { specs.splice(i, 1); dropped.push(bad); }
    }
    if (res.ok) return { code: planned.code, rows: planned.rows, dropped, why: specs.length ? null : 'nothing-missing' };
    if (!/COVERAGE|cover/i.test(res.output || '')) {
      return { code: planned.code, rows: planned.rows, dropped, unbuilt: true, why: 'program-error' };
    }
    const more = coverageMissing(res.output, ctxVar)
      .map((p) => ({ p, key: keyOfPattern(p) }))
      .filter(({ key }) => !have.has(key) && !tried.has(key));
    if (!more.length) break;
    for (const { p, key } of more) {
      tried.add(key);
      specs.push({ pattern: p, bare: paramVariant(p), key, index: Infinity, hole: `${PARK}${nextId++}`, source: 'coverage' });
    }
  }
  // Coverage still fails: park a catch-all so the cases that were built can be filled.
  planned = layout(code, authored, specs, model.order, true);
  res = await check(planned.code);
  if (res.ok) return { code: planned.code, rows: planned.rows, dropped, partial: true, why: 'some-cases-not-built' };
  return { code: planned.code, rows: planned.rows, dropped, unbuilt: true, why: 'cases-not-built' };
}

// ── filling one row ──────────────────────────────────────────────────────────
// The lookup first (instant), then Orca focused on this row's hole. A fill counts only
// if it changed nothing outside the row and the program checks again with no hole left
// in the row. ⛔ Nothing here writes a `/ total /`: `noMeasureSynthesis` is always on.
export async function fillRow(plan, k, check, opts = {}) {
  const row = plan.rows[k];
  const started = Date.now();
  let checks = 0;
  const counted = async (code) => { checks += 1; return check(code); };
  const before = plan.code.slice(0, row.from);
  const after = plan.code.slice(row.to);

  // 1. The lookup.
  if (!opts.noLookup && row.rule && opts.authored && opts.index) {
    for (const donor of opts.authored) {
      if (!donor.head) continue;
      const t = transportArm(donor.text, donor.head, row.rule, opts.index);
      if (!t.text) continue;
      const code = before + t.text + after;
      const res = await counted(code);
      if (res.ok && !holeInRange(code, res.output, before.length, before.length + t.text.length)) {
        return { ok: true, text: t.text, source: 'lookup', donor: donor.head, checks, secs: (Date.now() - started) / 1000 };
      }
    }
  }

  // 2. Orca, on this row only.
  const holed = before + plan.code.slice(row.from, row.to).replace(`?${row.hole}`, '?') + after;
  const thm = theoremUnderProof(`rec ${holed.slice(opts.recStart, row.from)}`);
  if (!thm) return { ok: false, why: 'theorem-unreadable', checks, secs: (Date.now() - started) / 1000 };
  const deadline = opts.deadlineMs ? started + opts.deadlineMs : null;
  let r;
  const prove = opts.prove || proveProgram; // injectable so the refusals can be tested
  try {
    r = await prove(holed, thm, counted, {
      maxSteps: opts.maxSteps || 15,
      certifyTrim: false,
      noMeasureSynthesis: true,
      requireProgress: true,
      ignoreHolePrefix: PARK,
      shouldCancel: () => (opts.shouldCancel && opts.shouldCancel()) || (deadline != null && Date.now() > deadline),
    });
  } catch (e) {
    return { ok: false, why: 'threw: ' + (e && e.message ? e.message : e), checks, secs: (Date.now() - started) / 1000 };
  }
  const secs = () => (Date.now() - started) / 1000;
  if (!r || !r.complete || typeof r.code !== 'string') {
    return { ok: false, why: (r && r.stuck && r.stuck.reason) || 'no-result', checks, secs: secs() };
  }
  // A COMPLETE with no move filled nothing: the run looked at another declaration.
  if (!(r.steps || []).length) return { ok: false, why: 'zero-move-complete', unmeasured: true, checks, secs: secs() };
  if (!r.code.startsWith(before) || !r.code.endsWith(after)) return { ok: false, why: 'touched-outside-the-case', checks, secs: secs() };
  const text = r.code.slice(before.length, r.code.length - after.length);
  const v = await counted(r.code);
  if (!v.ok || holeInRange(r.code, v.output, before.length, before.length + text.length)) {
    return { ok: false, why: 'failed-re-check', detail: String(v.output || '').slice(-400), text: text.slice(0, 400), checks, secs: secs() };
  }
  return { ok: true, text, source: 'orca', steps: r.steps.length, checks, secs: secs() };
}

// Does the checker report a hole (other than a parked one) inside [from, to) of `code`?
// Holes come back as line and column (1-based), so they are placed against the very
// text that was checked.
export function holeInRange(code, output, from, to) {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) if (code[i] === '\n') starts.push(i + 1);
  return parseHoles(output || '').some((h) => {
    const name = String(h.name || '').replace(/^\?/, '');
    if (name.startsWith(PARK)) return false;
    const off = (starts[h.line - 1] ?? Infinity) + (h.col - 1);
    return off >= from && off < to;
  });
}
