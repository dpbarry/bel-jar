import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { classifyCompletionSite, isIdentChar } from './classify.mjs';
import { contributeIdents, contributeModuleMembers } from './contributors.mjs';
import {
  contributeSnippets,
  isCompKindSlot,
  isLfKindSlot,
} from './snippets.mjs';
import { rankLookupItems } from './weigh.mjs';

const MAX_OPTIONS = 24;
// Sentinel for rankLookupItems: keep every justified item. The popup still
// renders at most MAX_OPTIONS; truncating the *pool* would make later letters
// unable to surface names ranked outside top-N.
const POOL_UNCAPPED = 0;

export function permitsImplicitCompletion(site) {
  if (!site) return false;
  if (site.kind === 'structure' || site.kind === 'module-member') return true;
  return site.kind === 'ident' && site.maxJust >= 2;
}

function shellEditor() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.CurrentEditor || g.BelEditor || null;
}

function peerSymbolsFromShell() {
  const ed = shellEditor();
  if (ed && typeof ed.listProjectSymbols === 'function') {
    try { return ed.listProjectSymbols() || []; } catch (_) { return []; }
  }
  return [];
}

function treeForGather(state, engine, pos) {
  const snap = engine?.stores?.syntax?.getSnapshot?.();
  if (snap?.tree && snap.doc && snap.doc.length === state.doc.length) {
    return snap.tree;
  }
  const need = Math.min(state.doc.length, Math.max((pos || 0) + 512, 0));
  return ensureSyntaxTree(state, need, 100)
    || ensureSyntaxTree(state, state.doc.length, 5000)
    || syntaxTree(state);
}

function kindStructureAt(state, engine, pos) {
  const tree = treeForGather(state, engine, pos);
  if (!tree) return null;
  if (isLfKindSlot(tree, state.doc, pos)) return 'lf-kind';
  if (isCompKindSlot(tree, state.doc, pos)) return 'comp-kind';
  return null;
}

function sitePoolKey(site) {
  if (!site || site.kind === 'none') return '';
  const namespaces = site.namespaces ? [...site.namespaces].sort().join(',') : '';
  return [
    site.kind,
    site.structure || '',
    namespaces,
    site.refKind || '',
    site.allowLocals ? 'locals' : '',
    site.localsOnly ? 'locals-only' : '',
    site.moduleName || '',
  ].join('|');
}

function kindSnippetsFor(site, engine, state) {
  const existing = contributeSnippets(site);
  if (existing.length) return existing;
  if (!state || site?.idents === false) return [];
  const pos = site.from != null ? site.from : 0;
  const structure = kindStructureAt(state, engine, pos);
  if (!structure) return [];
  return contributeSnippets({ ...site, structure });
}

function resolvedSite(state, pos, engine) {
  let site = classifyCompletionSite(state, pos, engine);
  if (!site || site.kind === 'none') return site;
  if (!site.structure && site.idents !== false) {
    const structure = kindStructureAt(state, engine, pos);
    if (structure) {
      site = {
        ...site,
        kind: 'structure',
        structure,
        maxJust: Math.max(site.maxJust || 1, 2),
        idents: true,
      };
    }
  }
  return site;
}

function shouldOffer(site, explicit) {
  if (!site || site.kind === 'none') return false;
  if (site.kind === 'ident') {
    if (site.from === site.to && !explicit) return false;
    if (!explicit && !permitsImplicitCompletion(site)) return false;
    if (!explicit && site.query) {
      const last = site.query[site.query.length - 1];
      if (!isIdentChar(last)) return false;
    }
  }
  if (site.kind === 'structure' || site.kind === 'module-member') {
    if (!explicit && !permitsImplicitCompletion(site)) return false;
  }
  return true;
}

function shellActivePath() {
  const ed = shellEditor();
  if (ed && typeof ed.getActivePath === 'function') {
    try { return ed.getActivePath() || ''; } catch (_) { return ''; }
  }
  const g = typeof window !== 'undefined' ? window : globalThis;
  if (g.Persist && typeof g.Persist.getActiveFileName === 'function') {
    try { return g.Persist.getActiveFileName() || ''; } catch (_) { return ''; }
  }
  return '';
}

export function gatherCompletions(site, engine, state, opts = {}) {
  if (!site || site.kind === 'none') return [];

  if (site.kind === 'module-member') {
    return rankLookupItems(
      contributeModuleMembers(site, engine),
      site.query || '',
      opts.limit != null ? opts.limit : MAX_OPTIONS,
      opts.weights,
    );
  }

  const snippets = kindSnippetsFor(site, engine, state);
  let idents = [];
  if (site.idents !== false && (site.kind === 'ident' || site.kind === 'structure')) {
    idents = contributeIdents(
      { ...site, kind: 'ident' },
      engine,
      {
        getPeerSymbols: opts.getPeerSymbols || peerSymbolsFromShell,
        activePath: opts.activePath || shellActivePath(),
      },
    );
  }

  const raw = snippets.length ? [...snippets, ...idents] : idents;
  return rankLookupItems(
    raw,
    site.query || '',
    opts.limit != null ? opts.limit : MAX_OPTIONS,
    opts.weights,
  );
}

export function createCompletionController(engine, opts = {}) {
  let retainedPool = null;

  function compute(state, pos, explicit) {
    if (!engine) return null;
    const site = resolvedSite(state, pos, engine);
    if (!shouldOffer(site, explicit)) return null;

    const poolKey = sitePoolKey(site);
    if (!retainedPool
        || retainedPool.from !== site.from
        || retainedPool.key !== poolKey) {
      retainedPool = {
        from: site.from,
        key: poolKey,
        items: gatherCompletions(
          { ...site, query: '' },
          engine,
          state,
          { ...opts, limit: opts.poolLimit != null ? opts.poolLimit : POOL_UNCAPPED },
        ),
      };
    }

    const items = rankLookupItems(
      retainedPool.items,
      site.query || '',
      opts.limit != null ? opts.limit : MAX_OPTIONS,
      opts.weights,
    );
    if (!items.length && !explicit) return null;
    const query = site.query || '';
    // Finished token: sole exact-label row is a no-op — hide the popup.
    if (items.length === 1
        && query
        && String(items[0].label || '').toLowerCase() === query.toLowerCase()) {
      return null;
    }
    return {
      from: site.from,
      to: site.to,
      query,
      items,
    };
  }

  function computeUpdate(state, _from, to, explicit) {
    const site = resolvedSite(state, to, engine);
    if (!site
        || site.kind === 'none'
        || !retainedPool
        || site.from !== retainedPool.from
        || sitePoolKey(site) !== retainedPool.key) {
      retainedPool = null;
      return null;
    }
    return compute(state, to, explicit);
  }

  function resetPool() {
    retainedPool = null;
  }

  return { compute, computeUpdate, resetPool };
}

function lookupToCmOption(item) {
  const opt = {
    label: item.label,
    apply: item.insert != null ? item.insert : item.label,
    type: item.cmType || 'text',
    detail: item.detail,
    signature: item.signature,
    signatureKind: item.signatureKind,
  };
  if (item.info && item.info !== item.detail) opt.info = item.info;
  return opt;
}

export function belCompletionSource(engine, opts = {}) {
  const controller = createCompletionController(engine, opts);
  let sharedResult = null;

  function toCmResult(result) {
    if (!result) return null;
    if (!sharedResult) {
      sharedResult = {
        from: result.from,
        to: result.to,
        options: [],
        filter: false,
        update(_current, from, to, nextContext) {
          return toCmResult(controller.computeUpdate(nextContext.state, from, to, false));
        },
      };
    }
    sharedResult.from = result.from;
    sharedResult.to = result.to;
    sharedResult.options = result.items.map(lookupToCmOption);
    return sharedResult;
  }

  return (context) => toCmResult(controller.compute(context.state, context.pos, context.explicit));
}

export { MAX_OPTIONS as COMPLETION_MAX_OPTIONS };
