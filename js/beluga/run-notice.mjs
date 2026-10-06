/**
 * It finished while you were elsewhere (plan v6 phase 04, n1): a Run (a file,
 * a suite to here, a suite, the project) that ends after you left the file it
 * started from, or the tab, leaves one notice with its verdict, opening the
 * first error. Nothing for a run you watched finish: the REPL already said it.
 *
 * Pure, so the rule is tested where it is written (tests/test-run-notice.mjs);
 * beluga-run.mjs watches where you are and emits.
 */

const ANSI = /\x1b\[[0-9;]*m/g;
const STATUS = /^##\s*Type Reconstruction (begin|done):/i;
const FILE_LOC = /^File\s+"([^"]*)"\s*,\s*line\s+(\d+)/i;
const COMPACT = /([^\s:"]+\.(?:bel|elf|cfg)):(\d+)\.(\d+)/;

/**
 * What a run's output says, by the REPL's own reading of it (repl-output.mjs
 * `segmentRunOutput`, `classifyRunOtherKind`): { kind: 'ok' | 'holes' |
 * 'error', holes, first: { path, line } | null }. Fail closed: anything that
 * is neither a type-reconstruction line nor under a holes header is an error.
 */
export function runVerdict(raw) {
  const lines = String(raw || '').replace(ANSI, '').split('\n');
  let holes = 0;
  let error = false;
  let first = null;
  let inHoles = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t || /^Done\.?$/.test(t) || t === ';') continue;
    if (/^##\s/.test(t)) {
      inHoles = /##\s*Holes:/i.test(t);
      if (inHoles) holes += 1;
      if (!inHoles && !STATUS.test(t)) error = true;
      continue;
    }
    if (inHoles) continue;
    error = true;
    if (!first) {
      const f = FILE_LOC.exec(t);
      const c = f ? null : COMPACT.exec(t);
      if (f) first = { path: f[1], line: Number(f[2]) };
      else if (c) first = { path: c[1], line: Number(c[2]) };
    }
  }
  return { kind: error ? 'error' : holes ? 'holes' : 'ok', holes, first };
}

/** Left before it finished: the tab is out of sight, or another file is open than the one it started from. */
export function leftDuringRun(start, end) {
  return !!end.hidden || (start.fileId != null && end.fileId !== start.fileId);
}

/**
 * The notice for a run that finished while you were elsewhere. `label`: what
 * ran (a file's name, "suite nat", "the project"); `fileOf(path)`: the open
 * project's file id for a path, so the notice opens the first error.
 */
export function runNotice(verdict, label, fileOf) {
  if (verdict.kind === 'ok') {
    return { kind: 'success', category: 'ops', source: 'run.finished', title: 'Checked ' + label, body: 'No errors.' };
  }
  if (verdict.kind === 'holes') {
    return { kind: 'info', category: 'ops', source: 'run.finished', title: 'Checked ' + label, body: 'No errors, with holes left to fill.' };
  }
  const notice = { kind: 'error', category: 'ops', source: 'run.finished', title: 'Errors in ' + label, body: 'The first is shown when you open this.' };
  const at = verdict.first;
  const fileId = at && typeof fileOf === 'function' ? fileOf(at.path) : null;
  if (at && fileId) {
    notice.body = 'The first is in ' + at.path.slice(at.path.lastIndexOf('/') + 1) + ', line ' + at.line + '.';
    notice.links = { fileId, path: at.path, line: at.line };
  } else if (at) {
    notice.body = 'The first is in ' + at.path + ', line ' + at.line + '.';
  } else {
    notice.body = 'The REPL has the details.';
  }
  return notice;
}
