import {
  captureHarpoonAnchor,
  assessHarpoonAnchor,
  textFingerprint,
} from '../editor-src/harpoon-anchor.mjs';
import { parseDecl } from '../editor-src/bel-harpoon.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const declSlice = 'rec dual_sym : [ |- dual A A\'] -> [ |- dual A\' A ] =\n?\n;';
const prelude = 'LF nat : type = | z : nat ;\n\n';
const assembledCode = prelude + declSlice;
const holeOff = assembledCode.indexOf('?');
const beforeHole = assembledCode.slice(0, holeOff);
const holeLine = beforeHole.split('\n').length;
const holeCol = holeOff - (beforeHole.lastIndexOf('\n') + 1) + 1;
const prep = {
  name: 'dual_sym',
  declKey: 'rec:dual_sym',
  hit: { hole: { line: holeLine, col: holeCol, name: null }, from: holeOff, to: holeOff + 1 },
  span: { from: prelude.length, to: assembledCode.length },
  assembledCode: assembledCode,
  assembledDeclFrom: prelude.length,
  assembledDeclTo: assembledCode.length,
  proveCode: assembledCode,
};

const anchor = captureHarpoonAnchor(prep, {
  fileId: 'f1',
  fileText: assembledCode,
  declSlice,
  memberFingerprints: { 'main.bel': textFingerprint('prelude') },
});

expect(anchor.declType.includes('dual'), 'anchor captures decl type');
expect(anchor.holeKey === holeLine + ':' + holeCol + ':', 'anchor hole key');

const intact = assessHarpoonAnchor(anchor, {
  fileAvailable: true,
  fileText: assembledCode,
  fileTextFingerprint: anchor.fileTextFingerprint,
  memberFingerprints: anchor.memberFingerprints,
  liveHit: prep.hit,
  parseDecl,
});
expect(intact.level === 'none', 'unchanged file → none');

expect(
  assessHarpoonAnchor(anchor, {
    fileAvailable: true,
    fileText: assembledCode,
    fileTextFingerprint: anchor.fileTextFingerprint,
    memberFingerprints: anchor.memberFingerprints,
    liveHit: prep.hit,
    parseDecl,
    preludeFingerprint: textFingerprint('different assembled prelude slice'),
  }).level === 'none',
  'assembled prelude slice drift alone must not warn',
);

const typeChanged = assessHarpoonAnchor(anchor, {
  fileAvailable: true,
  fileText: 'rec dual_sym : [ |- nat ] =\n?\n;',
  fileTextFingerprint: textFingerprint('rec dual_sym : [ |- nat ] =\n?\n;'),
  memberFingerprints: anchor.memberFingerprints,
  liveHit: { hole: { line: 1, col: 1 }, from: 28, to: 29 },
  parseDecl,
});
expect(typeChanged.level === 'block' && typeChanged.reason === 'type-changed', 'type change → block');

const holeGone = assessHarpoonAnchor(anchor, {
  fileAvailable: true,
  fileText: 'rec dual_sym : [ |- dual A A\'] -> [ |- dual A\' A ] =\n[ |- refl ]\n;',
  fileTextFingerprint: textFingerprint('gone'),
  memberFingerprints: anchor.memberFingerprints,
  liveHit: null,
  parseDecl,
});
expect(holeGone.level === 'block' && holeGone.reason === 'hole-gone', 'hole removed → block');

const bodyTweak = declSlice.replace('?\n', '? /* note */\n');
const bodyFile = prelude + bodyTweak;
const bodyOff = bodyFile.indexOf('?');
const bodyBefore = bodyFile.slice(0, bodyOff);
const bodyHit = {
  hole: {
    line: bodyBefore.split('\n').length,
    col: bodyOff - (bodyBefore.lastIndexOf('\n') + 1) + 1,
  },
  from: bodyOff,
  to: bodyOff + 1,
};
const tweaked = assessHarpoonAnchor(anchor, {
  fileAvailable: true,
  fileText: bodyFile,
  fileTextFingerprint: textFingerprint(bodyFile),
  memberFingerprints: anchor.memberFingerprints,
  liveHit: bodyHit,
  parseDecl,
});
expect(tweaked.level === 'warn' && tweaked.reason === 'file-changed', 'body tweak with hole intact → warn');

const suiteDrift = assessHarpoonAnchor(anchor, {
  fileAvailable: true,
  fileText: assembledCode,
  fileTextFingerprint: anchor.fileTextFingerprint,
  memberFingerprints: { 'main.bel': textFingerprint('changed prelude') },
  liveHit: prep.hit,
  parseDecl,
});
expect(suiteDrift.level === 'warn' && suiteDrift.reason === 'suite-changed', 'suite member drift → warn');

console.log(`OK test-harpoon-anchor (${n} assertions)`);
