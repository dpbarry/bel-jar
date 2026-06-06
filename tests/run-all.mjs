// One-shot test runner — runs every tests/test-*.mjs in a single `node`
// invocation so the whole suite is one command (one approval), not 30+.
// Each test file calls process.exit on failure, so we run them as child
// processes to isolate that and aggregate the results.
//
// Usage:
//   node tests/run-all.mjs            # all test-*.mjs
//   node tests/run-all.mjs semantic   # only files whose name includes "semantic"
//   node tests/run-all.mjs nav rename # any file matching any filter substring
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2);

const files = readdirSync(here)
  .filter((f) => f.startsWith('test-') && f.endsWith('.mjs'))
  .filter((f) => filters.length === 0 || filters.some((q) => f.includes(q)))
  .sort();

if (files.length === 0) {
  console.error('No test files matched', filters);
  process.exit(1);
}

let pass = 0;
const failures = [];
const t0 = Date.now();

for (const file of files) {
  const r = spawnSync(process.execPath, [join(here, file)], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  const ok = r.status === 0;
  if (ok) {
    pass += 1;
    const last = out.split('\n').filter(Boolean).pop() || file;
    console.log(`  ok   ${file}  ${last.replace(/^OK\s*/, '')}`.trimEnd());
  } else {
    failures.push(file);
    console.log(`  FAIL ${file}`);
    if (out) console.log(out.split('\n').map((l) => `       ${l}`).join('\n'));
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${pass}/${files.length} passed in ${secs}s`);
if (failures.length) {
  console.log(`failed: ${failures.join(', ')}`);
  process.exit(1);
}
