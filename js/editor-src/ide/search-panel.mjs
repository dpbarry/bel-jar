// Custom find/replace panel — replaces CodeMirror's default (unstyled) search
// panel with one built in BelJar's design language. Floats over the editor's
// top-right corner (VS Code-style), does not reflow content.
//
// All search BEHAVIOR comes from @codemirror/search (SearchQuery, findNext,
// replaceAll, ...); this module only owns the DOM.
import {
  SearchQuery,
  setSearchQuery,
  getSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  closeSearchPanel,
  search,
} from '@codemirror/search';
import { EditorSelection } from '@codemirror/state';
import { scrollIntoViewCenter } from './viewport.mjs';

const ICONS = {
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  replaceOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h10v3"/><path d="M9 20h6"/><path d="M12 4v16"/><path d="m17 14 3 3-3 3"/><path d="M14 17h6"/></svg>',
  replaceAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><path d="M13 7h3a2 2 0 0 1 2 2v2"/></svg>',
};

const MATCH_CAP = 1000;

function bindTip(el) {
  const g = typeof window !== 'undefined' ? window : self;
  if (g.Tooltips && g.Tooltips.bind) g.Tooltips.bind(el);
}

function hideTips() {
  const g = typeof window !== 'undefined' ? window : self;
  if (g.Tooltips && g.Tooltips.hideImmediate) g.Tooltips.hideImmediate();
}

function closePanel(view) {
  hideTips();
  closeSearchPanel(view);
}

function iconBtn(html, label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bel-search-btn';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('data-tooltip', label);
  btn.innerHTML = html;
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor/input focus
  btn.addEventListener('click', onClick);
  bindTip(btn);
  return btn;
}

function chipBtn(text, label, onToggle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bel-search-chip';
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('data-tooltip', label);
  btn.textContent = text;
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('is-on', on);
    onToggle(on);
  });
  bindTip(btn);
  return btn;
}

// Count matches and locate which one the main selection sits on.
// Returns { total, current } with total capped at MATCH_CAP.
function countMatches(query, state) {
  if (!query.search) return { total: 0, current: 0 };
  let total = 0;
  let current = 0;
  const sel = state.selection.main;
  try {
    const cursor = query.getCursor(state);
    let item = cursor.next();
    while (!item.done && total < MATCH_CAP) {
      total++;
      if (item.value.from === sel.from && item.value.to === sel.to) current = total;
      item = cursor.next();
    }
    if (!item.done) total = MATCH_CAP; // capped; shown as "999+"
  } catch {
    return { total: 0, current: 0 };
  }
  return { total, current };
}

function distanceToMatch(pos, { from, to }) {
  if (pos >= from && pos <= to) return 0;
  return pos < from ? from - pos : pos - to;
}

function findClosestMatch(query, state) {
  if (!query.search || !query.valid) return null;
  const pos = state.selection.main.head;
  let best = null;
  let bestDist = Infinity;
  try {
    const cur = query.getCursor(state);
    let item = cur.next();
    while (!item.done) {
      const dist = distanceToMatch(pos, item.value);
      if (dist < bestDist) {
        bestDist = dist;
        best = item.value;
      }
      item = cur.next();
    }
  } catch {
    return null;
  }
  return best;
}

function createSearchPanel(view) {
  const dom = document.createElement('div');
  dom.className = 'bel-search';

  // State mirrored into SearchQuery on every commit.
  let caseSensitive = false;
  let regexp = false;
  let wholeWord = false;
  let replaceOpen = false;

  // ── Left edge: expand strip (spans both rows, VS Code style) ───────────────
  const expandBtn = iconBtn(ICONS.chevronRight, 'Toggle replace', () => setReplaceOpen(!replaceOpen));
  expandBtn.classList.add('bel-search-expand');

  // ── Row 1: find ────────────────────────────────────────────────────────────
  const findRow = document.createElement('div');
  findRow.className = 'bel-search-row';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'bel-search-inputwrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'bel-search-input';
  input.placeholder = 'Find';
  input.setAttribute('main-field', 'true'); // CM: keep panel open while focused
  input.autocomplete = 'off';
  input.spellcheck = false;

  const chips = document.createElement('div');
  chips.className = 'bel-search-chips';
  const caseChip = chipBtn('Aa', 'Match case', (on) => { caseSensitive = on; commit(); });
  const wordChip = chipBtn('ab', 'Whole word', (on) => { wholeWord = on; commit(); });
  const regexChip = chipBtn('.*', 'Regular expression', (on) => { regexp = on; commit(); });
  chips.append(caseChip, wordChip, regexChip);

  inputWrap.append(input, chips);

  const count = document.createElement('span');
  count.className = 'bel-search-count';
  count.textContent = '';

  const prevBtn = iconBtn(ICONS.arrowUp, 'Previous match (Shift+Enter)', () => findPrevious(view));
  const nextBtn = iconBtn(ICONS.arrowDown, 'Next match (Enter)', () => findNext(view));
  const closeBtn = iconBtn(ICONS.close, 'Close (Esc)', () => closePanel(view));

  findRow.append(inputWrap, count, prevBtn, nextBtn, closeBtn);

  // ── Row 2: replace ─────────────────────────────────────────────────────────
  const replaceRow = document.createElement('div');
  replaceRow.className = 'bel-search-row bel-search-row--replace';
  replaceRow.hidden = true;

  const replaceWrap = document.createElement('div');
  replaceWrap.className = 'bel-search-inputwrap bel-search-inputwrap--replace';

  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.className = 'bel-search-input';
  replaceInput.placeholder = 'Replace';
  replaceInput.autocomplete = 'off';
  replaceInput.spellcheck = false;
  replaceWrap.appendChild(replaceInput);

  const replaceBtn = iconBtn(ICONS.replaceOne, 'Replace (Enter)', () => { commit(); replaceNext(view); });
  const replaceAllBtn = iconBtn(ICONS.replaceAll, 'Replace all', () => { commit(); replaceAll(view); });

  replaceRow.append(replaceWrap, replaceBtn, replaceAllBtn);

  const main = document.createElement('div');
  main.className = 'bel-search-main';
  main.append(findRow, replaceRow);

  dom.append(expandBtn, main);

  function setReplaceOpen(open) {
    replaceOpen = open;
    replaceRow.hidden = !open;
    expandBtn.innerHTML = open ? ICONS.chevronDown : ICONS.chevronRight;
    dom.classList.toggle('is-replace-open', open);
    if (open) replaceInput.focus();
  }

  function buildQuery() {
    return new SearchQuery({
      search: input.value,
      caseSensitive,
      regexp,
      wholeWord,
      replace: replaceInput.value,
      literal: !regexp,
    });
  }

  function commit() {
    const query = buildQuery();
    const effects = [setSearchQuery.of(query)];
    let selection;
    if (query.search && query.valid) {
      const match = findClosestMatch(query, view.state);
      if (match) {
        const sel = view.state.selection.main;
        if (match.from !== sel.from || match.to !== sel.to) {
          selection = EditorSelection.single(match.from, match.to);
          effects.push(scrollIntoViewCenter(match.from));
        }
      }
    }
    view.dispatch({
      effects,
      selection,
      userEvent: selection ? 'select.search' : undefined,
    });
    refreshCount(query);
  }

  function refreshCount(query) {
    const q = query || buildQuery();
    const { total, current } = countMatches(q, view.state);
    if (!q.search) {
      count.textContent = '';
      dom.classList.remove('is-no-results');
      return;
    }
    const totalLabel = total >= MATCH_CAP ? `${MATCH_CAP - 1}+` : String(total);
    count.textContent = current ? `${current} of ${totalLabel}` : (total ? totalLabel : 'No results');
    dom.classList.toggle('is-no-results', total === 0);
  }

  input.addEventListener('input', commit);
  replaceInput.addEventListener('input', commit);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) findPrevious(view);
      else findNext(view);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePanel(view);
    }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
      replaceNext(view);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePanel(view);
    }
  });

  return {
    dom,
    top: true,
    mount() {
      // Adopt any existing query (e.g. reopened panel).
      const existing = getSearchQuery(view.state);
      if (existing && existing.search) {
        input.value = existing.search;
        replaceInput.value = existing.replace || '';
        caseSensitive = !!existing.caseSensitive;
        regexp = !!existing.regexp;
        wholeWord = !!existing.wholeWord;
        caseChip.classList.toggle('is-on', caseSensitive);
        caseChip.setAttribute('aria-pressed', String(caseSensitive));
        regexChip.classList.toggle('is-on', regexp);
        regexChip.setAttribute('aria-pressed', String(regexp));
        wordChip.classList.toggle('is-on', wholeWord);
        wordChip.setAttribute('aria-pressed', String(wholeWord));
      } else {
        // Seed from a non-empty selection (VS Code behavior).
        const sel = view.state.selection.main;
        if (!sel.empty && sel.to - sel.from < 200) {
          const text = view.state.sliceDoc(sel.from, sel.to);
          if (!text.includes('\n')) input.value = text;
        }
      }
      // mount() runs inside the view update that created the panel — a
      // synchronous dispatch here crashes CM. Defer the initial query commit.
      setTimeout(() => {
        if (!dom.isConnected) return;
        commit();
        input.focus();
        input.select();
      }, 0);
    },
    update(update) {
      if (update.docChanged || update.selectionSet) refreshCount();
    },
  };
}

// The full search extension: behavior from @codemirror/search, panel ours.
export function searchPanel() {
  return search({
    top: true,
    createPanel: createSearchPanel,
    scrollToMatch: (range) => scrollIntoViewCenter(range.from),
  });
}
