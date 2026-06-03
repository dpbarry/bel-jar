import { RangeSetBuilder, StateField } from '@codemirror/state';
import { GutterMarker, gutterLineClass } from '@codemirror/view';
import { forEachDiagnostic } from '@codemirror/lint';

class DiagRowMarker extends GutterMarker {
  constructor(cls) {
    super();
    this.elementClass = cls;
  }
}

const errorMarker = new DiagRowMarker('cm-diagRow-error');
const warningMarker = new DiagRowMarker('cm-diagRow-warning');

function buildRowMarkers(state) {
  const severityByLine = new Map();
  forEachDiagnostic(state, (d, from) => {
    if (d.severity !== 'error' && d.severity !== 'warning') return;
    const lineFrom = state.doc.lineAt(from).from;
    if (severityByLine.get(lineFrom) === 'error') return;
    if (d.severity === 'error' || !severityByLine.has(lineFrom)) {
      severityByLine.set(lineFrom, d.severity);
    }
  });

  const builder = new RangeSetBuilder();
  for (const lineFrom of [...severityByLine.keys()].sort((a, b) => a - b)) {
    builder.add(lineFrom, lineFrom, severityByLine.get(lineFrom) === 'error' ? errorMarker : warningMarker);
  }
  return builder.finish();
}

const diagRowField = StateField.define({
  create: buildRowMarkers,
  update(value, tr) {
    if (!tr.docChanged && tr.effects.length === 0) return value;
    return buildRowMarkers(tr.state);
  },
  provide: (f) => gutterLineClass.from(f),
});

export function diagnosticRowHighlight() {
  return diagRowField;
}
