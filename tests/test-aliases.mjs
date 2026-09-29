import {
  expandBelAliases,
  maybeExpandBelAliases,
  readAliasActivationMode,
  getAliasPairs,
  invalidateAliasPairs,
  normalizeAliasPairs,
  defaultAliasPairs,
} from '../js/editor-src/aliases.mjs';
import { withSettings } from './_settings.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

expect(expandBelAliases('\\Leftrightarrow') === '⇔', 'longest alias');
expect(expandBelAliases('A \\lor B') === 'A ∨ B', 'lor alias');
expect(expandBelAliases('x |- y -> z') === 'x ⊢ y → z', 'ascii shortcuts');

const once = expandBelAliases('\\lambda \\lor');
expect(once === 'λ ∨', 'multi alias');
expect(expandBelAliases(once) === once, 'idempotent');

// Greedy scan window must include text already present after an insertion.
function aliasScanWindow(docLen, fromB, toB) {
  const MAX = 13; // \\Leftrightarrow length
  return {
    from: Math.max(0, fromB - MAX + 1),
    to: Math.min(docLen, toB + MAX - 1),
  };
}
const doc = '\\land';
const win = aliasScanWindow(doc.length, 0, 3);
const chunk = doc.slice(win.from, win.to);
expect(chunk === '\\land', 'paste-before scan window includes suffix');
expect(expandBelAliases(chunk) === '∧', 'paste-before completes alias');

withSettings({ aliasActivation: 'strict' }, () => {
  expect(maybeExpandBelAliases('\\lor') === '\\lor', 'strict leaves text');
});
withSettings({ aliasActivation: 'greedy' }, () => {
  expect(maybeExpandBelAliases('\\lor') === '∨', 'greedy expands text');
});
expect(readAliasActivationMode() === 'greedy', 'no Settings on the page: the table default, greedy');

invalidateAliasPairs();
expect(defaultAliasPairs().length > 10, 'defaults exist');
expect(normalizeAliasPairs([['zz', '1'], ['z', '2'], ['zz', 'dup']])[0][0] === 'zz', 'normalize longest first + dedupe');

withSettings({ aliasActivation: 'strict', aliasPairs: [['hello', 'world'], ['->', '→']] }, (S) => {
  expect(expandBelAliases('hello -> x') === 'world → x', 'custom pairs expand');
  expect(getAliasPairs().some(([f]) => f === 'hello'), 'custom pair listed');
  expect(!getAliasPairs().some(([f]) => f === '\\lambda'), 'defaults replaced when custom stored');

  // No invalidation call: the cache follows Settings' revision, whatever changed it.
  S.set('aliasPairs', null);
  expect(expandBelAliases('\\lambda') === 'λ', 'clearing the custom pairs restores the defaults at once');
  S.importBundle({ kind: 'beljar-settings', values: { aliasPairs: [['yo', 'hey']] } });
  expect(expandBelAliases('yo') === 'hey', 'and an import reaches the typing path too (it once did not)');
});

console.log('OK jar-aliases');
