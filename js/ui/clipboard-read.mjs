/**
 * When paste has to read the clipboard, and how the explanation dialog moves
 * once it is open. Pure: no DOM, no permission query. The browser paste keys
 * (Mod+V, Shift+Insert) never qualify, and neither does Vim.
 */

export const WATCHED_SETTINGS = ['keymapStyle', 'emacsYankSource', 'keybindings', 'clipboardReadDismissed'];

export const COPY = {
  emacsOffer: {
    message: 'C-y pastes from the system clipboard, and Chrome will not allow that until this site may read it.',
    note: 'Allow opens Chrome\'s prompt. Ignore leaves C-y as it is.',
  },
  rebindOffer: {
    message: 'That is not Chrome\'s paste key, so Chrome will not allow it until this site may read it.',
    note: 'Allow opens Chrome\'s prompt. Ignore leaves the key as it is.',
  },
  asking: {
    message: 'Chrome is asking, at the top of the window.',
    note: 'Allow reads the clipboard. Block refuses it. Closing the prompt changes nothing.',
  },
  emacsGranted: {
    message: 'Allowed. C-y can paste from the clipboard.',
  },
  rebindGranted: {
    message: 'Allowed. This key can paste from the clipboard.',
  },
  denied: {
    message: 'Blocked. Chrome will not ask again.',
    note: 'To allow it later, choose the lock icon in the address bar and turn clipboard on.',
  },
  closed: {
    note: 'The prompt was closed. Nothing changed.',
  },
};

const ALLOW = { action: 'allow', label: 'Allow', variant: 'primary' };
const IGNORE = { action: 'ignore', label: 'Ignore', variant: 'ghost' };
const CLOSE = { action: 'ignore', label: 'Close', variant: 'ghost' };

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

export function shouldOpen(permission, sit, dismissed) {
  if (!sit) return false;
  if (permission !== 'prompt' && permission !== 'denied') return false;
  return !isDismissed(dismissed, sit.id);
}

export function initialView(permission) {
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
  if (allow) out.push({ action: ALLOW.action, label: ALLOW.label, variant: ALLOW.variant, disabled: !!allow.disabled });
  return out;
}

/** What the card says for this view. `lead` is the rebind's chord, set in mono. */
export function copyFor(state, sit) {
  const kind = sit && sit.kind === 'rebind' ? 'rebind' : 'emacs';
  const chord = sit && sit.chord ? sit.chord : 'C-y';
  const lead = kind === 'rebind' ? chord : '';
  const phase = state && state.phase;
  if (phase === 'asking') {
    return {
      lead,
      message: COPY.asking.message,
      note: COPY.asking.note,
      buttons: buttons({ disabled: true }, IGNORE),
    };
  }
  if (phase === 'granted') {
    return {
      lead,
      message: kind === 'emacs' ? COPY.emacsGranted.message : COPY.rebindGranted.message,
      note: '',
      buttons: [],
    };
  }
  if (phase === 'denied') {
    return {
      lead,
      message: COPY.denied.message,
      note: COPY.denied.note,
      buttons: buttons(null, CLOSE),
    };
  }
  const offer = kind === 'emacs' ? COPY.emacsOffer : COPY.rebindOffer;
  return {
    lead,
    message: offer.message,
    note: state && state.noted ? COPY.closed.note : offer.note,
    buttons: buttons(ALLOW, IGNORE),
  };
}
