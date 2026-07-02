// Development-scoped Tier-2: the whole development is checked as a unit so EVERY
// member gets its diagnostics, regardless of which file is "active" — the data
// that lets the inspector/graph drop the cross-file banner for later members.
// The multi-pass masking surfaces independent errors in DIFFERENT members, each
// attributed to its own file by span. Cached by content signature.
import {
  checkDevelopmentCode, createDevelopmentChecker, developmentSignature,
} from '../editor-src/development-check.mjs';
import { assembleProjectCode } from '../editor-src/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Beluga halts at the first active (non-masked) marker, in line order.
function haltingMock(rules) {
  return async (code) => {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      for (const rule of rules) {
        const col = lines[i].indexOf(rule.marker);
        if (col >= 0) {
          return { ok: false, output: `File "input.bel", line ${i + 1}, column ${col + 1}:\nError: ${rule.message}` };
        }
      }
    }
    return { ok: true, output: '' };
  };
}

const A = 'LF a : type =\n  | ma : a\n;';
const B = 'LF b : type =\n  | mb : badB\n;';
const C = 'LF c : type =\n  | mc : badC\n;';

// ── independent errors in DIFFERENT members each surface, attributed by file ──
{
  const members = [
    { id: 'a', name: 'a.bel', text: A }, // clean
    { id: 'b', name: 'b.bel', text: B }, // error on member line 2
    { id: 'c', name: 'c.bel', text: C }, // error on member line 2
  ];
  const { code, spans } = assembleProjectCode(members);
  const runCheck = haltingMock([
    { marker: 'badB', message: 'Identifier badB is unbound' },
    { marker: 'badC', message: 'Identifier badC is unbound' },
  ]);
  const res = await checkDevelopmentCode(code, spans, runCheck);
  const m = res.memberDiagnostics;

  expect(!('a.bel' in m), 'the clean member gets no diagnostics');
  expect(m['b.bel']?.length === 1 && /badB/.test(m['b.bel'][0].message),
    `b.bel gets its own error, got ${JSON.stringify(m['b.bel'])}`);
  expect(m['c.bel']?.length === 1 && /badC/.test(m['c.bel'][0].message),
    `the LATER member c.bel ALSO gets checked (the whole point), got ${JSON.stringify(m['c.bel'])}`);
  expect(m['b.bel'][0].line === 2 && m['c.bel'][0].line === 2,
    'findings are file-relative to their own member');
  expect(m['b.bel'][0].severity === 'error', 'halting findings are errors');
  expect(res.ok === false, 'a development with member errors is not ok');
}

// ── an all-clean development is ok with no findings ──────────────────────────
{
  const members = [
    { id: 'a', name: 'a.bel', text: A },
    { id: 'b', name: 'b.bel', text: 'LF b : type =\n  | mb : b\n;' },
  ];
  const { code, spans } = assembleProjectCode(members);
  const res = await checkDevelopmentCode(code, spans, haltingMock([]));
  expect(res.ok === true, 'clean development reads ok');
  expect(Object.keys(res.memberDiagnostics).length === 0, 'clean development has no member diagnostics');
}

// ── hole attribution: per-file paths and assembled line numbers ───────────────
{
  const members = [
    { id: 'a', name: 'a.bel', text: A },
    { id: 'b', name: 'b.bel', text: 'rec g : [ |- nat] =\n?\n;' },
  ];
  const { code, spans } = assembleProjectCode(members);
  const holeOut = `## Holes: a.bel ##
File "b.bel", line 2, column 17: Hole number 1, <anonymous>
  Meta-context:
  Computation context:
  Goal: [ |- nat]
`;
  const runCheck = async () => ({ ok: true, output: holeOut });
  const res = await checkDevelopmentCode(code, spans, runCheck);
  expect(res.memberHoles['b.bel']?.length === 1, 'attributes holes by member file path');
  expect(res.memberHoles['b.bel'][0].goal === '[ |- nat]', 'goal preserved');
  expect(res.memberHoles['b.bel'][0].line === 2, 'file-relative line');
}

// ── signature changes with content; checker memoizes per signature ───────────
{
  const base = [
    { id: 'a', name: 'a.bel', text: A },
    { id: 'b', name: 'b.bel', text: B },
  ];
  const sig1 = developmentSignature(base);
  const sig2 = developmentSignature([{ id: 'a', name: 'a.bel', text: A }, { id: 'b', name: 'b.bel', text: B }]);
  expect(sig1 === sig2, 'same content → same signature');
  const sig3 = developmentSignature([{ id: 'a', name: 'a.bel', text: `${A}\nLF z : type = ;` }, base[1]]);
  expect(sig1 !== sig3, 'edited content → different signature');

  let calls = 0;
  const counting = async (code) => { calls += 1; return haltingMock([{ marker: 'badB', message: 'badB unbound' }])(code); };
  const checker = createDevelopmentChecker(counting);
  const r1 = await checker.check(base);
  const r2 = await checker.check(base);
  expect(r1 === r2, 'unchanged development → memoized result (same object)');
  expect(r1.memberDiagnostics['b.bel']?.length === 1, 'cached result carries the member diagnostics');
  const callsAfterCache = calls;
  await checker.check(base);
  expect(calls === callsAfterCache, 'a cache hit does not re-run the checker');
  expect(checker.cachedFor(base) === r1, 'cachedFor returns the memoized result');
}

console.log('ok   test-development-check.mjs  development-scoped check (every member attributed incl. later '
  + 'files; clean = ok; signature + memoization)');
