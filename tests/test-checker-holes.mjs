import { attributeCheckerHoles } from '../js/editor-src/semantic/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const OUT = `## Holes: assembled ##
File "assembled", line 3, column 5: Hole number 1, <anonymous>
  Meta-context:
  Computation context:
  Goal: [ |- nat]

File "assembled", line 12, column 2: Hole number 2, ?h
  Meta-context:
  Computation context:
  Goal: [ |- bool]
`;

const prelude = {
  offsetLines: 8,
  spans: [{ name: 'pre.bel', startLine: 1, endLine: 7 }],
};

const { activeHoles, memberHoles } = attributeCheckerHoles(OUT, {
  prelude,
  activeFileName: 'active.bel',
});

expect(memberHoles['pre.bel']?.length === 1, 'prelude hole attributed to member file');
expect(memberHoles['pre.bel'][0].line === 3 && memberHoles['pre.bel'][0].goal === '[ |- nat]',
  `prelude hole file-relative (got ${memberHoles['pre.bel'][0].line}:${memberHoles['pre.bel'][0].goal})`);
expect(activeHoles.length === 1, 'active file hole kept');
expect(activeHoles[0].line === 4 && activeHoles[0].goal === '[ |- bool]',
  `active hole shifted (got ${activeHoles[0].line}:${activeHoles[0].goal})`);

console.log('test-checker-holes: ok');
