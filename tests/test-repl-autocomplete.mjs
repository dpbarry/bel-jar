import {
  parseCompletionContext,
  suggestReplCompletions,
  suggestPathLabel,
} from '../js/repl/repl-ac-suggest.mjs';

function expect(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function expectEq(a, b, msg) {
  if (a !== b) {
    console.error('FAIL:', msg, 'got', JSON.stringify(a), 'want', JSON.stringify(b));
    process.exit(1);
  }
}

function labels(result) {
  return (result && result.items || []).map(function (it) { return it.label; });
}

function hasLabel(result, label) {
  return labels(result).indexOf(label) !== -1;
}

// ── parseCompletionContext ────────────────────────────────────────────────────

expectEq(parseCompletionContext('ty').kind, 'verb', 'verb prefix');
expectEq(parseCompletionContext('run').kind, 'verb', 'bare run is still verb until space');
expectEq(parseCompletionContext('run ').kind, 'runPath', 'run + space → path');
expectEq(parseCompletionContext('run ').token, '', 'empty path token');
expectEq(parseCompletionContext('run &b').kind, 'runPath', 'amalgam path');
expect(parseCompletionContext('run &b').amalgam, 'amalgam flag');
expectEq(parseCompletionContext('run&b').kind, 'runPath', 'glued amalgam');
expectEq(parseCompletionContext('run suite ').kind, 'runSuite', 'suite mode');
expectEq(parseCompletionContext('run folder lib').kind, 'runFolder', 'folder mode');
expectEq(parseCompletionContext('run project'), null, 'project → no ac');

// ── suggest verbs ─────────────────────────────────────────────────────────────

var verbs = suggestReplCompletions({ line: 'ty', verbs: ['types', 'type', 'run', 'run'] });
expect(hasLabel(verbs, 'types'), 'ty → types');
expect(hasLabel(verbs, 'type'), 'ty → type');
expect(!hasLabel(verbs, 'run'), 'ty does not suggest run');
expectEq(
  labels(suggestReplCompletions({ line: '', verbs: ['run', 'run', 'help', 'run'] })).filter(function (l) {
    return l === 'run';
  }).length,
  1,
  'duplicate run verbs collapsed',
);

// ── suggest run paths ─────────────────────────────────────────────────────────

var files = [
  { id: '1', name: 'src/a.bel' },
  { id: '2', name: 'src/b.bel' },
  { id: '3', name: 'lib/b.bel' },
  { id: '4', name: 'src/foo.cfg' },
  { id: '5', name: 'lib/bar.cfg' },
  { id: '6', name: 'root.bel' },
];

var cwdSrc = suggestReplCompletions({ line: 'run ', files: files, cwd: 'src' });
expect(hasLabel(cwdSrc, 'a.bel'), 'cwd file as basename');
expect(hasLabel(cwdSrc, 'src/b.bel'), 'ambiguous cwd b → full path');
expect(hasLabel(cwdSrc, 'lib/b.bel'), 'ambiguous other-dir full path');
expect(!hasLabel(cwdSrc, 'b.bel'), 'never short when basename ambiguous');
expectEq(
  labels(cwdSrc).join('|'),
  'a.bel|src/b.bel|foo.cfg|lib/b.bel|lib/bar.cfg|root.bel',
  'cwd first, then path-alpha (folder groups)',
);

var harmony = suggestReplCompletions({
  line: 'run ',
  files: [
    { id: '1', name: 'cp_linear.bel' },
    { id: '2', name: 'main.bel' },
    { id: '3', name: 'harmony-lemma-formalization/5_theorem1.bel' },
    { id: '4', name: 'harmony-lemma-formalization/1_definitions.bel' },
    { id: '5', name: 'harmony-lemma-formalization/all.cfg' },
    { id: '6', name: 'harmony-lemma-formalization/8_theorem2.bel' },
    { id: '7', name: 'cp_statics.bel' },
  ],
  cwd: '',
});
expectEq(
  labels(harmony).join('|'),
  'cp_linear.bel|cp_statics.bel|main.bel|harmony-lemma-formalization/1_definitions.bel|harmony-lemma-formalization/5_theorem1.bel|harmony-lemma-formalization/8_theorem2.bel|harmony-lemma-formalization/all.cfg',
  'root alpha then folder numeric',
);

var navDot = suggestReplCompletions({ line: 'run ./a', files: files, cwd: 'src' });
expect(hasLabel(navDot, 'a.bel') || hasLabel(navDot, './a.bel'), 'nav ./ filters to a');

var navUp = suggestReplCompletions({ line: 'run ../root', files: files, cwd: 'src' });
expect(hasLabel(navUp, '~/root.bel') || hasLabel(navUp, 'root.bel'), 'nav ../ to root.bel');

var navHome = suggestReplCompletions({ line: 'run ~/lib/b', files: files, cwd: 'src' });
expect(hasLabel(navHome, 'lib/b.bel'), 'nav ~/lib/b');

var suite = suggestReplCompletions({ line: 'run suite f', files: files, cwd: 'src' });
expect(hasLabel(suite, 'foo'), 'suite foo from prefix');

var folder = suggestReplCompletions({ line: 'run folder l', files: files, cwd: 'src' });
expect(hasLabel(folder, 'lib') || labels(folder).some(function (l) { return l.indexOf('lib') !== -1; }), 'folder lib');

var amalgam = suggestReplCompletions({ line: 'run &a', files: files, cwd: 'src' });
expect(amalgam && amalgam.amalgam, 'amalgam context');
expect(hasLabel(amalgam, 'a.bel'), 'amalgam path suggest');

// suggestPathLabel ambiguous
var counts = { 'b.bel': 2, 'a.bel': 1 };
expectEq(suggestPathLabel('src/b.bel', 'src', counts), 'src/b.bel', 'ambiguous → full');
expectEq(suggestPathLabel('src/a.bel', 'src', counts), 'a.bel', 'unique cwd → basename');

console.log('OK repl-autocomplete (suggest)');
