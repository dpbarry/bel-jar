import { acceptCompletion, autocompletion, closeCompletion, moveCompletionSelection, startCompletion } from '@codemirror/autocomplete';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { classifyCompletionSite, isIdentChar } from './classify.mjs';
import { contributeIdents, contributeModuleMembers } from './contributors.mjs';
import { contributeSnippets } from './snippets.mjs';
import { rankLookupItems } from './weigh.mjs';
import { completionChrome } from './chrome.mjs';

const MAX_OPTIONS = 24;

const IDENT_VALID = /^[\p{L}\p{N}_'#$\u0080-\uFFFF]*$/u;

export function permitsImplicitCompletion(site) {
  if (!site) return false;
  if (site.kind === 'structure' || site.kind === 'module-member') return true;
  return site.kind === 'ident' && site.maxJust >= 2;
}

// Same as CM's completionKeymap, but Tab accepts (Enter inserts a newline).
// Structure snippets are ranked first so Tab at `case e of` inserts `| … ⇒`.
const belCompletionKeymap = [
  { key: 'Ctrl-Space', run: startCompletion },
  { mac: 'Alt-`', run: startCompletion },
  { mac: 'Alt-i', run: startCompletion },
  { key: 'Escape', run: closeCompletion },
  { key: 'ArrowDown', run: moveCompletionSelection(true) },
  { key: 'ArrowUp', run: moveCompletionSelection(false) },
  { key: 'PageDown', run: moveCompletionSelection(true, 'page') },
  { key: 'PageUp', run: moveCompletionSelection(false, 'page') },
  { key: 'Tab', run: acceptCompletion },
];

function lookupToCmOption(item) {
  const opt = {
    label: item.label,
    apply: item.insert != null ? item.insert : item.label,
    type: item.cmType || 'text',
    detail: item.detail,
  };
  if (item.info && item.info !== item.detail) opt.info = item.info;
  return opt;
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

function activeDocumentPath() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  const ed = shellEditor();
  const P = g.Persist;
  if (ed && typeof ed.getFilePath === 'function') {
    const path = ed.getFilePath();
    if (path) return String(path).replace(/\\/g, '/').replace(/^workspace:\/\//, '');
  }
  const id = (ed && typeof ed.getCurrentFileId === 'function' && ed.getCurrentFileId())
    || (P && typeof P.getActiveFileId === 'function' && P.getActiveFileId())
    || '';
  if (!id) return '';
  if (P && typeof P.listFiles === 'function') {
    for (const f of P.listFiles()) {
      if (f.id === id && f.name) return String(f.name);
    }
  }
  return String(id).replace(/^workspace:\/\//, '');
}

export function gatherCompletions(site, engine, state, opts = {}) {
  if (!site || site.kind === 'none') return [];

  if (site.kind === 'module-member') {
    return rankLookupItems(
      contributeModuleMembers(site, engine),
      site.query || '',
      opts.limit || MAX_OPTIONS,
    );
  }

  const snippets = contributeSnippets(site);
  let idents = [];
  if (site.idents !== false && (site.kind === 'ident' || site.kind === 'structure')) {
    idents = contributeIdents(
      { ...site, kind: 'ident' },
      engine,
      {
        getPeerSymbols: opts.getPeerSymbols || peerSymbolsFromShell,
        activePath: opts.activePath != null ? opts.activePath : activeDocumentPath(),
      },
    );
  }

  // Structure snippets first (scoreHints.base), then idents. case-arm has idents:false so
  // only the `|` snippet remains — typing `l` after `of` yields an empty list.
  const raw = snippets.length ? [...snippets, ...idents] : idents;
  return rankLookupItems(raw, site.query || '', opts.limit || MAX_OPTIONS);
}

export function belCompletionSource(engine, opts = {}) {
  return (context) => {
    if (!engine) return null;
    const pos = context.pos;
    const site = classifyCompletionSite(context.state, pos, engine);
    if (!site || site.kind === 'none') return null;

    if (site.kind === 'ident') {
      if (site.from === site.to && !context.explicit) return null;
      if (!context.explicit && !permitsImplicitCompletion(site)) return null;
      if (!context.explicit && site.query) {
        const last = site.query[site.query.length - 1];
        if (!isIdentChar(last)) return null;
      }
    }

    if (site.kind === 'structure' || site.kind === 'module-member') {
      if (!context.explicit && !permitsImplicitCompletion(site)) return null;
      // Empty-query structure / `Foo.` slots must fire so Tab can accept.
    }

    const items = gatherCompletions(site, engine, context.state, opts);
    if (!items.length && !context.explicit) return null;
    return {
      from: site.from,
      to: site.to,
      options: items.map(lookupToCmOption),
      validFor: IDENT_VALID,
    };
  };
}

export function belAutocompletion(engine, opts = {}) {
  return [
    autocompletion({
      activateOnTyping: true,
      defaultKeymap: false,
      icons: false,
      maxRenderedOptions: opts.maxRenderedOptions || MAX_OPTIONS,
      override: [belCompletionSource(engine, opts)],
    }),
    Prec.highest(keymap.of(belCompletionKeymap)),
    completionChrome(),
  ];
}

export { completionChrome };
