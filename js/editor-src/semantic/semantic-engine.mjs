import { mergeDiagnostics } from '../ide/query-diag.mjs';
import { parseHolesFromTree } from '../prover/hole-report.mjs';
import { checkerSnapshotFromSyntax } from './checker-snapshot.mjs';
import { hasTypeProjection, projectHoverType, resolveHoverDoc } from '../name-resolve.mjs';
import { createCheckerStore } from './checker-store.mjs';
import { createHoverTrace, hoverTraceEnabled } from './hover-trace.mjs';
import { createMetavarStore } from './metavar-store.mjs';
import { DEFAULT_DOCUMENT_ID, NAMESPACE, normalizeDocumentId, STATUS } from './ids.mjs';
import { createSemanticGraph } from './semantic-graph.mjs';
import { createSymbolStore, expectedNamespacesAt } from './symbol-store.mjs';
import { createSyntaxStore } from './syntax-store.mjs';
import { createSemanticSession } from './semantic-session.mjs';
import { createSemanticScheduler } from './semantic-scheduler.mjs';
import { topDeclSpans } from './scoped-check.mjs';
import { belugaDiagnosticsFromOutput, createSettlement } from './settlement.mjs';
import { polishBelugaMessage } from '../ide/beluga-diag.mjs';
import { settlementTrigger } from './check-gate.mjs';
import { getCheckTrace, timeSync } from '../perf/check-trace.mjs';
import {
  declSignatureAnnotation,
  mergeDeclSignatures,
} from './merge-decl-signatures.mjs';

// Headline declaration namespaces shown in the inspector's file outline.
const OUTLINE_NAMESPACES = new Set([
  NAMESPACE.LF_TYPE_FAMILY,
  NAMESPACE.COMP_TYPE,
  NAMESPACE.REC_FUNCTION,
  NAMESPACE.SCHEMA,
  NAMESPACE.TYPEDEF,
  NAMESPACE.MODULE,
]);

export function createSemanticEngine(options = {}) {
  const documentId = normalizeDocumentId(options.documentId || DEFAULT_DOCUMENT_ID);
  const syntaxStore = createSyntaxStore({ documentId });
  const symbolStore = createSymbolStore();
  const semanticGraph = createSemanticGraph();
  const metavarStore = createMetavarStore();
  const belugaClient = options.belugaClient || null;
  const session = options.session || (belugaClient ? createSemanticSession(belugaClient) : null);
  const onTypeObserved = typeof options.onTypeObserved === 'function' ? options.onTypeObserved : null;
  const onSettlement = typeof options.onSettlement === 'function' ? options.onSettlement : null;
  const onSettlementChecking = typeof options.onSettlementChecking === 'function'
    ? options.onSettlementChecking
    : null;
  const checkerStore = createCheckerStore();
  let snapshot = null;
  let hydratedTypes = new Map();
  let hydratedMetavars = new Map();
  // Elaborated (reconstructed) decl types, implicits expanded. structuralKey -> { type, fp, status }.
  // Populated in the background by deriveFrontier; read via reconstructedTypeOf/At and bestDeclType.
  let derivationStore = new Map();
  const elaborationInflight = new Map();
  let lastCursorPos = 0;
  
  function applySettlementToGraph() {
    const syntax = syntaxStore.getSnapshot();
    const symbols = symbolStore.getSnapshot();
    if (!syntax || !symbols) return null;
    const checker = checkerStore.getSnapshot();
    const graph = semanticGraph.update(symbols, syntax, {
      belugaDiagnostics: checker.belugaDiagnostics,
      previous: semanticGraph.getSnapshot(),
    });
    metavarStore.reconcile(graph.dirty, graph.removed);
    purgeHydratedMetavarsForDirty(graph.dirty, symbols);
    if (snapshot) {
      snapshot = {
        ...snapshot,
        graph,
        checker,
        summary: {
          ...snapshot.summary,
          belugaDiagnostics: checker.belugaDiagnostics.length,
          dirty: graph.dirty.size,
        },
      };
    }
    return graph;
  }

  function onSettlementComplete(checkerSnap) {
    applySettlementToGraph();
    const syntax = syntaxStore.getSnapshot();
    if (session && typeof session.markLoaded === 'function') {
      const ctx = typeof getCheckContext === 'function' && syntax
        ? getCheckContext(syntax)
        : null;
      const preludeFp = ctx?.preludeFp || (ctx?.prelude?.code != null
        ? String(ctx.prelude.code.length)
        : '');
      if (checkerSnap.checkedFp) {
        session.markLoaded(checkerSnap.checkedFp, checkerSnap.checkedCode, { preludeFp });
      } else if (checkerSnap.checkerFp) {
        session.markLoaded(checkerSnap.checkerFp, checkerCodeFromSyntax(syntax), { preludeFp });
      }
    }
    const sched = getScheduler();
    if (sched && typeof sched.seedFromFrontier === 'function') {
      sched.seedFromFrontier();
    }
    if (onSettlement) onSettlement(checkerSnap);
  }

  function onSettlementProgress(checkerSnap) {
    applySettlementToGraph();
    if (onSettlementChecking) onSettlementChecking(checkerSnap);
  }

  const getCheckContext = typeof options.getCheckContext === 'function'
    ? options.getCheckContext
    : null;
  const getScopeKey = typeof options.getScopeKey === 'function' ? options.getScopeKey : null;
  const getSettleDelay = typeof options.getSettleDelay === 'function' ? options.getSettleDelay : null;
  const getSuiteOverlayDiagnostics = typeof options.getSuiteOverlayDiagnostics === 'function'
    ? options.getSuiteOverlayDiagnostics
    : null;

  function isLegacyPreludeBanner(d) {
    return d?.source === 'suite-prelude'
      || /Error in earlier (suite )?file .+\./.test(d?.message || '');
  }

  function belugaDiagnosticsForDisplay(checker) {
    const raw = checkerShowsBeluga(checker.state) ? (checker.belugaDiagnostics || []) : [];
    const filtered = !getSuiteOverlayDiagnostics
      ? raw
      : raw.filter((d) => !isLegacyPreludeBanner(d));
    return filtered.map((d) => (d.message
      ? { ...d, message: polishBelugaMessage(d.message) }
      : d));
  }

  // Dirty declaration ranges plus any declaration currently hosting a Beluga
  // diagnostic (incl. stale carry-over). The dirty set alone can be empty on a
  // fix-backspace even while stale squiggles remain — that was the 10s clear bug.
  function getScopedFrontier(syntaxSnap) {
    if (!snapshot || !syntaxSnap || snapshot.version !== syntaxSnap.version) return [];
    const g = snapshot.graph;
    const symbols = snapshot.symbols;
    const ranges = [];
    const seen = new Set();
    const add = (r) => {
      if (!r || r.from == null || r.to == null) return;
      const k = `${r.from}:${r.to}`;
      if (seen.has(k)) return;
      seen.add(k);
      ranges.push({ from: r.from, to: r.to });
    };

    if (g?.dirty?.size && symbols) {
      for (const id of g.dirty) {
        const sym = symbols.symbolsById.get(id);
        if (sym?.range) add(sym.range);
      }
    }

    const checker = checkerStore.getSnapshot();
    if (checker.syntaxVersion === syntaxSnap.version && syntaxSnap.tree) {
      const decls = topDeclSpans(syntaxSnap.tree);
      for (const d of checker.belugaDiagnostics || []) {
        if (d.from == null) continue;
        for (const decl of decls) {
          if (d.from >= decl.from && d.from < decl.to) { add(decl); break; }
        }
      }
    }

    // Cursor-first: certify the declaration under the caret before the rest.
    if (lastCursorPos != null && ranges.length > 1) {
      ranges.sort((a, b) => {
        const da = Math.min(Math.abs(a.from - lastCursorPos), Math.abs(a.to - lastCursorPos));
        const db = Math.min(Math.abs(b.from - lastCursorPos), Math.abs(b.to - lastCursorPos));
        return da - db;
      });
    }
    return ranges;
  }

  const settlement = belugaClient ? createSettlement({
    belugaClient,
    checkerStore,
    getCheckContext,
    getScopedFrontier,
    getSettleDelay,
    onComplete: onSettlementComplete,
    onChecking: onSettlementChecking,
    onProgress: onSettlementProgress,
  }) : null;

  let scheduler = null;
  function getScheduler() {
    if (!scheduler && session) {
      const engine = {
        stores: { syntax: syntaxStore, symbols: symbolStore, metavar: metavarStore },
        observeMetavarAt: (pos, type) => observeMetavarAt(pos, type),
        observeMetavarNamed: (declId, name, type) => observeMetavarNamed(declId, name, type),
        elaborateDeclarationImplicits: (declId) => elaborateDeclarationImplicits(declId),
        dirtyFrontier,
        deriveFrontier,
        getCheckerCode: () => checkerCodeFromSyntax(syntaxStore.getSnapshot()),
        isSettlementReady: () => {
          // STRICT gate: intel must never run while settlement is in flight —
          // an unsettled version would make the scheduler assemble+load the
          // full development into the intel worker on every tick while the
          // user is typing (main-thread string builds + megabyte postMessages).
          const syntax = syntaxStore.getSnapshot();
          if (!syntax || !settlement) return true;
          return settlement.isSettledFor(syntax.version);
        },
      };
      scheduler = createSemanticScheduler(engine, session);
    }
    return scheduler;
  }

  function mapTypeSource(best) {
    if (!best) return null;
    if (best.source === 'reconstructed') return 'reconstructed';
    if (best.source === 'annotation') return 'source';
    if (best.source === 'hydrated' || best.status === STATUS.STALE_KNOWN) return 'stale-cache';
    if (best.source === 'oracle' && best.status === STATUS.FRESH) return 'fresh-cache';
    if (best.source === 'oracle') return 'beluga';
    return 'source';
  }

  function dedupeElaboration(key, fn) {
    if (elaborationInflight.has(key)) return elaborationInflight.get(key);
    const p = Promise.resolve().then(fn).finally(() => elaborationInflight.delete(key));
    elaborationInflight.set(key, p);
    return p;
  }

  function owningDeclarationId(pos) {
    const symbols = symbolStore.getSnapshot();
    if (!symbols) return null;
    const ref = symbolStore.referenceAt(pos);
    if (ref && ref.enclosingDeclarationId) return ref.enclosingDeclarationId;
    const decl = symbolStore.declarationAt(pos);
    return decl ? decl.id : null;
  }

  function blockedContext(ownerId) {
    if (!ownerId) return null;
    const st = semanticGraph.statusForSymbol(ownerId);
    if (st !== STATUS.BLOCKED && st !== STATUS.SYNTAX_FAULT) return null;
    const node = semanticGraph.getSnapshot()?.nodeMap.get(ownerId);
    return {
      status: 'blocked',
      blockedBy: ownerId,
      reason: st === STATUS.SYNTAX_FAULT ? 'syntax-fault' : 'unresolved-reference',
      blocking: node && node.blocking ? { name: node.blocking.name, range: node.blocking.range } : null,
      graphStatus: st,
    };
  }

  function bestDeclType(symbol) {
    if (!symbol) return null;
    const derived = derivationStore.get(symbol.structuralKey);
    if (derived && derived.type != null && derived.fp === symbol.fingerprint) {
      return { type: derived.type, status: STATUS.FRESH, source: 'reconstructed' };
    }
    const hydrated = hydratedTypes.get(symbol.structuralKey);
    if (hydrated && hydrated.type != null && hydrated.fp === symbol.fingerprint) {
      return { type: hydrated.type, status: STATUS.STALE_KNOWN, source: 'hydrated' };
    }
    if (symbol.sourceText) return { type: symbol.sourceText, status: STATUS.UNKNOWN, source: 'annotation' };
    return null;
  }

  function isDeclSignatureHover(resolved, symbol) {
    return !!(symbol && symbol.isGlobal && resolved
      && (resolved.kind === 'global' || resolved.kind === 'external'));
  }

  function pickDeclDisplayType(symbol, sourceAnnotation) {
    const best = bestDeclType(symbol);
    if (!best || best.type == null) return null;
    const ann = sourceAnnotation != null
      ? sourceAnnotation
      : declSignatureAnnotation(symbol, null);
    if (ann && (best.source === 'reconstructed' || best.source === 'hydrated')) {
      return {
        type: mergeDeclSignatures(ann, best.type),
        status: best.status,
        source: best.source,
      };
    }
    return best;
  }

  // SINGLE SOURCE OF TRUTH for a term's type, synchronously. Both hoverAt (the
  // tooltip) and intelSyncAt (the inspector) resolve type through this, so they
  // cannot drift. Mirrors hoverAt's sync ladder exactly. Returns:
  //   { type, source, status, kind, needsAsync, definitive }
  // where needsAsync=true means an async session/fallback path WOULD produce a
  // type (so the UI should show "recalculating" then await), and definitive=true
  // means we can prove there is no type to show (e.g. an unannotated fn param) —
  // the UI should settle with no type, not spin.
  function projectTypeAt(pos, type) {
    if (type == null) return null;
    const syntax = syntaxStore.getSnapshot();
    if (!syntax) return type;
    return projectHoverType(type, syntax.tree, syntax.doc, pos);
  }

  function syncTypeResult(pos, partial) {
    if (!partial || partial.type == null) return partial;
    return { ...partial, type: projectTypeAt(pos, partial.type) };
  }

  function syncResolveType(pos, resolvedIn, queryIn, refIn) {
    const syntax = syntaxStore.getSnapshot();
    const symbols = symbolStore.getSnapshot();
    if (!syntax || !symbols) {
      return { type: null, source: null, status: STATUS.UNKNOWN, kind: 'unknown', needsAsync: false, definitive: false };
    }
    const resolved = resolvedIn !== undefined ? resolvedIn : resolveHoverDoc(syntax.tree, syntax.doc, pos);
    const query = queryIn !== undefined ? queryIn : symbolStore.queryAt(pos);
    const ref = refIn !== undefined ? refIn : symbolStore.referenceAt(pos);
    const kind = classifyHover(resolved, ref, query);
    const projecting = hasTypeProjection(syntax.tree, syntax.doc, pos);

    if (query && query.symbol && query.symbol.namespace === NAMESPACE.PRAGMA) {
      return {
        type: null, source: null, status: STATUS.UNKNOWN, kind: 'pragma',
        needsAsync: false, definitive: true,
      };
    }

    // 0. Provably no displayable type (e.g. a substitution variable: the checker
    //    annotation oracle records only LF/computation/kind types). Settle now,
    //    head-only, rather than spinning on an elaboration that cannot succeed.
    if (resolved && resolved.typeUnavailable) {
      return { type: null, source: null, status: STATUS.UNKNOWN, kind, needsAsync: false, definitive: true };
    }

    if (resolved && resolved.kind === 'unbound') {
      return {
        type: null, source: null, status: STATUS.UNKNOWN, kind: 'unbound-ref',
        needsAsync: false, definitive: true, message: resolved.message,
      };
    }

    // 1. A resolved source type. For a known symbol prefer its best cached decl
    //    type (reconstructed > hydrated > annotation) over the raw source text,
    //    so a derived/persisted type wins. Fall back to the literal sourceType
    //    (e.g. a local/implicit binder with no symbol entry). A block projection
    //    (b1.1) already has the field type in sourceType — never let a cached
    //    whole-block schema from the checker override it.
    if (resolved && resolved.sourceType) {
      if (projecting) {
        return syncTypeResult(pos, {
          type: resolved.sourceType,
          source: 'local',
          status: STATUS.UNKNOWN,
          kind,
          needsAsync: false,
          definitive: true,
        });
      }
      const sym = query && query.symbol;
      if (isDeclSignatureHover(resolved, sym)) {
        const ann = declSignatureAnnotation(sym, resolved);
        const best = pickDeclDisplayType(sym, ann);
        if (best && best.type != null) {
          const source = best.source === 'reconstructed' ? 'reconstructed'
            : best.source === 'hydrated' ? 'stale-cache'
            : best.source === 'source' ? 'source'
            : 'local';
          return syncTypeResult(pos, {
            type: best.type,
            source,
            status: best.status,
            kind,
            needsAsync: false,
            definitive: true,
          });
        }
      }
      return syncTypeResult(pos, {
        type: resolved.sourceType,
        source: resolved.kind === 'global' || resolved.kind === 'external' ? 'source' : 'local',
        status: STATUS.UNKNOWN,
        kind,
        needsAsync: false,
        definitive: true,
      });
    }

    // 2. Local binder whose displayed type is its bracketed text.
    if (resolved && resolved.kind === 'local') {
      if (resolved.text != null) {
        return syncTypeResult(pos, {
          type: resolved.text,
          source: 'source',
          status: STATUS.UNKNOWN,
          kind,
          needsAsync: false,
          definitive: true,
        });
      }
      // A bare binder (e.g. an unannotated fn parameter): no type, none coming.
      return { type: null, source: null, status: STATUS.UNKNOWN, kind, needsAsync: false, definitive: true };
    }

    // 3. Cached decl/metavar type (covers globals via bestDeclType + metavars).
    const sync = syncTypeFor(pos, resolved, query, ref);
    if (sync && sync.type != null) {
      const implicit = resolved && resolved.kind === 'implicit';
      const staleImplicit = implicit && sync.status !== STATUS.FRESH;
      if (!staleImplicit) {
        return syncTypeResult(pos, {
          type: sync.type,
          source: sync.source,
          status: sync.status,
          kind,
          needsAsync: false,
          definitive: true,
        });
      }
    }

    // 4. Source signature text (declarations without a separate sourceType path).
    if (resolved && resolved.sourceText) {
      const sym = query && query.symbol;
      if (isDeclSignatureHover(resolved, sym)) {
        const best = pickDeclDisplayType(sym, declSignatureAnnotation(sym, resolved));
        if (best && best.type != null) {
          const source = best.source === 'reconstructed' ? 'reconstructed'
            : best.source === 'hydrated' ? 'stale-cache'
            : 'source';
          return syncTypeResult(pos, {
            type: best.type,
            source,
            status: best.status,
            kind,
            needsAsync: false,
            definitive: true,
          });
        }
      }
      return syncTypeResult(pos, {
        type: resolved.sourceText,
        source: 'source',
        status: STATUS.UNKNOWN,
        kind,
        needsAsync: false,
        definitive: true,
      });
    }

    // 5. Nothing synchronous is available (branches 3 and 4 already covered the
    //    cache, metavar, and source-signature cases). Decide only whether an
    //    async session/fallback path WOULD produce a type.
    const wouldElaborate =
      (!!session && resolved && resolved.needsElaboration) ||
      (!!session && !!(ref && !ref.symbolId && ref.enclosingDeclarationId)) ||
      (!!resolved && !!resolved.fallback);
    return {
      type: null,
      source: null,
      status: STATUS.UNKNOWN,
      kind,
      needsAsync: !!wouldElaborate,
      // Definitive only if there's truly nothing more to try.
      definitive: !wouldElaborate,
    };
  }

  // Kind-aware user-facing status for ANY position (the inspector's source of
  // truth). Four honest states; mirrors what the tooltip would show:
  //   'error'           — real diagnostics overlap the owning declaration.
  //   'checking'        — a type is genuinely being awaited (needsAsync, none yet).
  //   'checked'         — a type is available now, OR provably none is coming.
  function userStatusAt(pos, sync) {
    const r = sync || syncResolveType(pos);
    // Real failure on the owning declaration.
    const ownerId = owningDeclarationId(pos);
    const node = ownerId && snapshot && snapshot.graph && snapshot.graph.nodeMap.get(ownerId);
    if (node && (
      node.status === STATUS.SYNTAX_FAULT
      || node.status === STATUS.ERRORING
      || (node.diagnostics && node.diagnostics.length)
    )) {
      return { state: 'error', detail: 'Declaration has an error' };
    }
    if (r.kind === 'unbound-ref') {
      return { state: 'error', detail: r.message || 'Identifier is not defined' };
    }
    if (r.type != null) {
      return { state: 'checked', detail: 'Type known' };
    }
    if (r.needsAsync) {
      return { state: 'checking', detail: 'Reconstructing type…' };
    }
    return { state: 'checked', detail: 'No type' };
  }

  function metavarContext(pos, resolved, symbols) {
    const name = (resolved && resolved.name) || null;
    if (!name) return null;
    const ref = symbolStore.referenceAt(pos);
    let declId = ref && ref.enclosingDeclarationId;
    if (!declId && resolved && resolved.owningDeclaration && symbols) {
      const owner = symbols.globalSymbols.find((s) => s.name === resolved.owningDeclaration);
      if (owner) declId = owner.id;
    }
    if (!declId) declId = owningDeclarationId(pos);
    if (!declId) return null;
    return { declId, name: (ref && ref.name) || name };
  }

  function purgeHydratedMetavarsForDirty(dirty, symbols) {
    if (!dirty || !symbols) return;
    for (const declId of dirty) {
      const owner = symbols.symbolsById.get(declId);
      if (!owner) continue;
      const prefix = `${owner.structuralKey}::`;
      for (const key of [...hydratedMetavars.keys()]) {
        if (key.startsWith(prefix)) hydratedMetavars.delete(key);
      }
    }
  }

  function owningDeclIsDirty(declId) {
    return !!(declId && snapshot?.graph?.dirty?.has(declId));
  }

  function bestMetavarType(declId, name, symbols) {
    if (!declId || !name) return null;
    const hit = metavarStore.get(declId, name);
    if (hit && hit.type != null) {
      return {
        type: hit.type,
        status: hit.status,
        source: hit.status === STATUS.FRESH ? 'fresh-cache' : 'stale-cache',
      };
    }
    const owner = symbols && symbols.symbolsById.get(declId);
    const key = owner ? `${owner.structuralKey}::${name}` : null;
    const hydrated = key ? hydratedMetavars.get(key) : null;
    if (owner && hydrated && hydrated.type != null && hydrated.fp === owner.fingerprint) {
      return { type: hydrated.type, status: STATUS.STALE_KNOWN, source: 'hydrated' };
    }
    return null;
  }

  let getCheckerCode = typeof options.getCheckerCode === 'function' ? options.getCheckerCode : null;

  function checkerCodeFromSyntax(syntax) {
    if (!syntax) return '';
    // Prefer the code the settlement actually got loaded clean (erroring
    // blocks masked) — elaboration/hover on the healthy decls keeps working
    // even while other blocks have type errors.
    const checker = checkerStore.getSnapshot();
    if (checker && checker.checkedCode && checker.syntaxVersion === syntax.version) {
      return checker.checkedCode;
    }
    if (getCheckerCode) return getCheckerCode(syntax.doc);
    return checkerSnapshotFromSyntax(syntax).code;
  }

  function setCheckerCode(fn) {
    getCheckerCode = typeof fn === 'function' ? fn : null;
  }

  function checkerShowsBeluga(state) {
    return state === 'ready' || state === 'stale' || state === 'checking' || state === 'failed';
  }

  function belugaDiagnosticsForVersion(syntaxVersion) {
    const checker = checkerStore.getSnapshot();
    if (checker.syntaxVersion !== syntaxVersion) return [];
    if (!checkerShowsBeluga(checker.state)) return [];
    return checker.belugaDiagnostics;
  }

  function update(tree, doc, updateOptions = {}) {
    if (updateOptions.cursorPos != null) lastCursorPos = updateOptions.cursorPos;
    const prevSyntax = syntaxStore.getSnapshot();
    const syntax = timeSync('syntaxStore', () => syntaxStore.update(tree, doc, { ...updateOptions, documentId }));
    const parseIncomplete = syntax.doc.length > 0 && syntax.tree.length < syntax.doc.length;
    const symbolChanges = parseIncomplete ? null : (updateOptions.changes ?? null);
    let trigger = timeSync('settlementTrigger', () => settlementTrigger(prevSyntax, syntax, {
      changes: symbolChanges,
    }));
    if (updateOptions.forceResettle) trigger = 'semantic';
    const perf = getCheckTrace();
    if (perf.enabled) {
      perf.record('edit:trigger', 0, { trigger, version: syntax.version });
    }
    const deferSettlement = !!updateOptions.deferSettlement
      || (parseIncomplete && !updateOptions.changes);
    if (trigger === 'cosmetic' && settlement) {
      const preChecker = checkerStore.getSnapshot();
      if (preChecker.state === 'ready' || preChecker.state === 'stale') {
        settlement.cancelPending();
        checkerStore.adoptSyntaxVersion(syntax.version);
        checkerStore.holdVerdict();
        if (updateOptions.changes) checkerStore.remapDiagnostics(updateOptions.changes);
      } else if (preChecker.state === 'checking') {
        checkerStore.adoptSyntaxVersion(syntax.version);
        if (updateOptions.changes) checkerStore.remapDiagnostics(updateOptions.changes);
      }
    }
    // Thread the coalesced ChangeSet so the symbol store can reuse untouched
    // top-level declarations (its incremental path) instead of re-resolving the
    // whole file every edit. While the Lezer tree is still mid-parse the
    // top-level node set is truncated, so fall back to a full rebuild rather than
    // reason about a partial tree; the incremental path's own length/probe guards
    // then keep the fast path a pure win when it does engage.
    const symbols = symbolStore.update(syntax, { changes: symbolChanges });
    const belugaDiags = belugaDiagnosticsForVersion(syntax.version);
    const graph = timeSync('graphUpdate', () => semanticGraph.update(symbols, syntax, {
      belugaDiagnostics: belugaDiags,
      previous: semanticGraph.getSnapshot(),
    }));
    metavarStore.reconcile(graph.dirty, graph.removed);
    purgeHydratedMetavarsForDirty(graph.dirty, symbols);
    const checker = checkerStore.getSnapshot();
    snapshot = {
      documentId,
      version: syntax.version,
      syntax,
      symbols,
      graph,
      checker,
      summary: {
        symbols: symbols.symbols.length,
        globalSymbols: symbols.globalSymbols.length,
        references: symbols.references.length,
        resolvedReferences: symbols.references.filter((ref) => ref.symbolId).length,
        unresolvedReferences: symbols.references.filter((ref) => !ref.symbolId).length,
        edges: graph.edges.length,
        syntaxDiagnostics: syntax.syntaxDiagnostics.length,
        belugaDiagnostics: belugaDiags.length,
        dirty: graph.dirty.size,
      },
    };
    if (settlement && !deferSettlement) {
      if (trigger === 'cosmetic') {
        const checkerNow = checkerStore.getSnapshot();
        if (checkerNow.state === 'ready' || checkerNow.state === 'stale') {
          if (perf.enabled) perf.record('settle:skip', 0, { trigger, version: syntax.version });
        } else if (checkerNow.state === 'checking') {
          if (perf.enabled) perf.record('settle:skip', 0, { trigger: 'cosmetic-midcheck', version: syntax.version });
        } else {
          settlement.schedule(syntax, { trigger: 'semantic' });
        }
      } else if (trigger === 'syntax-only') {
        if (perf.enabled) perf.record('settle:skip', 0, { trigger, version: syntax.version });
        applySettlementToGraph();
        if (!settlement.isSettledFor(syntax.version)) {
          settlement.schedule(syntax, { trigger: 'semantic' });
        }
      } else {
        settlement.schedule(syntax, { trigger });
      }
    } else if (settlement && deferSettlement && perf.enabled) {
      perf.record('settle:defer', 0, { trigger, version: syntax.version, parseIncomplete });
    }
    return snapshot;
  }

  function ensureSettled() {
    const syntax = syntaxStore.getSnapshot();
    if (!syntax || !settlement) return;
    if (settlement.isSettledFor(syntax.version)) return;
    if (syntax.doc.length > 0 && syntax.tree.length < syntax.doc.length) return;
    if (settlement.isPending()) return;
    settlement.schedule(syntax, { trigger: 'semantic' });
  }

  function getBelugaDiagnostics() {
    return belugaDiagnosticsForDisplay(checkerStore.getSnapshot());
  }

  // Holes — known the INSTANT the `?` is parsed, NOT after a Beluga round-trip.
  // A `?` is a syntactic fact (the grammar's `Hole` node), so we enumerate holes
  // from the live parse tree immediately and ENRICH each with the checker's goal /
  // ctx / meta when reconstruction settles (matched by line/col). This means the
  // gutter / inspector / Proof-Lab list see holes as soon as syntax highlighting
  // shows them, instead of lagging seconds behind the checker. The checker store
  // still carries the rich data across invalidation (stale) and clears it on
  // failure — but its absence no longer hides a hole's existence.
  function getHoles() {
    const syntax = syntaxStore.getSnapshot();
    const parsed = syntax && syntax.tree
      ? parseHolesFromTree(syntax.tree, syntax.doc)
      : [];
    const checked = checkerStore.getSnapshot().holes || [];
    if (!parsed.length) {
      // No tree yet (first paint) — fall back to whatever the checker carries.
      return checked;
    }
    // Index checker holes by line:col for O(1) enrichment.
    const byPos = new Map();
    for (const h of checked) byPos.set(h.line + ':' + h.col, h);
    return parsed.map((p) => {
      const rich = byPos.get(p.line + ':' + p.col);
      if (!rich) {
        // Syntactic-only (checker hasn't typed it yet): bare hole, no goal.
        return { ...p, goal: null, ctx: [], meta: [] };
      }
      // Keep the live syntactic position/index; layer the checker's type data on.
      return { ...rich, line: p.line, col: p.col, from: p.from, to: p.to, index: p.index, name: rich.name || p.name };
    });
  }

  function applyBelugaOutput(rawOutput, { ok } = {}) {
    const syntax = syntaxStore.getSnapshot();
    if (!syntax) return [];
    const snap = checkerSnapshotFromSyntax(syntax);
    const failed = ok != null ? !ok : false;
    const diags = belugaDiagnosticsFromOutput(rawOutput, syntax.doc, {
      blockAt: snap.blockAt,
      hasSyntaxFault: snap.hasSyntaxFault,
      ok: !failed,
    });
    const resolvedOk = diags.length === 0 && !failed;
    const code = snap.code;
    const fp = belugaClient && typeof belugaClient.fingerprint === 'function'
      ? belugaClient.fingerprint(code)
      : String(code.length);
    checkerStore.applyResult({
      syntaxVersion: syntax.version,
      checkerFp: fp,
      ok: resolvedOk,
      belugaDiagnostics: diags,
      rawOutput: rawOutput || '',
    });
    applySettlementToGraph();
    if (onSettlement) onSettlement(checkerStore.getSnapshot());
    return diags;
  }

  function settleState() {
    return checkerStore.settleState();
  }

  function documentDiagnostics() {
    const syntax = syntaxStore.getSnapshot();
    const checker = checkerStore.getSnapshot();
    const syntaxDiags = syntax?.syntaxDiagnostics || [];
    const belugaDiags = belugaDiagnosticsForDisplay(checker);
    // NOTE: graph DIRTY/BLOCKED must never surface as diagnostics — cross-file
    // names (schemas/types defined in earlier suite members) are unresolved in
    // the LOCAL symbol store by design, so BLOCKED is a scheduling state, not a
    // user-facing error.
    const merged = mergeDiagnostics(syntaxDiags, belugaDiags);
    const overlay = getSuiteOverlayDiagnostics?.() || [];
    if (!overlay.length) return merged;
    return mergeDiagnostics(overlay, merged);
  }

  // Cross-file diagnostics for development members OTHER than the active file:
  // { [memberFileName]: [{ line, message, severity }] }. These come from the
  // development check the active file's session already ran (prelude members are
  // loaded and checked), surfaced per-member instead of as one banner. The active
  // file's own diagnostics live in documentDiagnostics()/belugaDiagnostics with
  // real positions; consumers combine the two for a whole-development view.
  function memberDiagnostics() {
    const checker = checkerStore.getSnapshot();
    if (checker.state !== 'ready' && checker.state !== 'stale' && checker.state !== 'checking') {
      return {};
    }
    return checker.memberDiagnostics || {};
  }

  function memberHoles() {
    const checker = checkerStore.getSnapshot();
    if (checker.state !== 'ready' && checker.state !== 'stale' && checker.state !== 'checking') {
      return {};
    }
    return checker.memberHoles || {};
  }

  function diagnosticsForSymbol(symbolId) {
    const node = semanticGraph.getSnapshot()?.nodeMap.get(symbolId);
    return node?.diagnostics ? node.diagnostics.slice() : [];
  }

  function diagnosticsAt(pos) {
    const ownerId = owningDeclarationId(pos);
    if (ownerId) return diagnosticsForSymbol(ownerId);
    return documentDiagnostics().filter((d) => d.from <= pos && pos < d.to);
  }

  function dirtyFrontier() {
    const g = semanticGraph.getSnapshot();
    return g ? [...g.dirty] : [];
  }

  async function elaborateViaSession(pos, resolved, sessionMgr) {
    const syntax = syntaxStore.getSnapshot();
    if (!syntax) return null;

    const symbols = symbolStore.getSnapshot();
    const ctx = metavarContext(pos, resolved, symbols);
    if (ctx) {
      const cached = bestMetavarType(ctx.declId, ctx.name, symbols);
      if (cached && cached.type != null) {
        return {
          name: ctx.name,
          type: cached.type,
          source: cached.source === 'hydrated' ? 'hydrated' : 'oracle',
          status: cached.status,
        };
      }
    }

    const sched = getScheduler();
    if (ctx) {
      const symbol = symbols && symbols.symbolsById.get(ctx.declId);
      if (sched) {
        await sched.ensureElaborated(ctx.declId, symbol?.range);
      } else {
        await elaborateDeclarationImplicits(ctx.declId);
      }
    }

    if (ctx) {
      const hit = bestMetavarType(ctx.declId, ctx.name, symbols);
      if (hit && hit.type != null) {
        return {
          name: ctx.name,
          type: hit.type,
          source: hit.source === 'hydrated' ? 'hydrated' : 'oracle',
          status: hit.status,
        };
      }
    }

    return {
      name: (resolved && resolved.name) || (ctx && ctx.name) || null,
      type: null,
      source: 'none',
      definitive: false,
    };
  }

  async function sessionTypeAt(pos) {
    if (!session || typeof session.typeAt !== 'function') return { ok: false, type: null, diagnostics: [] };
    const syntax = syntaxStore.getSnapshot();
    if (!syntax) return { ok: false, type: null, diagnostics: [] };
    const code = checkerCodeFromSyntax(syntax);
    const lineObj = syntax.doc.lineAt(pos);
    try {
      const r = await session.typeAt(code, lineObj.number, pos - lineObj.from);
      return { ok: !!(r && r.ok), type: r && r.type != null ? r.type : null, diagnostics: [] };
    } catch (_) {
      return { ok: false, type: null, diagnostics: [] };
    }
  }

  async function elaborateAt(pos) {
    const syntax = syntaxStore.getSnapshot();
    const symbols = symbolStore.getSnapshot();
    if (!symbols || !syntax) return null;

    const query = symbolStore.queryAt(pos);
    const resolved = resolveHoverDoc(syntax.tree, syntax.doc, pos);
    if (query && query.symbol) {
      const ann = declSignatureAnnotation(query.symbol, resolved);
      const best = pickDeclDisplayType(query.symbol, ann);
      if (best) {
        return { name: query.symbol.name, type: best.type, source: best.source, status: best.status };
      }
    }

    const ctx = metavarContext(pos, resolved, symbols);
    if (ctx) {
      const cached = bestMetavarType(ctx.declId, ctx.name, symbols);
      if (cached && cached.type != null) {
        return {
          name: ctx.name,
          type: cached.type,
          source: cached.source === 'hydrated' ? 'hydrated' : 'oracle',
          status: cached.status,
        };
      }
    }

    const ref = symbolStore.referenceAt(pos);
    if (ref && !ref.symbolId && ref.enclosingDeclarationId) {
      const declId = ref.enclosingDeclarationId;
      const cached = bestMetavarType(declId, ref.name, symbols);
      if (cached && cached.type != null) {
        return {
          name: ref.name,
          type: cached.type,
          source: cached.source === 'hydrated' ? 'hydrated' : 'oracle',
          status: cached.status,
        };
      }
      const hit = metavarStore.get(declId, ref.name);
      const owner = symbols.symbolsById.get(declId);
      const hydratedKey = owner ? `${owner.structuralKey}::${ref.name}` : null;
      const result = await sessionTypeAt(ref.range.from);
      metavarStore.apply(declId, ref.name, result);
      if (owner && result && result.ok !== false && result.type != null && hydratedKey) {
        hydratedMetavars.set(hydratedKey, { type: result.type, fp: owner.fingerprint });
      }
      if (result && result.ok !== false && result.type != null && onTypeObserved) {
        try { onTypeObserved(); } catch (_) {}
      }
      const now = metavarStore.get(declId, ref.name);
      if (now && now.type != null) {
        return { name: ref.name, type: now.type, source: 'oracle', status: now.status };
      }
      if (hit && hit.type != null) {
        return { name: ref.name, type: hit.type, source: 'oracle', status: STATUS.STALE_KNOWN };
      }
      return {
        name: ref.name,
        type: null,
        source: 'none',
        definitive: !!(result && result.ok !== false),
      };
    }

    return null;
  }

  function cachedTypeAt(pos) {
    const query = symbolStore.queryAt(pos);
    if (!query || !query.symbol) return null;
    const syntax = syntaxStore.getSnapshot();
    const resolved = syntax ? resolveHoverDoc(syntax.tree, syntax.doc, pos) : null;
    const ann = declSignatureAnnotation(query.symbol, resolved);
    const best = isDeclSignatureHover(resolved, query.symbol)
      ? pickDeclDisplayType(query.symbol, ann)
      : bestDeclType(query.symbol);
    if (!best) return null;
    return {
      name: query.symbol.name,
      label: query.symbol.label,
      isGlobal: query.symbol.isGlobal,
      type: best.type,
      source: best.source,
      status: best.status,
    };
  }

  // Reusable read API for the reconstructed-type data layer (expected-type-while-typing,
  // holes, etc.). Returns the fp-validated { type, status } record or null.
  function reconstructedTypeOf(symbolId) {
    if (!symbolId || !snapshot || !snapshot.symbols) return null;
    const symbol = snapshot.symbols.symbolsById.get(symbolId);
    if (!symbol) return null;
    const derived = derivationStore.get(symbol.structuralKey);
    if (derived && derived.type != null && derived.fp === symbol.fingerprint) {
      return { type: derived.type, status: derived.status || STATUS.FRESH };
    }
    return null;
  }

  function reconstructedTypeAt(pos) {
    const query = symbolStore.queryAt(pos);
    if (!query || !query.symbol) return null;
    return reconstructedTypeOf(query.symbol.id);
  }

  function exportTypes() {
    const symbols = symbolStore.getSnapshot();
    const decls = [];
    const metavars = [];
    const reconstructed = [];
    if (symbols) {
      for (const symbol of symbols.globalSymbols) {
        const hydrated = hydratedTypes.get(symbol.structuralKey);
        if (hydrated && hydrated.type != null && hydrated.fp === symbol.fingerprint) {
          decls.push([symbol.structuralKey, hydrated.type, hydrated.fp]);
        }
        const derived = derivationStore.get(symbol.structuralKey);
        if (derived && derived.type != null && derived.fp === symbol.fingerprint) {
          reconstructed.push([symbol.structuralKey, derived.type, derived.fp]);
        }
      }
      const seen = new Set();
      for (const [key, entry] of hydratedMetavars) {
        if (entry && entry.type != null) {
          metavars.push([key, entry.type, entry.fp]);
          seen.add(key);
        }
      }
      if (metavarStore.entries) {
        for (const [cacheKey, entry] of metavarStore.entries()) {
          if (!entry || entry.type == null) continue;
          const sep = cacheKey.lastIndexOf('::');
          if (sep < 0) continue;
          const declId = cacheKey.slice(0, sep);
          const mvName = cacheKey.slice(sep + 2);
          const owner = symbols.symbolsById.get(declId);
          if (!owner) continue;
          const sk = `${owner.structuralKey}::${mvName}`;
          if (seen.has(sk)) continue;
          seen.add(sk);
          metavars.push([sk, entry.type, owner.fingerprint]);
        }
      }
    }
    return { v: 1, decls, metavars, reconstructed };
  }

  function importTypes(blob, { dropOracle = false } = {}) {
    hydratedTypes = new Map();
    hydratedMetavars = new Map();
    derivationStore = new Map();
    for (const [key, type, fp] of (blob && blob.decls) || []) hydratedTypes.set(key, { type, fp });
    if (!dropOracle) {
      for (const [key, type, fp] of (blob && blob.metavars) || []) hydratedMetavars.set(key, { type, fp });
      for (const [key, type, fp] of (blob && blob.reconstructed) || []) {
        derivationStore.set(key, { type, fp, status: STATUS.STALE_KNOWN });
      }
    }
  }

  function exportDeriveProgress() {
    return [...derivationAttempted.entries()];
  }

  function importDeriveProgress(entries) {
    derivationAttempted.clear();
    for (const [key, fp] of entries || []) derivationAttempted.set(key, fp);
  }

  function exportCheckpoint() {
    const scopeKey = getScopeKey ? getScopeKey() : '';
    return {
      types: exportTypes(),
      identity: symbolStore.exportIdentity(),
      deriveAttempted: exportDeriveProgress(),
      scopeKey,
    };
  }

  function importCheckpoint(blob, { docFp, belugaBuild, scopeKey } = {}) {
    if (!blob) return { ok: false, reason: 'empty' };
    if (blob.docFp && docFp && blob.docFp !== docFp) {
      return { ok: false, reason: 'doc-fp-mismatch' };
    }
    if (blob.belugaBuild && belugaBuild && blob.belugaBuild !== belugaBuild) {
      return { ok: false, reason: 'build-mismatch' };
    }
    const storedScope = blob.scopeKey || '';
    const currentScope = scopeKey || (getScopeKey ? getScopeKey() : '');
    const legacyScope = (k) => k === 'legacy'
      || k.startsWith('cfg:')
      || k.startsWith('orphan:');
    const dropOracle = !!(storedScope && currentScope && storedScope !== currentScope)
      || storedScope === 'legacy'
      || legacyScope(storedScope);
    if (blob.types) importTypes(blob.types, { dropOracle });
    if (blob.identity) symbolStore.importIdentity(blob.identity);
    if (blob.deriveAttempted) importDeriveProgress(blob.deriveAttempted);
    return { ok: true, dropOracle };
  }

  function observeType(pos, type) {
    if (type == null) return;
    const symbol = symbolStore.symbolAt(pos) || symbolStore.declarationAt(pos);
    if (symbol && symbol.structuralKey) {
      hydratedTypes.set(symbol.structuralKey, { type, fp: symbol.fingerprint });
      if (onTypeObserved) {
        try { onTypeObserved(); } catch (_) {}
      }
    }
  }

  function observeMetavarNamed(declId, name, type) {
    if (type == null || !declId || !name) return;
    const symbols = symbolStore.getSnapshot();
    const owner = symbols && symbols.symbolsById.get(declId);
    metavarStore.apply(declId, name, { ok: true, type });
    if (owner) {
      hydratedMetavars.set(`${owner.structuralKey}::${name}`, { type, fp: owner.fingerprint });
    }
    if (onTypeObserved) {
      try { onTypeObserved(); } catch (_) {}
    }
  }

  function metavarHasType(declId, name) {
    const hit = metavarStore.get(declId, name);
    if (hit && hit.type != null && hit.status === STATUS.FRESH) return true;
    const symbols = symbolStore.getSnapshot();
    const owner = symbols && symbols.symbolsById.get(declId);
    if (!owner) return false;
    const hydrated = hydratedMetavars.get(`${owner.structuralKey}::${name}`);
    if (hydrated && hydrated.type != null && hydrated.fp === owner.fingerprint) {
      return !owningDeclIsDirty(declId);
    }
    return false;
  }

  function prewarmStructuralMetavars(declId) {
    const syntax = syntaxStore.getSnapshot();
    if (!syntax || !symbolStore.implicitSitesForDeclaration) return;
    for (const site of symbolStore.implicitSitesForDeclaration(declId)) {
      const resolved = resolveHoverDoc(syntax.tree, syntax.doc, site.position);
      if (!resolved || !resolved.sourceType) continue;
      const existing = metavarStore.get(declId, site.name);
      if (existing && existing.type === resolved.sourceType && existing.status === STATUS.FRESH) {
        continue;
      }
      observeMetavarNamed(declId, site.name, resolved.sourceType);
    }
  }

  function applyImplicitResults(declId, implicits) {
    if (!implicits) return;
    for (const imp of implicits) {
      if (imp && imp.name && imp.type != null) {
        observeMetavarNamed(declId, imp.name, imp.type);
      }
    }
  }

  async function elaborateDeclarationImplicits(declId) {
    const symbols = symbolStore.getSnapshot();
    const syntax = syntaxStore.getSnapshot();
    if (!symbols || !syntax) return { ok: false, complete: false };

    const symbol = symbols.symbolsById.get(declId);
    if (!symbol || !symbol.range) return { ok: false, complete: false };

    prewarmStructuralMetavars(declId);

    const sites = symbolStore.implicitSitesForDeclaration
      ? symbolStore.implicitSitesForDeclaration(declId)
      : [];
    if (sites.length === 0) return { ok: true, complete: true };

    const pendingOf = () => sites.filter((s) => !metavarHasType(declId, s.name));
    if (pendingOf().length === 0) return { ok: true, complete: true };

    if (!session) return { ok: false, complete: false };

    const code = checkerCodeFromSyntax(syntax);
    const doc = syntax.doc;
    const startLine = doc.lineAt(symbol.range.from).number;
    const endLine = doc.lineAt(symbol.range.to).number;

    let pending = pendingOf();
    const batch = await session.elaborateDecl(code, startLine, endLine, pending);
    applyImplicitResults(declId, batch.implicits);

    pending = pendingOf();
    if (pending.length > 0 && session.elaboratePositions) {
      const fb = await session.elaboratePositions(code, pending);
      applyImplicitResults(declId, fb.implicits);
    }

    return { ok: true, complete: pendingOf().length === 0 };
  }

  // Background population of the reconstructed-type data layer. Called once per
  // settle-cycle by the scheduler. Walks dirty global decls, fetches the
  // implicit-expanded type via the session, and writes it to derivationStore.
  const DERIVE_BATCH = 6;
  // Decls already attempted at their current fingerprint (success OR failure), so
  // a permanent failure doesn't keep the scheduler re-arming. Cleared per-key
  // implicitly by the fp check below when the decl changes.
  const derivationAttempted = new Map(); // structuralKey -> fp
  // Cross-file uses (a prelude term used here) examined at the owner decl's
  // current fp — so a permanently-untypeable use doesn't keep the scheduler
  // re-arming, and a use is re-examined when its owning declaration changes.
  const crossFileAttempted = new Map(); // `${ownerStructuralKey}::${name}` -> fp

  // Returns true if reconstruction work remains (so the scheduler should re-arm).
  async function deriveFrontier() {
    if (!session) return false;
    const symbols = symbolStore.getSnapshot();
    const syntax = syntaxStore.getSnapshot();
    if (!symbols || !syntax) return false;

    const code = checkerCodeFromSyntax(syntax);
    if (!code) return false;

    let budget = DERIVE_BATCH;
    let more = false;

    // (1) Reconstructed types for THIS file's own global declarations.
    if (typeof session.ideDeclType === 'function') {
      const needsDerive = (symbol) => {
        if (!symbol || !symbol.isGlobal || !symbol.name) return false;
        const fresh = derivationStore.get(symbol.structuralKey);
        if (fresh && fresh.fp === symbol.fingerprint) return false;
        const tried = derivationAttempted.get(symbol.structuralKey);
        if (tried === symbol.fingerprint) return false;
        return true;
      };
      for (const symbol of symbols.globalSymbols) {
        if (budget <= 0) break;
        if (!needsDerive(symbol)) continue;
        budget -= 1;
        derivationAttempted.set(symbol.structuralKey, symbol.fingerprint);
        try {
          const r = await session.ideDeclType(code, symbol.name);
          if (r && r.ok && r.type != null) {
            const merged = mergeDeclSignatures(symbol.sourceText, r.type) || r.type;
            derivationStore.set(symbol.structuralKey, {
              type: merged,
              fp: symbol.fingerprint,
              status: STATUS.FRESH,
            });
            if (onTypeObserved) {
              try { onTypeObserved(); } catch (_) {}
            }
          }
        } catch (_) {}
      }
      if (symbols.globalSymbols.some(needsDerive)) more = true;
    }

    // (2) Cross-file pre-warm: a use of a prelude-defined term whose type the
    //     checker must supply (the B1 external case) is, once the suite is
    //     settled, elaborated in the BACKGROUND — same as single-file decls —
    //     so the hover is instant rather than elaborating on demand. Reuses
    //     elaborateAt's reference cache path (metavarStore + hydratedMetavars).
    if (typeof session.typeAt === 'function' && Array.isArray(symbols.references)) {
      for (const ref of symbols.references) {
        if (ref.symbolId || !ref.enclosingDeclarationId || ref.resolution !== 'unresolved') continue;
        const owner = symbols.symbolsById.get(ref.enclosingDeclarationId);
        if (!owner) continue;
        const key = `${owner.structuralKey}::${ref.name}`;
        if (crossFileAttempted.get(key) === owner.fingerprint) continue;
        const cached = bestMetavarType(ref.enclosingDeclarationId, ref.name, symbols);
        if (cached && cached.status === STATUS.FRESH) { crossFileAttempted.set(key, owner.fingerprint); continue; }
        const r = resolveHoverDoc(syntax.tree, syntax.doc, ref.from);
        if (!(r && r.kind === 'external' && r.needsElaboration)) {
          crossFileAttempted.set(key, owner.fingerprint); // not a candidate; don't re-scan at this fp
          continue;
        }
        if (budget <= 0) { more = true; break; } // a real candidate but out of budget → retry next tick
        budget -= 1;
        crossFileAttempted.set(key, owner.fingerprint);
        try {
          const result = await sessionTypeAt(ref.from);
          metavarStore.apply(ref.enclosingDeclarationId, ref.name, result);
          if (result && result.ok !== false && result.type != null) {
            hydratedMetavars.set(key, { type: result.type, fp: owner.fingerprint });
            if (onTypeObserved) { try { onTypeObserved(); } catch (_) {} }
          }
        } catch (_) {}
      }
    }

    return more;
  }

  function observeMetavarAt(pos, type) {
    if (type == null) return;
    const ref = symbolStore.referenceAt(pos);
    if (!ref || ref.symbolId || !ref.enclosingDeclarationId) {
      observeType(pos, type);
      return;
    }
    observeMetavarNamed(ref.enclosingDeclarationId, ref.name, type);
  }

  function hoverAt(pos, options = {}) {
    const trace = createHoverTrace(hoverTraceEnabled(options));
    const syntax = syntaxStore.getSnapshot();
    const symbols = symbolStore.getSnapshot();
    const base = {
      position: pos,
      trace: trace ? trace.events : undefined,
    };

    if (!syntax || !symbols) {
      const out = { status: 'unavailable', reason: 'no-snapshot', proof: 'engine-not-initialized', ...base };
      trace?.record('unavailable', out);
      return out;
    }

    const query = symbolStore.queryAt(pos);
    const onPragma = query && query.symbol && query.symbol.namespace === NAMESPACE.PRAGMA;
    const ref = onPragma ? null : symbolStore.referenceAt(pos);
    const resolved = onPragma ? null : resolveHoverDoc(syntax.tree, syntax.doc, pos);
    const ownerId = owningDeclarationId(pos);
    const blocked = blockedContext(ownerId);
    const presentation = {
      label: (onPragma && query.symbol.label)
        || (resolved && resolved.label)
        || (query && query.symbol && query.symbol.label) || null,
      name: (onPragma && (query.symbol.displayName || query.symbol.name))
        || (resolved && resolved.name)
        || (query && query.symbol && query.symbol.name)
        || (ref && ref.name) || null,
      displayName: (onPragma && (query.symbol.displayName || query.symbol.name))
        || (resolved && resolved.displayName) || presentationName(resolved, query, ref),
      symbol: query && query.symbol ? query.symbol : null,
      reference: ref || (query && query.reference) || null,
      classification: classifyHover(resolved, ref, query),
      owningDeclarationId: ownerId,
    };
    trace?.record('classify', { ...presentation, blocked: !!blocked });

    if (!resolved && !query && !ref) {
      const out = { status: 'suppressed', reason: 'no-identifier', ...base };
      trace?.record('suppressed', out);
      return out;
    }

    // Resolve the type through the ONE shared synchronous ladder so the tooltip
    // and the inspector (intelSyncAt) can never disagree. A `definitive` result
    // is the final answer — emit it ready immediately (even a definitive null,
    // e.g. an unannotated binder → head-only tooltip). Otherwise fall through to
    // async elaboration below.
    const sync = syncResolveType(pos, resolved, query, ref);
    if (sync.definitive) {
      const out = attachDependencyMeta({
        status: 'ready',
        source: sync.source,
        type: sync.type,
        derivationStatus: sync.status,
        ...base,
        ...presentation,
      }, blocked);
      trace?.record('ready', { source: sync.source, instant: true });
      return out;
    }

    const stale = staleTypeFor(pos, resolved);
    const staleType = stale && stale.type != null ? projectTypeAt(pos, stale.type) : null;
    const staleSource = stale && stale.source;

    const key = elaborationKey(pos, resolved, ref, query);
    const promise = dedupeElaboration(key, () => {
      if (session && resolved && resolved.needsElaboration) {
        return elaborateViaSession(pos, resolved, session);
      }
      return elaborateAt(pos);
    })
      .then((elab) => finalizeElaboration(elab, resolved, options, pos))
      .catch((error) => ({
        status: 'pending',
        reason: 'transient-failure',
        error: error && error.message ? error.message : String(error),
        retryable: true,
      }));

    const out = {
      status: 'pending',
      reason: staleType != null ? 'awaiting-session' : 'uncached',
      staleType,
      staleSource,
      promise,
      ...base,
      ...presentation,
      ...(blocked && blocked.graphStatus === STATUS.BLOCKED ? {
        dependencyBlocked: true,
        blockedBy: blocked.blockedBy,
        blockedReason: blocked.reason,
      } : {}),
    };
    trace?.record('pending', { reason: out.reason, stale: !!staleType, key, blocked: !!blocked });
    return out;
  }

  function attachDependencyMeta(result, blocked) {
    if (!result || !blocked || blocked.graphStatus !== STATUS.BLOCKED) return result;
    return {
      ...result,
      dependencyBlocked: true,
      blockedBy: blocked.blockedBy,
      blockedReason: blocked.reason,
    };
  }

  function presentationName(resolved, query, ref) {
    if (resolved && resolved.displayName) return resolved.displayName;
    if (query && query.symbol) return query.symbol.name;
    if (ref) return ref.name;
    return null;
  }

  function classifyHover(resolved, ref, query) {
    if (resolved && resolved.kind === 'local') return 'explicit-binder';
    if (resolved && resolved.kind === 'unbound') return 'unbound-ref';
    if (resolved && resolved.kind === 'implicit') return 'implicit-metavar';
    // A name defined by an earlier project file: a global reference — must win
    // over the unresolved-ref implicit-metavar guess below.
    if (resolved && resolved.kind === 'external') return 'global-ref';
    if (ref && !ref.symbolId && ref.enclosingDeclarationId) return 'implicit-metavar';
    if (query && query.symbol) return query.symbol.isGlobal ? 'global-decl' : 'local-decl';
    if (resolved && resolved.kind === 'global') return 'global-ref';
    return 'unknown';
  }

  function syncTypeFor(pos, resolved, query, ref) {
    const cached = cachedTypeAt(pos);
    if (cached && cached.type != null) {
      return {
        type: cached.type,
        source: mapTypeSource(cached),
        status: cached.status,
      };
    }
    const symbols = symbolStore.getSnapshot();
    const ctx = metavarContext(pos, resolved, symbols);
    if (ctx) {
      const mv = bestMetavarType(ctx.declId, ctx.name, symbols);
      if (mv && mv.type != null) {
        const implicit = resolved && resolved.kind === 'implicit';
        const staleWhileDirty = implicit
          && owningDeclIsDirty(ctx.declId)
          && mv.status !== STATUS.FRESH;
        if (!staleWhileDirty && mv.status === STATUS.FRESH) {
          return {
            type: mv.type,
            source: mv.source === 'hydrated' ? 'stale-cache' : mv.source,
            status: mv.status,
          };
        }
      }
    }
    return null;
  }

  function staleTypeFor(pos, resolved) {
    const cached = cachedTypeAt(pos);
    if (cached && cached.type != null) {
      return { type: cached.type, source: mapTypeSource(cached), status: cached.status };
    }
    const symbols = symbolStore.getSnapshot();
    const ctx = metavarContext(pos, resolved, symbols);
    if (ctx) {
      const mv = bestMetavarType(ctx.declId, ctx.name, symbols);
      if (mv && mv.type != null) {
        return {
          type: mv.type,
          source: mv.source === 'hydrated' ? 'stale-cache' : mv.source,
          status: mv.status,
        };
      }
    }
    if (resolved && resolved.sourceText) {
      return { type: resolved.sourceText, source: 'source' };
    }
    return null;
  }

  function elaborationKey(pos, resolved, ref, query) {
    const declId = (ref && !ref.symbolId && ref.enclosingDeclarationId)
      || (resolved && resolved.kind === 'implicit' ? owningDeclarationId(pos) : null);
    if (declId) return `decl:${declId}`;
    if (query && query.symbol) return `sym:${query.symbol.id}`;
    return `pos:${pos}`;
  }

  async function finalizeElaboration(elab, resolved, options, pos) {
    const query = symbolStore.queryAt(pos);
    const sym = query && query.symbol;
    const declAnn = isDeclSignatureHover(resolved, sym)
      ? declSignatureAnnotation(sym, resolved)
      : null;
    if (elab && elab.type != null) {
      const projected = projectTypeAt(pos, elab.type);
      const type = declAnn
        ? projectTypeAt(pos, mergeDeclSignatures(declAnn, projected))
        : projected;
      return {
        status: 'ready',
        type,
        source: elab.source === 'hydrated' ? 'stale-cache'
          : elab.source === 'oracle' ? 'beluga'
          : declAnn ? 'reconstructed'
          : 'source',
        derivationStatus: elab.status,
      };
    }
    if (elab && elab.source === 'none') {
      if (declAnn) {
        return { status: 'ready', type: projectTypeAt(pos, declAnn), source: 'source' };
      }
      if (options.fallback && resolved && resolved.fallback) {
        const fb = await options.fallback(resolved.fallback);
        if (fb) {
          const projected = projectTypeAt(pos, fb);
          const type = declAnn
            ? projectTypeAt(pos, mergeDeclSignatures(declAnn, projected))
            : projected;
          return {
            status: 'ready',
            type,
            source: 'beluga',
            via: 'fallback',
          };
        }
      }
      if (elab.definitive) {
        return {
          status: 'unavailable',
          reason: 'no-type-at-position',
          proof: 'session-definitive-empty',
        };
      }
      return { status: 'pending', reason: 'session-miss', retryable: true };
    }
    return {
      status: 'pending',
      reason: 'transient-session-miss',
      retryable: true,
    };
  }

  // One-call navigation substrate for the UI (go-to-def, find-refs, rename,
  // reveal-binder, insert-signature), resolved through the symbol store +
  // reconstructed-type layer. Synchronous; null when no identifier is at `pos`.
  function navAt(pos) {
    const symbols = symbolStore.getSnapshot();
    if (!symbols) return null;
    const ref = symbolStore.referenceAt(pos);
    const target = symbolStore.definitionAt(pos);
    if (!target && !ref) return null;

    const sym = symbolStore.symbolAt(pos);
    const onDefinition = !!(sym && target && sym.id === target.id);

    const references = target ? symbolStore.referencesOf(target.id) : [];
    const picked = target ? pickDeclDisplayType(target) : null;
    const signature = picked && picked.type != null
      ? {
        type: picked.type,
        source: picked.source === 'reconstructed' ? 'reconstructed' : 'source',
        status: picked.status,
      }
      : null;

    return {
      symbolId: target ? target.id : null,
      name: target ? target.name : (ref ? ref.name : null),
      isGlobal: target ? target.isGlobal : false,
      onDefinition,
      // Declaration name range (jump-to-def target / rename anchor).
      nameRange: target ? target.nameRange : null,
      // Full declaration span.
      declRange: target ? target.range : null,
      // The reference under the cursor, if any (a free metavar has no symbolId).
      reference: ref
        ? { range: ref.range, name: ref.name, resolution: ref.resolution, symbolId: ref.symbolId }
        : null,
      references: references.map((r) => ({ from: r.range.from, to: r.range.to })),
      // For reveal-binder on a free metavar that resolves to no symbol.
      enclosingDeclarationId: ref ? ref.enclosingDeclarationId : null,
      // Best-known signature for insert-signature (reconstructed preferred).
      signature,
    };
  }

  // The inspector's one-call substrate: identity + type + references + the typed
  // dependency graph, synchronously (NO await). Type and status come from the
  // SHARED resolver (syncResolveType / userStatusAt) — the exact same logic the
  // hover tooltip uses — so the inspector and tooltip never disagree. `needsAsync`
  // is true when a type genuinely needs session elaboration (the UI then awaits
  // via intelTypePromise and re-settles). Null when no identifier is at `pos`.
  function intelSyncAt(pos) {
    const query = symbolStore.queryAt(pos);
    if (!query) return null;
    const symbols = symbolStore.getSnapshot();
    const syntax = syntaxStore.getSnapshot();
    const onPragma = query.symbol && query.symbol.namespace === NAMESPACE.PRAGMA;
    const ref = onPragma ? null : symbolStore.referenceAt(pos);
    const resolved = (!onPragma && symbols && syntax)
      ? resolveHoverDoc(syntax.tree, syntax.doc, pos) : null;
    const target = query.symbol || (query.reference && query.reference.symbolId && symbols
      ? symbols.symbolsById.get(query.reference.symbolId)
      : null);
    const id = target ? target.id : null;

    const sync = syncResolveType(pos, resolved, query, ref);
    const userStatus = userStatusAt(pos, sync);

    const displayName = target && (target.displayName || target.name);
    return {
      name: displayName || (query.reference && query.reference.name)
        || (resolved && resolved.name) || null,
      label: (target && target.label) || (resolved && resolved.label) || null,
      namespace: target ? target.namespace : (query.reference && query.reference.namespace) || null,
      definition: target
        ? {
          id: target.id,
          name: target.displayName || target.name,
          range: target.namespace === NAMESPACE.PRAGMA ? target.range : target.nameRange,
          isGlobal: target.isGlobal,
        }
        : null,
      reference: query.reference
        ? { range: query.reference.range, resolution: query.reference.resolution }
        : null,
      references: id
        ? symbolStore.referencesOf(id).map((r) => ({
          from: r.range.from, to: r.range.to, name: r.name, resolution: r.resolution,
        }))
        : [],
      type: sync.type,
      typeSource: sync.source,
      typeStatus: sync.status,
      typePending: userStatus.state === 'checking',
      needsAsync: sync.needsAsync,
      // User-facing status (checked / checking / error) + tooltip detail —
      // kind-aware, position-based, identical basis to the hover tooltip.
      userStatus,
      // Internal graph status retained for debugging, not shown raw.
      status: id ? semanticGraph.statusForSymbol(id) : STATUS.UNKNOWN,
      dependencies: id ? semanticGraph.dependenciesOf(id) : [],
      dependents: id ? semanticGraph.dependentsOf(id) : [],
      impact: id ? semanticGraph.impactOf(id) : [],
    };
  }

  // Async type for `pos`, mirroring the tooltip's elaboration so the inspector
  // can re-settle a 'recalculating' term to its true type. Resolves to a string
  // type or null. Reuses hoverAt's promise (same dedupe key, same session path).
  function intelTypePromise(pos, options = {}) {
    const hover = hoverAt(pos, options);
    if (hover && hover.status === 'ready' && hover.type != null) {
      return Promise.resolve(hover.type);
    }
    if (hover && hover.promise) {
      return Promise.resolve(hover.promise).then((final) => {
        if (final && final.status === 'ready' && final.type != null) return final.type;
        return null;
      }).catch(() => null);
    }
    return Promise.resolve(hover && hover.type != null ? hover.type : null);
  }

  // Reconstructed type for a development MEMBER declaration by name. The active
  // file's session already loaded the prelude (checkerCode includes it), so
  // ideDeclType answers for any earlier-member decl — this lifts the inspector's
  // cross-file view from a source-only signature to the real reconstructed type.
  // Async; resolves null when the session can't reconstruct it (caller falls back
  // to the source signature). Only meaningful for in-development members.
  function memberTypePromise(name) {
    if (!session || typeof session.ideDeclType !== 'function' || !name) {
      return Promise.resolve(null);
    }
    const syntax = syntaxStore.getSnapshot();
    const code = checkerCodeFromSyntax(syntax);
    if (!code) return Promise.resolve(null);
    return Promise.resolve(session.ideDeclType(code, name))
      .then((r) => (r && r.ok && r.type != null ? r.type : null))
      .catch(() => null);
  }

  // Range of a global symbol's name by id (for click-to-jump from the inspector
  // dependency/usage lists). Null when the id is unknown in the current snapshot.
  function symbolRangeById(id) {
    const symbols = symbolStore.getSnapshot();
    const symbol = symbols && id ? symbols.symbolsById.get(id) : null;
    return symbol ? symbol.nameRange : null;
  }

  // Top-level declarations of the current document, in source order, for the
  // inspector's file outline. Only the "headline" namespaces (type families,
  // comp types, recs, schemas, typedefs, modules) — constructors/constants are
  // reachable via the type's dependents and via search, and would bloat the
  // list. Each row carries what the outline row needs (name, label, namespace,
  // jump range, error flag). [] when nothing has parsed yet.
  function outlineSymbols() {
    const symbols = symbolStore.getSnapshot();
    if (!symbols) return [];
    const out = [];
    for (const s of symbols.declarations) {
      if (!OUTLINE_NAMESPACES.has(s.namespace)) continue;
      out.push({
        id: s.id,
        name: s.displayName || s.name,
        label: s.label,
        namespace: s.namespace,
        nameRange: s.nameRange ? { from: s.nameRange.from, to: s.nameRange.to } : null,
        hasError: diagnosticsForSymbol(s.id).some((d) => d.severity === 'error'),
      });
    }
    return out;
  }

  // All occurrence ranges (definition name + references) for the symbol at
  // `pos`. Backs the word-occurrence highlight. [] when nothing resolves.
  function occurrencesAt(pos) {
    const target = symbolStore.definitionAt(pos);
    if (!target) return [];
    const out = [];
    if (target.nameRange) out.push({ from: target.nameRange.from, to: target.nameRange.to });
    for (const r of symbolStore.referencesOf(target.id)) {
      out.push({ from: r.range.from, to: r.range.to });
    }
    return out.sort((a, b) => a.from - b.from || a.to - b.to);
  }

  function queryAt(pos) {
    const query = symbolStore.queryAt(pos);
    if (!query || !query.symbol) return query;
    const status = semanticGraph.statusForSymbol(query.symbol.id);
    const node = semanticGraph.getSnapshot()?.nodeMap.get(query.symbol.id);
    const syntax = syntaxStore.getSnapshot();
    const resolved = syntax ? resolveHoverDoc(syntax.tree, syntax.doc, pos) : null;
    const ann = declSignatureAnnotation(query.symbol, resolved);
    const best = isDeclSignatureHover(resolved, query.symbol)
      ? pickDeclDisplayType(query.symbol, ann)
      : bestDeclType(query.symbol);
    const real = best && best.source === 'hydrated' ? best : null;
    return {
      ...query,
      hoverType: (best && best.type) || node?.cachedType || query.hoverType,
      derivedType: real ? real.type : null,
      derivationStatus: real ? real.status : null,
      diagnostics: node?.diagnostics || [],
      status,
    };
  }

  function debugSnapshot() {
    if (!snapshot) return null;
    return {
      documentId: snapshot.documentId,
      version: snapshot.version,
      summary: snapshot.summary,
      symbols: snapshot.symbols.symbols.map((symbol) => ({
        id: symbol.id,
        structuralKey: symbol.structuralKey,
        name: symbol.name,
        namespace: symbol.namespace,
        range: symbol.range,
        nameRange: symbol.nameRange,
        isGlobal: symbol.isGlobal,
        sourceText: symbol.sourceText,
      })),
      references: snapshot.symbols.references.map((ref) => ({
        id: ref.id,
        name: ref.name,
        range: ref.range,
        symbolId: ref.symbolId,
        namespace: ref.namespace,
        resolution: ref.resolution,
        enclosingDeclarationId: ref.enclosingDeclarationId,
      })),
      dirty: [...snapshot.graph.dirty]
        .map((id) => snapshot.graph.nodeMap.get(id)?.name)
        .filter(Boolean),
      changes: [...snapshot.graph.changes]
        .filter(([, kind]) => kind !== 'unchanged')
        .map(([id, kind]) => ({ name: snapshot.graph.nodeMap.get(id)?.name, kind })),
      graph: {
        nodes: snapshot.graph.nodes.map((node) => ({
          id: node.id,
          name: node.name,
          namespace: node.namespace,
          status: node.status,
        })),
        edges: snapshot.graph.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          kind: edge.kind,
          references: edge.references.map((ref) => ref.name),
        })),
      },
      derivations: snapshot.symbols.globalSymbols.map((symbol) => {
        const h = hydratedTypes.get(symbol.structuralKey);
        return { name: symbol.name, type: h ? h.type : null, status: h ? STATUS.STALE_KNOWN : null };
      }),
      diagnostics: snapshot.syntax.syntaxDiagnostics,
    };
  }

  return {
    update,
    queryAt,
    visibleSymbolsAt: (pos, opts) => symbolStore.visibleSymbolsAt(pos, opts),
    expectedNamespacesAt: (pos, refKind) => {
      const syntax = syntaxStore.getSnapshot();
      if (!syntax?.tree) return null;
      return expectedNamespacesAt(syntax.tree, pos, refKind);
    },
    definitionAt: (pos) => symbolStore.definitionAt(pos),
    referencesOf: (symbolId) => symbolStore.referencesOf(symbolId),
    renamePreview: (symbolId, newName) => symbolStore.renamePreview(symbolId, newName),
    navAt,
    occurrencesAt,
    exportIdentity: () => symbolStore.exportIdentity(),
    importIdentity: (entries) => symbolStore.importIdentity(entries),
    dirtyFrontier,
    deriveFrontier,
    elaborateAt,
    cachedTypeAt,
    reconstructedTypeOf,
    reconstructedTypeAt,
    exportTypes,
    importTypes,
    exportCheckpoint,
    importCheckpoint,
    observeType,
    observeMetavarAt,
    observeMetavarNamed,
    elaborateDeclarationImplicits,
    intelSyncAt,
    intelTypePromise,
    memberTypePromise,
    userStatusAt,
    symbolRangeById,
    outlineSymbols,
    hoverAt,
    dependenciesOf: (symbolId) => semanticGraph.dependenciesOf(symbolId),
    dependentsOf: (symbolId) => semanticGraph.dependentsOf(symbolId),
    impactOf: (symbolId) => semanticGraph.impactOf(symbolId),
    graphFor: (selection) => semanticGraph.graphFor(selection),
    getSnapshot: () => snapshot,
    getBelugaDiagnostics,
    getHoles,
    applyBelugaOutput,
    settleState,
    isSettledFor: (version) => (settlement ? settlement.isSettledFor(version) : true),
    isSettlementPending: () => (settlement ? settlement.isPending() : false),
    ensureSettled,
    documentDiagnostics,
    memberDiagnostics,
    memberHoles,
    diagnosticsForSymbol,
    diagnosticsAt,
    debugSnapshot,
    stores: {
      checker: checkerStore,
      syntax: syntaxStore,
      symbols: symbolStore,
      graph: semanticGraph,
      metavar: metavarStore,
    },
    session,
    scheduler: getScheduler(),
    setCheckerCode,
    getCheckerCode: () => checkerCodeFromSyntax(syntaxStore.getSnapshot()),
    onCursorMove: (pos) => getScheduler()?.onCursorMove(pos),
    onViewportChange: (range) => getScheduler()?.onViewportChange(range),
    onDocChange: () => {
      if (scheduler) scheduler.onDocChange();
    },
  };
}
