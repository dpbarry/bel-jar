import { sanitizeEditorText } from '../editor-doc-prep.mjs';

const global = globalThis;

export function writeSystemClipboard(text) {
  const nav = global.navigator;
  if (!nav?.clipboard || typeof nav.clipboard.writeText !== 'function') return false;
  try {
    const pending = nav.clipboard.writeText(String(text));
    if (pending?.catch) pending.catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

export function pasteSystemClipboard(view) {
  const nav = global.navigator;
  if (!nav?.clipboard || typeof nav.clipboard.readText !== 'function') return false;
  let pending;
  try {
    pending = nav.clipboard.readText();
  } catch (_) {
    return false;
  }
  Promise.resolve(pending)
    .then((text) => {
      if (!view?.dom?.isConnected || view.state.readOnly || text == null) return;
      const insert = sanitizeEditorText(text);
      view.dispatch(view.state.replaceSelection(insert), {
        scrollIntoView: true,
        userEvent: 'input.paste',
      });
    })
    .catch(() => {});
  return true;
}
