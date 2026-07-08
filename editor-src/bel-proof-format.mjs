// Pretty-print a generate-and-verify proof BODY (the text the search splices over
// a `?` hole) into readable, canonically-glyphed Beluga — so a committed proof is
// idiomatic, not the sprawl the raw splicer emits.
//
// The engine assembles bodies by concatenating move texts, so indentation drifts
// (a nested `let` lands at a fixed column, arms sit at mixed depths). This is a
// STRUCTURAL re-layout driven by the proof's own delimiters — `fn`/`mlam` binders,
// `case … of`, `|`-arms, `let … in` chains, `(` groups — never a per-theorem
// template. Pure: text in, text out.

import { expandBelAliases } from './bel-aliases.mjs';

const INDENT = '  ';

// Tokenize into a flat stream of structural tokens + atoms, tracking nothing but
// what layout needs: arm bars, arrows, `let`/`in`, `case`/`of`, parens/brackets.
// We work line-oriented on the RAW body: the search already emits one logical unit
// per line (an arm pattern, a `let … in`, a result box), just at wrong indents.
// So we re-indent by structural depth rather than re-flowing tokens.

// Bracket/paren depth contributed by a line (unclosed opens minus closes),
// ignoring brackets inside the line's own balanced pairs is unnecessary — we only
// need the running delta.
function bracketDelta(line) {
  let d = 0;
  for (const ch of line) {
    if (ch === '(' || ch === '[' || ch === '{') d += 1;
    else if (ch === ')' || ch === ']' || ch === '}') d -= 1;
  }
  return d;
}

// Re-indent the proof body. Depth rules, each from a delimiter the proof language
// guarantees:
//   • a `| pat =>` arm sits at the current CASE depth;
//   • an arm's body (everything until the next `|` at that depth) is one deeper;
//   • a `let … in` stays at the body depth (siblings align — the fix for the
//     mis-indented second `let`); its trailing `?`-replacement body follows at the
//     same depth (a let is not a block, the idiom is flat `let … in let … in e`);
//   • a `case … of` opens a new arm depth for the `|`s that follow;
//   • unbalanced `(`/`[` continuations indent one deeper until they close.
export function formatProofBody(rawBody, opts = {}) {
  const canon = opts.canonicalGlyphs === false ? String(rawBody ?? '') : expandBelAliases(String(rawBody ?? ''));
  const base = opts.baseIndent || '';
  // Normalize: drop blank lines, trim each line, keep a `/ total … /` prefix line.
  const lines = canon.split('\n').map((l) => l.trim()).filter((l) => l.length);
  if (!lines.length) return base;

  const out = [];
  // caseStack: indent unit (number of INDENT levels) at which the current case's
  // arms live. Pushed on `case … of`, popped when we dedent past it (a `)` that
  // closed the case group, or end of input).
  const caseArmLevel = []; // stack of arm indent levels
  let level = 0; // current logical indent level (for arm bodies / continuations)
  let contDepth = 0; // running bracket depth carried across lines

  const pushLine = (lvl, text) => out.push(base + INDENT.repeat(Math.max(0, lvl)) + text);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // A totality annotation prints at the base, alone.
    if (/^\/\s*(total|trust)\b/.test(line)) { pushLine(0, line); continue; }

    // Leading binders `fn f => …` / `mlam g => …`: keep on one line at base.
    if (/^(fn|mlam)\b/.test(line) && !/=>\s*\S/.test(line.replace(/^(fn\s+\S+\s*=>\s*)+/, ''))) {
      // a pure binder chain (optionally ending in `case … of`)
      pushLine(0, line);
      if (/\bcase\b[\s\S]*\bof\b\s*$/.test(line)) caseArmLevel.push(1);
      contDepth = 0;
      continue;
    }

    if (contDepth > 0) {
      // Continuation of an unclosed group — indent one past current.
      pushLine(level + 1, line);
      contDepth += bracketDelta(line);
      continue;
    }

    // An arm bar: `| pat =>` (possibly with an inline body after `=>`).
    if (line[0] === '|') {
      const armLvl = caseArmLevel.length ? caseArmLevel[caseArmLevel.length - 1] : 1;
      // Split an inline arm body onto its own indented line for readability, unless
      // it's a bare box/atom (short) — keep short ones inline.
      const arrowM = /^(\|[\s\S]*?=>)\s*([\s\S]*)$/.exec(line);
      if (arrowM && arrowM[2] && arrowM[2].length && !/\bcase\b/.test(arrowM[2]) && arrowM[2].length <= 60) {
        pushLine(armLvl, arrowM[1].trim() + ' ' + arrowM[2].trim());
        level = armLvl + 1;
      } else if (arrowM) {
        pushLine(armLvl, arrowM[1].trim());
        level = armLvl + 1;
        if (arrowM[2] && arrowM[2].length) {
          // inline `case … of` after the arrow → new nested case
          const rest = arrowM[2].trim();
          pushLine(level, rest);
          if (/\bcase\b[\s\S]*\bof\b\s*$/.test(rest)) caseArmLevel.push(level + 1);
          contDepth += bracketDelta(rest);
        }
      } else {
        pushLine(armLvl, line);
        level = armLvl + 1;
      }
      continue;
    }

    // `case … of` mid-body (a nested case): current level, open a new arm depth.
    if (/^\(?\s*case\b/.test(line) && /\bof\b\s*$/.test(line)) {
      pushLine(level, line);
      caseArmLevel.push(level + 1);
      contDepth += bracketDelta(line);
      continue;
    }

    // A `let … in` (possibly wrapping): print at the arm-body level; siblings align.
    if (/^let\b/.test(line)) {
      pushLine(level, line);
      contDepth += bracketDelta(line);
      continue;
    }

    // A lone closing `)` (closed a nested case group): dedent the case.
    if (/^\)+\s*;?\s*$/.test(line)) {
      if (caseArmLevel.length) caseArmLevel.pop();
      pushLine(Math.max(0, level - 1), line);
      continue;
    }

    // Default: a result expression (box / application) at the current body level.
    pushLine(level, line);
    contDepth += bracketDelta(line);
  }

  return out.join('\n');
}
