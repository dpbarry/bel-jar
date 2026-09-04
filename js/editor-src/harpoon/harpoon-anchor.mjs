// Frozen anchor for a Harpoon auto-solve session — pure compare logic for
// "is the hole still safe to insert into?" without cancelling live search.

import { parseDecl, locateMember } from './harpoon-program.mjs';
import { DECL_IDENT } from '../prover/ident.mjs';

export function textFingerprint(text) {
  const s = String(text == null ? '' : text);
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${s.length}:${hash.toString(16).padStart(8, '0')}`;
}

export function holeKeyFromHit(hit) {
  if (!hit || !hit.hole) return '';
  return `${hit.hole.line}:${hit.hole.col || 1}:${hit.hole.name || ''}`;
}

function normalizeBody(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function declKeyOf(decl) {
  return decl ? `${decl.kw}:${decl.name}` : '';
}

export function captureHarpoonAnchor(prep, meta) {
  if (!prep) return null;
  const declSlice = meta && meta.declSlice != null
    ? String(meta.declSlice)
    : '';
  const decl = parseDecl(declSlice) || (prep.built && prep.built.decl);
  return {
    fileId: meta && meta.fileId != null ? meta.fileId : null,
    declKey: prep.declKey || declKeyOf(decl),
    holeKey: holeKeyFromHit(prep.hit),
    declName: prep.name || (decl && decl.name) || '',
    declKw: decl && decl.kw,
    declFrom: prep.span && prep.span.from,
    declTo: prep.span && prep.span.to,
    holeLine: prep.hit && prep.hit.hole ? prep.hit.hole.line : null,
    holeCol: prep.hit && prep.hit.hole ? (prep.hit.hole.col || 1) : null,
    holeOffset: prep.hit && prep.hit.from,
    declType: decl && decl.type,
    fileTextFingerprint: textFingerprint(meta && meta.fileText),
    assembledFingerprint: textFingerprint(prep.assembledCode),
    proveFingerprint: textFingerprint(prep.proveCode),
    preludeFingerprint: textFingerprint(
      prep.assembledCode != null
        ? prep.assembledCode.slice(0, prep.assembledDeclFrom)
        : '',
    ),
    memberFingerprints: (meta && meta.memberFingerprints) || {},
  };
}

function memberFingerprintsDrifted(anchor, live) {
  const frozen = anchor.memberFingerprints || {};
  const current = (live && live.memberFingerprints) || {};
  const frozenKeys = Object.keys(frozen);
  if (!frozenKeys.length) return false;
  for (const k of frozenKeys) {
    if (frozen[k] !== current[k]) return true;
  }
  for (const k of Object.keys(current)) {
    if (!(k in frozen)) return true;
  }
  return false;
}

function findDeclByKey(docText, declKey, getDeclSpan, parseDeclFn) {
  if (!declKey || !docText) return null;
  const parse = parseDeclFn || parseDecl;
  const colon = String(declKey).indexOf(':');
  const name = colon >= 0 ? declKey.slice(colon + 1) : '';
  const loc = locateMember(docText, name);
  if (loc) {
    const slice = docText.slice(loc.from, loc.to);
    const decl = parse(slice);
    if (decl && `${decl.kw}:${decl.name}` === declKey) {
      return { from: loc.from, to: loc.to, decl, slice };
    }
  }
  const re = new RegExp(String.raw`\b(rec|proof)\s+(${DECL_IDENT})\s*:`, 'gu');
  let m;
  while ((m = re.exec(docText)) !== null) {
    const from = m.index;
    const key = `${m[1]}:${m[2]}`;
    if (key !== declKey) continue;
    let to = docText.indexOf(';', from);
    if (to < 0) to = docText.length;
    else to += 1;
    const slice = docText.slice(from, to);
    const decl = parse(slice);
    if (decl) return { from, to, decl, slice };
  }
  return null;
}

function holeAtOffset(docText, offset) {
  if (offset == null || offset < 0 || offset >= docText.length) return false;
  return docText[offset] === '?';
}

export function assessHarpoonAnchor(anchor, live) {
  if (!anchor) return { level: 'none', reason: '', detail: '' };
  if (!live || live.fileAvailable === false) {
    return {
      level: 'block',
      reason: 'file-missing',
      detail: 'The file is no longer available.',
    };
  }

  const docText = String(live.fileText || '');
  const liveHit = live.liveHit || null;
  const parse = live.parseDecl || parseDecl;

  if (memberFingerprintsDrifted(anchor, live)) {
    return {
      level: 'warn',
      reason: 'suite-changed',
      detail: 'A related file in this development changed.',
      liveHit,
    };
  }

  const declInfo = findDeclByKey(docText, anchor.declKey, live.getDeclSpan, parse);
  if (!declInfo) {
    return {
      level: 'block',
      reason: 'decl-missing',
      detail: 'The declaration was removed or renamed.',
      liveHit,
    };
  }

  if (anchor.declType && declInfo.decl.type !== anchor.declType) {
    return {
      level: 'block',
      reason: 'type-changed',
      detail: 'The declaration type changed.',
      liveHit,
    };
  }

  if (!liveHit) {
    return {
      level: 'block',
      reason: 'hole-gone',
      detail: 'The proof hole is no longer there.',
      liveHit: null,
    };
  }

  const holeOk = holeAtOffset(docText, liveHit.from);
  if (!holeOk) {
    return {
      level: 'block',
      reason: 'hole-gone',
      detail: 'The proof hole is no longer there.',
      liveHit,
    };
  }

  const fileDrift = anchor.fileTextFingerprint
    && live.fileTextFingerprint
    && anchor.fileTextFingerprint !== live.fileTextFingerprint;

  if (fileDrift) {
    return {
      level: 'warn',
      reason: 'file-changed',
      detail: 'This file changed while searching.',
      liveHit,
    };
  }

  return { level: 'none', reason: '', detail: '', liveHit };
}
