import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { assembleCheckerCode } from '../editor-src/project-prelude.mjs';
import { createSyntaxStore } from '../editor-src/semantic/syntax-store.mjs';
import { createSettlement } from '../editor-src/semantic/settlement.mjs';
import { createCheckerStore } from '../editor-src/semantic/checker-store.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const prelude = {
  code: 'LF o : type = ;',
  spans: [{ id: 'a', name: 'base.elf', startLine: 1, endLine: 1 }],
  offsetLines: 2,
  names: new Set(['o']),
};

const body = '--nostrengthen\nLF nd : o -> type = ;';
const doc = Text.of(body.split('\n'));
const syntax = createSyntaxStore().update(parser.parse(body), doc);

const checks = [];
const client = {
  fingerprint: (code) => `fp:${code.length}`,
  checkResult: async (code) => {
    checks.push(code);
    if (code.startsWith('--nostrengthen')) {
      return { ok: true, output: '## Type Reconstruction done: input.bel ##\n' };
    }
    return {
      ok: false,
      output: 'File "input.bel", line 1, column 1\nError: Failed to parse Expected the parser input to end here.\n',
    };
  },
};

const store = createCheckerStore();
const settlement = createSettlement({
  belugaClient: client,
  checkerStore: store,
  getCheckContext: () => ({ doc, prelude, fileCode: body }),
});
await settlement.settleNow(syntax, 0);

expect(checks[0]?.startsWith('--nostrengthen'), 'settlement must hoist global pragmas before prelude');
expect(checks[0]?.includes('LF o : type'), 'prelude follows hoisted pragma');
expect(store.getSnapshot().ok, 'hoisted check should succeed');

const first = assembleCheckerCode(body, prelude);
const again = assembleCheckerCode(body, prelude);
expect(again.prelude.offsetLines === first.prelude.offsetLines,
  're-assemble from the same raw prelude must keep a stable line map');

console.log('OK settlement hoists global pragmas');
