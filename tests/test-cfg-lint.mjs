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

console.log('OK cfg lint (resolves entries, flags dangling errors + junk warnings)');
