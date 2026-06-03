import { resolveHoverDoc } from '../bel-resolve.mjs';
import { createHoverTrace, hoverTraceEnabled } from './hover-trace.mjs';
import { createMetavarStore } from './metavar-store.mjs';
import { DEFAULT_DOCUMENT_ID, normalizeDocumentId, STATUS } from './ids.mjs';
import { createSemanticGraph } from './semantic-graph.mjs';
import { createSymbolStore } from './symbol-store.mjs';
import { createSyntaxStore } from './syntax-store.mjs';
import { createSemanticSession } from './semantic-session.mjs';
import { createSemanticScheduler } from './semantic-scheduler.mjs';

export function createSemanticEngine(options = {}) {
  const documentId = normalizeDocumentId(options.documentId || DEFAULT_DOCUMENT_ID);
  const syntaxStore = createSyntaxStore({ documentId });
  const symbolStore = createSymbolStore();
  const semanticGraph = createSemanticGraph();
  const metavarStore = createMetavarStore();
  const session = options.session || (options.belugaClient ? createSemanticSession(options.belugaClient) : null);
  const onTypeObserved = typeof options.onTypeObserved === 'function' ? options.onTypeObserved : null;
  let snapshot = null;
  // Cross-session type memory: structuralKey -> last-known type, restored from
  // storage via importTypes(). Because the structural key is deterministic and
  // identity-stable (recomputed identically in a fresh session, unshaken by
  // formatting/insertions), a reopened file can show its types INSTANTLY as
  // stale-known instead of waiting for the whole-file recheck — the thing the
  // legacy name+offset cache can't durably do.
  let hydratedTypes = new Map();
  let hydratedMetavars = new Map();
  const elaborationInflight = new Map();
  
  // Initialize scheduler lazily after engine setup
  let scheduler = null;
  function getScheduler() {
    if (!scheduler && session) {
      const engine = {
        stores: { syntax: syntaxStore, symbols: symbolStore, metavar: metavarStore },
        observeMetavarAt: (pos, type) => observeMetavarAt(pos, type),
        observeMetavarNamed: (declId, name, type) => observeMetavarNamed(declId, name, type),
        elaborateDeclarationImplicits: (declId) => elaborateDeclarationImplicits(declId),
        dirtyFrontier,
        getCheckerCode: () => checkerCodeFromSyntax(syntaxStore.getSnapshot()),
      };
      scheduler = createSemanticScheduler(engine, session);
    }
    return scheduler;
  }

  function mapTypeSource(best) {
    if (!best) return null;
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

  // Best available type for a declaration symbol, freshest first:
  // freshly oracle-derived → persisted last-known (stale) → source annotation.
  function bestDeclType(symbol) {
    if (!symbol) return null;
    // Persisted last-known type — served ONLY if the declaration's content is
    // unchanged (fingerprint match). A changed decl falls through rather than
    // show a type that no longer matches what's on screen.
    const hydrated = hydratedTypes.get(symbol.structuralKey);
    if (hydrated && hydrated.type != null && hydrated.fp === symbol.fingerprint) {
      return { type: hydrated.type, status: STATUS.STALE_KNOWN, source: 'hydrated' };
    }
    if (symbol.sourceText) return { type: symbol.sourceText, status: STATUS.UNKNOWN, source: 'annotation' };
    return null;
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
    return getCheckerCode ? getCheckerCode(syntax.doc) : syntax.doc.toString();
  }

  function setCheckerCode(fn) {
    getCheckerCode = typeof fn === 'function' ? fn : null;
  }

  function update(tree, doc, updateOptions = {}) {
    const syntax = syntaxStore.update(tree, doc, { ...updateOptions, documentId });
    const symbols = symbolStore.update(syntax);
    const graph = semanticGraph.update(symbols, syntax);
    // Demote dirty entries to stale-known and drop removed ones — keep the
    // last-known truth of everything untouched by this edit.
    metavarStore.reconcile(graph.dirty, graph.removed);
    snapshot = {
      documentId,
      version: syntax.version,
      syntax,
      symbols,
      graph,
      summary: {
        symbols: symbols.symbols.length,
        globalSymbols: symbols.globalSymbols.length,
        references: symbols.references.length,
        resolvedReferences: symbols.references.filter((ref) => ref.symbolId).length,
        unresolvedReferences: symbols.references.filter((ref) => !ref.symbolId).length,
        edges: graph.edges.length,
        syntaxDiagnostics: syntax.syntaxDiagnostics.length,
        dirty: graph.dirty.size,
      },
    };
    return snapshot;
  }

  // The minimal set of SymbolIds whose semantics must be re-derived after the
  // last edit — what a scheduler (or the future oracle) re-checks instead of
  // the whole document. Everything not in it keeps its stale-known insight.
  function dirtyFrontier() {
    const g = semanticGraph.getSnapshot();
    return g ? [...g.dirty] : [];
  }

  // Best-available type at a position, via the tiered model:
  //   'annotation' — a resolved symbol/binder's source-written type (instant,
  //                  no oracle; this is how V2 already types explicitly-bound
  //                  implicits like `(P : [Ψ ⊢ tm K A])` that legacy missed).
  //   'oracle'     — an UNANNOTATED implicit metavariable (free uppercase var),
  //                  resolved via the oracle at THIS occurrence (the only place
  //                  Beluga answers for it) and cached by enclosing decl + name.
  //   'none'       — nothing typable here.
  // Elaborate via the session manager (preferred path for implicit metavars)
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

  // Per-position Beluga type query via the single warm session — the engine's
  // only round-trip path now that the oracle/derivation tier is gone. Normalizes
  // to the { ok, type, diagnostics } shape callers expect. (Decl-level
  // reconstructed types — "derivation" — will return here via a dedicated shim
  // primitive: planned next, see project_semantic_v2.)
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

  // Async only because the session may round-trip; the annotation path
  // resolves synchronously inside the returned promise.
  async function elaborateAt(pos) {
    const syntax = syntaxStore.getSnapshot();
    const symbols = symbolStore.getSnapshot();
    if (!symbols || !syntax) return null;

    const query = symbolStore.queryAt(pos);
    const best = query && query.symbol ? bestDeclType(query.symbol) : null;
    if (best) {
      return { name: query.symbol.name, type: best.type, source: best.source, status: best.status };
    }

    const resolved = resolveHoverDoc(syntax.tree, syntax.doc, pos);
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
      // Query at THIS occurrence (the only position Beluga types a metavar).
      const result = await sessionTypeAt(ref.range.from);
      metavarStore.apply(declId, ref.name, result);
      if (owner && result && result.ok !== false && result.type != null && hydratedKey) {
        hydratedMetavars.set(hydratedKey, { type: result.type, fp: owner.fingerprint });
      }
      if (result && result.ok !== false && result.type != null && onTypeObserved) {
        try { onTypeObserved(); } catch (_) { /* persistence hooks are best-effort */ }
      }
      const now = metavarStore.get(declId, ref.name);
      if (now && now.type != null) {
        return { name: ref.name, type: now.type, source: 'oracle', status: now.status };
      }
      // Oracle gave nothing; surface a prior stale value if we have one.
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

  // Synchronous best-known type at a position — NO oracle round-trip. Serves
  // freshly-derived, persisted-stale, or source-annotated types instantly.
  // This is the hover fast-path: a reopened file shows last-known types with
  // zero latency, and the recheck only upgrades stale → fresh in the
  // background. Returns null when only the oracle could answer (a metavar with
  // no cached/persisted entry).
  function cachedTypeAt(pos) {
    const query = symbolStore.queryAt(pos);
    const best = query && query.symbol ? bestDeclType(query.symbol) : null;
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

  // Serialize last-known declaration types keyed by structural key (stable
  // across sessions) for persistence. importTypes() restores them so the next
  // session is warm. Only real types are exported (not source-annotation
  // fallbacks, which are recomputed for free).
  function exportTypes() {
    const symbols = symbolStore.getSnapshot();
    const decls = [];
    const metavars = [];
    if (symbols) {
      for (const symbol of symbols.globalSymbols) {
        const hydrated = hydratedTypes.get(symbol.structuralKey);
        if (hydrated && hydrated.type != null && hydrated.fp === symbol.fingerprint) {
          decls.push([symbol.structuralKey, hydrated.type, hydrated.fp]);
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
    return { v: 1, decls, metavars };
  }

  function importTypes(blob) {
    hydratedTypes = new Map();
    hydratedMetavars = new Map();
    for (const [key, type, fp] of (blob && blob.decls) || []) hydratedTypes.set(key, { type, fp });
    for (const [key, type, fp] of (blob && blob.metavars) || []) hydratedMetavars.set(key, { type, fp });
  }

  // Record a type produced elsewhere (e.g. the production checker's own
  // derivation) into V2's durable, identity-keyed cache — no extra Beluga
  // call, so it adds zero load. This is how V2 becomes the persistent type
  // memory that survives a refresh while production stays the authority.
  function observeType(pos, type) {
    if (type == null) return;
    const symbol = symbolStore.symbolAt(pos) || symbolStore.declarationAt(pos);
    if (symbol && symbol.structuralKey) {
      hydratedTypes.set(symbol.structuralKey, { type, fp: symbol.fingerprint });
      if (onTypeObserved) {
        try { onTypeObserved(); } catch (_) { /* persistence hooks are best-effort */ }
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
      try { onTypeObserved(); } catch (_) { /* persistence hooks are best-effort */ }
    }
  }

  function metavarHasType(declId, name) {
    const hit = metavarStore.get(declId, name);
    if (hit && hit.type != null) return true;
    const symbols = symbolStore.getSnapshot();
    const owner = symbols && symbols.symbolsById.get(declId);
    if (!owner) return false;
    const hydrated = hydratedMetavars.get(`${owner.structuralKey}::${name}`);
    return !!(hydrated && hydrated.type != null && hydrated.fp === owner.fingerprint);
  }

  function prewarmStructuralMetavars(declId) {
    const syntax = syntaxStore.getSnapshot();
    if (!syntax || !symbolStore.implicitSitesForDeclaration) return;
    for (const site of symbolStore.implicitSitesForDeclaration(declId)) {
      if (metavarHasType(declId, site.name)) continue;
      const resolved = resolveHoverDoc(syntax.tree, syntax.doc, site.position);
      if (resolved && resolved.sourceType) {
        observeMetavarNamed(declId, site.name, resolved.sourceType);
      }
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

  function observeMetavarAt(pos, type) {
    if (type == null) return;
    const ref = symbolStore.referenceAt(pos);
    if (!ref || ref.symbolId || !ref.enclosingDeclarationId) {
      observeType(pos, type);
      return;
    }
    observeMetavarNamed(ref.enclosingDeclarationId, ref.name, type);
  }

  // The single coherent query every feature can ask: who is at this position,
  // where is it defined, where is it used, what's its type, what state is it
  // in, what does it depend on, and what depends on it (impact). One call,
  // keyed to stable identity — the substrate jump-to-def / references / rename
  // / hover / graph-view all route through.
  // Authoritative hover query (Milestone 1). Every UI path routes here.
  // Returns ready | pending | blocked | unavailable with explicit provenance.
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

    const resolved = resolveHoverDoc(syntax.tree, syntax.doc, pos);
    const query = symbolStore.queryAt(pos);
    const ref = symbolStore.referenceAt(pos);
    const ownerId = owningDeclarationId(pos);
    const blocked = blockedContext(ownerId);
    const presentation = {
      label: (resolved && resolved.label) || (query && query.symbol && query.symbol.label) || null,
      name: (resolved && resolved.name) || (query && query.symbol && query.symbol.name)
        || (ref && ref.name) || null,
      displayName: (resolved && resolved.displayName) || presentationName(resolved, query, ref),
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

    // Priority 1: Local source type (explicit binders, declarations with `: T`)
    if (resolved && resolved.sourceType) {
      const out = attachDependencyMeta({
        status: 'ready',
        source: 'local',
        type: resolved.sourceType,
        ...base,
        ...presentation,
      }, blocked);
      trace?.record('ready', { source: 'local', instant: true });
      return out;
    }

    if (resolved && resolved.kind === 'local') {
      const out = attachDependencyMeta({
        status: 'ready',
        source: 'source',
        type: resolved.text,
        ...base,
        ...presentation,
      }, blocked);
      trace?.record('ready', { source: 'source', cache: 'hit' });
      return out;
    }

    const sync = syncTypeFor(pos, resolved, query, ref);
    if (sync && sync.type != null) {
      const out = attachDependencyMeta({
        status: 'ready',
        type: sync.type,
        source: sync.source,
        derivationStatus: sync.status,
        stale: sync.source === 'stale-cache',
        ...base,
        ...presentation,
      }, blocked);
      trace?.record('ready', { source: sync.source, cache: 'hit' });
      return out;
    }

    if (resolved && resolved.sourceText) {
      const out = attachDependencyMeta({
        status: 'ready',
        source: 'source',
        type: resolved.sourceText,
        ...base,
        ...presentation,
      }, blocked);
      trace?.record('ready', { source: 'source', signature: true });
      return out;
    }

    const stale = staleTypeFor(pos, resolved) || (sync && sync.type == null ? sync : null);
    const staleType = stale && stale.type != null ? stale.type : null;
    const staleSource = stale && stale.source;

    const key = elaborationKey(pos, resolved, ref, query);
    const promise = dedupeElaboration(key, () => {
      // Implicit metavars batch-elaborate per declaration via the session;
      // everything else falls to the per-position session query in elaborateAt.
      if (session && resolved && resolved.needsElaboration) {
        return elaborateViaSession(pos, resolved, session);
      }
      return elaborateAt(pos);
    })
      .then((elab) => finalizeElaboration(elab, resolved, options))
      .catch((error) => ({
        status: 'pending',
        reason: 'transient-failure',
        error: error && error.message ? error.message : String(error),
        retryable: true,
      }));

    const out = {
      status: 'pending',
      reason: sync ? 'awaiting-oracle' : 'uncached',
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
    if (resolved && resolved.kind === 'implicit') return 'implicit-metavar';
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
        return {
          type: mv.type,
          source: mv.source === 'hydrated' ? 'stale-cache' : mv.source,
          status: mv.status,
        };
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

  async function finalizeElaboration(elab, resolved, options) {
    if (elab && elab.type != null) {
      return {
        status: 'ready',
        type: elab.type,
        source: elab.source === 'hydrated' ? 'stale-cache'
          : elab.source === 'oracle' ? 'beluga'
          : 'source',
        derivationStatus: elab.status,
      };
    }
    if (elab && elab.source === 'none') {
      if (options.fallback && resolved && resolved.fallback) {
        const fb = await options.fallback(resolved.fallback);
        if (fb) {
          return { status: 'ready', type: fb, source: 'beluga', via: 'fallback' };
        }
      }
      if (elab.definitive) {
        return {
          status: 'unavailable',
          reason: 'no-type-at-position',
          proof: 'oracle-definitive-empty',
        };
      }
      return { status: 'pending', reason: 'oracle-miss', retryable: true };
    }
    return {
      status: 'pending',
      reason: 'transient-oracle-miss',
      retryable: true,
    };
  }

  async function intelAt(pos) {
    const query = symbolStore.queryAt(pos);
    if (!query) return null;
    const target = query.symbol || (query.reference && query.reference.symbolId
      ? symbolStore.getSnapshot().symbolsById.get(query.reference.symbolId)
      : null);
    const elaboration = await elaborateAt(pos);
    const id = target ? target.id : null;
    return {
      name: (target && target.name) || (query.reference && query.reference.name) || null,
      label: target ? target.label : null,
      namespace: target ? target.namespace : (query.reference && query.reference.namespace),
      definition: target
        ? { id: target.id, name: target.name, range: target.nameRange, isGlobal: target.isGlobal }
        : null,
      reference: query.reference
        ? { range: query.reference.range, resolution: query.reference.resolution }
        : null,
      references: id ? symbolStore.referencesOf(id).map((r) => r.range) : [],
      type: elaboration ? elaboration.type : null,
      typeSource: elaboration ? elaboration.source : null,
      status: id ? semanticGraph.statusForSymbol(id) : STATUS.UNKNOWN,
      dependencies: id ? semanticGraph.dependenciesOf(id) : [],
      dependents: id ? semanticGraph.dependentsOf(id) : [],
      impact: id ? semanticGraph.impactOf(id) : [],
    };
  }

  function queryAt(pos) {
    const query = symbolStore.queryAt(pos);
    if (!query || !query.symbol) return query;
    const status = semanticGraph.statusForSymbol(query.symbol.id);
    const node = semanticGraph.getSnapshot()?.nodeMap.get(query.symbol.id);
    // Freshest-first via bestDeclType: oracle-derived → persisted-stale →
    // source annotation. hoverType shows the best of those (annotation is a
    // fine fallback); derivedType is reserved for a REAL reconstructed type
    // (oracle/hydrated), null when only the source annotation is available.
    const best = bestDeclType(query.symbol);
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
      // Last-known type per global declaration from the persisted/hydrated
      // cache — the at-a-glance check that the type memory is populated.
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
    definitionAt: (pos) => symbolStore.definitionAt(pos),
    referencesOf: (symbolId) => symbolStore.referencesOf(symbolId),
    renamePreview: (symbolId, newName) => symbolStore.renamePreview(symbolId, newName),
    exportIdentity: () => symbolStore.exportIdentity(),
    importIdentity: (entries) => symbolStore.importIdentity(entries),
    dirtyFrontier,
    elaborateAt,
    cachedTypeAt,
    exportTypes,
    importTypes,
    observeType,
    observeMetavarAt,
    observeMetavarNamed,
    elaborateDeclarationImplicits,
    intelAt,
    hoverAt,
    dependenciesOf: (symbolId) => semanticGraph.dependenciesOf(symbolId),
    dependentsOf: (symbolId) => semanticGraph.dependentsOf(symbolId),
    impactOf: (symbolId) => semanticGraph.impactOf(symbolId),
    graphFor: (selection) => semanticGraph.graphFor(selection),
    getSnapshot: () => snapshot,
    debugSnapshot,
    stores: {
      syntax: syntaxStore,
      symbols: symbolStore,
      graph: semanticGraph,
      metavar: metavarStore,
    },
    session,
    scheduler: getScheduler(),
    setCheckerCode,
    // Wiring for CodeMirror integration
    onCursorMove: (pos) => getScheduler()?.onCursorMove(pos),
    onViewportChange: (range) => getScheduler()?.onViewportChange(range),
    onDocChange: () => {
      if (scheduler) scheduler.onDocChange();
    },
  };
}
