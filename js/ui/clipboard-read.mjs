/**
 * When paste has to read the clipboard, and how the explanation dialog moves
 * once it is open. Pure: no DOM, no permission query. The browser paste keys
 * (Mod+V, Shift+Insert) never qualify, and neither does Vim.
 */

export const WATCHED_SETTINGS = ['keymapStyle', 'emacsYankSource', 'keybindings', 'clipboardReadDismissed'];

export const COPY = {
  offer: {
    message: 'Copy is currently bound to {chord}, which the browser will not recognize as valid unless you allow clipboard permissions.',
  },
  asking: {
    note: 'The browser is asking at the top of the window.',
  },
  granted: {
    note: 'Allowed; {chord} can paste from the clipboard.',
  },
  denied: {
    note: 'Blocked; the browser won\'t ask again automatically.',
  },
  closed: {
    note: 'The prompt was closed.',
  },
  // Firefox and Safari have no clipboard grant. A nonstandard paste asks for a click every time.
  menu: {
    message: 'Your browser will only accept pastes from a nonstandard keybinding (currently {chord}) after a confirmation each time.',
  },
};

const ALLOW = { action: 'allow', label: 'Allow', variant: 'primary' };
const IGNORE = { action: 'ignore', label: 'Ignore', variant: 'ghost' };
const CLOSE = { action: 'ignore', label: 'Close', variant: 'ghost' };
const BINDINGS = { action: 'bindings', label: 'Keybindings', variant: 'primary' };

export function isNativePasteSpec(spec) {
  return spec === 'Mod+V' || spec === 'Shift+Insert';
}

/** A non-native Paste chord has to call readText. An unbound chord does not. */
export function pasteReadsClipboard(spec) {
  return !!spec && !isNativePasteSpec(spec);
}

function styleOf(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  return s === 'vim' || s === 'emacs' ? s : 'default';
}

/**
 * The paste that will call readText, or null.
 * Emacs with the system clipboard wins over a Paste rebind, because Emacs
 * turns Paste off. `chord` is the spec for a rebind; the dialog formats it.
 */
export function situation(o) {
  o = o || {};
  const style = styleOf(o.style);
  const yank = o.yankSource === 'kill-ring' ? 'kill-ring' : 'system';
  const spec = o.pasteSpec || '';
  if (style === 'emacs' && yank === 'system') {
    return { id: 'emacs-system', chord: 'C-y', kind: 'emacs' };
  }
  if (style !== 'emacs' && pasteReadsClipboard(spec)) {
    return { id: 'paste:' + spec, chord: spec, kind: 'rebind' };
  }
  return null;
}

export function isDismissed(list, id) {
  return !!id && Array.isArray(list) && list.includes(id);
}

export function rememberDismissal(list, id) {
  const cur = [];
  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === 'string' && item && !cur.includes(item)) cur.push(item);
    }
  }
  if (!id || cur.includes(id)) return cur;
  return cur.concat(id);
}

/** A browser with no clipboard grant gets its own dismissal, so the permission card can still show elsewhere. */
export function noticeId(sit, kind) {
  if (!sit || !sit.id) return '';
  return kind === 'menu' ? sit.id + ':menu' : sit.id;
}

export function shouldOpen(permission, sit, dismissed) {
  if (!sit) return false;
  if (permission !== 'prompt' && permission !== 'denied') return false;
  return !isDismissed(dismissed, noticeId(sit, 'grant'));
}

export function shouldOpenMenu(sit, dismissed) {
  return !!sit && !isDismissed(dismissed, noticeId(sit, 'menu'));
}

export function initialView(permission) {
  if (permission === 'menu') return { phase: 'menu', noted: false };
  if (permission === 'denied') return { phase: 'denied', noted: false };
  if (permission === 'granted') return { phase: 'granted', noted: false };
  return { phase: 'offer', noted: false };
}

function same(state) {
  return { phase: state.phase, noted: state.noted };
}

/**
 * @param {{ phase: string, noted: boolean }} state
 * @param {{ type: 'allow'|'ignore'|'permission'|'read', state?: string, ok?: boolean, permission?: string }} event
 * @returns {{ phase: string, noted: boolean, remember?: boolean }}
 */
export function reduce(state, event) {
  if (!state || !event) return state;
  if (event.type === 'allow') {
    if (state.phase !== 'offer') return same(state);
    return { phase: 'asking', noted: false };
  }
  if (event.type === 'permission') {
    if (event.state === 'granted') return { phase: 'granted', noted: false };
    if (event.state === 'denied') return { phase: 'denied', noted: false };
    if (event.state === 'prompt') {
      if (state.phase === 'asking') return { phase: 'offer', noted: true };
      if (state.phase === 'denied' || state.phase === 'granted') return { phase: 'offer', noted: false };
    }
    return same(state);
  }
  if (event.type === 'read') {
    if (event.ok || event.permission === 'granted') return { phase: 'granted', noted: false };
    if (event.permission === 'denied') return { phase: 'denied', noted: false };
    if (state.phase === 'asking' || state.phase === 'offer') return { phase: 'offer', noted: true };
    return same(state);
  }
  if (event.type === 'ignore') {
    if (state.phase === 'closed') return same(state);
    return { phase: 'closed', noted: false, remember: state.phase !== 'granted' };
  }
  return same(state);
}

function buttons(allow, ignore) {
  const out = [];
  if (ignore) out.push({ action: ignore.action, label: ignore.label, variant: ignore.variant, disabled: false });
  if (allow) {
    out.push({
      action: allow.action || ALLOW.action,
      label: allow.label || ALLOW.label,
      variant: allow.variant || ALLOW.variant,
      disabled: !!allow.disabled,
    });
  }
  return out;
}

function withChord(template, chord) {
  const mark = '{chord}';
  const at = template.indexOf(mark);
  if (at < 0) return { before: template, chord: '', after: '' };
  return { before: template.slice(0, at), chord, after: template.slice(at + mark.length) };
}

/** What the card says. The binding sentence stays; a note appears only to report what just happened. */
export function copyFor(state, sit) {
  const chord = sit && sit.chord ? sit.chord : 'C-y';
  const phase = state && state.phase;
  if (phase === 'menu') {
    const sentence = withChord(COPY.menu.message, chord);
    return {
      before: sentence.before,
      chord: sentence.chord,
      after: sentence.after,
      note: '',
      buttons: buttons(BINDINGS, CLOSE),
    };
  }
  const sentence = withChord(COPY.offer.message, chord);
  let note = '';
  let row = buttons(ALLOW, IGNORE);
  if (phase === 'asking') {
    note = COPY.asking.note;
    row = buttons({ disabled: true }, IGNORE);
  } else if (phase === 'granted') {
    const said = withChord(COPY.granted.note, chord);
    note = said.before + said.chord + said.after;
    row = [];
  } else if (phase === 'denied') {
    note = COPY.denied.note;
    row = buttons(null, CLOSE);
  } else if (state && state.noted) {
    note = COPY.closed.note;
  }
  return {
    before: sentence.before,
    chord: sentence.chord,
    after: sentence.after,
    note,
    buttons: row,
  };
}
