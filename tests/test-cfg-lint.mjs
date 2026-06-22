// Phase 1b: a .cfg whose entry does not resolve to a project file is otherwise
// silently dropped by resolveCfgOrder's pathSet filter — a broken cfg looks
// identical to a correct one. cfgDiagnosticsFor surfaces it on the bad line.
import { cfgDiagnosticsFor, resolveCfgDocumentPath } from '../editor-src/bel-cfg-lint.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const names = new Set(['grp/base.bel', 'grp/use.bel', 'grp/sources.cfg', 'grp/extra.cfg']);

// All entries resolve → clean.
{
  const d = cfgDiagnosticsFor('% order\nbase.bel\nuse.bel\n', 'grp/sources.cfg', names);
  expect(d.length === 0, 'valid cfg yields no diagnostics');
}

// A missing/misspelled entry is an error on its line.
{
  const text = 'base.bel\nuze.bel\n';
  const d = cfgDiagnosticsFor(text, 'grp/sources.cfg', names);
  expect(d.length === 1 && d[0].severity === 'error', 'dangling entry → one error');
  expect(d[0].message.includes('grp/uze.bel'), 'error names the unresolved path');
  // span covers exactly the "uze.bel" token on line 2
  expect(text.slice(d[0].from, d[0].to) === 'uze.bel', 'diagnostic span is the entry token');
}

// A nested cfg include resolves against the project too.
{
  const d = cfgDiagnosticsFor('base.bel\nextra.cfg\n', 'grp/sources.cfg', names);
  expect(d.length === 0, 'nested .cfg include that exists is valid');
}

// A non-entry junk line is a warning, not an error.
{
  const d = cfgDiagnosticsFor('base.bel\nnonsense\n', 'grp/sources.cfg', names);
  expect(d.length === 1 && d[0].severity === 'warning', 'non-entry line → warning');
}

// Comments and blanks never flag.
{
  const d = cfgDiagnosticsFor('% a comment\n\n   \nbase.bel\n', 'grp/sources.cfg', names);
  expect(d.length === 0, 'comments and blank lines are ignored');
}

// No registry (headless) → no diagnostics, never throws.
{
  const d = cfgDiagnosticsFor('whatever.bel\n', 'grp/sources.cfg', null);
  expect(d.length === 0, 'null registry yields no diagnostics');
}

// Renamed cfg: stable id still points at file via registry lookup.
{
  const g = globalThis;
  g.BelJarPersist = {
    getFileById(id) {
      if (id === 'workspace://bisimulation/sources.cfg') return { name: 'sources.cfg' };
      return null;
    },
  };
  expect(resolveCfgDocumentPath('workspace://bisimulation/sources.cfg') === 'sources.cfg',
    'resolveCfgDocumentPath follows live registry name after move');
  const rootNames = new Set(['sources.cfg', 'picalc.bel', 'invariant.bel']);
  const d = cfgDiagnosticsFor('picalc.bel\ninvariant.bel\n', 'sources.cfg', rootNames);
  expect(d.length === 0, 'root cfg entries resolve after suite move to project root');
  delete g.BelJarPersist;
}

// ── Cross-file suite-composition lints (need a getText resolver) ─────────────

// Pragma leak: --nostrengthen on a LATER file is hoisted above earlier files
// that don't carry it → warn on the pragma-bearing entry, naming the affected.
{
  const fnames = new Set(['fol/sources.cfg', 'fol/a.bel', 'fol/b.bel']);
  const texts = {
    'fol/a.bel': 'LF foo : type = ;',
    'fol/b.bel': '--nostrengthen\nLF bar : type = ;',
  };
  const get = (p) => texts[p] ?? '';
  const d = cfgDiagnosticsFor('a.bel\nb.bel\n', 'fol/sources.cfg', fnames, get);
  const leak = d.find((x) => /every previous file in the suite/.test(x.message));
  expect(leak && leak.severity === 'warning', 'later-file global pragma → warning');
  expect(leak.message.includes('--nostrengthen'), 'pragma-leak warning names the pragma');
  // Span is on the pragma-bearing entry (b.bel, line 2), not line 1.
  expect('a.bel\nb.bel\n'.slice(leak.from, leak.to) === 'b.bel', 'leak warning sits on the pragma entry');
}

// No leak when the pragma is on the FIRST entry (it legitimately leads the suite).
{
  const fnames = new Set(['fol/sources.cfg', 'fol/a.bel', 'fol/b.bel']);
  const texts = {
    'fol/a.bel': '--nostrengthen\nLF foo : type = ;',
    'fol/b.bel': 'LF bar : type = ;',
  };
  const d = cfgDiagnosticsFor('a.bel\nb.bel\n', 'fol/sources.cfg', fnames, (p) => texts[p] ?? '');
  expect(!d.some((x) => /hoisted/.test(x.message)), 'pragma on the first suite file is fine');
}

// Re-declaring an LF type is LEGAL shadowing — not flagged on its own, even
// across two cfg entries (the contradiction the user caught).
{
  const fnames = new Set(['fol/sources.cfg', 'fol/x.elf', 'fol/y.bel']);
  const texts = {
    'fol/x.elf': 'LF o : type = | imp : o -> o -> o | atom : o ;',
    'fol/y.bel': 'LF o : type = | all : (i -> o) -> o ;', // redeclares o, uses only its own
  };
  const d = cfgDiagnosticsFor('x.elf\ny.bel\n', 'fol/sources.cfg', fnames, (p) => texts[p] ?? '');
  expect(!d.some((x) => x.source === 'cfg' && /scope|redefines/i.test(x.message)),
    're-declaring a type that nobody later misuses is clean');
}

// But a LATER entry that uses a shadowed-away constructor IS flagged on that
// entry (the victim), anchored on its cfg line.
{
  const fnames = new Set(['fol/sources.cfg', 'fol/x.elf', 'fol/y.bel', 'fol/z.bel']);
  const texts = {
    'fol/x.elf': 'LF o : type = | imp : o -> o -> o | atom : o ;',
    'fol/y.bel': 'LF o : type = | all : (i -> o) -> o ;', // drops atom
    'fol/z.bel': 'rec r : [ |- atom ] = ?;',              // uses atom → victim
  };
  const d = cfgDiagnosticsFor('x.elf\ny.bel\nz.bel\n', 'fol/sources.cfg', fnames, (p) => texts[p] ?? '');
  const su = d.find((x) => /atom is no longer in scope/.test(x.message));
  expect(su && su.severity === 'error', 'a later use of a shadowed-away constructor → error');
  expect('x.elf\ny.bel\nz.bel\n'.slice(su.from, su.to) === 'z.bel', 'error sits on the victim entry (z.bel)');
  expect(/y\.bel redefines o/.test(su.message), 'message names the redefiner');
}

// Distinct names across files never collide.
{
  const fnames = new Set(['ok/sources.cfg', 'ok/a.bel', 'ok/b.bel']);
  const texts = {
    'ok/a.bel': 'LF tm : type = ;',
    'ok/b.bel': 'LF ty : type = ;\nschema ctx = block x:tm ;',
  };
  const d = cfgDiagnosticsFor('a.bel\nb.bel\n', 'ok/sources.cfg', fnames, (p) => texts[p] ?? '');
  expect(d.length === 0, 'distinct decls across suite files yield no cross-file diagnostics');
}

// Without a getText resolver, cross-file lints are silently skipped (back-compat).
{
  const fnames = new Set(['fol/sources.cfg', 'fol/a.bel', 'fol/b.bel']);
  const d = cfgDiagnosticsFor('a.bel\nb.bel\n', 'fol/sources.cfg', fnames);
  expect(d.length === 0, 'no resolver → no cross-file diagnostics, never throws');
}

console.log('OK cfg lint (resolves entries, flags dangling errors + junk warnings, '
  + 'pragma-leak + shadowed-use across suite files)');
