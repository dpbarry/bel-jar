import { belugaLanguage } from '../js/editor-src/language.mjs';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';

const parser = belugaLanguage.parser;
const hi = tagHighlighter([
  { tag: t.typeOperator, class: 'arrow' },
  { tag: t.controlKeyword, class: 'control' },
  { tag: t.operator, class: 'op' },
  { tag: t.special(t.variableName), class: 'param' },
  { tag: t.special(t.typeName), class: 'subst' },
  { tag: t.definition(t.special(t.variableName)), class: 'param-def' },
]);

function expect(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const lf = parser.parse("↓ok (_ : ≻ K K') → tp K → tp K'");
const lfHits = [];
highlightTree(lf, hi, (f, to, cls) => lfHits.push({ text: "↓ok (_ : ≻ K K') → tp K → tp K'".slice(f, to), cls }));
expect(lfHits.some((h) => h.text === '→' && h.cls === 'arrow'), 'LF ArrowOp highlights →');

const comp = parser.parse('rec _ : tm A -> pat B = ?;');
const compHits = [];
highlightTree(comp, hi, (f, to, cls) => compHits.push({ text: 'rec _ : tm A -> pat B = ?;'.slice(f, to), cls }));
expect(compHits.some((h) => h.text === '->' && h.cls === 'arrow'), 'comp ArrowOp highlights ->');

const ctx = parser.parse('rec _ : [Δ ⊢ tm K[] A[]] → type = ?;');
const ctxHits = [];
highlightTree(ctx, hi, (f, to, cls) => ctxHits.push({ text: 'rec _ : [Δ ⊢ tm K[] A[]] → type = ?;'.slice(f, to), cls }));
expect(ctxHits.some((h) => (h.text === '⊢' || h.text === '|-') && h.cls === 'control'), 'Turnstile highlights');

const mlam = parser.parse('rec _ : type = mlam Δ #p ⇒ ?;');
const mlamHits = [];
highlightTree(mlam, hi, (f, to, cls) => mlamHits.push({ text: 'rec _ : type = mlam Δ #p ⇒ ?;'.slice(f, to), cls }));
expect(mlamHits.some((h) => h.text === '#p' && h.cls === 'param-def'), 'mlam ParameterVariable highlights #p');

const subst = parser.parse('rec _ : LogSub [Δ] $[Φ ⊢ $ρ] → type = ?;');
const substHits = [];
highlightTree(subst, hi, (f, to, cls) => substHits.push({ text: 'rec _ : LogSub [Δ] $[Φ ⊢ $ρ] → type = ?;'.slice(f, to), cls }));
expect(substHits.some((h) => h.text === '$ρ' && h.cls === 'subst'), 'SubstitutionVariable highlights $ρ');
expect(substHits.some((h) => h.text === '$' && h.cls === 'op'), 'SubstitutionType highlights leading $');

const paramType = parser.parse('rec _ : #[Δ ⊢ #p] → type = ?;');
const paramTypeHits = [];
highlightTree(paramType, hi, (f, to, cls) => paramTypeHits.push({ text: 'rec _ : #[Δ ⊢ #p] → type = ?;'.slice(f, to), cls }));
expect(paramTypeHits.some((h) => h.text === '#' && h.cls === 'op'), 'ParameterType highlights leading #');

const obj = parser.parse("rec _ : type = fn ls : [Δ', x:tm K'[] B[] ⊢ #p[.., x]] => ls;");
const objHits = [];
highlightTree(obj, hi, (f, to, cls) => objHits.push({ text: "rec _ : type = fn ls : [Δ', x:tm K'[] B[] ⊢ #p[.., x]] => ls;".slice(f, to), cls }));
expect(objHits.some((h) => h.text.startsWith('#p') && h.cls === 'param'), 'contextual ParameterVariable highlights #p[..]');

console.log('OK highlight operators and meta vars');
