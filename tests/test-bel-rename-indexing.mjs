import { readFileSync } from 'node:fs';
import {
  usesOf,
  applyTextEdits,
  applyGroupRenameToFile,
} from '../editor-src/project-prelude.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const PATH = 'library/data/case-studies/classical-processes/cp_linear.bel';
const raw = readFileSync(PATH, 'utf8');
const edits = usesOf(raw, PATH).filter((u) => u.name === 'name').map((u) => ({ from: u.from, to: u.to }));

const mangled = applyTextEdits(raw, edits, 'arthichoke');
expect(
  mangled.split('\n')[27].includes('l_pcomp2arthichoke'),
  'raw apply reproduces the cp_linear mangling bug',
);

const fixed = applyGroupRenameToFile(raw, PATH, edits, 'arthichoke', 'name');
const line26 = fixed.split('\n')[25];
const line28 = fixed.split('\n')[27];
expect(line26.includes('{x:arthichoke}'), `line 26 ok: ${line26}`);
expect(line28.includes('{x:arthichoke}'), `line 28 ok: ${line28}`);
expect(!line28.includes('x:name'), `line 28 not mangled: ${line28}`);

console.log('OK bel-rename indexing (cp_linear raw vs normalized basis)');
