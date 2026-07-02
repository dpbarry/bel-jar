import { isSignaturePath } from './bel-paths.mjs';
import { EditorState } from '@codemirror/state';
import { indentRange, indentUnit } from '@codemirror/language';
import { beluga } from './bel-language.mjs';
import { maybeExpandBelAliases } from './bel-aliases.mjs';

const INDENT = '  ';
const prepCache = new Map();
const PREP_CACHE_CAP = 64;

export function sanitizeEditorText(text) {
  if (text == null || text === '') return '';
  return String(text)
    .replace(/\uFEFF/g, '')
    .replace(/\0/g, '')
    .replace(/\r\n?|\u0085|\u2028|\u2029/g, '\n')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/[\u200b-\u200d]/g, '');
}

export function prepareEditorDoc(text, fileName) {
  const raw = String(text ?? '');
  const key = `${fileName || ''}\0${raw}`;
  const hit = prepCache.get(key);
  if (hit !== undefined) return hit;

  let doc = maybeExpandBelAliases(sanitizeEditorText(raw));
  if (fileName && isSignaturePath(fileName)) {
    let state = EditorState.create({
      doc,
      extensions: [indentUnit.of(INDENT), beluga()],
    });
    const ir = indentRange(state, 0, state.doc.length);
    if (!ir.empty) state = state.update({ changes: ir }).state;
    doc = state.doc.toString();
  }

  if (prepCache.size >= PREP_CACHE_CAP) prepCache.clear();
  prepCache.set(key, doc);
  return doc;
}
