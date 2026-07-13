import { proveOrchestrationCode } from './bel-prover-bridge.mjs';

export function countSiblingHoledDecls(docText, declName) {
  const re = /\b(?:rec|proof)\s+([A-Za-z_][A-Za-z0-9_']*)\s*:[\s\S]*?;/g;
  let count = 0;
  let m;
  const target = String(declName || '');
  while ((m = re.exec(String(docText ?? ''))) !== null) {
    if (m[1] === target) continue;
    if (/\?/.test(m[0])) count += 1;
  }
  return count;
}

export function needsFullCommitCheck({ docText, declName }) {
  return countSiblingHoledDecls(docText, declName) > 0;
}

export function buildCommitCheckCodes(assembled, prep, newDecl) {
  const asm = String(assembled ?? '');
  const from = prep.assembledDeclFrom;
  const to = prep.assembledDeclTo;
  const patched = asm.slice(0, from) + newDecl + asm.slice(to);
  const declEnd = from + String(newDecl).length;
  const fileStart = prep.fileStart == null ? 0 : prep.fileStart;
  const orchestration = proveOrchestrationCode(patched, prep.name, from, declEnd, fileStart);
  return { patched, orchestration };
}
