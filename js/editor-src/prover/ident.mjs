// Shared Beluga letter-identifier classes (Phase B).
// Letter binders / metas / hyps — NOT symbol-family heads (`⇛`, …).
// Keep \p{L} distinct from \p{S}; the five L+S sites in hole-split/prover stay as-is.
//
// Start may be `_` (ASCII convention) or any Unicode letter. Continue adds digits + `'`.
// Upper/lower preserve Beluga's meta-vs-object heuristic under Greek (Φ vs φ).

export const IDENT = String.raw`[\p{L}_][\p{L}\p{N}_']*`;
export const IDENT_DOLLAR_HASH = String.raw`[$#]?${IDENT}`;
export const UPPER_IDENT = String.raw`\p{Lu}[\p{L}\p{N}_']*`;
export const LOWER_IDENT = String.raw`\p{Ll}[\p{L}\p{N}_']*`;

// Decl / constructor names as Beluga's lexer sees them (beluga.grammar
// identChar / Lower|UpperIdentifier). May contain or end with symbols
// (`lin_s≡`, `pred=`, `m/q`) — letter-only IDENT is for binders/metas.
export const DECL_IDENT = String.raw`[^\s\u007F.,:;%|"\\(){}\[\]<>\u22A20-9#$?][^\s\u007F.,:;%|"\\(){}\[\]<>\u22A2]*`;

// Fresh-name / α-normalize internals: quoted `"i17` or bare uppercase metas.
export const QUOTED_IDENT = String.raw`"[A-Za-z][A-Za-z0-9_']*`;
export const ALPHA_META = String.raw`(?:${QUOTED_IDENT}|${UPPER_IDENT})`;

export const reIdentExact = new RegExp(`^${IDENT}$`, 'u');
export const reIdentDollarHashExact = new RegExp(`^${IDENT_DOLLAR_HASH}$`, 'u');
export const reUpperExact = new RegExp(`^${UPPER_IDENT}$`, 'u');
export const reLowerExact = new RegExp(`^${LOWER_IDENT}$`, 'u');

export function reIdent(flags = '') {
  return new RegExp(IDENT, flags.includes('u') ? flags : `${flags}u`);
}
export function reUpper(flags = '') {
  return new RegExp(UPPER_IDENT, flags.includes('u') ? flags : `${flags}u`);
}
export function reLower(flags = '') {
  return new RegExp(LOWER_IDENT, flags.includes('u') ? flags : `${flags}u`);
}
