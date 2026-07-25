/** Accepted-move captions for UI / trace (kind-specific meta + lead line). */
import { headOfConclusion, conclusionOf } from './hole-split.mjs';

function letRhsOf(moveText) {
  const m = /^let\s+.*?=\s*([\s\S]*?)\s+in\b/.exec(String(moveText || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

function moveHead(text) {
  return String(text || '').split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 90);
}

export { letRhsOf, moveHead };

/** Structured metadata for an accepted move. */
export function stepMeta(mv, effText, hole) {
  const t = String(effText || '');
  const meta = { kind: mv.kind };
  meta.goalHead = headOfConclusion(conclusionOf(hole && hole.goal || '')) || null;
  const names = new Set([
    ...((hole.meta || []).map((m) => m && m.name)),
    ...((hole.ctx || []).map((c) => c && c.name)),
  ].filter(Boolean));
  const used = new Set();
  for (const m of t.matchAll(/[[\s|]([\p{L}_][\p{L}\p{N}_']*)(?=[\s\]])/gu)) {
    if (names.has(m[1])) used.add(m[1]);
  }
  meta.uses = [...used];
  const produced = new Set();
  for (const m of t.matchAll(/let\s+\[[^\]]*?(?:\|-|⊢)\s*([\s\S]*?)\]/g)) {
    for (const v of String(m[1]).match(/\p{Lu}[\p{L}\p{N}_']*/gu) || []) produced.add(v);
  }
  meta.binds = [...produced];
  if (mv.kind === 'split') { // GENERAL: move-kind tag, not a name
    meta.scrutinee = mv.scrutinee || null;
    meta.arms = (t.match(/^\s*\|/gm) || []).length;
    meta.annotated = /\]\s*:\s*\[/.test(t);
    meta.armPatterns = [];
    for (const line of t.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      const s0 = line.indexOf('[');
      if (s0 < 0) continue;
      let d = 0;
      let e0 = -1;
      for (let i = s0; i < line.length; i += 1) {
        if (line[i] === '[') d += 1;
        else if (line[i] === ']') { d -= 1; if (d === 0) { e0 = i; break; } }
      }
      if (e0 > s0) meta.armPatterns.push(line.slice(s0, e0 + 1));
    }
  } else if (mv.kind === 'synth') { // GENERAL: move-kind tag, not a name
    const lines = t.split('\n').filter((l) => l.trim());
    const chain = [];
    for (const l of lines) {
      const call = /=\s*([\p{L}_][\p{L}\p{N}_']*)\s/u.exec(l) || /^([\p{L}_][\p{L}\p{N}_']*)\s/u.exec(l.trim());
      if (call && !['let', 'impossible', 'in'].includes(call[1])) chain.push(call[1]);
      else if (/^impossible\b/.test(l.trim())) chain.push('impossible');
    }
    meta.chain = chain;
    meta.refutation = /\bimpossible\b/.test(t);
  } else if (mv.kind === 'recurse' || mv.kind === 'lemma' || mv.kind === 'invert') { // GENERAL: move-kind tags
    const rhs = letRhsOf(t);
    meta.callee = rhs ? (rhs.split(/[\s[]/)[0] || null) : null;
    const pat = /let\s+\[[^\]]*?(?:\|-|⊢)\s*([\p{L}_][\p{L}\p{N}_']*)/u.exec(t);
    meta.pattern = pat ? pat[1] : null;
  } else if (mv.kind === 'impossible') { // GENERAL: move-kind tag, not a name
    const h = /impossible\s+\[?[^\]|]*(?:\|-|⊢)?\s*([\p{L}_][\p{L}\p{N}_']*)/u.exec(t);
    meta.refuted = h ? h[1] : null;
  } else if (mv.kind === 'fill') {
    meta.filler = moveHead(mv.text || t);
  } else if (mv.kind === 'intro') {
    const introduced = [];
    for (const m of t.matchAll(/\b(?:fn|mlam)\s+([\p{L}_][\p{L}\p{N}_']*)/gu)) introduced.push(m[1]);
    meta.introduced = introduced;
  }
  return meta;
}

/** Brief lead line for an accepted move. */
export function stepLead(mv, meta, hole) {
  const goalHead = meta.goalHead || headOfConclusion(conclusionOf(hole.goal || '')) || 'the goal';
  switch (mv.kind) {
    case 'synth': {
      const links = (meta.chain || []).filter((c) => c !== 'impossible');
      const n = links.length || (meta.chain || []).length;
      return meta.refutation
        ? `refutation closing ${goalHead}`
        : `${n}-step chain closing ${goalHead}`;
    }
    case 'split':
      return `case on ${meta.scrutinee || 'the scrutinee'}`;
    case 'recurse':
      return 'induction hypothesis';
    case 'invert':
      return `inverted ${meta.uses[0] || 'a hypothesis'}`;
    case 'lemma':
      return `applied ${meta.callee || 'lemma'}`;
    case 'impossible':
      return `refuted ${meta.refuted || 'the hypothesis'}`;
    case 'fill':
      return `closed ${goalHead}`;
    case 'intro':
      return "opened the goal's binders";
    default:
      return mv.rationale || 'made a move';
  }
}
