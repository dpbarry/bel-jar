// Suite-composition analysis, shared by the .cfg linter (anchors findings on cfg
// entry lines) and the settlement (anchors them in the offending .bel file, so
// the problem is visible where the user actually works — not only in the cfg).
//
// Two failure modes, both invisible to a per-file reading and both real-world
// foot-guns when chaining examples into one development:
//
//   1. PRAGMA LEAK — a global pragma (--nostrengthen/--coverage/--warncoverage)
//      on a later suite file is hoisted by Beluga above the WHOLE program, so
//      earlier files that don't carry it are silently re-checked under it.
//
//   2. SHADOWED USE — re-declaring an LF type is LEGAL shadowing in Beluga and
//      is harmless on its own: a later `LF o = imp|all|not` just wins, and a file
//      that only uses ITS OWN o is fine (e.g. fol-handbook.bel on top of fol.elf
//      — both define `o`, no problem). The error only appears when a STILL-LATER
//      file uses a constructor the redefinition shadowed AWAY (fol.bel uses
//      `atom`/`conj` from fol.elf's o, which fol-handbook.bel's o lacks → the
//      baffling "expected o, actual o"). So we flag the VICTIM file at its real
//      use, never the redefiner — re-declaring a type is not itself an error.
import { parser } from './beluga-parser.js';
import { Text } from '@codemirror/state';
import { walkTree } from './bel-walk.mjs';
import { firstIdentChild, isLFDatatypeHead } from './bel-tree-helpers.mjs';
import { GLOBAL_FILE_PRAGMA_LINE } from './project-prelude.mjs';

// The leading global pragma a file carries (with its 0-based line index), or null.
export function leadingGlobalPragma(text) {
  const lines = String(text ?? '').split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (i < lines.length && GLOBAL_FILE_PRAGMA_LINE.test(lines[i])) {
    return { pragma: lines[i].trim(), line: i };
  }
  return null;
}

// Per-file structure the shadowed-use analysis needs, parser-backed (not regex):
//   families: Map<headName, { members:Set<name>, headLine:int }>
//     — every LF type family the file declares, mapped to the names it brings
//       into scope for that family (the head + its constructors).
//   memberType: Map<name, headName> — which family each defined name belongs to.
//   uses: [{ name, line }] — FREE references (0-based line), excluding binders.
// Cached by source text; suite files rarely change while another is edited.
const fileCache = new Map();
const FILE_CACHE_CAP = 128;

function isLFDeclNode(name) {
  return name === 'LFDeclaration' || name === 'LFDatatypeDeclaration';
}

// Collect the head(s) and constructor names of one LF declaration node.
function familyOf(node, doc) {
  const heads = [];
  const ctors = [];
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if ((c.name === 'LowerIdentifier' || c.name === 'UpperIdentifier') && isLFDatatypeHead(c)) {
      heads.push({ name: doc.sliceString(c.from, c.to), from: c.from });
    } else if (c.name === 'LFConstructor') {
      const id = firstIdentChild(c);
      if (id) ctors.push(doc.sliceString(id.from, id.to));
    }
  }
  return { heads, ctors };
}

export function fileShadowInfo(text) {
  const src = String(text ?? '');
  const hit = fileCache.get(src);
  if (hit) return hit;
  const families = new Map();
  const memberType = new Map();
  const uses = [];
  try {
    const doc = Text.of(src.split('\n'));
    const tree = parser.parse(src);
    // Families + their members from the tree.
    const cursor = tree.cursor();
    do {
      if (!isLFDeclNode(cursor.name)) continue;
      const node = cursor.node;
      const { heads, ctors } = familyOf(node, doc);
      // For a mutual family (`LF n … and a …`) every head shares the block; we
      // attribute all constructors to each head it could belong to. That's a safe
      // over-approximation: members of the family are in scope together.
      for (const h of heads) {
        const headLine = doc.lineAt(h.from).number - 1;
        const members = families.get(h.name)?.members || new Set();
        members.add(h.name);
        for (const c of ctors) members.add(c);
        families.set(h.name, { members, headLine });
      }
      for (const h of heads) memberType.set(h.name, h.name);
      // A constructor's "family" is the first head of its declaration block.
      if (heads.length) for (const c of ctors) if (!memberType.has(c)) memberType.set(c, heads[0].name);
    } while (cursor.next());
    // Free uses with line numbers.
    const walk = walkTree(tree, doc);
    for (const u of walk.uses) {
      if (u.bound) continue;
      uses.push({ name: u.name, line: doc.lineAt(u.from).number - 1 });
    }
  } catch {
    // Leave empty structures on parse failure — no findings beats false ones.
  }
  const info = { families, memberType, uses };
  if (fileCache.size >= FILE_CACHE_CAP) fileCache.clear();
  fileCache.set(src, info);
  return info;
}

// Analyze an ORDERED list of source entries (each `{ key, text }`, where `key`
// is whatever identity the caller wants echoed back — a cfg path or file id).
// Returns structured findings; rendering (spans/messages) is the caller's job.
//
//   { kind: 'pragma-leak',  severity: 'warning', at, pragma, pragmaLine, affected: [key…] }
//   { kind: 'shadowed-use', severity: 'error',   at, useName, useLine, type, shadower, origin }
//
// `at`/`shadower`/`origin` are entry keys; `*Line` are 0-based lines in that file.
export function analyzeSuite(entries) {
  if (!Array.isArray(entries) || entries.length < 2) return [];
  const findings = [];
  const pragmas = entries.map((e) => leadingGlobalPragma(e.text));

  // ── Pragma leak ────────────────────────────────────────────────────────────
  for (let i = 1; i < entries.length; i += 1) {
    const p = pragmas[i];
    if (!p) continue;
    const affected = [];
    for (let j = 0; j < i; j += 1) {
      if (!pragmas[j] || pragmas[j].pragma !== p.pragma) affected.push(entries[j].key);
    }
    if (affected.length) {
      findings.push({ kind: 'pragma-leak', severity: 'warning', at: entries[i].key, pragma: p.pragma, pragmaLine: p.line, affected });
    }
  }

  // ── Shadowed use ─────────────────────────────────────────────────────────────
  // Walk the suite in order maintaining, per name, WHO currently provides it and
  // for which type family. When a file re-declares a family, names the prior
  // version had but the new one lacks become "shadowed away". A later file that
  // USES such a name is the victim — that, and only that, is the real error.
  const infos = entries.map((e) => fileShadowInfo(e.text));
  // name → { provider: key, type: headName } (the live binding as of the cursor).
  const live = new Map();
  // name → { provider, type } it had BEFORE being shadowed away (for messaging).
  const shadowedAway = new Map();

  for (let i = 0; i < entries.length; i += 1) {
    const info = infos[i];
    const key = entries[i].key;

    // 1) This file's USES, checked against the bindings live from EARLIER files.
    //    `shadowedAway` holds exactly the names a redefinition removed and that
    //    nothing re-provided since (re-providing deletes the entry), so a hit is
    //    a genuine victim.
    const reported = new Set();
    for (const use of info.uses) {
      if (info.memberType.has(use.name)) continue; // this file defines it itself
      const lost = shadowedAway.get(use.name);
      if (!lost || reported.has(use.name)) continue;
      reported.add(use.name); // one finding per shadowed name per file
      findings.push({
        kind: 'shadowed-use', severity: 'error', at: key,
        useName: use.name, useLine: use.line, type: lost.type,
        shadower: lost.shadower, origin: lost.origin,
      });
    }

    // 2) Apply THIS file's declarations, detecting what it shadows away.
    for (const [head, fam] of info.families) {
      const priorProvider = live.get(head)?.provider;
      if (priorProvider && priorProvider !== key) {
        // Re-declaring `head` that an earlier file provided: any member the
        // earlier family had but this one lacks is shadowed away — record it AND
        // drop it from `live`, since it is no longer in scope for later files.
        for (const [name, binding] of [...live]) {
          if (binding.type !== head || binding.provider === key) continue;
          if (!fam.members.has(name)) {
            shadowedAway.set(name, { type: head, shadower: key, origin: binding.provider });
            live.delete(name);
          }
        }
      }
      // Install this file's family as the live provider for all its members.
      for (const name of fam.members) {
        live.set(name, { provider: key, type: head });
        shadowedAway.delete(name); // re-provided → no longer lost
      }
    }
  }

  return findings;
}

// Human-readable message for a finding, given a `name(key)` resolver so each
// surface can print friendly file names.
export function findingMessage(finding, name) {
  if (finding.kind === 'pragma-leak') {
    return `${finding.pragma} also applies to every previous file in the suite.`;
  }
  // shadowed-use
  return `${finding.useName} is no longer in scope: ${name(finding.shadower)} redefines `
    + `${finding.type} without it (it came from ${name(finding.origin)}).`;
}

// Render suite findings as diagnostics on ONE file's open document. A finding
// whose offending file IS this doc anchors on its real offending line (the
// pragma, or the shadowed USE); a finding about another file anchors on this
// doc's first line as a non-blocking heads-up. `lineSpan(lineIdx0)` maps a
// 0-based file line to a `{ from, to }` in `doc`.
export function suiteFileDiagnostics(entries, key, lineSpan) {
  const findings = analyzeSuite(entries);
  if (!findings.length) return [];
  const inSuite = entries.some((e) => e.key === key);
  if (!inSuite) return [];
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const name = (k) => (byKey.get(k)?.name ?? k);
  const out = [];
  for (const f of findings) {
    let lineIdx = null; // 0-based line in THIS doc, or null → first line
    if (f.at === key) lineIdx = f.kind === 'pragma-leak' ? f.pragmaLine : f.useLine;
    const span = lineSpan(lineIdx == null ? 0 : lineIdx);
    if (!span) continue;
    out.push({ from: span.from, to: span.to, severity: f.severity, source: 'suite', message: findingMessage(f, name) });
  }
  return out;
}
