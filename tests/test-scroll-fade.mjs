// ScrollFade.computeSides — the pure edge-decision function behind the generic
// scroll-fade utility (js/ui/scroll-fade.js). Given scroll metrics it returns which
// edges overflow (and thus should fade). DOM-shimmed: the file is an IIFE that
// attaches to a global, so we provide a `window` and import for side effects.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

// Load the IIFE against a fake global.
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'ui', 'scroll-fade.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(src)();
const SF = globalThis.ScrollFade;
expect(SF && typeof SF.computeSides === 'function', 'ScrollFade.computeSides is exported');

const sides = (m) => SF.computeSides(m);

// No overflow → no fades.
expect(JSON.stringify(sides({
  scrollTop: 0, scrollLeft: 0, scrollWidth: 100, scrollHeight: 100,
  clientWidth: 100, clientHeight: 100, axis: 'both',
})) === JSON.stringify({ top: false, bottom: false, left: false, right: false }),
  'no overflow → no fades');

// Horizontal overflow, scrolled to start → only right fades.
let s = sides({ scrollTop: 0, scrollLeft: 0, scrollWidth: 300, scrollHeight: 20,
  clientWidth: 100, clientHeight: 20, axis: 'x' });
expect(!s.left && s.right, 'x-overflow at start → fade right only');

// Scrolled to the middle → both left and right fade.
s = sides({ scrollTop: 0, scrollLeft: 100, scrollWidth: 300, scrollHeight: 20,
  clientWidth: 100, clientHeight: 20, axis: 'x' });
expect(s.left && s.right, 'x-overflow in middle → fade both sides');

// Scrolled to the end → only left fades.
s = sides({ scrollTop: 0, scrollLeft: 200, scrollWidth: 300, scrollHeight: 20,
  clientWidth: 100, clientHeight: 20, axis: 'x' });
expect(s.left && !s.right, 'x-overflow at end → fade left only');

// Vertical overflow respected only when axis allows it.
s = sides({ scrollTop: 50, scrollLeft: 0, scrollWidth: 100, scrollHeight: 300,
  clientWidth: 100, clientHeight: 100, axis: 'x' });
expect(!s.top && !s.bottom, 'axis:x ignores vertical overflow');
s = sides({ scrollTop: 50, scrollLeft: 0, scrollWidth: 100, scrollHeight: 300,
  clientWidth: 100, clientHeight: 100, axis: 'both' });
expect(s.top && s.bottom, 'axis:both fades top+bottom when scrolled mid-vertically');

// Sub-pixel overflow is ignored (no spurious fades).
s = sides({ scrollTop: 0, scrollLeft: 0, scrollWidth: 100.4, scrollHeight: 20,
  clientWidth: 100, clientHeight: 20, axis: 'x' });
expect(!s.left && !s.right, 'sub-pixel overflow does not trigger a fade');

console.log('OK scroll-fade (computeSides: none/start/middle/end, axis gating, sub-pixel)');
