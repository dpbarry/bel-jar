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
//      file uses a name the redefinition shadowed AWAY (fol.bel uses
//      `atom`/`conj` from fol.elf's o, which fol-handbook.bel's o lacks → the
//      baffling "expected o, actual o"). So the VICTIM gets the error at its real
//      use, and the redefiner gets a warning at its redeclaration naming what it
//      dropped and which files use it — only then: re-declaring a type is not
//      itself an error.
//
// A family is any LF type-level declaration: `LF o : type = | c : o;`, and the
// Twelf style `o : type.` or `LF o : type.`. Its members are its constructors and
// every constant whose type ends in it (`c : o.`, `s : nat -> nat.`,
// `p/s : plus (s M) N (s P) <- plus M N P.`), wherever in the suite that constant
// is declared.
import { parser } from '../beluga-parser.js';
import { Text } from '@codemirror/state';
import { walkTree } from '../tree-walk.mjs';
import { firstIdentChild, isLFDatatypeHead } from '../tree-helpers.mjs';
import { GLOBAL_FILE_PRAGMA_LINE } from '../semantic/project-prelude.mjs';

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
//       into scope for that family (the head, its constructors, and this file's
//       constants whose type ends in it).
//   memberType: Map<name, headName> — which family each defined name belongs to.
//   constants: [{ name, target }] — every constant and the family its type ends in.
//   uses: [{ name, line }] — FREE references (0-based line), excluding binders.
// Cached by source text; suite files rarely change while another is edited.
const fileCache = new Map();
const FILE_CACHE_CAP = 128;

const BACKWARD_ARROWS = new Set(['<-', '←']);

// Collect the head(s) and constructor names of one LF datatype declaration.
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

// The family an LF type ends in: past `->` to its right, past `<-` to its left,
// through `{x:A} B` to B, through parentheses, and to the head of an application.
// null when it ends in anything else (a variable, a hole).
function resultFamily(typeNode, doc) {
  let cur = typeNode;
  while (cur) {
    if (cur.name === 'LFType') {
      let arrow = null;
      let before = null;
      let after = null;
      let last = null;
      let app = null;
      for (let c = cur.firstChild; c; c = c.nextSibling) {
        if (c.name === 'ArrowOp') arrow = c;
        else if (c.name === 'LFType') {
          if (arrow) after = c; else before = c;
          last = c;
        } else if (c.name === 'LFAppType' && !app) app = c;
      }
      if (arrow) {
        const op = arrow.firstChild ? arrow.firstChild.name : doc.sliceString(arrow.from, arrow.to).trim();
        cur = BACKWARD_ARROWS.has(op) ? before : after;
      } else if (cur.firstChild && cur.firstChild.name === '{') {
        cur = last;
      } else {
        cur = app;
      }
    } else if (cur.name === 'LFAppType') {
      cur = cur.firstChild;
    } else if (cur.name === 'LFAtomicType') {
      const first = cur.firstChild;
      if (!first) return null;
      if (first.name === 'LowerIdentifier' || first.name === 'UpperIdentifier') {
        return doc.sliceString(first.from, first.to);
      }
      if (first.name !== '(') return null;
      let inner = null;
      for (let c = first.nextSibling; c; c = c.nextSibling) {
        if (c.name === 'LFType') { inner = c; break; }
      }
      cur = inner;
    } else {
      return null;
    }
  }
  return null;
}

export function fileShadowInfo(text) {
  const src = String(text ?? '');
  const hit = fileCache.get(src);
  if (hit) return hit;
  const families = new Map();
  const memberType = new Map();
  const constants = [];
  const uses = [];
  try {
    const doc = Text.of(src.split('\n'));
    const tree = parser.parse(src);
    const addFamily = (head, from, ctors) => {
      const headLine = doc.lineAt(from).number - 1;
      const members = families.get(head)?.members || new Set();
      members.add(head);
      for (const c of ctors) members.add(c);
      families.set(head, { members, headLine });
    };
    // Families + their members from the tree.
    const cursor = tree.cursor();
    do {
      if (cursor.name === 'LFDatatypeDeclaration') {
        const { heads, ctors } = familyOf(cursor.node, doc);
        // For a mutual family (`LF n … and a …`) every head shares the block; we
        // attribute all constructors to each head it could belong to. That's a safe
        // over-approximation: members of the family are in scope together.
        for (const h of heads) addFamily(h.name, h.from, ctors);
        for (const h of heads) memberType.set(h.name, h.name);
        // A constructor's "family" is the first head of its declaration block.
        if (heads.length) for (const c of ctors) if (!memberType.has(c)) memberType.set(c, heads[0].name);
      } else if (cursor.name === 'LFDeclaration') {
        // `nat : type.` declares a family; `s : nat -> nat.` a constant of the
        // family its type ends in.
        const node = cursor.node;
        const id = firstIdentChild(node);
        if (!id) continue;
        const name = doc.sliceString(id.from, id.to);
        let classifier = null;
        for (let c = id.nextSibling; c; c = c.nextSibling) {
          if (c.name === 'LFKind' || c.name === 'LFType') { classifier = c; break; }
        }
        if (!classifier) continue;
        if (classifier.name === 'LFKind') {
          addFamily(name, id.from, []);
          memberType.set(name, name);
        } else {
          const target = resultFamily(classifier, doc);
          if (target && target !== name) constants.push({ name, target });
        }
      }
    } while (cursor.next());
    // A constant joins its family here when this file declares that family too.
    for (const c of constants) {
      if (!memberType.has(c.name)) memberType.set(c.name, c.target);
      const family = families.get(c.target);
      if (family) family.members.add(c.name);
    }
    // Free uses with line numbers.
    const walk = walkTree(tree, doc);
    for (const u of walk.uses) {
      if (u.bound || u.binds) continue; // a local binder's own name is not a use either
      uses.push({ name: u.name, line: doc.lineAt(u.from).number - 1 });
    }
  } catch {
    // Leave empty structures on parse failure — no findings beats false ones.
  }
  const info = { families, memberType, constants, uses };
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
//   { kind: 'shadowing-redeclaration', severity: 'warning', at, type, headLine, dropped: [name…], users: [key…] }
//
// `at`/`shadower`/`origin`/`users` are entry keys; `*Line` are 0-based lines in that file.
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
  // name → { type, shadower, origin, headLine } it had BEFORE being shadowed away.
  const shadowedAway = new Map();
  // `${shadower}\u0000${type}` → the redeclaration warning, once a later file uses what it dropped.
  const redeclarations = new Map();

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
      const rk = `${lost.shadower}\u0000${lost.type}`;
      const redeclaration = redeclarations.get(rk) || {
        kind: 'shadowing-redeclaration', severity: 'warning', at: lost.shadower,
        type: lost.type, headLine: lost.headLine, dropped: [], users: [],
      };
      if (!redeclaration.dropped.includes(use.name)) redeclaration.dropped.push(use.name);
      if (!redeclaration.users.includes(key)) redeclaration.users.push(key);
      redeclarations.set(rk, redeclaration);
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
            shadowedAway.set(name, { type: head, shadower: key, origin: binding.provider, headLine: fam.headLine });
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

    // 3) A constant of a family an EARLIER file declared joins that family, so a
    //    later redeclaration without it drops it too.
    for (const c of info.constants) {
      if (info.families.has(c.target)) continue; // joined in step 2
      const family = live.get(c.target);
      if (!family || family.type !== c.target) continue;
      live.set(c.name, { provider: key, type: c.target });
      shadowedAway.delete(c.name);
    }
  }

  for (const redeclaration of redeclarations.values()) findings.push(redeclaration);
  return findings;
}

// The 0-based line in its own file a finding is about.
export function findingLine(finding) {
  if (finding.kind === 'pragma-leak') return finding.pragmaLine ?? 0;
  if (finding.kind === 'shadowing-redeclaration') return finding.headLine ?? 0;
  return finding.useLine ?? 0;
}

function listOf(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Human-readable message for a finding, given a `name(key)` resolver so each
// surface can print friendly file names.
export function findingMessage(finding, name) {
  if (finding.kind === 'pragma-leak') {
    return `${finding.pragma} also applies to every previous file in the suite.`;
  }
  if (finding.kind === 'shadowing-redeclaration') {
    const users = finding.users.map(name);
    return `Redefining ${finding.type} here drops ${listOf(finding.dropped)}, which ${listOf(users)} `
      + `${users.length === 1 ? 'uses' : 'use'}.`;
  }
  // shadowed-use
  return `${finding.useName} is no longer in scope: ${name(finding.shadower)} redefines `
    + `${finding.type} without it (it came from ${name(finding.origin)}).`;
}

// Render suite findings that blame THIS file as diagnostics on the open document.
// Findings about other files are not mirrored here — the suite-prelude banner /
// keyed observations cover cross-file awareness without lighting a clean buffer.
export function suiteFileDiagnostics(entries, key, lineSpan) {
  const findings = analyzeSuite(entries);
  if (!findings.length) return [];
  const inSuite = entries.some((e) => e.key === key);
  if (!inSuite) return [];
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const name = (k) => (byKey.get(k)?.name ?? k);
  const out = [];
  for (const f of findings) {
    if (f.at !== key) continue;
    const span = lineSpan(findingLine(f));
    if (!span) continue;
    out.push({ from: span.from, to: span.to, severity: f.severity, source: 'suite', message: findingMessage(f, name) });
  }
  return out;
}
