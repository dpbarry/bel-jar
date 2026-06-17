import { Text } from '@codemirror/state';
import { parser } from '../editor-src/beluga-parser.js';
import { createSemanticEngine } from '../editor-src/semantic/semantic-engine.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const snippet = `LF sty : type = | SPr : sty -> sty -> sty ;
LF styOf : stm -> sty -> type =
  | SO/pair : styOf M A -> styOf N B -> styOf (spair M N) (SProd A B)
;
`;

const doc = Text.of(snippet.split('\n'));
const tree = parser.parse(snippet);

const engine = createSemanticEngine();
engine.update(tree, doc);

expect(engine.getBelugaDiagnostics().length === 0, 'no beluga diags before settlement/output');

const line = doc.lineAt(snippet.indexOf('SProd')).number;
const raw = `File "input.bel", line ${line}, column 59:\nError: Unbound identifier SProd.\n`;
const diags = engine.applyBelugaOutput(raw, { ok: false });
expect(diags.length === 1, `expected one beluga diag, got ${diags.length}`);
expect(engine.getBelugaDiagnostics().length === 1, 'getBelugaDiagnostics after applyBelugaOutput');
expect(doc.sliceString(diags[0].from, diags[0].to) === 'SProd', 'diag should point at SProd');

const successRaw = `## Type Reconstruction begin: input.bel ##
## Type Reconstruction done: input.bel ##
## Holes: input.bel ##
Meta-context:
Goal:`;
engine.applyBelugaOutput(successRaw, { ok: true });
expect(engine.getBelugaDiagnostics().length === 0, 'success output must not create fallback lint');
expect(engine.getSnapshot().checker.ok === true, 'success must mark checker ok');

console.log('OK beluga lint refresh (settlement checker + forceLinting path)');
