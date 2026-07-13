import fs from 'node:fs';
import vm from 'node:vm';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function loadScript(url) {
  const src = fs.readFileSync(url, 'utf8');
  const sandbox = { window: undefined, globalThis: {}, self: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis;
}

const g = loadScript(new URL('../js/harpoon-glyphs.js', import.meta.url));
const HG = g.HarpoonGlyphs;
expect(HG && typeof HG.displayBeluga === 'function', 'HarpoonGlyphs loads');

expect(HG.displayBeluga('[ |- nat -> nat ]').includes('⊢'), '|- becomes turnstile');
expect(!HG.displayBeluga('[ |- nat -> nat ]').includes('|-'), 'no ASCII turnstile left');
expect(HG.displayBeluga('A => B').includes('⇒'), '=> becomes fat arrow');
expect(HG.displayBeluga('A -> B').includes('→'), '-> becomes arrow');

const chip = HG.compactTypeLabel('[ |- D ⊕ X22.]');
expect(chip.includes('⊢'), 'compact arm chip shows turnstile');
expect(chip.includes('D ⊕ X22'), 'compact arm chip keeps conclusion');
expect(!chip.includes('|-'), 'compact arm chip drops ASCII turnstile');

console.log('OK test-harpoon-glyphs');
