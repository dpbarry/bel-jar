function stripAnsi(s) {
  return String(s != null ? s : '')
    .replace(/\r\n/g, '\n')
    .replace(/\[[0-9;]*m/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '');
}

const FILE_LOC =
  /^File\s+"[^"]*"\s*,\s*line\s+(\d+)\s*(?:,\s*column\s+(\d+)|,\s*characters?\s+(\d+)(?:-(\d+))?)?\s*:?\s*$/i;

// Any location marker � used to find where a message ends (i.e. the next marker).
const ANY_LOC = /(?:[^\s:"]+\.bel:\d+\.\d+)|(?:File\s+"[^"]*"\s*,\s*line\s+\d+)|(?:\bat line\s+\d+,\s*characters?)/;

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
      if (/^Raised at|^Called from|^Re-raised|^Backtrace/i.test(t)) break;
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
  const isId = (ch) => ch && !/[\s\[\](){}:.,;|/]/.test(ch) && ch !== '?' && ch !== '?' && ch !== '?';
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

function severityOf(message) {
  return /(^|\n)\s*warning\b/i.test(message) ? 'warning' : 'error';
}

function messageUntilNextLoc(text, fromIndex) {
  const rest = text.slice(fromIndex);
  const next = rest.search(ANY_LOC);
  return cleanMessage([next >= 0 ? rest.slice(0, next) : rest]);
}

// Block scanner for the `File "input.bel", line L, ...` format.
function parseFileLocations(text, doc, add) {
  const lines = text.split('\n');
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
      const rawLine = lines[i];
      const t = rawLine.trim();
      if (!t) {
        i += 1;
        if (msgParts.length) break;
        continue;
      }
      if (FILE_LOC.test(t)) {
        if (/^\s/.test(rawLine) && msgParts.length) break;
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
    add(span.from, span.to, severity, message);
  }
}

// Compact `input.bel:L.C-L.C:` (0-based columns, the common form) plus
// `at line L, characters C-C` (1-based). These are what most Beluga elaboration
// errors actually carry; the File-only parser silently dropped them, which read
// as a false "no errors".
function parseCompactLocations(text, doc, add) {
  let m;
  const compact = /([^\s:"]+)\.bel:(\d+)\.(\d+)(?:-(\d+)\.(\d+))?:/g;
  while ((m = compact.exec(text)) !== null) {
    const sl = +m[2];
    const sc = +m[3];
    const el = m[4] != null ? +m[4] : sl;
    const ec = m[5] != null ? +m[5] : null;
    if (sl < 1 || sl > doc.lines) continue;
    const ls = doc.line(sl);
    const from = ls.from + Math.min(Math.max(0, sc), ls.length);
    let to;
    if (ec != null && el >= 1 && el <= doc.lines) {
      const le = doc.line(el);
      to = le.from + Math.min(Math.max(0, ec), le.length);
    } else {
      const lineText = doc.sliceString(ls.from, ls.to);
      const tok = expandToToken(lineText, Math.min(Math.max(0, sc), Math.max(0, lineText.length - 1)));
      to = ls.from + tok.end;
    }
    const msg = messageUntilNextLoc(text, m.index + m[0].length);
    if (msg) add(from, Math.max(from + 1, to), severityOf(msg), msg);
  }

  const atLine = /(?:^|\n)\s*at line\s+(\d+),\s*characters?\s+(\d+)(?:-(\d+))?/g;
  while ((m = atLine.exec(text)) !== null) {
    const ln = +m[1];
    if (ln < 1 || ln > doc.lines) continue;
    const line = doc.line(ln);
    const col = Math.max(0, (+m[2]) - 1);
    const colEnd = m[3] != null ? +m[3] : null;
    const from = line.from + Math.min(col, line.length);
    const to = colEnd != null ? line.from + Math.min(colEnd, line.length) : from + 1;
    const msg = messageUntilNextLoc(text, m.index + m[0].length);
    if (msg) add(from, Math.max(from + 1, to), severityOf(msg), msg);
  }
}

export function parseBelugaDiagnostics(raw, doc) {
  const text = stripAnsi(raw);
  const diags = [];
  const seen = new Set();
  function add(from, to, severity, message) {
    if (from == null || to == null) return;
    if (to <= from) to = from + 1;
    const msg = (message || '').trim() || 'Beluga error';
    const key = from + ':' + to + ':' + msg.slice(0, 60);
    if (seen.has(key)) return;
    seen.add(key);
    diags.push({ from, to, severity, message: msg });
  }
  parseCompactLocations(text, doc, add);
  parseFileLocations(text, doc, add);
  diags.sort((a, b) => a.from - b.from);
  return diags;
}

// Many location-less errors name the offending identifier in their text
// ("Identifier � is unbound"). Pull that name out so we can point the squiggle
// at the real token instead of the top of the file. Also used by the
// settlement to recognize INDUCED unbound errors (the named culprit is defined
// in a block that was masked out).
export function namedCulprit(message) {
  const patterns = [
    /Identifier\s+(\S+)\s+is\s+unbound/i,
    /Unbound\s+(?:identifier|variable|operator|constructor|type|module|namespace)\s+(\S+)/i,
    /\b(\S+)\s+is\s+unbound\b/i,
    /\b(\S+)\s+is\s+not\s+(?:bound|defined|in scope)\b/i,
    /(?:No|Unknown)\s+(?:operator|pragma|constructor)\s+(\S+)/i,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m && m[1]) {
      const name = m[1].replace(/^[`"']+/, '').replace(/[`"'.,;:]+$/, '');
      if (name) return name;
    }
  }
  return null;
}

const TOKEN_SEP = /[\s(){}\[\];:,.|]/;

// First whole-token occurrence of `name` outside a comment line.
function locateToken(doc, name) {
  if (!name) return null;
  const text = doc.toString();
  let idx = text.indexOf(name);
  while (idx >= 0) {
    const before = idx > 0 ? text[idx - 1] : ' ';
    const after = idx + name.length < text.length ? text[idx + name.length] : ' ';
    const whole = (idx === 0 || TOKEN_SEP.test(before))
      && (idx + name.length === text.length || TOKEN_SEP.test(after));
    if (whole && !doc.lineAt(idx).text.trim().startsWith('%')) {
      return { from: idx, to: idx + name.length };
    }
    idx = text.indexOf(name, idx + name.length);
  }
  return null;
}

function firstMeaningfulLineAnchor(doc) {
  let anchorLine = 1;
  for (let n = 1; n <= doc.lines; n += 1) {
    const t = doc.line(n).text.trim();
    if (t && !t.startsWith('%') && !t.startsWith('%{{{')) { anchorLine = n; break; }
  }
  const line = doc.line(anchorLine);
  const lead = line.text.search(/\S/);
  const from = line.from + (lead >= 0 ? lead : 0);
  return { from, to: Math.max(from + 1, line.to) };
}

// True when Beluga text looks like a failed check/load, not normal success
// chatter (type reconstruction, holes listing, etc.).
export function belugaOutputLooksLikeFailure(raw) {
  const text = stripAnsi(raw);
  if (!text.trim()) return false;
  if (/\bunbound identifier\b/i.test(text)) return true;
  if (/^Error:/im.test(text)) return true;
  if (/File\s+"[^"]*"\s*,\s*line\s+\d+/i.test(text) && /\bError:/i.test(text)) return true;
  if (/^-\s*Unhandled exception:/im.test(text)) return true;
  if (/Failed to (?:parse|execute|load)\b/i.test(text)) return true;
  if (/^-\s*Error\b/im.test(text)) return true;
  return false;
}

// A failed check that produced no locatable diagnostic must still surface � a
// red squiggle beats a silent green. Point it at the named culprit token when
// the message identifies one; otherwise anchor to the first meaningful line.
// Returns a single diagnostic, or null if the output has nothing to say.
function firstErrorLine(raw) {
  const text = stripAnsi(raw);
  const m = text.match(/^Error:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

export function fallbackDiagnostic(raw, doc) {
  const short = firstErrorLine(raw);
  if (!short) return null;
  const message = short.length > 200 ? short.slice(0, 200) + '...' : short;
  const span = locateToken(doc, namedCulprit(short)) || firstMeaningfulLineAnchor(doc);
  return { from: span.from, to: span.to, severity: 'error', message };
}

// General rule, NOT a one-off: any diagnostic that starts on the first line must
// cover the WHOLE first line. A short or near-empty line 1 otherwise leaves a
// 1-char (or tiny-token) target that is misery to hover — the classic
// start-of-file lint nobody can hit. Mutates+returns the diag for convenience.
// Applied at the single display funnel so every source (Beluga, fallback,
// banner, cfg, suite-composition) obeys it without each re-implementing it.
export function spanFirstLineDiagnostic(diag, doc) {
  if (!diag || !doc || !doc.length) return diag;
  const line1 = doc.line(1);
  // Only when the diagnostic actually begins on line 1 — we don't stretch a
  // line-3 error up to the top.
  if (diag.from > line1.to) return diag;
  diag.from = line1.from;
  diag.to = Math.max(line1.to, line1.from + 1);
  return diag;
}
