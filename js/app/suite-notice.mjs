/**
 * A suite changes colour (plan v6 phase 04, n2): green to red, or red to
 * green, once per change and per suite, naming the file that turned it. A
 * suite is red while any file it lists has errors.
 *
 * ⛔ Only for what you could not see: a change in the file you have open shows
 * in front of you, so it is not news (typing a typo and fixing it would ring
 * the bell twice). The bell is for an edit here that turned a file elsewhere in
 * the suite. A suite's first sight on a page says nothing either.
 *
 * Pure (tests/test-suite-notice.mjs); app.mjs feeds it the checks as they land.
 */

/**
 * @returns {{ observe(suite: string, members: { path: string, fileId?: string, errors: number, line?: number }[], openPath?: string): object | null }}
 */
export function createSuiteWatch() {
  const last = new Map(); // suite → { red, bad: Set<path> }

  return {
    observe(suite, members, openPath) {
      const bad = members.filter((m) => m.errors > 0);
      const red = bad.length > 0;
      const prev = last.get(suite);
      last.set(suite, { red, bad: new Set(bad.map((m) => m.path)) });
      if (!prev || prev.red === red) return null;
      const name = suite.replace(/\.cfg$/i, '').replace(/^.*\//, '');
      if (red) {
        const turned = bad.find((m) => !prev.bad.has(m.path)) || bad[0];
        if (turned.path === openPath) return null;
        const notice = {
          kind: 'error', category: 'ops', source: 'suite.colour', dedupeKey: 'suite.' + suite,
          title: 'Suite ' + name + ' has errors',
          body: turned.path.replace(/^.*\//, '') + ' has errors now.',
        };
        if (turned.fileId && Number.isFinite(turned.line)) notice.links = { fileId: turned.fileId, path: turned.path, line: turned.line };
        return notice;
      }
      const fixed = [...prev.bad];
      if (fixed.length === 1 && fixed[0] === openPath) return null;
      return {
        kind: 'success', category: 'ops', source: 'suite.colour', dedupeKey: 'suite.' + suite,
        title: 'Suite ' + name + ' checks again',
        body: (fixed.length === 1 ? fixed[0].replace(/^.*\//, '') + ' was the last to be fixed.' : 'Every file in it checks.'),
      };
    },
  };
}
