import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) {
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'ui', 'toasts.js'), 'utf8');
// eslint-disable-next-line no-new-func
new Function(src)();
const T = globalThis.Toasts;
expect(T && T._pure, 'Toasts._pure exported');

const { normalizeDuration, parseOpts, shouldNotify, DEFAULT_DURATION_MS } = T._pure;

expect(DEFAULT_DURATION_MS === 3500, 'default duration is 3.5s');
expect(shouldNotify('error') === false, 'errors do not auto-notify');
expect(shouldNotify('error', false) === false, 'notify:false suppresses');
expect(shouldNotify('error', true) === true, 'notify:true forces inbox');
expect(shouldNotify('error', undefined, true) === true, 'durable:true forces inbox');
expect(shouldNotify('error', false, true) === false, 'notify:false wins over durable');
expect(shouldNotify('warn') === false, 'warnings do not notify');
expect(shouldNotify('success') === false, 'success does not notify');
expect(shouldNotify('info', true) === true, 'notify:true on info');
expect(normalizeDuration({}) === 3500, 'missing duration → default');
expect(normalizeDuration({ duration: 1200 }) === 1200, 'custom duration');
expect(normalizeDuration({ duration: 0 }) === null, '0 → indefinite');
expect(normalizeDuration({ duration: false }) === null, 'false → indefinite');
expect(normalizeDuration({ duration: null }) === null, 'null → indefinite');

const parsed = parseOpts('Hello', { kind: 'success', closable: true, durable: true });
expect(parsed.message === 'Hello', 'message preserved');
expect(parsed.kind === 'success', 'kind preserved');
expect(parsed.closable === true, 'closable preserved');
expect(parsed.durable === true, 'durable preserved');
expect(parsed.duration === 3500, 'parseOpts default duration');

console.log('OK toasts (duration parsing, durable opts)');
