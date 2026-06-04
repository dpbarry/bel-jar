import { linter } from '@codemirror/lint';
import { fallbackDiagnostic, parseBelugaDiagnostics } from './bel-beluga-diag.mjs';
import { LINT_TOOLTIP_FILTER } from './bel-hover.mjs';

function belugaClient() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.BelugaClient;
}

// Resolve to { ok, output } regardless of client age. Prefer checkResult (which
// carries Beluga's own pass/fail verdict); fall back to check() and treat its
// output as a potential failure (fallbackDiagnostic returns nothing for clean,
// empty output, so a successful check still reads green).
function runCheck(client, code) {
  if (typeof client.checkResult === 'function') return client.checkResult(code);
  if (typeof client.check === 'function') {
    return Promise.resolve(client.check(code)).then((output) => ({ ok: false, output: output || '' }));
  }
  return Promise.resolve(null);
}

// A normal async lint source: CodeMirror runs it after the lint debounce, awaits
// the promise, and dispatches the result (merged with the syntax source). The
// previous decoupled design tried to push results via forceLinting(), which is a
// no-op once the lint plugin has already run — so diagnostics never rendered.
export function createBelugaLinter({ onDiagnostics = null, onCheckStart = null, delay = 400 } = {}) {
  let last = [];

  function notify(view, diags) {
    last = diags;
    if (typeof onDiagnostics === 'function') onDiagnostics(view, diags);
  }

  const ext = linter((view) => {
    const client = belugaClient();
    const code = view.state.doc.toString();
    const canCheck = client
      && (typeof client.checkResult === 'function' || typeof client.check === 'function');
    if (!canCheck || !code.trim()) {
      notify(view, []);
      return [];
    }

    if (typeof onCheckStart === 'function') onCheckStart(view);

    return Promise.resolve(runCheck(client, code))
      .then((res) => {
        if (!res) { notify(view, []); return []; }
        const doc = view.state.doc;
        let diags = parseBelugaDiagnostics(res.output, doc);
        // A failed check that yielded no locatable diagnostic must NOT read as
        // clean — anchor a fallback so the file is never falsely green.
        if (!diags.length && !res.ok) {
          const fb = fallbackDiagnostic(res.output, doc);
          if (fb) diags = [fb];
        }
        notify(view, diags);
        return diags;
      })
      .catch(() => { notify(view, []); return []; });
  }, { delay, tooltipFilter: LINT_TOOLTIP_FILTER });

  ext.belugaLastDiagnostics = () => last;
  return ext;
}
