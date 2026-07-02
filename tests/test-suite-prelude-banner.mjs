import { Text } from '@codemirror/state';
import { healthForMember } from '../editor-src/file-health-store.mjs';
import {
  firstBrokenMemberBefore,
  firstSyntaxErrorInText,
  suitePreludeBannerForActive,
} from '../editor-src/suite-prelude-banner.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const members = [
  { id: 'a', name: 'base.bel', text: 'LF p : type =\n  | mk : bad\n;' },
  { id: 'b', name: 'mid.bel', text: 'LF q : type =\n  | mkQ : q\n;' },
  { id: 'c', name: 'use.bel', text: 'LF r : type =\n  | mkR : r\n;' },
];

const broken = firstBrokenMemberBefore(members, 2, { 'base.bel': [{ line: 2, severity: 'error', message: 'bad' }] }, (id) => {
  const m = members.find((x) => x.id === id);
  return m ? m.text : '';
});
expect(broken && broken.name === 'base.bel' && broken.line === 2, 'first broken member before active');

const doc = Text.of(members[2].text.split('\n'));
const banner = suitePreludeBannerForActive({
  doc,
  members,
  activeId: 'c',
  memberDiagnostics: { 'base.bel': [{ line: 2, severity: 'error', message: 'Identifier bad is unbound' }] },
  getText: (id) => members.find((m) => m.id === id).text,
});
expect(banner && /earlier suite file base\.bel, line 2/.test(banner.message), 'following file gets line-1 banner');
expect(banner.source === 'suite-prelude', 'banner is suite overlay not beluga settlement');

const pathMembers = [
  { id: 'a', name: 'classical-processes/cp_base.bel', text: 'LF p : type =\n  | mk : bad\n;' },
  { id: 'b', name: 'classical-processes/cp_lemmas.bel', text: 'LF q : type =\n  | mkQ : q\n;' },
];
const pathDoc = Text.of(pathMembers[1].text.split('\n'));
const pathBanner = suitePreludeBannerForActive({
  doc: pathDoc,
  members: pathMembers,
  activeId: 'b',
  memberDiagnostics: { 'classical-processes/cp_base.bel': [{ line: 4, severity: 'error', message: 'bad' }] },
  getText: (id) => pathMembers.find((m) => m.id === id).text,
});
expect(pathBanner && /earlier suite file cp_base\.bel, line 4/.test(pathBanner.message),
  'banner uses filename not suite path');

const selfDoc = Text.of(members[0].text.split('\n'));
expect(!suitePreludeBannerForActive({
  doc: selfDoc,
  members,
  activeId: 'a',
  memberDiagnostics: { 'base.bel': [{ line: 2, severity: 'error', message: 'bad' }] },
  getText: (id) => members.find((m) => m.id === id).text,
}), 'broken file itself does not get the banner');

const syntaxHit = firstSyntaxErrorInText('LF p : type =\n  | mk : ???\n;');
expect(syntaxHit && syntaxHit.line >= 1, 'syntax errors in prelude members are detected synchronously');

const memberDiag = {
  'base.bel': [{ line: 2, severity: 'error', message: 'Identifier bad is unbound' }],
};
const getText = (id) => members.find((m) => m.id === id).text;
const baseHealth = healthForMember(members[0], memberDiag, getText);
expect(baseHealth.errors === 1 && baseHealth.items[0].line === 2,
  'health surfaces prelude errors for explorer dots');
const midHealth = healthForMember(members[1], memberDiag, getText);
expect(midHealth.errors === 0, 'clean prelude members get zero-error health');
const activeHealth = healthForMember(members[2], memberDiag, getText);
expect(activeHealth.errors === 0,
  'active file with no in-doc errors stays clean (prelude banner is not its error)');

console.log('OK suite-prelude-banner (suite order, overlay source, syntax-fast path)');
