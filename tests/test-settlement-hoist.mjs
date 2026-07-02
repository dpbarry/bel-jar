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

// ── Line mapping under a hoisted pragma (the img2 "error on a blank line" bug) ─
// A file with a leading pragma must keep its body lines aligned: an error on the
// schema (doc line 2) must NOT drift onto the blank line below it.
{
  const src = '--nostrengthen\nschema ctx = down A;\n\nrec r : x = ?;';
  // doc: 1=pragma, 2=schema, 3=blank, 4=rec
  const lineOf = (code, needle) => code.split('\n').findIndex((l) => l.includes(needle)) + 1;

  // No prelude: the body must be byte-identical, so schema stays on line 2.
  const solo = assembleCheckerCode(src, null);
  expect(lineOf(solo.code, 'schema') === 2,
    `no-prelude: schema stays on doc line 2, got ${lineOf(solo.code, 'schema')}`);
  expect(solo.code === src, 'no-prelude assembled code is the file unchanged (no blank-line shift)');

  // With prelude: the in-place blank keeps the body aligned; shifting an error
  // reported at the schema's assembled line back by offsetLines yields doc line 2.
  const asm = assembleCheckerCode(src, prelude);
  const schemaAsm = lineOf(asm.code, 'schema');
  expect(schemaAsm - asm.prelude.offsetLines === 2,
    `with-prelude: schema maps back to doc line 2, got ${schemaAsm - asm.prelude.offsetLines}`);
  expect(asm.fileOffset > 0 && asm.code.slice(asm.fileOffset).includes('schema'),
    'fileOffset points at the active file body, not the prelude');
  // The blanked-in-place pragma keeps the body's line COUNT identical to the doc.
  const bodyTail = asm.code.split('\n').slice(asm.prelude.offsetLines);
  expect(bodyTail.length === src.split('\n').length,
    'with-prelude body preserves the doc line count (pragma blanked, not removed)');
}

console.log('OK settlement hoists global pragmas + keeps body line mapping under a hoisted pragma');
