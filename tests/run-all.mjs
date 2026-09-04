// One-shot test runner — runs every tests/test-*.mjs in a single `node`
// invocation so the whole suite is one command (one approval), not 30+.
// Each test file calls process.exit on failure, so we run them as child
// processes to isolate that and aggregate the results.
//
// Usage:
//   node tests/run-all.mjs            # all test-*.mjs
//   node tests/run-all.mjs semantic   # only files whose name includes "semantic"
//   node tests/run-all.mjs nav rename # any file matching any filter substring
//
// Parallelism: BELJAR_TEST_JOBS (default 8) caps concurrent child processes.
// Beluga-heavy files run serially afterward so worker RAM spikes do not flake
// lighter tests (e.g. test-hover-source-fallback).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2);
const MAX_JOBS = Math.max(1, parseInt(process.env.BELJAR_TEST_JOBS || '', 10) || Math.min(8, os.cpus().length));

/** Worker-heavy; keep off the parallel pool. */
const SERIAL = new Set([
  'test-library-beluga.mjs',
  'test-hint-stress-beluga.mjs',
]);

/**
 * `--fast` skips the Beluga integration files: 7 of them, ~44s of a ~92s run,
 * driving the real type-checker through the WASM shim. Nothing in the UI, the
 * keymap or the strip can break them, so paying that on every iteration is
 * waste.
 *
 * ⛔ It is OPT-IN, and it says what it skipped. The default stays complete,
 * because a green `npm test` that quietly no longer means "Beluga still
 * type-checks" is a trap, not a saving — and the one thing worse than a slow
 * gate is a fast one you believe.
 */
const fast = filters.includes('--fast');
const queries = filters.filter((f) => f !== '--fast');
const isBeluga = (f) => f.includes('beluga');

const matched = readdirSync(here)
  .filter((f) => f.startsWith('test-') && f.endsWith('.mjs'))
  .filter((f) => queries.length === 0 || queries.some((q) => f.includes(q)))
  .sort();
const skipped = fast ? matched.filter(isBeluga) : [];
const files = fast ? matched.filter((f) => !isBeluga(f)) : matched;

if (files.length === 0) {
  console.error('No test files matched', queries);
  process.exit(1);
}

const parallelFiles = files.filter((f) => !SERIAL.has(f));
const serialFiles = files.filter((f) => SERIAL.has(f));

let pass = 0;
const failures = [];
const t0 = Date.now();
let next = 0;
let active = 0;
let phase = 'parallel';

function runChild(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], { encoding: 'utf8' });
    let out = '';
    child.stdout?.on('data', (chunk) => { out += chunk; });
    child.stderr?.on('data', (chunk) => { out += chunk; });
    child.on('close', (code) => {
      const trimmed = out.trim();
      const ok = code === 0;
      if (ok) {
        pass += 1;
        const last = trimmed.split('\n').filter(Boolean).pop() || file;
        console.log(`  ok   ${file}  ${last.replace(/^OK\s*/, '')}`.trimEnd());
      } else {
        failures.push(file);
        console.log(`  FAIL ${file}`);
        if (trimmed) console.log(trimmed.split('\n').map((l) => `       ${l}`).join('\n'));
      }
      resolve();
    });
  });
}

async function runSerial() {
  for (const file of serialFiles) {
    await runChild(file);
  }
  finish();
}

function runNext() {
  const pool = phase === 'parallel' ? parallelFiles : [];
  while (active < MAX_JOBS && next < pool.length) {
    const file = pool[next++];
    active += 1;
    runChild(file).then(() => {
      active -= 1;
      if (next >= pool.length && active === 0) {
        if (serialFiles.length) runSerial();
        else finish();
      } else {
        runNext();
      }
    });
  }
}

function finish() {
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const serialNote = serialFiles.length ? `, ${serialFiles.length} serial` : '';
  console.log(`\n${pass}/${files.length} passed in ${secs}s (${MAX_JOBS} jobs${serialNote})`);
  if (failures.length) {
    console.log(`failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  // ⛔ Loud on success, not just in the docs. A fast run that looks exactly like
  // a full one is how "the suite is green" comes to mean less than it says.
  if (skipped.length) {
    console.log(`\n⚠  --fast skipped ${skipped.length} Beluga integration files.`);
    console.log('   This run did NOT verify that Beluga still type-checks.');
    console.log('   Run `npm test` before calling anything done.');
  }
}

if (parallelFiles.length) runNext();
else runSerial();
