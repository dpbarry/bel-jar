export function normalizeProofLine(line) {
  const t = line.trimStart();
  if (!t) return '';
  return t.replace(/[ \t]+/g, ' ');
}

export function proofLineDepths(lines) {
  let depth = 0;
  const depths = [];
  for (const raw of lines) {
    const line = raw.trimStart();
    depths.push(depth);
    for (const ch of line) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
    }
  }
  return depths;
}

function isCloseOnlyLine(line) {
  return /^[)]+\s*$/.test(line);
}

export function reindentProofBlock(raw, baseCol, step = 2) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  let depth = 0;
  return lines.map((rawLine) => {
    const line = rawLine.trimStart();
    const content = normalizeProofLine(line);
    if (!content) return '';

    let padDepth = depth;
    if (isCloseOnlyLine(content)) {
      let d = depth;
      for (const ch of content) {
        if (ch === ')') d = Math.max(0, d - 1);
      }
      padDepth = d;
    }

    const out = ' '.repeat(baseCol + padDepth * step) + content;
    for (const ch of content) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
    }
    return out;
  });
}

function isBlockHeaderLine(line) {
  return /^(?:let |case |mlam |fn |rec |and |if )/.test(line);
}

function isCaseBranchLine(line) {
  return line.startsWith('|');
}

function applyContinuationLevels(levels, contents, leadings, step) {
  let branchBodyLevel = null;
  let branchStartIdx = null;

  function branchMinLead(from) {
    let min = Infinity;
    for (let j = from; j < contents.length; j++) {
      if (!contents[j]) continue;
      if (isCaseBranchLine(contents[j])) break;
      min = Math.min(min, leadings[j]);
    }
    return Number.isFinite(min) ? min : 0;
  }

  for (let i = 0; i < contents.length; i++) {
    const cur = contents[i];
    if (!cur || levels[i] < 0) continue;

    if (isCaseBranchLine(cur)) {
      branchBodyLevel = null;
      branchStartIdx = null;
      let caseLevel = null;
      for (let j = i - 1; j >= 0; j--) {
        if (levels[j] < 0 || !contents[j]) continue;
        if (contents[j].includes('case ') && contents[j].includes(' of')) {
          caseLevel = levels[j];
          break;
        }
      }
      if (caseLevel != null) levels[i] = caseLevel;
      if (/(?:⇒|→|<-)\s*$/.test(cur)) {
        branchBodyLevel = levels[i] + 1;
        branchStartIdx = i + 1;
      }
      continue;
    }

    if (branchBodyLevel != null && branchStartIdx != null && i >= branchStartIdx) {
      const minLead = branchMinLead(branchStartIdx);
      const rel = Math.max(0, leadings[i] - minLead);
      const extra = step > 0 ? Math.round(rel / step) : 0;
      levels[i] = Math.max(levels[i], branchBodyLevel + extra);
      continue;
    }

    if (/^(?:→|<-)\s/.test(cur) && levels[i - 1] >= 0) {
      levels[i] = Math.max(levels[i], levels[i - 1] + 1);
      continue;
    }

    const prev = i > 0 ? contents[i - 1] : null;
    if (prev && /(?:⇒|→|<-)\s*$/.test(prev) && !isBlockHeaderLine(cur)) {
      levels[i] = Math.max(levels[i], levels[i - 1] + 1);
    }
  }
}

export function reindentStickyBlock(raw, baseCol, step = 2) {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const leadings = lines.map((l) => (l.match(/^(\s*)/) || ['', ''])[1].length);
  const contents = lines.map((l) => normalizeProofLine(l));

  const nonEmpty = contents.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  if (nonEmpty.length === 0) return [];

  const leads = nonEmpty.map((i) => leadings[i]);
  const positiveLeads = leads.filter((l) => l > 0);
  const minLead = positiveLeads.length > 0 ? Math.min(...positiveLeads) : Math.min(...leads);

  const levels = lines.map((_line, i) => {
    const content = contents[i];
    if (!content) return -1;
    const rel = Math.max(0, leadings[i] - minLead);
    return step > 0 ? Math.round(rel / step) : 0;
  });
  applyContinuationLevels(levels, contents, leadings, step);

  return lines.map((_line, i) => {
    const content = contents[i];
    if (!content || levels[i] < 0) return '';
    return ' '.repeat(baseCol + levels[i] * step) + content;
  });
}

export function formatMultilineExprSticky(node, src, opts = {}) {
  const { baseCol = 0, step = 2 } = opts;
  const raw = src.slice(node.from, node.to);
  if (!raw.includes('\n')) return null;
  return reindentStickyBlock(raw, baseCol, step).join('\n');
}

export function formatContextualProofScript(node, src, opts = {}) {
  const { baseCol = 0, step = 2, bracket = 'tight', turnstileText = '⊢' } = opts;

  let lfTerm = null;
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LFTerm') {
      lfTerm = c;
      break;
    }
  }
  if (!lfTerm) return null;

  const termRaw = src.slice(lfTerm.from, lfTerm.to);
  if (!termRaw.includes('\n')) return null;

  const open = bracket === 'tight' ? `[${turnstileText} ` : `[ ${turnstileText} `;
  const termLines = reindentProofBlock(termRaw, baseCol, step);
  const firstContent = normalizeProofLine(termRaw.split('\n')[0]);
  termLines[0] = ' '.repeat(baseCol) + open + firstContent;

  const closePad = ' '.repeat(baseCol);
  termLines.push(`${closePad}]`);
  return termLines.join('\n');
}
