// Semantic Engine V2 — unified intelligence + impact analysis lock-down.
// `intelAt(pos)` is the single coherent query the whole IDE routes through:
// identity, definition, references, type, status, dependencies, dependents,
// and transitive impact — one call, keyed to stable identity. Impact analysis
// (dependentsOf / impactOf) explains the file as a living graph: "what must be
// re-checked if I change this".
import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const upd = (e, src) => e.update(parser.parse(src), Text.of(src.split('\n')));
const at = (src, needle, off = 0) => src.indexOf(needle) + off;
const names = (list) => list.map((x) => x.name).sort();

const SAMPLE = `LF o : type =
  | ⊃ : o → o → o
  | ⊤ : o
;
LF nd : o → type =
  | ⊃I : (nd A → nd B) → nd (A ⊃ B)
  | ⊤I : nd ⊤
;
`;

const e = createSemanticEngine();
upd(e, SAMPLE);

// --- One coherent query at the `nd` definition -------------------------
{
  const intel = await e.intelAt(at(SAMPLE, 'LF nd') + 3); // the `nd` name
  expect(intel, 'intelAt should return a result for nd');
  expect(intel.definition && intel.definition.name === 'nd', 'definition resolves to nd');
  expect(intel.type === 'o → type', `nd's source type, got ${intel.type}`);
  expect(intel.typeSource === 'annotation', 'nd type is from source annotation (no oracle)');
  // nd depends on o (its kind references o); its constructors depend on nd.
  expect(names(intel.dependencies).includes('o'), `nd should depend on o, got ${names(intel.dependencies)}`);
  expect(names(intel.dependents).includes('⊃I') && names(intel.dependents).includes('⊤I'),
    `nd's dependents should include its constructors, got ${names(intel.dependents)}`);
}

// --- intelAt from a USE site resolves to the definition ----------------
{
  const intel = await e.intelAt(at(SAMPLE, 'nd A') + 1); // an `nd` reference
  expect(intel.definition && intel.definition.name === 'nd', 'a use of nd resolves to its definition');
  expect(intel.reference && intel.reference.resolution === 'global', 'the use is recorded as a global reference');
  expect(intel.references.length >= 1, 'references include the use sites');
}

// --- Impact (blast radius) is transitive through interface edges -------
{
  // o ← (⊃, ⊤ constructors, and nd's kind) ; nd ← (⊃I, ⊤I). Changing o's
  // signature should reach nd transitively, and nd's constructors.
  const oId = e.debugSnapshot().symbols.find((s) => s.name === 'o' && s.isGlobal).id;
  const impact = names(e.impactOf(oId));
  expect(impact.includes('nd'), `changing o should impact nd (transitive), got ${impact}`);
  expect(impact.includes('⊃') || impact.includes('⊤'), 'o impacts its own constructors');
  // Direct dependents of o are a subset of the transitive impact.
  const direct = names(e.dependentsOf(oId));
  expect(direct.every((n) => impact.includes(n)), 'direct dependents are within the transitive impact set');
}

// --- intelAt on an unannotated metavar uses the session tier -----------
{
  // elaborateAt queries the warm session per occurrence (structural inference
  // is hoverAt's concern); the mock session answers and the result is cached.
  let calls = 0;
  const session = { async typeAt() { calls += 1; return { ok: true, type: 'TY' }; } };
  const ND2 = `LF o : type =\n  | c : o\n;\nLF p : o → type =\n  | mk : p (c) → p M\n;\n`;
  const e2 = createSemanticEngine({ session });
  upd(e2, ND2);
  const intel = await e2.intelAt(at(ND2, 'p M') + 2); // the free metavar M
  expect(intel.type === 'TY' && intel.typeSource === 'oracle', `M should be typed via the session, got ${intel.type}/${intel.typeSource}`);
  expect(calls === 1, 'session queried once for the metavar');
}

console.log('OK semantic intel v2 (unified query, dependencies/dependents, transitive impact, session tier)');
