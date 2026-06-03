import { linter } from '@codemirror/lint';
import { parseBelugaDiagnostics } from './bel-beluga-diag.mjs';
import { LINT_TOOLTIP_FILTER } from './bel-hover.mjs';

function belugaClient() {
  const g = typeof window !== 'undefined' ? window : globalThis;
  return g.BelugaClient;
}

function resultText(result) {
  if (typeof result === 'string') return result;
  return result && result.output ? result.output : '';
}

export function createBelugaLinter({ onDiagnostics = null, onCheckStart = null, delay = 1200 } = {}) {
  let lastBelugaDiags = [];

  function notify(view, belugaDiags) {
    lastBelugaDiags = belugaDiags;
    if (typeof onDiagnostics === 'function') onDiagnostics(view, belugaDiags);
  }

  const ext = linter((view) => {
    const client = belugaClient();
    if (!client || typeof client.check !== 'function') return [];

    const code = view.state.doc.toString();
    if (!code.trim()) {
      notify(view, []);
      return [];
    }

    if (typeof onCheckStart === 'function') onCheckStart(view);

    return client.check(code)
      .then((result) => {
        const diags = parseBelugaDiagnostics(resultText(result), view.state.doc);
        notify(view, diags);
        return diags;
      })
      .catch(() => {
        notify(view, []);
        return [];
      });
  }, { delay, tooltipFilter: LINT_TOOLTIP_FILTER });

  ext.belugaLastDiagnostics = () => lastBelugaDiags;
  return ext;
}
