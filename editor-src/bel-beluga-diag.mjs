// Parse Beluga load/check output into CodeMirror lint diagnostics.

function stripAnsi(s) {
  return String(s != null ? s : '')
    .replace(/\r\n/g, '\n')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u009b[0-9;]*m/g, '')
    .replace(/Ø\[[0-9;]*m/g, '');
}

const FILE_LOC =
  /^File\s+"[^"]*"\s*,\s*line\s+(\d+)\s*(?:,\s*column\s+(\d+)|,\s*characters?\s+(\d+)(?:-(\d+))?)?\s*:?\s*$/i;

function trimMessageLines(parts) {
  const out = [];
  for (const p of parts) {
    if (/^Raised at|^Called from|^Re-raised|^Backtrace/i.test(p)) break;
    out.push(p);
  }
  return out;
}

function cleanMessage(parts) {
  const lines = [];
  for (const part of parts) {
    for (const line of part.split('\n')) {
      const t = line.trim();
      if (!t || FILE_LOC.test(t)) continue;
      if (/^(Error|Warning):\s*/i.test(t)) {
        lines.push(t.replace(/^(Error|Warning):\s*/i, ''));
      } else if (!/^File\s+"/i.test(t)) {
        lines.push(t);
      }
    }
  }
  return lines.join('\n').trim();
}

function expandToToken(lineText, offset) {
  const isId = (ch) => ch && !/[\s\[\](){}:.,;|/]/.test(ch) && ch !== '⇒' && ch !== '→' && ch !== '⊢';
  let at = Math.max(0, Math.min(offset, lineText.length - 1));
  if (!isId(lineText[at])) {
    let fwd = at;
    while (fwd < lineText.length && !isId(lineText[fwd])) fwd += 1;
    if (fwd < lineText.length) at = fwd;
    else {
      let back = at;
      while (back > 0 && !isId(lineText[back])) back -= 1;
      at = back;
    }
  }
  let start = at;
  let end = at + 1;
  while (start > 0 && isId(lineText[start - 1])) start -= 1;
  while (end < lineText.length && isId(lineText[end])) end += 1;
  return { start, end: Math.max(start + 1, end) };
}

function rangeAt(doc, lineNum, colStart, colEnd) {
  if (lineNum < 1 || lineNum > doc.lines) return null;
  const line = doc.line(lineNum);
  if (colStart == null) return { from: line.from, to: line.to };
  const lineText = doc.sliceString(line.from, line.to);
  if (colEnd != null) {
    const from = line.from + Math.max(0, colStart - 1);
    const to = line.from + Math.min(line.length, colEnd);
    return { from, to: Math.max(from + 1, to) };
  }
  const offset = Math.max(0, colStart - 1);
  const { start, end } = expandToToken(lineText, offset);
  return { from: line.from + start, to: line.from + end };
}

export function parseBelugaDiagnostics(raw, doc) {
  const lines = stripAnsi(raw).split('\n');
  const diags = [];
  let i = 0;

  while (i < lines.length) {
    const loc = lines[i].trim().match(FILE_LOC);
    if (!loc) { i += 1; continue; }

    const lineNum = Number(loc[1]);
    const colStart = loc[2] != null ? Number(loc[2]) : (loc[3] != null ? Number(loc[3]) : null);
    const colEnd = loc[4] != null ? Number(loc[4]) : null;
    i += 1;

    const msgParts = [];
    while (i < lines.length) {
      const raw = lines[i];
      const t = raw.trim();
      if (!t) {
        i += 1;
        if (msgParts.length) break;
        continue;
      }
      if (FILE_LOC.test(t)) {
        if (/^\s/.test(raw) && msgParts.length) {
          i += 1;
          while (i < lines.length && /^\s/.test(lines[i]) && lines[i].trim()) {
            if (FILE_LOC.test(lines[i].trim())) break;
            i += 1;
          }
          continue;
        }
        break;
      }
      if (/^(Error|Warning):/i.test(t) || msgParts.length) {
        msgParts.push(t);
        i += 1;
        continue;
      }
      if (msgParts.length) break;
      i += 1;
    }

    const trimmed = trimMessageLines(msgParts);
    if (!trimmed.length) continue;

    const message = cleanMessage(trimmed);
    if (!message) continue;
    const severity = /^Warning:/i.test(trimmed[0]) ? 'warning' : 'error';
    const span = rangeAt(doc, lineNum, colStart, colEnd);
    if (!span) continue;
    diags.push({ from: span.from, to: span.to, severity, message });
  }

  return diags;
}
