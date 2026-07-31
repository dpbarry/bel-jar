import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Text } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { parser } from '../js/editor-src/beluga-parser.js';
import { beluga } from '../js/editor-src/language.mjs';
import { createSyntaxStore } from '../js/editor-src/semantic/syntax-store.mjs';
import { createSymbolStore } from '../js/editor-src/semantic/symbol-store.mjs';
import {
  listGroupSymbols,
} from '../js/editor-src/semantic/project-prelude.mjs';
import { inferActiveCfgByDir, dirOf } from '../js/editor-src/semantic/development.mjs';
import { classifyCompletionSite } from '../js/editor-src/ide/completion/classify.mjs';
import { gatherCompletions, permitsImplicitCompletion } from '../js/editor-src/ide/completion/source.mjs';
import { typeCompatibleWithGoal } from '../js/editor-src/prover/hole-split.mjs';
import { NAMESPACE } from '../js/editor-src/semantic/ids.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const dataDir = path.resolve(root, arg('--dir', 'library/data'));
const limit = Number(arg('--limit', '0')) || Infinity;
const outputDir = path.resolve(root, 'scratch');
const prefixLengths = [0, 1, 3];

const LEZER_CONTEXTS = [
  'LFAtomicType', 'LFAtomicTerm', 'CompAtomicType', 'AtomicPattern',
  'AtomicExpression', 'ContextHead', 'ContextTailEntry', 'TotalityCall',
  'Observation', 'SchemaElement', 'SchemaSomeBindings', 'AppExpression',
];

function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:bel|elf|cfg)$/iu.test(entry.name)) out.push(full);
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const i = Math.min(values.length - 1, Math.floor((values.length - 1) * p));
  return values.slice().sort((a, b) => a - b)[i];
}

function maximum(values) {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
}

function buildStore(text, documentId) {
  const doc = Text.of(text.split('\n'));
  const tree = parser.parse(doc.toString());
  const syntaxStore = createSyntaxStore({ documentId });
  const syntax = syntaxStore.update(tree, doc, { documentId });
  const symbols = createSymbolStore();
  const snapshot = symbols.update(syntax);
  return { doc, symbols, syntaxStore, snapshot, tree };
}

function sourceCandidates(symbols, pos, peers, site) {
  const visible = symbols.visibleSymbolsAt(pos, {
    namespaces: site.namespaces || null,
    refKind: site.refKind || null,
  }).filter((symbol) => {
    if (!symbol.isGlobal) return site.allowLocals !== false;
    return !site.localsOnly;
  });
  const peerNames = (site.localsOnly ? [] : peers)
    .filter((symbol) => {
      if (!symbol.namespace) return false;
      if (site.namespaces) return site.namespaces.has(symbol.namespace);
      return true;
    })
    .map((symbol) => symbol.name);
  return new Set([
    ...visible.map((symbol) => symbol.name),
    ...peerNames,
  ]);
}

function j2Candidates(symbols, pos, peers, site) {
  if (!site.namespaces) return null;
  return sourceCandidates(symbols, pos, peers, site);
}

function j3Candidates(symbols, pos, site) {
  const goal = site.expectedType;
  if (!goal) return null;
  const visible = symbols.visibleSymbolsAt(pos, {
    namespaces: site.namespaces || null,
    refKind: site.refKind || null,
  }).filter((symbol) => {
    if (!symbol.isGlobal) return site.allowLocals !== false;
    return !site.localsOnly;
  });
  const allowed = new Set();
  for (const symbol of visible) {
    if (!symbol?.name || !symbol.sourceText) continue;
    if (typeCompatibleWithGoal(symbol.sourceText, goal) === true) allowed.add(symbol.name);
  }
  return allowed;
}

function allVisibleNames(symbols, pos) {
  return new Set(symbols.visibleSymbolsAt(pos, {}).map((s) => s.name));
}

function peerByName(peers, name) {
  for (const p of peers) {
    if (p.name === name && p.namespace) return p;
  }
  return null;
}

function getLezerContext(tree, pos) {
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (LEZER_CONTEXTS.includes(cur.name)) return cur.name;
  }
  return 'unknown';
}

function ensureContextBucket(stats, ctx) {
  if (!stats.contextRecall[ctx]) stats.contextRecall[ctx] = { hit: 0, miss: 0 };
  return stats.contextRecall[ctx];
}

function useUnderPattern(tree, pos) {
  if (!tree) return false;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'Pattern' || cur.name === 'AppPattern') return true;
    if (cur.name === 'CaseBranch' || cur.name === 'LetExpression' || cur.name === 'CofunctionBranch'
        || cur.name === 'Expression' || cur.name === 'RecBody' || cur.name === 'FnExpression') {
      return false;
    }
  }
  return false;
}

function useUnderNamePreferred(tree, pos) {
  if (!tree) return false;
  for (let cur = tree.resolveInner(pos, -1); cur; cur = cur.parent) {
    if (cur.name === 'NamePreferred') return true;
    if (cur.name === 'NamePragma' || cur.name === 'Program' || cur.name === 'Declaration') {
      return false;
    }
  }
  return false;
}

function classifyMiss(use, site, symbols, peers, tree) {
  if (!site || site.kind === 'none') return 'declined';
  if (site.kind === 'module-member') return 'declined';
  if (site.kind === 'structure' && site.idents === false) return 'declined';

  // `--name` preferred aliases are pretty-print names, not completable symbols.
  if (useUnderNamePreferred(tree, use.from) && use.resolution === 'unresolved') {
    return 'namePragma';
  }

  const refNs = use.namespace || null;
  if (site.namespaces && refNs && !site.namespaces.has(refNs)) {
    return 'namespaceFilter';
  }

  const allVisible = allVisibleNames(symbols, use.from);
  const peer = peerByName(peers, use.name);

  if (allVisible.has(use.name)) {
    // Visible unfiltered but excluded by the site's namespace/refKind gate.
    if (site.namespaces) {
      const filtered = symbols.visibleSymbolsAt(use.from, {
        namespaces: site.namespaces,
        refKind: site.refKind || null,
      });
      if (!filtered.some((s) => s.name === use.name)) return 'namespaceFilter';
    }
    return 'other';
  }

  if (peer) {
    if (site.namespaces && !site.namespaces.has(peer.namespace)) return 'namespaceFilter';
    return 'other';
  }

  // Resolved in-file symbol missing from the store snapshot → real gap.
  if (use.resolution === 'global' || use.resolution === 'local') return 'symbolStore';

  // Unresolved free names in LF term/type slots are reconstructed implicits /
  // metavariables — by doctrine we never invent them. Not an actionable recall miss.
  // (Applies after visible + peer checks, so true peer hits never reach here.)
  const name = String(use.name || '');
  const lfNs = site.namespaces && (
    site.namespaces.has(NAMESPACE.LF_CONSTRUCTOR)
    || site.namespaces.has(NAMESPACE.LF_CONSTANT)
    || site.namespaces.has(NAMESPACE.LF_TYPE_FAMILY)
  );
  const lfCtx = site.ctxName === 'LFAtomicTerm' || site.ctxName === 'LFAtomicType' || lfNs;
  if (lfCtx && use.resolution === 'unresolved' && name.length > 0) return 'metavar';

  // Free `$S` / `#p` in computation type slots are reconstructed implicits —
  // same doctrine as LF metavars; not actionable peers.
  const sigil = name[0] === '$' || name[0] === '#';
  const compNs = site.namespaces && (
    site.namespaces.has(NAMESPACE.COMP_TYPE)
    || site.namespaces.has(NAMESPACE.COMP_CONSTRUCTOR)
  );
  if (sigil && use.resolution === 'unresolved'
      && (site.ctxName === 'CompAtomicType' || compNs)) {
    return 'metavar';
  }

  // Unresolved at pattern/context binder sites — residual untracked pattern
  // locals (not missing cfg peers). Length is not a signal.
  const binderishCtx = site.ctxName === 'AtomicPattern'
    || site.ctxName === 'ContextHead'
    || site.ctxName === 'ContextTailEntry';
  if (binderishCtx && use.resolution === 'unresolved') return 'patternLocal';
  if (site.ctxName === 'LFAtomicTerm' && use.resolution === 'unresolved'
      && useUnderPattern(tree, use.from)) {
    return 'patternLocal';
  }

  // Totality argument labels (`/ total s (f g a b s) /`) are positional names,
  // not resolvable symbols — honest decline, not a peer/cfg gap.
  if ((site.ctxName === 'TotalityArg' || site.ctxName === 'TotalityCall'
      || site.ctxName === 'TotalityMeasure')
      && use.resolution === 'unresolved') {
    return 'totalityLabel';
  }

  // Unresolved and absent from peers → peer visibility gap (or truly foreign).
  return 'peers';
}

function recordMiss(stats, reason, sample, missedSamples) {
  if (reason === 'declined') stats.recallBreakdown.missedDeclined += 1;
  else if (reason === 'namespaceFilter') stats.recallBreakdown.missedNamespaceFilter += 1;
  else if (reason === 'symbolStore') stats.recallBreakdown.missedSymbolStore += 1;
  else if (reason === 'peers') stats.recallBreakdown.missedPeers += 1;
  else if (reason === 'metavar') stats.recallBreakdown.missedMetavar += 1;
  else if (reason === 'patternLocal') stats.recallBreakdown.missedPatternLocal += 1;
  else if (reason === 'totalityLabel') stats.recallBreakdown.missedTotalityLabel += 1;
  else if (reason === 'namePragma') stats.recallBreakdown.missedNamePragma += 1;
  else stats.recallBreakdown.missedOther += 1;

  const key = [
    reason,
    sample.name,
    sample.file,
    sample.ctx,
    sample.resolution,
  ].join('\x01');
  let group = stats.missGroups.get(key);
  if (!group) {
    group = {
      reason,
      name: sample.name,
      file: sample.file,
      ctx: sample.ctx,
      resolution: sample.resolution,
      namespace: sample.namespace,
      siteNs: sample.siteNs,
      events: 0,
      sites: new Set(),
    };
    stats.missGroups.set(key, group);
  }
  group.events += 1;
  group.sites.add(`${sample.file}:${sample.offset}`);

  if (missedSamples.length < 40
      && reason !== 'declined'
      && reason !== 'namespaceFilter'
      && reason !== 'metavar'
      && reason !== 'patternLocal'
      && reason !== 'totalityLabel'
      && reason !== 'namePragma') {
    missedSamples.push(sample);
  }
}

function auditFile(file, files, getText, activeCfgByDir, stats, violations, missedSamples) {
  const text = getText(file.id);
  if (!file.name.endsWith('.bel')) return;

  const { symbols, syntaxStore, snapshot, tree } = buildStore(text, `workspace://${file.name}`);
  const state = EditorState.create({ doc: text, extensions: [beluga()] });
  const engine = {
    stores: { symbols, syntax: syntaxStore },
    getHoles: () => [],
    getCheckerCode: () => text,
  };
  const preferredCfg = activeCfgByDir[dirOf(file.name)] || null;
  // Prefer Persist/best cfg; developmentForFile falls back to owningCfgForFile
  // when that cfg does not list the file (same seam as the live IDE).
  const peers = listGroupSymbols(files, file.id, getText, {
    activeCfgForDir: () => preferredCfg,
  });

  for (const use of snapshot.references) {
    if (stats.sites >= limit) return;
    stats.sites += 1;
    for (const length of prefixLengths) {
      const prefixEnd = Math.min(use.to, use.from + length);
      const site = classifyCompletionSite(state, prefixEnd, engine);
      const ctx = site.ctxName || getLezerContext(tree, use.from);
      const bucket = ensureContextBucket(stats, ctx);

      // Pure scaffolds (top-decl / case-arm) and declines are not identifier-recall sites.
      // Kind/expr-head structure slots still offer idents and must stay in the utility pool.
      if (site.kind === 'none'
          || site.kind === 'module-member'
          || (site.kind === 'structure' && site.idents === false)) {
        stats.declined += 1;
        stats.recallBreakdown.missedDeclined += 1;
        bucket.miss += 1;
        continue;
      }

      const query = text.slice(use.from, prefixEnd);
      const simulated = { ...site, query, from: use.from, to: use.to };
      // Runtime builds this full justified pool once, then CodeMirror filters
      // it while validFor holds. Do not audit the old per-prefix rank path.
      const poolSite = { ...simulated, query: '' };
      const start = performance.now();
      const items = gatherCompletions(poolSite, engine, state, {
        getPeerSymbols: () => peers,
        activePath: file.name,
        limit: 0,
      });
      stats.latencies.push(performance.now() - start);
      stats.calls += 1;
      if (site.namespaces) stats.j2Sites += 1;
      else if (items.length) stats.j1OnlyRawOffers += items.length;
      if (site.expectedType) stats.j3Sites += 1;
      if (!site.namespaces && items.length && query && permitsImplicitCompletion(site)) {
        stats.implicitJ1Offers += items.length;
      }

      const expected = sourceCandidates(symbols, use.from, peers, simulated);
      const j2Expected = j2Candidates(symbols, use.from, peers, simulated);
      const j3Expected = j3Candidates(symbols, use.from, simulated);
      for (const item of items) {
        // Keywords/scaffolds are grammar-gated, not symbol-resolvable — skip soundness.
        if (item.source === 'snippet' || item.kind === 'snippet') continue;
        stats.offers += 1;
        if (!expected.has(item.label)) {
          stats.j1Violations += 1;
          if (violations.length < 25) {
            violations.push({
              kind: 'unresolvable-offer',
              file: file.name,
              offset: use.from,
              query,
              offered: item.label,
            });
          }
        }
        if (j2Expected && !j2Expected.has(item.label)) {
          stats.j2Violations += 1;
          if (violations.length < 25) {
            violations.push({
              kind: 'wrong-namespace-offer',
              file: file.name,
              offset: use.from,
              query,
              offered: item.label,
            });
          }
        }
        if (j3Expected && item.just === 3 && !j3Expected.has(item.label)) {
          stats.j3Violations += 1;
          if (violations.length < 25) {
            violations.push({
              kind: 'wrong-type-offer',
              file: file.name,
              offset: use.from,
              query,
              offered: item.label,
              goal: site.expectedType,
            });
          }
        }
      }

      if (items.some((item) => item.label === use.name)) {
        stats.recalled += 1;
        stats.recallBreakdown.hit += 1;
        bucket.hit += 1;
      } else {
        const reason = classifyMiss(use, simulated, symbols, peers, tree);
        recordMiss(stats, reason, {
          reason,
          file: file.name,
          name: use.name,
          offset: use.from,
          query,
          ctx,
          resolution: use.resolution,
          namespace: use.namespace || null,
          siteKind: site.kind,
          siteNs: site.namespaces ? [...site.namespaces] : null,
        }, missedSamples);
        bucket.miss += 1;
      }
    }
  }
}

const sourceFiles = walk(dataDir).sort();
const files = sourceFiles.map((full) => {
  const name = path.relative(dataDir, full).replaceAll('\\', '/');
  return { id: name, name, text: fs.readFileSync(full, 'utf8') };
});
const texts = new Map(files.map((file) => [file.id, file.text]));
const getText = (id) => texts.get(id) || '';
const activeCfgByDir = inferActiveCfgByDir(files, getText);
const stats = {
  sites: 0,
  calls: 0,
  declined: 0,
  offers: 0,
  recalled: 0,
  j2Sites: 0,
  j3Sites: 0,
  j1Violations: 0,
  j2Violations: 0,
  j3Violations: 0,
  j1OnlyRawOffers: 0,
  implicitJ1Offers: 0,
  latencies: [],
  recallBreakdown: {
    hit: 0,
    missedDeclined: 0,
    missedNamespaceFilter: 0,
    missedSymbolStore: 0,
    missedPeers: 0,
    missedMetavar: 0,
    missedPatternLocal: 0,
    missedTotalityLabel: 0,
    missedNamePragma: 0,
    missedOther: 0,
  },
  missGroups: new Map(),
  contextRecall: {},
};
const violations = [];
const missedSamples = [];

for (const file of files) {
  auditFile(file, files, getText, activeCfgByDir, stats, violations, missedSamples);
}

const calls = Math.max(1, stats.calls);
const totalRecallEvents = Math.max(1,
  stats.recallBreakdown.hit
  + stats.recallBreakdown.missedDeclined
  + stats.recallBreakdown.missedNamespaceFilter
  + stats.recallBreakdown.missedSymbolStore
  + stats.recallBreakdown.missedPeers
  + stats.recallBreakdown.missedMetavar
  + stats.recallBreakdown.missedPatternLocal
  + stats.recallBreakdown.missedTotalityLabel
  + stats.recallBreakdown.missedNamePragma
  + stats.recallBreakdown.missedOther);

const contextRecallSorted = Object.fromEntries(
  Object.entries(stats.contextRecall)
    .map(([ctx, v]) => {
      const n = v.hit + v.miss;
      return [ctx, { hit: v.hit, miss: v.miss, rate: n ? v.hit / n : 0 }];
    })
    .sort((a, b) => (b[1].hit + b[1].miss) - (a[1].hit + a[1].miss)),
);

const missGroups = [...stats.missGroups.values()]
  .map((group) => ({
    ...group,
    sites: group.sites.size,
  }))
  .sort((a, b) => b.events - a.events || b.sites - a.sites);

const peerGroups = missGroups.filter((g) => g.reason === 'peers').slice(0, 50);
const topMissGroups = missGroups.slice(0, 200);

const report = {
  corpus: {
    root: path.relative(root, dataDir).replaceAll('\\', '/'),
    files: files.filter((file) => file.name.endsWith('.bel')).length,
    referenceSites: stats.sites,
    simulatedPrefixes: prefixLengths,
  },
  soundness: {
    j1Violations: stats.j1Violations,
    j2Violations: stats.j2Violations,
    j3Violations: stats.j3Violations,
    j1OnlyRawOffers: stats.j1OnlyRawOffers,
    implicitJ1Offers: stats.implicitJ1Offers,
    note: 'J1-only raw offers remain available to explicit Ctrl-Space; implicitJ1Offers must remain zero.',
    samples: violations,
  },
  utility: {
    calls: stats.calls,
    declined: stats.declined,
    offers: stats.offers,
    poolRecall: stats.recalled / calls,
    note: 'Pool recall measures whether the reference is in the retained justified pool. Runtime ranking is BelJar retained-pool filtering and is not represented as MRR here.',
    j2SiteCoverage: stats.j2Sites / calls,
    j3SiteCoverage: stats.j3Sites / calls,
  },
  recallBreakdown: {
    ...stats.recallBreakdown,
    // Among sites where offering the name was possible in principle
    // (excludes binders/declines, correct ns-filters, free metavars,
    // unresolved pattern/context binders, totality argument labels, and
    // --name preferred aliases).
    adjustedPoolRecall: stats.recallBreakdown.hit / Math.max(1,
      stats.recallBreakdown.hit
      + stats.recallBreakdown.missedSymbolStore
      + stats.recallBreakdown.missedPeers
      + stats.recallBreakdown.missedOther),
    actionableMissRate: (
      stats.recallBreakdown.missedSymbolStore
      + stats.recallBreakdown.missedPeers
      + stats.recallBreakdown.missedOther
    ) / totalRecallEvents,
    groups: topMissGroups,
    peerGroups,
    samples: missedSamples,
  },
  contextRecall: contextRecallSorted,
  latencyMs: {
    p50: percentile(stats.latencies, 0.5),
    p95: percentile(stats.latencies, 0.95),
    max: maximum(stats.latencies),
  },
};

fs.mkdirSync(outputDir, { recursive: true });
const output = path.join(outputDir, 'autocomplete-audit.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

const rb = report.recallBreakdown;
console.log(`corpus: ${report.corpus.files} .bel files, ${report.corpus.referenceSites} reference sites, ${report.utility.calls} simulated prefixes`);
console.log(`soundness (must be 0): J1/J2/J3 violations ${report.soundness.j1Violations}/${report.soundness.j2Violations}/${report.soundness.j3Violations}; illegal implicit J1 offers ${report.soundness.implicitJ1Offers}`);
console.log(`coverage (not soundness): J2 sites ${(report.utility.j2SiteCoverage * 100).toFixed(1)}% have a namespace prediction; J3 sites ${(report.utility.j3SiteCoverage * 100).toFixed(1)}% have a known expected type (ranking boost only)`);
console.log(`utility: retained-pool recall ${(report.utility.poolRecall * 100).toFixed(1)}% (no runtime MRR)`);
console.log(`recall breakdown: hit ${rb.hit}; declined ${rb.missedDeclined}; ns-filter ${rb.missedNamespaceFilter}; metavar ${rb.missedMetavar}; pattern-local ${rb.missedPatternLocal}; totality-label ${rb.missedTotalityLabel}; name-pragma ${rb.missedNamePragma}; symbol-store ${rb.missedSymbolStore}; peers ${rb.missedPeers}; other ${rb.missedOther}`);
console.log(`adjusted pool recall (excl. declined/ns-filter/metavar/pattern-local/totality-label/name-pragma): ${(report.recallBreakdown.adjustedPoolRecall * 100).toFixed(1)}%`);
const topCtx = Object.entries(contextRecallSorted).slice(0, 6)
  .map(([c, v]) => `${c}=${(v.rate * 100).toFixed(0)}%`)
  .join(', ');
console.log(`context recall (top): ${topCtx}`);
console.log(`latency: p50 ${report.latencyMs.p50.toFixed(3)} ms; p95 ${report.latencyMs.p95.toFixed(3)} ms; max ${report.latencyMs.max.toFixed(3)} ms`);
console.log(`report: ${path.relative(root, output).replaceAll('\\', '/')}`);
