import {
  devCheckCacheLookup,
  healthFromDiagnostics,
  healthForMember,
  resolveExplorerFileHealth,
  syntaxHealthForText,
} from '../editor-src/file-health-store.mjs';
import { createDevelopmentChecker, developmentSignature } from '../editor-src/development-check.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

async function main() {

const members = [
  { id: 'a', name: 'base.bel', text: 'LF p : type =\n  | mk : bad\n;' },
  { id: 'b', name: 'use.bel', text: 'LF q : type =\n  | mkQ : q\n;' },
  { id: 'c', name: 'later.bel', text: 'LF r : type =\n  | mkR : r\n;' },
];
const memberDiag = {
  'base.bel': [{ line: 2, severity: 'error', message: 'Identifier bad is unbound' }],
};

const baseHit = resolveExplorerFileHealth({
  file: { name: 'base.bel' },
  text: members[0].text,
  memberDiagnostics: memberDiag,
  devCheckCached: true,
});
expect(baseHit.errors === 1, 'dev-check attributes errors to the owning file');

const lemmaHit = resolveExplorerFileHealth({
  file: { name: 'use.bel' },
  text: members[1].text,
  memberDiagnostics: memberDiag,
  devCheckCached: true,
});
expect(lemmaHit.errors === 0, 'siblings without diagnostics stay clean');

const syntaxOnly = syntaxHealthForText('LF p : type =\n  | mk : ???\n;');
expect(syntaxOnly.errors === 1, 'syntax bootstrap finds parse errors');

const syntaxFirst = resolveExplorerFileHealth({
  file: { name: 'solo.bel' },
  text: 'LF p : type =\n  | mk : ???\n;',
  devCheckCached: false,
});
expect(syntaxFirst.errors === 1, 'syntax errors show before dev-check lands');

const activeHealth = healthForMember(members[1], memberDiag, (id) => members.find((m) => m.id === id).text);
expect(activeHealth.errors === 0,
  'healthForMember: clean file not blamed for prelude errors');

const activeBeluga = { errors: 1, warnings: 0, items: [{ line: 5, msg: 'type error', kind: 'error' }] };
const liveActive = resolveExplorerFileHealth({
  file: { name: 'use.bel' },
  text: members[1].text,
  memberDiagnostics: memberDiag,
  devCheckCached: true,
  activeBelugaHealth: activeBeluga,
  isActiveFile: true,
});
expect(liveActive.errors === 1, 'active file uses live beluga over clean dev-check');

// Sibling dots must stay stable while the active buffer diverges from persist.
{
  const haltingMock = (rules) => async (code) => {
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
  const dc = createDevelopmentChecker(haltingMock([
    { marker: 'bad', message: 'Identifier bad is unbound' },
  ]));
  await dc.check(members);
  const persisted = members.map((m) => ({ ...m }));
  const liveMembers = members.map((m) => (
    m.id === 'b' ? { ...m, text: m.text + '\n% editing' } : { ...m }
  ));
  const cached = devCheckCacheLookup(dc, liveMembers, persisted);
  expect(cached && cached.memberDiagnostics?.['base.bel']?.length, 'persisted cache hit while active buffer edits');
  expect(developmentSignature(liveMembers) !== developmentSignature(persisted),
    'live suite sig differs from persisted during edit');
  const siblingDuringEdit = resolveExplorerFileHealth({
    file: { name: 'base.bel' },
    text: members[0].text,
    memberDiagnostics: cached?.memberDiagnostics,
    devCheckCached: !!cached,
  });
  expect(siblingDuringEdit.errors === 1, 'prelude dot stable while typing in a later file');
}

const fromRows = healthFromDiagnostics([
  { line: 3, severity: 'warning', message: 'warn' },
]);
expect(fromRows.warnings === 1 && fromRows.errors === 0, 'healthFromDiagnostics counts warnings');

console.log('OK file-health-store (derived dots, dev-check lookup, stable siblings)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
