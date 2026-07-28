import {
  parseRunCommand,
  resolveRunTarget,
  resolveSuiteCfg,
  resolveFolderPath,
  formatRunPath,
  formatRunCaption,
  formatRunStatusName,
  rewriteRunStatusLabel,
  normalizeWorkspacePath,
} from '../js/repl/repl-run-cmd.mjs';

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

// ── parse ─────────────────────────────────────────────────────────────────────

function kindOf(s) {
  var p = parseRunCommand(s);
  expect(!p.error, 'parse ok: ' + s + ' → ' + (p.error || ''));
  return p.kind;
}

expectEq(kindOf('run'), 'fileActive', 'bare run');
expectEq(kindOf('run &'), 'hereActive', 'bare run &');
expectEq(kindOf('run b.bel'), 'file', 'run file');
expectEq(parseRunCommand('run b.bel').path, 'b.bel', 'file path');
expectEq(kindOf('run &b.bel'), 'here', 'run amalgam');
expectEq(parseRunCommand('run &b.bel').path, 'b.bel', 'amalgam path');
expectEq(kindOf('run suite Foo'), 'suite', 'run suite');
expectEq(parseRunCommand('run suite Foo').suite, 'Foo', 'suite name');
expectEq(parseRunCommand('run suite Foo.cfg').suite, 'Foo', 'suite strips .cfg');
expectEq(kindOf('run folder src'), 'folder', 'run folder');
expectEq(parseRunCommand('run folder src').path, 'src', 'folder path');
expectEq(parseRunCommand('run folder (root)').path, '', 'folder root label');
expectEq(kindOf('run project'), 'project', 'run project');
expectEq(kindOf('%:run &x.bel'), 'here', 'strips %:');

expect(!!parseRunCommand('run & b.bel').error, 'reject space after &');
expect(/no space/i.test(parseRunCommand('run & b.bel').error), 'space-after-& message');
expect(!!parseRunCommand('run suite').error, 'reject suite without name');
expect(!!parseRunCommand('run suite Foo bar').error, 'reject suite extra args');
expect(!!parseRunCommand('run folder a b').error, 'reject folder extra args');
expect(!!parseRunCommand('run a.bel b.bel').error, 'reject two paths');
expect(!!parseRunCommand('types').error, 'not a run command');

// ── formatRunPath ─────────────────────────────────────────────────────────────

expectEq(formatRunPath('b.bel', ''), 'b.bel', 'root same-dir basename');
expectEq(formatRunPath('src/b.bel', 'src'), 'b.bel', 'cwd-relative → basename');
expectEq(formatRunPath('other/b.bel', 'src'), 'other/b.bel', 'other dir → full');
expectEq(formatRunCaption('src/b.bel', 'src', false), 'run b.bel', 'caption file');
expectEq(formatRunCaption('src/b.bel', 'src', true), 'run &b.bel', 'caption amalgam');
expectEq(formatRunCaption('lib/c.bel', 'src', true), 'run &lib/c.bel', 'caption amalgam cross-dir');
expectEq(formatRunStatusName('src/b.bel', 'src', false), 'b.bel', 'status file');
expectEq(formatRunStatusName('src/b.bel', 'src', true), '&b.bel', 'status amalgam');
expectEq(formatRunStatusName('lib/c.bel', 'src', true), '&lib/c.bel', 'status amalgam cross-dir');
expectEq(
  rewriteRunStatusLabel(
    '## Type Reconstruction begin: a.bel ##\n## Type Reconstruction done:  a.bel ##\n## Holes: a.bel ##\nFile "a.bel", line 1:',
    'a.bel',
    '&a.bel',
  ),
  '## Type Reconstruction begin: &a.bel ##\n## Type Reconstruction done:  &a.bel ##\n## Holes: &a.bel ##\nFile "a.bel", line 1:',
  'status stamp keeps File paths',
);

// ── normalizeWorkspacePath ────────────────────────────────────────────────────

expectEq(normalizeWorkspacePath('a.bel', 'src'), null, 'plain → legacy');
expectEq(normalizeWorkspacePath('src/a.bel', 'lib'), null, 'plain nested → legacy');
expectEq(normalizeWorkspacePath('./a.bel', 'src').path, 'src/a.bel', './ under cwd');
expectEq(normalizeWorkspacePath('../a.bel', 'src').path, 'a.bel', '../ up one');
expectEq(normalizeWorkspacePath('../../a.bel', 'deep/nest').path, 'a.bel', '../../ stacked');
expectEq(normalizeWorkspacePath('../lib/b.bel', 'src').path, 'lib/b.bel', '../ into sibling');
expectEq(normalizeWorkspacePath('~/src/a.bel', 'lib').path, 'src/a.bel', '~/ from root');
expectEq(normalizeWorkspacePath('~', 'src').path, '', '~ alone is root');
expectEq(normalizeWorkspacePath('src/../lib/b.bel', 'x').path, 'lib/b.bel', 'mid-path .. from root');
expectEq(normalizeWorkspacePath('src/./a.bel', '').path, 'src/a.bel', 'mid-path .');
expect(/escapes/i.test(normalizeWorkspacePath('../a.bel', '').error || ''), 'escape above root');
expect(/escapes/i.test(normalizeWorkspacePath('../../x', 'src').error || ''), 'stacked escape');
expect(/Only ~/.test(normalizeWorkspacePath('~user/a.bel', 'src').error || ''), 'reject ~user');
expectEq(normalizeWorkspacePath('.\\a.bel', 'src').path, 'src/a.bel', 'backslash → slash');

// ── resolveRunTarget ──────────────────────────────────────────────────────────

var files = [
  { id: '1', name: 'src/a.bel' },
  { id: '2', name: 'src/b.bel' },
  { id: '3', name: 'lib/b.bel' },
  { id: '4', name: 'src/foo.cfg' },
  { id: '5', name: 'lib/bar.cfg' },
  { id: '6', name: 'deep/nest/c.bel' },
  { id: '7', name: 'root.bel' },
];

expectEq(resolveRunTarget('src/b.bel', { files: files, cwd: 'src' }).id, '2', 'exact path');
expectEq(resolveRunTarget('a.bel', { files: files, cwd: 'src' }).id, '1', 'cwd-joined');
expectEq(resolveRunTarget('a.bel', { files: files, cwd: 'lib' }).id, '1', 'unique basename from other cwd');
expectEq(resolveRunTarget('b.bel', { files: files, cwd: 'src' }).id, '2', 'cwd-joined before basename');
expectEq(resolveRunTarget('b.bel', { files: files, cwd: 'lib' }).id, '3', 'cwd-joined lib/b.bel');
expect(!!resolveRunTarget('b.bel', { files: files, cwd: '' }).error, 'ambiguous basename at root cwd');
expect(/Ambiguous/.test(resolveRunTarget('b.bel', { files: files, cwd: '' }).error || ''), 'ambiguous message');
expectEq(resolveRunTarget('src/b.bel', { files: files, cwd: 'lib' }).id, '2', 'exact wins over cwd');
expect(!!resolveRunTarget('missing.bel', { files: files, cwd: 'src' }).error, 'missing file');

expectEq(resolveRunTarget('./a.bel', { files: files, cwd: 'src' }).id, '1', 'resolve ./');
expectEq(resolveRunTarget('../root.bel', { files: files, cwd: 'src' }).id, '7', '../ to root');
expectEq(resolveRunTarget('../lib/b.bel', { files: files, cwd: 'src' }).id, '3', '../ sibling');
expectEq(resolveRunTarget('../../src/a.bel', { files: files, cwd: 'deep/nest' }).id, '1', '../../ stacked');
expectEq(resolveRunTarget('~/lib/b.bel', { files: files, cwd: 'src' }).id, '3', '~/ resolve');
expectEq(resolveRunTarget('src/../lib/b.bel', { files: files, cwd: 'src' }).id, '3', 'mid-path .. resolve');
expect(!!resolveRunTarget('../missing.bel', { files: files, cwd: 'src' }).error, 'nav missing');
expect(/escapes/i.test(resolveRunTarget('../x.bel', { files: files, cwd: '' }).error || ''), 'resolve escape');
expectEq(resolveRunTarget('./b.bel', { files: files, cwd: 'src' }).id, '2', './b.bel in src');
expect(!!resolveRunTarget('./a.bel', { files: files, cwd: 'lib' }).error, './a.bel no basename fallback when nav misses');

// ── resolveSuiteCfg ───────────────────────────────────────────────────────────

expectEq(resolveSuiteCfg('foo', files, 'src').path, 'src/foo.cfg', 'suite via cwd');
expectEq(resolveSuiteCfg('foo.cfg', files, 'src').path, 'src/foo.cfg', 'suite with .cfg');
expectEq(resolveSuiteCfg('bar', files, 'src').path, 'lib/bar.cfg', 'suite unique basename');
expect(!!resolveSuiteCfg('nope', files, 'src').error, 'missing suite');
expectEq(resolveSuiteCfg('~/src/foo', files, 'lib').path, 'src/foo.cfg', 'suite ~/');
expectEq(resolveSuiteCfg('../src/foo', files, 'lib').path, 'src/foo.cfg', 'suite ../');

// ── resolveFolderPath ─────────────────────────────────────────────────────────

expectEq(resolveFolderPath('src', files, '').path, 'src', 'folder exact');
expectEq(resolveFolderPath('lib', files, 'src').path, 'lib', 'folder other');
expectEq(resolveFolderPath('', files, 'src').path, '', 'folder root empty');
expectEq(resolveFolderPath('(root)', files, 'src').path, '', 'folder (root)');
expect(!!resolveFolderPath('ghost', files, 'src').error, 'missing folder');
expectEq(resolveFolderPath('~/lib', files, 'src').path, 'lib', 'folder ~/');
expectEq(resolveFolderPath('../lib', files, 'src').path, 'lib', 'folder ../');
expectEq(resolveFolderPath('~', files, 'src').path, '', 'folder ~ → root');
expectEq(resolveFolderPath('../../deep/nest', files, 'deep/nest').path, 'deep/nest', 'folder stacked');

console.log('OK repl-run-cmd (parse, resolve, captions, nav paths)');
