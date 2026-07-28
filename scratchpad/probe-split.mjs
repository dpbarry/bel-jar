import fs from 'node:fs'; import path from 'node:path';
import { assembleCfgProgram } from '../js/editor-src/prover/prover-corpus-decls.mjs';
import { splitTextForCtype } from '../js/editor-src/prover/prover-moves.mjs';
import { isCtypeApplication } from '../js/editor-src/prover/prover-comp-type.mjs';
const root = process.cwd();
const cfg = path.resolve(root,'library/data/examples/poplmark-reloaded+/sources.cfg');
const dir = path.dirname(cfg);
const code = assembleCfgProgram(fs.readFileSync(cfg,'utf8'),(n)=>{const p=path.join(dir,n);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;}).code;
const hole = { ctx: [], meta: [], line: 1, col: 1 };
for (const ty of ['Sn [h |- M]', 'Sn [Γ |- M]']) {
  console.log('isCtypeApplication', JSON.stringify(ty), '=', isCtypeApplication(ty));
  const t = splitTextForCtype(code, hole, 'X', ty);
  console.log('  ->', t === null ? 'NULL (no split offered)' : '\n' + t);
}
