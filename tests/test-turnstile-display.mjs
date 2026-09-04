// Beluga's own output is ASCII: `|-`, `->`, `=>`. The editor DISPLAYS glyphs:
// ⊢, →, ⇒. `normalizeType()` in js/editor-src/format/type-render.mjs is the one
// place that converts, and `renderTypeInto()` wraps it.
//
// The rule is opt-in, which is exactly why raw `|-` keeps surfacing: every new
// surface that shows a type has to remember. This test removes the remembering.
// Any type-ish value interpolated into a string that also contains prose must go
// through the normalizer, unless the file is listed below as building Beluga
// SOURCE (where the ASCII spelling is the correct one to emit) or an internal
// key that is never shown.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { normalizeType } from '../js/editor-src/format/type-render.mjs';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// ── the normalizer itself ─────────────────────────────────────────────────────
expect(normalizeType('[ |- dual A A\'] -> [ |- dual A\' A]') === '[⊢ dual A A\'] → [⊢ dual A\' A]',
  'normalizeType converts every turnstile and arrow in a compound type');
expect(normalizeType('a => b') === 'a ⇒ b', 'fat arrow');
expect(normalizeType('|-#p') === '⊢#p', 'hashed turnstile survives');
expect(normalizeType(null) === '', 'null is empty');

// ── no raw goal text in prose ─────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'js');

// Files that legitimately handle the ASCII spelling: they emit Beluga source,
// parse checker output, or build dedupe keys that are never rendered.
const ALLOW = new Set([
  'editor-src/format/type-render.mjs',
  'editor-src/prover/hole-report.mjs',
  'editor-src/prover/prover-moves.mjs',
  'editor-src/prover/prover-synth.mjs',
  'editor-src/prover/prover-certify.mjs',
  'editor-src/harpoon/harpoon-program.mjs',
]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.mjs')) out.push(full);
  }
  return out;
}

// `${...goal...}` / `${...Type...}` inside a template literal.
const INTERP = /\$\{[^{}]*\b(?:goal|goalType|hole\.goal|compType)\b[^{}]*\}/g;
const offenders = [];

for (const file of walk(root, [])) {
  const rel = relative(root, file).split(sep).join('/');
  if (ALLOW.has(rel)) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    // Only lines that read as user-facing prose: a template literal carrying
    // several real words alongside the interpolation.
    if (!INTERP.test(line)) return;
    INTERP.lastIndex = 0;
    if (/dedupeKey|key:|id:|`\$\{[^`]*\}`\s*[,;)]/.test(line)) return;
    const prose = line.replace(/\$\{[^{}]*\}/g, ' ').match(/[A-Za-z']{3,}/g) || [];
    if (prose.length < 4) return;
    if (line.includes('normalizeType') || line.includes('renderTypeInto')) return;
    offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
  });
}

expect(
  offenders.length === 0,
  'a goal type is shown to the user without normalizeType — raw |- and -> will leak:\n       '
    + offenders.join('\n       ')
);

console.log(`OK turnstile display (normalizer correct, ${offenders.length} raw goal renders)`);
