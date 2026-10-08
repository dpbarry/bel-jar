import { Text } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { createSemanticEngine } from '../js/editor-src/semantic/semantic-engine.mjs';
import { syntaxLintTree } from '../js/editor-src/ide/syntax-lint.mjs';
import { collectFixityDiagnostics } from '../js/editor-src/infix.mjs';
import { rewriteNotGuarded } from '../js/editor-src/semantic/pragma-scope.mjs';
import { constructorTerm, renderApp } from '../js/editor-src/prover/hole-split.mjs';
import { lintQueryPragmaBounds } from '../js/editor-src/ide/query-diag.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function engine(src) {
  const e = createSemanticEngine();
  e.update(parser.parse(src), Text.of(src.split('\n')));
  return e;
}

{
  const src = `module Nats = struct
  nat : type.
  z : nat.
end;
--abbrev Nats N.
let y = [ |- N.z];
`;
  const e = engine(src);
  const snap = e.debugSnapshot();
  const mod = snap.symbols.find((s) => s.name === 'Nats' && s.namespace === 'module');
  const zee = snap.symbols.find((s) => s.name === 'z');
  expect(mod && zee, 'module and constant symbols exist');
  const heads = snap.references.filter((r) => r.name === 'N' && src.slice(r.range.from, r.range.to + 2) === 'N.z');
  expect(heads.length === 1 && heads[0].symbolId === mod.id, 'abbrev N resolves to the module');
  const tails = snap.references.filter((r) => r.name === 'z' && r.range.from > src.indexOf('N.z'));
  expect(tails.length === 1 && tails[0].symbolId === zee.id, 'N.z resolves to the constant in the module');
  const members = e.stores.symbols.membersOfModule('N', src.length);
  expect(members && members.some((m) => m.name === 'z'), 'N. lists the members of the abbreviated module');
}

{
  const src = `module Nats = struct
  nat : type.
  z : nat.
end;
--open Nats.
let y = [ |- z];
`;
  const e = engine(src);
  const snap = e.debugSnapshot();
  const zee = snap.symbols.find((s) => s.name === 'z');
  const use = snap.references.find((r) => r.name === 'z' && r.range.from > src.indexOf('--open'));
  expect(zee && use && use.symbolId === zee.id, 'a name from an opened module resolves');
}

{
  const bad = 'LF\n';
  const guarded = '--not\nLF\n';
  const bare = syntaxLintTree(parser.parse(bad), Text.of(bad.split('\n')));
  const hidden = syntaxLintTree(parser.parse(guarded), Text.of(guarded.split('\n')));
  expect(bare.length > 0, 'a broken declaration is marked');
  expect(hidden.length === 0, '--not hides marks on the following declaration');
  const tree = parser.parse(guarded);
  const kept = rewriteNotGuarded(tree, [{
    from: guarded.indexOf('LF'),
    to: guarded.indexOf('LF') + 2,
    severity: 'error',
    message: "This signature entry was successfully reconstructed, but the `--not' pragma indicates that it was expected to fail reconstruction.",
  }]);
  expect(kept.length === 1 && guarded.slice(kept[0].from, kept[0].to).startsWith('--not'),
    'an unexpected success stays on the pragma');
}

{
  const src = `LF o : type = | land : o -> o -> o | lnot : o -> o | lbang : o -> o ;
--infix land 5 right.
--prefix lnot 10.
--postfix lbang 10.
LF p : o -> type =
  | bad : p (land a a)
  | okI : p (a land a)
  | okP : p (lnot a)
  | okS : p (a lbang)
  | badS : p (lbang a)
;
`;
  const diags = collectFixityDiagnostics(parser.parse(src), Text.of(src.split('\n')));
  const at = (needle) => {
    const i = src.indexOf(needle);
    return diags.some((d) => d.from >= i && d.from < i + needle.length);
  };
  expect(at('land a a'), 'a prefix use of an infix operator is an error');
  expect(!at('a land a'), 'an infix use is not an error');
  expect(!at('lnot a'), 'a prefix operator use is not an error');
  expect(!at('a lbang'), 'a postfix operator use is not an error');
  expect(at('lbang a'), 'a postfix operator without a left argument is an error');
  expect(renderApp(src, 'lbang', ['a']) === 'a lbang', 'postfix application is emitted after its argument');
  expect(renderApp(src, 'lnot', ['a']) === 'lnot a', 'prefix application is emitted before its argument');
  expect(renderApp(src, 'land', ['a', 'a']) === 'a land a', 'infix application stays between its arguments');
}

{
  const term = constructorTerm({
    name: 's',
    args: [{ bodyType: 'nat', higherOrder: false }],
  }, () => 'X', { code: '--name nat N x.\n' });
  expect(term === 's N', `a meta-variable of nat prefers the --name base (got ${term})`);
  const ho = constructorTerm({
    name: 'lam',
    args: [{
      higherOrder: true,
      binders: 1,
      bodyType: 'tp',
      binderCtx: [{ name: 'x', type: 'tp' }],
    }],
  }, () => 'X', {
    code: '--name tp T a.\n',
    contextProjection: true,
    ctxStr: 'g, x : tp',
  });
  expect(ho === 'lam (\\a. T[.., a, x])', `a computation variable prefers the --name base (got ${ho})`);
}

{
  const src = '--query * * oft z nat.\n';
  const diags = lintQueryPragmaBounds(parser.parse(src), Text.of(src.split('\n')));
  expect(diags.length === 1, 'an unlabeled * * query is still rejected');
}

console.log('OK pragma obedience');
