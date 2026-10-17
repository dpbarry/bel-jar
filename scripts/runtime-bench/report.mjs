// The tables in docs/wasm-runtime.md, from the benchmark's results:
//   node scripts/runtime-bench/report.mjs [results/runtime-bench]
// Reads node.json and chrome.json (whichever exist) and prints Markdown.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './corpus.mjs';

const dir = join(root, process.argv[2] || 'results/runtime-bench');
const load = (f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : null);
const node = load('node.json');
const chrome = load('chrome.json');
const ORDER = ['stable', 'stable-release', 'fast', 'fast-release', 'wasm', 'wasm-cps'];
const ordered = (builds) => ORDER.filter((n) => builds && builds[n]).concat(Object.keys(builds || {}).filter((n) => !ORDER.includes(n)));

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const geomean = (xs) => Math.exp(xs.reduce((n, x) => n + Math.log(x), 0) / xs.length);
const ms = (x) => (x == null ? '–' : x >= 10000 ? (x / 1000).toFixed(1) + ' s' : x >= 1000 ? (x / 1000).toFixed(2) + ' s' : Math.round(x) + ' ms');
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(2) + ' MB' : Math.round(b / 1e3) + ' KB');
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map((h, i) => (i ? '---:' : '---')).join('|') + '|', ...rows.map((r) => '| ' + r.join(' | ') + ' |')].join('\n');

function corpusRows(res, label) {
  const names = ordered(res.builds).filter((n) => res.builds[n].passes && res.builds[n].passes.rows);
  if (!names.length) return '';
  const warmOf = (n) => res.builds[n].passes.rows.map((r) => median(r.ms.slice(1)));
  const base = res.builds.stable && res.builds.stable.passes ? warmOf('stable') : null;
  const rows = names.map((n) => {
    const rows2 = res.builds[n].passes.rows;
    const first = rows2.reduce((t, r) => t + (r.ms[0] || 0), 0);
    const warm = warmOf(n);
    const total = warm.reduce((t, x) => t + (x || 0), 0);
    let speed = '–';
    let big = '–';
    if (base) {
      const ratios = base.map((b, i) => (b && warm[i] ? b / warm[i] : null)).filter((x) => x);
      speed = geomean(ratios).toFixed(1) + '×';
      const heavy = base.map((b, i) => [b, i]).filter(([b]) => b > 2000).map(([b, i]) => b / warm[i]);
      big = heavy.length ? geomean(heavy).toFixed(1) + '× (' + heavy.length + ')' : '–';
    }
    const okCount = rows2.filter((r) => r.ok[0]).length;
    return [n, ms(first), ms(total), speed, big, okCount + '/' + rows2.length];
  });
  return `**${label}: the whole corpus** (161 units; warm = the median of passes 2 on)\n\n`
    + table(['build', 'first pass', 'warm', 'per unit vs stable (geomean)', 'units stable takes > 2 s on', 'ok'], rows);
}

function coldRows(res, label) {
  const names = ordered(res.builds).filter((n) => res.builds[n].cold);
  if (!names.length) return '';
  const units = Object.keys(res.builds[names[0]].cold);
  return `**${label}: a fresh instance's first check** (median of 3)\n\n`
    + table(['build', ...units.map((u) => u.split('/').pop())], names.map((n) => [n, ...units.map((u) => ms(median((res.builds[n].cold[u] || []).map((x) => x.ms))))]));
}

function depthRows(res, label) {
  const names = ordered(res.builds).filter((n) => res.builds[n].depth);
  if (!names.length) return '';
  const fams = Object.keys(res.builds[names[0]].depth);
  const cell = (d) => {
    if (!d) return '–';
    if (d.capped) return '≥ ' + d.maxOk + ' (cap)';
    if (d.limitedByTimeAt) return d.maxOk + ', then > 60 s';
    return d.maxOk + ' (' + (d.failure || '?') + ')';
  };
  return `**${label}: the largest n each build checks** (no overflow beyond it unless "then > 60 s")\n\n`
    + table(['build', ...fams], names.map((n) => [n, ...fams.map((f) => cell(res.builds[n].depth[f]))]));
}

function sizeRows(res) {
  const names = ordered(res.builds).filter((n) => res.builds[n].size);
  if (!names.length) return '';
  const stable = res.builds.stable && res.builds.stable.size;
  let q = 11;
  if (stable && res.r2StableWireBytes) {
    q = Array.from({ length: 11 }, (_, i) => i + 1).reduce((best, l) =>
      (Math.abs(stable['br' + l] - res.r2StableWireBytes) < Math.abs(stable['br' + best] - res.r2StableWireBytes) ? l : best), 11);
  }
  return `**Transfer.** R2 sends the stable build as ${kb(res.r2StableWireBytes)} (brotli); brotli level ${q} reproduces that `
    + `(${kb(stable ? stable['br' + q] : 0)}), so that column is the estimate of what each build would cost on the wire.\n\n`
    + table(['build', 'on disk', 'gzip -9', `brotli ${q} (≈ R2)`, 'brotli 11'], names.map((n) => {
      const s = res.builds[n].size;
      return [n, kb(s.raw), kb(s.gzip9), kb(s['br' + q]), kb(s.br11)];
    }));
}

function bootRows() {
  const out = [];
  if (node) {
    const names = ordered(node.builds).filter((n) => node.builds[n].boot);
    out.push('**Node: boot** (median of 9 fresh processes) and memory after boot\n\n' + table(['build', 'boot', 'heap used', 'rss'], names.map((n) => {
      const b = node.builds[n].boot;
      const m = b[0].memory;
      return [n, ms(median(b.map((x) => x.bootMs))), m.heapUsedMB + ' MB', m.rssMB + ' MB'];
    })));
  }
  if (chrome) {
    const names = ordered(chrome.builds).filter((n) => chrome.builds[n].bootCold);
    out.push(`**Chrome ${chrome.chrome}: boot in a worker**, \`new Worker()\` to ready (median: cold of 5, warm of 7)\n\n` + table(['build', 'cold', 'warm'], names.map((n) => [n,
      ms(median(chrome.builds[n].bootCold.map((x) => x.pageNewWorkerToReadyMs))), ms(median(chrome.builds[n].bootWarm.map((x) => x.pageNewWorkerToReadyMs)))])));
  }
  return out.join('\n\n');
}

function poolRows() {
  if (!chrome) return '';
  const names = ordered(chrome.builds).filter((n) => chrome.builds[n].pool);
  if (!names.length) return '';
  const rows = [];
  for (const n of names) {
    for (const p of chrome.builds[n].pool) {
      rows.push([n + (p.sharedModule ? ', one Module shared' : ''), String(p.workers), ms(p.allReadyMs), p.memory.totalMB + ' MB',
        (p.memory.totalMB / p.workers).toFixed(1) + ' MB']);
    }
  }
  return '**Chrome: a pool of workers**, booted together, each then checking one medium unit; memory from `measureUserAgentSpecificMemory`\n\n'
    + table(['build', 'workers', 'all ready', 'memory', 'per worker'], rows);
}

function agreement(res, label) {
  const names = ordered(res.builds).filter((n) => res.builds[n].passes && res.builds[n].passes.rows);
  if (names.length < 2) return '';
  const ref = res.builds[names[0]].passes.rows;
  const lines = names.map((n) => {
    const rows = res.builds[n].passes.rows;
    // Pass by pass: Beluga's hole numbers run on across checks in one instance, so a
    // unit with holes answers differently in pass 2 than in pass 1, in every build alike.
    const passes = rows[0].hash.length;
    const same = Array.from({ length: passes }, (_, p) => rows.filter((r, i) => r.hash[p] === ref[i].hash[p]).length);
    const drift = rows.filter((r) => !r.hash.every((h) => h === r.hash[0])).length;
    return `${n}: same as ${names[0]}, pass by pass: ${same.join(', ')} of ${rows.length}; units whose answer changes between passes: ${drift}`;
  });
  return `**${label}: agreement** (hash of verdict + text, every unit, every pass)\n\n` + lines.map((l) => '- ' + l).join('\n');
}

const parts = [];
if (node) parts.push(`Node ${node.node} (V8 ${node.v8}), ${node.date.slice(0, 10)}`, corpusRows(node, 'Node'), coldRows(node, 'Node'), depthRows(node, 'Node'), agreement(node, 'Node'), sizeRows(node));
if (chrome) parts.push(`Chrome ${chrome.chrome}, ${chrome.date.slice(0, 10)}`, corpusRows(chrome, 'Chrome'), coldRows(chrome, 'Chrome'), depthRows(chrome, 'Chrome'), agreement(chrome, 'Chrome'));
parts.push(bootRows(), poolRows());
console.log(parts.filter(Boolean).join('\n\n'));
